# MemoChatTUI

A pure TypeScript terminal UI for MemoChat-style AI chat with local memory.

This is a standalone project. It does not depend on the Tauri/Vue desktop app and does not require runtime npm packages.

## Requirements

- Node.js 22.6+ with TypeScript type stripping support
- An OpenAI-compatible chat completions endpoint

## Run

```bash
npm start
```

Equivalent direct command:

```bash
node --experimental-strip-types src/index.ts
```

Data is stored in `~/.memochat-tui`. Override it with:

```bash
MEMOCHAT_TUI_HOME=/path/to/data npm start
```

## First Setup

Inside the TUI:

```text
/set apiKey <your-key>
/set baseUrl https://openrouter.ai/api/v1
/set model z-ai/glm-5
```

Then type a normal message and press Enter.

## Commands

```text
/help                         Show command reference
/chat                         Show chat view
/memo                         Show memo view
/sessions                     Show saved sessions
/settings                     Show settings
/market                       Show MemoPack Market
/market local                 Refresh local pack list
/market remote [page]         Fetch remote packs from selected channel
/market search <text>         Search remote packs
/market install <index|id>    Install a fetched remote pack
/market delete <index|id>     Delete a remote pack
/channel add <url>            Add a market channel
/channel select <index|id>    Select a market channel
/channel remove <index|id>    Remove a market channel
/channel login <user> <pass>  Login to selected channel
/channel register <user> <pass>
                              Register on selected channel
/channel me                   Show selected channel account
/pack save-current <name> | <description>
                              Save active MemoPack locally
/pack install <index|id>      Install a local MemoPack
/pack delete <index|id>       Delete a local MemoPack
/pack import <path>           Import a MemoPack JSON file
/pack export active|<id> <path>
                              Export a MemoPack JSON file
/pack publish active|<index|id>
                              Publish to selected channel
/set apiKey <key>             Save API key
/set baseUrl <url>            Save OpenAI-compatible API base URL
/set model <id>               Save chat model
/set compactModel <id>        Save memo compact model
/set reasoning on|off         Toggle reasoning request
/system <text>                Replace system prompt
/rule add <title> | <rule>    Add a memo update rule
/rule del <index>             Delete a memo rule
/memo set <index> <text>      Manually set memo content
/compact                      Update memos from current chat and archive the chat
/new                          Save current session and start a blank chat
/save                         Save current chat as a session
/load <number>                Load a session from /sessions
/delete <number>              Delete a session from /sessions
/reasoning                    Toggle reasoning display
/clear                        Clear current chat without saving
/quit                         Exit
```

## MemoPack Market

MemoPack Market data is stored under the same data directory as chat state. Channels are saved in `channels.json`, local packs are saved as individual JSON files under `packs/`, and tokens are stored in plain JSON. A new data directory starts with `https://n0n4w3.cn:8080` as the selected default channel.

Open the market or add another remote market channel:

```text
/market
/channel add https://market.example.com
/channel select 1
```

Authenticate with the selected channel:

```text
/channel register alice correct-horse-battery-staple
/channel login alice correct-horse-battery-staple
/channel me
```

Save, install, delete, import, and export local MemoPacks:

```text
/pack save-current Research Pack | Notes and update rules for research chats
/pack install 1
/pack delete 1
/pack import ./packs/research.json
/pack export active ./active-pack.json
/pack export 1 ./research-pack.json
```

Fetch, search, install, publish, and delete remote packs:

```text
/market remote
/market search research
/market install 1
/pack publish active
/pack publish 1
/market delete <remote-pack-id>
```

## Development

Runtime has no dependencies. For type checking:

```bash
npm install
npm run check
```

Quick environment check:

```bash
npm run doctor
```
