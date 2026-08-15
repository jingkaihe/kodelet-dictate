import { existsSync } from "node:fs";
import {
  defineExtension,
  type CommandContext,
  type CommandResult,
} from "kodelet";
import {
  MicrophoneCapture,
  assertMicrophoneBackendAvailable,
  getAvailableMicrophones,
  microphoneFailureMessage,
} from "./audio.js";
import {
  CATALOG_MODELS,
  canonicalLanguage,
  displayLanguage,
  formatBinarySize,
  getCatalogModel,
  languageChoiceLabel,
  modelMatchesLanguage,
  preferredLanguageOptions,
  rankCatalogModels,
  resolveModelLanguage,
  systemPreferredLanguage,
  type CatalogModel,
} from "./catalog.js";
import { chineseOutputSummary } from "./chinese.js";
import {
  downloadCatalogModel,
  findCachedCatalogModel,
  verifyCatalogModel,
} from "./models.js";
import { DictationSurface } from "./recording-surface.js";
import {
  DictationReviewSurface,
  type ReviewOutcome,
} from "./review-surface.js";
import {
  DEFAULT_MICROPHONE,
  microphoneSettingForIndex,
  microphoneSummary,
  readSettings,
  selectedMicrophone,
  settingsForModel,
  withTranscriptionLanguage,
  writeSettings,
  type ChineseOutput,
  type DictateSettings,
  type MicrophoneSetting,
} from "./settings.js";
import { TranscribeCppBackend } from "./transcription.js";

const CHANGE_MODEL = "Change model or preferred language";
const CHANGE_LANGUAGE = "Change transcription language";
const CHANGE_MICROPHONE = "Change microphone";
const CHANGE_CHINESE = "Change Chinese output";
const SHOW_SETTINGS = "Show current settings";
const CANCEL = "Cancel";
const OTHER_LANGUAGE = "Other language code";

type ActiveOperation = {
  kind: "dictation" | "settings";
  abort: AbortController;
  done: Promise<void>;
  resolveDone: () => void;
};

let activeOperation: ActiveOperation | undefined;

const extension = defineExtension((ext) => {
  ext.setMetadata({ name: "dictate", version: "0.1.0" });

  ext.registerCommand({
    name: "dictate",
    aliases: ["speech-to-text"],
    description: "Record microphone audio and submit a reviewed local transcription",
    timeoutInSec: 0,
    execute: async (_input, ctx) =>
      runExclusive("dictation", ctx, (operation) => runDictation(ctx, operation)),
  });

  ext.registerCommand({
    name: "transcribe",
    aliases: ["dictate-settings"],
    description: "Configure the local dictation model, language, and microphone",
    timeoutInSec: 0,
    execute: async (_input, ctx) =>
      runExclusive("settings", ctx, (operation) => runSettings(ctx, operation)),
  });

  ext.on("session.end", async () => {
    const operation = activeOperation;
    if (!operation) return;
    operation.abort.abort(new Error("Kodelet session ended"));
    await operation.done.catch(() => undefined);
  });
});

export default extension;

async function runExclusive(
  kind: ActiveOperation["kind"],
  ctx: CommandContext,
  execute: (operation: ActiveOperation) => Promise<CommandResult>,
): Promise<CommandResult> {
  if (activeOperation) {
    return {
      action: "respond",
      response: `A dictate ${activeOperation.kind} operation is already in progress.`,
    };
  }

  let resolveDone!: () => void;
  const operation: ActiveOperation = {
    kind,
    abort: new AbortController(),
    done: new Promise((resolve) => {
      resolveDone = resolve;
    }),
    resolveDone: () => resolveDone(),
  };
  activeOperation = operation;

  try {
    return await execute(operation);
  } catch (error) {
    if (ctx.signal.aborted || operation.abort.signal.aborted) {
      return { action: "respond", response: "Dictation cancelled." };
    }
    ctx.log.error(`dictate ${kind} operation failed`, { error: errorMessage(error) });
    return {
      action: "respond",
      response: `${kind === "dictation" ? "Local dictation" : "Dictate configuration"} failed: ${errorMessage(error)}`,
    };
  } finally {
    if (activeOperation === operation) activeOperation = undefined;
    operation.resolveDone();
  }
}

async function runDictation(
  ctx: CommandContext,
  operation: ActiveOperation,
): Promise<CommandResult> {
  const signal = AbortSignal.any([ctx.signal, operation.abort.signal]);
  const unavailable = await probeRecordingSurface(ctx);
  if (unavailable) return unavailable;
  try {
    assertMicrophoneBackendAvailable();
  } catch (error) {
    throw new Error(microphoneFailureMessage(error));
  }

  const configured = await ensureSettings(ctx, signal);
  if (!configured) {
    return { action: "respond", response: "Dictation setup was cancelled." };
  }

  const model = getCatalogModel(configured.model.id);
  if (!model) throw new Error(`Unknown configured model: ${configured.model.id}`);

  const backend = new TranscribeCppBackend(
    configured.model.path,
    configured.transcriptionLanguage === "auto"
      ? undefined
      : configured.transcriptionLanguage,
    configured.chineseOutput,
  );

  try {
    let text = await captureTranscription(ctx, configured, operation, signal, backend);
    if (!text) {
      return { action: "respond", response: "No speech was detected." };
    }

    while (true) {
      const outcome = await reviewDictation(ctx, text, signal);
      if (outcome.kind === "discard") {
        return { action: "respond", response: "Dictation discarded." };
      }
      if (outcome.kind === "submit") {
        const prompt = outcome.text.trim();
        if (!prompt) {
          return { action: "respond", response: "Dictation discarded." };
        }
        const result = { action: "runAgent" as const, prompt, display: prompt };
        return result;
      }

      const additional = await captureTranscription(
        ctx,
        configured,
        operation,
        signal,
        backend,
      );
      text = appendDictation(outcome.text, additional);
      if (!additional) {
        await ctx.ui.notify({
          title: "No additional speech detected",
          message: "The current transcription was kept.",
        });
      }
    }
  } finally {
    await backend.dispose().catch(() => undefined);
  }
}

async function captureTranscription(
  ctx: CommandContext,
  configured: DictateSettings,
  operation: ActiveOperation,
  signal: AbortSignal,
  backend: TranscribeCppBackend,
): Promise<string> {
  let surfaceDisplay: DictationSurface | undefined;
  let capture: MicrophoneCapture | undefined;
  let captureStarted = false;

  try {
    const surface = await ctx.ui.openSurface({
      id: "dictate-recording",
      initialLines: ["Opening microphone…"],
      width: 64,
      height: 5,
      maxWidth: "90%",
      anchor: "bottom",
      margin: { top: 1, right: 1, bottom: 3, left: 1 },
    });

    capture = new MicrophoneCapture(selectedMicrophone(configured.microphone));
    surfaceDisplay = new DictationSurface(surface, operation.abort, signal);
    surfaceDisplay.start(capture);
    capture.onError = (error) =>
      surfaceDisplay?.fail(new Error(microphoneFailureMessage(error)));

    try {
      capture.start();
      captureStarted = true;
    } catch (error) {
      throw new Error(microphoneFailureMessage(error));
    }

    const preparation = backend.prepare();
    void preparation.then(
      () => surfaceDisplay?.setModelReady(),
      (error) => surfaceDisplay?.fail(error),
    );

    const outcome = await surfaceDisplay.waitForRecordingEnd();
    if (outcome.kind === "cancel") {
      signal.throwIfAborted();
      throw new Error("Dictation cancelled");
    }
    if (outcome.kind === "error") throw outcome.error;

    surfaceDisplay.setPhase("finishing");
    let pcm: Float32Array;
    try {
      ({ pcm } = await capture.stop());
      captureStarted = false;
    } catch (error) {
      throw new Error(microphoneFailureMessage(error));
    }
    signal.throwIfAborted();

    surfaceDisplay.setPhase("waiting-model");
    await waitWithAbort(preparation, signal);
    signal.throwIfAborted();

    surfaceDisplay.setPhase("transcribing");
    const text = await backend.transcribe(pcm, signal);
    await closeWithRetry(surfaceDisplay);
    surfaceDisplay = undefined;
    return text;
  } finally {
    const display = surfaceDisplay;
    if (display) {
      await closeWithRetry(display).catch((error) =>
        ctx.log.warn("failed to close dictate recording surface", {
          error: errorMessage(error),
        }),
      );
    }
    if (captureStarted && capture) await capture.stop().catch(() => undefined);
  }
}

async function reviewDictation(
  ctx: CommandContext,
  text: string,
  signal: AbortSignal,
): Promise<ReviewOutcome> {
  const surface = await ctx.ui.openSurface({
    id: "dictate-review",
    initialLines: ["Opening transcription editor…"],
    width: "80%",
    height: "60%",
    maxWidth: 100,
    maxHeight: 28,
    anchor: "center",
    margin: { top: 1, right: 1, bottom: 1, left: 1 },
  });
  const review = new DictationReviewSurface(surface, text, signal);
  review.start();
  try {
    const outcome = await review.waitForDecision();
    if (outcome.kind === "discard") {
      signal.throwIfAborted();
    }
    return outcome;
  } finally {
    await closeWithRetry(review);
  }
}

function appendDictation(existing: string, additional: string): string {
  const appended = additional.trim();
  if (!appended) return existing;
  if (!existing) return appended;
  return `${existing}${/\s$/u.test(existing) ? "" : " "}${appended}`;
}

async function probeRecordingSurface(
  ctx: CommandContext,
): Promise<CommandResult | undefined> {
  let surface;
  try {
    surface = await ctx.ui.openSurface({
      id: "dictate-capability-probe",
      initialLines: [],
      width: 1,
      height: 1,
      anchor: "bottom",
      nonCapturing: true,
    });
  } catch (error) {
    if (errorMessage(error).includes("Interactive extension surfaces are not available")) {
      return {
        action: "respond",
        response: "Dictation currently requires the native local `kodelet chat` TUI because this host does not support interactive extension surfaces.",
      };
    }
    throw error;
  }
  await closeWithRetry(surface);
  return undefined;
}

async function runSettings(
  ctx: CommandContext,
  operation: ActiveOperation,
): Promise<CommandResult> {
  const signal = AbortSignal.any([ctx.signal, operation.abort.signal]);
  let settings = await readSettings(ctx);
  if (!settings || !existsSync(settings.model.path)) {
    if (settings && !existsSync(settings.model.path)) {
      await ctx.ui.notify({
        title: "Dictate model missing",
        message: `The configured model file is missing: ${settings.model.path}`,
      });
    }
    settings = await configureModel(ctx, settings, signal);
    return settings
      ? { action: "respond", response: settingsSummary(settings) }
      : { action: "respond", response: "Dictation setup was cancelled." };
  }

  const action = await ctx.ui.select({
    title: "Dictate settings",
    message: settingsSummary(settings, false),
    options: [
      CHANGE_MODEL,
      CHANGE_LANGUAGE,
      CHANGE_MICROPHONE,
      CHANGE_CHINESE,
      SHOW_SETTINGS,
      CANCEL,
    ],
    submitButtonText: "Open",
    cancelButtonText: "Close",
  });

  switch (action) {
    case CHANGE_MODEL: {
      const changed = await configureModel(ctx, settings, signal);
      return {
        action: "respond",
        response: changed ? settingsSummary(changed) : "No settings were changed.",
      };
    }
    case CHANGE_LANGUAGE: {
      const model = getCatalogModel(settings.model.id)!;
      const language = await chooseTranscriptionLanguage(
        ctx,
        model,
        settings.transcriptionLanguage,
      );
      if (!language) return { action: "respond", response: "No settings were changed." };
      settings = withTranscriptionLanguage(settings, language);
      await writeSettings(ctx, settings);
      return { action: "respond", response: settingsSummary(settings) };
    }
    case CHANGE_MICROPHONE: {
      const microphone = await chooseMicrophone(ctx, settings.microphone);
      if (!microphone) return { action: "respond", response: "No settings were changed." };
      settings = { ...settings, microphone };
      await writeSettings(ctx, settings);
      return { action: "respond", response: settingsSummary(settings) };
    }
    case CHANGE_CHINESE: {
      const chineseOutput = await chooseChineseOutput(ctx, settings.chineseOutput);
      if (!chineseOutput) return { action: "respond", response: "No settings were changed." };
      settings = { ...settings, chineseOutput };
      await writeSettings(ctx, settings);
      return { action: "respond", response: settingsSummary(settings) };
    }
    case SHOW_SETTINGS:
      return { action: "respond", response: settingsSummary(settings) };
    default:
      return { action: "respond", response: "" };
  }
}

async function ensureSettings(
  ctx: CommandContext,
  signal: AbortSignal,
): Promise<DictateSettings | undefined> {
  const settings = await readSettings(ctx);
  if (settings && existsSync(settings.model.path)) return settings;
  if (settings) {
    await ctx.ui.notify({
      title: "Dictate model missing",
      message: `The configured model file is missing: ${settings.model.path}. Choose a model again.`,
    });
  }
  return configureModel(ctx, settings, signal);
}

async function configureModel(
  ctx: CommandContext,
  previous: DictateSettings | undefined,
  signal: AbortSignal,
): Promise<DictateSettings | undefined> {
  const preferredLanguage = await choosePreferredLanguage(
    ctx,
    previous?.preferredLanguage ?? systemPreferredLanguage(),
  );
  if (!preferredLanguage) return undefined;

  const cachedByID = new Map<string, string>(
    CATALOG_MODELS.flatMap((model) => {
      const cached = findCachedCatalogModel(model);
      return cached ? [[model.id, cached.path] as const] : [];
    }),
  );
  const ranked = rankCatalogModels(
    CATALOG_MODELS,
    preferredLanguage,
    (model) => cachedByID.has(model.id),
  );
  const currentIndex = ranked.findIndex((model) => model.id === previous?.model.id);
  if (
    currentIndex > 0 &&
    modelMatchesLanguage(ranked[currentIndex]!, preferredLanguage)
  ) {
    const [current] = ranked.splice(currentIndex, 1);
    if (current) ranked.unshift(current);
  }

  const options = ranked.map((model) => modelChoiceLabel(model, cachedByID.has(model.id)));
  const selected = await ctx.ui.select({
    title: "Choose a local transcription model",
    message: `Preferred language: ${displayLanguage(preferredLanguage)} [${preferredLanguage}]. Audio never leaves this machine.`,
    options,
    submitButtonText: "Choose",
    cancelButtonText: "Cancel",
  });
  if (!selected) return undefined;
  const selectedIndex = options.indexOf(selected);
  const model = ranked[selectedIndex];
  if (!model) return undefined;

  let modelPath = cachedByID.get(model.id);
  if (!modelPath) {
    const confirmed = await ctx.ui.confirm({
      title: model.name,
      message: [
        `Download ${formatBinarySize(model.size)} (${model.quant}) from Hugging Face?`,
        `License: ${model.license}`,
        "The model is cached locally and microphone audio is not uploaded.",
      ].join("\n"),
      confirmButtonText: "Download",
      cancelButtonText: "Cancel",
    });
    if (!confirmed) return undefined;
  }

  const widgetID = "dictate-model-download";
  try {
    if (modelPath) {
      await ctx.ui.setWidget(widgetID, [
        `Verifying ${model.name}`,
        `${model.quant} · ${formatBinarySize(model.size)}`,
      ]);
    } else {
      let lastUpdate = 0;
      await ctx.ui.setWidget(widgetID, [
        `Downloading ${model.name}`,
        `0 / ${formatBinarySize(model.size)} · 0%`,
      ]);
      modelPath = await downloadCatalogModel(model, {
        signal,
        onProgress: ({ downloaded, total }) => {
          const now = Date.now();
          if (downloaded !== total && now - lastUpdate < 250) return;
          lastUpdate = now;
          const percent = total > 0 ? Math.floor((downloaded / total) * 100) : 0;
          void ctx.ui
            .setWidget(widgetID, [
              `Downloading ${model.name}`,
              `${formatBinarySize(downloaded)} / ${formatBinarySize(total)} · ${percent}%`,
            ])
            .catch(() => undefined);
        },
      });
      await ctx.ui.setWidget(widgetID, [
        `Verifying ${model.name}`,
        `${model.quant} · ${formatBinarySize(model.size)}`,
      ]);
    }
    await verifyCatalogModel(modelPath, model, signal);
  } finally {
    await ctx.ui.setWidget(widgetID, undefined).catch(() => undefined);
  }

  const settings = settingsForModel(model, modelPath, previous, preferredLanguage);
  await writeSettings(ctx, settings);
  await ctx.ui.notify({
    title: "Dictate ready",
    message: `${model.name} is ready for local transcription. Run /dictate to record.`,
  });
  return settings;
}

async function choosePreferredLanguage(
  ctx: CommandContext,
  initial: string,
): Promise<string | undefined> {
  const languages = preferredLanguageOptions(initial);
  const labels = languages.map(languageChoiceLabel);
  const selected = await ctx.ui.select({
    title: "Preferred spoken language",
    message: "Choose the language you expect to dictate most often. This only ranks compatible local models.",
    options: [...labels, OTHER_LANGUAGE],
    submitButtonText: "Continue",
    cancelButtonText: "Cancel",
  });
  if (!selected) return undefined;
  if (selected !== OTHER_LANGUAGE) return languages[labels.indexOf(selected)];

  let placeholder = canonicalLanguage(initial) || "en";
  while (true) {
    const value = await ctx.ui.input({
      title: "Other spoken language",
      message: "Enter a language code used to rank compatible models, for example nl, pl, sv, vi, or en-US.",
      placeholder,
      submitButtonText: "Continue",
      cancelButtonText: "Cancel",
      required: true,
    });
    if (value === undefined) return undefined;
    const language = canonicalLanguage(value);
    if (language && CATALOG_MODELS.some((model) => modelMatchesLanguage(model, language))) {
      return language;
    }
    placeholder = value.trim();
    await ctx.ui.notify({
      title: "Unsupported language",
      message: `None of the bundled catalog models supports ${value.trim() || "that language"}.`,
    });
  }
}

async function chooseTranscriptionLanguage(
  ctx: CommandContext,
  model: CatalogModel,
  current: string,
): Promise<string | undefined> {
  const languages = [
    ...(model.capabilities.languageDetection ? ["auto"] : []),
    ...model.languages,
  ];
  if (languages.length <= 12) {
    const labels = languages.map(languageChoiceLabel);
    const selected = await ctx.ui.select({
      title: `${model.name} language`,
      message: `Current: ${languageChoiceLabel(current)}`,
      options: labels,
      submitButtonText: "Use language",
      cancelButtonText: "Cancel",
    });
    if (!selected) return undefined;
    return languages[labels.indexOf(selected)];
  }

  let value = current;
  while (true) {
    const selected = await ctx.ui.input({
      title: `${model.name} language`,
      message: [
        model.capabilities.languageDetection
          ? "Enter auto for language detection, or enter a supported BCP-47 language code."
          : "Enter a supported BCP-47 language code.",
        `Examples: ${model.languages.slice(0, 12).join(", ")} · ${model.languages.length} supported`,
      ].join("\n"),
      defaultValue: value,
      submitButtonText: "Use language",
      cancelButtonText: "Cancel",
      required: true,
    });
    if (selected === undefined) return undefined;
    const resolved = resolveModelLanguage(model, selected);
    if (resolved) return resolved;
    value = selected;
    await ctx.ui.notify({
      title: "Unsupported language",
      message: `${model.name} does not support ${selected}.`,
    });
  }
}

async function chooseMicrophone(
  ctx: CommandContext,
  current: MicrophoneSetting,
): Promise<MicrophoneSetting | undefined> {
  const devices = getAvailableMicrophones();
  const totals = new Map<string, number>();
  for (const device of devices) totals.set(device, (totals.get(device) ?? 0) + 1);
  const seen = new Map<string, number>();
  const entries = devices.map((name, index) => {
    const occurrence = seen.get(name) ?? 0;
    seen.set(name, occurrence + 1);
    const label =
      (totals.get(name) ?? 0) > 1 ? `${name} (${occurrence + 1})` : name;
    return { label, setting: microphoneSettingForIndex(devices, index) };
  });
  const options = ["System default", ...entries.map((entry) => entry.label)];
  const selected = await ctx.ui.select({
    title: "Choose microphone",
    message: `Current: ${microphoneSummary(current)}`,
    options,
    submitButtonText: "Use microphone",
    cancelButtonText: "Cancel",
  });
  if (!selected) return undefined;
  if (selected === "System default") return DEFAULT_MICROPHONE;
  return entries.find((entry) => entry.label === selected)?.setting;
}

async function chooseChineseOutput(
  ctx: CommandContext,
  current: ChineseOutput,
): Promise<ChineseOutput | undefined> {
  const entries: Array<{ label: string; value: ChineseOutput }> = [
    { label: "Simplified", value: "simplified" },
    { label: "Traditional (Taiwan)", value: "traditional-taiwan" },
    { label: "Traditional (Hong Kong)", value: "traditional-hong-kong" },
  ];
  const selected = await ctx.ui.select({
    title: "Chinese transcription output",
    message: `Current: ${chineseOutputSummary(current)}`,
    options: entries.map((entry) => entry.label),
    submitButtonText: "Use output",
    cancelButtonText: "Cancel",
  });
  return entries.find((entry) => entry.label === selected)?.value;
}

function modelChoiceLabel(model: CatalogModel, downloaded: boolean): string {
  const markers = [model.recommended ? "recommended" : "", downloaded ? "downloaded" : ""]
    .filter(Boolean)
    .join(", ");
  return [
    `${model.name} — ${formatBinarySize(model.size)} · ${model.quant}`,
    markers,
  ].filter(Boolean).join(" · ");
}

function settingsSummary(settings: DictateSettings, includeHeading = true): string {
  const model = getCatalogModel(settings.model.id);
  const lines = [
    `- Model: ${model?.name ?? settings.model.id}`,
    `- Preferred language: ${displayLanguage(settings.preferredLanguage)} [${settings.preferredLanguage}]`,
    `- Transcription language: ${languageChoiceLabel(settings.transcriptionLanguage)}`,
    `- Microphone: ${microphoneSummary(settings.microphone)}`,
    `- Chinese output: ${chineseOutputSummary(settings.chineseOutput)}`,
    "- Processing: local transcribe.cpp inference",
  ];
  return (includeHeading ? ["Dictate settings:", ...lines] : lines).join("\n");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function waitWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new Error("Operation cancelled"));
    signal.addEventListener("abort", onAbort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function closeWithRetry(
  closeable: { close(): Promise<void> },
  attempts = 2,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await closeable.close();
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
