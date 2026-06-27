import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_PROMPT_LINES,
  calculateMaxScroll,
  commandArgumentForItem,
  createFrameLayout,
  createPromptBuffer,
  deletePromptBackward,
  deletePromptForward,
  deletePromptPreviousWord,
  deletePromptToEnd,
  deletePromptToStart,
  ensureSelectedVisible,
  filterListItems,
  insertPromptNewline,
  insertPromptText,
  movePromptCursor,
  movePromptEnd,
  movePromptHome,
  moveSelection,
  moveSelectionToEnd,
  overlayBounds,
  recallPromptHistory,
  sanitizePlainText,
  sliceContentLines,
} from "./tui-helpers.ts";

test("prompt editing supports cursor movement, insertion, and deletion", () => {
  let prompt = createPromptBuffer("helo", 2);
  prompt = insertPromptText(prompt, "l");
  assert.deepEqual(prompt, { text: "hello", cursor: 3 });

  prompt = movePromptEnd(prompt);
  assert.equal(prompt.cursor, 5);
  prompt = deletePromptBackward(prompt);
  assert.deepEqual(prompt, { text: "hell", cursor: 4 });

  prompt = movePromptHome(prompt);
  prompt = deletePromptForward(prompt);
  assert.deepEqual(prompt, { text: "ell", cursor: 0 });

  prompt = insertPromptText(prompt, "h");
  assert.deepEqual(movePromptCursor(prompt, 99), { text: "hell", cursor: 4 });
  assert.deepEqual(movePromptCursor(prompt, -99), { text: "hell", cursor: 0 });
});

test("prompt editing shortcuts remove ranges and previous words", () => {
  const prompt = createPromptBuffer("one two three", 7);
  assert.deepEqual(deletePromptToEnd(prompt), { text: "one two", cursor: 7 });
  assert.deepEqual(deletePromptToStart(prompt), { text: " three", cursor: 0 });
  assert.deepEqual(deletePromptPreviousWord(prompt), { text: "one three", cursor: 4 });
});

test("plain-text paste and newlines are normalized safely", () => {
  assert.equal(sanitizePlainText("a\r\nb\tc\x00\x1bd"), "a\nb  cd");
  const prompt = insertPromptNewline(createPromptBuffer("hello"));
  assert.deepEqual(prompt, { text: "hello\n", cursor: 6 });
  assert.equal(insertPromptText(prompt, "world").text, "hello\nworld");
});

test("prompt history recall preserves an in-progress draft", () => {
  const history = ["first", "second"];
  const draft = createPromptBuffer("dra");
  const previous = recallPromptHistory(history, { index: null, draft: "" }, draft, -1);
  assert.deepEqual(previous.buffer, { text: "second", cursor: 6 });
  assert.deepEqual(previous.history, { index: 1, draft: "dra" });

  const earlier = recallPromptHistory(history, previous.history, previous.buffer, -1);
  assert.deepEqual(earlier.buffer, { text: "first", cursor: 5 });

  const backToSecond = recallPromptHistory(history, earlier.history, earlier.buffer, 1);
  assert.deepEqual(backToSecond.buffer, { text: "second", cursor: 6 });

  const restored = recallPromptHistory(history, backToSecond.history, backToSecond.buffer, 1);
  assert.deepEqual(restored.buffer, { text: "dra", cursor: 3 });
});

test("list filtering and selection helpers keep rows bounded", () => {
  const items = [
    { label: "Alpha", description: "first", keywords: ["one"] },
    { label: "Beta", description: "second", keywords: ["two"] },
    { label: "Gamma", description: "third", keywords: ["three"] },
  ];

  assert.deepEqual(filterListItems(items, "two").map((item) => item.label), ["Beta"]);
  assert.equal(moveSelection(0, items.length, -1), 0);
  assert.equal(moveSelection(0, items.length, 2), 2);
  assert.equal(moveSelectionToEnd(items.length), 2);
  assert.equal(ensureSelectedVisible(8, 0, 4), 5);
  assert.equal(commandArgumentForItem({ id: "abc" }, 4), "abc");
  assert.equal(commandArgumentForItem({}, 4), "5");
});

test("layout helpers allocate narrow, wide, prompt, and overlay bounds without overlap", () => {
  const narrow = createFrameLayout({ width: 80, height: 24, promptHeight: 1 });
  assert.equal(narrow.sidePanelVisible, false);
  assert.equal(narrow.mainWidth, 80);
  assert.equal(narrow.headerHeight + narrow.mainHeight + narrow.footerHeight + narrow.promptHeight, 24);

  const wide = createFrameLayout({ width: 140, height: 32, promptHeight: MAX_PROMPT_LINES });
  assert.equal(wide.sidePanelVisible, true);
  assert.equal(wide.mainWidth + wide.sidePanelGap + wide.sidePanelWidth, 140);
  assert.equal(wide.headerHeight + wide.mainHeight + wide.footerHeight + wide.promptHeight, 32);

  const overlay = overlayBounds(wide.width, wide.mainHeight);
  assert.ok(overlay.left >= 0);
  assert.ok(overlay.top >= 0);
  assert.ok(overlay.left + overlay.width <= wide.width);
  assert.ok(overlay.top + overlay.height <= wide.mainHeight);

  assert.equal(calculateMaxScroll(30, 10), 20);
  assert.deepEqual(sliceContentLines(["a", "b"], 0, 4), ["a", "b", "", ""]);
});
