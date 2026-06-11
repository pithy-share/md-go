# 文件导航历史与插入链接修复

## Goal

1. 用文件夹打开时，支持 Alt+左箭头 / Alt+右箭头 在已访问文件的历史记录中前后导航（类似 VS Code）
2. 修复插入链接功能：回车确认后链接未正确插入的问题；同时支持插入指向本地 .md 文件的链接

## What I already know

### 文件导航现有基础设施
- 应用是单文档编辑器，无标签页系统
- 文件打开路径包括：侧边栏点击 → `handleOpenWorkspaceFile`、打开文件对话框 → `handleOpen`、拖放 → `OnFileDrop`、点击本地 .md 链接 → `handleOpenLocalFile`
- `App.tsx` 中 workspace 状态存储文件夹文件列表，`documentState.path` 表示当前文件路径
- 无任何文件访问历史记录

### 插入链接现有基础设施
- 工具栏"Link"按钮和 Ctrl+K 快捷键都使用 `window.prompt('Link URL', ...)` 弹出浏览器原生输入框
- 确认后执行 `editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()`
- 问题：当没有选中文本时，`extendMarkRange` 对非链接光标无有效范围，`setLink` 可能只写入 storedMarks 而无可渲染文本 → 用户看不到链接
- `InlineLinkEditor` 仅用于编辑**已有**链接，不能插入新链接
- 无本地 .md 文件浏览/选择能力

### 本地 .md 文件链接支持
- 上期任务（06-10-link-table-context）已实现：点击已有本地 .md 链接时在编辑器内打开
- `isLocalMdFile(href)`、`resolveLocalPath(href, documentPath)` 等工具函数已存在
- 需要将"选择本地 .md 文件"能力接入链接插入流程

## Decisions (ADR-lite)

### D1: 文件导航历史范围
**决定**：仅记录工作区文件（通过侧边栏点击打开的文件）。通过"打开文件"对话框、拖放、本地链接跳转打开的文件不纳入导航历史。
**理由**：Alt+Left/Right 的目的是在当前文件夹上下文中快速跳转，而非全局跳转。

### D2: 插入链接弹窗形式
**决定**：光标旁浮层（createPortal 浮层，贴近光标/选区弹出），复用 `InlineLinkEditor` 的定位模式。
**理由**：与现有编辑器内浮层（InlineLinkEditor、InlineTableMenu）风格统一，不阻断编辑流。

## Requirements

* [ ] 打开文件夹后，Alt+Left 返回上一文件，Alt+Right 前进到下一文件
* [ ] 文件导航历史按访问时间排序记录，新开文件时清空前向历史（VS Code 行为）
* [ ] 到达历史边界时（无上一文件/无下一文件），按键无操作
* [ ] 替代 `window.prompt`：插入链接时弹出光标旁浮层，包含"链接文本"和"URL"两个字段
* [ ] 浮层中有"浏览本地文件"按钮，调用原生文件对话框选择 .md 文件后填入相对路径
* [ ] 回车确认后：选中文本时包裹为链接；无选中文本时以 URL 作为链接文本插入
* [ ] 浮层支持 Escape 关闭，点击外部关闭

## Acceptance Criteria (evolving)

* [ ] 在文件夹中依次点击 3 个文件，按 Alt+Left 2 次能回到第 1 个文件
* [ ] 回退后再按 Alt+Right 能前进到之前访问过的文件
* [ ] 新打开文件时，前进历史被清空（VS Code 行为）
* [ ] 选中一段文本后 Ctrl+K → 输入 URL → Enter，文本变为可点击链接
* [ ] 无选中时 Ctrl+K → 输入 URL → Enter，URL 被插入为链接且链接文本为 URL 本身
* [ ] 插入链接弹窗中有"浏览本地文件"按钮，可选择 .md 文件

## Definition of Done

* 文件导航历史功能可用，Alt+Left/Right 行为与 VS Code 一致
* 链接插入弹窗替代 `window.prompt`，UI 清晰可用
* 本地 .md 文件链接插入流程通畅
* 无 TypeScript 编译错误，无新增 lint 警告

## Out of Scope (explicit)

* 多标签页系统（本次不做）
* 文件导航历史的持久化（重启应用后历史清空）
* 链接弹窗中的文件搜索/过滤功能

## Technical Notes

### 关键文件
* `frontend/src/App.tsx` — 全局状态、文件打开回调、热键处理
* `frontend/src/editor/MarkdownEditor.tsx` — 编辑器内 Ctrl+K 处理、链接点击
* `frontend/src/components/Toolbar.tsx` — 工具栏链接按钮
* `frontend/src/editor/InlineLinkEditor.tsx` — 现有链接编辑浮层（参考模式）
* `internal/models/models.go` — 热键默认值定义

### 参考
* 上期本地链接跳转 PRD：`.trellis/tasks/archive/2026-06/06-10-link-table-context/prd.md`
* 前端 ProseMirror 模式指南：`.trellis/spec/guides/frontend-patterns.md`