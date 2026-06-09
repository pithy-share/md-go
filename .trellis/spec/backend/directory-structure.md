# Directory Structure

> How backend code is organized in this project.

---

## Overview

This is a Wails v2 project with a Go backend. The root package is `main`, and all domain logic lives under `internal/`. The `app.go` file is a thin Wails binding facade — it never contains business logic, only forwards calls to `internal/` services.

---

## Directory Layout

```
md-go/
├── main.go                    # Wails bootstrap + local-image HTTP middleware
├── app.go                     # Wails binding surface (thin facade)
├── internal/
│   ├── models/
│   │   └── models.go          # All DTOs shared between backend and frontend
│   ├── config/
│   │   └── service.go         # App config persistence (config.json)
│   ├── files/
│   │   └── service.go         # Document CRUD, folder scanning, recent files
│   └── export/
│       └── service.go         # HTML export to local filesystem
├── frontend/                  # React + TypeScript frontend (Wails frontend)
└── build/                     # Wails build output
```

---

## Module Organization

- **Each domain has its own package** under `internal/` (config, files, export).
- **Each domain package has exactly one file**: `service.go`, which contains a struct `Service` with all methods for that domain.
- **DTOs are centralized** in `internal/models/models.go` — every data structure exchanged between Go and the frontend JS/TS lives there.
- **No sub-packages within domains** — the codebase is flat inside each `internal/<domain>/` directory.
- **`app.go` is a facade only**: it creates `Service` instances in `NewApp()`, sets context in `startup()`, and forwards every Wails-bound method to the corresponding service. No domain logic, no error handling, no transformation.

Example of how a Wails-bound method forwards to a service:

```go
// app.go:48-50
func (a *App) OpenDocument() (models.DocumentPayload, error) {
    return a.files.OpenDocument()
}
```

When adding a new feature domain:
1. Create `internal/<domain>/service.go` with a `Service` struct.
2. Add its DTOs to `internal/models/models.go` if needed.
3. Wire it into `app.go`: add a field to the `App` struct, initialize in `NewApp()`, forward the method.

---

## Naming Conventions

- **Service structs**: exported `Service` in each `internal/<domain>/` package. Constructor is `NewService(...)`.
- **Wails-bound methods**: exported methods on `App`, named with `PascalCase`, return `(value, error)` or just `value` for infallible operations.
- **Internal helpers**: unexported (lowercase) within the same file, no separate `utils/` or `helpers/` packages.
- **File names**: always `service.go` for the service file, `models.go` for DTOs.
- **Package aliases at import**: `app.go` uses aliases like `configsvc`, `filessvc`, `exportsvc` to disambiguate package names from field names.