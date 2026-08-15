import {
  CATALOG_MODELS,
  canonicalLanguage,
  defaultTranscriptionLanguage,
  getCatalogModel,
  resolveModelLanguage,
  systemPreferredLanguage,
  type CatalogModel,
} from "./catalog.js";
import type { SelectedMicrophone } from "./audio.js";

const SETTINGS_FILE = "settings.json";
const SETTINGS_VERSION = 1;

export type ChineseOutput =
  | "simplified"
  | "traditional-taiwan"
  | "traditional-hong-kong";

export type MicrophoneSetting =
  | { type: "system-default" }
  | { type: "device"; name: string; occurrence: number };

export type DictateSettings = {
  version: 1;
  preferredLanguage: string;
  transcriptionLanguage: string;
  chineseOutput: ChineseOutput;
  microphone: MicrophoneSetting;
  model: {
    id: string;
    path: string;
  };
};

type SettingsContext = {
  storage: {
    readJson<T = unknown>(path: string): Promise<T | undefined>;
    writeJson(path: string, value: unknown): Promise<void>;
  };
  log: {
    warn(message: string, fields?: Record<string, unknown>): void;
  };
};

export const DEFAULT_MICROPHONE: MicrophoneSetting = { type: "system-default" };

export async function readSettings(ctx: SettingsContext): Promise<DictateSettings | undefined> {
  try {
    return normalizeSettings(await ctx.storage.readJson(SETTINGS_FILE));
  } catch (error) {
    ctx.log.warn("failed to read dictate settings", { error: errorMessage(error) });
    return undefined;
  }
}

export async function writeSettings(
  ctx: SettingsContext,
  settings: DictateSettings,
): Promise<void> {
  await ctx.storage.writeJson(SETTINGS_FILE, settings);
}

export function settingsForModel(
  model: CatalogModel,
  modelPath: string,
  previous?: DictateSettings,
  preferredLanguage = previous?.preferredLanguage ?? systemPreferredLanguage(),
): DictateSettings {
  const normalizedPreferred = normalizePreferredLanguage(preferredLanguage);
  const requestedLanguage = previous?.transcriptionLanguage ?? "";
  const transcriptionLanguage =
    resolveModelLanguage(model, requestedLanguage) ??
    defaultTranscriptionLanguage(model, normalizedPreferred);

  return {
    version: SETTINGS_VERSION,
    preferredLanguage: normalizedPreferred,
    transcriptionLanguage,
    chineseOutput: previous?.chineseOutput ?? defaultChineseOutput(),
    microphone: cloneMicrophone(previous?.microphone ?? DEFAULT_MICROPHONE),
    model: { id: model.id, path: modelPath },
  };
}

export function withTranscriptionLanguage(
  settings: DictateSettings,
  language: string,
): DictateSettings {
  const model = getCatalogModel(settings.model.id);
  if (!model) throw new Error(`Unknown catalog model: ${settings.model.id}`);
  const resolved = resolveModelLanguage(model, language);
  if (!resolved) throw new Error(`${model.name} does not support ${language}`);
  return { ...settings, transcriptionLanguage: resolved };
}

export function selectedMicrophone(
  setting: MicrophoneSetting,
): SelectedMicrophone | undefined {
  return setting.type === "device"
    ? { name: setting.name, occurrence: setting.occurrence }
    : undefined;
}

export function microphoneSettingForIndex(
  devices: readonly string[],
  index: number,
): MicrophoneSetting {
  const name = devices[index];
  if (name === undefined) return DEFAULT_MICROPHONE;
  let occurrence = 0;
  for (let current = 0; current < index; current += 1) {
    if (devices[current] === name) occurrence += 1;
  }
  return { type: "device", name, occurrence };
}

export function microphoneSummary(setting: MicrophoneSetting): string {
  if (setting.type === "system-default") return "System default";
  return setting.occurrence === 0
    ? setting.name
    : `${setting.name} (${setting.occurrence + 1})`;
}

export function defaultChineseOutput(): ChineseOutput {
  const subtags = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().split("-");
  if (subtags.includes("hk") || subtags.includes("mo")) return "traditional-hong-kong";
  if (subtags.includes("tw") || subtags.includes("hant")) return "traditional-taiwan";
  return "simplified";
}

export function normalizePreferredLanguage(language: string): string {
  const normalized = canonicalLanguage(language);
  return CATALOG_MODELS.some((model) =>
    model.languages.some((supported) => canonicalLanguage(supported) === normalized),
  )
    ? normalized
    : systemPreferredLanguage();
}

function normalizeSettings(value: unknown): DictateSettings | undefined {
  if (!isRecord(value) || value.version !== SETTINGS_VERSION) return undefined;
  if (!isRecord(value.model) || typeof value.model.id !== "string") return undefined;
  const model = getCatalogModel(value.model.id);
  if (!model || typeof value.model.path !== "string" || !value.model.path) return undefined;

  const preferredLanguage =
    typeof value.preferredLanguage === "string"
      ? normalizePreferredLanguage(value.preferredLanguage)
      : systemPreferredLanguage();
  const transcriptionLanguage =
    typeof value.transcriptionLanguage === "string"
      ? resolveModelLanguage(model, value.transcriptionLanguage)
      : undefined;
  const microphone = normalizeMicrophone(value.microphone);

  return {
    version: SETTINGS_VERSION,
    preferredLanguage,
    transcriptionLanguage:
      transcriptionLanguage ?? defaultTranscriptionLanguage(model, preferredLanguage),
    chineseOutput: normalizeChineseOutput(value.chineseOutput),
    microphone: microphone ?? DEFAULT_MICROPHONE,
    model: { id: model.id, path: value.model.path },
  };
}

function normalizeMicrophone(value: unknown): MicrophoneSetting | undefined {
  if (!isRecord(value)) return undefined;
  if (value.type === "system-default") return DEFAULT_MICROPHONE;
  if (
    value.type !== "device" ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    !Number.isInteger(value.occurrence) ||
    (value.occurrence as number) < 0
  ) {
    return undefined;
  }
  return {
    type: "device",
    name: value.name,
    occurrence: value.occurrence as number,
  };
}

function normalizeChineseOutput(value: unknown): ChineseOutput {
  return value === "simplified" ||
    value === "traditional-taiwan" ||
    value === "traditional-hong-kong"
    ? value
    : defaultChineseOutput();
}

function cloneMicrophone(setting: MicrophoneSetting): MicrophoneSetting {
  return setting.type === "device" ? { ...setting } : DEFAULT_MICROPHONE;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
