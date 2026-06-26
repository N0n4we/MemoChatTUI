## Context

MemoChatTUI is a standalone, dependency-light TypeScript terminal application. It currently keeps all state in `AppController`, renders views in `TerminalUi`, persists JSON through `JsonStore`, and uses Node's built-in `fetch` for OpenAI-compatible chat completion. The desktop MemoChat app already has a MemoPack Market HTTP API shape: each channel is a server with `/api/info`, `/api/register`, `/api/login`, `/api/me`, `/api/memo-packs`, and `/api/memo-packs/:id`.

The market feature crosses storage, network, command parsing, terminal rendering, and active MemoPack installation. It should preserve the current runtime-dependency-free posture where practical.

## Goals / Non-Goals

**Goals:**
- Add TUI-native commands and views for local and remote MemoPack market workflows.
- Reuse the desktop market API contract so existing channel servers remain compatible.
- Persist local MemoPack library entries and channel credentials under the MemoChatTUI data directory.
- Allow installing any local or remote pack into the active `current-pack.json` used by chat and compact.
- Keep network errors, authentication failures, and malformed pack data visible without crashing the TUI.

**Non-Goals:**
- Building a graphical or mouse-driven market UI.
- Implementing or changing the remote market server.
- Adding image assets, ratings, comments, or payment flows.
- Encrypting stored channel tokens beyond the current JSON storage model.
- Automatically migrating the desktop app's entire config directory.

## Decisions

1. Use a dedicated market domain layer.

   Add a `src/market-api.ts` module for HTTP calls and a `src/market.ts` or controller submodule for local market orchestration. `AppController` will expose commands and state transitions, but protocol mapping and pack normalization should stay out of terminal rendering.

   Alternative considered: put all market actions directly in `AppController`. That is faster initially but would further grow the controller and make market API behavior harder to test.

2. Extend JSON storage with explicit market files.

   Store channels in `channels.json`, local packs as individual files under `packs/`, and optional cached remote list state in memory only. Active pack installation continues to write `current-pack.json`.

   Alternative considered: store everything in `config.json`. Separate files reduce conflict risk, match the desktop app's pack-per-file model, and keep sensitive channel tokens isolated from model settings.

3. Keep terminal interaction command-first.

   Add `/market` to show local/remote lists, plus subcommands such as `/channel add`, `/channel login`, `/market search`, `/market install`, `/pack save-current`, `/pack export`, and `/pack import`. Lists remain scrollable using existing terminal scroll controls.

   Alternative considered: create modal-style multi-step forms. That would be more guided but adds state-machine complexity to the current single-line command input model.

4. Normalize pack formats at the storage boundary.

   Internal pack shape remains camelCase (`systemPrompt`, `updateRule`). Remote requests/responses and imported desktop JSON can use snake_case (`system_prompt`, `update_rule`). The store/service layer will normalize both formats.

   Alternative considered: switch the internal model to snake_case. That would create churn in existing chat and compact logic for little benefit.

5. Treat remote network state as refresh-on-command.

   `/market remote` and `/market search` fetch fresh data from the selected channel. The app does not run background polling.

   Alternative considered: background refresh. It complicates busy state and error reporting in a terminal app and is not required for a useful MVP.

## Risks / Trade-offs

- Token leakage through plain JSON storage -> Document the data directory behavior and avoid printing full tokens in settings or status lines.
- Remote API schema drift -> Normalize defensive fields and show clear errors when required pack fields are missing.
- Command surface becomes hard to discover -> Update `/help`, README, and market view inline command hints.
- Large remote lists can overwhelm the terminal -> Support search, pagination parameters, and bounded display counts.
- Import/export paths can be unsafe or confusing -> Resolve paths relative to the current working directory unless absolute, and reject directory traversal for managed pack filenames.

## Migration Plan

1. Add market types, API client, storage methods, and normalization helpers.
2. Add controller commands and state for channel, local pack, and remote pack workflows.
3. Add terminal renderers for the market view and command help.
4. Update README and doctor output to include market storage.
5. Verify existing chat/memo/session commands still work.

Rollback is straightforward: remove the new market modules and command registrations. Existing chat data remains compatible because active pack storage is unchanged.

## Open Questions

- Should export default to the current working directory or require explicit absolute/relative paths?
- Should remote delete be restricted to packs that locally indicate ownership, or should the server be the only authority?
- Should channel tokens eventually move to OS keychain storage if MemoChatTUI accepts a runtime dependency?
