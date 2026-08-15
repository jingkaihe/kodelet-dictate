import { createRequire } from "node:module";

type PvRecorderConstructor = typeof import("@picovoice/pvrecorder-node").PvRecorder;
type PvRecorderInstance = InstanceType<PvRecorderConstructor>;

const require = createRequire(import.meta.url);

export const CAPTURE_SAMPLE_RATE = 16_000;
const FRAME_LENGTH = 512;

export type SelectedMicrophone = {
  name: string;
  occurrence: number;
};

export type CapturedAudio = {
  pcm: Float32Array;
};

export class MicrophoneUnavailableError extends Error {
  constructor(name: string) {
    super(`Selected microphone is unavailable: ${name}. Run /transcribe and choose another microphone.`);
    this.name = "MicrophoneUnavailableError";
  }
}

export function getAvailableMicrophones(): string[] {
  return loadPvRecorder().getAvailableDevices();
}

export function assertMicrophoneBackendAvailable(): void {
  loadPvRecorder();
}

let recorderConstructor: PvRecorderConstructor | undefined;

function loadPvRecorder(): PvRecorderConstructor {
  if (recorderConstructor) return recorderConstructor;
  try {
    const module = require("@picovoice/pvrecorder-node") as typeof import("@picovoice/pvrecorder-node");
    recorderConstructor = module.PvRecorder;
    return recorderConstructor;
  } catch (error) {
    throw new Error(
      `Microphone recording is unavailable on ${process.platform}/${process.arch}: ${toError(error).message}`,
    );
  }
}

function convertFrames(frames: Int16Array[]): Float32Array {
  const sampleCount = frames.reduce((total, frame) => total + frame.length, 0);
  const pcm = new Float32Array(sampleCount);
  let offset = 0;

  for (const frame of frames) {
    for (let index = 0; index < frame.length; index += 1) {
      pcm[offset + index] = (frame[index] ?? 0) / 32_768;
    }
    offset += frame.length;
  }

  return pcm;
}

function findDeviceIndex(devices: readonly string[], selected: SelectedMicrophone): number {
  let occurrence = 0;
  for (let index = 0; index < devices.length; index += 1) {
    if (devices[index] !== selected.name) continue;
    if (occurrence === selected.occurrence) return index;
    occurrence += 1;
  }
  return -1;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export class MicrophoneCapture {
  private recorder: PvRecorderInstance | undefined;
  private frames: Int16Array[] = [];
  private readLoop: Promise<void> | undefined;
  private stopping = false;
  private readError: Error | undefined;
  onFrame?: (frame: Int16Array) => void;
  onError?: (error: Error) => void;

  constructor(private readonly selectedDevice?: SelectedMicrophone) {}

  start(): void {
    if (this.recorder) throw new Error("Microphone capture is already active");

    const deviceIndex = this.selectedDevice
      ? findDeviceIndex(getAvailableMicrophones(), this.selectedDevice)
      : -1;
    if (this.selectedDevice && deviceIndex < 0) {
      throw new MicrophoneUnavailableError(this.selectedDevice.name);
    }

    const PvRecorder = loadPvRecorder();
    const recorder = new PvRecorder(FRAME_LENGTH, deviceIndex);
    try {
      if (recorder.sampleRate !== CAPTURE_SAMPLE_RATE) {
        throw new Error(
          `PvRecorder reported ${recorder.sampleRate} Hz; expected ${CAPTURE_SAMPLE_RATE} Hz`,
        );
      }

      this.frames = [];
      this.stopping = false;
      this.readError = undefined;
      recorder.start();
      this.recorder = recorder;
      this.readLoop = this.readFrames(recorder);
    } catch (error) {
      recorder.release();
      throw error;
    }
  }

  async stop(): Promise<CapturedAudio> {
    const recorder = this.recorder;
    if (!recorder) throw new Error("Microphone capture is not active");

    this.stopping = true;
    let stopError: Error | undefined;
    try {
      if (recorder.isRecording) recorder.stop();
    } catch (error) {
      stopError = toError(error);
    }

    try {
      await this.readLoop;
    } finally {
      recorder.release();
      this.recorder = undefined;
      this.readLoop = undefined;
    }

    if (stopError) throw stopError;
    if (this.readError) throw this.readError;
    return { pcm: convertFrames(this.frames) };
  }

  private async readFrames(recorder: PvRecorderInstance): Promise<void> {
    try {
      while (!this.stopping && recorder.isRecording) {
        const frame = await recorder.read();
        if (this.stopping) continue;
        this.frames.push(frame);
        try {
          this.onFrame?.(frame);
        } catch {
          // Presentation updates must not fail microphone capture.
        }
      }
    } catch (error) {
      if (!this.stopping) this.reportReadError(toError(error));
      return;
    }
    if (!this.stopping) this.reportReadError(new Error("Microphone capture stopped unexpectedly"));
  }

  private reportReadError(error: Error): void {
    if (this.readError) return;
    this.readError = error;
    try {
      this.onError?.(error);
    } catch {
      // Error presentation must not obscure the original capture failure.
    }
  }
}

export function microphoneFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const help =
    process.platform === "darwin"
      ? " Check System Settings → Privacy & Security → Microphone for your terminal app."
      : "";
  return `Microphone capture failed: ${message}${help}`;
}
