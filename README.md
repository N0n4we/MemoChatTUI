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
