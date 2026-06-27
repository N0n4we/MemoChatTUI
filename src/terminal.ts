import readline from "node:readline";
import {
  COMMANDS,
  DOCUMENTED_COMMANDS,
  applySlashCompletion,
  filterCommands,
  slashCompletions,
  type CommandMetadata,
  type OverlayTarget,
} from "./commands.ts";
import { describeConfig, AppController } from "./app.ts";
import { maskSecret } from "./config.ts";
import type {
  AppState,
  ChatSession,
  LocalMemoPack,
  MarketChannel,
  RemoteMemoPack,
  StoredMessage,
  TerminalInteractionState,
  TerminalOverlayKind,
} from "./types.ts";
import {
  clamp,
  formatDateTime,
  padRightVisible,
  repeat,
  truncateVisible,
  visibleLength,
  wrapText,
} from "./utils.ts";
import {
  MAX_COMPLETION_LINES,
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
  resetPromptHistory,
  sanitizePlainText,
  setPromptText,
  sliceContentLines,
  type FrameLayout,
  type PromptBuffer,
  type PromptHistoryState,
} from "./tui-helpers.ts";

type Keypress = {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  sequence?: string;
};

type PickerOverlayKind = Exclude<TerminalOverlayKind, "confirmation">;

interface PickerOverlay {
  kind: PickerOverlayKind;
  filter: string;
  selected: number;
  offset: number;
}

interface ConfirmationOverlay {
  kind: "confirmation";
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
}

type ActiveOverlay = PickerOverlay | ConfirmationOverlay;

interface OverlayRow {
  id: string;
  label: string;
  description: string;
  detail?: string;
  keywords?: readonly string[];
  shortcut?: string;
  action: () => Promise<void>;
  deleteAction?: () => void;
}

interface CompletionView {
  items: CommandMetadata[];
  selected: number;
}

interface PromptSegment {
  text: string;
  start: number;
  end: number;
}

const colorEnabled = !process.env.NO_COLOR;

export class TerminalUi {
  readonly app: AppController;
  private prompt: PromptBuffer = createPromptBuffer();
  private promptHistory: string[] = [];
  private historyState: PromptHistoryState = resetPromptHistory();
  private activeOverlay: ActiveOverlay | null = null;
  private completionSelected = 0;
  private completionDismissedFor = "";
  private promptLineOffset = 0;
  private scrollOffset = 0;
  private followBottom = true;
  private lastView: AppState["view"] | null = null;
  private readonly viewScroll = new Map<AppState["view"], { offset: number; followBottom: boolean }>();
  private renderTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(app: AppController) {
    this.app = app;
  }

  start(): void {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error("MemoChatTUI requires an interactive TTY. Use --help for commands.");
    }

    this.running = true;
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("keypress", this.handleKeypress);
    process.stdout.on("resize", this.scheduleRender);
    this.app.on("render", this.scheduleRender);
    this.app.on("quit", this.stop);

    process.stdout.write("\x1b[?1049h\x1b[?25l\x1b[2J");
    this.scheduleRender();
  }

  stop = (): void => {
    if (!this.running) return;
    this.running = false;

    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }

    process.stdin.off("keypress", this.handleKeypress);
    process.stdout.off("resize", this.scheduleRender);
    this.app.off("render", this.scheduleRender);
    this.app.off("quit", this.stop);

    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdout.write("\x1b[?25h\x1b[?1049l");
    process.exit(0);
  };

  private scheduleRender = (): void => {
    if (this.renderTimer) return;
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null;
      this.render();
    }, 16);
  };

  private handleKeypress = (chunk: string, key: Keypress): void => {
    if (key.ctrl && key.name === "c") {
      this.stop();
      return;
    }

    if (key.ctrl && key.name === "l") {
      this.scheduleRender();
      return;
    }

    if (key.ctrl && key.name === "p") {
      this.openOverlay("command-palette");
      return;
    }

    if (key.name === "f1") {
      void this.dispatchCommand({ kind: "submit", command: "/help" });
      return;
    }

    if (this.activeOverlay) {
      void this.handleOverlayKeypress(chunk, key);
      return;
    }

    const completion = this.currentCompletion();
    if (completion && this.handleCompletionKeypress(key, completion)) {
      return;
    }

    if (key.ctrl) {
      this.handlePromptControlKey(key);
      return;
    }

    if ((key.name === "return" || key.name === "enter") && chunk === "\n") {
      this.updatePrompt(insertPromptNewline(this.prompt));
      return;
    }

    switch (key.name) {
      case "return":
      case "enter":
        if (key.shift || key.meta) {
          this.updatePrompt(insertPromptNewline(this.prompt));
          return;
        }
        void this.submitInput();
        return;
      case "tab":
        if (completion) this.acceptCompletion(completion);
        return;
      case "backspace":
        this.updatePrompt(deletePromptBackward(this.prompt));
        return;
      case "delete":
        this.updatePrompt(deletePromptForward(this.prompt));
        return;
      case "escape":
        if (this.prompt.text) this.updatePrompt(createPromptBuffer());
        this.completionDismissedFor = this.prompt.text.slice(0, this.prompt.cursor);
        this.scheduleRender();
        return;
      case "left":
        this.updatePrompt(movePromptCursor(this.prompt, -1), false);
        return;
      case "right":
        this.updatePrompt(movePromptCursor(this.prompt, 1), false);
        return;
      case "home":
        this.updatePrompt(movePromptHome(this.prompt), false);
        return;
      case "end":
        this.updatePrompt(movePromptEnd(this.prompt), false);
        return;
      case "up":
        this.recallHistory(-1);
        return;
      case "down":
        this.recallHistory(1);
        return;
      case "pageup":
        this.followBottom = false;
        this.scrollOffset = Math.max(0, this.scrollOffset - 8);
        this.scheduleRender();
        return;
      case "pagedown":
        this.scrollOffset += 8;
        this.scheduleRender();
        return;
      default:
        break;
    }

    if (key.meta && key.name === "up") {
      this.followBottom = false;
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);
      this.scheduleRender();
      return;
    }

    if (key.meta && key.name === "down") {
      this.scrollOffset += 1;
      this.scheduleRender();
      return;
    }

    if (key.meta) return;

    const clean = sanitizePlainText(chunk || "");
    if (clean) {
      this.updatePrompt(insertPromptText(this.prompt, clean));
    }
  };

  private handlePromptControlKey(key: Keypress): void {
    switch (key.name) {
      case "a":
        this.updatePrompt(movePromptHome(this.prompt), false);
        return;
      case "e":
        this.updatePrompt(movePromptEnd(this.prompt), false);
        return;
      case "j":
        this.updatePrompt(insertPromptNewline(this.prompt));
        return;
      case "k":
        this.updatePrompt(deletePromptToEnd(this.prompt));
        return;
      case "u":
        this.updatePrompt(deletePromptToStart(this.prompt));
        return;
      case "w":
        this.updatePrompt(deletePromptPreviousWord(this.prompt));
        return;
      default:
        return;
    }
  }

  private handleCompletionKeypress(key: Keypress, completion: CompletionView): boolean {
    switch (key.name) {
      case "up":
        this.completionSelected = moveSelection(completion.selected, completion.items.length, -1);
        this.scheduleRender();
        return true;
      case "down":
        this.completionSelected = moveSelection(completion.selected, completion.items.length, 1);
        this.scheduleRender();
        return true;
      case "pageup":
        this.completionSelected = moveSelection(completion.selected, completion.items.length, -MAX_COMPLETION_LINES);
        this.scheduleRender();
        return true;
      case "pagedown":
        this.completionSelected = moveSelection(completion.selected, completion.items.length, MAX_COMPLETION_LINES);
        this.scheduleRender();
        return true;
      case "home":
        this.completionSelected = 0;
        this.scheduleRender();
        return true;
      case "end":
        this.completionSelected = moveSelectionToEnd(completion.items.length);
        this.scheduleRender();
        return true;
      case "tab":
        this.acceptCompletion(completion);
        return true;
      case "escape":
        this.completionDismissedFor = this.prompt.text.slice(0, this.prompt.cursor);
        this.scheduleRender();
        return true;
      default:
        return false;
    }
  }

  private async handleOverlayKeypress(chunk: string, key: Keypress): Promise<void> {
    if (!this.activeOverlay) return;

    if (this.activeOverlay.kind === "confirmation") {
      if (key.name === "escape" || lowerChunk(chunk) === "n") {
        this.closeOverlay();
        return;
      }

      if (key.name === "return" || key.name === "enter" || lowerChunk(chunk) === "y") {
        const action = this.activeOverlay.onConfirm;
        this.closeOverlay();
        await action();
        return;
      }

      return;
    }

    const rows = this.filteredOverlayRows(this.activeOverlay);
    switch (key.name) {
      case "escape":
        this.closeOverlay();
        return;
      case "return":
      case "enter": {
        const row = rows[this.activeOverlay.selected];
        if (row) await row.action();
        return;
      }
      case "up":
        this.moveOverlaySelection(-1, rows.length);
        return;
      case "down":
        this.moveOverlaySelection(1, rows.length);
        return;
      case "pageup":
        this.moveOverlaySelection(-Math.max(1, this.overlayPageSize()), rows.length);
        return;
      case "pagedown":
        this.moveOverlaySelection(Math.max(1, this.overlayPageSize()), rows.length);
        return;
      case "home":
        this.activeOverlay.selected = 0;
        this.activeOverlay.offset = 0;
        this.scheduleRender();
        return;
      case "end":
        this.activeOverlay.selected = moveSelectionToEnd(rows.length);
        this.activeOverlay.offset = ensureSelectedVisible(
          this.activeOverlay.selected,
          this.activeOverlay.offset,
          this.overlayPageSize(),
        );
        this.scheduleRender();
        return;
      case "backspace":
        this.activeOverlay.filter = this.activeOverlay.filter.slice(0, -1);
        this.resetOverlaySelection();
        return;
      case "delete": {
        const row = rows[this.activeOverlay.selected];
        if (row?.deleteAction) row.deleteAction();
        return;
      }
      default:
        break;
    }

    if (key.ctrl && key.name === "d") {
      const row = rows[this.activeOverlay.selected];
      if (row?.deleteAction) row.deleteAction();
      return;
    }

    if (key.ctrl && key.name === "u") {
      this.activeOverlay.filter = "";
      this.resetOverlaySelection();
      return;
    }

    if (key.ctrl && key.name === "w") {
      const buffer = deletePromptPreviousWord({ text: this.activeOverlay.filter, cursor: this.activeOverlay.filter.length });
      this.activeOverlay.filter = buffer.text;
      this.resetOverlaySelection();
      return;
    }

    if (key.ctrl || key.meta) return;
    const clean = sanitizePlainText(chunk || "").replace(/\n/g, " ");
    if (clean) {
      this.activeOverlay.filter += clean;
      this.resetOverlaySelection();
    }
  }

  private updatePrompt(buffer: PromptBuffer, resetCompletion = true): void {
    this.prompt = buffer;
    this.historyState = resetPromptHistory();
    if (resetCompletion) {
      this.completionSelected = 0;
      this.completionDismissedFor = "";
    }
    this.scheduleRender();
  }

  private recallHistory(direction: -1 | 1): void {
    const result = recallPromptHistory(this.promptHistory, this.historyState, this.prompt, direction);
    this.prompt = result.buffer;
    this.historyState = result.history;
    this.completionSelected = 0;
    this.completionDismissedFor = "";
    this.scheduleRender();
  }

  private async submitInput(): Promise<void> {
    const value = this.prompt.text;
    if (!value.trim()) return;

    if (this.promptHistory[this.promptHistory.length - 1] !== value) {
      this.promptHistory.push(value);
      if (this.promptHistory.length > 200) this.promptHistory.shift();
    }

    this.prompt = createPromptBuffer();
    this.historyState = resetPromptHistory();
    this.completionDismissedFor = "";
    this.completionSelected = 0;
    this.followBottom = true;
    this.scheduleRender();
    await this.app.submit(value);
  }

  private currentCompletion(): CompletionView | null {
    const beforeCursor = this.prompt.text.slice(0, this.prompt.cursor);
    if (this.activeOverlay || beforeCursor.includes("\n") || !beforeCursor.startsWith("/")) return null;
    if (beforeCursor === this.completionDismissedFor) return null;
    const items = slashCompletions(beforeCursor).map((item) => item.command);
    if (items.length === 0) return null;
    this.completionSelected = clamp(this.completionSelected, 0, items.length - 1);
    return { items, selected: this.completionSelected };
  }

  private acceptCompletion(completion: CompletionView): void {
    const command = completion.items[completion.selected];
    if (!command) return;
    this.prompt = applySlashCompletion(this.prompt.text, this.prompt.cursor, command);
    this.completionSelected = 0;
    this.completionDismissedFor = this.prompt.text.slice(0, this.prompt.cursor);
    this.scheduleRender();
  }

  private openOverlay(kind: PickerOverlayKind): void {
    this.activeOverlay = { kind, filter: "", selected: 0, offset: 0 };
    this.completionDismissedFor = "";
    this.scheduleRender();
  }

  private async openOverlayTarget(target: OverlayTarget): Promise<void> {
    switch (target) {
      case "command-palette":
        this.openOverlay("command-palette");
        return;
      case "sessions":
        await this.app.refreshSessions();
        this.openOverlay("session-picker");
        return;
      case "local-packs":
        await this.app.submit("/pack list");
        this.openOverlay("local-pack-picker");
        return;
      case "remote-packs":
        this.openOverlay("remote-pack-picker");
        return;
      case "channels":
        await this.app.submit("/channel list");
        this.openOverlay("channel-picker");
        return;
    }
  }

  closeOverlay(): void {
    this.activeOverlay = null;
    this.scheduleRender();
  }

  private async dispatchCommand(dispatch: CommandMetadata["dispatch"]): Promise<void> {
    switch (dispatch.kind) {
      case "submit":
        this.closeOverlay();
        this.followBottom = true;
        await this.app.submit(dispatch.command);
        return;
      case "insert":
        this.closeOverlay();
        this.prompt = setPromptText(dispatch.template);
        this.historyState = resetPromptHistory();
        this.completionDismissedFor = "";
        this.scheduleRender();
        return;
      case "overlay":
        await this.openOverlayTarget(dispatch.target);
        return;
    }
  }

  private moveOverlaySelection(delta: number, length: number): void {
    if (!this.activeOverlay || this.activeOverlay.kind === "confirmation") return;
    this.activeOverlay.selected = moveSelection(this.activeOverlay.selected, length, delta);
    this.activeOverlay.offset = ensureSelectedVisible(
      this.activeOverlay.selected,
      this.activeOverlay.offset,
      this.overlayPageSize(),
    );
    this.scheduleRender();
  }

  private resetOverlaySelection(): void {
    if (!this.activeOverlay || this.activeOverlay.kind === "confirmation") return;
    this.activeOverlay.selected = 0;
    this.activeOverlay.offset = 0;
    this.scheduleRender();
  }

  private overlayPageSize(): number {
    const height = Math.max(12, process.stdout.rows || 24);
    return Math.max(1, Math.floor(height * 0.45));
  }

  private render(): void {
    if (!this.running) return;

    const state = this.app.state;
    this.syncViewScroll(state.view);
    const width = Math.max(40, process.stdout.columns || 80);
    const height = Math.max(12, process.stdout.rows || 24);
    const completion = this.currentCompletion();
    const fittedPrompt = fitPromptRegion(
      completion ? this.completionLines(completion, width) : [],
      this.promptLines(width),
      Math.max(1, height - 4),
    );
    const completionLines = fittedPrompt.completionLines;
    const promptLines = fittedPrompt.promptLines;
    const layout = createFrameLayout({
      width,
      height,
      promptHeight: completionLines.length + promptLines.length,
    });

    const contentLines = buildContentLines(state, layout.mainWidth, this.selectedRowForView());
    const maxScroll = calculateMaxScroll(contentLines.length, layout.mainHeight);

    if (this.followBottom) {
      this.scrollOffset = maxScroll;
    } else {
      this.scrollOffset = clamp(this.scrollOffset, 0, maxScroll);
      if (this.scrollOffset >= maxScroll) this.followBottom = true;
    }

    const visibleMain = sliceContentLines(contentLines, this.scrollOffset, layout.mainHeight);
    const body = layout.sidePanelVisible
      ? this.combineSidePanel(visibleMain, sidePanelLines(state, layout.sidePanelWidth), layout)
      : visibleMain.map((line) => padRightVisible(line, layout.width));

    const paintedBody = this.activeOverlay ? this.paintOverlay(body, layout) : body;
    const frame = [
      this.headerLine(state, layout),
      ...paintedBody,
      this.statusLine(state, layout, maxScroll),
      ...completionLines,
      ...promptLines,
    ].map((line) => padRightVisible(line, layout.width));

    process.stdout.write(`\x1b[H${frame.join("\n")}`);
  }

  private selectedRowForView(): number {
    if (!this.activeOverlay || this.activeOverlay.kind === "confirmation") return 0;
    return this.activeOverlay.selected;
  }

  private syncViewScroll(view: AppState["view"]): void {
    if (this.lastView === null) {
      this.lastView = view;
      return;
    }

    if (this.lastView === view) return;

    this.viewScroll.set(this.lastView, {
      offset: this.scrollOffset,
      followBottom: this.followBottom,
    });

    const restored = this.viewScroll.get(view);
    this.scrollOffset = restored?.offset || 0;
    this.followBottom = restored?.followBottom ?? view === "chat";
    this.lastView = view;
  }

  private headerLine(state: AppState, layout: FrameLayout): string {
    const memos = `${state.pack.memos.filter((memo) => memo.content.trim()).length}/${Math.max(state.pack.memos.length, state.pack.rules.length)} memos`;
    const busy = state.busy ? " busy:on" : " busy:off";
    const compact = state.compacting ? ` compact:${state.compactProgress}/${state.compactTotal}` : "";
    const key = state.config.apiKey ? "key:set" : "key:missing";
    const title = `${bold("MemoChatTUI")} ${state.view}${busy}${compact}`;
    const right = layout.sidePanelVisible
      ? `model:${state.config.modelId || "(unset)"}`
      : `${memos} ${key} model:${state.config.modelId || "(unset)"}`;
    const gap = Math.max(1, layout.width - visibleLength(title) - visibleLength(right));
    return truncateVisible(`${title}${repeat(" ", gap)}${dim(right)}`, layout.width);
  }

  private statusLine(state: AppState, layout: FrameLayout, maxScroll: number): string {
    const parts = [state.status || "Ready"];
    if (maxScroll > 0) parts.push(`scroll ${this.scrollOffset + 1}/${maxScroll + 1}`);
    if (!state.config.apiKey.trim()) parts.push("setup: /set apiKey <key>");
    if (!layout.sidePanelVisible) {
      const channel = selectedChannelName(state);
      if (channel) parts.push(`channel:${channel}`);
      parts.push(`${state.sessions.length} sessions`);
    }

    const help = this.activeOverlay
      ? "Enter select | Esc close | type filter"
      : "Ctrl-P palette | Tab complete | Ctrl-J newline | PgUp/PgDn scroll | Ctrl-C quit";
    const left = parts.join("  ");
    const gap = Math.max(1, layout.width - visibleLength(left) - visibleLength(help));
    return inverse(truncateVisible(`${left}${repeat(" ", gap)}${help}`, layout.width));
  }

  private completionLines(completion: CompletionView, width: number): string[] {
    const selected = completion.selected;
    const offset = ensureSelectedVisible(selected, 0, MAX_COMPLETION_LINES);
    return completion.items.slice(offset, offset + MAX_COMPLETION_LINES).map((command, index) => {
      const absolute = offset + index;
      const marker = absolute === selected ? ">" : " ";
      const usage = padRightVisible(command.usage, Math.min(32, Math.max(14, Math.floor(width * 0.34))));
      const line = `${marker} ${usage} ${command.description}`;
      return absolute === selected ? inverse(truncateVisible(line, width)) : dim(truncateVisible(line, width));
    });
  }

  private promptLines(width: number): string[] {
    const contentWidth = Math.max(1, width - 2);
    const segments = promptSegments(this.prompt.text, contentWidth);
    const cursorLine = Math.max(0, segments.findIndex((segment) => this.prompt.cursor >= segment.start && this.prompt.cursor <= segment.end));
    this.promptLineOffset = ensureSelectedVisible(
      cursorLine === -1 ? segments.length - 1 : cursorLine,
      this.promptLineOffset,
      MAX_PROMPT_LINES,
    );
    const visible = segments.slice(this.promptLineOffset, this.promptLineOffset + MAX_PROMPT_LINES);
    return visible.map((segment, index) => {
      const absoluteIndex = this.promptLineOffset + index;
      const prefix = absoluteIndex === 0 ? "> " : "  ";
      return `${prefix}${padRightVisible(this.decoratePromptSegment(segment), contentWidth)}`;
    });
  }

  private decoratePromptSegment(segment: PromptSegment): string {
    if (this.prompt.cursor < segment.start || this.prompt.cursor > segment.end) return segment.text;
    const local = clamp(this.prompt.cursor - segment.start, 0, segment.text.length);
    const before = segment.text.slice(0, local);
    const cursorChar = segment.text[local] || " ";
    const after = segment.text.slice(local + (segment.text[local] ? 1 : 0));
    return `${before}${inverse(cursorChar)}${after}`;
  }

  private combineSidePanel(main: readonly string[], side: readonly string[], layout: FrameLayout): string[] {
    const divider = dim(" | ");
    return main.map((line, index) => {
      const left = padRightVisible(line, layout.mainWidth);
      const right = padRightVisible(side[index] || "", layout.sidePanelWidth);
      return truncateVisible(`${left}${divider}${right}`, layout.width);
    });
  }

  private paintOverlay(body: readonly string[], layout: FrameLayout): string[] {
    if (!this.activeOverlay) return [...body];
    const bounds = overlayBounds(layout.width, layout.mainHeight);
    const overlay = this.overlayLines(this.activeOverlay, bounds.width, bounds.height);
    const output = [...body];

    overlay.forEach((line, index) => {
      const target = bounds.top + index;
      if (target < 0 || target >= output.length) return;
      const padded = `${repeat(" ", bounds.left)}${line}`;
      output[target] = padRightVisible(padded, layout.width);
    });

    return output;
  }

  private overlayLines(overlay: ActiveOverlay, width: number, height: number): string[] {
    if (overlay.kind === "confirmation") return confirmationLines(overlay, width, height);

    const rows = this.filteredOverlayRows(overlay);
    overlay.selected = clamp(overlay.selected, 0, Math.max(0, rows.length - 1));
    const bodyHeight = Math.max(1, height - 5);
    overlay.offset = ensureSelectedVisible(overlay.selected, overlay.offset, bodyHeight);
    const visibleRows = rows.slice(overlay.offset, overlay.offset + bodyHeight);
    const innerWidth = Math.max(1, width - 4);
    const lines = [
      boxTop(width, overlayTitle(overlay.kind)),
      boxLine(`Filter: ${overlay.filter || "(type to search)"}`, innerWidth),
    ];

    if (rows.length === 0) {
      lines.push(boxLine(dim(emptyOverlayMessage(overlay.kind)), innerWidth));
    } else {
      for (const [index, row] of visibleRows.entries()) {
        const absolute = overlay.offset + index;
        const marker = absolute === overlay.selected ? ">" : " ";
        const shortcut = row.shortcut ? ` ${row.shortcut}` : "";
        const labelWidth = Math.max(12, Math.min(28, Math.floor(innerWidth * 0.36)));
        const label = padRightVisible(`${marker} ${row.label}`, labelWidth);
        const detail = row.detail ? dim(` ${row.detail}`) : shortcut ? dim(shortcut) : "";
        const line = truncateVisible(`${label} ${row.description}${detail}`, innerWidth);
        lines.push(boxLine(absolute === overlay.selected ? inverse(line) : line, innerWidth));
      }
    }

    while (lines.length < height - 2) lines.push(boxLine("", innerWidth));
    lines.push(boxLine(dim(overlayFooter(overlay.kind, rows.length)), innerWidth));
    lines.push(boxBottom(width));
    return lines.slice(0, height);
  }

  private filteredOverlayRows(overlay: PickerOverlay): OverlayRow[] {
    return filterListItems(this.overlayRows(overlay.kind), overlay.filter);
  }

  private overlayRows(kind: PickerOverlayKind): OverlayRow[] {
    const state = this.app.state;
    switch (kind) {
      case "command-palette":
        return filterCommands("", COMMANDS.filter((command) => command.id !== "open-command-palette")).map((command) => ({
          id: command.id,
          label: command.label,
          description: command.description,
          detail: command.usage || command.category,
          shortcut: command.shortcut,
          keywords: [command.usage, command.category, ...command.aliases],
          action: async () => this.dispatchCommand(command.dispatch),
        }));
      case "session-picker":
        return state.sessions.map((session, index) => sessionRow(session, index, state.currentSessionId, this));
      case "local-pack-picker":
        return state.market.localPacks.map((pack, index) => localPackRow(pack, index, this));
      case "remote-pack-picker":
        return state.market.remotePacks.map((pack, index) => remotePackRow(pack, index, this));
      case "channel-picker":
        return state.market.channels.map((channel, index) => channelRow(channel, index, state.market.selectedChannelId, this));
    }
  }

  confirm(title: string, message: string, confirmLabel: string, onConfirm: () => Promise<void>): void {
    this.activeOverlay = { kind: "confirmation", title, message, confirmLabel, onConfirm };
    this.scheduleRender();
  }

  private interactionState(layout: FrameLayout): TerminalInteractionState {
    const selected = this.activeOverlay && this.activeOverlay.kind !== "confirmation" ? this.activeOverlay.selected : 0;
    const filter = this.activeOverlay && this.activeOverlay.kind !== "confirmation" ? this.activeOverlay.filter : "";
    const focusMode = this.activeOverlay ? "overlay" : this.currentCompletion() ? "completion" : "prompt";
    return {
      prompt: this.prompt,
      promptHistory: [...this.promptHistory],
      promptHistoryIndex: this.historyState.index,
      activeOverlay: this.activeOverlay?.kind || null,
      selectedRow: selected,
      filterText: filter,
      sidePanelVisible: layout.sidePanelVisible,
      focusMode,
    };
  }
}

function sessionRow(session: ChatSession, index: number, currentSessionId: string, ui: TerminalUi): OverlayRow {
  const arg = commandArgumentForItem(session, index);
  const active = session.id === currentSessionId ? "active" : "";
  return {
    id: session.id,
    label: session.title || "Untitled",
    description: `${session.messageCount} msgs updated ${formatDateTime(session.updatedAt)}`,
    detail: active,
    keywords: [session.id, session.title, active],
    action: async () => {
      ui.closeOverlay();
      await ui.app.submit(`/load ${arg}`);
    },
    deleteAction: () => ui.confirm(
      "Delete Session",
      `Delete "${session.title || session.id}"?`,
      "Delete",
      async () => {
        await ui.app.submit(`/delete ${arg}`);
      },
    ),
  };
}

function localPackRow(pack: LocalMemoPack, index: number, ui: TerminalUi): OverlayRow {
  const arg = commandArgumentForItem(pack, index);
  return {
    id: pack.id,
    label: pack.name,
    description: pack.description || "(no description)",
    detail: `${pack.rules.length} rules ${pack.memos.length} memos`,
    keywords: [pack.id, pack.name, pack.description],
    action: async () => {
      ui.closeOverlay();
      await ui.app.submit(`/pack install ${arg}`);
    },
    deleteAction: () => ui.confirm(
      "Delete Local MemoPack",
      `Delete local pack "${pack.name}"?`,
      "Delete",
      async () => {
        await ui.app.submit(`/pack delete ${arg}`);
      },
    ),
  };
}

function remotePackRow(pack: RemoteMemoPack, index: number, ui: TerminalUi): OverlayRow {
  const arg = commandArgumentForItem(pack, index);
  const author = pack.author ? ` by ${pack.author}` : "";
  return {
    id: pack.id,
    label: pack.name,
    description: pack.description || "(no description)",
    detail: `${pack.ruleCount} rules ${pack.memoCount} memos${author}`,
    keywords: [pack.id, pack.name, pack.description, pack.author || ""],
    action: async () => {
      ui.closeOverlay();
      await ui.app.submit(`/market install ${arg}`);
    },
    deleteAction: () => ui.confirm(
      "Delete Remote MemoPack",
      `Delete remote pack "${pack.name}"?`,
      "Delete",
      async () => {
        await ui.app.submit(`/market delete ${arg}`);
      },
    ),
  };
}

function channelRow(channel: MarketChannel, index: number, selectedChannelId: string, ui: TerminalUi): OverlayRow {
  const arg = commandArgumentForItem(channel, index);
  const active = channel.id === selectedChannelId ? "selected" : "";
  const auth = channel.token ? `auth ${maskSecret(channel.token)}` : "no auth";
  return {
    id: channel.id,
    label: channel.name || channel.url,
    description: channel.url,
    detail: [active, auth].filter(Boolean).join(" "),
    keywords: [channel.id, channel.url, channel.name, channel.description, channel.username, active],
    action: async () => {
      ui.closeOverlay();
      await ui.app.submit(`/channel select ${arg}`);
    },
    deleteAction: () => ui.confirm(
      "Remove Channel",
      `Remove channel "${channel.name || channel.url}"?`,
      "Remove",
      async () => {
        await ui.app.submit(`/channel remove ${arg}`);
      },
    ),
  };
}

function buildContentLines(state: AppState, width: number, selectedRow: number): string[] {
  switch (state.view) {
    case "memo":
      return memoLines(state, width, selectedRow);
    case "sessions":
      return sessionLines(state, width, selectedRow);
    case "settings":
      return settingsLines(state, width);
    case "market":
      return marketLines(state, width, selectedRow);
    case "help":
      return helpLines(width);
    case "chat":
    default:
      return chatLines(state, width);
  }
}

function chatLines(state: AppState, width: number): string[] {
  const lines: string[] = [];
  if (state.messages.length === 0) {
    lines.push(dim("No messages yet."));
    lines.push("");
    lines.push("Type a message and press Enter.");
    lines.push("Use Ctrl-P for commands or /set apiKey <key>, /set baseUrl <url>, /set model <id> before chatting.");
    return lines;
  }

  state.messages.forEach((message, index) => {
    appendMessage(lines, message, width, index === state.messages.length - 1 && state.busy);
    if (state.showReasoning && message.reasoning) {
      lines.push(dim("  reasoning"));
      for (const line of wrapText(message.reasoning, width - 4)) {
        lines.push(dim(`    ${line}`));
      }
    }
    lines.push("");
  });

  return lines;
}

function appendMessage(lines: string[], message: StoredMessage, width: number, pending: boolean): void {
  const label = message.role === "user" ? "You" : "Assistant";
  const text = message.content || (pending ? "..." : "");
  const prefix = message.role === "user" ? "You: " : "AI: ";
  const wrapWidth = Math.max(10, width - prefix.length);
  const wrapped = wrapText(text, wrapWidth);
  const header = message.role === "user" ? bold(label) : cyan(label);

  lines.push(header);
  lines.push(`${dim(prefix)}${wrapped[0] || ""}`);
  for (const line of wrapped.slice(1)) {
    lines.push(`${repeat(" ", prefix.length)}${line}`);
  }
}

function memoLines(state: AppState, width: number, selectedRow: number): string[] {
  const lines = [bold("Memo Pack"), ""];
  lines.push(bold("System Prompt"));
  if (state.pack.systemPrompt.trim()) {
    for (const line of wrapText(state.pack.systemPrompt, width - 2)) lines.push(`  ${line}`);
  } else {
    lines.push(dim("  (empty)"));
  }

  lines.push("");
  lines.push(bold("Rules"));
  if (state.pack.rules.length === 0) {
    lines.push(dim("  No rules. Add one with /rule add <title> | <update rule>"));
  } else {
    state.pack.rules.forEach((rule, index) => {
      const marker = index === selectedRow ? ">" : " ";
      lines.push(`${marker} ${String(index + 1).padStart(2, " ")}. ${rule.title}`);
      for (const line of wrapText(rule.updateRule, width - 7)) lines.push(dim(`      ${line}`));
    });
  }

  lines.push("");
  lines.push(bold("Memos"));
  if (state.pack.memos.length === 0) {
    lines.push(dim("  No memo content yet. Use /compact after a chat."));
  } else {
    state.pack.memos.forEach((memo, index) => {
      const marker = index === selectedRow ? ">" : " ";
      lines.push(`${marker} ${String(index + 1).padStart(2, " ")}. ${memo.title}`);
      const content = memo.content.trim() || "(empty)";
      for (const line of wrapText(content, width - 7)) lines.push(`      ${line}`);
    });
  }

  return lines;
}

function sessionLines(state: AppState, width: number, selectedRow: number): string[] {
  const lines = [bold("Sessions"), ""];
  if (state.sessions.length === 0) {
    lines.push(dim("No saved sessions."));
    lines.push("Use /save to save the current chat.");
    return lines;
  }

  state.sessions.forEach((session, index) => {
    const selected = index === selectedRow ? ">" : " ";
    const active = session.id === state.currentSessionId ? "*" : " ";
    const title = truncateVisible(session.title || "Untitled", Math.max(10, width - 45));
    lines.push(
      `${selected}${active} ${String(index + 1).padStart(2, " ")}. ${title}  ${session.messageCount} msgs  ${formatDateTime(session.updatedAt)}`,
    );
  });

  lines.push("");
  lines.push("Use Ctrl-P -> Session picker, /load <number>, or /delete <number>.");
  return lines;
}

function settingsLines(state: AppState, width: number): string[] {
  const lines = [bold("Settings"), ""];
  for (const line of describeConfig(state.config)) {
    lines.push(`  ${line}`);
  }
  lines.push("");
  lines.push("Commands:");
  for (const command of DOCUMENTED_COMMANDS.filter((item) => item.category === "Settings")) {
    lines.push(`  ${truncateVisible(command.usage, width - 2)}`);
  }
  return lines;
}

function marketLines(state: AppState, width: number, selectedRow: number): string[] {
  const market = state.market;
  const selected = market.channels.find((channel) => channel.id === market.selectedChannelId) || null;
  const lines = [bold("MemoPack Market"), ""];

  lines.push(bold("Selected Channel"));
  if (!selected) {
    lines.push(dim("  No channel selected. Add one with /channel add <url>."));
  } else {
    lines.push(`  ${selected.name || selected.url}`);
    lines.push(dim(`  ${selected.url}`));
    if (selected.description) {
      for (const line of wrapText(selected.description, width - 2)) lines.push(`  ${line}`);
    }
    const auth = selected.token
      ? `${selected.username || "authenticated"} (${maskSecret(selected.token)})`
      : "not authenticated";
    lines.push(`  auth: ${auth}`);
  }

  lines.push("");
  lines.push(bold("Channels"));
  if (market.channels.length === 0) {
    lines.push(dim("  No channels saved."));
  } else {
    market.channels.forEach((channel, index) => {
      const selectedMarker = index === selectedRow ? ">" : " ";
      const active = channel.id === market.selectedChannelId ? "*" : " ";
      const auth = channel.token ? `auth ${maskSecret(channel.token)}` : "no auth";
      lines.push(truncateVisible(
        `${selectedMarker}${active} ${String(index + 1).padStart(2, " ")}. ${channel.name || channel.url}  ${auth}`,
        width,
      ));
      lines.push(dim(truncateVisible(`     ${channel.url}`, width)));
    });
  }

  lines.push("");
  lines.push(bold(`Local Packs (${market.localPacks.length})`));
  if (market.localPacks.length === 0) {
    lines.push(dim("  No local packs. Save the active pack with /pack save-current <name> | <description>."));
  } else {
    market.localPacks.forEach((pack, index) => {
      const marker = index === selectedRow ? ">" : " ";
      lines.push(truncateVisible(
        `${marker} ${String(index + 1).padStart(2, " ")}. ${pack.name}  ${pack.rules.length} rules, ${pack.memos.length} memos`,
        width,
      ));
      if (pack.description) {
        for (const line of wrapText(pack.description, width - 7)) lines.push(dim(`       ${line}`));
      }
      lines.push(dim(truncateVisible(
        `       id: ${pack.id} | updated ${formatDateTime(pack.updatedAt)} | created ${formatDateTime(pack.createdAt)}`,
        width,
      )));
    });
  }

  lines.push("");
  const search = market.remoteSearch ? ` search "${market.remoteSearch}"` : "";
  const tag = market.remoteTag ? ` tag "${market.remoteTag}"` : "";
  lines.push(bold(`Remote Packs (${market.remotePacks.length}/${market.remoteTotal}, page ${market.remotePage}${search}${tag})`));
  if (market.remotePacks.length === 0) {
    lines.push(dim(selected ? "  No remote results. Fetch with /market remote or /market search <text>." : "  Select a channel to fetch remote packs."));
  } else {
    market.remotePacks.forEach((pack, index) => {
      const marker = index === selectedRow ? ">" : " ";
      lines.push(truncateVisible(
        `${marker} ${String(index + 1).padStart(2, " ")}. ${pack.name}  id: ${pack.id}  ${pack.ruleCount} rules, ${pack.memoCount} memos`,
        width,
      ));
      const meta = [
        pack.author ? `by ${pack.author}` : "",
        pack.updatedAt ? `updated ${formatDateTime(pack.updatedAt)}` : "",
      ].filter(Boolean).join(" | ");
      if (meta) lines.push(dim(truncateVisible(`       ${meta}`, width)));
      if (pack.description) {
        for (const line of wrapText(pack.description, width - 7)) lines.push(dim(`       ${line}`));
      }
    });
  }

  lines.push("");
  lines.push("Use Ctrl-P for local packs, remote packs, and channel pickers.");
  return lines;
}

function helpLines(width: number): string[] {
  const lines = [bold("Help"), ""];
  const categories = [...new Set(DOCUMENTED_COMMANDS.map((command) => command.category))];
  for (const category of categories) {
    if (lines.length > 2) lines.push("");
    lines.push(bold(category));
    for (const command of DOCUMENTED_COMMANDS.filter((item) => item.category === category)) {
      const left = padRightVisible(command.usage, 40);
      const shortcut = command.shortcut ? ` (${command.shortcut})` : "";
      lines.push(truncateVisible(`  ${left} ${command.description}${shortcut}`, width));
    }
  }
  return lines;
}

function fitPromptRegion(
  completionLines: string[],
  promptLines: string[],
  maxHeight: number,
): { completionLines: string[]; promptLines: string[] } {
  if (completionLines.length + promptLines.length <= maxHeight) {
    return { completionLines, promptLines };
  }

  const promptHeight = clamp(promptLines.length, 1, maxHeight);
  const completionHeight = Math.max(0, maxHeight - promptHeight);
  return {
    completionLines: completionLines.slice(0, completionHeight),
    promptLines: promptLines.slice(0, promptHeight),
  };
}

function sidePanelLines(state: AppState, width: number): string[] {
  const selected = state.market.channels.find((channel) => channel.id === state.market.selectedChannelId) || null;
  const nonEmptyMemos = state.pack.memos.filter((memo) => memo.content.trim()).length;
  const lines = [
    bold("Context"),
    "",
    "MemoPack",
    dim(`rules: ${state.pack.rules.length}`),
    dim(`memos: ${nonEmptyMemos}/${Math.max(state.pack.memos.length, state.pack.rules.length)}`),
    "",
    "Channel",
    selected ? truncateVisible(selected.name || selected.url, width) : dim("(none)"),
    selected ? dim(selected.token ? `auth: ${selected.username || "set"} ${maskSecret(selected.token)}` : "auth: missing") : "",
    "",
    "Sessions",
    dim(`${state.sessions.length} saved`),
    "",
    "Config",
    state.config.apiKey ? dim("api key: set") : "api key: missing",
    dim(`model: ${state.config.modelId || "(unset)"}`),
    "",
    "Hints",
    ...viewHints(state.view).map((hint) => dim(hint)),
  ];

  return lines.filter((line) => line !== "").flatMap((line) => wrapText(line, width));
}

function viewHints(view: AppState["view"]): string[] {
  switch (view) {
    case "chat":
      return ["Ctrl-J newline", "PgUp/PgDn scroll"];
    case "memo":
      return ["/rule add", "/compact updates memos"];
    case "sessions":
      return ["Ctrl-P session picker"];
    case "settings":
      return ["/set apiKey", "/set model"];
    case "market":
      return ["Pickers: packs/channels", "/market remote"];
    case "help":
      return ["Type / or Ctrl-P"];
  }
}

function selectedChannelName(state: AppState): string {
  const selected = state.market.channels.find((channel) => channel.id === state.market.selectedChannelId);
  return selected ? selected.name || selected.url : "";
}

function promptSegments(text: string, width: number): PromptSegment[] {
  const safeWidth = Math.max(1, width);
  if (!text) return [{ text: "", start: 0, end: 0 }];

  const segments: PromptSegment[] = [];
  const lines = text.split("\n");
  let position = 0;

  lines.forEach((line, lineIndex) => {
    if (!line) {
      segments.push({ text: "", start: position, end: position });
    } else {
      for (let index = 0; index < line.length; index += safeWidth) {
        const chunk = line.slice(index, index + safeWidth);
        segments.push({
          text: chunk,
          start: position + index,
          end: position + index + chunk.length,
        });
      }
    }
    position += line.length;
    if (lineIndex < lines.length - 1) position += 1;
  });

  return segments;
}

function confirmationLines(overlay: ConfirmationOverlay, width: number, height: number): string[] {
  const innerWidth = Math.max(1, width - 4);
  const lines = [
    boxTop(width, overlay.title),
    ...wrapText(overlay.message, innerWidth).map((line) => boxLine(line, innerWidth)),
  ];
  while (lines.length < height - 2) lines.push(boxLine("", innerWidth));
  lines.push(boxLine(dim(`Enter/Y ${overlay.confirmLabel} | Esc/N cancel`), innerWidth));
  lines.push(boxBottom(width));
  return lines.slice(0, height);
}

function overlayTitle(kind: PickerOverlayKind): string {
  switch (kind) {
    case "command-palette":
      return "Command Palette";
    case "session-picker":
      return "Sessions";
    case "local-pack-picker":
      return "Local MemoPacks";
    case "remote-pack-picker":
      return "Remote MemoPacks";
    case "channel-picker":
      return "Channels";
  }
}

function emptyOverlayMessage(kind: PickerOverlayKind): string {
  switch (kind) {
    case "command-palette":
      return "No matching commands.";
    case "session-picker":
      return "No sessions. Use /save after a chat.";
    case "local-pack-picker":
      return "No local packs. Use /pack save-current <name> | <description>.";
    case "remote-pack-picker":
      return "No remote packs. Fetch with /market remote or /market search <text>.";
    case "channel-picker":
      return "No channels configured. Use /channel add <url>.";
  }
}

function overlayFooter(kind: PickerOverlayKind, count: number): string {
  const base = `${count} shown | Up/Down select | Enter open`;
  switch (kind) {
    case "session-picker":
      return `${base} | Ctrl-D delete`;
    case "local-pack-picker":
      return `${base} | Ctrl-D delete`;
    case "remote-pack-picker":
      return `${base} | Ctrl-D delete`;
    case "channel-picker":
      return `${base} | Ctrl-D remove`;
    case "command-palette":
      return `${base} | Esc close`;
  }
}

function boxTop(width: number, title: string): string {
  const label = ` ${title} `;
  const remaining = Math.max(0, width - label.length - 2);
  return `+${label}${repeat("-", remaining)}+`;
}

function boxBottom(width: number): string {
  return `+${repeat("-", Math.max(0, width - 2))}+`;
}

function boxLine(value: string, innerWidth: number): string {
  return `| ${padRightVisible(truncateVisible(value, innerWidth), innerWidth)} |`;
}

function lowerChunk(chunk: string): string {
  return sanitizePlainText(chunk || "").toLowerCase();
}

function bold(value: string): string {
  return color("1", value);
}

function dim(value: string): string {
  return color("2", value);
}

function cyan(value: string): string {
  return color("36", value);
}

function inverse(value: string): string {
  return color("7", value);
}

function color(code: string, value: string): string {
  if (!colorEnabled) return value;
  return `\x1b[${code}m${value}\x1b[0m`;
}
