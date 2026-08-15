import assert from "node:assert/strict";
import test from "node:test";

import type {
  UIFrameLine,
  UISurface,
  UISurfaceInputEvent,
  UISurfaceResizeEvent,
  UISurfaceSize,
} from "kodelet";
import type { MicrophoneCapture } from "./audio.js";
import { DictationSurface } from "./recording-surface.js";

class FakeSurface implements UISurface {
  readonly id = "dictate-test";
  readonly size: UISurfaceSize = { width: 60, height: 5 };
  readonly updates: UIFrameLine[][] = [];
  closed = false;
  closeAttempts = 0;
  closeFailures = 0;
  private inputHandler?: (event: UISurfaceInputEvent) => void;
  private resizeHandler?: (event: UISurfaceResizeEvent) => void;

  update(lines: UIFrameLine[]): void {
    this.updates.push(lines);
  }

  async close(): Promise<void> {
    this.closeAttempts += 1;
    if (this.closeFailures > 0) {
      this.closeFailures -= 1;
      throw new Error("close failed");
    }
    this.closed = true;
  }

  onInput(handler: (event: UISurfaceInputEvent) => void): () => void {
    this.inputHandler = handler;
    return () => {
      if (this.inputHandler === handler) this.inputHandler = undefined;
    };
  }

  onResize(handler: (event: UISurfaceResizeEvent) => void): () => void {
    this.resizeHandler = handler;
    return () => {
      if (this.resizeHandler === handler) this.resizeHandler = undefined;
    };
  }

  key(key: string): void {
    this.inputHandler?.({ sequence: 1, kind: "key", key });
  }
}

function fakeCapture(): MicrophoneCapture {
  return { onFrame: undefined, onError: undefined } as unknown as MicrophoneCapture;
}

test("Enter stops recording without aborting transcription", async () => {
  const surface = new FakeSurface();
  const controller = new AbortController();
  const capture = fakeCapture();
  const display = new DictationSurface(surface, controller, controller.signal);

  display.start(capture);
  surface.key("enter");

  assert.deepEqual(await display.waitForRecordingEnd(), { kind: "stop" });
  assert.equal(controller.signal.aborted, false);
  assert.ok(surface.updates.length > 0);

  await display.close();
  assert.equal(surface.closed, true);
  assert.equal(capture.onFrame, undefined);
});

test("Escape cancels recording and aborts in-flight work", async () => {
  const surface = new FakeSurface();
  const controller = new AbortController();
  const display = new DictationSurface(surface, controller, controller.signal);

  display.start(fakeCapture());
  surface.key("esc");

  assert.deepEqual(await display.waitForRecordingEnd(), { kind: "cancel" });
  assert.equal(controller.signal.aborted, true);

  await display.close();
});

test("a failed surface close can be retried", async () => {
  const surface = new FakeSurface();
  surface.closeFailures = 1;
  const controller = new AbortController();
  const capture = fakeCapture();
  const display = new DictationSurface(surface, controller, controller.signal);

  display.start(capture);
  await assert.rejects(display.close(), /close failed/);
  assert.equal(surface.closed, false);
  assert.equal(capture.onFrame, undefined);
  assert.equal(capture.onError, undefined);

  await display.close();
  assert.equal(surface.closed, true);
  assert.equal(surface.closeAttempts, 2);
});
