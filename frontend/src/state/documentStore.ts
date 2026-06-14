import type { AppConfig, DocumentPayload, DocumentState, DocumentStats, EditorMode, RecentDocument, SaveResult, ThemePreference, WorkspaceSessionState } from '../types/app';
import { t } from '../i18n';

export const defaultConfig: AppConfig = {
  theme: 'system',
  autoSave: true,
  autoSaveDelay: 1200,
  showSidebar: true,
  showOutline: true,
  editorMode: 'rendered',
  editorFontSize: 16,
  workspacePath: '',
  openTabPaths: [],
  activeTabPath: '',
  collapsedFolderPaths: [],
  workspaceStates: {},
  recentDocuments: [],
};

type RecentDocumentInput = Omit<Partial<RecentDocument>, 'type'> & { type?: string };
type WorkspaceSessionStateInput = Partial<WorkspaceSessionState> | null | undefined;

type ConfigInput = Omit<Partial<AppConfig>, 'theme' | 'editorMode' | 'recentDocuments'> & {
  theme?: string;
  editorMode?: string;
  recentDocuments?: RecentDocumentInput[];
};

export function normalizeConfig(input: ConfigInput | null | undefined): AppConfig {
  const recentDocuments = normalizeRecentDocuments(input?.recentDocuments);
  const autoSaveDelay = input?.autoSaveDelay && input.autoSaveDelay > 0 ? input.autoSaveDelay : defaultConfig.autoSaveDelay;
  const showOutline = typeof input?.showOutline === 'boolean' ? input.showOutline : defaultConfig.showOutline;
  const editorMode = normalizeEditorMode(input?.editorMode);
  const editorFontSize = typeof input?.editorFontSize === 'number' && input.editorFontSize >= 10 && input.editorFontSize <= 32 ? input.editorFontSize : defaultConfig.editorFontSize;
  const workspacePath = typeof input?.workspacePath === 'string' ? input.workspacePath.trim() : defaultConfig.workspacePath;
  const openTabPaths = normalizeOpenTabPaths((input as Partial<AppConfig> | undefined)?.openTabPaths);
  const activeTabPath = typeof (input as Partial<AppConfig> | undefined)?.activeTabPath === 'string'
    ? (input as Partial<AppConfig>).activeTabPath!.trim()
    : defaultConfig.activeTabPath;
  const collapsedFolderPaths = normalizeCollapsedFolderPaths((input as Partial<AppConfig> | undefined)?.collapsedFolderPaths);
  const workspaceStates = normalizeWorkspaceStates((input as Partial<AppConfig> | undefined)?.workspaceStates);

  return {
    ...defaultConfig,
    ...input,
    theme: normalizeTheme(input?.theme),
    autoSaveDelay,
    showOutline,
    editorMode,
    editorFontSize,
    workspacePath,
    openTabPaths,
    activeTabPath,
    collapsedFolderPaths,
    workspaceStates,
    recentDocuments,
  };
}

function normalizeTheme(theme: string | undefined): ThemePreference {
  if (theme === 'light' || theme === 'dark' || theme === 'system') return theme;
  return 'system';
}

function normalizeEditorMode(mode: string | undefined): EditorMode {
  if (mode === 'source' || mode === 'rendered') return mode;
  return 'rendered';
}

function normalizeRecentDocuments(items: RecentDocumentInput[] | undefined): RecentDocument[] {
  if (!Array.isArray(items)) return [];

  const seen = new Set<string>();
  const recentDocuments: RecentDocument[] = [];

  for (const item of items) {
    const path = typeof item?.path === 'string' ? item.path.trim() : '';
    if (!path) continue;

    const type = normalizeRecentType(item.type);
    const key = `${type}\u0000${path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    recentDocuments.push({
      path,
      name: item.name || displayNameFromPath(path),
      type,
      lastOpenedAt: item.lastOpenedAt || '',
    });
  }

  return recentDocuments;
}

function normalizeOpenTabPaths(items: string[] | undefined): string[] {
  if (!Array.isArray(items)) return [];

  const seen = new Set<string>();
  const openTabPaths: string[] = [];

  for (const item of items) {
    const path = typeof item === 'string' ? item.trim() : '';
    if (!path || seen.has(path)) continue;
    seen.add(path);
    openTabPaths.push(path);
  }

  return openTabPaths;
}

function normalizeCollapsedFolderPaths(items: string[] | undefined): string[] {
  if (!Array.isArray(items)) return [];

  const seen = new Set<string>();
  const collapsedFolderPaths: string[] = [];

  for (const item of items) {
    const path = typeof item === 'string' ? normalizeFolderId(item) : '';
    if (!path || seen.has(path)) continue;
    seen.add(path);
    collapsedFolderPaths.push(path);
  }

  return collapsedFolderPaths;
}

function normalizeWorkspaceSessionState(input: WorkspaceSessionStateInput): WorkspaceSessionState {
  const openTabPaths = normalizeOpenTabPaths(input?.openTabPaths);
  const activeTabPath = typeof input?.activeTabPath === 'string' ? input.activeTabPath.trim() : '';
  const collapsedFolderPaths = normalizeCollapsedFolderPaths(input?.collapsedFolderPaths);

  return {
    openTabPaths,
    activeTabPath,
    collapsedFolderPaths,
  };
}

function normalizeWorkspaceStates(items: Record<string, WorkspaceSessionState> | undefined): Record<string, WorkspaceSessionState> {
  if (!items || typeof items !== 'object') return {};

  const workspaceStates: Record<string, WorkspaceSessionState> = {};
  for (const [workspacePath, state] of Object.entries(items)) {
    const normalizedWorkspacePath = typeof workspacePath === 'string' ? workspacePath.trim() : '';
    if (!normalizedWorkspacePath) continue;
    workspaceStates[normalizedWorkspacePath] = normalizeWorkspaceSessionState(state);
  }
  return workspaceStates;
}

function normalizeFolderId(path: string) {
  return path.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function normalizeRecentType(type: string | undefined): RecentDocument['type'] {
  return type === 'folder' ? 'folder' : 'file';
}

export function createEmptyDocument(): DocumentState {
  return {
    id: crypto.randomUUID(),
    path: '',
    name: t('document.untitled'),
    markdown: t('document.defaultMarkdown'),
    isDirty: false,
    locked: false,
    lastSavedAt: '',
    lastModified: '',
  };
}

export function documentFromPayload(payload: DocumentPayload): DocumentState {
  return {
    id: crypto.randomUUID(),
    path: payload.path,
    name: payload.name || t('document.untitled'),
    markdown: payload.content || '',
    isDirty: false,
    locked: false,
    lastSavedAt: '',
    lastModified: payload.lastModified || '',
  };
}

export function documentAfterSave(document: DocumentState, result: SaveResult): DocumentState {
  return {
    ...document,
    path: result.path,
    name: result.name || document.name,
    isDirty: false,
    lastSavedAt: result.savedAt,
  };
}

export function calculateStats(markdown: string): DocumentStats {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/[#>*_`~\-|:[\]()]/g, ' ')
    .trim();

  const words = plain.length === 0 ? 0 : plain.split(/\s+/).filter(Boolean).length;

  return {
    characters: markdown.length,
    words,
    lines: markdown.length === 0 ? 1 : markdown.split(/\r\n|\r|\n/).length,
  };
}

export function nextTheme(theme: AppConfig['theme']): AppConfig['theme'] {
  const resolved = resolveTheme(theme);

  if (theme === 'system') {
    // Skip explicit mode that would look identical to system
    return resolved === 'light' ? 'dark' : 'light';
  }
  if (theme === 'light') return 'dark';
  // theme === 'dark': if system is also dark, skip to light
  if (resolved === 'dark') return 'light';
  return 'system';
}

export function resolveTheme(theme: AppConfig['theme']) {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function displayNameFromPath(path: string) {
  if (!path) return t('document.untitled');
  return path.split(/[\\/]/).pop() || path;
}
