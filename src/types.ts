export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
}

export interface ChatResponse {
  role: "assistant";
  content: string;
  reasoning: string;
}

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  reasoningEnabled: boolean;
}

export interface StreamCallbacks {
  onContent?: (chunk: string) => void;
  onReasoning?: (chunk: string) => void;
}

export interface AppConfig {
  apiKey: string;
  modelId: string;
  compactModelId: string;
  baseUrl: string;
  reasoningEnabled: boolean;
  compactReasoningEnabled: boolean;
}

export interface MemoRule {
  title: string;
  updateRule: string;
}

export interface Memo {
  title: string;
  content: string;
}

export interface MemoPack {
  systemPrompt: string;
  rules: MemoRule[];
  memos: Memo[];
}

export interface ChatSession {
  id: string;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionFile {
  meta: ChatSession;
  messages: StoredMessage[];
}

export type ViewName = "chat" | "memo" | "sessions" | "settings" | "help";

export interface AppState {
  config: AppConfig;
  pack: MemoPack;
  messages: StoredMessage[];
  sessions: ChatSession[];
  currentSessionId: string;
  view: ViewName;
  status: string;
  busy: boolean;
  compacting: boolean;
  compactProgress: number;
  compactTotal: number;
  showReasoning: boolean;
}
