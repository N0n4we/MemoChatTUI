import fs from "node:fs/promises";
import path from "node:path";
import { defaultConfig, defaultPack, getDataDir, normalizeBaseUrl } from "./config.ts";
import type { AppConfig, ChatSession, ChatSessionFile, MemoPack, StoredMessage } from "./types.ts";
import { generateId, nowIso, sessionTitleFromText } from "./utils.ts";

interface StorePaths {
  root: string;
  config: string;
  pack: string;
  currentChat: string;
  sessions: string;
  archives: string;
}

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
    };
  }

  async ensure(): Promise<void> {
    await fs.mkdir(this.paths.root, { recursive: true });
    await fs.mkdir(this.paths.sessions, { recursive: true });
    await fs.mkdir(this.paths.archives, { recursive: true });
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
    return {
      systemPrompt: stringValue(parsed.systemPrompt, parsed.system_prompt, defaultPack.systemPrompt),
      rules: normalizeRules(parsed.rules),
      memos: normalizeMemos(parsed.memos),
    };
  }

  async savePack(pack: MemoPack): Promise<void> {
    await this.writeJson(this.paths.pack, pack);
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

function normalizeRules(value: unknown): MemoPack["rules"] {
  if (!Array.isArray(value)) return defaultPack.rules;
  return value
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
    .map((item) => ({
      title: stringValue(item.title, item.description),
      updateRule: stringValue(item.updateRule, item.update_rule),
    }))
    .filter((rule) => rule.title || rule.updateRule);
}

function normalizeMemos(value: unknown): MemoPack["memos"] {
  if (!Array.isArray(value)) return defaultPack.memos;
  return value
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
    .map((item) => ({
      title: stringValue(item.title),
      content: stringValue(item.content),
    }))
    .filter((memo) => memo.title || memo.content);
}
