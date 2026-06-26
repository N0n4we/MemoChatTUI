import { normalizeRemoteMemoPack } from "./market.ts";
import type { ListResponse, PublishMemoPackReq, RemoteMemoPack, ServerInfo, UserInfo } from "./types.ts";

type HttpMethod = "GET" | "POST" | "DELETE";

interface ListParams {
  search?: string;
  tag?: string;
  page?: number;
  limit?: number;
}

export async function fetchServerInfo(baseUrl: string): Promise<ServerInfo> {
  return request<ServerInfo>(baseUrl, "GET", "/api/info");
}

export async function registerOnServer(baseUrl: string, username: string, password: string): Promise<UserInfo> {
  return request<UserInfo>(baseUrl, "POST", "/api/register", { username, password });
}

export async function loginOnServer(baseUrl: string, username: string, password: string): Promise<UserInfo> {
  return request<UserInfo>(baseUrl, "POST", "/api/login", { username, password });
}

export async function getMe(baseUrl: string, token: string): Promise<UserInfo> {
  return request<UserInfo>(baseUrl, "GET", "/api/me", undefined, token);
}

export async function publishMemoPack(baseUrl: string, token: string, payload: PublishMemoPackReq): Promise<unknown> {
  return request(baseUrl, "POST", "/api/memo-packs", payload, token);
}

export async function listMemoPacks(baseUrl: string, params: ListParams = {}): Promise<ListResponse<RemoteMemoPack>> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.tag) query.set("tag", params.tag);
  query.set("page", String(params.page || 1));
  query.set("limit", String(params.limit || 20));

  const response = await request<ListResponse<unknown>>(baseUrl, "GET", `/api/memo-packs?${query.toString()}`);
  const rawItems = Array.isArray(response.items) ? response.items : [];
  const items: RemoteMemoPack[] = [];
  const errors: string[] = [];

  rawItems.forEach((item, index) => {
    try {
      items.push(normalizeRemoteMemoPack(item));
    } catch (error) {
      errors.push(`item ${index + 1}: ${errorToMessage(error)}`);
    }
  });

  if (rawItems.length > 0 && items.length === 0 && errors.length > 0) {
    throw new Error(`Remote response did not contain usable MemoPacks (${errors.join("; ")})`);
  }

  return {
    items,
    total: numberValue(response.total, items.length),
    page: numberValue(response.page, params.page || 1),
    limit: numberValue(response.limit, params.limit || 20),
  };
}

export async function deleteRemoteMemoPack(baseUrl: string, token: string, id: string): Promise<unknown> {
  return request(baseUrl, "DELETE", `/api/memo-packs/${encodeURIComponent(id)}`, undefined, token);
}

async function request<T>(baseUrl: string, method: HttpMethod, resourcePath: string, body?: unknown, token?: string): Promise<T> {
  const url = `${baseUrl.replace(/\/+$/, "")}${resourcePath}`;
  let response: Response;

  try {
    response = await fetch(url, {
      method,
      headers: headers(token),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(`Network error for ${url}: ${errorToMessage(error)}`);
  }

  const text = await response.text();
  let data: unknown = undefined;
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text}`);
      throw new Error(`Invalid JSON response from ${url}`);
    }
  }

  if (!response.ok) {
    const message = errorField(data) || text || response.statusText || `HTTP ${response.status}`;
    throw new Error(`HTTP ${response.status}: ${message}`);
  }

  return data as T;
}

function headers(token?: string): Record<string, string> {
  const output: Record<string, string> = { "Content-Type": "application/json" };
  if (token) output.Authorization = `Bearer ${token}`;
  return output;
}

function errorField(value: unknown): string {
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (typeof object.error === "string") return object.error;
    if (typeof object.message === "string") return object.message;
  }
  return "";
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
