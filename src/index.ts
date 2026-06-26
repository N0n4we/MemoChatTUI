import { AppController } from "./app.ts";
import { getDataDir } from "./config.ts";
import { JsonStore } from "./store.ts";
import { TerminalUi } from "./terminal.ts";

const version = "0.1.0";

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log(version);
    return;
  }

  if (args.includes("--doctor")) {
    await doctor();
    return;
  }

  const app = new AppController();
  await app.initialize();
  const terminal = new TerminalUi(app);
  terminal.start();
}

async function doctor(): Promise<void> {
  const store = new JsonStore();
  await store.ensure();
  const [config, pack, sessions, channels, localPacks] = await Promise.all([
    store.loadConfig(),
    store.loadPack(),
    store.listSessions(),
    store.loadChannels(),
    store.listLocalPacks(),
  ]);
  const selectedChannel = channels.channels.find((channel) => channel.id === channels.selectedChannelId) || null;

  console.log("MemoChatTUI doctor");
  console.log(`node: ${process.version}`);
  console.log(`dataDir: ${getDataDir()}`);
  console.log(`marketPacksDir: ${store.paths.packs}`);
  console.log(`baseUrl: ${config.baseUrl}`);
  console.log(`model: ${config.modelId || "(empty)"}`);
  console.log(`apiKey: ${config.apiKey ? "set" : "empty"}`);
  console.log(`rules: ${pack.rules.length}`);
  console.log(`memos: ${pack.memos.length}`);
  console.log(`sessions: ${sessions.length}`);
  console.log(`channels: ${channels.channels.length}`);
  console.log(`selectedChannel: ${selectedChannel ? `${selectedChannel.name} (${selectedChannel.id})` : "(none)"}`);
  console.log(`localPacks: ${localPacks.length}`);
}

function printHelp(): void {
  console.log(`MemoChatTUI ${version}

Usage:
  npm start
  node --experimental-strip-types src/index.ts
  node --experimental-strip-types src/index.ts --doctor

Runtime:
  Requires Node.js with TypeScript type stripping support.
  Data is stored in ~/.memochat-tui by default.
  Set MEMOCHAT_TUI_HOME to override the data directory.

Inside the TUI:
  Type a message and press Enter.
  Use /help for commands.
  Use Ctrl-C or /quit to exit.
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
