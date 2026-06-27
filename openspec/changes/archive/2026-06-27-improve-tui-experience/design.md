## Context

MemoChatTUI currently uses a dependency-free Node terminal renderer in `src/terminal.ts`. It renders a header, a scrollable content area, a status line, and a single-line prompt, while `AppController` in `src/app.ts` owns application state and slash-command execution.

The existing architecture is small and valuable: chat, memory, sessions, settings, and MemoPack Market behavior all flow through one controller and remain scriptable through slash commands. The experience gap is mostly in the terminal interaction layer: commands are hard to discover, lists are read-only until the user types an index, prompt editing is minimal, and all views share the same flat content model.

opencode's TUI is a useful reference for experience patterns rather than a technology template. Its relevant patterns are command discovery, keybinding descriptions, selectable dialogs, richer prompt editing, contextual footer/status data, responsive sidebars, and visible progress/permission/question states. MemoChatTUI should adapt those ideas in a much smaller dependency-free form.

Current shape:

```text
+----------------------------------------------+
| header: app | view | model                   |
+----------------------------------------------+
| content lines from current view              |
|                                              |
|                                              |
+----------------------------------------------+
| status + static help                         |
| > append-only input                          |
+----------------------------------------------+
```

Target shape:

```text
+------------------------------------------------------------+
| MemoChatTUI  chat  model:z-ai/glm-5      memos:3 busy:off  |
+--------------------------------------+---------------------+
| transcript / active view             | context side panel  |
| selectable rows where useful         | hidden on narrow tty|
| command palette or picker overlay    |                     |
+--------------------------------------+---------------------+
| status, progress, selected item, command hint, scroll       |
| > editable multi-line prompt / command completion           |
+------------------------------------------------------------+
```

## Goals / Non-Goals

**Goals:**

- Improve discoverability for commands and actions without removing slash commands.
- Make prompt entry comfortable for real chat: cursor movement, deletion shortcuts, history recall, multi-line input, and command completion.
- Add keyboard-selectable flows for sessions, MemoPacks, channels, remote packs, and confirmations.
- Improve visual hierarchy and responsive layout while keeping rendering deterministic and dependency-free.
- Keep controller/business operations reusable from both typed commands and keyboard-driven UI actions.
- Add enough verification coverage to protect input handling, layout bounds, command routing, and existing command compatibility.

**Non-Goals:**

- Replacing the current terminal renderer with opencode's Solid/OpenTUI stack.
- Changing LLM request behavior, MemoPack Market HTTP contracts, or persisted JSON formats.
- Adding mouse support, plugins, file attachments, external editor integration, or a full configurable keymap in this change.
- Reworking the application into multiple services or introducing a daemon/server.

## Decisions

### Keep slash commands as the stable command contract

Keyboard actions and dialogs should dispatch to existing controller methods or the same command handling path. The existing `/market`, `/pack`, `/channel`, `/load`, `/delete`, `/set`, `/rule`, and `/memo` workflows remain valid.

Alternative considered: replace typed commands with direct UI-only actions. That would make the TUI easier for new users but would break the current scriptable and documented model. Keeping slash commands gives users both paths.

### Add a small terminal UI state layer

`TerminalUi` should own interaction-only state such as prompt buffer, cursor position, input history index, active overlay, selected row, list filter, scroll intent, and side panel visibility. `AppState` should only grow when the controller needs to expose semantic state that renderers can use, such as selected item identifiers or richer progress messages.

Alternative considered: move all selection and prompt state into `AppController`. That would blur business state with ephemeral terminal state and make future non-terminal surfaces harder.

### Introduce reusable render model helpers before adding complex views

The renderer should move from ad hoc string arrays toward small reusable primitives:

- `LineBuffer` or equivalent helpers for width-aware rows.
- Section builders for title/value rows, selectable lists, and empty states.
- Overlay builders for command palette, list picker, confirmation, and inline command completion.
- Shared layout math for content, footer, prompt, and optional side panel.

Alternative considered: keep expanding `buildContentLines`. That is fastest initially but will become difficult once overlays, selection, and side panels need to share width and focus behavior.

### Implement a practical prompt editor, not a full text editor

The prompt should support:

- cursor left/right, home/end, backspace/delete;
- `Ctrl-A`, `Ctrl-E`, `Ctrl-K`, `Ctrl-U`, `Ctrl-W`;
- input history with up/down when not selecting overlay items;
- multi-line insertion with `Shift-Enter`, `Alt-Enter`, or `Ctrl-J` when detectable;
- command completion when the buffer starts with `/`;
- safe paste handling as plain text.

Alternative considered: depend on a terminal textarea library. This project currently has zero runtime dependencies, and the first version can cover high-value editing behavior directly with Node keypress events.

### Use overlays for discovery and selection

Add a minimal overlay system with a title, filter/input area, selectable rows, footer hints, and optional confirmation message. Initial overlays:

- command palette, opened by `Ctrl-P` and searchable by command name/description;
- session picker, reachable from the command palette and `/sessions` view;
- local/remote MemoPack picker and channel picker;
- destructive action confirmation for deleting sessions, packs, remote packs, and channels.

Alternative considered: create separate full-screen views for every picker. Overlays preserve context and reduce round trips back to the original view.

### Add a responsive side panel without making it required

On wide terminals, show a right-side context panel with compact status: active MemoPack summary, selected channel/auth state, session count, model/config health, and current view hints. On narrow terminals, fold this information into the footer/status and keep the full width for content.

Alternative considered: always show a sidebar. That would hurt small terminals and SSH sessions, where MemoChatTUI should remain comfortable.

### Keep color conservative and accessible

Continue honoring `NO_COLOR`, avoid meaning that only color conveys, and use simple ANSI styles already present or small additions such as green/yellow/red/dim/bold/inverse. Selection should be visible through markers and inverse styling.

Alternative considered: add theme files like opencode. Themes are valuable later, but this change should prioritize interaction and layout first.

## Risks / Trade-offs

- [Risk] Prompt editing can conflict with scroll/list navigation on arrow keys. -> Mitigation: define focus modes clearly: overlay selection consumes arrows, command completion consumes arrows, otherwise prompt history uses up/down and transcript scrolling uses page/home/end plus explicit shortcuts.
- [Risk] More UI state may make `TerminalUi` hard to test. -> Mitigation: extract pure helpers for input editing, command matching, list filtering, and layout slicing.
- [Risk] Multi-line input key detection varies by terminal. -> Mitigation: support `Ctrl-J` as a reliable newline path and document additional combinations as best-effort.
- [Risk] Overlays may obscure busy/progress feedback. -> Mitigation: keep busy/progress visible in header/footer and prevent actions that would overlap active network or LLM operations.
- [Risk] A richer UI can accidentally break existing slash commands. -> Mitigation: add compatibility checks that all documented commands remain present and routed.

## Migration Plan

No data migration is required. Implementation can be shipped incrementally:

1. Extract pure input/layout/command metadata helpers while preserving current rendering.
2. Add prompt editor and command metadata.
3. Add command palette and selection overlays that dispatch existing commands.
4. Improve layout, side panel, and visual hierarchy.
5. Update README and verification coverage.

Rollback is straightforward: the change is confined to terminal rendering/input code and documentation. Persisted config, sessions, memories, channels, and packs remain unchanged.

## Open Questions

- Should the command palette key be `Ctrl-P` to match opencode, or should it be configurable from the start?
- Should `Ctrl-C` clear prompt input when text is present and exit only when input is empty, or should it always exit as today?
- What exact width threshold should enable the side panel by default, and should the first implementation include a manual toggle?
