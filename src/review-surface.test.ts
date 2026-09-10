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
import { DictationReviewSurface } from "./review-surface.js";

class FakeSurface implements UISurface {
  readonly id = "dictate-review-test";
  readonly size: UISurfaceSize = { width: 28, height: 8 };
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

  key(key: string, text = "", modifiers: { shift?: boolean; ctrl?: boolean; alt?: boolean } = {}): void {
    this.inputHandler?.({ sequence: 1, kind: "key", key, text, ...modifiers });
  }
}

function lineText(line: UIFrameLine): string {
  return typeof line === "string" ? line : line.spans.map((span) => span.text).join("");
}

function borderedContent(line: UIFrameLine): string {
  assert.notEqual(typeof line, "string");
  if (typeof line === "string") return line;
  assert.equal(line.spans[0]?.text, "│");
  assert.equal(line.spans.at(-1)?.text, "│");
  return line.spans.slice(1, -2).map((span) => span.text).join("");
}

test("wraps the full transcription instead of truncating its beginning", async () => {
  const text = "What would you like me to make for your breakfast?";
  const surface = new FakeSurface();
  const controller = new AbortController();
  const review = new DictationReviewSurface(surface, text, controller.signal);

  review.start();
  const frame = surface.updates.at(-1);
  assert.ok(frame);
  assert.match(lineText(frame[0]!), /^╭ Review dictation/u);
  assert.match(lineText(frame.at(-2)!), /^╰─+╯$/u);
  const body = frame
    .slice(1, -2)
    .map(borderedContent)
    .join("")
    .trimEnd();
  assert.equal(body, text);
  assert.doesNotMatch(body, /^…/u);

  surface.key("esc");
  assert.deepEqual(await review.waitForDecision(), { kind: "discard" });
  await review.close();
});

test("supports editing before submission", async () => {
  const surface = new FakeSurface();
  const controller = new AbortController();
  const review = new DictationReviewSurface(surface, "breakfast?", controller.signal);

  review.start();
  surface.key("backspace");
  surface.key("!", "!");
  surface.key("enter");

  assert.deepEqual(await review.waitForDecision(), {
    kind: "submit",
    text: "breakfast!",
  });
  await review.close();
  assert.equal(surface.closed, true);
  assert.equal(surface.listenerCount, 0);
  assert.equal(controller.signal.aborted, false);
  assert.deepEqual(await review.waitForDecision(), { kind: "submit", text: "breakfast!" });
});

test("supports clearing and replacing the transcription", async () => {
  const surface = new FakeSurface();
  const controller = new AbortController();
  const review = new DictationReviewSurface(surface, "old words", controller.signal);

  review.start();
  surface.key("ctrl+u", "", { ctrl: true });
  surface.key("new", "new");
  surface.key(" ");
  surface.key("words", "words");
  surface.key("enter");

  assert.deepEqual(await review.waitForDecision(), { kind: "submit", text: "new words" });
  await review.close();
});

test("uses Ctrl+J for a reliable newline shortcut", async () => {
  const surface = new FakeSurface();
  const controller = new AbortController();
  const review = new DictationReviewSurface(surface, "first", controller.signal);

  review.start();
  surface.key("ctrl+j", "", { ctrl: true });
  surface.key("second", "second");
  surface.key("enter");

  assert.deepEqual(await review.waitForDecision(), {
    kind: "submit",
    text: "first\nsecond",
  });
  const help = lineText(surface.updates.at(-1)!.at(-1)!);
  assert.equal(help, " Enter submit · Esc discard · Ctrl+R record more");
  await review.close();
});

test("returns the edited transcription when recording more", async () => {
  const surface = new FakeSurface();
  const controller = new AbortController();
  const review = new DictationReviewSurface(surface, "first", controller.signal);

  review.start();
  surface.key("!", "!");
  surface.key("ctrl+r", "", { ctrl: true });

  assert.deepEqual(await review.waitForDecision(), {
    kind: "record-more",
    text: "first!",
  });
  await review.close();
});

for (const alreadyClosed of [false, true]) {
  test(`host closure ${alreadyClosed ? "before" : "after"} review starts discards and detaches`, async () => {
    const surface = new FakeSurface();
    const controller = new AbortController();
    const review = new DictationReviewSurface(surface, "private draft", controller.signal);
    if (alreadyClosed) surface.closeFromHost();

    review.start();
    surface.closeFromHost();

    assert.deepEqual(await review.waitForDecision(), { kind: "discard" });
    assert.equal(surface.listenerCount, 0);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    const updates = surface.updates.length;
    if (alreadyClosed) assert.equal(updates, 0);
    surface.key("enter");
    assert.deepEqual(await review.waitForDecision(), { kind: "discard" });
    assert.equal(surface.updates.length, updates);
    await review.close();
    assert.equal(surface.closeAttempts, 0);
  });
}

test("a failed review close can be retried without discarding submission", async () => {
  const surface = new FakeSurface();
  surface.closeFailures = 1;
  const controller = new AbortController();
  const review = new DictationReviewSurface(surface, "reviewed", controller.signal);

  review.start();
  surface.key("enter");
  await assert.rejects(review.close(), /close failed/);
  assert.equal(surface.closed, false);
  assert.equal(surface.listenerCount, 0);
  await review.close();
  assert.equal(surface.closed, true);
  assert.equal(surface.closeAttempts, 2);
  assert.deepEqual(await review.waitForDecision(), { kind: "submit", text: "reviewed" });
});

test("review remains compatible with SDKs without onClose", async () => {
  const surface = new FakeSurface();
  Object.defineProperty(surface, "onClose", { value: undefined });
  const controller = new AbortController();
  const review = new DictationReviewSurface(surface, "reviewed", controller.signal);

  review.start();
  surface.key("enter");
  assert.deepEqual(await review.waitForDecision(), { kind: "submit", text: "reviewed" });
  await review.close();
});
