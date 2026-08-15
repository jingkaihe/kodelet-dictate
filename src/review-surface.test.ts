import assert from "node:assert/strict";
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
  private inputHandler?: (event: UISurfaceInputEvent) => void;
  private resizeHandler?: (event: UISurfaceResizeEvent) => void;

  update(lines: UIFrameLine[]): void {
    this.updates.push(lines);
  }

  async close(): Promise<void> {
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
