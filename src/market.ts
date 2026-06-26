import path from "node:path";
import type { LocalMemoPack, Memo, MemoPack, MemoRule, PublishMemoPackReq, RemoteMemoPack } from "./types.ts";
import { generateId, nowIso } from "./utils.ts";

export interface PackMetadata {
  id?: string;
  name?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function normalizeMemoPack(value: unknown): MemoPack {
  const object = asRecord(value);
  const systemPrompt = stringValue(object.systemPrompt, object.system_prompt);
  const rules = normalizeRules(object.rules);
  const memos = normalizeMemos(object.memos);
  return { systemPrompt, rules, memos };
}

export function validateMemoPack(pack: MemoPack): void {
  const hasSystemPrompt = pack.systemPrompt.trim().length > 0;
  const hasRules = pack.rules.some((rule) => rule.title.trim() || rule.updateRule.trim());
  const hasMemos = pack.memos.some((memo) => memo.title.trim() || memo.content.trim());
  if (!hasSystemPrompt && !hasRules && !hasMemos) {
    throw new Error("MemoPack has no usable system prompt, rules, or memos");
  }
}

export function normalizeLocalMemoPack(value: unknown, fallback: PackMetadata = {}): LocalMemoPack {
  const object = asRecord(value);
  const pack = normalizeMemoPack(value);
  validateMemoPack(pack);

  const now = nowIso();
  return {
    id: safeId(stringValue(object.id, fallback.id)) || generateId("pack"),
    name: stringValue(object.name, fallback.name) || "Untitled Pack",
    description: stringValue(object.description, fallback.description),
    createdAt: stringValue(object.createdAt, object.created_at, fallback.createdAt) || now,
    updatedAt: stringValue(object.updatedAt, object.updated_at, fallback.updatedAt) || now,
    ...pack,
  };
}

export function createLocalMemoPack(name: string, description: string, pack: MemoPack): LocalMemoPack {
  validateMemoPack(pack);
  const now = nowIso();
  return {
    id: generateId("pack"),
    name: name.trim() || "Untitled Pack",
    description: description.trim(),
    createdAt: now,
    updatedAt: now,
    systemPrompt: pack.systemPrompt,
    rules: pack.rules.map((rule) => ({ ...rule })),
    memos: pack.memos.map((memo) => ({ ...memo })),
  };
}

export function normalizeRemoteMemoPack(value: unknown): RemoteMemoPack {
  const object = asRecord(value);
  const pack = normalizeMemoPack(value);
  validateMemoPack(pack);

  const author = stringValue(
    object.author,
    object.username,
    asRecord(object.user).username,
    asRecord(object.owner).username,
    asRecord(object.owner).name,
  );

  return {
    id: stringValue(object.id, object.uuid, object.slug) || generateId("remote"),
    name: stringValue(object.name, object.title) || "Untitled Pack",
    description: stringValue(object.description),
    author: author || undefined,
    createdAt: stringValue(object.createdAt, object.created_at) || undefined,
    updatedAt: stringValue(object.updatedAt, object.updated_at) || undefined,
    ruleCount: pack.rules.length,
    memoCount: pack.memos.length,
    raw: value,
    ...pack,
  };
}

export function toPublishRequest(pack: LocalMemoPack | (MemoPack & { name?: string; description?: string })): PublishMemoPackReq {
  return {
    name: "name" in pack && pack.name ? pack.name : "Active MemoPack",
    description: "description" in pack && pack.description ? pack.description : "",
    system_prompt: pack.systemPrompt,
    rules: pack.rules.map((rule) => ({
      title: rule.title,
      update_rule: rule.updateRule,
    })),
    memos: pack.memos.map((memo) => ({
      title: memo.title,
      content: memo.content,
    })),
  };
}

export function packForExport(pack: LocalMemoPack | (MemoPack & { name?: string; description?: string })): Record<string, unknown> {
  return {
    id: "id" in pack ? pack.id : undefined,
    name: "name" in pack ? pack.name : "Active MemoPack",
    description: "description" in pack ? pack.description : "",
    systemPrompt: pack.systemPrompt,
    rules: pack.rules,
    memos: pack.memos,
  };
}

export function safePackFilename(id: string): string {
  const safe = safeId(id) || generateId("pack");
  return `${safe}.json`;
}

export function resolveUserPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("File path is required");
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
}

export function splitNameDescription(value: string): { name: string; description: string } {
  const delimiter = value.indexOf("|");
  if (delimiter === -1) return { name: value.trim(), description: "" };
  return {
    name: value.slice(0, delimiter).trim(),
    description: value.slice(delimiter + 1).trim(),
  };
}

function normalizeRules(value: unknown): MemoRule[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
    .map((item) => ({
      title: stringValue(item.title, item.description),
      updateRule: stringValue(item.updateRule, item.update_rule),
    }))
    .filter((rule) => rule.title.trim() || rule.updateRule.trim());
}

function normalizeMemos(value: unknown): Memo[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
    .map((item) => ({
      title: stringValue(item.title),
      content: stringValue(item.content),
    }))
    .filter((memo) => memo.title.trim() || memo.content.trim());
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return "";
}

function safeId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.-]/g, "-").replace(/-+/g, "-").slice(0, 120);
}
