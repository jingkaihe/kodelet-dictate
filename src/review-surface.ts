import type {
  UIFrameLine,
  UIStyledLine,
  UIStyledSpan,
  UISurface,
  UISurfaceInputEvent,
} from "kodelet";

export type ReviewOutcome =
  | { kind: "submit"; text: string }
  | { kind: "record-more"; text: string }
  | { kind: "discard" };

const BORDER_COLOR = "#6c7086";

export class DictationReviewSurface {
  private width: number;
  private height: number;
  private characters: string[];
  private cursor: number;
  private closed = false;
  private detached = false;
  private closing?: Promise<void>;
  private settled = false;
  private readonly outcome: Promise<ReviewOutcome>;
  private resolveOutcome!: (outcome: ReviewOutcome) => void;
  private removeInput?: () => void;
  private removeResize?: () => void;
  private removeAbort?: () => void;

  constructor(
    private readonly surface: UISurface,
    initialText: string,
    private readonly signal: AbortSignal,
  ) {
    this.width = Math.max(24, surface.size?.width ?? 72);
    this.height = Math.max(6, surface.size?.height ?? 16);
    this.characters = splitCharacters(initialText);
    this.cursor = this.characters.length;
    this.outcome = new Promise((resolve) => {
      this.resolveOutcome = resolve;
    });
  }

  start(): void {
    this.removeInput = this.surface.onInput((event) => this.handleInput(event));
    this.removeResize = this.surface.onResize(({ width, height }) => {
      this.width = Math.max(24, width);
      this.height = Math.max(6, height);
      this.render();
    });
    const onAbort = () => this.finish({ kind: "discard" });
    this.signal.addEventListener("abort", onAbort, { once: true });
    this.removeAbort = () => this.signal.removeEventListener("abort", onAbort);
    if (this.signal.aborted) this.finish({ kind: "discard" });
    this.render();
  }

  waitForDecision(): Promise<ReviewOutcome> {
    return this.outcome;
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
    this.removeInput?.();
    this.removeResize?.();
    this.removeAbort?.();
  }

  private handleInput(event: UISurfaceInputEvent): void {
    if (event.kind !== "key" || this.settled) return;
    const key = (event.key || "").toLowerCase();

    switch (key) {
      case "esc":
      case "escape":
      case "ctrl+c":
        this.finish({ kind: "discard" });
        return;
      case "enter":
        this.finish({ kind: "submit", text: this.characters.join("") });
        return;
      case "shift+enter":
      case "alt+enter":
      case "ctrl+j":
        this.insert("\n");
        return;
      case "ctrl+r":
        this.finish({ kind: "record-more", text: this.characters.join("") });
        return;
      case " ":
      case "space":
        this.insert(" ");
        return;
      case "tab":
        this.insert("  ");
        return;
      case "backspace":
      case "ctrl+h":
        this.deleteBackward();
        return;
      case "delete":
        this.deleteForward();
        return;
      case "left":
        this.moveCursor(-1);
        return;
      case "right":
        this.moveCursor(1);
        return;
      case "home":
      case "ctrl+a":
        this.cursor = 0;
        this.render();
        return;
      case "end":
      case "ctrl+e":
        this.cursor = this.characters.length;
        this.render();
        return;
      case "ctrl+u":
        this.characters = [];
        this.cursor = 0;
        this.render();
        return;
      case "ctrl+w":
      case "alt+backspace":
        this.deletePreviousWord();
        return;
      case "ctrl+left":
      case "alt+left":
        this.moveByWord(-1);
        return;
      case "ctrl+right":
      case "alt+right":
        this.moveByWord(1);
        return;
    }

    if (event.text && !event.ctrl && !event.alt) this.insert(event.text);
  }

  private insert(text: string): void {
    const inserted = splitCharacters(
      text.replaceAll("\r\n", "\n").replaceAll("\r", "\n").replaceAll("\t", "  "),
    );
    if (inserted.length === 0) return;
    this.characters.splice(this.cursor, 0, ...inserted);
    this.cursor += inserted.length;
    this.render();
  }

  private deleteBackward(): void {
    if (this.cursor === 0) return;
    this.characters.splice(this.cursor - 1, 1);
    this.cursor -= 1;
    this.render();
  }

  private deleteForward(): void {
    if (this.cursor >= this.characters.length) return;
    this.characters.splice(this.cursor, 1);
    this.render();
  }

  private deletePreviousWord(): void {
    if (this.cursor === 0) return;
    let start = this.cursor;
    while (start > 0 && isWhitespace(this.characters[start - 1] ?? "")) start -= 1;
    while (start > 0 && !isWhitespace(this.characters[start - 1] ?? "")) start -= 1;
    this.characters.splice(start, this.cursor - start);
    this.cursor = start;
    this.render();
  }

  private moveCursor(offset: number): void {
    this.cursor = Math.max(0, Math.min(this.characters.length, this.cursor + offset));
    this.render();
  }

  private moveByWord(direction: -1 | 1): void {
    if (direction < 0) {
      while (this.cursor > 0 && isWhitespace(this.characters[this.cursor - 1] ?? "")) {
        this.cursor -= 1;
      }
      while (this.cursor > 0 && !isWhitespace(this.characters[this.cursor - 1] ?? "")) {
        this.cursor -= 1;
      }
    } else {
      while (
        this.cursor < this.characters.length &&
        !isWhitespace(this.characters[this.cursor] ?? "")
      ) {
        this.cursor += 1;
      }
      while (
        this.cursor < this.characters.length &&
        isWhitespace(this.characters[this.cursor] ?? "")
      ) {
        this.cursor += 1;
      }
    }
    this.render();
  }

  private finish(outcome: ReviewOutcome): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveOutcome(outcome);
  }

  private render(): void {
    if (this.closed || this.detached) return;
    const bodyWidth = Math.max(8, this.width - 2);
    const bodyHeight = Math.max(1, this.height - 3);
    const layout = layoutText(this.characters, this.cursor, bodyWidth);
    const maximumStart = Math.max(0, layout.lines.length - bodyHeight);
    const start = Math.max(0, Math.min(maximumStart, layout.cursorLine - bodyHeight + 1));
    const visible = layout.lines.slice(start, start + bodyHeight);
    while (visible.length < bodyHeight) visible.push("");

    const footer: UIStyledLine = {
      spans: [
        {
          text: " Enter submit · Esc discard · Ctrl+R record more",
          style: { dim: true },
        },
      ],
    };

    const title = `Review dictation · ${this.characters.length} chars · line ${layout.cursorLine + 1}/${layout.lines.length}`;
    this.surface.update([
      borderHeader(this.width, title),
      ...visible.map((line) => borderBodyLine(line, bodyWidth)),
      borderBottom(this.width),
      footer,
    ]);
  }
}

function borderHeader(width: number, title: string): UIStyledLine {
  const innerWidth = Math.max(1, width - 2);
  const label = ` ${title} `.slice(0, innerWidth);
  return {
    spans: [
      { text: "╭", style: { foreground: BORDER_COLOR } },
      { text: label, style: { bold: true, foreground: "#89b4fa" } },
      { text: "─".repeat(Math.max(0, innerWidth - label.length)), style: { foreground: BORDER_COLOR } },
      { text: "╮", style: { foreground: BORDER_COLOR } },
    ],
  };
}

function borderBodyLine(line: UIFrameLine, width: number): UIStyledLine {
  const spans =
    typeof line === "string"
      ? [{ text: line }]
      : line.spans.map((span) => ({ ...span }));
  const contentWidth = spans.reduce((total, span) => total + displayTextWidth(span.text), 0);
  return {
    spans: [
      { text: "│", style: { foreground: BORDER_COLOR } },
      ...spans,
      { text: " ".repeat(Math.max(0, width - contentWidth)) },
      { text: "│", style: { foreground: BORDER_COLOR } },
    ],
  };
}

function borderBottom(width: number): UIStyledLine {
  return {
    spans: [
      { text: `╰${"─".repeat(Math.max(1, width - 2))}╯`, style: { foreground: BORDER_COLOR } },
    ],
  };
}

function splitCharacters(text: string): string[] {
  return Array.from(text);
}

function isWhitespace(character: string): boolean {
  return /^\s$/u.test(character);
}

function layoutText(
  characters: readonly string[],
  cursor: number,
  width: number,
): { lines: UIFrameLine[]; cursorLine: number } {
  const lines: UIStyledSpan[][] = [[]];
  const widths = [0];
  let cursorLine = 0;

  const newLine = () => {
    lines.push([]);
    widths.push(0);
  };
  const append = (text: string, cursorSpan = false) => {
    const line = lines.at(-1)!;
    const style = cursorSpan ? { reverse: true } : undefined;
    const previous = line.at(-1);
    if (!cursorSpan && previous && previous.style === undefined) {
      previous.text += text;
    } else {
      line.push(style ? { text, style } : { text });
    }
  };
  const ensureFits = (characterWidth: number) => {
    const currentWidth = widths.at(-1) ?? 0;
    if (currentWidth > 0 && currentWidth + characterWidth > width) newLine();
  };

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index] ?? "";
    if (character === "\n") {
      if (index === cursor) {
        ensureFits(1);
        cursorLine = lines.length - 1;
        append(" ", true);
      }
      newLine();
      continue;
    }

    const characterWidth = Math.max(1, displayWidth(character));
    ensureFits(characterWidth);
    if (index === cursor) cursorLine = lines.length - 1;
    append(character, index === cursor);
    widths[widths.length - 1] = (widths.at(-1) ?? 0) + characterWidth;
  }

  if (cursor === characters.length) {
    ensureFits(1);
    cursorLine = lines.length - 1;
    append(" ", true);
  }

  return {
    lines: lines.map((spans) => ({ spans: spans.length > 0 ? spans : [{ text: "" }] })),
    cursorLine,
  };
}

function displayWidth(character: string): number {
  if (/^\p{Mark}$/u.test(character)) return 0;
  const codePoint = character.codePointAt(0) ?? 0;
  if (
    /^\p{Extended_Pictographic}$/u.test(character) ||
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6)
  ) {
    return 2;
  }
  return 1;
}

function displayTextWidth(text: string): number {
  return splitCharacters(text).reduce((total, character) => total + displayWidth(character), 0);
}
