export type OverlayTarget = "command-palette" | "sessions" | "local-packs" | "remote-packs" | "channels";

export type CommandDispatch =
  | { kind: "submit"; command: string }
  | { kind: "insert"; template: string }
  | { kind: "overlay"; target: OverlayTarget };

export interface CommandMetadata {
  id: string;
  usage: string;
  label: string;
  description: string;
  category: string;
  aliases: string[];
  shortcut?: string;
  completion: string;
  dispatch: CommandDispatch;
  documented: boolean;
}

const documented = true;

export const COMMANDS: CommandMetadata[] = [
  command("help", "/help", "Help", "Show command reference", "Navigation", {
    aliases: ["/?", "help", "commands"],
    shortcut: "F1",
    dispatch: { kind: "submit", command: "/help" },
  }),
  command("chat", "/chat", "Chat view", "Show chat view", "Navigation", {
    aliases: ["home"],
    dispatch: { kind: "submit", command: "/chat" },
  }),
  command("memo", "/memo", "Memo view", "Show memo view", "Navigation", {
    aliases: ["memory", "pack"],
    dispatch: { kind: "submit", command: "/memo" },
  }),
  command("sessions", "/sessions", "Session picker", "Show saved sessions and load or delete one", "Navigation", {
    aliases: ["/history", "history", "load"],
    dispatch: { kind: "overlay", target: "sessions" },
  }),
  command("settings", "/settings", "Settings view", "Show settings", "Navigation", {
    aliases: ["/config", "config"],
    dispatch: { kind: "submit", command: "/settings" },
  }),
  command("market", "/market", "MemoPack Market", "Show MemoPack Market", "MemoPack Market", {
    aliases: ["marketplace"],
    dispatch: { kind: "submit", command: "/market" },
  }),
  command("market-local", "/market local", "Refresh local packs", "Refresh local pack list", "MemoPack Market", {
    aliases: ["local packs"],
    dispatch: { kind: "submit", command: "/market local" },
  }),
  command("market-remote", "/market remote [page]", "Fetch remote packs", "Fetch remote packs from selected channel", "MemoPack Market", {
    aliases: ["/market refresh", "remote packs", "market fetch"],
    completion: "/market remote ",
    dispatch: { kind: "submit", command: "/market remote" },
  }),
  command("market-search", "/market search <text>", "Search remote packs", "Search remote packs", "MemoPack Market", {
    aliases: ["find remote packs"],
    completion: "/market search ",
    dispatch: { kind: "insert", template: "/market search " },
  }),
  command("market-install", "/market install <index|id>", "Install remote pack", "Install a fetched remote pack", "MemoPack Market", {
    aliases: ["remote install"],
    completion: "/market install ",
    dispatch: { kind: "overlay", target: "remote-packs" },
  }),
  command("market-delete", "/market delete <index|id>", "Delete remote pack", "Delete a remote pack", "MemoPack Market", {
    aliases: ["/market del", "remove remote pack"],
    completion: "/market delete ",
    dispatch: { kind: "overlay", target: "remote-packs" },
  }),
  command("channel-add", "/channel add <url>", "Add market channel", "Add a market channel", "Channels", {
    aliases: ["new channel"],
    completion: "/channel add ",
    dispatch: { kind: "insert", template: "/channel add " },
  }),
  command("channel-select", "/channel select <index|id>", "Select channel", "Select a market channel", "Channels", {
    aliases: ["choose channel"],
    completion: "/channel select ",
    dispatch: { kind: "overlay", target: "channels" },
  }),
  command("channel-remove", "/channel remove <index|id>", "Remove channel", "Remove a market channel", "Channels", {
    aliases: ["/channel delete", "/channel del", "delete channel"],
    completion: "/channel remove ",
    dispatch: { kind: "overlay", target: "channels" },
  }),
  command("channel-login", "/channel login <user> <pass>", "Log in to channel", "Login to selected channel", "Channels", {
    aliases: ["auth channel"],
    completion: "/channel login ",
    dispatch: { kind: "insert", template: "/channel login " },
  }),
  command("channel-register", "/channel register <user> <pass>", "Register on channel", "Register on selected channel", "Channels", {
    aliases: ["signup channel"],
    completion: "/channel register ",
    dispatch: { kind: "insert", template: "/channel register " },
  }),
  command("channel-me", "/channel me", "Channel account", "Show selected channel account", "Channels", {
    aliases: ["/channel status", "whoami"],
    dispatch: { kind: "submit", command: "/channel me" },
  }),
  command("pack-save-current", "/pack save-current <name> | <description>", "Save active pack", "Save active MemoPack locally", "MemoPacks", {
    aliases: ["save memopack"],
    completion: "/pack save-current ",
    dispatch: { kind: "insert", template: "/pack save-current " },
  }),
  command("pack-install", "/pack install <index|id>", "Install local pack", "Install a local MemoPack", "MemoPacks", {
    aliases: ["local install"],
    completion: "/pack install ",
    dispatch: { kind: "overlay", target: "local-packs" },
  }),
  command("pack-delete", "/pack delete <index|id>", "Delete local pack", "Delete a local MemoPack", "MemoPacks", {
    aliases: ["/pack del", "/pack remove", "remove local pack"],
    completion: "/pack delete ",
    dispatch: { kind: "overlay", target: "local-packs" },
  }),
  command("pack-import", "/pack import <path>", "Import pack", "Import a MemoPack JSON file", "MemoPacks", {
    aliases: ["import memopack"],
    completion: "/pack import ",
    dispatch: { kind: "insert", template: "/pack import " },
  }),
  command("pack-export", "/pack export active|<id> <path>", "Export pack", "Export a MemoPack JSON file", "MemoPacks", {
    aliases: ["export memopack"],
    completion: "/pack export ",
    dispatch: { kind: "insert", template: "/pack export " },
  }),
  command("pack-publish", "/pack publish active|<index|id>", "Publish pack", "Publish to selected channel", "MemoPacks", {
    aliases: ["publish memopack"],
    completion: "/pack publish ",
    dispatch: { kind: "insert", template: "/pack publish active" },
  }),
  command("set-api-key", "/set apiKey <key>", "Set API key", "Save API key", "Settings", {
    aliases: ["/set key", "api key"],
    completion: "/set apiKey ",
    dispatch: { kind: "insert", template: "/set apiKey " },
  }),
  command("set-base-url", "/set baseUrl <url>", "Set base URL", "Save OpenAI-compatible API base URL", "Settings", {
    aliases: ["/set url", "base url"],
    completion: "/set baseUrl ",
    dispatch: { kind: "insert", template: "/set baseUrl " },
  }),
  command("set-model", "/set model <id>", "Set chat model", "Save chat model", "Settings", {
    aliases: ["/set modelId", "model"],
    completion: "/set model ",
    dispatch: { kind: "insert", template: "/set model " },
  }),
  command("set-compact-model", "/set compactModel <id>", "Set compact model", "Save memo compact model", "Settings", {
    aliases: ["/set compact-model"],
    completion: "/set compactModel ",
    dispatch: { kind: "insert", template: "/set compactModel " },
  }),
  command("set-reasoning", "/set reasoning on|off", "Set reasoning requests", "Toggle reasoning request", "Settings", {
    aliases: ["reasoning requests"],
    completion: "/set reasoning ",
    dispatch: { kind: "insert", template: "/set reasoning " },
  }),
  command("set-compact-reasoning", "/set compactReasoning on|off", "Set compact reasoning", "Toggle compact reasoning request", "Settings", {
    aliases: ["compact reasoning"],
    completion: "/set compactReasoning ",
    dispatch: { kind: "insert", template: "/set compactReasoning " },
  }),
  command("system", "/system <text>", "Set system prompt", "Replace system prompt", "Memo", {
    aliases: ["system prompt"],
    completion: "/system ",
    dispatch: { kind: "insert", template: "/system " },
  }),
  command("rule-add", "/rule add <title> | <rule>", "Add memo rule", "Add a memo update rule", "Memo", {
    aliases: ["new rule"],
    completion: "/rule add ",
    dispatch: { kind: "insert", template: "/rule add " },
  }),
  command("rule-del", "/rule del <index>", "Delete memo rule", "Delete a memo rule", "Memo", {
    aliases: ["/rule delete", "/rule remove"],
    completion: "/rule del ",
    dispatch: { kind: "insert", template: "/rule del " },
  }),
  command("memo-set", "/memo set <index> <text>", "Set memo content", "Manually set memo content", "Memo", {
    aliases: ["edit memo"],
    completion: "/memo set ",
    dispatch: { kind: "insert", template: "/memo set " },
  }),
  command("compact", "/compact", "Compact memory", "Update memos from current chat and archive the chat", "Chat", {
    aliases: ["update memos"],
    dispatch: { kind: "submit", command: "/compact" },
  }),
  command("new", "/new", "New chat", "Save current session and start a blank chat", "Chat", {
    aliases: ["new session"],
    dispatch: { kind: "submit", command: "/new" },
  }),
  command("save", "/save", "Save chat", "Save current chat as a session", "Chat", {
    aliases: ["save session"],
    dispatch: { kind: "submit", command: "/save" },
  }),
  command("load", "/load <number>", "Load session", "Load a session from /sessions", "Sessions", {
    aliases: ["open session"],
    completion: "/load ",
    dispatch: { kind: "overlay", target: "sessions" },
  }),
  command("delete", "/delete <number>", "Delete session", "Delete a session from /sessions", "Sessions", {
    aliases: ["/del", "remove session"],
    completion: "/delete ",
    dispatch: { kind: "overlay", target: "sessions" },
  }),
  command("reasoning", "/reasoning", "Toggle reasoning display", "Toggle reasoning display", "Chat", {
    aliases: ["show reasoning"],
    dispatch: { kind: "submit", command: "/reasoning" },
  }),
  command("clear", "/clear", "Clear chat", "Clear current chat without saving", "Chat", {
    aliases: ["clear transcript"],
    dispatch: { kind: "submit", command: "/clear" },
  }),
  command("quit", "/quit", "Quit", "Exit", "App", {
    aliases: ["/exit", "exit"],
    dispatch: { kind: "submit", command: "/quit" },
  }),
  command("open-command-palette", "", "Command palette", "Search commands and actions", "Navigation", {
    aliases: ["palette", "actions"],
    shortcut: "Ctrl-P",
    completion: "",
    dispatch: { kind: "overlay", target: "command-palette" },
    documented: false,
  }),
  command("open-local-pack-picker", "", "Local MemoPack picker", "Install or delete a saved local MemoPack", "MemoPacks", {
    aliases: ["local pack picker"],
    dispatch: { kind: "overlay", target: "local-packs" },
    documented: false,
  }),
  command("open-remote-pack-picker", "", "Remote MemoPack picker", "Install or delete a fetched remote MemoPack", "MemoPack Market", {
    aliases: ["remote pack picker"],
    dispatch: { kind: "overlay", target: "remote-packs" },
    documented: false,
  }),
  command("open-channel-picker", "", "Channel picker", "Select or remove a configured market channel", "Channels", {
    aliases: ["channel picker"],
    dispatch: { kind: "overlay", target: "channels" },
    documented: false,
  }),
];

export const DOCUMENTED_COMMANDS = COMMANDS.filter((command) => command.documented);

export function filterCommands(filter: string, commands: readonly CommandMetadata[] = COMMANDS): CommandMetadata[] {
  const query = normalize(filter);
  if (!query) return [...commands];
  return commands.filter((command) => {
    const haystack = [
      command.usage,
      command.label,
      command.description,
      command.category,
      command.shortcut || "",
      ...command.aliases,
    ].map(normalize).join(" ");
    return query.split(/\s+/).every((part) => haystack.includes(part));
  });
}

export interface SlashCompletion {
  command: CommandMetadata;
  score: number;
}

export function slashCompletions(buffer: string, commands: readonly CommandMetadata[] = DOCUMENTED_COMMANDS): SlashCompletion[] {
  if (!buffer.startsWith("/")) return [];
  const beforeArgs = buffer.slice(0, firstCompletionBoundary(buffer));
  const query = normalize(beforeArgs);
  if (!query) return [];

  return commands
    .map((command) => ({ command, score: completionScore(query, command) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.command.usage.localeCompare(b.command.usage))
    .slice(0, 8);
}

export function applySlashCompletion(buffer: string, cursor: number, command: CommandMetadata): { text: string; cursor: number } {
  const completion = command.completion || command.usage;
  const replaceEnd = firstCompletionBoundary(buffer.slice(0, cursor));
  const suffix = buffer.slice(cursor);
  const needsSpace = completion.length > 0 && !completion.endsWith(" ") && suffix && !suffix.startsWith(" ");
  const text = `${completion}${needsSpace ? " " : ""}${suffix}`;
  const nextCursor = completion.length + (needsSpace ? 1 : 0);
  return { text, cursor: nextCursor };
}

export function commandUsageBase(usage: string): string {
  return usage.split(/\s+/)[0] || usage;
}

function command(
  id: string,
  usage: string,
  label: string,
  description: string,
  category: string,
  options: {
    aliases?: string[];
    shortcut?: string;
    completion?: string;
    dispatch: CommandDispatch;
    documented?: boolean;
  },
): CommandMetadata {
  return {
    id,
    usage,
    label,
    description,
    category,
    aliases: options.aliases || [],
    shortcut: options.shortcut,
    completion: options.completion ?? completionForUsage(usage),
    dispatch: options.dispatch,
    documented: options.documented ?? documented,
  };
}

function completionForUsage(usage: string): string {
  if (!usage) return "";
  const placeholderIndex = usage.search(/[<[]/);
  const base = placeholderIndex === -1 ? usage : usage.slice(0, placeholderIndex).trimEnd();
  return /[<[]/.test(usage) ? `${base} ` : base;
}

function completionScore(query: string, command: CommandMetadata): number {
  const usage = normalize(command.usage);
  const base = normalize(commandUsageBase(command.usage));
  const aliases = command.aliases.map(normalize);
  if (usage.startsWith(query)) return 100 - usage.length;
  if (base.startsWith(query)) return 90 - base.length;
  if (aliases.some((alias) => alias.startsWith(query))) return 80;
  if (usage.includes(query)) return 40;
  if (normalize(command.label).includes(query)) return 20;
  return 0;
}

function firstCompletionBoundary(value: string): number {
  const match = value.match(/^\/\S+(?:\s+\S+)?/);
  return match ? match[0].length : value.length;
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}
