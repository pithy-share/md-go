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
import type { AppConfig, DocumentPayload, DocumentState, EditorMode, HotkeyBinding, OutlineItem, RecentDocument, SaveResult, Workspace } from './types/app';
import {
  ExportHTML,
  LoadConfig,
  LoadHotkeys,
  OpenDocument,
  OpenFolder,
  ReadDocument,
  SaveConfig,
  SaveDocument,
  SaveDocumentAs,
  ScanFolder,
} from '../wailsjs/go/main/App';
import { models } from '../wailsjs/go/models';
import { LogPrint, OnFileDrop, OnFileDropOff, WindowSetBackgroundColour } from '../wailsjs/runtime/runtime';
import { HotkeySettings } from './components/HotkeySettings';

function App() {
  const [documentState, setDocumentState] = useState<DocumentState>(() => createEmptyDocument());
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const sourceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const restoredRecentRef = useRef(false);
  const [message, setMessage] = useState('Ready');

  // ── Hotkey state ──
  const [hotkeys, setHotkeys] = useState<HotkeyBinding[]>([]);
  const [hotkeySettingsOpen, setHotkeySettingsOpen] = useState(false);
  const actionHandlersRef = useRef<Record<string, () => void>>({});

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
    const bg = effectiveTheme === 'dark'
      ? { r: 25, g: 28, b: 32 }
      : { r: 245, g: 246, b: 248 };
    try { WindowSetBackgroundColour(bg.r, bg.g, bg.b, 1); } catch { /* Wails runtime may be unavailable in browser dev */ }
  }, [effectiveTheme]);

  // Pin viewport height to a JS-computed CSS variable so layout
  // never lags behind native window resize — avoids the delayed
  // "shake" that WebView2's async 100vh recalculation can cause.
  useEffect(() => {
    let frameId = 0;
    const setHeight = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
      });
    };
    setHeight();
    window.addEventListener('resize', setHeight);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', setHeight);
    };
  }, []);

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

  // ── Load hotkeys from backend ──
  useEffect(() => {
    LoadHotkeys()
      .then((bindings) => {
        if (bindings) setHotkeys(bindings);
      })
      .catch(console.error);
  }, []);

  // ── Drag & drop: open .md files dropped onto the window ──
  useEffect(() => {
    LogPrint('DROP: OnFileDrop registered');

    OnFileDrop((_x, _y, paths) => {
      LogPrint(`DROP: OnFileDrop paths=[${paths?.join(', ')}]`);
      if (!paths?.length) return;
      const mdPath = paths.find((p: string) => /\.(md|markdown|mdown|mkd)$/i.test(p));
      if (!mdPath) {
        LogPrint('DROP: no .md file in drop');
        return;
      }
      if (!confirmDiscard()) {
        LogPrint('DROP: discarded due to unsaved changes');
        return;
      }
      LogPrint(`DROP: opening ${mdPath}`);
      ReadDocument(mdPath)
        .then((payload) => {
          LogPrint(`DROP: ReadDocument OK name=${payload?.name}`);
          loadDocument(payload);
        })
        .catch((error) => {
          LogPrint(`DROP: ReadDocument ERROR=${String(error)}`);
        });
    }, false);

    return () => {
      LogPrint('DROP: OnFileDrop cleanup');
      OnFileDropOff();
    };
  }, []);

  const handleLinkAction = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const previousUrl = ed.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL', previousUrl ?? 'https://');
    if (url === null) return;
    if (url.trim() === '') {
      ed.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    ed.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  }, []);

  const handleFindAction = useCallback(() => {
    window.dispatchEvent(new CustomEvent('md-go:open-search'));
  }, []);

  // ── Keep action dispatcher ref in sync ──
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    actionHandlersRef.current = {
      save: handleSave,
      'save-as': handleSaveAs,
      new: handleNew,
      open: handleOpen,
      export: handleExport,
      'toggle-sidebar': handleToggleSidebar,
      'toggle-outline': handleToggleOutline,
      'toggle-editor-mode': handleToggleEditorMode,
      bold: () => editorRef.current?.chain().focus().toggleBold().run(),
      italic: () => editorRef.current?.chain().focus().toggleItalic().run(),
      heading1: () => editorRef.current?.chain().focus().toggleHeading({ level: 1 }).run(),
      heading2: () => editorRef.current?.chain().focus().toggleHeading({ level: 2 }).run(),
      heading3: () => editorRef.current?.chain().focus().toggleHeading({ level: 3 }).run(),
      'inline-code': () => editorRef.current?.chain().focus().toggleCode().run(),
      link: () => handleLinkAction(),
      find: () => handleFindAction(),
    };
  });

  // ── Global keydown: match against dynamic hotkey bindings ──
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip if the editor already handled this event (its element-level handler fires first in bubble)
      if (event.defaultPrevented) return;

      for (const binding of hotkeys) {
        if (!binding.enabled) continue;

        const mod = event.ctrlKey || event.metaKey;
        if (binding.ctrl !== mod) continue;
        if (binding.shift !== event.shiftKey) continue;
        if (binding.alt !== event.altKey) continue;
        if (binding.meta !== event.metaKey) continue;
        if (binding.key.toLowerCase() !== event.key.toLowerCase()) continue;

        const handler = actionHandlersRef.current[binding.action];
        if (handler) {
          event.preventDefault();
          handler();
          return;
        }
        // No handler registered — let the browser/editor handle it naturally
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hotkeys]);

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

  const handleToggleHotkeySettings = useCallback(() => {
    setHotkeySettingsOpen((prev) => !prev);
  }, []);

  const handleHotkeysSaved = useCallback((bindings: HotkeyBinding[]) => {
    setHotkeys(bindings);
  }, []);

  return (
    <div className="app-frame" style={{ '--wails-drop-target': '1' } as React.CSSProperties}>
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
        onToggleHotkeySettings={handleToggleHotkeySettings}
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
      <HotkeySettings isOpen={hotkeySettingsOpen} onClose={handleToggleHotkeySettings} onSaved={handleHotkeysSaved} />
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
