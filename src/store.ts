import fs from "node:fs/promises";
import path from "node:path";
import { defaultConfig, defaultPack, getDataDir, normalizeBaseUrl } from "./config.ts";
import { normalizeLocalMemoPack, normalizeMemoPack, packForExport, safePackFilename } from "./market.ts";
import type { AppConfig, ChatSession, ChatSessionFile, LocalMemoPack, MarketChannel, MarketChannelsFile, MemoPack, StoredMessage } from "./types.ts";
import { generateId, nowIso, sessionTitleFromText } from "./utils.ts";

interface StorePaths {
  root: string;
  config: string;
  pack: string;
  currentChat: string;
  sessions: string;
  archives: string;
  channels: string;
  packs: string;
}

const defaultChannelsFile: MarketChannelsFile = {
  selectedChannelId: "channel_default_n0n4w3",
  channels: [
    {
      id: "channel_default_n0n4w3",
      url: "https://n0n4w3.cn/memomarket",
      token: "",
      username: "",
      name: "https://n0n4w3.cn/memomarket",
      description: "",
    },
  ],
};

export class JsonStore {
  readonly paths: StorePaths;

  constructor(root = getDataDir()) {
    this.paths = {
      root,
      config: path.join(root, "config.json"),
      pack: path.join(root, "current-pack.json"),
      currentChat: path.join(root, "current-chat.json"),
      sessions: path.join(root, "sessions"),
      archives: path.join(root, "archives"),
      channels: path.join(root, "channels.json"),
      packs: path.join(root, "packs"),
    };
  }

  async ensure(): Promise<void> {
    await fs.mkdir(this.paths.root, { recursive: true });
    await fs.mkdir(this.paths.sessions, { recursive: true });
    await fs.mkdir(this.paths.archives, { recursive: true });
    await fs.mkdir(this.paths.packs, { recursive: true });
    await this.writeJsonIfMissing(this.paths.channels, defaultChannelsFile);
  }

  async loadConfig(): Promise<AppConfig> {
    const parsed = await this.readJson<Record<string, unknown>>(this.paths.config, {});
    const baseUrl = stringValue(parsed.baseUrl, parsed.base_url, defaultConfig.baseUrl);
    return {
      ...defaultConfig,
      apiKey: stringValue(parsed.apiKey, parsed.api_key, defaultConfig.apiKey),
      modelId: stringValue(parsed.modelId, parsed.model_id, defaultConfig.modelId),
      compactModelId: stringValue(parsed.compactModelId, parsed.compact_model_id, defaultConfig.compactModelId),
      baseUrl: normalizeBaseUrl(baseUrl),
      reasoningEnabled: booleanValue(parsed.reasoningEnabled, parsed.reasoning_enabled),
      compactReasoningEnabled: booleanValue(parsed.compactReasoningEnabled, parsed.compact_reasoning_enabled),
    };
  }

  async saveConfig(config: AppConfig): Promise<void> {
    await this.writeJson(this.paths.config, {
      ...config,
      baseUrl: normalizeBaseUrl(config.baseUrl),
    });
  }

  async loadPack(): Promise<MemoPack> {
    const parsed = await this.readJson<Record<string, unknown>>(this.paths.pack, {});
    const normalized = normalizeMemoPack(parsed);
    return {
      systemPrompt: normalized.systemPrompt || defaultPack.systemPrompt,
      rules: normalized.rules,
      memos: normalized.memos,
    };
  }

  async savePack(pack: MemoPack): Promise<void> {
    await this.writeJson(this.paths.pack, pack);
  }

  async loadChannels(): Promise<MarketChannelsFile> {
    const parsed = await this.readJson<Partial<MarketChannelsFile>>(this.paths.channels, {});
    const channels = Array.isArray(parsed.channels)
      ? parsed.channels.map(normalizeChannel).filter((channel): channel is MarketChannel => channel !== null)
      : [];
    const selected = typeof parsed.selectedChannelId === "string" ? parsed.selectedChannelId : "";
    const selectedChannelId = channels.some((channel) => channel.id === selected) ? selected : channels[0]?.id || "";
    return { selectedChannelId, channels };
  }

  async saveChannels(data: MarketChannelsFile): Promise<void> {
    const channels = data.channels.map(normalizeChannel).filter((channel): channel is MarketChannel => channel !== null);
    const selectedChannelId = channels.some((channel) => channel.id === data.selectedChannelId)
      ? data.selectedChannelId
      : channels[0]?.id || "";
    await this.writeJson(this.paths.channels, { selectedChannelId, channels });
  }

  async listLocalPacks(): Promise<LocalMemoPack[]> {
    await fs.mkdir(this.paths.packs, { recursive: true });
    const entries = await fs.readdir(this.paths.packs, { withFileTypes: true });
    const packs: LocalMemoPack[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const parsed = await this.readJson<unknown>(path.join(this.paths.packs, entry.name), null);
      try {
        packs.push(normalizeLocalMemoPack(parsed, { id: path.basename(entry.name, ".json") }));
      } catch {
        // Ignore malformed library entries so one bad file does not break the market view.
      }
    }

    packs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return packs;
  }

  async loadLocalPack(id: string): Promise<LocalMemoPack | null> {
    const parsed = await this.readJson<unknown>(path.join(this.paths.packs, safePackFilename(id)), null);
    if (parsed === null) return null;
    return normalizeLocalMemoPack(parsed, { id });
  }

  async saveLocalPack(pack: LocalMemoPack): Promise<LocalMemoPack> {
    const normalized = normalizeLocalMemoPack({
      ...pack,
      updatedAt: nowIso(),
    });
    await this.writeJson(path.join(this.paths.packs, safePackFilename(normalized.id)), normalized);
    return normalized;
  }

  async deleteLocalPack(id: string): Promise<boolean> {
    try {
      await fs.unlink(path.join(this.paths.packs, safePackFilename(id)));
      return true;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return false;
      throw error;
    }
  }

  async importLocalPack(filePath: string): Promise<LocalMemoPack> {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const imported = normalizeLocalMemoPack(parsed, {
      name: path.basename(filePath, path.extname(filePath)),
    });
    return this.saveLocalPack(imported);
  }

  async exportMemoPack(filePath: string, pack: LocalMemoPack | (MemoPack & { name?: string; description?: string })): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await this.writeJson(filePath, packForExport(pack));
  }

  async loadCurrentMessages(): Promise<StoredMessage[]> {
    return this.readJson<StoredMessage[]>(this.paths.currentChat, []);
  }

  async saveCurrentMessages(messages: StoredMessage[]): Promise<void> {
    await this.writeJson(this.paths.currentChat, messages);
  }

  async archiveMessages(messages: StoredMessage[]): Promise<string> {
    await fs.mkdir(this.paths.archives, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const filename = `${timestamp}.json`;
    await this.writeJson(path.join(this.paths.archives, filename), messages);
    return filename;
  }

  async listSessions(): Promise<ChatSession[]> {
    await fs.mkdir(this.paths.sessions, { recursive: true });
    const entries = await fs.readdir(this.paths.sessions, { withFileTypes: true });
    const sessions: ChatSession[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const sessionFile = await this.readJson<ChatSessionFile | null>(
        path.join(this.paths.sessions, entry.name),
        null,
      );
      if (sessionFile?.meta) sessions.push(sessionFile.meta);
    }

    sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return sessions;
  }

  async loadSession(id: string): Promise<ChatSessionFile | null> {
    const file = path.join(this.paths.sessions, `${id}.json`);
    return this.readJson<ChatSessionFile | null>(file, null);
  }

  async saveSession(id: string, messages: StoredMessage[]): Promise<ChatSession> {
    await fs.mkdir(this.paths.sessions, { recursive: true });
    const file = path.join(this.paths.sessions, `${id}.json`);
    const existing = await this.readJson<ChatSessionFile | null>(file, null);
    const firstUser = messages.find((message) => message.role === "user");
    const now = nowIso();
    const meta: ChatSession = {
      id,
      title: firstUser ? sessionTitleFromText(firstUser.content) : "New Chat",
      messageCount: messages.length,
      createdAt: existing?.meta.createdAt || now,
      updatedAt: now,
    };

    await this.writeJson(file, { meta, messages });
    return meta;
  }

  async deleteSession(id: string): Promise<boolean> {
    try {
      await fs.unlink(path.join(this.paths.sessions, `${id}.json`));
      return true;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return false;
      throw error;
    }
  }

  createSessionId(): string {
    return generateId("session");
  }

  private async readJson<T>(file: string, fallback: T): Promise<T> {
    try {
      const raw = await fs.readFile(file, "utf8");
      return JSON.parse(raw) as T;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return fallback;
      if (error instanceof SyntaxError) return fallback;
      throw error;
    }
  }

  private async writeJson(file: string, value: unknown): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }

  private async writeJsonIfMissing(file: string, value: unknown): Promise<void> {
    try {
      await fs.access(file);
    } catch (error) {
      if (!isNodeError(error) || error.code !== "ENOENT") throw error;
      await this.writeJson(file, value);
    }
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function stringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string") return value;
  }
  return "";
}

function booleanValue(...values: unknown[]): boolean {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return false;
}

function normalizeChannel(value: unknown): MarketChannel | null {
  if (value === null || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  const url = stringValue(object.url).replace(/\/+$/, "");
  if (!url) return null;
  return {
    id: stringValue(object.id) || generateId("channel"),
    url,
    token: stringValue(object.token),
    username: stringValue(object.username),
    name: stringValue(object.name) || url,
    description: stringValue(object.description),
  };
}
