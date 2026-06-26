## 1. Market Data Model and Storage

- [x] 1.1 Add market-related types for channels, local MemoPack records, remote MemoPack records, publish payloads, and market view state.
- [x] 1.2 Extend `JsonStore` paths and initialization for `channels.json` and `packs/`.
- [x] 1.3 Implement channel load/save helpers with selected channel persistence and token-safe normalization.
- [x] 1.4 Implement local pack list/load/save/delete helpers using one JSON file per pack.
- [x] 1.5 Implement pack normalization utilities that accept both camelCase and desktop-compatible snake_case fields.
- [x] 1.6 Implement pack validation helpers that reject malformed imported or remote packs without changing existing state.

## 2. Remote Market API Client

- [x] 2.1 Add a dependency-free `market-api` module using Node `fetch`.
- [x] 2.2 Implement `fetchServerInfo`, `registerOnServer`, `loginOnServer`, `getMe`, `listMemoPacks`, `publishMemoPack`, and `deleteRemoteMemoPack`.
- [x] 2.3 Normalize remote list responses, including pagination fields and optional author/count metadata.
- [x] 2.4 Surface HTTP, JSON parsing, authentication, and connectivity errors as user-readable messages.

## 3. Controller Commands and State

- [x] 3.1 Extend `AppState` and initialization to load channels, selected channel, local packs, and empty remote results.
- [x] 3.2 Add `/market` command handling for opening the market view, listing local packs, fetching remote packs, and searching remote packs.
- [x] 3.3 Add `/channel` subcommands for add, select, remove, register, login, and account status.
- [x] 3.4 Add `/pack` subcommands for save-current, install, delete, import, export, and publish.
- [x] 3.5 Implement remote install from the latest fetched remote results into the active `current-pack.json`.
- [x] 3.6 Implement remote delete with authentication checks and refresh remote results after success.
- [x] 3.7 Ensure busy/status handling prevents overlapping network operations and never crashes on remote failures.

## 4. Terminal Rendering and Help

- [x] 4.1 Add `market` to the view union and terminal content dispatcher.
- [x] 4.2 Render selected channel status with masked authentication state and server metadata.
- [x] 4.3 Render local pack list with index, name, description, timestamps, rule counts, and memo counts.
- [x] 4.4 Render remote pack results with index/id, name, description, author when present, and summary counts.
- [x] 4.5 Update `/help` with market, channel, and pack commands.
- [x] 4.6 Keep existing scroll controls and status line behavior working in the market view.

## 5. Documentation and Verification

- [x] 5.1 Update README with market setup, channel authentication, local pack, import/export, publish, and install examples.
- [x] 5.2 Update `--doctor` output to include market data directory, channel count, selected channel, and local pack count.
- [x] 5.3 Verify `node --experimental-strip-types src/index.ts --help`.
- [x] 5.4 Verify `MEMOCHAT_TUI_HOME=<tmp> node --experimental-strip-types src/index.ts --doctor`.
- [x] 5.5 Verify a short interactive TUI startup still renders chat view and can switch to `/market`.
- [x] 5.6 Verify existing chat, memo, compact, session, settings, and reasoning commands remain documented and reachable.
