# Link Local File Open and Table Cell Context Menu

## Goal

增强两个编辑器交互：
1. 点击指向本地 .md 文件的链接时，直接在编辑器内打开该文件（而非外部浏览器）
2. 点击表格单元格时，在单元格上方弹出浮层，提供行/列的增删操作按钮

## What I already know

### 现有基础设施 — 链接处理
- `MarkdownEditor.tsx` 中 `handleInlineClick` 拦截链接点击：
  - Ctrl+click → `window.open(href, '_blank')` 外部浏览器打开
  - 普通 click → 弹出 `InlineLinkEditor`（编辑文本/URL、打开链接、移除链接）
- `InlineLinkEditor` 的"打开链接"按钮调用 `window.open(href, '_blank')`
- 链接使用 TipTap `@tiptap/extension-link`，配置 `openOnClick: false`
- `App.tsx` 已有 `handleOpenWorkspaceFile(path)` → `ReadDocument(path)` → `loadDocument(payload)` 完成文件打开
- 文件打开链：`ReadDocument` (Go binding) → `DocumentPayload` → `documentFromPayload` → `setDocumentState`

### 现有基础设施 — 表格处理
- 表格使用 TipTap 标准扩展：`Table(resizable: true)`, `TableRow`, `TableHeader`, `TableCell`
- 当前行/列操作集中在 Toolbar 下拉菜单：`addRowBefore/After`, `deleteRow`, `addColumnBefore/After`, `deleteColumn`
- TipTap 提供完整的表格链式命令：`editor.chain().focus().addRowBefore().run()` 等
- 前端已有 `InlineLinkEditor` / `InlineCodeLanguage` 的 createPortal 浮层模式可复用

### 文件类型检测
- `.md`, `.markdown`, `.mdown`, `.mkd` 已用于拖拽检测（见 `App.tsx` 中 `OnFileDrop`）
- 本地文件路径判断：不以 `http://` / `https://` 开头，且扩展名匹配

## Requirements

- [ ] 点击本地 .md 文件链接时，直接调用 `ReadDocument` 打开该文件
- [ ] 点击表格单元格（td/th）时，在单元格上方弹出操作菜单
- [ ] 表格菜单提供：上方插入行、下方插入行、删除当前行、左侧插入列、右侧插入列、删除当前列
- [ ] 表格菜单应定位在单元格上方一段距离，避免遮挡内容

## Technical Approach

### 本地文件链接跳转
1. `MarkdownEditor` 新增 `onOpenLocalFile?: (path: string) => void` prop
2. 在 `handleInlineClick` 的 link 分支中，判断 `href` 是否为本地 .md 文件：
   - 不以 `http://` / `https://` 开头 且 扩展名为 `.md/.markdown/.mdown/.mkd`
   - 是 → 调用 `onOpenLocalFile(href)` 并 `return true`
   - 否 → 走现有流程（Ctrl+click 打开浏览器 / 普通 click 弹出编辑器）
3. `App.tsx` 中传入 `onOpenLocalFile={handleOpenLocalFile}`，内部调用 `handleOpenWorkspaceFile(path)`
4. `InlineLinkEditor` 的"打开链接"按钮也需要同样逻辑：如果是本地 .md 路径则调用回调打开，否则 `window.open`

### 表格单元格上下文菜单
1. 新建 `InlineTableMenu.tsx` 组件（仿 `InlineLinkEditor` 模式）：
   - 使用 `createPortal` 渲染到 `document.body`
   - 固定定位在目标单元格上方约 8px 处
   - 包含 6 个操作按钮：addRowBefore, addRowAfter, deleteRow, addColumnBefore, addColumnAfter, deleteColumn
2. `MarkdownEditor` 新增 `InlineTableMenuState` 类型、`tableMenu` state
3. 在 `handleDOMEvents.click` 中增加表格检测逻辑：
   - 检查 `target.closest('td, th')` 是否存在
   - 存在 → 通过 `view.posAtDOM(cell, 0)` 获取位置，确认在表格内
   - 设置 `tableMenu` state，渲染 `InlineTableMenu`
4. 菜单项点击后执行对应 TipTap 链式命令，并关闭菜单
5. 点击菜单外部或按 Escape 关闭菜单

### 浮层定位策略
- 表格菜单：`top: rect.top - menuHeight - 8, left: rect.left`（上方弹出）
- 链接编辑器：保持现有逻辑不变（下方弹出 `rect.bottom + 4`）

## Decision (ADR-lite)

- **表格菜单与 Toolbar 的关系**：**补充**而非替代 — Toolbar 表格下拉菜单保留不动，单元格点击额外弹出上下文菜单（两处入口共存）
- **本地链接检测**：仅检测协议前缀（http/https）和文件扩展名，不做文件存在性校验（交给 `ReadDocument` 处理失败）
- **表格菜单定位**：始终在单元格上方弹出，避免遮挡下方内容
- **菜单自动关闭**：执行操作后自动关闭；点击外部/Escape 关闭；不设置自动消失定时器
- **权限确认**：打开本地文件时沿用现有 `confirmDiscard` 检查（如有未保存内容）
- **兜底**：如果 `ReadDocument` 失败（文件不存在/不可读），由 App 层统一 toast 错误信息（与现有 rest of app 一致）

## Out of Scope

- 表格菜单的拖拽调整大小
- 表格菜单的键盘快捷键直接绑定（可通过现有 hotkey 体系间接支持）
- 链接的"打开方式"选项（如选择用外部程序打开）

## Technical Notes

### 实现摘要
- `InlineTableMenu.tsx`：新建，表格单元格上下文菜单（createPortal 浮层，6 个操作按钮）
- `MarkdownEditor.tsx`：
  - 新增 `onOpenLocalFile` prop
  - `isLocalMdFile(href)` — 检测本地 .md 文件链接
  - `cleanLocalPath(href)` — 剥离 `file://` 协议、`?` 参数、`#` 片段
  - `resolveLocalPath(href, documentPath)` — 相对路径基于当前文档目录拼接为绝对路径
  - `handleInlineClick` 检测顺序：code tag → link → table cell（链接优先于表格，保证表格内链接正常）
  - 新增 `tableMenu` state，渲染 `InlineTableMenu`
- `App.tsx`：新增 `handleOpenLocalFile` 回调，传入 `MarkdownEditor`
- `App.css`：新增 `.inline-table-menu-*` 样式

### 参考行号（原始文件，已偏移）
- `MarkdownEditor.tsx` 第 122-176 行：`handleInlineClick` 函数
- `InlineLinkEditor.tsx` 第 73-83 行：打开链接和移除链接按钮
- `App.tsx` 第 212-220 行：`handleOpenWorkspaceFile` 实现
- `App.tsx` 第 241-260 行：拖拽打开 .md 文件的参考实现
- `Toolbar.tsx` 第 247-280 行：当前 Toolbar 中的表格行/列操作菜单
- TipTap Table 命令：`addRowBefore`, `addRowAfter`, `deleteRow`, `addColumnBefore`, `addColumnAfter`, `deleteColumn`