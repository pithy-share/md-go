# Database Guidelines

> Database patterns and conventions for this project.

---

## Overview

This project **does not use a database**. All persistence is file-based, using the local filesystem directly. There is no ORM, no query library, no migrations system, and no SQL of any kind.

---

## File-Based Persistence

The project uses three persistence patterns, all built on standard library file I/O:

### 1. JSON Config File

Location: `os.UserConfigDir()/<appName>/config.json`

```go
// internal/config/service.go:22-29
func NewService(appName string) *Service {
    baseDir, err := os.UserConfigDir()
    if err != nil || baseDir == "" {
        baseDir = "."
    }
    return &Service{
        path: filepath.Join(baseDir, appName, "config.json"),
    }
}
```

Read: `os.ReadFile` → `json.Unmarshal`
Write: `json.MarshalIndent` → `os.WriteFile` with permissions `0o600`

### 2. Markdown Documents

Documents are read/written as plain text files via `os.ReadFile` and `os.WriteFile`:

```go
// internal/files/service.go:176-183 (read)
data, err := os.ReadFile(path)
// ...
// internal/files/service.go:205-209 (write)
if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil { ... }
if err := os.WriteFile(path, []byte(content), 0o644); err != nil { ... }
```

Directory permissions: `0o755`. File permissions: `0o644`.

### 3. HTML Export

Exported HTML is written to a user-chosen path via `os.WriteFile`:

```go
// internal/export/service.go:48-64
err = os.WriteFile(payload.OutputPath, []byte(payload.HtmlContent), 0o644)
```

### 4. Local Images

Local image files referenced in Markdown are served via `http.ServeFile` after validation:

```go
// main.go:105-110
info, err := os.Stat(imagePath)
if err != nil {
    return "", err
}
if info.IsDir() {
    return "", os.ErrNotExist
}
```

---

## Query Patterns

Not applicable — there is no query system. File operations use standard library calls directly:
- `os.ReadFile` for reads
- `os.WriteFile` for writes
- `os.MkdirAll` for directory creation
- `os.Stat` for existence/type checks

---

## Migrations

Not applicable — there is no schema to migrate. Config evolves via the `normalizeConfig()` function which fills in defaults for missing fields on load:

```go
// internal/config/service.go — normalizeConfig()
func normalizeConfig(config models.AppConfig) models.AppConfig {
    if config.Theme == "" { config.Theme = "system" }
    if config.AutoSaveDelay <= 0 { config.AutoSaveDelay = 1200 }
    // ...
}
```

---

## Common Mistakes

- **Don't introduce a database dependency** for simple key-value or document storage — the project intentionally avoids external persistence dependencies.
- **Don't forget to create parent directories** before writing files. Use `os.MkdirAll` before `os.WriteFile`.