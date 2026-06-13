# App Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `App.tsx` state responsibilities, unify visible UI copy to Chinese, harden workspace filename validation, and make PDF export fall back to HTML when Chromium export is unavailable.

**Architecture:** Keep React state local to focused hooks instead of introducing a new store dependency. Move pure workspace-session helpers into `state/`, add a single lightweight i18n helper, and preserve Wails API boundaries. Backend changes stay inside `internal/files` and `internal/export` with focused tests.

**Tech Stack:** React 18, TypeScript, Vite, Wails generated bindings, Go standard library tests.

---

## File Structure

- Create `frontend/src/i18n.ts`: Chinese string dictionary and interpolation helper.
- Create `frontend/src/state/workspaceSession.ts`: pure config/session/path helper functions currently at the bottom of `App.tsx`.
- Create `frontend/src/hooks/useAppConfig.ts`: config state, persistence helpers, theme/app-height effects, current workspace session calculation.
- Create `frontend/src/hooks/useTabs.ts`: tab state, active tab derivations, tab mutation helpers, file navigation refs/state, dirty-close helpers, external missing-file handling.
- Create `frontend/src/hooks/useWorkspaceActions.ts`: workspace open/refresh/create/delete/rename/move/recent/session operations.
- Create `frontend/src/hooks/useWorkspaceSearch.ts`: workspace search dialog state and debounce effect.
- Modify `frontend/src/App.tsx`: compose hooks, keep editor/export/hotkey/rendering responsibilities, import i18n messages and workspace session helpers.
- Modify `frontend/src/components/Toolbar.tsx`: replace visible English titles/prompts/menu text with `t()`.
- Modify `frontend/src/components/StartPage.tsx`: replace visible English text with `t()`.
- Modify `frontend/src/components/StatusBar.tsx`: replace visible English text with `t()`.
- Modify `frontend/src/components/WorkspaceSearch.tsx`: replace visible English text with `t()`.
- Modify `frontend/src/components/CommandPalette.tsx`: replace category names, placeholders, empty state with `t()`.
- Modify `frontend/src/components/HotkeySettings.tsx`: replace modal text/category names/buttons with `t()`.
- Modify `frontend/src/components/Sidebar.tsx`: replace remaining visible English text with `t()`.
- Modify `frontend/src/state/documentStore.ts`: use Chinese default Markdown and untitled fallback through constants or direct strings.
- Modify `frontend/src/types/app.ts`: add optional `fallbackKind?: 'html'` to `SaveResult`.
- Modify `internal/models/models.go`: add `FallbackKind string json:"fallbackKind,omitempty"` to `SaveResult`.
- Modify `internal/files/service.go`: add shared workspace item name validator and reuse it in create/rename paths.
- Modify `internal/files/service_test.go`: add validator coverage.
- Modify `internal/export/service.go`: add HTML fallback path and result marker for PDF fallback.
- Modify `internal/export/service_test.go`: add fallback path tests.

---

### Task 1: Extract Workspace Session Helpers

**Files:**
- Create: `frontend/src/state/workspaceSession.ts`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Move pure helper functions**

Create `frontend/src/state/workspaceSession.ts` with the helper functions currently defined after `App` in `App.tsx`:

```ts
import type { AppConfig, RecentDocument, WorkspaceSessionState } from '../types/app';

export function resolveStartupWorkspacePath(config: AppConfig) {
  if (config.workspacePath) return config.workspacePath;

  const latestRecent = config.recentDocuments[0];
  if (!latestRecent?.path) return '';
  if (latestRecent.type === 'folder') return latestRecent.path;
  return findRecentFolderForFile(latestRecent, config.recentDocuments.slice(1))?.path ?? '';
}

export function findRecentFolderForFile(fileRecent: RecentDocument, candidates: RecentDocument[]) {
  if (fileRecent.type !== 'file') return null;
  return candidates.find((item) => item.type === 'folder' && isPathInsideFolder(fileRecent.path, item.path)) ?? null;
}

export function isPathInsideFolder(filePath: string, folderPath: string) {
  const file = normalizePathForCompare(filePath);
  const folder = normalizePathForCompare(folderPath);
  if (!file || !folder) return false;
  if (file === folder) return false;
  return file.startsWith(folder.endsWith('/') ? folder : `${folder}/`);
}

export function normalizePathForCompare(path: string) {
  const normalized = trimTrailingSlashes(path.trim().replace(/\\/g, '/'));
  if (/^[a-z]:\//i.test(normalized) || normalized.startsWith('//')) {
    return normalized.toLowerCase();
  }
  return normalized;
}

export function trimTrailingSlashes(path: string) {
  if (path === '/' || /^[a-z]:\/$/i.test(path)) return path;
  return path.replace(/\/+$/, '');
}

export function resolveWorkspaceSessionState(config: AppConfig, workspacePath: string): WorkspaceSessionState {
  if (workspacePath) {
    const savedState = config.workspaceStates[workspacePath];
    if (savedState) {
      return cloneWorkspaceSessionState(savedState);
    }

    if (config.workspacePath === workspacePath && Object.keys(config.workspaceStates).length === 0) {
      return {
        openTabPaths: [...config.openTabPaths],
        activeTabPath: config.activeTabPath,
        collapsedFolderPaths: [...config.collapsedFolderPaths],
      };
    }
  }

  return {
    openTabPaths: workspacePath ? [] : [...config.openTabPaths],
    activeTabPath: workspacePath ? '' : config.activeTabPath,
    collapsedFolderPaths: workspacePath ? [] : [...config.collapsedFolderPaths],
  };
}

export function applyWorkspaceSessionState(
  config: AppConfig,
  workspacePath: string,
  updates: Partial<WorkspaceSessionState>,
): AppConfig {
  const currentState = resolveWorkspaceSessionState(config, workspacePath);
  const nextState: WorkspaceSessionState = {
    openTabPaths: updates.openTabPaths ? [...updates.openTabPaths] : currentState.openTabPaths,
    activeTabPath: typeof updates.activeTabPath === 'string' ? updates.activeTabPath : currentState.activeTabPath,
    collapsedFolderPaths: updates.collapsedFolderPaths ? [...updates.collapsedFolderPaths] : currentState.collapsedFolderPaths,
  };

  const nextConfig: AppConfig = {
    ...config,
    openTabPaths: [...nextState.openTabPaths],
    activeTabPath: nextState.activeTabPath,
    collapsedFolderPaths: [...nextState.collapsedFolderPaths],
  };

  if (!workspacePath) {
    return nextConfig;
  }

  return {
    ...nextConfig,
    workspaceStates: {
      ...config.workspaceStates,
      [workspacePath]: cloneWorkspaceSessionState(nextState),
    },
  };
}

export function cloneWorkspaceSessionState(state: WorkspaceSessionState): WorkspaceSessionState {
  return {
    openTabPaths: [...state.openTabPaths],
    activeTabPath: state.activeTabPath,
    collapsedFolderPaths: [...state.collapsedFolderPaths],
  };
}

export function serializeSessionSnapshot(workspacePath: string, openTabPaths: string[], activeTabPath: string) {
  return JSON.stringify({ workspacePath, openTabPaths, activeTabPath });
}

export function pruneMissingWorkspaceReference(config: AppConfig, missingWorkspacePath: string): AppConfig {
  const normalizedMissingWorkspacePath = normalizeOptionalPath(missingWorkspacePath);
  if (!normalizedMissingWorkspacePath) return config;

  const isActiveWorkspace = arePathsEqual(config.workspacePath, normalizedMissingWorkspacePath);
  const nextWorkspaceStates = Object.fromEntries(
    Object.entries(config.workspaceStates).filter(([workspacePath]) => !arePathsEqual(workspacePath, normalizedMissingWorkspacePath)),
  );

  return {
    ...config,
    workspacePath: isActiveWorkspace ? '' : config.workspacePath,
    openTabPaths: isActiveWorkspace ? [] : config.openTabPaths,
    activeTabPath: isActiveWorkspace ? '' : config.activeTabPath,
    collapsedFolderPaths: isActiveWorkspace ? [] : config.collapsedFolderPaths,
    workspaceStates: nextWorkspaceStates,
    recentDocuments: config.recentDocuments.filter((item) => !(
      item.type === 'folder' && arePathsEqual(item.path, normalizedMissingWorkspacePath)
    )),
  };
}

export function removeRecentDocument(config: AppConfig, path: string, type: RecentDocument['type']): AppConfig {
  const normalizedPath = normalizeOptionalPath(path);
  if (!normalizedPath) return config;

  return {
    ...config,
    recentDocuments: config.recentDocuments.filter((item) => !(
      item.type === type && arePathsEqual(item.path, normalizedPath)
    )),
  };
}

export function normalizeOptionalPath(path: string) {
  const trimmed = path.trim();
  if (!trimmed) return '';
  return trimTrailingSlashes(trimmed.replace(/\\/g, '/'));
}

export function arePathsEqual(left: string, right: string) {
  const normalizedLeft = normalizePathForCompare(left);
  const normalizedRight = normalizePathForCompare(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft === normalizedRight;
}

export function isMissingPathError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalizedMessage = message.toLowerCase();
  return normalizedMessage.includes('no such file') ||
    normalizedMessage.includes('not exist') ||
    normalizedMessage.includes('cannot find the file') ||
    normalizedMessage.includes('system cannot find') ||
    normalizedMessage.includes('file does not exist');
}
```

- [ ] **Step 2: Replace App-local helper definitions**

Import the helpers from `./state/workspaceSession` in `App.tsx`, remove the duplicate function definitions from the bottom of `App.tsx`, and keep behavior identical.

- [ ] **Step 3: Verify frontend typecheck**

Run: `npm run build` from `frontend`

Expected: TypeScript succeeds after the import list and removed helper definitions are reconciled.

---

### Task 2: Add Lightweight Chinese i18n

**Files:**
- Create: `frontend/src/i18n.ts`
- Modify: `frontend/src/state/documentStore.ts`
- Modify: `frontend/src/components/Toolbar.tsx`
- Modify: `frontend/src/components/StartPage.tsx`
- Modify: `frontend/src/components/StatusBar.tsx`
- Modify: `frontend/src/components/WorkspaceSearch.tsx`
- Modify: `frontend/src/components/CommandPalette.tsx`
- Modify: `frontend/src/components/HotkeySettings.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add dictionary helper**

Create `frontend/src/i18n.ts`:

```ts
type Values = Record<string, string | number>;

const zh = {
  'app.ready': '就绪',
  'document.untitled': '未命名.md',
  'document.defaultMarkdown': '# 未命名\n\n开始写 Markdown。可以使用 #、-、1.、> 和围栏代码块等快捷输入。\n',
  'toolbar.toggleSidebar': '显示或隐藏侧边栏',
  'toolbar.newDocument': '新建文档 (Ctrl+N)',
  'toolbar.openDocument': '打开文档 (Ctrl+O)',
  'toolbar.openFolder': '打开文件夹',
  'toolbar.save': '保存 (Ctrl+S)',
  'toolbar.saveAs': '另存为 (Ctrl+Shift+S)',
  'toolbar.exportHtml': '导出 HTML',
  'toolbar.exportPdf': '导出 PDF',
  'toolbar.bold': '加粗 (Ctrl+B)',
  'toolbar.italic': '斜体 (Ctrl+I)',
  'toolbar.strike': '删除线',
  'toolbar.inlineCode': '行内代码 (Ctrl+Shift+`)',
  'toolbar.link': '链接 (Ctrl+K)',
  'toolbar.copyLink': '复制链接地址',
  'toolbar.heading1': '一级标题 (Ctrl+1)',
  'toolbar.heading2': '二级标题 (Ctrl+2)',
  'toolbar.heading3': '三级标题 (Ctrl+3)',
  'toolbar.bulletList': '无序列表',
  'toolbar.orderedList': '有序列表',
  'toolbar.taskList': '任务列表',
  'toolbar.quote': '引用',
  'toolbar.codeBlock': '代码块',
  'toolbar.insertTable': '插入表格',
  'toolbar.tableActions': '表格行列操作',
  'toolbar.rowBefore': '在上方插入行',
  'toolbar.rowAfter': '在下方插入行',
  'toolbar.deleteRow': '删除行',
  'toolbar.columnBefore': '在左侧插入列',
  'toolbar.columnAfter': '在右侧插入列',
  'toolbar.deleteColumn': '删除列',
  'toolbar.insertImage': '插入图片',
  'toolbar.imagePrompt': '图片 URL 或本地路径',
  'toolbar.undo': '撤销 (Ctrl+Z)',
  'toolbar.redo': '重做 (Ctrl+Shift+Z)',
  'toolbar.autoSave': '自动',
  'toolbar.autoSaveTitle': '自动保存',
  'toolbar.switchRendered': '切换到渲染模式',
  'toolbar.switchSource': '切换到源码模式',
  'toolbar.toggleOutline': '显示或隐藏大纲',
  'toolbar.theme': '主题：{theme}',
  'toolbar.hotkeys': '键盘快捷键',
  'start.workspace': '工作区：{name}',
  'start.markdownWorkspace': 'Markdown 工作区',
  'start.newDocument': '新建文档',
  'start.openFile': '打开文件',
  'start.openFolder': '打开文件夹',
  'start.searchWorkspace': '搜索工作区',
  'start.restoreSession': '恢复会话',
  'start.recent': '最近打开',
  'start.noRecent': '没有最近打开的文件或文件夹',
  'start.kindFolder': '文件夹',
  'start.kindFile': '文件',
  'status.unsaved': '未保存',
  'status.saved': '已保存',
  'status.savedAt': '已保存 {time}',
  'status.words': '{count} 词',
  'status.characters': '{count} 字符',
  'status.lines': '{count} 行',
  'workspace.titleFallback': '工作区',
  'workspace.searchFiles': '搜索文件...',
  'workspace.noFolder': '未打开文件夹',
  'workspace.noMatches': '没有匹配文件',
  'workspace.noMarkdown': '没有 Markdown 文件',
  'workspace.expandAll': '全部展开',
  'workspace.collapseAll': '全部折叠',
  'workspace.newFile': '新建文件',
  'workspace.newFolder': '新建文件夹',
  'workspace.rename': '重命名',
  'workspace.delete': '删除',
  'workspace.deleteConfirm': '确定要删除 "{name}" 吗？此操作会移到回收站。',
  'outline.title': '大纲',
  'outline.empty': '没有标题',
  'search.placeholder': '搜索 {name}',
  'search.placeholderNoWorkspace': '打开文件夹后搜索',
  'search.close': '关闭搜索',
  'search.loading': '搜索中...',
  'search.resultCount': '{count} 个结果',
  'search.typeToSearch': '输入关键词搜索 Markdown 文件',
  'search.openFolderFirst': '请先打开文件夹。',
  'search.noMatches': '没有匹配结果',
  'search.line': '第 {line} 行',
  'command.placeholder': '输入命令...',
  'command.empty': '没有匹配命令',
  'category.file': '文件',
  'category.edit': '编辑',
  'category.view': '视图',
  'category.tab': '标签页',
  'category.format': '格式',
  'hotkeys.title': '键盘快捷键',
  'hotkeys.close': '关闭',
  'hotkeys.loading': '加载中...',
  'hotkeys.empty': '没有配置快捷键',
  'hotkeys.pressShortcut': '按下快捷键...',
  'hotkeys.resetAll': '全部重置',
  'hotkeys.cancel': '取消',
  'hotkeys.save': '保存',
  'message.newDocument': '新建文档',
  'message.openFailed': '打开失败',
  'message.saveFailed': '保存失败',
  'message.saveAsFailed': '另存为失败',
  'message.exportFailed': '导出失败',
  'message.pdfExportFailed': 'PDF 导出失败',
  'message.pdfFallbackHtml': 'PDF 导出失败，已回退导出 HTML：{name}',
  'message.saved': '已保存 {name}',
  'message.exported': '已导出 {name}',
  'message.exportedPdf': '已导出 PDF {name}',
  'message.opened': '已打开 {name}',
  'message.switchedTo': '已切换到 {name}',
  'message.workspaceFileUnavailable': '工作区文件不可用',
  'message.linkedFileOpenFailed': '无法打开链接文件：{path}',
  'message.openedFolder': '已打开文件夹 {name}',
  'message.openFolderFailed': '打开文件夹失败',
  'message.workspace': '工作区：{name}',
  'message.workspaceRefreshed': '工作区已刷新',
  'message.workspaceRefreshFailed': '刷新工作区失败',
  'message.createFileFailed': '新建文件失败：{error}',
  'message.createFolderFailed': '新建文件夹失败：{error}',
  'message.deleted': '已移到回收站：{name}',
  'message.deleteFailed': '删除失败：{error}',
  'message.renamed': '重命名成功：{name}',
  'message.renameFailed': '重命名失败：{error}',
  'message.moved': '移动成功：{name}',
  'message.moveFailed': '移动失败：{error}',
  'message.recentUnavailable': '最近项目不可用',
  'message.noSavedSession': '没有可恢复的会话',
  'message.openFolderBeforeSearch': '请先打开文件夹再搜索',
  'message.openedAtLine': '已打开 {name} 第 {line} 行',
  'message.workspaceSearchFailed': '工作区搜索失败',
  'message.autoSaveFailed': '自动保存失败',
  'message.reloadFailed': '重新加载失败：{path}',
  'message.reloadedExternal': '已重新加载 {name}（外部更改）',
  'message.fileDeletedUnsaved': '文件被外部删除，已将 {name} 保留为未保存标签页。',
  'message.closedMissing': '已关闭丢失文件 {name}',
  'message.tabLocked': '标签页已锁定，请先解锁',
  'message.unlocked': '已解锁 {name}',
  'message.locked': '已锁定 {name}',
  'prompt.fileName': '输入文件名：',
  'prompt.folderName': '输入文件夹名：',
  'confirm.unsavedTab': '"{name}" 有未保存更改。要放弃更改吗？',
  'confirm.unsavedTabs': '{count} 个标签页有未保存更改。要放弃更改吗？',
  'confirm.externalChange': '"{name}" 已被外部修改。\n\n要重新加载吗？未保存更改将丢失。',
} as const;

type Key = keyof typeof zh;

export function t(key: Key, values: Values = {}): string {
  const template = zh[key] ?? key;
  return template.replace(/\{(\w+)}/g, (_, name) => String(values[name] ?? ''));
}
```

- [ ] **Step 2: Replace document defaults**

In `documentStore.ts`, import `t` and replace the default Markdown and untitled name strings with `t('document.defaultMarkdown')` and `t('document.untitled')`.

- [ ] **Step 3: Replace visible component copy**

Import `t` in each listed component and replace string literals used in rendered labels, placeholders, titles, aria-labels, prompts, confirms, and empty states. Keep CSS class names, data attributes, persisted action IDs, and TypeScript union values unchanged.

- [ ] **Step 4: Replace App messages and command labels**

In `App.tsx`, replace toast messages, confirm/prompt strings, and command palette item labels/descriptions with `t()` calls. Keep action IDs unchanged.

- [ ] **Step 5: Verify no obvious English UI copy remains in touched files**

Run PowerShell search:

```powershell
Get-ChildItem -Path frontend\src -Recurse -File -Include *.tsx,*.ts |
  Select-String -Pattern 'New document|Open file|Save|Export|Search|Workspace|No matching|Loading|Keyboard Shortcuts|Unsaved|Saved'
```

Expected: remaining matches are import/type names, action IDs, icon names, comments, or backend generated bindings; visible UI text in touched source is Chinese.

---

### Task 3: Extract App Config Hook

**Files:**
- Create: `frontend/src/hooks/useAppConfig.ts`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create hook interface**

Create `useAppConfig` with this shape:

```ts
export interface UseAppConfigOptions {
  currentWorkspacePath: string;
  onMessage: (message: string) => void;
}

export interface UseAppConfigResult {
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
  effectiveTheme: ReturnType<typeof resolveTheme>;
  currentWorkspaceSession: WorkspaceSessionState;
  persistConfig: (updates: Partial<AppConfig>) => Promise<void>;
  persistConfigWith: (updater: (current: AppConfig) => AppConfig) => Promise<void>;
  persistWorkspaceSessionState: (workspacePath: string, updates: Partial<WorkspaceSessionState>) => Promise<void>;
}
```

- [ ] **Step 2: Move persistence and effects**

Move these from `App.tsx` into the hook:

- `useState<AppConfig>(defaultConfig)`
- `effectiveTheme`
- `currentWorkspaceSession`
- theme/background `useEffect`
- app-height `useEffect`
- `persistConfigWith`
- `persistConfig`
- `persistWorkspaceSessionState`

Do not move startup session restore yet; it depends on tabs/workspace callbacks and stays in `App.tsx`.

- [ ] **Step 3: Update App composition**

In `App.tsx`, replace local config state and persistence helpers with:

```ts
const {
  config,
  setConfig,
  effectiveTheme,
  currentWorkspaceSession,
  persistConfig,
  persistConfigWith,
  persistWorkspaceSessionState,
} = useAppConfig({ currentWorkspacePath, onMessage: setMessage });
```

- [ ] **Step 4: Verify build**

Run: `npm run build` from `frontend`

Expected: build succeeds after all moved imports are fixed.

---

### Task 4: Extract Tab Hook

**Files:**
- Create: `frontend/src/hooks/useTabs.ts`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create hook interface**

Create `useTabs` with this public shape:

```ts
export interface UseTabsOptions {
  onMessage: (message: string) => void;
  onOutlineReset: () => void;
  onShowStartPageChange: (show: boolean) => void;
}

export interface UseTabsResult {
  tabs: DocumentState[];
  setTabs: React.Dispatch<React.SetStateAction<DocumentState[]>>;
  tabsRef: React.MutableRefObject<DocumentState[]>;
  activeTabIndex: number;
  setActiveTabIndex: React.Dispatch<React.SetStateAction<number>>;
  activeTabIndexRef: React.MutableRefObject<number>;
  activeTab: DocumentState;
  fileNavHistory: string[];
  fileNavIndex: number;
  pushFileNav: (path: string) => void;
  updateActiveTab: (updater: (tab: DocumentState) => DocumentState) => void;
  updateTabById: (id: string, updater: (tab: DocumentState) => DocumentState) => void;
  handleUnavailableFile: (path: string) => void;
  handleNew: () => void;
  handleCloseTab: (index: number) => void;
  handleCloseAll: () => void;
  handleCloseRight: (index: number) => void;
  handleCloseLeft: (index: number) => void;
  handleToggleLock: (index: number) => void;
  handleReorder: (fromIndex: number, toIndex: number) => void;
}
```

- [ ] **Step 2: Move tab state and helpers**

Move tab state, tab refs, file navigation state, `pushFileNav`, `updateActiveTab`, `updateTabById`, `handleUnavailableFile`, `confirmDirtyRange`, and tab close/reorder/lock/new handlers into the hook. Use `t()` for messages and confirms.

- [ ] **Step 3: Keep file opening in App**

Leave `handleOpen`, `handleOpenWorkspaceFile`, `handleOpenLocalFile`, `goBack`, and `goForward` in `App.tsx` for now because they combine Wails reads, file watching, workspace history, and UI session state.

- [ ] **Step 4: Update App composition**

Replace local tab state/helper declarations with a `useTabs` call and update references.

- [ ] **Step 5: Verify build**

Run: `npm run build` from `frontend`

Expected: build succeeds.

---

### Task 5: Extract Workspace Hooks

**Files:**
- Create: `frontend/src/hooks/useWorkspaceActions.ts`
- Create: `frontend/src/hooks/useWorkspaceSearch.ts`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create workspace search hook**

Move workspace search state and debounce effect into `useWorkspaceSearch`:

```ts
export function useWorkspaceSearch(options: {
  workspaceName: string;
  onMessage: (message: string) => void;
}) {
  return {
    workspaceSearchOpen,
    setWorkspaceSearchOpen,
    workspaceSearchQuery,
    setWorkspaceSearchQuery,
    workspaceSearchResults,
    workspaceSearchLoading,
    openWorkspaceSearch,
    closeWorkspaceSearch,
  };
}
```

`openWorkspaceSearch` should emit `t('message.openFolderBeforeSearch')` if no workspace is open.

- [ ] **Step 2: Create workspace actions hook**

Move workspace state and handlers for folder open/load/refresh, create file/folder, delete, rename, move, recent folder open, and collapsed-folder persistence into `useWorkspaceActions`. Keep callback dependencies explicit:

```ts
export function useWorkspaceActions(options: {
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
  currentWorkspacePath: string;
  tabsRef: React.MutableRefObject<DocumentState[]>;
  activeTabIndexRef: React.MutableRefObject<number>;
  setTabs: React.Dispatch<React.SetStateAction<DocumentState[]>>;
  setActiveTabIndex: React.Dispatch<React.SetStateAction<number>>;
  setOutline: React.Dispatch<React.SetStateAction<OutlineItem[]>>;
  setShowStartPage: React.Dispatch<React.SetStateAction<boolean>>;
  persistConfig: (updates: Partial<AppConfig>) => Promise<void>;
  persistConfigWith: (updater: (current: AppConfig) => AppConfig) => Promise<void>;
  persistWorkspaceSessionState: (workspacePath: string, updates: Partial<WorkspaceSessionState>) => Promise<void>;
  handleOpenLocalFile: (path: string) => Promise<void>;
  onMessage: (message: string) => void;
  restoredRecentRef: React.MutableRefObject<boolean>;
}) { /* return workspace and handlers */ }
```

- [ ] **Step 3: Update App composition**

Remove workspace state and moved handlers from `App.tsx`. Import and call both hooks. Keep `restoreSessionTabs` in `App.tsx` until all dependencies are stable.

- [ ] **Step 4: Verify build**

Run: `npm run build` from `frontend`

Expected: build succeeds.

---

### Task 6: Harden Go Workspace Name Validation

**Files:**
- Modify: `internal/files/service.go`
- Modify: `internal/files/service_test.go`

- [ ] **Step 1: Write validator tests**

Add tests to `service_test.go`:

```go
func TestValidateWorkspaceItemNameRejectsWindowsInvalidNames(t *testing.T) {
	cases := []string{
		"", "   ", "bad/name.md", `bad\name.md`, "bad:name.md", "bad*name.md",
		"bad?name.md", "bad<name.md", "bad>name.md", `bad"name.md`, "bad|name.md",
		"note.", "note ", "CON", "con.md", "PRN", "AUX.txt", "NUL", "COM1.md", "LPT9",
		"control" + string(rune(31)) + ".md",
	}
	for _, name := range cases {
		if err := validateWorkspaceItemName(name, "file name"); err == nil {
			t.Fatalf("validateWorkspaceItemName(%q) returned nil, want error", name)
		}
	}
}

func TestValidateWorkspaceItemNameAllowsNormalNames(t *testing.T) {
	cases := []string{"note.md", "meeting notes.md", "中文笔记.md", "folder_name", "v1.2.3.md"}
	for _, name := range cases {
		if err := validateWorkspaceItemName(name, "file name"); err != nil {
			t.Fatalf("validateWorkspaceItemName(%q) error = %v", name, err)
		}
	}
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `go test ./internal/files`

Expected: fails because `validateWorkspaceItemName` is not defined.

- [ ] **Step 3: Implement validator**

Add to `service.go` near path helpers:

```go
var windowsReservedNames = map[string]struct{}{
	"CON": {}, "PRN": {}, "AUX": {}, "NUL": {},
	"COM1": {}, "COM2": {}, "COM3": {}, "COM4": {}, "COM5": {}, "COM6": {}, "COM7": {}, "COM8": {}, "COM9": {},
	"LPT1": {}, "LPT2": {}, "LPT3": {}, "LPT4": {}, "LPT5": {}, "LPT6": {}, "LPT7": {}, "LPT8": {}, "LPT9": {},
}

func validateWorkspaceItemName(name string, label string) error {
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("%s is required", label)
	}
	if strings.ContainsAny(name, `/\<>:"|?*`) {
		return fmt.Errorf("%s contains invalid characters", label)
	}
	for _, r := range name {
		if r >= 0 && r < 32 {
			return fmt.Errorf("%s contains invalid characters", label)
		}
	}
	if strings.HasSuffix(name, " ") || strings.HasSuffix(name, ".") {
		return fmt.Errorf("%s cannot end with a space or period", label)
	}
	base := strings.TrimSuffix(name, filepath.Ext(name))
	if _, reserved := windowsReservedNames[strings.ToUpper(base)]; reserved {
		return fmt.Errorf("%s uses a reserved Windows name", label)
	}
	return nil
}
```

- [ ] **Step 4: Reuse validator**

Replace the repeated trim and `strings.ContainsAny` blocks in `CreateWorkspaceFile`, `CreateWorkspaceFolder`, and `RenameWorkspaceItem` with:

```go
if err := validateWorkspaceItemName(name, "file name"); err != nil { return models.WorkspaceFile{}, err }
if err := validateWorkspaceItemName(name, "folder name"); err != nil { return models.WorkspaceFile{}, err }
if err := validateWorkspaceItemName(newName, "new name"); err != nil { return models.WorkspaceFile{}, err }
```

- [ ] **Step 5: Run tests**

Run: `go test ./internal/files`

Expected: pass.

---

### Task 7: Add PDF HTML Fallback

**Files:**
- Modify: `internal/models/models.go`
- Modify: `frontend/src/types/app.ts`
- Modify: `internal/export/service.go`
- Modify: `internal/export/service_test.go`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Write fallback path tests**

Add to `internal/export/service_test.go`:

```go
func TestPdfFallbackHTMLPath(t *testing.T) {
	cases := map[string]string{
		filepath.Join("tmp", "note.pdf"): filepath.Join("tmp", "note.html"),
		filepath.Join("tmp", "note"):     filepath.Join("tmp", "note.html"),
		filepath.Join("tmp", "note.PDF"): filepath.Join("tmp", "note.html"),
	}
	for input, want := range cases {
		if got := pdfFallbackHTMLPath(input); got != want {
			t.Fatalf("pdfFallbackHTMLPath(%q) = %q, want %q", input, got, want)
		}
	}
}
```

- [ ] **Step 2: Run export tests to verify failure**

Run: `go test ./internal/export`

Expected: fails because `pdfFallbackHTMLPath` is not defined.

- [ ] **Step 3: Add result marker**

In Go `models.SaveResult`, add:

```go
FallbackKind string `json:"fallbackKind,omitempty"`
```

In frontend `SaveResult`, add:

```ts
fallbackKind?: 'html';
```

- [ ] **Step 4: Implement fallback helper and write path**

In `internal/export/service.go`, add:

```go
func pdfFallbackHTMLPath(pdfPath string) string {
	ext := filepath.Ext(pdfPath)
	if strings.EqualFold(ext, ".pdf") {
		return strings.TrimSuffix(pdfPath, ext) + ".html"
	}
	return pdfPath + ".html"
}

func writePDFFallbackHTML(path string, htmlContent string) (models.SaveResult, error) {
	fallbackPath := pdfFallbackHTMLPath(path)
	if err := os.WriteFile(fallbackPath, []byte(htmlContent), 0o644); err != nil {
		return models.SaveResult{}, err
	}
	return models.SaveResult{
		Path:         fallbackPath,
		Name:         filepath.Base(fallbackPath),
		SavedAt:      time.Now().Format(time.RFC3339),
		FallbackKind: "html",
	}, nil
}
```

- [ ] **Step 5: Change `ExportPDF` flow**

Prepare HTML before browser discovery. On `findChromiumBrowser` error or `printHTMLToPDF` error, call `writePDFFallbackHTML(path, htmlContent)` and return its result. Keep cancellation and empty HTML behavior unchanged.

- [ ] **Step 6: Update frontend PDF message**

In `handleExportPdf`, after `ExportPDF`, branch:

```ts
if (result?.fallbackKind === 'html') {
  setMessage(t('message.pdfFallbackHtml', { name: result.name }));
} else if (result?.path) {
  setMessage(t('message.exportedPdf', { name: result.name }));
}
```

- [ ] **Step 7: Run export tests**

Run: `go test ./internal/export`

Expected: pass.

---

### Task 8: Final Verification

**Files:**
- All modified files.

- [ ] **Step 1: Run Go tests**

Run: `go test ./...`

Expected: all packages pass.

- [ ] **Step 2: Run frontend build**

Run: `npm run build` from `frontend`

Expected: TypeScript and Vite build pass.

- [ ] **Step 3: Inspect git diff**

Run: `git diff --stat`

Expected: App split files, i18n/helper hooks, Go validation/export changes, and tests only. `CLAUDE.md` remains unrelated and untouched.

- [ ] **Step 4: Manual smoke path**

Run `npm run dev` from `frontend` for browser smoke testing, or `wails dev` from the repository root for a full Wails smoke test. Check:

- Toolbar, start page, sidebar, status bar, command palette, workspace search, and hotkey modal show Chinese visible text.
- Opening/saving tabs still works.
- Workspace rename/create rejects reserved names such as `CON.md`.
- PDF export with no browser path configured returns an HTML fallback instead of only an error.
