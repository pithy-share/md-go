import type { AppConfig, DocumentPayload, DocumentState, DocumentStats, EditorMode, RecentDocument, SaveResult, ThemePreference } from '../types/app';

export const defaultMarkdown = `# Untitled

Start writing in Markdown. Use shortcuts like #, -, 1., > and fenced code blocks.
`;

export const defaultConfig: AppConfig = {
  theme: 'system',
  autoSave: true,
  autoSaveDelay: 1200,
  showSidebar: true,
  showOutline: true,
  editorMode: 'rendered',
  recentDocuments: [],
};

type RecentDocumentInput = Omit<Partial<RecentDocument>, 'type'> & { type?: string };

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

  return {
    ...defaultConfig,
    ...input,
    theme: normalizeTheme(input?.theme),
    autoSaveDelay,
    showOutline,
    editorMode,
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

function normalizeRecentType(type: string | undefined): RecentDocument['type'] {
  return type === 'folder' ? 'folder' : 'file';
}

export function createEmptyDocument(): DocumentState {
  return {
    path: '',
    name: 'Untitled.md',
    markdown: defaultMarkdown,
    isDirty: false,
    lastSavedAt: '',
    lastModified: '',
  };
}

export function documentFromPayload(payload: DocumentPayload): DocumentState {
  return {
    path: payload.path,
    name: payload.name || 'Untitled.md',
    markdown: payload.content || '',
    isDirty: false,
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
  if (theme === 'system') return 'light';
  if (theme === 'light') return 'dark';
  return 'system';
}

export function resolveTheme(theme: AppConfig['theme']) {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function displayNameFromPath(path: string) {
  if (!path) return 'Untitled.md';
  return path.split(/[\\/]/).pop() || path;
}