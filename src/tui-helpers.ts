import { clamp, visibleLength } from "./utils.ts";

export const MIN_TERMINAL_WIDTH = 40;
export const MIN_TERMINAL_HEIGHT = 12;
export const SIDE_PANEL_THRESHOLD = 110;
export const SIDE_PANEL_WIDTH = 34;
export const SIDE_PANEL_GAP = 3;
export const MIN_MAIN_WIDTH_WITH_PANEL = 60;
export const MAX_PROMPT_LINES = 5;
export const MAX_COMPLETION_LINES = 5;

export interface PromptBuffer {
  text: string;
  cursor: number;
}

export interface PromptHistoryState {
  index: number | null;
  draft: string;
}

export interface PromptHistoryResult {
  buffer: PromptBuffer;
  history: PromptHistoryState;
}

export interface FrameLayout {
  width: number;
  height: number;
  headerHeight: number;
  mainHeight: number;
  footerHeight: number;
  promptHeight: number;
  mainWidth: number;
  sidePanelVisible: boolean;
  sidePanelWidth: number;
  sidePanelGap: number;
}

export interface OverlayBounds {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface ListLikeItem {
  label: string;
  description?: string;
  keywords?: readonly string[];
}

export function createPromptBuffer(text = "", cursor = text.length): PromptBuffer {
  return normalizePromptBuffer({ text, cursor });
}

export function normalizePromptBuffer(buffer: PromptBuffer): PromptBuffer {
  return {
    text: buffer.text,
    cursor: clamp(buffer.cursor, 0, buffer.text.length),
  };
}

export function promptVisibleWidth(value: string): number {
  return visibleLength(value);
}

export function insertPromptText(buffer: PromptBuffer, value: string): PromptBuffer {
  const clean = sanitizePlainText(value);
  if (!clean) return normalizePromptBuffer(buffer);
  const next = `${buffer.text.slice(0, buffer.cursor)}${clean}${buffer.text.slice(buffer.cursor)}`;
  return { text: next, cursor: buffer.cursor + clean.length };
}

export function insertPromptNewline(buffer: PromptBuffer): PromptBuffer {
  return insertPromptText(buffer, "\n");
}

export function deletePromptBackward(buffer: PromptBuffer): PromptBuffer {
  const current = normalizePromptBuffer(buffer);
  if (current.cursor === 0) return current;
  return {
    text: `${current.text.slice(0, current.cursor - 1)}${current.text.slice(current.cursor)}`,
    cursor: current.cursor - 1,
  };
}

export function deletePromptForward(buffer: PromptBuffer): PromptBuffer {
  const current = normalizePromptBuffer(buffer);
  if (current.cursor >= current.text.length) return current;
  return {
    text: `${current.text.slice(0, current.cursor)}${current.text.slice(current.cursor + 1)}`,
    cursor: current.cursor,
  };
}

export function movePromptCursor(buffer: PromptBuffer, delta: number): PromptBuffer {
  const current = normalizePromptBuffer(buffer);
  return { text: current.text, cursor: clamp(current.cursor + delta, 0, current.text.length) };
}

export function movePromptHome(buffer: PromptBuffer): PromptBuffer {
  return { text: buffer.text, cursor: 0 };
}

export function movePromptEnd(buffer: PromptBuffer): PromptBuffer {
  return { text: buffer.text, cursor: buffer.text.length };
}

export function deletePromptToEnd(buffer: PromptBuffer): PromptBuffer {
  const current = normalizePromptBuffer(buffer);
  return { text: current.text.slice(0, current.cursor), cursor: current.cursor };
}

export function deletePromptToStart(buffer: PromptBuffer): PromptBuffer {
  const current = normalizePromptBuffer(buffer);
  return { text: current.text.slice(current.cursor), cursor: 0 };
}

export function deletePromptPreviousWord(buffer: PromptBuffer): PromptBuffer {
  const current = normalizePromptBuffer(buffer);
  if (current.cursor === 0) return current;

  let start = current.cursor;
  while (start > 0 && /\s/.test(current.text[start - 1] || "")) start--;
  while (start > 0 && !/\s/.test(current.text[start - 1] || "")) start--;
  const end = start > 0 && /\s/.test(current.text[current.cursor] || "") ? current.cursor + 1 : current.cursor;

  return {
    text: `${current.text.slice(0, start)}${current.text.slice(end)}`,
    cursor: start,
  };
}

export function setPromptText(text: string, cursor = text.length): PromptBuffer {
  return normalizePromptBuffer({ text, cursor });
}

export function recallPromptHistory(
  history: readonly string[],
  state: PromptHistoryState,
  buffer: PromptBuffer,
  direction: -1 | 1,
): PromptHistoryResult {
  if (history.length === 0) return { buffer, history: state };

  const draft = state.index === null ? buffer.text : state.draft;
  const nextIndex = state.index === null
    ? (direction < 0 ? history.length - 1 : null)
    : state.index + direction;

  if (nextIndex === null || nextIndex >= history.length) {
    return {
      buffer: setPromptText(draft),
      history: { index: null, draft: "" },
    };
  }

  const clamped = clamp(nextIndex, 0, history.length - 1);
  return {
    buffer: setPromptText(history[clamped] || ""),
    history: { index: clamped, draft },
  };
}

export function resetPromptHistory(): PromptHistoryState {
  return { index: null, draft: "" };
}

export function sanitizePlainText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, "  ")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

export function filterListItems<T extends ListLikeItem>(items: readonly T[], filter: string): T[] {
  const terms = filter.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...items];
  return items.filter((item) => {
    const haystack = [
      item.label,
      item.description || "",
      ...(item.keywords || []),
    ].join(" ").toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export function moveSelection(current: number, length: number, delta: number): number {
  if (length <= 0) return 0;
  return clamp(current + delta, 0, length - 1);
}

export function moveSelectionToStart(): number {
  return 0;
}

export function moveSelectionToEnd(length: number): number {
  return Math.max(0, length - 1);
}

export function ensureSelectedVisible(selected: number, offset: number, height: number): number {
  if (height <= 0) return 0;
  if (selected < offset) return selected;
  if (selected >= offset + height) return selected - height + 1;
  return Math.max(0, offset);
}

export function commandArgumentForItem(item: { id?: string }, index: number): string {
  return item.id || String(index + 1);
}

export function createFrameLayout(options: {
  width: number;
  height: number;
  promptHeight: number;
  forceSidePanel?: boolean | null;
}): FrameLayout {
  const width = Math.max(MIN_TERMINAL_WIDTH, options.width);
  const height = Math.max(MIN_TERMINAL_HEIGHT, options.height);
  const promptHeight = clamp(options.promptHeight, 1, Math.max(1, height - 4));
  const panelPossible = width >= SIDE_PANEL_THRESHOLD
    && width - SIDE_PANEL_WIDTH - SIDE_PANEL_GAP >= MIN_MAIN_WIDTH_WITH_PANEL;
  const sidePanelVisible = options.forceSidePanel === null || options.forceSidePanel === undefined
    ? panelPossible
    : options.forceSidePanel && panelPossible;
  const sidePanelWidth = sidePanelVisible ? SIDE_PANEL_WIDTH : 0;
  const sidePanelGap = sidePanelVisible ? SIDE_PANEL_GAP : 0;
  const mainWidth = width - sidePanelWidth - sidePanelGap;
  const headerHeight = 1;
  const footerHeight = 1;
  const mainHeight = Math.max(1, height - headerHeight - footerHeight - promptHeight);

  return {
    width,
    height,
    headerHeight,
    mainHeight,
    footerHeight,
    promptHeight,
    mainWidth,
    sidePanelVisible,
    sidePanelWidth,
    sidePanelGap,
  };
}

export function sliceContentLines(lines: readonly string[], offset: number, height: number): string[] {
  const visible = lines.slice(offset, offset + height);
  while (visible.length < height) visible.push("");
  return visible;
}

export function calculateMaxScroll(lineCount: number, visibleHeight: number): number {
  return Math.max(0, lineCount - Math.max(1, visibleHeight));
}

export function overlayBounds(width: number, mainHeight: number): OverlayBounds {
  const overlayWidth = clamp(Math.floor(width * 0.76), Math.min(width, 44), Math.min(width, 84));
  const overlayHeight = clamp(Math.floor(mainHeight * 0.76), 5, Math.max(5, mainHeight - 1));
  return {
    width: overlayWidth,
    height: overlayHeight,
    left: Math.max(0, Math.floor((width - overlayWidth) / 2)),
    top: Math.max(0, Math.floor((mainHeight - overlayHeight) / 2)),
  };
}
