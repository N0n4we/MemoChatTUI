import { EventEmitter } from "node:events";
import { defaultConfig, defaultPack, maskSecret, normalizeBaseUrl, parseBoolean } from "./config.ts";
import { chatCompletion } from "./llm.ts";
import { JsonStore } from "./store.ts";
import type { AppConfig, AppState, ChatMessage, ChatSession, Memo, MemoPack, MemoRule, StoredMessage, ViewName } from "./types.ts";
import { splitFirst } from "./utils.ts";

export class AppController extends EventEmitter {
  readonly store: JsonStore;
  state: AppState;

  constructor(store = new JsonStore()) {
    super();
    this.store = store;
    this.state = {
      config: { ...defaultConfig },
      pack: clonePack(defaultPack),
      messages: [],
      sessions: [],
      currentSessionId: store.createSessionId(),
      view: "chat",
      status: "Starting...",
      busy: false,
      compacting: false,
      compactProgress: 0,
      compactTotal: 0,
      showReasoning: false,
    };
  }

  async initialize(): Promise<void> {
    await this.store.ensure();
    const [config, pack, messages, sessions] = await Promise.all([
      this.store.loadConfig(),
      this.store.loadPack(),
      this.store.loadCurrentMessages(),
      this.store.listSessions(),
    ]);

    this.state.config = config;
    this.state.pack = pack;
    this.state.messages = messages;
    this.state.sessions = sessions;
    this.state.status = `Data: ${this.store.paths.root}`;
    this.emitRender();
  }

  async submit(input: string): Promise<void> {
    const trimmed = input.trim();
    if (!trimmed) return;

    if (trimmed.startsWith("/")) {
      await this.handleCommand(trimmed.slice(1));
      return;
    }

    await this.sendMessage(trimmed);
  }

  async refreshSessions(): Promise<void> {
    this.state.sessions = await this.store.listSessions();
    this.emitRender();
  }

  private async handleCommand(raw: string): Promise<void> {
    const [command, rest] = splitFirst(raw);
    const name = command.toLowerCase();

    try {
      switch (name) {
        case "?":
        case "help":
          this.state.view = "help";
          this.setStatus("Help");
          return;
        case "chat":
          this.switchView("chat");
          return;
        case "memo":
          if (rest) await this.handleMemoCommand(rest);
          else this.switchView("memo");
          return;
        case "sessions":
        case "history":
          await this.refreshSessions();
          this.switchView("sessions");
          return;
        case "settings":
        case "config":
          this.switchView("settings");
          return;
        case "set":
          await this.handleSet(rest);
          return;
        case "system":
          await this.setSystemPrompt(rest);
          return;
        case "rule":
          await this.handleRule(rest);
          return;
        case "compact":
          await this.compactMemory();
          return;
        case "new":
          await this.newChat();
          return;
        case "save":
          await this.saveCurrentSession();
          return;
        case "load":
          await this.loadSession(rest);
          return;
        case "delete":
        case "del":
          await this.deleteSession(rest);
          return;
        case "clear":
          await this.clearChat();
          return;
        case "reasoning":
          this.state.showReasoning = !this.state.showReasoning;
          this.setStatus(`Reasoning display: ${this.state.showReasoning ? "on" : "off"}`);
          return;
        case "quit":
        case "exit":
          this.emit("quit");
          return;
        default:
          this.setStatus(`Unknown command: /${name}. Use /help.`);
      }
    } catch (error) {
      this.setStatus(errorToMessage(error));
    }
  }

  private switchView(view: ViewName): void {
    this.state.view = view;
    this.setStatus(`View: ${view}`);
  }

  private async handleSet(rest: string): Promise<void> {
    const [keyRaw, valueRaw] = splitFirst(rest);
    const key = keyRaw.toLowerCase();
    const value = valueRaw.trim();

    if (!key || !value) {
      this.state.view = "settings";
      this.setStatus("Usage: /set apiKey|baseUrl|model|compactModel|reasoning|compactReasoning <value>");
      return;
    }

    const config: AppConfig = { ...this.state.config };
    switch (key) {
      case "apikey":
      case "api-key":
      case "key":
        config.apiKey = value;
        break;
      case "baseurl":
      case "base-url":
      case "url":
        config.baseUrl = normalizeBaseUrl(value);
        break;
      case "model":
      case "modelid":
      case "model-id":
        config.modelId = value;
        break;
      case "compactmodel":
      case "compact-model":
      case "compactmodelid":
      case "compact-model-id":
        config.compactModelId = value;
        break;
      case "reasoning": {
        const parsed = parseBoolean(value);
        if (parsed === null) throw new Error("reasoning must be on/off");
        config.reasoningEnabled = parsed;
        break;
      }
      case "compactreasoning":
      case "compact-reasoning": {
        const parsed = parseBoolean(value);
        if (parsed === null) throw new Error("compactReasoning must be on/off");
        config.compactReasoningEnabled = parsed;
        break;
      }
      default:
        throw new Error(`Unknown setting: ${keyRaw}`);
    }

    this.state.config = config;
    await this.store.saveConfig(config);
    this.state.view = "settings";
    this.setStatus(`Saved setting: ${keyRaw}`);
  }

  private async setSystemPrompt(value: string): Promise<void> {
    this.state.pack = { ...this.state.pack, systemPrompt: value.trim() };
    await this.store.savePack(this.state.pack);
    this.state.view = "memo";
    this.setStatus("System prompt saved");
  }

  private async handleRule(rest: string): Promise<void> {
    const [actionRaw, body] = splitFirst(rest);
    const action = actionRaw.toLowerCase();

    if (action === "add") {
      const delimiter = body.indexOf("|");
      if (delimiter === -1) throw new Error("Usage: /rule add <title> | <update rule>");
      const title = body.slice(0, delimiter).trim();
      const updateRule = body.slice(delimiter + 1).trim();
      if (!title || !updateRule) throw new Error("Rule title and update rule are required");

      const rules = [...this.state.pack.rules, { title, updateRule }];
      const memos = [...this.state.pack.memos, { title, content: "" }];
      this.state.pack = { ...this.state.pack, rules, memos };
      await this.store.savePack(this.state.pack);
      this.state.view = "memo";
      this.setStatus(`Rule added: ${title}`);
      return;
    }

    if (action === "del" || action === "delete" || action === "remove") {
      const index = this.parseOneBasedIndex(body, this.state.pack.rules.length, "rule");
      const rules = this.state.pack.rules.filter((_, i) => i !== index);
      const memos = this.state.pack.memos.filter((_, i) => i !== index);
      this.state.pack = { ...this.state.pack, rules, memos };
      await this.store.savePack(this.state.pack);
      this.state.view = "memo";
      this.setStatus(`Rule ${index + 1} deleted`);
      return;
    }

    throw new Error("Usage: /rule add <title> | <update rule> or /rule del <index>");
  }

  private async handleMemoCommand(rest: string): Promise<void> {
    const [actionRaw, body] = splitFirst(rest);
    const action = actionRaw.toLowerCase();

    if (action === "set") {
      const [indexRaw, content] = splitFirst(body);
      const index = this.parseOneBasedIndex(indexRaw, Math.max(this.state.pack.rules.length, this.state.pack.memos.length), "memo");
      const memos = normalizeMemos(this.state.pack.rules, this.state.pack.memos);
      memos[index] = { title: memos[index]?.title || this.state.pack.rules[index]?.title || `Memo ${index + 1}`, content };
      this.state.pack = { ...this.state.pack, memos };
      await this.store.savePack(this.state.pack);
      this.state.view = "memo";
      this.setStatus(`Memo ${index + 1} saved`);
      return;
    }

    if (action === "clear") {
      const index = this.parseOneBasedIndex(body, this.state.pack.memos.length, "memo");
      const memos = [...this.state.pack.memos];
      memos[index] = { ...memos[index], content: "" };
      this.state.pack = { ...this.state.pack, memos };
      await this.store.savePack(this.state.pack);
      this.state.view = "memo";
      this.setStatus(`Memo ${index + 1} cleared`);
      return;
    }

    throw new Error("Usage: /memo set <index> <content> or /memo clear <index>");
  }

  private async sendMessage(text: string): Promise<void> {
    if (this.state.busy) {
      this.setStatus("Busy. Wait for the current request to finish.");
      return;
    }

    if (!this.state.config.apiKey.trim()) {
      this.state.view = "settings";
      this.setStatus("Set an API key first: /set apiKey <key>");
      return;
    }

    const userMessage: StoredMessage = { role: "user", content: text };
    const assistantMessage: StoredMessage = { role: "assistant", content: "", reasoning: "" };
    this.state.messages = [...this.state.messages, userMessage, assistantMessage];
    this.state.busy = true;
    this.state.view = "chat";
    this.setStatus("Sending...");

    const assistantIndex = this.state.messages.length - 1;
    const history = this.buildChatHistory(this.state.messages.slice(0, -1));

    try {
      const result = await chatCompletion(
        history,
        {
          baseUrl: this.state.config.baseUrl,
          apiKey: this.state.config.apiKey,
          modelId: this.state.config.modelId,
          reasoningEnabled: this.state.config.reasoningEnabled,
        },
        {
          onContent: (chunk) => {
            const next = [...this.state.messages];
            next[assistantIndex] = {
              ...next[assistantIndex],
              content: `${next[assistantIndex]?.content || ""}${chunk}`,
            };
            this.state.messages = next;
            this.emitRender();
          },
          onReasoning: (chunk) => {
            const next = [...this.state.messages];
            next[assistantIndex] = {
              ...next[assistantIndex],
              reasoning: `${next[assistantIndex]?.reasoning || ""}${chunk}`,
            };
            this.state.messages = next;
            this.emitRender();
          },
        },
      );

      const next = [...this.state.messages];
      next[assistantIndex] = { role: "assistant", content: result.content, reasoning: result.reasoning };
      this.state.messages = next;
      await this.store.saveCurrentMessages(this.state.messages);
      this.setStatus("Ready");
    } catch (error) {
      const next = [...this.state.messages];
      next[assistantIndex] = { role: "assistant", content: `Error: ${errorToMessage(error)}` };
      this.state.messages = next;
      await this.store.saveCurrentMessages(this.state.messages);
      this.setStatus(errorToMessage(error));
    } finally {
      this.state.busy = false;
      this.emitRender();
    }
  }

  private async compactMemory(): Promise<void> {
    if (this.state.busy || this.state.compacting) {
      this.setStatus("Busy. Wait for the current request to finish.");
      return;
    }

    if (this.state.messages.length === 0) {
      this.setStatus("No chat messages to compact");
      return;
    }

    if (this.state.pack.rules.length === 0) {
      this.state.view = "memo";
      this.setStatus("Add memo rules first: /rule add <title> | <update rule>");
      return;
    }

    if (!this.state.config.apiKey.trim()) {
      this.state.view = "settings";
      this.setStatus("Set an API key first: /set apiKey <key>");
      return;
    }

    this.state.busy = true;
    this.state.compacting = true;
    this.state.compactProgress = 0;
    this.state.compactTotal = this.state.pack.rules.length;
    this.state.view = "memo";
    this.setStatus("Compacting memory...");

    const chatHistory = this.state.messages
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n");
    const memos = normalizeMemos(this.state.pack.rules, this.state.pack.memos);

    try {
      for (let i = 0; i < this.state.pack.rules.length; i++) {
        const rule = this.state.pack.rules[i];
        const current = memos[i]?.content || "(empty)";
        const prompt = buildCompactPrompt(rule, current, chatHistory);

        try {
          const result = await chatCompletion(
            [{ role: "user", content: prompt }],
            {
              baseUrl: this.state.config.baseUrl,
              apiKey: this.state.config.apiKey,
              modelId: this.state.config.compactModelId || this.state.config.modelId,
              reasoningEnabled: this.state.config.compactReasoningEnabled,
            },
          );
          memos[i] = { title: rule.title, content: result.content.trim() };
        } catch (error) {
          memos[i] = { title: rule.title, content: memos[i]?.content || "" };
          this.state.status = `Compact failed for ${rule.title}: ${errorToMessage(error)}`;
        }

        this.state.compactProgress = i + 1;
        this.emitRender();
      }

      this.state.pack = { ...this.state.pack, memos };
      await this.store.savePack(this.state.pack);
      await this.store.archiveMessages(this.state.messages);
      this.state.messages = [];
      await this.store.saveCurrentMessages([]);
      await this.refreshSessions();
      this.setStatus("Memory compacted and chat archived");
    } finally {
      this.state.busy = false;
      this.state.compacting = false;
      this.emitRender();
    }
  }

  private async newChat(): Promise<void> {
    await this.saveCurrentSession(false);
    this.state.messages = [];
    this.state.currentSessionId = this.store.createSessionId();
    await this.store.saveCurrentMessages([]);
    this.state.view = "chat";
    this.setStatus("New chat");
  }

  private async clearChat(): Promise<void> {
    this.state.messages = [];
    await this.store.saveCurrentMessages([]);
    this.state.view = "chat";
    this.setStatus("Chat cleared");
  }

  private async saveCurrentSession(report = true): Promise<void> {
    if (this.state.messages.length === 0) {
      if (report) this.setStatus("No messages to save");
      return;
    }
    const saved = await this.store.saveSession(this.state.currentSessionId, this.state.messages);
    await this.refreshSessions();
    if (report) this.setStatus(`Saved session: ${saved.title}`);
  }

  private async loadSession(value: string): Promise<void> {
    await this.saveCurrentSession(false);
    await this.refreshSessions();
    const session = this.resolveSession(value);
    if (!session) throw new Error("Session not found. Use /sessions.");

    const loaded = await this.store.loadSession(session.id);
    if (!loaded) throw new Error(`Session not found: ${session.id}`);

    this.state.currentSessionId = session.id;
    this.state.messages = loaded.messages;
    await this.store.saveCurrentMessages(this.state.messages);
    this.state.view = "chat";
    this.setStatus(`Loaded session: ${loaded.meta.title}`);
  }

  private async deleteSession(value: string): Promise<void> {
    await this.refreshSessions();
    const session = this.resolveSession(value);
    if (!session) throw new Error("Session not found. Use /sessions.");

    const deleted = await this.store.deleteSession(session.id);
    if (this.state.currentSessionId === session.id) {
      this.state.currentSessionId = this.store.createSessionId();
      this.state.messages = [];
      await this.store.saveCurrentMessages([]);
    }

    await this.refreshSessions();
    this.state.view = "sessions";
    this.setStatus(deleted ? `Deleted session: ${session.title}` : "Session already absent");
  }

  private buildChatHistory(messages: StoredMessage[]): ChatMessage[] {
    const history: ChatMessage[] = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    const systemParts: string[] = [];
    const memos = this.state.pack.memos.filter((memo) => memo.content.trim());
    if (memos.length > 0) {
      systemParts.push(memos.map((memo) => `[${memo.title}]: ${memo.content}`).join("\n"));
    }
    if (this.state.pack.systemPrompt.trim()) {
      systemParts.push(this.state.pack.systemPrompt.trim());
    }
    if (systemParts.length > 0) {
      history.unshift({ role: "system", content: systemParts.join("\n\n") });
    }

    return history;
  }

  private parseOneBasedIndex(value: string, length: number, label: string): number {
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > length) {
      throw new Error(`Invalid ${label} index. Expected 1-${Math.max(length, 1)}.`);
    }
    return parsed - 1;
  }

  private resolveSession(value: string): ChatSession | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const index = Number.parseInt(trimmed, 10);
    if (Number.isFinite(index)) {
      if (index < 1 || index > this.state.sessions.length) return null;
      return this.state.sessions[index - 1] || null;
    }

    return this.state.sessions.find((session) => session.id === trimmed) || null;
  }

  private setStatus(status: string): void {
    this.state.status = status;
    this.emitRender();
  }

  private emitRender(): void {
    this.emit("render", this.state);
  }
}

function clonePack(pack: MemoPack): MemoPack {
  return {
    systemPrompt: pack.systemPrompt,
    rules: pack.rules.map((rule) => ({ ...rule })),
    memos: pack.memos.map((memo) => ({ ...memo })),
  };
}

function normalizeMemos(rules: MemoRule[], memos: Memo[]): Memo[] {
  return rules.map((rule, index) => ({
    title: memos[index]?.title || rule.title,
    content: memos[index]?.content || "",
  }));
}

function buildCompactPrompt(rule: MemoRule, currentContent: string, chatHistory: string): string {
  return `You are a memo manager. Update a single memo based on the chat history.

Memo title: ${rule.title}
Update rule: ${rule.updateRule}
Current content: ${currentContent}

Chat history:
${chatHistory}

Output ONLY the updated memo content as plain text. If there is nothing relevant in the chat, return the current content as-is.`;
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function describeConfig(config: AppConfig): string[] {
  return [
    `baseUrl: ${config.baseUrl || "(empty)"}`,
    `apiKey: ${maskSecret(config.apiKey)}`,
    `model: ${config.modelId || "(empty)"}`,
    `compactModel: ${config.compactModelId || "(same as model)"}`,
    `reasoning: ${config.reasoningEnabled ? "on" : "off"}`,
    `compactReasoning: ${config.compactReasoningEnabled ? "on" : "off"}`,
  ];
}
