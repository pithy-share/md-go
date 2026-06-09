# Logging Guidelines

> How logging is done in this project.

---

## Overview

This project **does not use a logging library**. There is no structured logging, no log levels, and no log output configuration. Errors are returned to callers (ultimately the Wails runtime) rather than logged locally.

The only output that resembles logging is a single `println` call for fatal startup failure:

```go
// main.go:40-41
if err != nil {
    println("Error:", err.Error())
}
```

---

## Log Levels

Not applicable — no logging framework is used.

If logging is added in the future, the project likely needs only two levels:
- **Error**: unrecoverable failures (startup errors)
- **Info**: significant state changes (config saved, file exported)

Debug/trace logging is not needed for this application's current scope.

---

## Structured Logging

Not applicable — no structured logging exists.

---

## What to Log

Currently, only one event is "logged": Wails application startup failure.

If logging is added, important events to capture:
- Application startup completion
- Config file load/save failures (currently silently swallowed)
- File I/O errors that are returned to the user

---

## What NOT to Log

- **User document content** — Markdown content must never appear in logs.
- **File paths** — could leak user directory structure and personal information.
- **PII** of any kind — this is a desktop application with access to the user's filesystem.