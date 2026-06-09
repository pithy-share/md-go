# 键盘快捷键

## Goal

为 Markdown 编辑器增加键盘快捷键功能，提升用户操作效率。

## What I already know

* Wails v2 项目，Go 后端 + React/TypeScript 前端
* 前端使用 TipTap 富文本编辑器
* 后端提供文件读写、配置管理等服务
* **当前无任何快捷键基础设施**：没有 hotkey 库、没有 keydown 监听、没有 shortcut 配置
* TipTap StarterKit 自带部分编辑快捷键（如 Bold Ctrl+B、Italic Ctrl+I 等），但这是 Extensions 内置行为，非项目显式配置
* 所有操作均通过 Toolbar 按钮点击触发，无键盘入口
* 全局状态集中在 `App.tsx`（无 Redux/Zustand/Context），Wails 调用均为 Promise 异步
* `frontend/package.json` 无 `react-hotkeys`、`hotkeys-js` 等快捷键库
* 源码模式使用独立 `<textarea>`，编辑模式使用 TipTap `<EditorContent>`

## Requirements

### Scope: 高频操作（MVP）

**格式操作** — TipTap 层面，编辑模式下生效：

| 快捷键 | 操作 | 备注 |
|--------|------|------|
| `Ctrl+B` | 加粗 | toggle |
| `Ctrl+I` | 斜体 | toggle |
| `Ctrl+K` | 插入/编辑链接 | toggle |
| `` Ctrl+Shift+` `` | 行内代码 | toggle |
| `Ctrl+Z` | 撤销 | |
| `Ctrl+Shift+Z` | 重做 | |
| `Ctrl+1` | 标题 1 | toggle：已是标题 1 则回正文 |
| `Ctrl+2` | 标题 2 | toggle：已是标题 2 则回正文 |
| `Ctrl+3` | 标题 3 | toggle：已是标题 3 则回正文 |

**文件操作** — App 层面，编辑模式和源码模式均生效：

| 快捷键 | 操作 | 备注 |
|--------|------|------|
| `Ctrl+S` | 保存 | 如已有路径则直接保存，否则触发另存为 |
| `Ctrl+Shift+S` | 另存为 | 强制弹出保存对话框 |
| `Ctrl+N` | 新建文档 | |
| `Ctrl+O` | 打开文档 | |

### UX 行为

* **Toggle 模式**：所有格式操作（加粗、斜体、链接、行内代码、标题）在已激活状态下再次按下同一快捷键时，清除该格式。
* **标题 toggle 特殊规则**：`Ctrl+1` 在已是标题 1 时切回正文（段落），其他标题同理。不需要单独的 `Ctrl+0`。
* **文件操作**：`Ctrl+S` 在文档未关联文件路径时触发另存为流程（与 Toolbar 保存按钮行为一致）。

### Tooltip 提示

* 每个有快捷键的 Toolbar 按钮在悬停时显示对应快捷键（如 `加粗 (Ctrl+B)`）
* 快捷键揭示自身功能，降低学习成本

### 生效范围

| 模式 | 格式快捷键 | 文件快捷键 |
|------|-----------|-----------|
| 编辑模式（TipTap） | 全部生效 | 全部生效 |
| 源码模式（textarea） | 不生效（写原文） | 全部生效 |

## Acceptance Criteria

* [ ] `Ctrl+B/I/K/Ctrl+Shift+`` 在编辑模式下正确 toggle 格式
* [ ] `Ctrl+1/2/3` toggle 标题，已是同级标题时回正文
* [ ] `Ctrl+Z/Ctrl+Shift+Z` 撤销/重做正常
* [ ] `Ctrl+S` 编辑/源码模式均可保存
* [ ] `Ctrl+Shift+S` 强制另存为弹窗
* [ ] `Ctrl+N` 新建文档
* [ ] `Ctrl+O` 打开文档
* [ ] Toolbar 按钮 tooltip 显示对应快捷键
* [ ] 源码模式下格式快捷键不生效，文件快捷键正常
* [ ] 快捷键不与系统/浏览器已有快捷键冲突

## Out of Scope (explicit)

* 自定义快捷键绑定（MVP 固定绑定）
* 表格操作快捷键
* 列表/引用/代码块快捷键
* 视图切换快捷键（侧边栏、大纲、源码模式）
* 导出 HTML 快捷键
* 快捷键面板/帮助页面

## Technical Notes

* 现有 TipTap Extensions: `StarterKit`（禁用 codeBlock/link）、`CodeBlockLowlight`、`Link`、`Image`（自定义）、`Table`、`TaskList/TaskItem`、`Typography`、`Placeholder`
* TipTap `toggleBold()`、`toggleHeading()` 等命令原生支持 toggle 行为
* Toolbar 组件路径: `frontend/src/components/Toolbar.tsx`
* 编辑器组件路径: `frontend/src/editor/MarkdownEditor.tsx`
* App 入口路径: `frontend/src/App.tsx`
* 无现有快捷键库依赖，需选择实现方案