# Drag & Drop and Custom Hotkeys

## Goal

实现两个功能：拖拽 Markdown 文件到窗口自动打开；支持用户自定义键盘快捷键。

## What I already know

### 现有基础设施 — 拖拽
- Wails v2 runtime 已暴露 `OnFileDrop(callback, useDropTarget)` API（`frontend/wailsjs/runtime/runtime.ts`）
- 拖拽后拿到文件路径，可直接调用 `ReadDocument(path)` 打开（已有 Go binding）
- 纯前端改动，不需要后端新 API

### 现有基础设施 — 自定义快捷键
- **后端已完整实现**：
  - `internal/models/models.go` 定义了 `HotkeyBinding` 结构（ID, Action, Label, Key, Ctrl, Alt, Shift, Meta, Enabled, Category）
  - `internal/hotkeys/service.go` 完整 CRUD + JSON 文件持久化（`md-go/hotkeys.json`）
  - `app.go` 已暴露 `LoadHotkeys()`、`SaveHotkeys()`、`ResetHotkeys()` 到前端
  - `models.DefaultHotkeys()` 定义 11 个默认快捷键
- **前端尚未接入**：
  - `frontend/src/types/app.ts` 缺少 `HotkeyBinding` 类型
  - `App.tsx` 的全局 `handleKeyDown` 是硬编码的，未从后端加载
  - 无设置 UI

## Requirements

- [x] 拖拽 .md 文件到窗口时自动打开该文件（不切换 workspace）
- [x] 工具栏添加「Keyboard Shortcuts」按钮
- [x] 弹窗面板展示所有可自定义快捷键，按 category 分组
- [x] 点击快捷键行进入键盘录制模式（监听按键组合）
- [x] 支持修改/重置单个快捷键
- [x] 支持重置全部为默认
- [x] 快捷键持久化到后端（hotkeys.json）
- [x] 前端键盘事件从后端动态加载生效
- [x] 编辑器内快捷键（heading, link, inline code）也纳入热键体系

## Technical Approach

### 拖拽
- `App.tsx` 的 `useEffect` 中调用 `OnFileDrop((x, y, paths) => { ... })`
- 取 paths[0]，检查扩展名为 `.md`，调用 `ReadDocument(path)` → `loadDocument(payload)`
- 忽略非 .md 文件

### 自定义快捷键
- 前端新增 `HotkeyBinding` 类型（映射 Go struct）
- 创建 `useHotkeys` hook：启动时调用 `LoadHotkeys()`，维护内存中的 bindings 列表
- 重构 `App.tsx` 的 `handleKeyDown`：匹配当前按键组合到 bindings，执行对应 action
- 创建 `HotkeySettings.tsx` 组件：弹窗展示快捷键列表，点击行聚焦输入框进入录制模式
- 后端已有完整的 CRUD，前端直接调用

## Decision (ADR-lite)

- **拖拽**：只打开文件，不自动切换 workspace
- **快捷键设置 UI**：弹窗设置面板（非内嵌面板）
- **热键系统**：替换硬编码 keydown handler，全部从 backend 加载
- **编辑器快捷键**（Ctrl+1/2/3, Ctrl+K, Ctrl+Shift+`）也纳入绑定体系

## Out of Scope

- 快捷键组合校验（冲突检测）
- 跨文件搜索快捷键
- 和弦快捷键（如 Ctrl+K 后再按 Ctrl+S）

## Technical Notes

- `app.go` 已绑定：`LoadHotkeys`, `SaveHotkeys`, `ResetHotkeys`
- 前端 wailsjs runtime 已暴露：`OnFileDrop(callback, useDropTarget)`
- 当前 App.tsx 的 keydown handler 在 `useEffect` 中，需改为从 `LoadHotkeys()` 动态加载