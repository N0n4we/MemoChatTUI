## 1. Command Metadata and Testable UI Helpers

- [x] 1.1 Create a command metadata table covering documented slash commands, palette labels, descriptions, aliases, shortcuts, and dispatch targets.
- [x] 1.2 Refactor help rendering and README command references to consume or stay consistent with the command metadata table.
- [x] 1.3 Add terminal interaction state types for prompt cursor, prompt history, active overlay, selected row, filter text, side panel visibility, and focus mode.
- [x] 1.4 Extract pure layout helpers for visible width, content slicing, footer/prompt height allocation, side-panel thresholds, and overlay bounds.
- [x] 1.5 Extract pure list helpers for filtering, selection movement, selected-row visibility, and index/id command argument generation.

## 2. Prompt Editing and Slash Completion

- [x] 2.1 Implement an editable prompt buffer with cursor-aware insertion, backspace, delete, left/right, home/end, `Ctrl-A`, and `Ctrl-E`.
- [x] 2.2 Implement prompt editing shortcuts for `Ctrl-K`, `Ctrl-U`, `Ctrl-W`, and safe plain-text paste handling.
- [x] 2.3 Implement prompt history recall for submitted prompts without interfering with overlay or completion navigation.
- [x] 2.4 Implement multi-line prompt support with reliable `Ctrl-J` newline insertion and best-effort shifted/modified Enter handling.
- [x] 2.5 Implement slash command suggestions for `/` input using command metadata, including filtering, selection, completion, and dismissal.
- [x] 2.6 Ensure prompt submission sends the full buffer, resets prompt state, and preserves existing `AppController.submit` behavior.

## 3. Overlays, Palette, and Picker Workflows

- [x] 3.1 Implement a reusable overlay renderer with title, optional filter, selectable rows, empty state, footer hints, and bounded height.
- [x] 3.2 Implement overlay keyboard handling for up/down, page up/down, home/end, enter, escape, and filter text editing.
- [x] 3.3 Add a command palette opened by the chosen shortcut, searchable by command name, alias, and description.
- [x] 3.4 Add session picker actions for listing, loading, and initiating deletion of saved sessions through existing controller behavior.
- [x] 3.5 Add local and remote MemoPack picker actions for install flows, preserving `/pack install` and `/market install` semantics.
- [x] 3.6 Add channel picker actions for selecting configured market channels through existing controller behavior.
- [x] 3.7 Add confirmation overlays for keyboard-driven deletion of sessions, local packs, remote packs, and channels.

## 4. Responsive Layout, Status, and Visual Hierarchy

- [x] 4.1 Rework frame construction into header, main content, optional side panel, status/footer, and variable-height prompt regions.
- [x] 4.2 Add wide-terminal side panel content for MemoPack summary, selected channel/auth state, session count, model/config health, and view-specific hints.
- [x] 4.3 Add narrow-terminal fallback that folds context into header/footer and keeps main content readable.
- [x] 4.4 Improve chat transcript rendering for user/assistant labels, pending output, optional reasoning, spacing, and no-color mode.
- [x] 4.5 Improve sessions, memo, settings, and market views with selected-row markers, consistent empty states, truncation, and wrapped detail text.
- [x] 4.6 Improve busy, compacting, remote operation, setup hint, and error feedback in header/footer without exposing full secret tokens.
- [x] 4.7 Preserve follow-bottom and manual scroll behavior across streaming renders, view switches, overlays, and terminal resize events.

## 5. Documentation and Verification

- [x] 5.1 Add focused automated checks for prompt editing helpers, command filtering/completion, list selection movement, and layout bounds.
- [x] 5.2 Add automated coverage that documented slash commands remain represented in command metadata and reachable through help/palette surfaces.
- [x] 5.3 Verify representative narrow and wide layout snapshots or line arrays stay within terminal width and avoid region overlap.
- [x] 5.4 Update README with the improved keyboard shortcuts, command palette, prompt editing, picker flows, and no changes to existing slash commands.
- [x] 5.5 Run `npm run check` and any added test command.
- [x] 5.6 Manually smoke test interactive startup, command palette, prompt editing, session picker, MemoPack/channel picker, scrolling, resize behavior, and `/help`.
