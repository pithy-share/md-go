import type { AppConfig, DocumentPayload, DocumentState, DocumentStats, RecentDocument, SaveResult, ThemePreference } from '../types/app';

export const defaultMarkdown = `# Untitled

Start writing in Markdown. Use shortcuts like #, -, 1., > and fenced code blocks.
`;

export const defaultConfig: AppConfig = {
  theme: 'system',
  autoSave: true,
  autoSaveDelay: 1200,
  showSidebar: true,
  recentDocuments: [],
};

export function normalizeConfig(input: (Omit<Partial<AppConfig>, 'theme'> & { theme?: string }) | null | undefined): AppConfig {
  const recentDocuments = Array.isArray(input?.recentDocuments) ? input.recentDocuments : defaultConfig.recentDocuments;
  const autoSaveDelay = input?.autoSaveDelay && input.autoSaveDelay > 0 ? input.autoSaveDelay : defaultConfig.autoSaveDelay;

  return {
    ...defaultConfig,
    ...input,
    theme: normalizeTheme(input?.theme),
    autoSaveDelay,
    recentDocuments,
  };
}

function normalizeTheme(theme: string | undefined): ThemePreference {
  if (theme === 'light' || theme === 'dark' || theme === 'system') return theme;
  return 'system';
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