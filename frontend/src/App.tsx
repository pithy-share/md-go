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
import { TabBar } from './components/TabBar';

function App() {
  const [tabs, setTabs] = useState<DocumentState[]>([createEmptyDocument()]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const sourceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const restoredRecentRef = useRef(false);
  const [message, setMessage] = useState('Ready');

  const activeTab = tabs[activeTabIndex];

  const updateActiveTab = useCallback((updater: (tab: DocumentState) => DocumentState) => {
    setTabs(prev => {
      const next = [...prev];
      next[activeTabIndex] = updater(next[activeTabIndex]);
      return next;
    });
  }, [activeTabIndex]);

  const updateTabById = useCallback((id: string, updater: (tab: DocumentState) => DocumentState) => {
    setTabs(prev => prev.map(t => t.id === id ? updater(t) : t));
  }, []);

  // ── Hotkey state ──
  const [hotkeys, setHotkeys] = useState<HotkeyBinding[]>([]);
  const [hotkeySettingsOpen, setHotkeySettingsOpen] = useState(false);
  const actionHandlersRef = useRef<Record<string, () => void>>({});

  // ── File navigation history ──
  const fileNavRef = useRef<{ history: string[]; index: number }>({ history: [], index: -1 });
  const [fileNavHistory, setFileNavHistory] = useState<string[]>([]);
  const [fileNavIndex, setFileNavIndex] = useState(-1);

  const pushFileNav = useCallback((path: string) => {
    const { history, index } = fileNavRef.current;
    const newHistory = history.slice(0, index + 1);
    if (newHistory.length > 0 && newHistory[newHistory.length - 1] === path) return;
    const nextHistory = [...newHistory, path];
    const nextIndex = nextHistory.length - 1;
    fileNavRef.current = { history: nextHistory, index: nextIndex };
    setFileNavHistory(nextHistory);
    setFileNavIndex(nextIndex);
  }, []);

  const stats = useMemo(() => calculateStats(activeTab.markdown), [activeTab.markdown]);
  const effectiveTheme = resolveTheme(config.theme);

  useEffect(() => {
    let active = true;
    LoadConfig()
      .then(async (loaded) => {
        if (!active) return;
        const merged = normalizeConfig(loaded);
        setConfig(merged);

        const latestRecent = merged.recentDocuments[0];
        if (!latestRecent?.path) return;
        if (latestRecent.type === 'folder') {
          void ScanFolder(latestRecent.path)
            .then(async (ws) => {
              if (!active) return;
              await handleWorkspaceLoaded(ws);
            })
            .catch(console.error);
          return;
        }
        try {
          const payload = await ReadDocument(latestRecent.path);
          if (!active || !payload?.path) return;
          restoredRecentRef.current = true;
          const restoredTab = documentFromPayload(payload);
          setTabs([restoredTab]);
          setActiveTabIndex(0);
          setMessage(`Restored ${payload.name || displayNameFromPath(payload.path)}`);
        } catch {
          // File may have been moved or deleted — clear the stale recent entry
          // so it does not keep blocking restoration on future launches.
          void persistConfig({ recentDocuments: merged.recentDocuments.filter((_, i) => i !== 0) });
        }
      })
      .catch(console.error);

    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme;
    const bg = effectiveTheme === 'dark'
      ? { r: 25, g: 28, b: 32 }
      : { r: 245, g: 246, b: 248 };
    try { WindowSetBackgroundColour(bg.r, bg.g, bg.b, 1); } catch { /* Wails runtime may be unavailable in browser dev */ }
  }, [effectiveTheme]);

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

  const saveToPath = useCallback(async (path: string, markdown: string) => {
    const result = await SaveDocument(path, markdown);
    return result;
  }, []);

  const handleMarkdownChange = useCallback((markdown: string) => {
    updateActiveTab((current) => {
      if (current.markdown === markdown) return current;
      return { ...current, markdown, isDirty: true };
    });
  }, [updateActiveTab]);

  const handleSourceReady = useCallback((textarea: HTMLTextAreaElement | null) => {
    sourceTextareaRef.current = textarea;
  }, []);

  const handleNew = useCallback(() => {
    const newTab = createEmptyDocument();
    setTabs(prev => [...prev, newTab]);
    setActiveTabIndex(tabs.length);
    setOutline([]);
    setMessage('New document');
  }, [tabs.length]);

  const handleOpen = useCallback(async () => {
    try {
      const payload = await OpenDocument();
      if (!payload?.path && !payload?.content) return;
      const existingIndex = tabs.findIndex(t => t.path === payload.path && payload.path !== '');
      if (existingIndex >= 0) {
        setActiveTabIndex(existingIndex);
        setMessage(`Switched to ${payload.name}`);
        return;
      }
      const newTab = documentFromPayload(payload);
      setTabs(prev => [...prev, newTab]);
      setActiveTabIndex(tabs.length);
      setOutline([]);
      pushFileNav(payload.path);
      setMessage(`Opened ${payload.name}`);
    } catch (error) {
      console.error(error);
      setMessage('Open failed');
    }
  }, [tabs, pushFileNav]);

  const handleCloseTab = useCallback((index: number) => {
    const tab = tabs[index];
    if (!tab) return;

    if (tab.isDirty) {
      const discard = window.confirm(`"${tab.name}" has unsaved changes. Discard changes?`);
      if (!discard) return;
    }

    if (tabs.length <= 1) {
      setTabs([createEmptyDocument()]);
      setActiveTabIndex(0);
      setOutline([]);
      return;
    }

    setTabs(prev => prev.filter((_, i) => i !== index));
    if (index <= activeTabIndex) {
      setActiveTabIndex(Math.max(0, index > 0 ? index - 1 : 0));
    }
  }, [tabs, activeTabIndex]);

  const handleOpenWorkspaceFile = useCallback(async (path: string, skipHistory = false) => {
    const existingIndex = tabs.findIndex(t => t.path === path);
    if (existingIndex >= 0) {
      setActiveTabIndex(existingIndex);
      if (!skipHistory) pushFileNav(path);
      return;
    }

    const current = tabs[activeTabIndex];
    if (!current.isDirty && current.path === '' && current.markdown === createEmptyDocument().markdown) {
      try {
        const payload = await ReadDocument(path);
        updateActiveTab(() => documentFromPayload(payload));
        if (!skipHistory) pushFileNav(path);
      } catch (error) {
        console.error(error);
        setMessage('Workspace file is unavailable');
      }
      return;
    }

    try {
      const payload = await ReadDocument(path);
      const newTab = documentFromPayload(payload);
      setTabs(prev => [...prev, newTab]);
      setActiveTabIndex(tabs.length);
      if (!skipHistory) pushFileNav(path);
    } catch (error) {
      console.error(error);
      setMessage('Workspace file is unavailable');
    }
  }, [tabs, activeTabIndex, updateActiveTab, pushFileNav]);

  const handleOpenLocalFile = useCallback(async (path: string) => {
    const existingIndex = tabs.findIndex(t => t.path === path);
    if (existingIndex >= 0) {
      setActiveTabIndex(existingIndex);
      pushFileNav(path);
      return;
    }

    const current = tabs[activeTabIndex];
    if (!current.isDirty && current.path === '' && current.markdown === createEmptyDocument().markdown) {
      try {
        const payload = await ReadDocument(path);
        updateActiveTab(() => documentFromPayload(payload));
        pushFileNav(path);
      } catch (error) {
        console.error(error);
        setMessage(`Could not open linked file: ${path}`);
      }
      return;
    }

    try {
      const payload = await ReadDocument(path);
      const newTab = documentFromPayload(payload);
      setTabs(prev => [...prev, newTab]);
      setActiveTabIndex(tabs.length);
      pushFileNav(path);
    } catch (error) {
      console.error(error);
      setMessage(`Could not open linked file: ${path}`);
    }
  }, [tabs, activeTabIndex, updateActiveTab, pushFileNav]);

  const handleOpenWorkspaceFileRef = useRef(handleOpenWorkspaceFile);
  handleOpenWorkspaceFileRef.current = handleOpenWorkspaceFile;

  const goBack = useCallback(() => {
    const { history, index } = fileNavRef.current;
    if (index <= 0) return;
    const newIndex = index - 1;
    fileNavRef.current = { ...fileNavRef.current, index: newIndex };
    setFileNavIndex(newIndex);
    void handleOpenWorkspaceFileRef.current(history[newIndex], true);
  }, []);

  const goForward = useCallback(() => {
    const { history, index } = fileNavRef.current;
    if (index >= history.length - 1) return;
    const newIndex = index + 1;
    fileNavRef.current = { ...fileNavRef.current, index: newIndex };
    setFileNavIndex(newIndex);
    void handleOpenWorkspaceFileRef.current(history[newIndex], true);
  }, []);

  const handleSave = useCallback(async () => {
    try {
      if (activeTab.path) {
        const result = await saveToPath(activeTab.path, activeTab.markdown);
        updateActiveTab((current) => documentAfterSave(current, result));
        setMessage(`Saved ${result.name}`);
      } else {
        const result: SaveResult = await SaveDocumentAs(activeTab.markdown);
        if (!result?.path) return;
        updateActiveTab((current) => documentAfterSave(current, result));
        setMessage(`Saved ${result.name}`);
      }
    } catch (error) {
      console.error(error);
      setMessage('Save failed');
    }
  }, [activeTab.markdown, activeTab.path, saveToPath, updateActiveTab]);

  const handleSaveAs = useCallback(async () => {
    try {
      const result: SaveResult = await SaveDocumentAs(activeTab.markdown);
      if (!result?.path) return;
      updateActiveTab((current) => documentAfterSave(current, result));
      setMessage(`Saved ${result.name}`);
    } catch (error) {
      console.error(error);
      setMessage('Save as failed');
    }
  }, [activeTab.markdown, updateActiveTab]);

  const handleExport = useCallback(async () => {
    try {
      const html = markdownToExportHtml(activeTab.markdown, activeTab.name);
      const result = await ExportHTML({ title: activeTab.name, html });
      if (result?.path) setMessage(`Exported ${result.name}`);
    } catch (error) {
      console.error(error);
      setMessage('Export failed');
    }
  }, [activeTab.markdown, activeTab.name]);

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

  const handleWorkspaceLoaded = useCallback(async (ws: Workspace) => {
    if (!ws?.rootPath) return;
    const prevWorkspacePath = (await LoadConfig())?.workspacePath ?? '';

    setWorkspace({ ...ws, files: ws.files ?? [] });
    setConfig((current) => ({
      ...current,
      showSidebar: true,
      workspacePath: ws.rootPath,
    }));
    if (!config.showSidebar) {
      void persistConfig({ showSidebar: true, workspacePath: ws.rootPath });
    } else if (ws.rootPath !== prevWorkspacePath) {
      void persistConfig({ workspacePath: ws.rootPath });
    }
    if (!restoredRecentRef.current) setMessage(`Workspace: ${ws.name || displayNameFromPath(ws.rootPath)}`);
  }, [config, persistConfig]);

  const handleToggleSidebar = useCallback(() => {
    const next = !config.showSidebar;
    setConfig((current) => ({ ...current, showSidebar: next }));
    void persistConfig({ showSidebar: next });
  }, [config, persistConfig]);

  const handleToggleOutline = useCallback(() => {
    const next = !config.showOutline;
    setConfig((current) => ({ ...current, showOutline: next }));
    void persistConfig({ showOutline: next });
  }, [config, persistConfig]);

  const handleToggleEditorMode = useCallback(() => {
    const next: EditorMode = config.editorMode === 'rendered' ? 'source' : 'rendered';
    setConfig((current) => ({ ...current, editorMode: next }));
    void persistConfig({ editorMode: next });
  }, [config, persistConfig]);

  const handleToggleTheme = useCallback(() => {
    const nextThemePref = nextTheme(config.theme);
    setConfig((current) => ({ ...current, theme: nextThemePref }));
    void persistConfig({ theme: nextThemePref });
  }, [config, persistConfig]);

  const handleAutoSaveChange = useCallback((enabled: boolean) => {
    setConfig((current) => ({ ...current, autoSave: enabled }));
    void persistConfig({ autoSave: enabled });
  }, [persistConfig]);

  const handleToggleHotkeySettings = useCallback(() => {
    setHotkeySettingsOpen((open) => !open);
  }, []);

  const handleHotkeysSaved = useCallback((bindings: HotkeyBinding[]) => {
    setHotkeys(bindings);
    setHotkeySettingsOpen(false);
  }, []);

  // ── Jump to heading (active tab) ──
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

    const editorDocEl = editor.view.dom;
    const resolvedPos = editor.state.doc.resolve(pos + 1);
    const coords = editor.view.coordsAtPos(resolvedPos.pos);
    requestAnimationFrame(() => {
      editorDocEl.scrollTop = Math.max(
        0,
        editorDocEl.scrollTop + coords.top - editorDocEl.getBoundingClientRect().top - editorDocEl.clientHeight * 0.2,
      );
    });
  }, [config.editorMode, editor]);

  // ── Load hotkeys from backend ──
  useEffect(() => {
    LoadHotkeys()
      .then((bindings) => {
        if (bindings) setHotkeys(bindings);
      })
      .catch(console.error);
  }, []);

  // ── Drag & drop: open .md files dropped onto the window ──
  const handleOpenLocalFileRef = useRef(handleOpenLocalFile);
  handleOpenLocalFileRef.current = handleOpenLocalFile;

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
      LogPrint(`DROP: opening ${mdPath}`);
      void handleOpenLocalFileRef.current(mdPath);
    }, false);

    return () => {
      LogPrint('DROP: OnFileDrop cleanup');
      OnFileDropOff();
    };
  }, []);

  const handleLinkAction = useCallback(() => {
    window.dispatchEvent(new CustomEvent('md-go:open-link-popover'));
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
      'close-tab': () => handleCloseTab(activeTabIndex),
      'next-tab': () => setActiveTabIndex(prev => (prev + 1) % tabs.length),
      'prev-tab': () => setActiveTabIndex(prev => (prev - 1 + tabs.length) % tabs.length),
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

  // ── File navigation: Alt+Left/Right ──
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          goBack();
          return;
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          goForward();
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goBack, goForward]);

  // ── Global keydown: match against dynamic hotkey bindings ──
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Hard-coded Ctrl+Tab / Ctrl+Shift+Tab (hard to capture via hotkey bindings)
      if ((event.ctrlKey || event.metaKey) && event.key === 'Tab' && !event.altKey) {
        event.preventDefault();
        setActiveTabIndex(prev => event.shiftKey
          ? (prev - 1 + tabs.length) % tabs.length
          : (prev + 1) % tabs.length);
        return;
      }

      // Skip if the editor already handled this event
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hotkeys, tabs.length]);

  useEffect(() => {
    if (!config.autoSave || !activeTab.isDirty || !activeTab.path) return;
    const timeout = window.setTimeout(() => {
      void saveToPath(activeTab.path, activeTab.markdown).then(result => {
        updateActiveTab(current => documentAfterSave(current, result));
      }).catch((error) => {
        console.error(error);
        setMessage('Auto save failed');
      });
    }, config.autoSaveDelay);
    return () => window.clearTimeout(timeout);
  }, [config.autoSave, config.autoSaveDelay, activeTab.isDirty, activeTab.markdown, activeTab.path, saveToPath, updateActiveTab]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!tabs.some(t => t.isDirty)) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [tabs]);

  return (
    <div className="app-frame" style={{ '--wails-drop-target': '1' } as React.CSSProperties}>
      <Toolbar
        editor={editor}
        theme={effectiveTheme}
        sidebarVisible={config.showSidebar}
        outlineVisible={config.showOutline}
        editorMode={config.editorMode}
        autoSave={config.autoSave}
        isDirty={activeTab.isDirty}
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
      <TabBar
        tabs={tabs}
        activeTabIndex={activeTabIndex}
        onSelectTab={setActiveTabIndex}
        onCloseTab={handleCloseTab}
        onNewTab={handleNew}
      />
      <main className="workspace">
        {config.showSidebar && (
          <Sidebar
            currentPath={activeTab.path}
            openPaths={tabs.map(t => t.path).filter(Boolean)}
            workspace={workspace}
            onOpenWorkspaceFile={handleOpenWorkspaceFile}
          />
        )}
        <section className="document-area">
          {config.editorMode === 'source' ? (
            <SourceMarkdownEditor
              key={`source-${activeTab.id}`}
              markdown={activeTab.markdown}
              documentPath={activeTab.path}
              onChange={handleMarkdownChange}
              onOutlineChange={setOutline}
              onEditorReady={setEditor}
              onSourceReady={handleSourceReady}
            />
          ) : (
            <MarkdownEditor
              key={`wysiwyg-${activeTab.id}`}
              markdown={activeTab.markdown}
              documentPath={activeTab.path}
              onChange={handleMarkdownChange}
              onOutlineChange={setOutline}
              onEditorReady={setEditor}
              onOpenLocalFile={handleOpenLocalFile}
            />
          )}
        </section>
        {config.showOutline && <OutlinePanel outline={outline} onJumpToHeading={handleJumpToHeading} />}
      </main>
      <StatusBar path={activeTab.path} isDirty={activeTab.isDirty} lastSavedAt={activeTab.lastSavedAt} stats={stats} />
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
