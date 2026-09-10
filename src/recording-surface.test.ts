import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
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
  private closeHandlers = new Set<() => void>();

  get listenerCount(): number {
    return Number(!!this.inputHandler) + Number(!!this.resizeHandler) + this.closeHandlers.size;
  }

  update(lines: UIFrameLine[]): void {
    this.updates.push(lines);
  }

  async close(): Promise<void> {
    this.closeAttempts += 1;
    if (this.closeFailures > 0) {
      this.closeFailures -= 1;
      throw new Error("close failed");
    }
    this.closeFromHost();
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

  onClose(handler: () => void): () => void {
    if (this.closed) {
      handler();
      return () => {};
    }
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  closeFromHost(): void {
    if (this.closed) return;
    this.closed = true;
    for (const handler of this.closeHandlers) handler();
    this.closeHandlers.clear();
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
  assert.equal(controller.signal.aborted, false, "normal closure must not abort the successful flow");
  assert.equal(surface.listenerCount, 0);
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
  assert.equal(controller.signal.aborted, false);
});

for (const phase of ["recording", "waiting-model", "transcribing"] as const) {
  test(`host closure cancels ${phase} and detaches presentation`, async (t) => {
    const clearTimer = t.mock.method(globalThis, "clearInterval");
    const surface = new FakeSurface();
    const controller = new AbortController();
    const capture = fakeCapture();
    const display = new DictationSurface(surface, controller, controller.signal);

    display.start(capture);
    capture.onError = () => assert.fail("capture callback survived closure");
    if (phase !== "recording") {
      surface.key("enter");
      assert.deepEqual(await display.waitForRecordingEnd(), { kind: "stop" });
      display.setPhase(phase);
    }
    surface.closeFromHost();

    assert.equal(controller.signal.aborted, true);
    assert.deepEqual(await display.waitForRecordingEnd(), {
      kind: phase === "recording" ? "cancel" : "stop",
    });
    assert.equal(capture.onFrame, undefined);
    assert.equal(capture.onError, undefined);
    assert.equal(surface.listenerCount, 0);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    assert.equal(clearTimer.mock.callCount(), 1);
    const updates = surface.updates.length;
    display.setModelReady();
    surface.key("enter");
    assert.equal(surface.updates.length, updates);
    await display.close();
    assert.equal(surface.closeAttempts, 0, "host closure must not trigger another close RPC");
  });
}

test("an already-closed surface cancels synchronously during start", async (t) => {
  const clearTimer = t.mock.method(globalThis, "clearInterval");
  const surface = new FakeSurface();
  surface.closeFromHost();
  const controller = new AbortController();
  const capture = fakeCapture();
  const display = new DictationSurface(surface, controller, controller.signal);

  display.start(capture);

  assert.equal(controller.signal.aborted, true, "the caller must observe cancellation before capture.start");
  assert.deepEqual(await display.waitForRecordingEnd(), { kind: "cancel" });
  assert.equal(capture.onFrame, undefined);
  assert.equal(surface.listenerCount, 0);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  assert.equal(clearTimer.mock.callCount(), 1);
  assert.equal(surface.updates.length, 0);
  await display.close();
  assert.equal(surface.closeAttempts, 0);
});

test("recording remains compatible with SDKs without onClose", async () => {
  const surface = new FakeSurface();
  Object.defineProperty(surface, "onClose", { value: undefined });
  const controller = new AbortController();
  const display = new DictationSurface(surface, controller, controller.signal);

  display.start(fakeCapture());
  surface.key("enter");
  assert.deepEqual(await display.waitForRecordingEnd(), { kind: "stop" });
  await display.close();
  assert.equal(controller.signal.aborted, false);
});
