## Why

MemoChatTUI currently supports local chat, memories, and sessions, but it cannot browse, install, publish, or share MemoPacks from the original MemoChat market workflow. Adding a TUI-native MemoPack Market brings the desktop app's reusable memory-pack ecosystem into the standalone terminal client.

## What Changes

- Add a `/market` view for browsing local and remote MemoPacks in the terminal UI.
- Add channel management for OpenAI-compatible MemoPack market servers, including add/remove/select and persisted authentication tokens.
- Add remote account actions for channel register/login and authenticated publish/delete operations.
- Add local MemoPack library operations: create/edit/delete/install, import from the active pack, and export/import JSON files.
- Add remote MemoPack operations: list/search/fetch, install into the active MemoPack, publish local packs, and delete owned remote packs.
- Preserve the existing local chat, memo, session, and compact behavior.

## Capabilities

### New Capabilities
- `memopack-market`: Terminal-native local and remote MemoPack market workflows, including channel management, pack browsing, install, publish, import, and export.

### Modified Capabilities
- None.

## Impact

- Affected code: `src/app.ts`, `src/terminal.ts`, `src/store.ts`, new market API/service modules, and README command documentation.
- Data model: extend local JSON storage with channel credentials, local MemoPack library files, and selected market view state.
- External systems: user-configured MemoPack market/channel servers using the existing HTTP API shape from MemoChat.
- Dependencies: keep runtime dependency-free if practical; use Node built-ins for fetch, file IO, and terminal rendering.
