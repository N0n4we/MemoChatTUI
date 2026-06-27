## ADDED Requirements

### Requirement: Command discovery
The system SHALL provide terminal-native command discovery for existing and new user actions.

#### Scenario: Opening the command palette
- **WHEN** the user presses the command palette shortcut
- **THEN** the system displays an overlay listing available actions with names, descriptions, and shortcut hints when available.

#### Scenario: Filtering commands
- **WHEN** the user types a filter while the command palette is open
- **THEN** the system narrows the visible actions by command name, alias, or description while preserving keyboard selection.

#### Scenario: Executing a command palette action
- **WHEN** the user confirms a selected command palette action
- **THEN** the system invokes the same application behavior as the equivalent slash command or controller action.

#### Scenario: Preserving slash command access
- **WHEN** the user enters an existing documented slash command
- **THEN** the system executes that command without requiring use of the command palette.

### Requirement: Editable prompt input
The system SHALL provide an editable prompt buffer suitable for chat messages and slash commands.

#### Scenario: Cursor navigation in prompt
- **WHEN** the user presses left, right, home, end, `Ctrl-A`, or `Ctrl-E` while the prompt is focused
- **THEN** the system moves the prompt cursor without changing prompt content.

#### Scenario: Prompt deletion shortcuts
- **WHEN** the user presses backspace, delete, `Ctrl-K`, `Ctrl-U`, or `Ctrl-W` while the prompt is focused
- **THEN** the system removes the corresponding character, range, line segment, or previous word from the prompt buffer.

#### Scenario: Prompt history recall
- **WHEN** the prompt is focused, no overlay is active, and the user requests previous or next history
- **THEN** the system replaces the prompt buffer with the matching previous or next submitted prompt.

#### Scenario: Multi-line prompt entry
- **WHEN** the user inserts a prompt newline through a supported key sequence
- **THEN** the system keeps editing the prompt instead of submitting it.

#### Scenario: Prompt submission
- **WHEN** the user presses Enter without requesting a prompt newline
- **THEN** the system submits the complete prompt buffer and clears the prompt after accepting it.

### Requirement: Slash command completion
The system SHALL assist slash-command entry without changing the underlying command names.

#### Scenario: Showing slash command suggestions
- **WHEN** the prompt buffer starts with `/` and contains a partial command
- **THEN** the system displays matching commands with brief descriptions.

#### Scenario: Completing a slash command
- **WHEN** slash command suggestions are visible and the user accepts a suggestion
- **THEN** the system replaces the partial command with the selected command while leaving any remaining arguments editable.

#### Scenario: Hiding suggestions
- **WHEN** the prompt buffer no longer starts with `/` or the user dismisses suggestions
- **THEN** the system hides slash command suggestions and returns focus to normal prompt editing.

### Requirement: Selectable list workflows
The system SHALL support keyboard-selectable workflows for list-oriented views.

#### Scenario: Selecting a session
- **WHEN** the user opens the session picker
- **THEN** the system displays saved sessions as selectable rows with title, message count, updated time, and active-session marker.

#### Scenario: Loading a selected session
- **WHEN** the user confirms a session row in the session picker
- **THEN** the system loads that session using the same behavior as `/load <number|id>`.

#### Scenario: Selecting a MemoPack
- **WHEN** the user opens a local or remote MemoPack picker
- **THEN** the system displays available packs as selectable rows with name, description, rule count, memo count, and source context.

#### Scenario: Installing a selected MemoPack
- **WHEN** the user confirms a MemoPack row for installation
- **THEN** the system installs that pack using the same behavior as the corresponding `/pack install` or `/market install` command.

#### Scenario: Selecting a market channel
- **WHEN** the user opens the channel picker
- **THEN** the system displays configured channels as selectable rows with selected-channel and authentication state.

### Requirement: Confirmation for destructive actions
The system SHALL require explicit confirmation before destructive list actions triggered through the keyboard-driven UI.

#### Scenario: Confirming session deletion
- **WHEN** the user chooses to delete a session through a picker or palette action
- **THEN** the system displays a confirmation overlay naming the session before deletion occurs.

#### Scenario: Cancelling destructive action
- **WHEN** a destructive confirmation overlay is visible and the user cancels it
- **THEN** the system closes the overlay without deleting sessions, packs, remote packs, or channels.

#### Scenario: Confirming destructive action
- **WHEN** a destructive confirmation overlay is visible and the user confirms it
- **THEN** the system performs the requested deletion through the existing controller behavior and reports the result in the status area.

### Requirement: Responsive terminal layout
The system SHALL adapt the TUI layout to terminal dimensions while preserving readable content.

#### Scenario: Rendering on narrow terminals
- **WHEN** the terminal width is below the side-panel threshold
- **THEN** the system renders one main content column and folds contextual state into the header or footer.

#### Scenario: Rendering on wide terminals
- **WHEN** the terminal width is at or above the side-panel threshold
- **THEN** the system renders a contextual side panel without reducing the main content below its minimum readable width.

#### Scenario: Resizing terminal
- **WHEN** the terminal size changes
- **THEN** the system recomputes layout, visible content height, prompt height, overlay bounds, and scroll limits without overlapping UI regions.

#### Scenario: Content width safety
- **WHEN** content, labels, commands, or model names exceed their available width
- **THEN** the system truncates or wraps them so rendered text does not overflow into adjacent UI regions.

### Requirement: Contextual status and progress
The system SHALL expose current status, progress, and key context without requiring the user to leave the active view.

#### Scenario: Showing busy state
- **WHEN** a chat request, compaction, remote fetch, publish, delete, login, or register operation is running
- **THEN** the system shows busy state and relevant progress or operation label in the header or footer.

#### Scenario: Showing configuration health
- **WHEN** required chat configuration such as API key or model is missing
- **THEN** the system shows a visible setup hint and routes the relevant setup action through command discovery or existing slash commands.

#### Scenario: Showing active memory context
- **WHEN** the TUI renders the main layout
- **THEN** the system exposes active MemoPack summary information such as rule count, memo count, and non-empty memo count in a contextual area.

#### Scenario: Showing market context
- **WHEN** market state exists
- **THEN** the system exposes selected channel and authentication state in a contextual area without revealing full secret tokens.

### Requirement: Visual hierarchy and accessibility
The system SHALL render terminal content with clear hierarchy while preserving accessibility and no-color compatibility.

#### Scenario: Rendering chat transcript
- **WHEN** chat messages are displayed
- **THEN** the system visually distinguishes user messages, assistant messages, pending assistant output, and optional reasoning content using labels, spacing, and color-safe styling.

#### Scenario: Rendering selected rows
- **WHEN** a list row is selected
- **THEN** the system marks the row with both a non-color indicator and terminal styling when color is enabled.

#### Scenario: Respecting no-color mode
- **WHEN** `NO_COLOR` is set
- **THEN** the system renders all information, selections, warnings, and errors without relying on ANSI color.

#### Scenario: Displaying errors
- **WHEN** an operation fails
- **THEN** the system displays a concise error in the status area and preserves existing local state unless the underlying command already completed a change.

### Requirement: Scroll behavior
The system SHALL provide predictable transcript and list scrolling.

#### Scenario: Following latest chat output
- **WHEN** the user has not manually scrolled away from the bottom
- **THEN** the system keeps the visible transcript pinned to the latest output during streaming.

#### Scenario: Preserving manual scroll
- **WHEN** the user scrolls away from the bottom
- **THEN** the system preserves the manual scroll position across renders until the user returns to the bottom or submits a new prompt.

#### Scenario: Scrolling overlays
- **WHEN** an overlay contains more rows than its visible height
- **THEN** the system scrolls the overlay list to keep the selected row visible.

### Requirement: TUI regression verification
The system SHALL include focused verification for high-risk terminal interaction behavior.

#### Scenario: Verifying input helpers
- **WHEN** automated checks run
- **THEN** prompt editing helpers are verified for cursor movement, deletion shortcuts, history recall, newline insertion, and submission behavior.

#### Scenario: Verifying command metadata
- **WHEN** automated checks run
- **THEN** documented slash commands and command palette entries are verified for coverage and stable labels.

#### Scenario: Verifying layout bounds
- **WHEN** automated checks run for representative narrow and wide terminal dimensions
- **THEN** generated header, content, footer, prompt, side panel, and overlay lines fit within their assigned bounds.
