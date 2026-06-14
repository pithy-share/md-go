export type ThemePreference = 'system' | 'light' | 'dark';
export type EditorMode = 'rendered' | 'source';
export type RecentDocumentType = 'file' | 'folder';

export interface DocumentMeta {
  title: string;
  content: string;
  path: string;
}

export interface DocumentPayload {
  path: string;
  name: string;
  content: string;
  exists: boolean;
  lastModified: string;
}

export interface SaveResult {
  path: string;
  name: string;
  savedAt: string;
  fallbackKind?: 'html' | string;
}

export interface RecentDocument {
  path: string;
  name: string;
  type: RecentDocumentType;
  lastOpenedAt: string;
}

export interface WorkspaceFile {
  path: string;
  name: string;
  relativePath: string;
  depth: number;
  size: number;
  modifiedAt: string;
}

export interface Workspace {
  rootPath: string;
  name: string;
  files: WorkspaceFile[];
}

export interface WorkspaceSearchResult {
  path: string;
  name: string;
  relativePath: string;
  line: number;
  column: number;
  snippet: string;
}

export interface WorkspaceSessionState {
  openTabPaths: string[];
  activeTabPath: string;
  collapsedFolderPaths: string[];
}

export interface AppConfig {
  theme: ThemePreference;
  autoSave: boolean;
  autoSaveDelay: number;
  showSidebar: boolean;
  showOutline: boolean;
  editorMode: EditorMode;
  workspacePath: string;
  openTabPaths: string[];
  activeTabPath: string;
  collapsedFolderPaths: string[];
  workspaceStates: Record<string, WorkspaceSessionState>;
  recentDocuments: RecentDocument[];
}

export interface ExportPayload {
  title: string;
  html: string;
  sourcePath: string;
}

export interface ExportPdfPayload {
  title: string;
  html: string;
  sourcePath: string;
}

export interface DocumentState {
  id: string;
  path: string;
  name: string;
  markdown: string;
  isDirty: boolean;
  locked: boolean;
  lastSavedAt: string;
  lastModified: string;
}

export interface OutlineItem {
  id: string;
  level: number;
  text: string;
  pos: number;
}

export interface DocumentStats {
  characters: number;
  words: number;
  lines: number;
}

export interface HotkeyBinding {
  id: string;
  action: string;
  label: string;
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  enabled: boolean;
  category: string;
}

export interface CommandItem {
  id: string;
  label: string;
  description: string;
  category: 'file' | 'edit' | 'view' | 'tab' | 'format' | 'language';
  action: () => void;
  hotkeyLabel?: string;
}
