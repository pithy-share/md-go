import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import './App.css';
import { Toolbar } from './components/Toolbar';
import { Sidebar, OutlinePanel } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { StartPage } from './components/StartPage';
import { WorkspaceSearch } from './components/WorkspaceSearch';
import { MarkdownEditor, SourceMarkdownEditor } from './editor/MarkdownEditor';
import { markdownToExportHtml } from './editor/markdown';
import {
  calculateStats,
  createEmptyDocument,
  displayNameFromPath,
  documentAfterSave,
  documentFromPayload,
  nextTheme,
  normalizeConfig,
} from './state/documentStore';
import type { AppConfig, DocumentPayload, DocumentState, EditorMode, HotkeyBinding, OutlineItem, RecentDocument, SaveResult, Workspace, WorkspaceSearchResult, WorkspaceSessionState } from './types/app';
import {
  CreateWorkspaceFile,
  CreateWorkspaceFolder,
  DeleteWorkspaceItem,
  ExportHTML,
  MoveWorkspaceItem,
  ExportPDF,
  LoadConfig,
  LoadHotkeys,
  OpenDocument,
  OpenFolder,
  ReadDocument,
  RenameWorkspaceItem,
  SaveDocument,
  SaveDocumentAs,
  ScanFolder,
  SearchWorkspace,
  WatchFile,
  UnwatchFile,
} from '../wailsjs/go/main/App';
import { LogPrint, OnFileDrop, OnFileDropOff, EventsOn } from '../wailsjs/runtime/runtime';
import { HotkeySettings } from './components/HotkeySettings';
import { TabBar } from './components/TabBar';
import { CommandPalette } from './components/CommandPalette';
import { SettingsPanel } from './components/SettingsPanel';
import type { CommandItem } from './types/app';
import {
  resolveStartupWorkspacePath,
  resolveWorkspaceSessionState,
  serializeSessionSnapshot,
  pruneMissingWorkspaceReference,
  removeRecentDocument,
  isMissingPathError,
} from './state/workspaceSession';
import { t, getLocale, setLocale, type Locale } from './i18n';
import { Copy } from 'lucide-react';
import { useAppConfig } from './hooks/useAppConfig';
import { useTabs } from './hooks/useTabs';

function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [showStartPage, setShowStartPage] = useState(true);
  const sourceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const restoredRecentRef = useRef(false);
  const sessionPersistenceReadyRef = useRef(false);
  const lastPersistedSessionRef = useRef('');
  const [message, setMessage] = useState(t('app.ready'));
  // currentLocale is initialized from localStorage at i18n module load, so this
  // just mirrors it into React state for re-rendering on switch.
  const [locale, setLocaleState] = useState<Locale>(() => getLocale());

  const switchLocale = useCallback((next: Locale) => {
    if (next === getLocale()) return;
    setLocale(next);
    setLocaleState(next);
    try { localStorage.setItem('md-go-locale', next); } catch { /* ignore */ }
    setMessage(t('message.languageChanged', { language: t(next === 'zh' ? 'language.zh' : 'language.en') }));
  }, []);
  const [workspaceSearchOpen, setWorkspaceSearchOpen] = useState(false);
  const [workspaceSearchQuery, setWorkspaceSearchQuery] = useState('');
  const [workspaceSearchResults, setWorkspaceSearchResults] = useState<WorkspaceSearchResult[]>([]);
  const [workspaceSearchLoading, setWorkspaceSearchLoading] = useState(false);

  const currentWorkspacePath = workspace?.rootPath ?? '';

  const {
    config,
    setConfig,
    effectiveTheme,
    currentWorkspaceSession,
    persistConfig,
    persistConfigWith,
    persistWorkspaceSessionState,
  } = useAppConfig({ currentWorkspacePath, onMessage: setMessage });

  // Refilled below once handleOpenWorkspaceFile exists. goBack/goForward live in
  // useTabs and reach back into App through this ref so the nav index stays the
  // hook's single source of truth.
  const openFileForNavRef = useRef<(path: string) => void>(() => {});

  const {
    tabs,
    setTabs,
    tabsRef,
    activeTabIndex,
    setActiveTabIndex,
    activeTabIndexRef,
    activeTab,
    pushFileNav,
    updateActiveTab,
    updateTabById,
    handleUnavailableFile,
    handleNew,
    handleCloseTab,
    handleCloseAll,
    handleCloseRight,
    handleCloseLeft,
    handleToggleLock,
    handleReorder,
    goBack,
    goForward,
  } = useTabs({ onMessage: setMessage, onOutlineReset: () => setOutline([]), onShowStartPageChange: setShowStartPage, openFileForNavRef });

  // ── Hotkey state ──
  const [hotkeys, setHotkeys] = useState<HotkeyBinding[]>([]);
  const [hotkeySettingsOpen, setHotkeySettingsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const actionHandlersRef = useRef<Record<string, () => void>>({});

  const stats = useMemo(() => calculateStats(activeTab.markdown), [activeTab.markdown]);

  useEffect(() => {
    let active = true;
    LoadConfig()
      .then(async (loaded) => {
        if (!active) return;
        const merged = normalizeConfig(loaded);
        let startupConfig = merged;
        setConfig(startupConfig);

        const startupWorkspacePath = resolveStartupWorkspacePath(startupConfig);
        if (startupWorkspacePath) {
          try {
            const ws = await ScanFolder(startupWorkspacePath);
            if (!active) return;
            await handleWorkspaceLoaded(ws);
            await restoreSessionTabs(startupConfig, startupWorkspacePath);
            return;
          } catch (error) {
            console.error(error);
            if (!active) return;
            const nextConfig = pruneMissingWorkspaceReference(startupConfig, startupWorkspacePath);
            startupConfig = nextConfig;
            setConfig(nextConfig);
            void persistConfigWith(() => nextConfig);
          }
        }

        if (await restoreSessionTabs(startupConfig, '')) return;

        const latestRecent = startupConfig.recentDocuments[0];
        if (!latestRecent?.path) return;
        if (latestRecent.type === 'folder') {
          void ScanFolder(latestRecent.path)
            .then(async (ws) => {
              if (!active) return;
              await handleWorkspaceLoaded(ws);
            })
            .catch((error) => {
              console.error(error);
              if (!active) return;
              const nextConfig = pruneMissingWorkspaceReference(startupConfig, latestRecent.path);
              setConfig(nextConfig);
              void persistConfigWith(() => nextConfig);
            });
          return;
        }
        try {
          const payload = await ReadDocument(latestRecent.path);
          if (!active || !payload?.path) return;
          restoredRecentRef.current = true;
          const restoredTab = documentFromPayload(payload);
          setTabs([restoredTab]);
          setActiveTabIndex(0);
          setShowStartPage(false);
          if (payload.lastModified) {
            void WatchFile(payload.path, payload.lastModified);
          }
          setMessage(t('message.opened', { name: payload.name || displayNameFromPath(payload.path) }));
        } catch {
          // File may have been moved or deleted — clear the stale recent entry
          // so it does not keep blocking restoration on future launches.
          const nextConfig = removeRecentDocument(startupConfig, latestRecent.path, latestRecent.type);
          setConfig(nextConfig);
          void persistConfigWith(() => nextConfig);
        }
      })
      .catch(console.error)
      .finally(() => {
        if (active) {
          sessionPersistenceReadyRef.current = true;
        }
      });

    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function restoreSessionTabs(sessionConfig: AppConfig, workspacePath = '') {
    const sessionState = resolveWorkspaceSessionState(sessionConfig, workspacePath);
    const sessionPaths = sessionState.openTabPaths.filter(Boolean);
    if (sessionPaths.length === 0) return false;

    const results = await Promise.allSettled(sessionPaths.map((path) => ReadDocument(path)));
    const restoredPayloads: DocumentPayload[] = [];

    for (const result of results) {
      if (result.status !== 'fulfilled' || !result.value?.path) continue;
      restoredPayloads.push(result.value);
    }

    if (restoredPayloads.length === 0) {
      lastPersistedSessionRef.current = serializeSessionSnapshot(workspacePath, [], '');
      void persistWorkspaceSessionState(workspacePath, { openTabPaths: [], activeTabPath: '' });
      return false;
    }

    const restoredTabs = restoredPayloads.map(documentFromPayload);
    const nextActiveIndex = sessionState.activeTabPath
      ? restoredTabs.findIndex((tab) => tab.path === sessionState.activeTabPath)
      : 0;
    const normalizedActiveIndex = nextActiveIndex >= 0 ? nextActiveIndex : 0;
    const normalizedOpenTabPaths = restoredTabs.map((tab) => tab.path);
    const normalizedActiveTabPath = restoredTabs[normalizedActiveIndex]?.path || '';

    restoredRecentRef.current = true;
    setTabs(restoredTabs);
    setActiveTabIndex(normalizedActiveIndex);
    setShowStartPage(false);
    for (const payload of restoredPayloads) {
      if (payload.lastModified) {
        void WatchFile(payload.path, payload.lastModified);
      }
    }

    const snapshot = serializeSessionSnapshot(workspacePath, normalizedOpenTabPaths, normalizedActiveTabPath);
    lastPersistedSessionRef.current = snapshot;

    if (
      normalizedOpenTabPaths.length !== sessionState.openTabPaths.length ||
      normalizedOpenTabPaths.some((path, index) => path !== sessionState.openTabPaths[index]) ||
      normalizedActiveTabPath !== sessionState.activeTabPath
    ) {
      void persistWorkspaceSessionState(workspacePath, {
        openTabPaths: normalizedOpenTabPaths,
        activeTabPath: normalizedActiveTabPath,
      });
    }

    setMessage(restoredTabs.length === 1
      ? t('message.restored', { name: restoredTabs[0].name })
      : t('message.restoredTabs', { count: restoredTabs.length }));
    return true;
  }

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

  useEffect(() => {
    if (!sessionPersistenceReadyRef.current) return;

    const openTabPaths = tabs.filter((tab) => tab.path).map((tab) => tab.path);
    const activeTabPath = tabs[activeTabIndex]?.path || '';
    const snapshot = serializeSessionSnapshot(currentWorkspacePath, openTabPaths, activeTabPath);
    if (lastPersistedSessionRef.current === snapshot) return;

    lastPersistedSessionRef.current = snapshot;
    void persistWorkspaceSessionState(currentWorkspacePath, { openTabPaths, activeTabPath });
  }, [tabs, activeTabIndex, currentWorkspacePath, persistWorkspaceSessionState]);

  const handleOpen = useCallback(async () => {
    try {
      const payload = await OpenDocument();
      if (!payload?.path && !payload?.content) return;
      const existingIndex = tabs.findIndex(t => t.path === payload.path && payload.path !== '');
      if (existingIndex >= 0) {
        setActiveTabIndex(existingIndex);
        setMessage(t('message.switchedTo', { name: payload.name }));
        return;
      }
      const newTab = documentFromPayload(payload);
      setTabs(prev => [...prev, newTab]);
      setActiveTabIndex(tabs.length);
      setOutline([]);
      setShowStartPage(false);
      pushFileNav(payload.path);
      if (payload.lastModified) {
        void WatchFile(payload.path, payload.lastModified);
      }
      setMessage(t('message.opened', { name: payload.name }));
    } catch (error) {
      console.error(error);
      setMessage(t('message.openFailed'));
    }
  }, [tabs, pushFileNav]);

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
        setShowStartPage(false);
        if (!skipHistory) pushFileNav(path);
        if (payload.lastModified) {
          void WatchFile(path, payload.lastModified);
        }
      } catch (error) {
        console.error(error);
        setMessage(t('message.workspaceFileUnavailable'));
      }
      return;
    }

    try {
      const payload = await ReadDocument(path);
      const newTab = documentFromPayload(payload);
      setTabs(prev => [...prev, newTab]);
      setActiveTabIndex(tabs.length);
      setShowStartPage(false);
      if (!skipHistory) pushFileNav(path);
      if (payload.lastModified) {
        void WatchFile(path, payload.lastModified);
      }
    } catch (error) {
      console.error(error);
      setMessage(t('message.workspaceFileUnavailable'));
    }
  }, [tabs, activeTabIndex, updateActiveTab, pushFileNav]);

  const handleOpenLocalFile = useCallback(async (path: string) => {
    // Always read through the backend first. payload.path is canonicalized by
    // filepath.Clean (OS separators + real on-disk casing), and tab paths come
    // from the same ReadDocument source. Comparing the frontend-resolved
    // `path` (forward slashes, link casing) directly against tab paths fails
    // to match an already-open file and opens a duplicate tab.
    let payload: DocumentPayload;
    try {
      payload = await ReadDocument(path);
    } catch (error) {
      console.error(error);
      setMessage(t('message.linkedFileOpenFailed', { path }));
      return;
    }

    const existingIndex = tabs.findIndex(t => t.path === payload.path);
    if (existingIndex >= 0) {
      setActiveTabIndex(existingIndex);
      pushFileNav(tabs[existingIndex].path);
      return;
    }

    const current = tabs[activeTabIndex];
    if (!current.isDirty && current.path === '' && current.markdown === createEmptyDocument().markdown) {
      updateActiveTab(() => documentFromPayload(payload));
      setShowStartPage(false);
      pushFileNav(payload.path);
      if (payload.lastModified) {
        void WatchFile(payload.path, payload.lastModified);
      }
      return;
    }

    const newTab = documentFromPayload(payload);
    setTabs(prev => [...prev, newTab]);
    setActiveTabIndex(tabs.length);
    setShowStartPage(false);
    pushFileNav(payload.path);
    if (payload.lastModified) {
      void WatchFile(payload.path, payload.lastModified);
    }
  }, [tabs, activeTabIndex, updateActiveTab, pushFileNav]);

  // goBack/goForward open a file through this ref without appending to history.
  openFileForNavRef.current = (path: string) => {
    void handleOpenWorkspaceFile(path, true);
  };

  const handleSave = useCallback(async () => {
    try {
      if (activeTab.path) {
        const result = await saveToPath(activeTab.path, activeTab.markdown);
        updateActiveTab((current) => documentAfterSave(current, result));
        void WatchFile(result.path, result.savedAt);
        setMessage(t('message.saved', { name: result.name }));
      } else {
        const result: SaveResult = await SaveDocumentAs(activeTab.markdown);
        if (!result?.path) return;
        updateActiveTab((current) => documentAfterSave(current, result));
        void WatchFile(result.path, result.savedAt);
        setMessage(t('message.saved', { name: result.name }));
      }
    } catch (error) {
      console.error(error);
      setMessage(t('message.saveFailed'));
    }
  }, [activeTab.markdown, activeTab.path, saveToPath, updateActiveTab]);

  const handleSaveAs = useCallback(async () => {
    try {
      const result: SaveResult = await SaveDocumentAs(activeTab.markdown);
      if (!result?.path) return;
      updateActiveTab((current) => documentAfterSave(current, result));
      void WatchFile(result.path, result.savedAt);
      setMessage(t('message.saved', { name: result.name }));
    } catch (error) {
      console.error(error);
      setMessage(t('message.saveAsFailed'));
    }
  }, [activeTab.markdown, updateActiveTab]);

  const handleExport = useCallback(async () => {
    try {
      const html = markdownToExportHtml(activeTab.markdown, activeTab.name, activeTab.path);
      const result = await ExportHTML({ title: activeTab.name, html, sourcePath: activeTab.path });
      if (result?.path) setMessage(t('message.exported', { name: result.name }));
    } catch (error) {
      console.error(error);
      setMessage(t('message.exportFailed'));
    }
  }, [activeTab.markdown, activeTab.name, activeTab.path]);

  const handleExportPdf = useCallback(async () => {
    try {
      const html = markdownToExportHtml(activeTab.markdown, activeTab.name, activeTab.path);
      const result = await ExportPDF({ title: activeTab.name, html, sourcePath: activeTab.path });
      if (result?.fallbackKind === 'html') {
        setMessage(t('message.pdfFallbackHtml', { name: result.name }));
      } else if (result?.path) {
        setMessage(t('message.exportedPdf', { name: result.name }));
      }
    } catch (error) {
      console.error(error);
      setMessage(t('message.pdfExportFailed'));
    }
  }, [activeTab.markdown, activeTab.name, activeTab.path]);

  const handleOpenFolder = useCallback(async () => {
    try {
      const nextWorkspace = await OpenFolder();
      if (!nextWorkspace?.rootPath) return;
      setWorkspace({ ...nextWorkspace, files: nextWorkspace.files ?? [] });
      setConfig((current) => ({ ...current, workspacePath: nextWorkspace.rootPath, showSidebar: true }));
      void persistConfig({ workspacePath: nextWorkspace.rootPath, showSidebar: true });
      setMessage(t('message.openedFolder', { name: nextWorkspace.name || displayNameFromPath(nextWorkspace.rootPath) }));
    } catch (error) {
      console.error(error);
      setMessage(t('message.openFolderFailed'));
    }
  }, [persistConfig]);

  const handleWorkspaceLoaded = useCallback(async (ws: Workspace) => {
    if (!ws?.rootPath) return;
    const latestConfig = normalizeConfig(await LoadConfig());

    setWorkspace({ ...ws, files: ws.files ?? [] });
    setConfig((current) => ({
      ...current,
      showSidebar: true,
      workspacePath: ws.rootPath,
    }));
    if (!latestConfig.showSidebar || latestConfig.workspacePath !== ws.rootPath) {
      void persistConfig({ showSidebar: true, workspacePath: ws.rootPath });
    }
    if (!restoredRecentRef.current) setMessage(t('message.workspace', { name: ws.name || displayNameFromPath(ws.rootPath) }));
  }, [persistConfig]);

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

  const handleCollapsedFoldersChange = useCallback((collapsedFolderPaths: string[]) => {
    void persistWorkspaceSessionState(currentWorkspacePath, { collapsedFolderPaths });
  }, [currentWorkspacePath, persistWorkspaceSessionState]);

  const handleRefreshWorkspace = useCallback(async () => {
    if (!workspace?.rootPath) return;
    try {
      const ws = await ScanFolder(workspace.rootPath);
      setWorkspace({ ...ws, files: ws.files ?? [] });
      setMessage(t('message.workspaceRefreshed'));
    } catch (error) {
      console.error(error);
      setMessage(t('message.workspaceRefreshFailed'));
    }
  }, [workspace?.rootPath]);

  const handleCreateWorkspaceFile = useCallback(async (parentDir: string) => {
    const name = window.prompt(t('prompt.fileName'));
    if (!name) return;
    try {
      await CreateWorkspaceFile(parentDir, name);
      await handleRefreshWorkspace();
    } catch (error) {
      console.error(error);
      setMessage(t('message.createFileFailed', { error: String(error) }));
    }
  }, [handleRefreshWorkspace]);

  const handleCreateWorkspaceFolder = useCallback(async (parentDir: string) => {
    const name = window.prompt(t('prompt.folderName'));
    if (!name) return;
    try {
      await CreateWorkspaceFolder(parentDir, name);
      await handleRefreshWorkspace();
    } catch (error) {
      console.error(error);
      setMessage(t('message.createFolderFailed', { error: String(error) }));
    }
  }, [handleRefreshWorkspace]);

  const handleDeleteWorkspaceItem = useCallback(async (rawPath: string) => {
    const isDir = rawPath.endsWith('|dir|');
    const path = isDir ? rawPath.slice(0, -5) : rawPath;

    const name = path.split(/[/\\]/).pop() || path;

    // Confirm is already handled in Sidebar's context menu
    try {
      await DeleteWorkspaceItem(path, isDir);

      // Close any tabs that point to this file or inside this directory
      const currentTabs = tabsRef.current;
      const remaining = currentTabs.filter(t => {
        if (!t.path) return true;
        if (isDir) return !t.path.startsWith(path + '/') && !t.path.startsWith(path + '\\');
        return t.path !== path;
      });

      if (remaining.length === 0) {
        setTabs([createEmptyDocument()]);
        setActiveTabIndex(0);
        setOutline([]);
        setShowStartPage(true);
      } else {
        setTabs(remaining);
        // Check if active tab was removed
        const currentActiveIdx = activeTabIndexRef.current;
        const activeTab = currentTabs[currentActiveIdx];
        if (activeTab?.path) {
          const wasRemoved = isDir
            ? activeTab.path.startsWith(path + '/') || activeTab.path.startsWith(path + '\\')
            : activeTab.path === path;
          if (wasRemoved) {
            setActiveTabIndex(Math.max(0, currentActiveIdx > 0 ? currentActiveIdx - 1 : 0));
          }
        }
        // Adjust index if it exceeds the remaining tabs
        if (currentActiveIdx >= remaining.length) {
          setActiveTabIndex(Math.max(0, remaining.length - 1));
        }
      }

      await handleRefreshWorkspace();
      setMessage(t('message.deleted', { name }));
    } catch (error) {
      console.error(error);
      setMessage(t('message.deleteFailed', { error: String(error) }));
    }
  }, [handleRefreshWorkspace]);

  const handleRenameWorkspaceItem = useCallback(async (oldPath: string, newName: string) => {
    try {
      const result = await RenameWorkspaceItem(oldPath, newName);

      // Unwatch old path, watch new path for any affected tabs
      setTabs(prev => prev.map(t => {
        if (t.path === oldPath) {
          void UnwatchFile(oldPath);
          void WatchFile(result.path, result.modifiedAt || '');
          return { ...t, path: result.path, name: result.name };
        }
        if (t.path && (t.path.startsWith(oldPath + '/') || t.path.startsWith(oldPath + '\\'))) {
          const relPath = t.path.substring(oldPath.length + 1);
          const newTabPath = result.path + '/' + relPath;
          void UnwatchFile(t.path);
          void WatchFile(newTabPath, t.lastSavedAt || '');
          return { ...t, path: newTabPath };
        }
        return t;
      }));

      await handleRefreshWorkspace();
      setMessage(t('message.renamed', { name: newName }));
    } catch (error) {
      console.error(error);
      setMessage(t('message.renameFailed', { error: String(error) }));
    }
  }, [handleRefreshWorkspace]);

  const handleMoveWorkspaceItem = useCallback(async (oldPath: string, newParentDir: string) => {
    try {
      const result = await MoveWorkspaceItem(oldPath, newParentDir);
      // Update tabs that reference the moved file
      setTabs(prev => prev.map(t => {
        if (t.path === oldPath) {
          void UnwatchFile(oldPath);
          void WatchFile(result.path, result.modifiedAt || '');
          return { ...t, path: result.path, name: result.name };
        }
        // If a folder was moved, update all files under it
        if (t.path && (t.path.startsWith(oldPath + '/') || t.path.startsWith(oldPath + '\\'))) {
          const relPath = t.path.substring(oldPath.length + 1);
          const newTabPath = result.path + '/' + relPath;
          void UnwatchFile(t.path);
          void WatchFile(newTabPath, t.lastSavedAt || '');
          return { ...t, path: newTabPath };
        }
        return t;
      }));
      await handleRefreshWorkspace();
      setMessage(t('message.moved', { name: result.name }));
    } catch (error) {
      console.error(error);
      setMessage(t('message.moveFailed', { error: String(error) }));
    }
  }, [handleRefreshWorkspace]);

  const handleOpenRecent = useCallback(async (item: RecentDocument) => {
    try {
      if (item.type === 'folder') {
        const ws = await ScanFolder(item.path);
        await handleWorkspaceLoaded(ws);
        return;
      }

      await handleOpenLocalFile(item.path);
      setShowStartPage(false);
    } catch (error) {
      console.error(error);
      const nextConfig = item.type === 'folder'
        ? pruneMissingWorkspaceReference(config, item.path)
        : removeRecentDocument(config, item.path, item.type);
      setConfig(nextConfig);
      void persistConfigWith(() => nextConfig);
      setMessage(t('message.recentUnavailable'));
    }
  }, [config, handleOpenLocalFile, handleWorkspaceLoaded, persistConfigWith]);

  const handleRestoreSession = useCallback(async () => {
    const restoredCurrent = currentWorkspacePath
      ? await restoreSessionTabs(config, currentWorkspacePath)
      : false;
    const restoredGlobal = restoredCurrent ? true : await restoreSessionTabs(config, '');
    if (!restoredGlobal) {
      setMessage(t('message.noSavedSession'));
    }
  }, [config, currentWorkspacePath]);

  const handleOpenWorkspaceSearch = useCallback(() => {
    if (!workspace?.rootPath) {
      setMessage(t('message.openFolderBeforeSearch'));
      return;
    }
    setWorkspaceSearchOpen(true);
  }, [workspace?.rootPath]);

  const handleOpenSearchResult = useCallback((result: WorkspaceSearchResult) => {
    setWorkspaceSearchOpen(false);
    setWorkspaceSearchQuery('');
    void handleOpenWorkspaceFile(result.path).then(() => {
      setMessage(t('message.openedAtLine', { name: result.name, line: result.line }));
    });
  }, [handleOpenWorkspaceFile]);

  const handleToggleHotkeySettings = useCallback(() => {
    setHotkeySettingsOpen((open) => !open);
  }, []);

  const handleToggleSettings = useCallback(() => {
    setSettingsOpen((open) => !open);
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

  useEffect(() => {
    if (!workspaceSearchOpen) return;

    const query = workspaceSearchQuery.trim();
    if (!query) {
      setWorkspaceSearchResults([]);
      setWorkspaceSearchLoading(false);
      return;
    }

    let cancelled = false;
    setWorkspaceSearchLoading(true);
    const timeout = window.setTimeout(() => {
      SearchWorkspace(query)
        .then((results) => {
          if (cancelled) return;
          setWorkspaceSearchResults(results ?? []);
        })
        .catch((error) => {
          if (cancelled) return;
          console.error(error);
          setWorkspaceSearchResults([]);
          setMessage(t('message.workspaceSearchFailed'));
        })
        .finally(() => {
          if (!cancelled) setWorkspaceSearchLoading(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [workspaceSearchOpen, workspaceSearchQuery]);

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

  // ── Command palette ──
  const commands: CommandItem[] = useMemo(() => [
    // File
    { id: 'new', label: t('start.newDocument'), description: t('start.newDocument'), category: 'file', action: handleNew, hotkeyLabel: 'Ctrl+N' },
    { id: 'open', label: t('start.openFile'), description: t('start.openFile'), category: 'file', action: handleOpen, hotkeyLabel: 'Ctrl+O' },
    { id: 'save', label: t('toolbar.save'), description: t('toolbar.save'), category: 'file', action: handleSave, hotkeyLabel: 'Ctrl+S' },
    { id: 'save-as', label: t('toolbar.saveAs'), description: t('toolbar.saveAs'), category: 'file', action: handleSaveAs, hotkeyLabel: 'Ctrl+Shift+S' },
    { id: 'open-folder', label: t('toolbar.openFolder'), description: t('toolbar.openFolder'), category: 'file', action: handleOpenFolder },
    { id: 'export-html', label: t('toolbar.exportHtml'), description: t('toolbar.exportHtml'), category: 'file', action: handleExport, hotkeyLabel: 'Ctrl+Shift+E' },
    { id: 'export-pdf', label: t('toolbar.exportPdf'), description: t('toolbar.exportPdf'), category: 'file', action: handleExportPdf, hotkeyLabel: 'Ctrl+Shift+P' },
    // Edit
    { id: 'find', label: t('command.find'), description: t('command.find'), category: 'edit', action: handleFindAction, hotkeyLabel: 'Ctrl+F' },
    { id: 'workspace-search', label: t('start.searchWorkspace'), description: t('start.searchWorkspace'), category: 'edit', action: handleOpenWorkspaceSearch, hotkeyLabel: 'Ctrl+Shift+F' },
    // Format
    { id: 'bold', label: t('toolbar.bold'), description: t('toolbar.bold'), category: 'format', action: () => editor?.chain().focus().toggleBold().run(), hotkeyLabel: 'Ctrl+B' },
    { id: 'italic', label: t('toolbar.italic'), description: t('toolbar.italic'), category: 'format', action: () => editor?.chain().focus().toggleItalic().run(), hotkeyLabel: 'Ctrl+I' },
    { id: 'heading1', label: t('toolbar.heading1'), description: t('toolbar.heading1'), category: 'format', action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), hotkeyLabel: 'Ctrl+1' },
    { id: 'heading2', label: t('toolbar.heading2'), description: t('toolbar.heading2'), category: 'format', action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), hotkeyLabel: 'Ctrl+2' },
    { id: 'heading3', label: t('toolbar.heading3'), description: t('toolbar.heading3'), category: 'format', action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), hotkeyLabel: 'Ctrl+3' },
    { id: 'link', label: t('toolbar.link'), description: t('toolbar.link'), category: 'format', action: handleLinkAction, hotkeyLabel: 'Ctrl+K' },
    { id: 'code', label: t('toolbar.inlineCode'), description: t('toolbar.inlineCode'), category: 'format', action: () => editor?.chain().focus().toggleCode().run(), hotkeyLabel: 'Ctrl+Shift+`' },
    { id: 'highlight', label: t('command.highlight'), description: t('command.highlight'), category: 'format', action: () => editor?.chain().focus().toggleHighlight().run(), hotkeyLabel: 'Ctrl+Shift+H' },
    { id: 'bullet-list', label: t('toolbar.bulletList'), description: t('toolbar.bulletList'), category: 'format', action: () => editor?.chain().focus().toggleBulletList().run() },
    { id: 'ordered-list', label: t('toolbar.orderedList'), description: t('toolbar.orderedList'), category: 'format', action: () => editor?.chain().focus().toggleOrderedList().run() },
    { id: 'task-list', label: t('toolbar.taskList'), description: t('toolbar.taskList'), category: 'format', action: () => editor?.chain().focus().toggleTaskList().run() },
    { id: 'blockquote', label: t('toolbar.quote'), description: t('toolbar.quote'), category: 'format', action: () => editor?.chain().focus().toggleBlockquote().run() },
    { id: 'code-block', label: t('toolbar.codeBlock'), description: t('toolbar.codeBlock'), category: 'format', action: () => editor?.chain().focus().setCodeBlock().run() },
    { id: 'table', label: t('toolbar.insertTable'), description: t('toolbar.insertTable'), category: 'format', action: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    // View
    { id: 'toggle-sidebar', label: t('toolbar.toggleSidebar'), description: t('toolbar.toggleSidebar'), category: 'view', action: handleToggleSidebar, hotkeyLabel: 'Ctrl+Shift+B' },
    { id: 'toggle-outline', label: t('toolbar.toggleOutline'), description: t('toolbar.toggleOutline'), category: 'view', action: handleToggleOutline, hotkeyLabel: 'Ctrl+Shift+O' },
    { id: 'toggle-editor-mode', label: t('toolbar.switchSource'), description: t('toolbar.switchSource'), category: 'view', action: handleToggleEditorMode, hotkeyLabel: 'Ctrl+Shift+M' },
    { id: 'toggle-theme', label: t('toolbar.theme', { theme: config.theme }), description: t('toolbar.theme', { theme: config.theme }), category: 'view', action: handleToggleTheme },
    { id: 'open-settings', label: t('command.openSettings'), description: t('command.openSettings'), category: 'view', action: () => setSettingsOpen(true), hotkeyLabel: 'Ctrl+,' },
    // Tab
    { id: 'close-tab', label: t('command.closeTab'), description: t('command.closeTab'), category: 'tab', action: () => handleCloseTab(activeTabIndex), hotkeyLabel: 'Ctrl+W' },
    { id: 'next-tab', label: t('command.nextTab'), description: t('command.nextTab'), category: 'tab', action: () => setActiveTabIndex(prev => (prev + 1) % tabs.length), hotkeyLabel: 'Ctrl+Tab' },
    { id: 'prev-tab', label: t('command.prevTab'), description: t('command.prevTab'), category: 'tab', action: () => setActiveTabIndex(prev => (prev - 1 + tabs.length) % tabs.length), hotkeyLabel: 'Ctrl+Shift+Tab' },
    // Language
    { id: 'language-zh', label: t('language.zh'), description: t('language.zh'), category: 'language', action: () => switchLocale('zh') },
    { id: 'language-en', label: t('language.en'), description: t('language.en'), category: 'language', action: () => switchLocale('en') },
  ], [handleNew, handleOpen, handleSave, handleSaveAs, handleOpenFolder, handleExport, handleExportPdf, handleFindAction, handleOpenWorkspaceSearch, editor, handleLinkAction, handleToggleSidebar, handleToggleOutline, handleToggleEditorMode, handleToggleTheme, handleCloseTab, activeTabIndex, tabs.length, config.theme, switchLocale, locale]);

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
      'export-pdf': handleExportPdf,
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
      'workspace-search': handleOpenWorkspaceSearch,
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

      // Ctrl+P → command palette
      if ((event.ctrlKey || event.metaKey) && event.key === 'p' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        setCommandPaletteOpen(prev => !prev);
        return;
      }

      // Ctrl+, → settings
      if ((event.ctrlKey || event.metaKey) && event.key === ',' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        setSettingsOpen(prev => !prev);
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
        void WatchFile(result.path, result.savedAt);
      }).catch((error) => {
        console.error(error);
        setMessage(t('message.autoSaveFailed'));
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

  // ── External file change detection ──
  useEffect(() => {
    const cancel = EventsOn('file-external-change', (path: string, newLastModified: string) => {
      if (!path) return;
      const currentTabs = tabsRef.current;
      const tabIndex = currentTabs.findIndex(t => t.path === path);
      if (tabIndex === -1) return;

      const tab = currentTabs[tabIndex];
      if (!newLastModified) {
        handleUnavailableFile(path);
        return;
      }

      if (tab.isDirty) {
        const reload = window.confirm(
          t('confirm.externalChange', { name: tab.name })
        );
        if (!reload) {
          // User chose to keep local version — re-watch with new mod time so we don't keep prompting
          if (newLastModified) {
            void WatchFile(path, newLastModified);
          }
          return;
        }
      }

      // Reload the file content
      ReadDocument(path)
        .then((payload) => {
          if (!payload?.path) return;
          const currentTabsAfter = tabsRef.current;
          const idx = currentTabsAfter.findIndex(t => t.path === path);
          if (idx === -1) return;
          setTabs(prev => prev.map(t => t.path === path ? documentFromPayload(payload) : t));
          setMessage(t('message.reloadedExternal', { name: payload.name }));
          // Re-watch with the new mod time
          if (payload.lastModified) {
            void WatchFile(path, payload.lastModified);
          }
        })
        .catch((error) => {
          console.error(error);
          if (isMissingPathError(error)) {
            handleUnavailableFile(path);
            return;
          }
          setMessage(t('message.reloadFailed', { path }));
        });
    });

    return () => {
      cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleUnavailableFile]);

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
        onExportPdf={handleExportPdf}
        onToggleSidebar={handleToggleSidebar}
        onToggleOutline={handleToggleOutline}
        onToggleEditorMode={handleToggleEditorMode}
        onToggleTheme={handleToggleTheme}
        onAutoSaveChange={handleAutoSaveChange}
        onToggleHotkeySettings={handleToggleHotkeySettings}
        onOpenSettings={handleToggleSettings}
        locale={locale}
        onSwitchLocale={() => switchLocale(locale === 'zh' ? 'en' : 'zh')}
      />
      <TabBar
        tabs={tabs}
        activeTabIndex={activeTabIndex}
        onSelectTab={setActiveTabIndex}
        onCloseTab={handleCloseTab}
        onNewTab={handleNew}
        onCloseAll={handleCloseAll}
        onCloseRight={handleCloseRight}
        onCloseLeft={handleCloseLeft}
        onReorder={handleReorder}
        onToggleLock={handleToggleLock}
      />
      <main className="workspace">
        {config.showSidebar && (
          <Sidebar
            currentPath={activeTab.path}
            openPaths={tabs.map(t => t.path).filter(Boolean)}
            workspace={workspace}
            initialCollapsedFolderPaths={currentWorkspaceSession.collapsedFolderPaths}
            onOpenWorkspaceFile={handleOpenWorkspaceFile}
            onRefreshWorkspace={handleRefreshWorkspace}
            onCollapsedFoldersChange={handleCollapsedFoldersChange}
            onFileDeleted={handleDeleteWorkspaceItem}
            onFileRenamed={handleRenameWorkspaceItem}
            onCreateFile={handleCreateWorkspaceFile}
            onCreateFolder={handleCreateWorkspaceFolder}
            onMoveItem={handleMoveWorkspaceItem}
          />
        )}
        <section className="document-area">
          {showStartPage ? (
            <StartPage
              recentDocuments={config.recentDocuments}
              workspaceName={workspace?.name || ''}
              canRestoreSession={currentWorkspaceSession.openTabPaths.length > 0 || config.openTabPaths.length > 0}
              onNew={handleNew}
              onOpenFile={handleOpen}
              onOpenFolder={handleOpenFolder}
              onRestoreSession={handleRestoreSession}
              onOpenRecent={handleOpenRecent}
              onSearchWorkspace={handleOpenWorkspaceSearch}
            />
          ) : config.editorMode === 'source' ? (
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
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={handleToggleSettings}
        config={config}
        locale={locale}
        onConfigChange={persistConfig}
        onLocaleChange={switchLocale}
      />
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={commands}
      />
      <WorkspaceSearch
        open={workspaceSearchOpen}
        query={workspaceSearchQuery}
        results={workspaceSearchResults}
        loading={workspaceSearchLoading}
        workspaceName={workspace?.name || ''}
        onQueryChange={setWorkspaceSearchQuery}
        onClose={() => setWorkspaceSearchOpen(false)}
        onOpenResult={handleOpenSearchResult}
      />
      <div className="toast" role="status" aria-live="polite">
        <span className="toast-message">{message}</span>
        <button
          type="button"
          className="toast-copy"
          title={t('toast.copy')}
          aria-label={t('toast.copy')}
          onClick={() => navigator.clipboard?.writeText(message).catch(() => {})}
        >
          <Copy size={13} />
        </button>
      </div>
    </div>
  );
}

export default App;
