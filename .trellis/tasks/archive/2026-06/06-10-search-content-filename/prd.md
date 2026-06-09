# 支持文件内容搜索和侧边栏文件名搜索过滤

## Goal

当以文件夹方式打开项目时，支持两种搜索：
1. **内容搜索**：在编辑器中 Ctrl+F 打开搜索栏，在当前文件中搜索文本内容
2. **文件名过滤**：在侧边栏顶部提供搜索框，按文件名实时过滤文件树，点击匹配文件跳转

## What I already know

### 用户需求
- 文件夹模式打开时，编辑器内 Ctrl+F 搜索文件内容
- 侧边栏有文件名搜索框，实时过滤显示文件
- 点击过滤后的文件跳转到对应文件

### 现有架构
- Sidebar 组件（`frontend/src/components/Sidebar.tsx`）：显示 workspace 文件树，支持点击打开文件
- MarkdownEditor 组件：支持 rendered/source 两种模式，已绑定 Ctrl+K（链接）、Ctrl+1/2/3（标题）等快捷键
- App.tsx：管理 workspace、documentState、openWorkspaceFile
- 当前 Ctrl+F 未绑定任何功能

### 涉及文件
- `frontend/src/components/Sidebar.tsx` — 添加文件名搜索框 + 过滤逻辑
- `frontend/src/editor/MarkdownEditor.tsx` — 添加 Ctrl+F 快捷键 + 搜索 UI
- `frontend/src/App.tsx` — 可能需要透传搜索状态
- `frontend/src/App.css` — 搜索 UI 样式

## Requirements (evolving)

### 内容搜索（Ctrl+F）
- [ ] 在渲染模式和源模式下，Ctrl+F 打开内容搜索栏
- [ ] 搜索栏包含：查找输入框、替换输入框、匹配计数、上一个/下一个、替换/全部替换、关闭按钮
- [ ] 输入时实时高亮所有匹配项
- [ ] 支持 Enter 跳转到下一个匹配，Shift+Enter 跳转到上一个
- [ ] Esc 关闭搜索栏并清除高亮
- [ ] 替换功能：单个替换（Replace）和全部替换（Replace All）

### 文件名搜索
- [ ] 侧边栏顶部有搜索输入框
- [ ] 输入时实时过滤文件树，匹配文件名和文件夹名（模糊匹配，类似 VS Code）
- [ ] 匹配到文件夹时，展开该文件夹并保留其直接子项
- [ ] 清空搜索框恢复完整文件树
- [ ] 点击过滤后的文件跳转到该文件

## Decision (ADR-lite)

**内容搜索**：查找 + 替换（类似 VS Code），Ctrl+F 打开搜索栏。源模式下操作 textarea 文本；渲染模式下通过 ProseMirror decorations 高亮匹配文本。Esc 关闭搜索栏并清除所有高亮。

**文件名搜索**：匹配文件名和文件夹名（模糊匹配），匹配到文件夹时展开该文件夹并保留其直接子项。纯前端过滤，无需后端改动。

## Technical Approach

### 内容搜索
- **渲染模式**：创建 ProseMirror plugin，用 `Decoration.inline` 给匹配文本位置添加高亮 class。搜索栏作为 React 组件渲染在编辑器上方，通过 `editor.view.dispatch` 驱动
- **源模式**：直接搜索 `markdown` 字符串，通过 textarea `setSelectionRange` 选中匹配文本；替换时拼接字符串
- **快捷键**：在 App.tsx 监听 Ctrl+F，触发搜索栏；Ctrl+H 直接聚焦替换输入框

### 文件名搜索
- Sidebar.tsx 顶部加 `<input>` 搜索框
- 过滤逻辑：递归遍历 workspace.files 树，保留路径（含文件夹名）匹配的节点；匹配文件夹时递归保留其根级子项
- 搜索结果也保持树形结构，点击文件调用 `onOpenWorkspaceFile`

### Out of Scope
- 跨文件搜索
- 正则表达式搜索
- 大小写敏感切换（默认大小写不敏感）