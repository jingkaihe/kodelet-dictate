import type { UIFrameLine, UISurface, UISurfaceInputEvent } from "kodelet";
import type { MicrophoneCapture } from "./audio.js";

export type RecordingOutcome =
  | { kind: "stop" }
  | { kind: "cancel" }
  | { kind: "error"; error: unknown };

type RecordingPhase =
  | "recording"
  | "finishing"
  | "waiting-model"
  | "transcribing"
  | "failed";

const LEVELS = " ▁▂▃▄▅▆▇█";

export class DictationSurface {
  private width = 60;
  private levels: number[] = [];
  private phase: RecordingPhase = "recording";
  private modelState: "loading" | "ready" | "failed" = "loading";
  private errorText = "";
  private startedAt = Date.now();
  private lastFrameRender = 0;
  private closed = false;
  private detached = false;
  private closing?: Promise<void>;
  private settled = false;
  private readonly outcome: Promise<RecordingOutcome>;
  private resolveOutcome!: (outcome: RecordingOutcome) => void;
  private removeInput?: () => void;
  private removeResize?: () => void;
  private removeAbort?: () => void;
  private timer?: NodeJS.Timeout;
  private capture?: MicrophoneCapture;

  constructor(
    private readonly surface: UISurface,
    private readonly abortController: AbortController,
    private readonly signal: AbortSignal,
  ) {
    this.outcome = new Promise((resolve) => {
      this.resolveOutcome = resolve;
    });
  }

  start(capture: MicrophoneCapture): void {
    this.capture = capture;
    capture.onFrame = (frame) => this.pushFrame(frame);
    this.removeInput = this.surface.onInput((event) => this.handleInput(event));
    this.removeResize = this.surface.onResize(({ width }) => {
      this.width = Math.max(24, width);
      this.trimLevels();
      this.render();
    });
    const onAbort = () => this.finish({ kind: "cancel" });
    this.signal.addEventListener("abort", onAbort, { once: true });
    this.removeAbort = () => this.signal.removeEventListener("abort", onAbort);
    this.timer = setInterval(() => this.render(), 200);
    if (this.signal.aborted) this.finish({ kind: "cancel" });
    this.render();
  }

  waitForRecordingEnd(): Promise<RecordingOutcome> {
    return this.outcome;
  }

  setModelReady(): void {
    this.modelState = "ready";
    this.render();
  }

  fail(error: unknown): void {
    this.modelState = "failed";
    this.phase = "failed";
    this.errorText = error instanceof Error ? error.message : String(error);
    this.render();
    this.finish({ kind: "error", error });
  }

  setPhase(phase: Exclude<RecordingPhase, "failed">): void {
    this.phase = phase;
    this.render();
  }

  cancel(): void {
    if (!this.abortController.signal.aborted) {
      this.abortController.abort(new Error("Dictation cancelled"));
    }
    this.finish({ kind: "cancel" });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    if (this.closing) return this.closing;
    this.detach();

    const operation = this.surface.close();
    this.closing = operation;
    try {
      await operation;
      this.closed = true;
    } finally {
      if (this.closing === operation) this.closing = undefined;
    }
  }

  private detach(): void {
    if (this.detached) return;
    this.detached = true;
    if (this.timer) clearInterval(this.timer);
    this.removeInput?.();
    this.removeResize?.();
    this.removeAbort?.();
    if (this.capture) {
      this.capture.onFrame = undefined;
      this.capture.onError = undefined;
    }
  }

  private handleInput(event: UISurfaceInputEvent): void {
    if (event.kind !== "key") return;
    const key = (event.key || event.text || "").toLowerCase();
    if (key === "esc" || key === "escape") {
      this.cancel();
      return;
    }
    if (key === "enter" && this.phase === "recording") {
      this.finish({ kind: "stop" });
    }
  }

  private finish(outcome: RecordingOutcome): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveOutcome(outcome);
  }

  private pushFrame(frame: Int16Array): void {
    if (this.phase !== "recording" || frame.length === 0) return;
    let sumSquares = 0;
    for (const sample of frame) {
      const normalized = sample / 32_768;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / frame.length);
    this.levels.push(Math.min(1, rms * 5));
    this.trimLevels();

    const now = Date.now();
    if (now - this.lastFrameRender >= 50) {
      this.lastFrameRender = now;
      this.render();
    }
  }

  private trimLevels(): void {
    const maximum = Math.max(12, this.width - 4);
    if (this.levels.length > maximum) {
      this.levels.splice(0, this.levels.length - maximum);
    }
  }

  private render(): void {
    if (this.closed || this.detached) return;
    const lines: UIFrameLine[] = [this.headerLine(), this.meterLine(), this.statusLine()];
    this.surface.update(lines);
  }

  private headerLine(): UIFrameLine {
    const { label, color } = this.phasePresentation();
    const elapsed = formatDuration(Date.now() - this.startedAt);
    return {
      spans: [
        { text: ` ${label}`, style: { foreground: color, bold: true } },
        { text: `  ${elapsed}`, style: { dim: true } },
      ],
    };
  }

  private meterLine(): string {
    const width = Math.max(12, this.width - 4);
    if (this.phase !== "recording") return `  ${"─".repeat(width)}`;
    const padding = Math.max(0, width - this.levels.length);
    const meter = [
      ...Array.from({ length: padding }, () => " "),
      ...this.levels.map((level) => LEVELS[Math.round(level * (LEVELS.length - 1))] ?? " "),
    ].join("");
    return `  ${meter}`;
  }

  private statusLine(): UIFrameLine {
    const status = this.statusText();
    return {
      spans: [
        { text: " ", style: { dim: true } },
        { text: status, style: { dim: this.phase !== "failed", foreground: this.phase === "failed" ? "#f38ba8" : undefined } },
      ],
    };
  }

  private statusText(): string {
    switch (this.phase) {
      case "recording": {
        const model =
          this.modelState === "ready"
            ? "model ready"
            : this.modelState === "failed"
              ? "model failed"
              : "loading model";
        return `Enter: stop and transcribe · Esc: cancel · ${model}`;
      }
      case "finishing":
        return "Finishing microphone capture · Esc: cancel";
      case "waiting-model":
        return "Waiting for the local model · Esc: cancel";
      case "transcribing":
        return "Transcribing locally · Esc: cancel";
      case "failed":
        return this.errorText || "Dictation failed";
    }
  }

  private phasePresentation(): { label: string; color: string } {
    switch (this.phase) {
      case "recording":
        return { label: "● Recording", color: "#f38ba8" };
      case "finishing":
        return { label: "Finishing capture", color: "#f9e2af" };
      case "waiting-model":
        return { label: "Loading model", color: "#f9e2af" };
      case "transcribing":
        return { label: "Transcribing", color: "#89b4fa" };
      case "failed":
        return { label: "Dictation failed", color: "#f38ba8" };
    }
  }
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
