# App Optimization Design

## Goal

Reduce `frontend/src/App.tsx` responsibility and visible language inconsistency while improving backend filename validation and PDF export failure behavior.

## Current Context

`App.tsx` currently owns tab state, workspace operations, config persistence, session restore, hotkeys, export actions, workspace search, editor wiring, and layout rendering. Go backend workspace mutations validate names with a character blacklist, which misses Windows reserved names, control characters, and trailing dot or space cases. PDF export depends on an installed Chromium browser and currently returns an error if no suitable browser exists or printing fails.

## Chosen Approach

Use focused React hooks and a lightweight local i18n dictionary. Do not add a third-party state management library in this pass.

This keeps the migration small enough to verify with existing build and Go tests. The hook split should preserve existing Wails API calls and avoid changing editor behavior. The i18n layer will default to Chinese and expose a single `t(key, values?)` helper that can later support language switching without touching every component again.

## Frontend Architecture

Create these units:

- `frontend/src/hooks/useTabs.ts`: owns `tabs`, `activeTabIndex`, active tab updates, tab close/reorder/lock helpers, dirty confirmation, and tab path updates after workspace rename/move/delete.
- `frontend/src/hooks/useAppConfig.ts`: owns config loading, normalization, persistence helpers, workspace session state application, theme effects, and app-height effect.
- `frontend/src/hooks/useWorkspaceActions.ts`: owns opening folders, refreshing workspace, creating/renaming/moving/deleting workspace items, and syncing affected open tabs through callbacks provided by `useTabs`.
- `frontend/src/hooks/useWorkspaceSearch.ts`: owns workspace search dialog state, query debounce, result loading, and open-result cleanup.
- `frontend/src/state/workspaceSession.ts`: moves pure session/path helpers out of `App.tsx`.
- `frontend/src/i18n.ts`: provides Chinese labels/messages through `t()`.

`App.tsx` remains responsible for composing hooks, editor refs, hotkey dispatch, export actions, and rendering. This intentionally avoids moving editor-specific behavior until the larger state split is stable.

## i18n Scope

Default visible UI text becomes Chinese in the touched frontend surface:

- Toolbar titles and auto-save label.
- Start page actions and recent area text.
- Sidebar workspace labels, empty states, prompts, and context menu text.
- Status bar save state text.
- Command palette labels and command descriptions.
- Workspace search labels and empty/loading states.
- App toast/status messages and browser confirm/prompt strings.
- Hotkey settings visible text.

Internal action IDs, type names, CSS classes, and persisted config values stay in English.

## Backend Validation

Add a shared validator in `internal/files/service.go` and reuse it for:

- `CreateWorkspaceFile`
- `CreateWorkspaceFolder`
- `RenameWorkspaceItem`

Validation rejects:

- Empty or whitespace-only names.
- Path separators and Windows-invalid characters.
- ASCII control characters.
- Names ending with a space or dot.
- Windows reserved device names, including names with extensions: `CON`, `PRN`, `AUX`, `NUL`, `COM1` through `COM9`, and `LPT1` through `LPT9`.

Existing workspace-root containment checks remain the final path safety boundary.

## PDF Export Fallback

`ExportPDF` keeps the current Chromium print path. If browser discovery fails or printing fails after the save path is chosen, the backend writes the prepared HTML next to the requested PDF path, using the same base name with `.html`. It returns a `SaveResult` whose path/name point to the HTML fallback file. The frontend reports that PDF failed and HTML was exported instead.

Cancellation still returns an empty result. HTML preparation or filesystem write errors still return errors.

## Testing

Add focused Go tests:

- Workspace name validator rejects Windows reserved names, trailing dots/spaces, separators, invalid characters, and control characters.
- Workspace name validator allows normal Markdown names and Unicode names.
- PDF fallback path helper maps `note.pdf` and extensionless paths to the expected `.html` fallback path.

Run:

- `go test ./...`
- `npm run build` in `frontend`

## Non-Goals

Do not migrate to Zustand or another state library in this pass. Do not redesign visual layout. Do not change editor document parsing, TipTap configuration, or persisted config schema beyond reusing existing config fields.
