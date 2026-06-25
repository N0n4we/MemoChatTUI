import readline from "node:readline";
import { describeConfig, AppController } from "./app.ts";
import type { AppState, StoredMessage } from "./types.ts";
import { clamp, formatDateTime, padRightVisible, repeat, truncateVisible, wrapText } from "./utils.ts";

type Keypress = {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  sequence?: string;
};

const colorEnabled = !process.env.NO_COLOR;

export class TerminalUi {
  private readonly app: AppController;
  private input = "";
  private scrollOffset = 0;
  private followBottom = true;
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

    process.stdout.write("\x1b[?1049h\x1b[?25l");
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

    switch (key.name) {
      case "return":
      case "enter":
        void this.submitInput();
        return;
      case "backspace":
        this.input = this.input.slice(0, -1);
        this.scheduleRender();
        return;
      case "escape":
        this.input = "";
        this.scheduleRender();
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
      case "up":
        this.followBottom = false;
        this.scrollOffset = Math.max(0, this.scrollOffset - 1);
        this.scheduleRender();
        return;
      case "down":
        this.scrollOffset += 1;
        this.scheduleRender();
        return;
      case "home":
        this.followBottom = false;
        this.scrollOffset = 0;
        this.scheduleRender();
        return;
      case "end":
        this.followBottom = true;
        this.scheduleRender();
        return;
      default:
        break;
    }

    if (key.ctrl || key.meta) return;
    if (chunk && chunk >= " " && chunk !== "\x7f") {
      this.input += chunk;
      this.scheduleRender();
    }
  };

  private async submitInput(): Promise<void> {
    const value = this.input;
    this.input = "";
    this.followBottom = true;
    this.scheduleRender();
    await this.app.submit(value);
  }

  private render(): void {
    if (!this.running) return;

    const state = this.app.state;
    const width = Math.max(40, process.stdout.columns || 80);
    const height = Math.max(12, process.stdout.rows || 24);
    const contentHeight = Math.max(1, height - 4);
    const contentLines = buildContentLines(state, width);
    const maxScroll = Math.max(0, contentLines.length - contentHeight);

    if (this.followBottom) {
      this.scrollOffset = maxScroll;
    } else {
      this.scrollOffset = clamp(this.scrollOffset, 0, maxScroll);
      if (this.scrollOffset >= maxScroll) this.followBottom = true;
    }

    const visible = contentLines.slice(this.scrollOffset, this.scrollOffset + contentHeight);
    while (visible.length < contentHeight) visible.push("");

    const header = this.headerLine(state, width);
    const separator = dim(repeat("-", width));
    const status = this.statusLine(state, width, maxScroll);
    const input = this.inputLine(width);

    const frame = [
      header,
      separator,
      ...visible.map((line) => padRightVisible(line, width)),
      status,
      input,
    ];

    process.stdout.write(`\x1b[H${frame.join("\n")}`);
  }

  private headerLine(state: AppState, width: number): string {
    const busy = state.busy ? " busy" : "";
    const compact = state.compacting ? ` compact ${state.compactProgress}/${state.compactTotal}` : "";
    const title = bold(`MemoChatTUI`) + dim(` | ${state.view}${busy}${compact}`);
    const model = dim(`model: ${state.config.modelId || "(unset)"}`);
    const gap = Math.max(1, width - strip(title).length - strip(model).length);
    return truncateVisible(`${title}${repeat(" ", gap)}${model}`, width);
  }

  private statusLine(state: AppState, width: number, maxScroll: number): string {
    const scroll = maxScroll > 0 ? ` scroll ${this.scrollOffset + 1}/${maxScroll + 1}` : "";
    const help = "Enter sends | /help | PgUp/PgDn scroll | Ctrl-C quits";
    const line = `${state.status}${scroll}`;
    const gap = Math.max(1, width - strip(line).length - help.length);
    return inverse(truncateVisible(`${line}${repeat(" ", gap)}${help}`, width));
  }

  private inputLine(width: number): string {
    const prefix = "> ";
    const maxInput = Math.max(1, width - prefix.length);
    const input = this.input.length > maxInput ? this.input.slice(this.input.length - maxInput) : this.input;
    return `${prefix}${padRightVisible(input, maxInput)}`;
  }
}

function buildContentLines(state: AppState, width: number): string[] {
  switch (state.view) {
    case "memo":
      return memoLines(state, width);
    case "sessions":
      return sessionLines(state, width);
    case "settings":
      return settingsLines(state, width);
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
    lines.push("Use /set apiKey <key>, /set baseUrl <url>, /set model <id> before chatting.");
    return lines;
  }

  state.messages.forEach((message, index) => {
    appendMessage(lines, message, width, index === state.messages.length - 1 && state.busy);
    if (state.showReasoning && message.reasoning) {
      for (const line of wrapText(message.reasoning, width - 4)) {
        lines.push(dim(`  reasoning: ${line}`));
      }
    }
    lines.push("");
  });

  return lines;
}

function appendMessage(lines: string[], message: StoredMessage, width: number, pending: boolean): void {
  const label = message.role === "user" ? "You" : "AI";
  const text = message.content || (pending ? "..." : "");
  const prefix = `${label}: `;
  const wrapWidth = Math.max(10, width - prefix.length);
  const wrapped = wrapText(text, wrapWidth);

  if (message.role === "user") {
    lines.push(`${bold(prefix)}${wrapped[0] || ""}`);
  } else {
    lines.push(`${cyan(prefix)}${wrapped[0] || ""}`);
  }

  for (const line of wrapped.slice(1)) {
    lines.push(`${repeat(" ", prefix.length)}${line}`);
  }
}

function memoLines(state: AppState, width: number): string[] {
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
      lines.push(`  ${index + 1}. ${rule.title}`);
      for (const line of wrapText(rule.updateRule, width - 6)) lines.push(dim(`     ${line}`));
    });
  }

  lines.push("");
  lines.push(bold("Memos"));
  if (state.pack.memos.length === 0) {
    lines.push(dim("  No memo content yet. Use /compact after a chat."));
  } else {
    state.pack.memos.forEach((memo, index) => {
      lines.push(`  ${index + 1}. ${memo.title}`);
      const content = memo.content.trim() || "(empty)";
      for (const line of wrapText(content, width - 6)) lines.push(`     ${line}`);
    });
  }

  return lines;
}

function sessionLines(state: AppState, width: number): string[] {
  const lines = [bold("Sessions"), ""];
  if (state.sessions.length === 0) {
    lines.push(dim("No saved sessions."));
    lines.push("Use /save to save the current chat.");
    return lines;
  }

  state.sessions.forEach((session, index) => {
    const active = session.id === state.currentSessionId ? "*" : " ";
    const title = truncateVisible(session.title || "Untitled", Math.max(10, width - 40));
    lines.push(
      `${active} ${String(index + 1).padStart(2, " ")}. ${title}  ${session.messageCount} msgs  ${formatDateTime(session.updatedAt)}`,
    );
  });

  lines.push("");
  lines.push("Use /load <number> or /delete <number>.");
  return lines;
}

function settingsLines(state: AppState, width: number): string[] {
  const lines = [bold("Settings"), ""];
  for (const line of describeConfig(state.config)) {
    lines.push(`  ${line}`);
  }
  lines.push("");
  lines.push("Commands:");
  const commands = [
    "/set apiKey <key>",
    "/set baseUrl https://example.com/v1",
    "/set model <model-id>",
    "/set compactModel <model-id>",
    "/set reasoning on|off",
    "/set compactReasoning on|off",
  ];
  for (const command of commands) lines.push(`  ${truncateVisible(command, width - 2)}`);
  return lines;
}

function helpLines(width: number): string[] {
  const commands = [
    ["/chat", "show chat view"],
    ["/memo", "show memo view"],
    ["/sessions", "show saved sessions"],
    ["/settings", "show settings"],
    ["/set apiKey <key>", "save API key"],
    ["/set baseUrl <url>", "save OpenAI-compatible API base URL"],
    ["/set model <id>", "save chat model"],
    ["/system <text>", "replace system prompt"],
    ["/rule add <title> | <rule>", "add a memo update rule"],
    ["/rule del <index>", "delete a memo rule"],
    ["/memo set <index> <text>", "manually set memo content"],
    ["/compact", "update memos from current chat and archive the chat"],
    ["/new", "save current session and start a blank chat"],
    ["/save", "save current chat as a session"],
    ["/load <number>", "load session from /sessions"],
    ["/delete <number>", "delete session from /sessions"],
    ["/reasoning", "toggle reasoning display"],
    ["/clear", "clear current chat without saving"],
    ["/quit", "exit"],
  ];

  const lines = [bold("Help"), ""];
  for (const [command, description] of commands) {
    const left = padRightVisible(command, 30);
    lines.push(truncateVisible(`  ${left} ${description}`, width));
  }
  return lines;
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

function strip(value: string): string {
  return value.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
}
