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
  defaultConfig,
  displayNameFromPath,
  documentAfterSave,
  documentFromPayload,
  nextTheme,
  normalizeConfig,
  resolveTheme,
} from './state/documentStore';
import {
  applyWorkspaceSessionState,
  isMissingPathError,
  pruneMissingWorkspaceReference,
  removeRecentDocument,
  resolveStartupWorkspacePath,
  resolveWorkspaceSessionState,
  serializeSessionSnapshot,
} from './state/workspaceSession';
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
  SaveConfig,
  SaveDocument,
  SaveDocumentAs,
  ScanFolder,
  SearchWorkspace,
  WatchFile,
  UnwatchFile,
} from '../wailsjs/go/main/App';
import { models } from '../wailsjs/go/models';
import { LogPrint, OnFileDrop, OnFileDropOff, EventsOn, WindowSetBackgroundColour } from '../wailsjs/runtime/runtime';
import { HotkeySettings } from './components/HotkeySettings';
import { TabBar } from './components/TabBar';
import { CommandPalette } from './components/CommandPalette';
import type { CommandItem } from './types/app';
import { t } from './i18n';

function App() {
  const [tabs, setTabs] = useState<DocumentState[]>([createEmptyDocument()]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
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
  const [workspaceSearchOpen, setWorkspaceSearchOpen] = useState(false);
  const [workspaceSearchQuery, setWorkspaceSearchQuery] = useState('');
  const [workspaceSearchResults, setWorkspaceSearchResults] = useState<WorkspaceSearchResult[]>([]);
  const [workspaceSearchLoading, setWorkspaceSearchLoading] = useState(false);

  const activeTab = tabs[activeTabIndex];
  const currentWorkspacePath = workspace?.rootPath ?? '';
  const currentWorkspaceSession = useMemo(
    () => resolveWorkspaceSessionState(config, currentWorkspacePath),
    [config, currentWorkspacePath],
  );

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
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const actionHandlersRef = useRef<Record<string, () => void>>({});

  // ── File navigation history ──
  const fileNavRef = useRef<{ history: string[]; index: number }>({ history: [], index: -1 });
  const [fileNavHistory, setFileNavHistory] = useState<string[]>([]);
  const [fileNavIndex, setFileNavIndex] = useState(-1);

  // ── External file change detection ──
  const tabsRef = useRef<DocumentState[]>(tabs);
  tabsRef.current = tabs;
  const activeTabIndexRef = useRef(activeTabIndex);
  activeTabIndexRef.current = activeTabIndex;

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

  const handleUnavailableFile = useCallback((path: string) => {
    if (!path) return;

    const currentTabs = tabsRef.current;
    const tabIndex = currentTabs.findIndex((tab) => tab.path === path);
    if (tabIndex === -1) return;

    const tab = currentTabs[tabIndex];
    void UnwatchFile(path);

    if (tab.isDirty) {
      setTabs((prev) => prev.map((item) => (
        item.path === path
          ? {
            ...item,
            path: '',
            lastModified: '',
            lastSavedAt: '',
            isDirty: true,
          }
          : item
      )));
      setMessage(t('message.fileDeletedUnsaved', { name: tab.name }));
      return;
    }

    const remaining = currentTabs.filter((item) => item.path !== path);
    if (remaining.length === 0) {
      setTabs([createEmptyDocument()]);
      setActiveTabIndex(0);
      setOutline([]);
      setShowStartPage(true);
      setMessage(t('message.closedMissing', { name: tab.name }));
      return;
    }

    setTabs((prev) => {
      const next = prev.filter((item) => item.path !== path);
      return next.length > 0 ? next : [createEmptyDocument()];
    });
    const currentActiveIdx = activeTabIndexRef.current;
    if (currentActiveIdx > tabIndex) {
      setActiveTabIndex(currentActiveIdx - 1);
    } else if (currentActiveIdx === tabIndex) {
      setActiveTabIndex(Math.max(0, Math.min(tabIndex, remaining.length - 1)));
    } else if (currentActiveIdx >= remaining.length) {
      setActiveTabIndex(Math.max(0, remaining.length - 1));
    }
    setMessage(t('message.closedMissing', { name: tab.name }));
  }, []);

  const stats = useMemo(() => calculateStats(activeTab.markdown), [activeTab.markdown]);
  const effectiveTheme = resolveTheme(config.theme);

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
          setMessage(t('message.restored', { name: payload.name || displayNameFromPath(payload.path) }));
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

  const persistConfigWith = useCallback(async (updater: (current: AppConfig) => AppConfig) => {
    setConfig((current) => updater(current));
    try {
      const latest = normalizeConfig(await LoadConfig());
      const nextConfig = updater(latest);
      const saved = normalizeConfig(await SaveConfig(models.AppConfig.createFrom(nextConfig)));
      setConfig(saved);
    } catch (error) {
      console.error(error);
      setMessage(t('message.settingsSaveFailed'));
    }
  }, []);

  const persistConfig = useCallback(async (updates: Partial<AppConfig>) => {
    await persistConfigWith((current) => ({ ...current, ...updates }));
  }, [persistConfigWith]);

  const persistWorkspaceSessionState = useCallback(async (workspacePath: string, updates: Partial<WorkspaceSessionState>) => {
    await persistConfigWith((current) => applyWorkspaceSessionState(current, workspacePath, updates));
  }, [persistConfigWith]);

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

  const handleNew = useCallback(() => {
    const newTab = createEmptyDocument();
    setTabs(prev => [...prev, newTab]);
    setActiveTabIndex(tabs.length);
    setOutline([]);
    setShowStartPage(false);
    setMessage(t('message.newDocument'));
  }, [tabs.length]);

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

  const handleCloseTab = useCallback((index: number) => {
    const tab = tabs[index];
    if (!tab) return;

    if (tab.locked) {
      setMessage(t('message.tabLocked'));
      return;
    }

    if (tab.isDirty) {
      const discard = window.confirm(t('confirm.unsavedTab', { name: tab.name }));
      if (!discard) return;
    }

    if (tab.path) {
      void UnwatchFile(tab.path);
    }

    if (tabs.length <= 1) {
      setTabs([createEmptyDocument()]);
      setActiveTabIndex(0);
      setOutline([]);
      setShowStartPage(true);
      return;
    }

    setTabs(prev => prev.filter((_, i) => i !== index));
    if (index <= activeTabIndex) {
      setActiveTabIndex(Math.max(0, index > 0 ? index - 1 : 0));
    }
  }, [tabs, activeTabIndex]);

  const confirmDirtyRange = (indices: number[]) => {
    const dirty = indices.filter(i => {
      const t = tabs[i];
      return t?.isDirty && !t?.locked;
    });
    if (dirty.length === 0) return true;
    return window.confirm(t('confirm.unsavedTabs', { count: dirty.length }));
  };

  const handleCloseAll = useCallback(() => {
    const closable = tabs.filter(t => !t.locked);
    if (closable.length === 0) return;
    if (!confirmDirtyRange(closable.map(t => tabs.indexOf(t)))) return;
    // Unwatch all closing tabs
    for (const t of closable) {
      if (t.path) void UnwatchFile(t.path);
    }
    const activeId = tabs[activeTabIndex]?.id;
    const lockedTabs = tabs.filter(t => t.locked);
    const newActiveIndex = lockedTabs.length > 0
      ? Math.max(0, lockedTabs.findIndex(t => t.id === activeId))
      : 0;
    setTabs(prev => {
      const remaining = prev.filter(t => t.locked);
      return remaining.length > 0 ? remaining : [createEmptyDocument()];
    });
    setActiveTabIndex(newActiveIndex);
    setOutline([]);
    setShowStartPage(lockedTabs.length === 0);
  }, [tabs, activeTabIndex]);

  const handleCloseRight = useCallback((index: number) => {
    const closable = tabs.filter((t, i) => i > index && !t.locked);
    if (closable.length === 0) return;
    if (!confirmDirtyRange(closable.map(t => tabs.indexOf(t)))) return;
    for (const t of closable) {
      if (t.path) void UnwatchFile(t.path);
    }
    setTabs(prev => prev.filter((t, i) => i <= index || t.locked));
    if (activeTabIndex > index && !tabs[activeTabIndex]?.locked) {
      setActiveTabIndex(index);
    }
  }, [tabs, activeTabIndex]);

  const handleCloseLeft = useCallback((index: number) => {
    const closable = tabs.filter((t, i) => i < index && !t.locked);
    if (closable.length === 0) return;
    if (!confirmDirtyRange(closable.map(t => tabs.indexOf(t)))) return;
    for (const t of closable) {
      if (t.path) void UnwatchFile(t.path);
    }
    setTabs(prev => prev.filter((t, i) => i >= index || t.locked));
    if (activeTabIndex < index && !tabs[activeTabIndex]?.locked) {
      setActiveTabIndex(0);
    } else if (activeTabIndex >= index) {
      setActiveTabIndex(activeTabIndex - closable.length);
    }
  }, [tabs, activeTabIndex]);

  const handleToggleLock = useCallback((index: number) => {
    const tab = tabs[index];
    if (!tab) return;
    updateTabById(tab.id, t => ({ ...t, locked: !t.locked }));
    setMessage(tab.locked ? t('message.unlocked', { name: tab.name }) : t('message.locked', { name: tab.name }));
  }, [tabs, updateTabById]);

  const handleReorder = useCallback((fromIndex: number, toIndex: number) => {
    setTabs(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    if (fromIndex === activeTabIndex) {
      setActiveTabIndex(toIndex);
    } else if (fromIndex < activeTabIndex && toIndex >= activeTabIndex) {
      setActiveTabIndex(activeTabIndex - 1);
    } else if (fromIndex > activeTabIndex && toIndex <= activeTabIndex) {
      setActiveTabIndex(activeTabIndex + 1);
    }
  }, [activeTabIndex]);

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
        setShowStartPage(false);
        pushFileNav(path);
        if (payload.lastModified) {
          void WatchFile(path, payload.lastModified);
        }
      } catch (error) {
        console.error(error);
        setMessage(t('message.linkedFileOpenFailed', { path }));
      }
      return;
    }

    try {
      const payload = await ReadDocument(path);
      const newTab = documentFromPayload(payload);
      setTabs(prev => [...prev, newTab]);
      setActiveTabIndex(tabs.length);
      setShowStartPage(false);
      pushFileNav(path);
      if (payload.lastModified) {
        void WatchFile(path, payload.lastModified);
      }
    } catch (error) {
      console.error(error);
      setMessage(t('message.linkedFileOpenFailed', { path }));
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
      if (result?.path) setMessage(t('message.exportedPdf', { name: result.name }));
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
    { id: 'new', label: t('command.new.label'), description: t('command.new.description'), category: 'file', action: handleNew, hotkeyLabel: 'Ctrl+N' },
    { id: 'open', label: t('command.open.label'), description: t('command.open.description'), category: 'file', action: handleOpen, hotkeyLabel: 'Ctrl+O' },
    { id: 'save', label: t('command.save.label'), description: t('command.save.description'), category: 'file', action: handleSave, hotkeyLabel: 'Ctrl+S' },
    { id: 'save-as', label: t('command.saveAs.label'), description: t('command.saveAs.description'), category: 'file', action: handleSaveAs, hotkeyLabel: 'Ctrl+Shift+S' },
    { id: 'open-folder', label: t('command.openFolder.label'), description: t('command.openFolder.description'), category: 'file', action: handleOpenFolder },
    { id: 'export-html', label: t('command.exportHtml.label'), description: t('command.exportHtml.description'), category: 'file', action: handleExport, hotkeyLabel: 'Ctrl+Shift+E' },
    { id: 'export-pdf', label: t('command.exportPdf.label'), description: t('command.exportPdf.description'), category: 'file', action: handleExportPdf, hotkeyLabel: 'Ctrl+Shift+P' },
    // Edit
    { id: 'find', label: t('command.find.label'), description: t('command.find.description'), category: 'edit', action: handleFindAction, hotkeyLabel: 'Ctrl+F' },
    { id: 'workspace-search', label: t('command.workspaceSearch.label'), description: t('command.workspaceSearch.description'), category: 'edit', action: handleOpenWorkspaceSearch, hotkeyLabel: 'Ctrl+Shift+F' },
    // Format
    { id: 'bold', label: t('command.bold.label'), description: t('command.bold.description'), category: 'format', action: () => editor?.chain().focus().toggleBold().run(), hotkeyLabel: 'Ctrl+B' },
    { id: 'italic', label: t('command.italic.label'), description: t('command.italic.description'), category: 'format', action: () => editor?.chain().focus().toggleItalic().run(), hotkeyLabel: 'Ctrl+I' },
    { id: 'heading1', label: t('command.heading1.label'), description: t('command.heading1.description'), category: 'format', action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), hotkeyLabel: 'Ctrl+1' },
    { id: 'heading2', label: t('command.heading2.label'), description: t('command.heading2.description'), category: 'format', action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), hotkeyLabel: 'Ctrl+2' },
    { id: 'heading3', label: t('command.heading3.label'), description: t('command.heading3.description'), category: 'format', action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), hotkeyLabel: 'Ctrl+3' },
    { id: 'link', label: t('command.link.label'), description: t('command.link.description'), category: 'format', action: handleLinkAction, hotkeyLabel: 'Ctrl+K' },
    { id: 'code', label: t('command.inlineCode.label'), description: t('command.inlineCode.description'), category: 'format', action: () => editor?.chain().focus().toggleCode().run(), hotkeyLabel: 'Ctrl+Shift+`' },
    { id: 'bullet-list', label: t('command.bulletList.label'), description: t('command.bulletList.description'), category: 'format', action: () => editor?.chain().focus().toggleBulletList().run() },
    { id: 'ordered-list', label: t('command.orderedList.label'), description: t('command.orderedList.description'), category: 'format', action: () => editor?.chain().focus().toggleOrderedList().run() },
    { id: 'task-list', label: t('command.taskList.label'), description: t('command.taskList.description'), category: 'format', action: () => editor?.chain().focus().toggleTaskList().run() },
    { id: 'blockquote', label: t('command.blockquote.label'), description: t('command.blockquote.description'), category: 'format', action: () => editor?.chain().focus().toggleBlockquote().run() },
    { id: 'code-block', label: t('command.codeBlock.label'), description: t('command.codeBlock.description'), category: 'format', action: () => editor?.chain().focus().setCodeBlock().run() },
    { id: 'table', label: t('command.table.label'), description: t('command.table.description'), category: 'format', action: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    // View
    { id: 'toggle-sidebar', label: t('command.toggleSidebar.label'), description: t('command.toggleSidebar.description'), category: 'view', action: handleToggleSidebar, hotkeyLabel: 'Ctrl+Shift+B' },
    { id: 'toggle-outline', label: t('command.toggleOutline.label'), description: t('command.toggleOutline.description'), category: 'view', action: handleToggleOutline, hotkeyLabel: 'Ctrl+Shift+O' },
    { id: 'toggle-editor-mode', label: t('command.toggleEditorMode.label'), description: t('command.toggleEditorMode.description'), category: 'view', action: handleToggleEditorMode, hotkeyLabel: 'Ctrl+Shift+M' },
    { id: 'toggle-theme', label: t('command.toggleTheme.label'), description: t('command.toggleTheme.description'), category: 'view', action: handleToggleTheme },
    // Tab
    { id: 'close-tab', label: t('command.closeTab.label'), description: t('command.closeTab.description'), category: 'tab', action: () => handleCloseTab(activeTabIndex), hotkeyLabel: 'Ctrl+W' },
    { id: 'next-tab', label: t('command.nextTab.label'), description: t('command.nextTab.description'), category: 'tab', action: () => setActiveTabIndex(prev => (prev + 1) % tabs.length), hotkeyLabel: 'Ctrl+Tab' },
    { id: 'prev-tab', label: t('command.prevTab.label'), description: t('command.prevTab.description'), category: 'tab', action: () => setActiveTabIndex(prev => (prev - 1 + tabs.length) % tabs.length), hotkeyLabel: 'Ctrl+Shift+Tab' },
  ], [handleNew, handleOpen, handleSave, handleSaveAs, handleOpenFolder, handleExport, handleExportPdf, handleFindAction, handleOpenWorkspaceSearch, editor, handleLinkAction, handleToggleSidebar, handleToggleOutline, handleToggleEditorMode, handleToggleTheme, handleCloseTab, activeTabIndex, tabs.length]);

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
      <div className="toast" role="status" aria-live="polite">{message}</div>
    </div>
  );
}

export default App;
