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

export interface LocalMemoPack extends MemoPack {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface RemoteMemoPack extends MemoPack {
  id: string;
  name: string;
  description: string;
  author?: string;
  createdAt?: string;
  updatedAt?: string;
  ruleCount: number;
  memoCount: number;
  raw: unknown;
}

export interface MarketChannel {
  id: string;
  url: string;
  token: string;
  username: string;
  name: string;
  description: string;
}

export interface MarketChannelsFile {
  selectedChannelId: string;
  channels: MarketChannel[];
}

export interface ServerInfo {
  name: string;
  description: string;
}

export interface UserInfo {
  id: string;
  username: string;
  token?: string;
  created_at?: string;
  createdAt?: string;
}

export interface PublishMemoPackReq {
  name: string;
  description: string;
  system_prompt: string;
  rules: { title: string; update_rule: string }[];
  memos: { title: string; content: string }[];
}

export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface MarketState {
  channels: MarketChannel[];
  selectedChannelId: string;
  localPacks: LocalMemoPack[];
  remotePacks: RemoteMemoPack[];
  remoteTotal: number;
  remotePage: number;
  remoteLimit: number;
  remoteSearch: string;
  remoteTag: string;
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

export type ViewName = "chat" | "memo" | "sessions" | "settings" | "market" | "help";

export type TerminalFocusMode = "prompt" | "completion" | "overlay";

export type TerminalOverlayKind =
  | "command-palette"
  | "session-picker"
  | "local-pack-picker"
  | "remote-pack-picker"
  | "channel-picker"
  | "confirmation";

export interface PromptCursorState {
  text: string;
  cursor: number;
}

export interface TerminalInteractionState {
  prompt: PromptCursorState;
  promptHistory: string[];
  promptHistoryIndex: number | null;
  activeOverlay: TerminalOverlayKind | null;
  selectedRow: number;
  filterText: string;
  sidePanelVisible: boolean;
  focusMode: TerminalFocusMode;
}

export interface AppState {
  config: AppConfig;
  pack: MemoPack;
  messages: StoredMessage[];
  sessions: ChatSession[];
  currentSessionId: string;
  market: MarketState;
  view: ViewName;
  status: string;
  busy: boolean;
  compacting: boolean;
  compactProgress: number;
  compactTotal: number;
  showReasoning: boolean;
}
