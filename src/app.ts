import { EventEmitter } from "node:events";
import { defaultConfig, defaultPack, maskSecret, normalizeBaseUrl, parseBoolean } from "./config.ts";
import { chatCompletion } from "./llm.ts";
import { deleteRemoteMemoPack, fetchServerInfo, getMe, listMemoPacks, loginOnServer, publishMemoPack, registerOnServer } from "./market-api.ts";
import { createLocalMemoPack, resolveUserPath, splitNameDescription, toPublishRequest, validateMemoPack } from "./market.ts";
import { JsonStore } from "./store.ts";
import type { AppConfig, AppState, ChatMessage, ChatSession, LocalMemoPack, MarketChannel, Memo, MemoPack, MemoRule, RemoteMemoPack, StoredMessage, ViewName } from "./types.ts";
import { generateId, splitFirst } from "./utils.ts";

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
      market: {
        channels: [],
        selectedChannelId: "",
        localPacks: [],
        remotePacks: [],
        remoteTotal: 0,
        remotePage: 1,
        remoteLimit: 20,
        remoteSearch: "",
        remoteTag: "",
      },
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
    const [config, pack, messages, sessions, channels, localPacks] = await Promise.all([
      this.store.loadConfig(),
      this.store.loadPack(),
      this.store.loadCurrentMessages(),
      this.store.listSessions(),
      this.store.loadChannels(),
      this.store.listLocalPacks(),
    ]);

    this.state.config = config;
    this.state.pack = pack;
    this.state.messages = messages;
    this.state.sessions = sessions;
    this.state.market = {
      ...this.state.market,
      channels: channels.channels,
      selectedChannelId: channels.selectedChannelId,
      localPacks,
    };
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
        case "market":
          await this.handleMarket(rest);
          return;
        case "channel":
          await this.handleChannel(rest);
          return;
        case "pack":
          await this.handlePack(rest);
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

  private async handleMarket(rest: string): Promise<void> {
    const [actionRaw, body] = splitFirst(rest);
    const action = actionRaw.toLowerCase();

    if (!action) {
      await this.refreshLocalPacks();
      this.state.view = "market";
      this.setStatus("Market");
      return;
    }

    if (action === "local") {
      await this.refreshLocalPacks();
      this.state.view = "market";
      this.setStatus("Local packs refreshed");
      return;
    }

    if (action === "remote" || action === "refresh") {
      const page = Number.parseInt(body.trim(), 10);
      await this.fetchRemotePacks({ page: Number.isFinite(page) ? page : 1 });
      return;
    }

    if (action === "search") {
      this.state.market.remoteSearch = body.trim();
      await this.fetchRemotePacks({ page: 1 });
      return;
    }

    if (action === "tag") {
      this.state.market.remoteTag = body.trim();
      await this.fetchRemotePacks({ page: 1 });
      return;
    }

    if (action === "install") {
      await this.installRemotePack(body);
      return;
    }

    if (action === "delete" || action === "del") {
      await this.deleteRemotePack(body);
      return;
    }

    throw new Error("Usage: /market [local|remote|search <q>|tag <tag>|install <id>|delete <id>]");
  }

  private async handleChannel(rest: string): Promise<void> {
    const [actionRaw, body] = splitFirst(rest);
    const action = actionRaw.toLowerCase();

    if (!action || action === "list") {
      this.state.view = "market";
      this.setStatus("Channels");
      return;
    }

    if (action === "add") {
      const url = body.trim().replace(/\/+$/, "");
      if (!url) throw new Error("Usage: /channel add <url>");
      await this.withBusy("Adding channel...", async () => {
        const info = await fetchServerInfo(url);
        const existing = this.state.market.channels.find((channel) => channel.url === url);
        const channel: MarketChannel = {
          id: existing?.id || generateId("channel"),
          url,
          token: existing?.token || "",
          username: existing?.username || "",
          name: info.name || url,
          description: info.description || "",
        };
        const channels = existing
          ? this.state.market.channels.map((item) => item.id === existing.id ? channel : item)
          : [...this.state.market.channels, channel];
        await this.saveChannels(channels, channel.id);
        this.state.view = "market";
        this.state.status = `Added channel: ${channel.name}`;
      });
      return;
    }

    if (action === "select") {
      const channel = this.resolveChannel(body);
      if (!channel) throw new Error("Channel not found");
      await this.saveChannels(this.state.market.channels, channel.id);
      this.state.view = "market";
      this.setStatus(`Selected channel: ${channel.name}`);
      return;
    }

    if (action === "remove" || action === "delete" || action === "del") {
      const channel = this.resolveChannel(body);
      if (!channel) throw new Error("Channel not found");
      const channels = this.state.market.channels.filter((item) => item.id !== channel.id);
      await this.saveChannels(channels, channels[0]?.id || "");
      this.state.view = "market";
      this.setStatus(`Removed channel: ${channel.name}`);
      return;
    }

    if (action === "login" || action === "register") {
      const [username, password] = splitFirst(body);
      if (!username || !password) throw new Error(`Usage: /channel ${action} <username> <password>`);
      const channel = this.requireSelectedChannel();
      await this.withBusy(`${action === "login" ? "Logging in" : "Registering"}...`, async () => {
        const user = action === "login"
          ? await loginOnServer(channel.url, username, password)
          : await registerOnServer(channel.url, username, password);
        const updated = {
          ...channel,
          username: user.username || username,
          token: user.token || channel.token,
        };
        await this.replaceChannel(updated);
        this.state.view = "market";
        this.state.status = `${action === "login" ? "Logged in" : "Registered"} as ${updated.username}`;
      });
      return;
    }

    if (action === "me" || action === "status") {
      const channel = this.requireAuthenticatedChannel();
      await this.withBusy("Checking account...", async () => {
        const user = await getMe(channel.url, channel.token);
        await this.replaceChannel({ ...channel, username: user.username || channel.username });
        this.state.view = "market";
        this.state.status = `Authenticated as ${user.username || channel.username}`;
      });
      return;
    }

    throw new Error("Usage: /channel [list|add <url>|select <id>|remove <id>|login <u> <p>|register <u> <p>|me]");
  }

  private async handlePack(rest: string): Promise<void> {
    const [actionRaw, body] = splitFirst(rest);
    const action = actionRaw.toLowerCase();

    if (!action || action === "list") {
      await this.refreshLocalPacks();
      this.state.view = "market";
      this.setStatus("Local packs");
      return;
    }

    if (action === "save-current") {
      const { name, description } = splitNameDescription(body);
      if (!name) throw new Error("Usage: /pack save-current <name> | <description>");
      const pack = createLocalMemoPack(name, description, this.state.pack);
      await this.store.saveLocalPack(pack);
      await this.refreshLocalPacks();
      this.state.view = "market";
      this.setStatus(`Saved local pack: ${pack.name}`);
      return;
    }

    if (action === "install") {
      const pack = this.resolveLocalPack(body);
      if (!pack) throw new Error("Local pack not found");
      this.state.pack = memoPackOnly(pack);
      await this.store.savePack(this.state.pack);
      this.state.view = "memo";
      this.setStatus(`Installed local pack: ${pack.name}`);
      return;
    }

    if (action === "delete" || action === "del" || action === "remove") {
      const pack = this.resolveLocalPack(body);
      if (!pack) throw new Error("Local pack not found");
      await this.store.deleteLocalPack(pack.id);
      await this.refreshLocalPacks();
      this.state.view = "market";
      this.setStatus(`Deleted local pack: ${pack.name}`);
      return;
    }

    if (action === "import") {
      const filePath = resolveUserPath(body);
      const pack = await this.store.importLocalPack(filePath);
      await this.refreshLocalPacks();
      this.state.view = "market";
      this.setStatus(`Imported pack: ${pack.name}`);
      return;
    }

    if (action === "export") {
      const [target, pathText] = splitFirst(body);
      if (!target || !pathText) throw new Error("Usage: /pack export active|<id> <path>");
      const filePath = resolveUserPath(pathText);
      if (target === "active") {
        validateMemoPack(this.state.pack);
        await this.store.exportMemoPack(filePath, { ...this.state.pack, name: "Active MemoPack", description: "" });
        this.setStatus(`Exported active pack to ${filePath}`);
        return;
      }
      const pack = this.resolveLocalPack(target);
      if (!pack) throw new Error("Local pack not found");
      await this.store.exportMemoPack(filePath, pack);
      this.setStatus(`Exported ${pack.name} to ${filePath}`);
      return;
    }

    if (action === "publish") {
      const channel = this.requireAuthenticatedChannel();
      const target = body.trim() || "active";
      const pack = target === "active"
        ? { ...this.state.pack, name: "Active MemoPack", description: "" }
        : this.resolveLocalPack(target);
      if (!pack) throw new Error("Local pack not found");
      validateMemoPack(pack);
      await this.withBusy("Publishing pack...", async () => {
        await publishMemoPack(channel.url, channel.token, toPublishRequest(pack));
        this.state.view = "market";
        this.state.status = `Published pack to ${channel.name}`;
      });
      return;
    }

    throw new Error("Usage: /pack [list|save-current|install|delete|import|export|publish]");
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

  private async refreshLocalPacks(): Promise<void> {
    this.state.market.localPacks = await this.store.listLocalPacks();
    this.emitRender();
  }

  private async fetchRemotePacks(options: { page?: number } = {}): Promise<void> {
    const channel = this.requireSelectedChannel();
    const page = options.page || this.state.market.remotePage || 1;
    await this.withBusy("Fetching remote packs...", async () => {
      const response = await listMemoPacks(channel.url, {
        search: this.state.market.remoteSearch || undefined,
        tag: this.state.market.remoteTag || undefined,
        page,
        limit: this.state.market.remoteLimit,
      });
      this.state.market = {
        ...this.state.market,
        remotePacks: response.items,
        remoteTotal: response.total,
        remotePage: response.page,
        remoteLimit: response.limit,
      };
      this.state.view = "market";
      this.state.status = `Fetched ${response.items.length}/${response.total} remote packs`;
    });
  }

  private async installRemotePack(value: string): Promise<void> {
    const pack = this.resolveRemotePack(value);
    if (!pack) throw new Error("Remote pack not found. Fetch remote packs first with /market remote.");
    validateMemoPack(pack);
    this.state.pack = memoPackOnly(pack);
    await this.store.savePack(this.state.pack);
    this.state.view = "memo";
    this.setStatus(`Installed remote pack: ${pack.name}`);
  }

  private async deleteRemotePack(value: string): Promise<void> {
    const channel = this.requireAuthenticatedChannel();
    const pack = this.resolveRemotePack(value);
    const id = pack?.id || value.trim();
    if (!id) throw new Error("Usage: /market delete <remote-id|index>");

    await this.withBusy("Deleting remote pack...", async () => {
      await deleteRemoteMemoPack(channel.url, channel.token, id);
      const response = await listMemoPacks(channel.url, {
        search: this.state.market.remoteSearch || undefined,
        tag: this.state.market.remoteTag || undefined,
        page: this.state.market.remotePage,
        limit: this.state.market.remoteLimit,
      });
      this.state.market = {
        ...this.state.market,
        remotePacks: response.items,
        remoteTotal: response.total,
        remotePage: response.page,
        remoteLimit: response.limit,
      };
      this.state.view = "market";
      this.state.status = `Deleted remote pack: ${id}`;
    });
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

  private resolveChannel(value: string): MarketChannel | null {
    return resolveByIndexOrId(this.state.market.channels, value, (channel) => channel.id);
  }

  private resolveLocalPack(value: string): LocalMemoPack | null {
    return resolveByIndexOrId(this.state.market.localPacks, value, (pack) => pack.id);
  }

  private resolveRemotePack(value: string): RemoteMemoPack | null {
    return resolveByIndexOrId(this.state.market.remotePacks, value, (pack) => pack.id);
  }

  private requireSelectedChannel(): MarketChannel {
    const channel = this.state.market.channels.find((item) => item.id === this.state.market.selectedChannelId);
    if (!channel) throw new Error("Select a channel first: /channel add <url>");
    return channel;
  }

  private requireAuthenticatedChannel(): MarketChannel {
    const channel = this.requireSelectedChannel();
    if (!channel.token) throw new Error("Login or register first: /channel login <username> <password>");
    return channel;
  }

  private async saveChannels(channels: MarketChannel[], selectedChannelId: string): Promise<void> {
    await this.store.saveChannels({ channels, selectedChannelId });
    const saved = await this.store.loadChannels();
    this.state.market = {
      ...this.state.market,
      channels: saved.channels,
      selectedChannelId: saved.selectedChannelId,
    };
  }

  private async replaceChannel(channel: MarketChannel): Promise<void> {
    const channels = this.state.market.channels.map((item) => item.id === channel.id ? channel : item);
    await this.saveChannels(channels, channel.id);
  }

  private async withBusy(status: string, action: () => Promise<void>): Promise<void> {
    if (this.state.busy) {
      this.setStatus("Busy. Wait for the current request to finish.");
      return;
    }

    this.state.busy = true;
    this.setStatus(status);
    try {
      await action();
    } catch (error) {
      this.state.status = errorToMessage(error);
    } finally {
      this.state.busy = false;
      this.emitRender();
    }
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

function memoPackOnly(pack: MemoPack): MemoPack {
  return {
    systemPrompt: pack.systemPrompt,
    rules: pack.rules.map((rule) => ({ ...rule })),
    memos: pack.memos.map((memo) => ({ ...memo })),
  };
}

function resolveByIndexOrId<T>(items: T[], value: string, id: (item: T) => string): T | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const index = Number.parseInt(trimmed, 10);
  if (Number.isFinite(index) && String(index) === trimmed) {
    if (index < 1 || index > items.length) return null;
    return items[index - 1] || null;
  }

  return items.find((item) => id(item) === trimmed) || null;
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
