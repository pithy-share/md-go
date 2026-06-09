# Error Handling

> How errors are handled in this project.

---

## Overview

The dominant pattern is **return errors directly without wrapping**. The codebase uses only `errors.New` for creating known error conditions, and passes system errors (from `os.ReadFile`, `os.WriteFile`, etc.) straight through without `fmt.Errorf` or `%w` wrapping. There is no custom error type hierarchy.

---

## Error Types

No custom error types exist. The codebase uses:

- **`errors.New("message")`** for known, expected error conditions (e.g., missing context, invalid input).
- **System errors** from the standard library (`os.ErrNotExist`, `os.Stat` errors, JSON decode errors) returned as-is.
- **`nil` error** for non-error conditions like user-cancelled file dialogs.

Examples of `errors.New` usage:

```go
// internal/files/service.go:60
return models.DocumentPayload{}, errors.New("application context is not ready")

// internal/files/service.go:97
return models.Workspace{}, errors.New("path is required")

// internal/files/service.go:106
return models.Workspace{}, errors.New("path is not a folder")

// internal/export/service.go:36
return models.SaveResult{}, errors.New("application context is not ready")

// internal/export/service.go:39
return models.SaveResult{}, errors.New("html content is required")
```

---

## Error Handling Patterns

### Pattern 1: Direct Return (dominant)

Errors from system calls are returned as-is:

```go
// internal/files/service.go:176-178
data, err := os.ReadFile(path)
if err != nil {
    return models.DocumentPayload{}, err
}
```

### Pattern 2: Silent Fallback (config loading)

Config loading intentionally swallows errors and returns defaults:

```go
// internal/config/service.go:46-56
data, err := os.ReadFile(s.path)
if errors.Is(err, os.ErrNotExist) {
    return DefaultConfig(), nil  // file missing → defaults, no error
}
if err != nil {
    return DefaultConfig(), err  // read error → defaults + error
}
config := DefaultConfig()
if err := json.Unmarshal(data, &config); err != nil {
    return DefaultConfig(), nil  // parse error → defaults, no error
}
```

### Pattern 3: Swallowed Errors in Loops

During directory scanning, individual entry errors are silently skipped:

```go
// internal/files/service.go:115-117, 134-136
// Errors from os.Stat or os.ReadDir on individual entries are ignored;
// only the file/dir count matters for the result.
```

### Pattern 4: File Dialog Cancellation

When the user cancels a file dialog, the method returns a zero-value struct with `nil` error — this is NOT treated as an error:

```go
// internal/files/service.go:70-71
if payload.Path == "" {
    return models.DocumentPayload{}, nil  // user cancelled
}
```

### Pattern 5: Wails Method Signatures

Every Wails-bound method on `App` returns `(T, error)` and the `App` method simply forwards the service result without inspection or transformation:

```go
// app.go:40-41
func (a *App) OpenDocument() (models.DocumentPayload, error) {
    return a.files.OpenDocument()
}
```

### Pattern 6: HTTP Middleware Errors

The only non-Wails error path is the local-image HTTP middleware, which uses `http.Error`:

```go
// main.go:63-65
imagePath, err := resolveLocalImagePath(documentPath, source)
if err != nil {
    http.Error(response, err.Error(), http.StatusBadRequest)
    return
}
```

Image path resolution maps invalid/remote/missing images to `os.ErrNotExist`:

```go
// main.go:78, 102, 110
return "", os.ErrNotExist
```

---

## API Error Responses

The Wails runtime handles serializing Go `error` values to the frontend. The frontend receives errors through the standard Wails JS binding:

```js
// frontend/wailsjs/go/main/App.js:21-22
export function OpenDocument() {
    return window['go']['main']['App']['OpenDocument']();
}
```

There is no standardized error response envelope — errors are plain Go `error` values, and the frontend must handle them via the Wails promise rejection mechanism.

---

## Common Mistakes

- **Don't use `fmt.Errorf` with `%w`** — the codebase doesn't use error wrapping. Follow the existing pattern of direct returns.
- **Don't panic** — there are no `panic()` calls in the codebase. All errors flow through return values.
- **Don't log errors before returning them** — the codebase returns errors to the caller (ultimately Wails), and errors are not logged server-side.
- **Config loading is intentionally lenient** — missing or corrupt config files silently fall back to defaults. Don't make config loading stricter without a deliberate decision.