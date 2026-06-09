import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import './App.css';
import { Toolbar } from './components/Toolbar';
import { Sidebar, OutlinePanel } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { MarkdownEditor, SourceMarkdownEditor } from './editor/MarkdownEditor';
import { markdownToExportHtml } from './editor/markdown';
import {
  calculateStats,
  createEmptyDocument,
  defaultConfig,
  displayNameFromPath,
  documentAfterSave,
  documentFromPayload,
  nextTheme,
  normalizeConfig,
  resolveTheme,
} from './state/documentStore';
import type { AppConfig, DocumentPayload, DocumentState, EditorMode, OutlineItem, RecentDocument, SaveResult, Workspace } from './types/app';
import {
  ExportHTML,
  LoadConfig,
  OpenDocument,
  OpenFolder,
  ReadDocument,
  SaveConfig,
  SaveDocument,
  SaveDocumentAs,
  ScanFolder,
} from '../wailsjs/go/main/App';
import { models } from '../wailsjs/go/models';

function App() {
  const [documentState, setDocumentState] = useState<DocumentState>(() => createEmptyDocument());
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const sourceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const restoredRecentRef = useRef(false);
  const [message, setMessage] = useState('Ready');

  const stats = useMemo(() => calculateStats(documentState.markdown), [documentState.markdown]);
  const effectiveTheme = resolveTheme(config.theme);

  useEffect(() => {
    let active = true;
    LoadConfig()
      .then(async (loaded) => {
        if (!active) return;
        const merged = normalizeConfig(loaded);
        setConfig(merged);

        const latestRecent = merged.recentDocuments[0];
        const startupWorkspacePath = resolveStartupWorkspacePath(merged);
        if ((!latestRecent?.path && !startupWorkspacePath) || restoredRecentRef.current) return;
        restoredRecentRef.current = true;

        let restoredWorkspace: Workspace | null = null;
        let workspaceUnavailable = false;
        if (startupWorkspacePath) {
          try {
            const nextWorkspace = await ScanFolder(startupWorkspacePath);
            if (!active) return;
            if (nextWorkspace?.rootPath) {
              restoredWorkspace = { ...nextWorkspace, files: nextWorkspace.files ?? [] };
              setWorkspace(restoredWorkspace);
              if (!merged.showSidebar) {
                setConfig((current) => ({ ...current, showSidebar: true }));
              }
            }
          } catch (error) {
            console.error(error);
            if (!active) return;
            workspaceUnavailable = true;
            setMessage('Recent folder is unavailable');
          }
        }

        if (!latestRecent?.path || latestRecent.type === 'folder') {
          if (restoredWorkspace) {
            setMessage(`Restored folder ${restoredWorkspace.name || displayNameFromPath(restoredWorkspace.rootPath)}`);
          }
          return;
        }

        try {
          const payload = await ReadDocument(latestRecent.path);
          if (!active) return;
          if (!payload?.path && !payload?.content) return;
          setDocumentState(documentFromPayload(payload));
          if (restoredWorkspace) {
            setMessage(
              `Restored ${payload.name || displayNameFromPath(payload.path)} in ${restoredWorkspace.name || displayNameFromPath(restoredWorkspace.rootPath)}`,
            );
          } else if (workspaceUnavailable) {
            setMessage(`Restored ${payload.name || displayNameFromPath(payload.path)}; recent folder is unavailable`);
          } else {
            setMessage(`Restored ${payload.name || displayNameFromPath(payload.path)}`);
          }
        } catch (error) {
          console.error(error);
          if (!active) return;
          setMessage('Recent file is unavailable');
        }
      })
      .catch((error) => {
        console.error(error);
        setMessage('Using default settings');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme;
  }, [effectiveTheme]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!documentState.isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [documentState.isDirty]);

  const persistConfig = useCallback(async (updates: Partial<AppConfig>) => {
    setConfig((current) => ({ ...current, ...updates }));
    try {
      const latest = normalizeConfig(await LoadConfig());
      const nextConfig = { ...latest, ...updates };
      const saved = normalizeConfig(await SaveConfig(models.AppConfig.createFrom(nextConfig)));
      setConfig(saved);
    } catch (error) {
      console.error(error);
      setMessage('Could not save settings');
    }
  }, []);

  const confirmDiscard = useCallback(() => {
    if (!documentState.isDirty) return true;
    return window.confirm('Current document has unsaved changes. Continue?');
  }, [documentState.isDirty]);

  const loadDocument = useCallback((payload: DocumentPayload) => {
    if (!payload?.path && !payload?.content) return;
    setDocumentState(documentFromPayload(payload));
    setMessage(`Opened ${payload.name || displayNameFromPath(payload.path)}`);
  }, []);

  const handleNew = useCallback(() => {
    if (!confirmDiscard()) return;
    setDocumentState(createEmptyDocument());
    setOutline([]);
    setMessage('New document');
  }, [confirmDiscard]);

  const handleOpen = useCallback(async () => {
    if (!confirmDiscard()) return;
    try {
      const payload = await OpenDocument();
      loadDocument(payload);
    } catch (error) {
      console.error(error);
      setMessage('Open failed');
    }
  }, [confirmDiscard, loadDocument]);

  const handleOpenFolder = useCallback(async () => {
    try {
      const nextWorkspace = await OpenFolder();
      if (!nextWorkspace?.rootPath) return;
      setWorkspace({ ...nextWorkspace, files: nextWorkspace.files ?? [] });
      setConfig((current) => ({ ...current, workspacePath: nextWorkspace.rootPath, showSidebar: true }));
      if (!config.showSidebar) {
        void persistConfig({ showSidebar: true });
      }
      setMessage(`Opened folder ${nextWorkspace.name || displayNameFromPath(nextWorkspace.rootPath)}`);
    } catch (error) {
      console.error(error);
      setMessage('Open folder failed');
    }
  }, [config, persistConfig]);

  const handleOpenWorkspaceFile = useCallback(async (path: string) => {
    if (!confirmDiscard()) return;
    try {
      const payload = await ReadDocument(path);
      loadDocument(payload);
    } catch (error) {
      console.error(error);
      setMessage('Workspace file is unavailable');
    }
  }, [confirmDiscard, loadDocument]);

  const saveToPath = useCallback(async (path: string, markdown: string) => {
    const result = await SaveDocument(path, markdown);
    setDocumentState((current) => documentAfterSave(current, result));
    setMessage(`Saved ${result.name}`);
    return result;
  }, []);

  const handleSave = useCallback(async () => {
    try {
      await saveToPath(documentState.path, documentState.markdown);
    } catch (error) {
      console.error(error);
      setMessage('Save failed');
    }
  }, [documentState.markdown, documentState.path, saveToPath]);

  const handleSaveAs = useCallback(async () => {
    try {
      const result: SaveResult = await SaveDocumentAs(documentState.markdown);
      if (!result?.path) return;
      setDocumentState((current) => documentAfterSave(current, result));
      setMessage(`Saved ${result.name}`);
    } catch (error) {
      console.error(error);
      setMessage('Save as failed');
    }
  }, [documentState.markdown]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;

      // Ctrl+S → save (Shift+S → save as)
      if (event.key === 's') {
        event.preventDefault();
        if (event.shiftKey) {
          handleSaveAs();
        } else {
          handleSave();
        }
        return;
      }

      // Ctrl+N → new document
      if (event.key === 'n' && !event.shiftKey) {
        event.preventDefault();
        handleNew();
        return;
      }

      // Ctrl+O → open document
      if (event.key === 'o' && !event.shiftKey) {
        event.preventDefault();
        handleOpen();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, handleSaveAs, handleNew, handleOpen]);

  useEffect(() => {
    if (!config.autoSave || !documentState.isDirty || !documentState.path) return;
    const timeout = window.setTimeout(() => {
      void saveToPath(documentState.path, documentState.markdown).catch((error) => {
        console.error(error);
        setMessage('Auto save failed');
      });
    }, config.autoSaveDelay);
    return () => window.clearTimeout(timeout);
  }, [config.autoSave, config.autoSaveDelay, documentState.isDirty, documentState.markdown, documentState.path, saveToPath]);

  const handleMarkdownChange = useCallback((markdown: string) => {
    setDocumentState((current) => {
      if (current.markdown === markdown) return current;
      return {
        ...current,
        markdown,
        isDirty: true,
      };
    });
  }, []);

  const handleSourceReady = useCallback((textarea: HTMLTextAreaElement | null) => {
    sourceTextareaRef.current = textarea;
  }, []);

  const handleJumpToHeading = useCallback((pos: number) => {
    if (config.editorMode === 'source') {
      const textarea = sourceTextareaRef.current;
      if (!textarea) return;
      const lineIndex = textarea.value.slice(0, pos).split(/\r\n|\r|\n/).length - 1;
      const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 22;
      textarea.focus();
      textarea.setSelectionRange(pos, pos);
      textarea.scrollTop = Math.max(0, lineIndex * lineHeight - textarea.clientHeight * 0.35);
      return;
    }

    if (!editor) return;
    editor.chain().focus().setTextSelection(pos + 1).run();
    editor.view.dom.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [config.editorMode, editor]);

  const handleExport = useCallback(async () => {
    try {
      const html = markdownToExportHtml(documentState.markdown, documentState.name);
      const result = await ExportHTML({ title: documentState.name, html });
      if (result?.path) setMessage(`Exported ${result.name}`);
    } catch (error) {
      console.error(error);
      setMessage('Export failed');
    }
  }, [documentState.markdown, documentState.name]);

  const handleToggleTheme = useCallback(() => {
    void persistConfig({ theme: nextTheme(config.theme) });
  }, [config.theme, persistConfig]);

  const handleToggleSidebar = useCallback(() => {
    void persistConfig({ showSidebar: !config.showSidebar });
  }, [config.showSidebar, persistConfig]);

  const handleToggleOutline = useCallback(() => {
    void persistConfig({ showOutline: !config.showOutline });
  }, [config.showOutline, persistConfig]);

  const handleToggleEditorMode = useCallback(() => {
    const editorMode: EditorMode = config.editorMode === 'source' ? 'rendered' : 'source';
    void persistConfig({ editorMode });
    setMessage(editorMode === 'source' ? 'Source mode' : 'Rendered mode');
  }, [config.editorMode, persistConfig]);

  const handleAutoSaveChange = useCallback((enabled: boolean) => {
    void persistConfig({ autoSave: enabled });
  }, [persistConfig]);

  return (
    <div className="app-frame">
      <Toolbar
        editor={editor}
        theme={config.theme}
        sidebarVisible={config.showSidebar}
        outlineVisible={config.showOutline}
        editorMode={config.editorMode}
        autoSave={config.autoSave}
        isDirty={documentState.isDirty}
        onNew={handleNew}
        onOpen={handleOpen}
        onOpenFolder={handleOpenFolder}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onExport={handleExport}
        onToggleSidebar={handleToggleSidebar}
        onToggleOutline={handleToggleOutline}
        onToggleEditorMode={handleToggleEditorMode}
        onToggleTheme={handleToggleTheme}
        onAutoSaveChange={handleAutoSaveChange}
      />
      <main className="workspace">
        {config.showSidebar && (
          <Sidebar
            currentPath={documentState.path}
            workspace={workspace}
            onOpenWorkspaceFile={handleOpenWorkspaceFile}
          />
        )}
        <section className="document-area">
          {config.editorMode === 'source' ? (
            <SourceMarkdownEditor
              markdown={documentState.markdown}
              documentPath={documentState.path}
              onChange={handleMarkdownChange}
              onOutlineChange={setOutline}
              onEditorReady={setEditor}
              onSourceReady={handleSourceReady}
            />
          ) : (
            <MarkdownEditor
              markdown={documentState.markdown}
              documentPath={documentState.path}
              onChange={handleMarkdownChange}
              onOutlineChange={setOutline}
              onEditorReady={setEditor}
            />
          )}
        </section>
        {config.showOutline && <OutlinePanel outline={outline} onJumpToHeading={handleJumpToHeading} />}
      </main>
      <StatusBar path={documentState.path} isDirty={documentState.isDirty} lastSavedAt={documentState.lastSavedAt} stats={stats} />
      <div className="toast" role="status" aria-live="polite">{message}</div>
    </div>
  );
}

function resolveStartupWorkspacePath(config: AppConfig) {
  if (config.workspacePath) return config.workspacePath;

  const latestRecent = config.recentDocuments[0];
  if (!latestRecent?.path) return '';
  if (latestRecent.type === 'folder') return latestRecent.path;
  return findRecentFolderForFile(latestRecent, config.recentDocuments.slice(1))?.path ?? '';
}

function findRecentFolderForFile(fileRecent: RecentDocument, candidates: RecentDocument[]) {
  if (fileRecent.type !== 'file') return null;
  return candidates.find((item) => item.type === 'folder' && isPathInsideFolder(fileRecent.path, item.path)) ?? null;
}

function isPathInsideFolder(filePath: string, folderPath: string) {
  const file = normalizePathForCompare(filePath);
  const folder = normalizePathForCompare(folderPath);
  if (!file || !folder) return false;
  if (file === folder) return false;
  return file.startsWith(folder.endsWith('/') ? folder : `${folder}/`);
}

function normalizePathForCompare(path: string) {
  const normalized = trimTrailingSlashes(path.trim().replace(/\\/g, '/'));
  if (/^[a-z]:\//i.test(normalized) || normalized.startsWith('//')) {
    return normalized.toLowerCase();
  }
  return normalized;
}

function trimTrailingSlashes(path: string) {
  if (path === '/' || /^[a-z]:\/$/i.test(path)) return path;
  return path.replace(/\/+$/, '');
}

export default App;
