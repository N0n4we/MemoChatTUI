# memopack-market Specification

## Purpose

Define terminal-native local and remote MemoPack market workflows, including channel management, pack browsing, install, publish, import, and export.

## Requirements

### Requirement: Market view and command entry
The system SHALL provide a terminal-accessible MemoPack Market view for local and remote pack workflows.

#### Scenario: Opening the market view
- **WHEN** the user enters `/market`
- **THEN** the system displays the market view with local packs, selected channel status, remote pack summary when available, and command hints.

#### Scenario: Market command help
- **WHEN** the user enters `/help`
- **THEN** the system includes market, channel, and pack management commands in the command reference.

### Requirement: Local MemoPack library
The system SHALL persist a local library of MemoPacks independently from the active chat pack.

#### Scenario: Saving active pack to library
- **WHEN** the user enters a command to save the active MemoPack with a name and description
- **THEN** the system stores a local pack containing the active system prompt, rules, memos, metadata, and timestamps.

#### Scenario: Listing local packs
- **WHEN** the user opens the market view or enters a local pack list command
- **THEN** the system displays local pack names, descriptions, update timestamps, rule counts, and memo counts.

#### Scenario: Installing a local pack
- **WHEN** the user installs a local pack by index or id
- **THEN** the system replaces the active MemoPack with that pack's system prompt, rules, and memos.

#### Scenario: Deleting a local pack
- **WHEN** the user deletes a local pack by index or id
- **THEN** the system removes the stored pack without changing the active MemoPack unless that pack is explicitly installed later.

### Requirement: MemoPack import and export
The system SHALL import and export MemoPack JSON files compatible with MemoChatTUI and desktop MemoChat field naming.

#### Scenario: Exporting a local pack
- **WHEN** the user exports a local pack or the active pack to a file path
- **THEN** the system writes a JSON file containing name, description, system prompt, rules, and memos.

#### Scenario: Importing a pack file
- **WHEN** the user imports a valid MemoPack JSON file with either camelCase or snake_case fields
- **THEN** the system normalizes and stores the pack in the local library.

#### Scenario: Rejecting invalid import
- **WHEN** the user imports a file that is not valid JSON or does not contain a usable MemoPack
- **THEN** the system leaves existing packs unchanged and displays a clear error.

### Requirement: Channel management
The system SHALL manage multiple remote MemoPack market channels.

#### Scenario: Seeding the default channel on first startup
- **WHEN** the TUI initializes a new data directory without an existing channels file
- **THEN** the system stores `https://n0n4w3.cn:8080` as the selected default channel without authentication.

#### Scenario: Adding a channel
- **WHEN** the user adds a channel URL
- **THEN** the system fetches server information, stores the channel URL, display name, description, and a local channel id.

#### Scenario: Selecting a channel
- **WHEN** the user selects a stored channel by index or id
- **THEN** the system marks it as the active channel for remote market commands.

#### Scenario: Removing a channel
- **WHEN** the user removes a stored channel
- **THEN** the system deletes its URL, user name, token, and metadata from local storage.

### Requirement: Channel authentication
The system SHALL support register, login, and token persistence for each channel.

#### Scenario: Registering on a channel
- **WHEN** the user registers with username and password for the selected channel
- **THEN** the system calls the channel register endpoint and stores the returned token and username when provided.

#### Scenario: Logging in to a channel
- **WHEN** the user logs in with username and password for the selected channel
- **THEN** the system calls the channel login endpoint and stores the returned token and username.

#### Scenario: Showing authenticated user
- **WHEN** the selected channel has a stored token and the user requests account status
- **THEN** the system calls the channel me endpoint and displays the authenticated username or an authentication error.

### Requirement: Remote pack browsing
The system SHALL browse remote MemoPacks from the selected channel using the existing market API contract.

#### Scenario: Fetching remote packs
- **WHEN** the user requests remote packs for the selected channel
- **THEN** the system calls `/api/memo-packs` with page, limit, search, and tag parameters as applicable.

#### Scenario: Displaying remote packs
- **WHEN** remote pack data is returned
- **THEN** the system displays pack identifiers, names, descriptions, authors when present, and summary counts in the market view.

#### Scenario: Handling remote fetch failure
- **WHEN** the selected channel is unreachable or returns an error
- **THEN** the system preserves existing local state and displays the error in the status line.

### Requirement: Remote pack installation
The system SHALL install a remote MemoPack into the active MemoPack after validating and normalizing its content.

#### Scenario: Installing remote pack
- **WHEN** the user installs a remote pack by index or id from the latest fetched results
- **THEN** the system replaces the active MemoPack with that pack's system prompt, rules, and memos.

#### Scenario: Rejecting malformed remote pack
- **WHEN** the selected remote pack does not include usable system prompt, rules, or memo content
- **THEN** the system leaves the active MemoPack unchanged and displays a validation error.

### Requirement: Remote pack publishing
The system SHALL publish local or active MemoPacks to an authenticated selected channel.

#### Scenario: Publishing a local pack
- **WHEN** the user publishes a local pack while the selected channel has a token
- **THEN** the system sends the pack name, description, system prompt, rules, and memos to `/api/memo-packs`.

#### Scenario: Publishing without authentication
- **WHEN** the user attempts to publish without a selected channel token
- **THEN** the system does not call the remote endpoint and instructs the user to login or register first.

### Requirement: Remote pack deletion
The system SHALL delete remote MemoPacks through the selected channel when authenticated.

#### Scenario: Deleting remote pack
- **WHEN** the user deletes a remote pack by id while authenticated
- **THEN** the system calls `DELETE /api/memo-packs/:id` and refreshes remote results after success.

#### Scenario: Delete authorization failure
- **WHEN** the server rejects a remote delete request
- **THEN** the system displays the server error and keeps the local remote results until the next successful refresh.
