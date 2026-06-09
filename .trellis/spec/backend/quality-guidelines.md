# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

This is a small, single-developer Wails v2 desktop application. The codebase is clean but minimal: no tests, no CI/CD, and no automated linting. Quality is maintained through consistent conventions rather than tooling enforcement.

---

## Required Patterns

### 1. Thin App Facade

`app.go` must never contain business logic. It only:
- Creates and holds references to `internal/` services
- Forwards Wails-bound method calls to the appropriate service
- Sets the Wails context on services that need it

```go
// app.go — correct pattern
func (a *App) OpenDocument() (models.DocumentPayload, error) {
    return a.files.OpenDocument()
}
```

### 2. Internal Package Convention

All domain logic lives under `internal/`. The Go compiler enforces that external packages cannot import `internal/` packages, keeping the public API surface limited to what `app.go` exposes as Wails-bound methods.

### 3. Single Service File per Domain

Each `internal/<domain>/` package contains exactly one `service.go` file with a `Service` struct. Do not split a domain's logic across multiple files unless the service grows significantly.

### 4. DTOs in models.go

All data structures exchanged between Go and the frontend must live in `internal/models/models.go`. Do not define frontend-facing types inside service packages.

### 5. Context Propagation

Services that need the Wails application context store it as a field and expose a `SetContext` method:

```go
// internal/files/service.go
type Service struct {
    ctx context.Context
    // ...
}
func (s *Service) SetContext(ctx context.Context) {
    s.ctx = ctx
}
```

---

## Forbidden Patterns

- **No business logic in `app.go`** — `app.go` is a pure delegation layer.
- **No `panic()`** — all error paths flow through return values.
- **No direct `os.Exit()` or `log.Fatal()`** — only `main.go` may terminate the process, and even there it uses `println` + implicit exit.
- **No blocking operations in Wails-bound methods without context** — always pass the stored context if a method blocks.
- **No frontend types outside `internal/models/`** — the Wails binding generator relies on this file.
- **Don't add external ORM/database dependencies** — the project is intentionally file-based.

---

## Testing Requirements

**There are currently no tests.** The project has zero `*_test.go` files. There is no test framework configured.

If testing is added:
- Unit tests for `internal/` services would be the first priority
- `app.go` does not need tests (pure delegation)
- File I/O tests should use `t.TempDir()` for isolation
- Config serialization is the most valuable area to cover

---

## Code Review Checklist

- [ ] New logic is in `internal/<domain>/service.go`, not in `app.go`
- [ ] New frontend-facing types are in `internal/models/models.go`
- [ ] Errors are returned directly, not wrapped with `fmt.Errorf/%w`
- [ ] File operations use `os.MkdirAll` before `os.WriteFile`
- [ ] No new external dependencies without discussion
- [ ] No `panic()` or `os.Exit()` outside `main.go`