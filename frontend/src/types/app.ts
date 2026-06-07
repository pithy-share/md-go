export type ThemePreference = 'system' | 'light' | 'dark';

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
}

export interface RecentDocument {
  path: string;
  name: string;
  lastOpenedAt: string;
}

export interface AppConfig {
  theme: ThemePreference;
  autoSave: boolean;
  autoSaveDelay: number;
  showSidebar: boolean;
  recentDocuments: RecentDocument[];
}

export interface ExportPayload {
  title: string;
  html: string;
}

export interface DocumentState {
  path: string;
  name: string;
  markdown: string;
  isDirty: boolean;
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