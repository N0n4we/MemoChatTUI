import os from "node:os";
import path from "node:path";
import type { AppConfig, MemoPack } from "./types.ts";

export const defaultConfig: AppConfig = {
  apiKey: "",
  modelId: "z-ai/glm-5",
  compactModelId: "",
  baseUrl: "https://openrouter.ai/api/v1",
  reasoningEnabled: false,
  compactReasoningEnabled: false,
};

export const defaultPack: MemoPack = {
  systemPrompt: "",
  rules: [],
  memos: [],
};

export function getDataDir(): string {
  return process.env.MEMOCHAT_TUI_HOME || path.join(os.homedir(), ".memochat-tui");
}

export function maskSecret(value: string): string {
  if (!value) return "(empty)";
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function parseBoolean(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on", "enable", "enabled"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "disable", "disabled"].includes(normalized)) return false;
  return null;
}

export function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}
