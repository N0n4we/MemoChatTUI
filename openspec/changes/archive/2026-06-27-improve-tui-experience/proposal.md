## Why

MemoChatTUI already covers chat, memory, sessions, settings, and MemoPack Market workflows, but the current terminal experience relies heavily on remembered slash commands and a single-line input. Improving the TUI now will make the existing feature set easier to discover, navigate, and use without changing the underlying chat or market behavior.

## What Changes

- Add terminal-native interaction affordances inspired by opencode's TUI patterns: contextual help, command discovery, keyboard shortcuts, selectable lists, and richer status surfaces.
- Improve prompt input from append-only single-line text to an editable prompt buffer with cursor movement, history recall, multi-line input, and command completion.
- Add lightweight dialog/overlay flows for command palette, session selection, MemoPack selection, channel selection, and confirmations.
- Improve layout responsiveness with a clearer header, scrollable transcript, footer/status area, and optional contextual side panel on wide terminals.
- Add visual hierarchy for chat messages, reasoning, memo state, sessions, market results, busy/progress states, and error feedback.
- Preserve the existing slash-command contract so current workflows remain scriptable and familiar.

## Capabilities

### New Capabilities
- `tui-experience`: Terminal interaction, navigation, command discovery, input editing, layout, and visual feedback for MemoChatTUI.

### Modified Capabilities
- None.

## Impact

- Affected code: `src/terminal.ts`, `src/app.ts`, `src/types.ts`, `src/utils.ts`, README command documentation, and focused test or fixture utilities if added.
- Runtime behavior: existing commands remain valid; new keyboard-driven flows call the same controller operations where possible.
- Dependencies: prefer keeping runtime dependency-free; any proposed dependency must be justified against the current pure TypeScript/Node built-in approach.
- External systems: no changes to LLM APIs, MemoPack Market HTTP APIs, or persisted data formats are required.
