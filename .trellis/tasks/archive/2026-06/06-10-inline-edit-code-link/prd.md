# 渲染模式：点击代码块编辑语言、点击链接编辑内容

## Goal

在渲染模式下，实现类似 Typora 的内联编辑体验：鼠标点击代码块后可直接修改语法高亮语言，点击链接后可编辑链接 URL 和显示文本。

## What I already know

### 用户需求
- 渲染模式下，点击代码块可以调整语法高亮语言
- 渲染模式下，点击链接可以调整链接内容（URL 和文本）
- 行为类似 Typora

### 现有架构
- 编辑器使用 TipTap（ProseMirror-based），扩展栈：
  - `CodeBlockLowlight` — 代码块渲染，带语法高亮（lowlight），支持 `language-` class 前缀
  - `Link` — 链接渲染，`openOnClick: false`，当前无点击行为
- 编辑模式切换通过 `config.editorMode`（`'rendered'` / `'source'`），由 `App.tsx` 控制
- 当前代码块语言修改只能通过工具栏下拉菜单
- 当前链接编辑只能通过 `Ctrl+K` 快捷键触发 `window.prompt`

### 涉及文件
- `frontend/src/editor/MarkdownEditor.tsx` — TipTap 编辑器配置、扩展注册、DOM 事件处理
- `frontend/src/components/Toolbar.tsx` — 工具栏（有现有的语言选择菜单可参考）
- `frontend/src/App.css` — 样式

### 关键技术点
- TipTap 的 `CodeBlockLowlight` 扩展通过 `language` attribute 控制语言
- TipTap 的 `Link` mark 通过 `href` attribute 控制 URL
- 需要在渲染 DOM 上嵌入交互元素（inline popover/input），类似 Typora 的体验

## Requirements (evolving)

### 代码块语言编辑
- [ ] 代码块底部显示语言标签（如 `javascript`），类似 Typora
- [ ] 点击底部语言标签弹出下拉菜单选择/搜索语言
- [ ] 点击代码正文区域正常选择文本，不触发语言编辑
- [ ] 修改语言后立即更新语法高亮

### 链接编辑
- [ ] 单击链接弹出内联编辑框，含：链接文本输入、URL 输入、Open 按钮、Unlink 按钮
- [ ] Ctrl+单击在新窗口打开链接
- [ ] 修改后立即更新链接

### 通用
- [ ] 编辑 UI 在点击其他区域或按 Escape 时关闭
- [ ] 不影响现有的编辑器交互（光标、选择等）
- [ ] 仅在渲染模式下生效

## Decision (ADR-lite)

**代码块语言编辑**：底部语言标签方案。点击标签弹出搜索+下拉菜单选语言，点击正文正常选文本。无语言时显示默认语言名。语言列表使用 lowlight 的 `common` 全集（30+ 种），支持输入过滤。

**链接编辑**：单击弹出编辑框（文本 + URL + Open + Unlink），Ctrl+单击在浏览器打开。

## Expansion Sweep

### 未来演进
- 编辑框 UI 组件可复用于图片、表格等其他节点的内联编辑
- 语言选择器可复用于工具栏现有语言菜单

### 边界情况
- 代码块的 `language` 为 `null` 或空时，标签显示默认语言
- 链接文本和 URL 相同时（自动链接），编辑文本时同时更新 URL（可选行为）
- 编辑框中按 Esc 关闭，Enter 确认
- 点击编辑框外部关闭（blur 事件）

### Out of Scope
- 图片内联编辑
- 表格内联编辑
- 源模式下的内联编辑（仅渲染模式）

## Acceptance Criteria (evolving)

* [ ] 渲染模式下点击代码块，可修改语法高亮语言，修改后立即生效
* [ ] 渲染模式下点击链接，可修改 URL 和显示文本，修改后立即生效
* [ ] 编辑 UI 可通过 Escape 或点击外部关闭
* [ ] 不影响现有编辑功能（光标、选择、复制等）

## Technical Notes

- TipTap editor props 中的 `handleClickOn` 或 NodeView 机制可用于拦截点击
- 当前 Toolbar.tsx 中已有语言选择菜单实现，可复用语言列表
- 需在 `editorProps.handleDOMEvents` 中添加 click 处理，或使用自定义扩展