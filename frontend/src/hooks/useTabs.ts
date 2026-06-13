import { useCallback, useRef, useState } from 'react';
import { UnwatchFile } from '../../wailsjs/go/main/App';
import { createEmptyDocument } from '../state/documentStore';
import type { DocumentState } from '../types/app';
import { t } from '../i18n';

export interface UseTabsOptions {
  onMessage: (message: string) => void;
  onOutlineReset: () => void;
  onShowStartPageChange: (show: boolean) => void;
  // Opens a file as part of back/forward navigation. The hook owns the nav
  // index, so navigation must not go through pushFileNav (which would append).
  openFileForNavRef: React.MutableRefObject<(path: string) => void>;
}

export interface UseTabsResult {
  tabs: DocumentState[];
  setTabs: React.Dispatch<React.SetStateAction<DocumentState[]>>;
  tabsRef: React.MutableRefObject<DocumentState[]>;
  activeTabIndex: number;
  setActiveTabIndex: React.Dispatch<React.SetStateAction<number>>;
  activeTabIndexRef: React.MutableRefObject<number>;
  activeTab: DocumentState;
  fileNavHistory: string[];
  fileNavIndex: number;
  pushFileNav: (path: string) => void;
  goBack: () => void;
  goForward: () => void;
  updateActiveTab: (updater: (tab: DocumentState) => DocumentState) => void;
  updateTabById: (id: string, updater: (tab: DocumentState) => DocumentState) => void;
  handleUnavailableFile: (path: string) => void;
  handleNew: () => void;
  handleCloseTab: (index: number) => void;
  handleCloseAll: () => void;
  handleCloseRight: (index: number) => void;
  handleCloseLeft: (index: number) => void;
  handleToggleLock: (index: number) => void;
  handleReorder: (fromIndex: number, toIndex: number) => void;
}

export function useTabs({ onMessage, onOutlineReset, onShowStartPageChange, openFileForNavRef }: UseTabsOptions): UseTabsResult {
  const [tabs, setTabs] = useState<DocumentState[]>([createEmptyDocument()]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  // ── File navigation history ──
  const fileNavRef = useRef<{ history: string[]; index: number }>({ history: [], index: -1 });
  const [fileNavHistory, setFileNavHistory] = useState<string[]>([]);
  const [fileNavIndex, setFileNavIndex] = useState(-1);

  // ── External file change detection ──
  const tabsRef = useRef<DocumentState[]>(tabs);
  tabsRef.current = tabs;
  const activeTabIndexRef = useRef(activeTabIndex);
  activeTabIndexRef.current = activeTabIndex;

  const activeTab = tabs[activeTabIndex];

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

  const goBack = useCallback(() => {
    const { history, index } = fileNavRef.current;
    if (index <= 0) return;
    const newIndex = index - 1;
    fileNavRef.current = { history, index: newIndex };
    setFileNavIndex(newIndex);
    openFileForNavRef.current(history[newIndex]);
  }, [openFileForNavRef]);

  const goForward = useCallback(() => {
    const { history, index } = fileNavRef.current;
    if (index >= history.length - 1) return;
    const newIndex = index + 1;
    fileNavRef.current = { history, index: newIndex };
    setFileNavIndex(newIndex);
    openFileForNavRef.current(history[newIndex]);
  }, [openFileForNavRef]);

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
      onMessage(t('message.fileDeletedUnsaved', { name: tab.name }));
      return;
    }

    const remaining = currentTabs.filter((item) => item.path !== path);
    if (remaining.length === 0) {
      setTabs([createEmptyDocument()]);
      setActiveTabIndex(0);
      onOutlineReset();
      onShowStartPageChange(true);
      onMessage(t('message.closedMissing', { name: tab.name }));
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
    onMessage(t('message.closedMissing', { name: tab.name }));
  }, [onMessage, onOutlineReset, onShowStartPageChange]);

  const handleNew = useCallback(() => {
    const newTab = createEmptyDocument();
    setTabs(prev => [...prev, newTab]);
    setActiveTabIndex(tabsRef.current.length);
    onOutlineReset();
    onShowStartPageChange(false);
    onMessage(t('message.newDocument'));
  }, [onMessage, onOutlineReset, onShowStartPageChange]);

  const handleCloseTab = useCallback((index: number) => {
    const tab = tabsRef.current[index];
    if (!tab) return;

    if (tab.locked) {
      onMessage(t('message.tabLocked'));
      return;
    }

    if (tab.isDirty) {
      const discard = window.confirm(t('confirm.unsavedTab', { name: tab.name }));
      if (!discard) return;
    }

    if (tab.path) {
      void UnwatchFile(tab.path);
    }

    if (tabsRef.current.length <= 1) {
      setTabs([createEmptyDocument()]);
      setActiveTabIndex(0);
      onOutlineReset();
      onShowStartPageChange(true);
      return;
    }

    setTabs(prev => prev.filter((_, i) => i !== index));
    if (index <= activeTabIndexRef.current) {
      setActiveTabIndex(Math.max(0, index > 0 ? index - 1 : 0));
    }
  }, [onMessage, onOutlineReset, onShowStartPageChange]);

  const confirmDirtyRange = (indices: number[]) => {
    const dirty = indices.filter(i => {
      const tab = tabsRef.current[i];
      return tab?.isDirty && !tab?.locked;
    });
    if (dirty.length === 0) return true;
    return window.confirm(t('confirm.unsavedTabs', { count: dirty.length }));
  };

  const handleCloseAll = useCallback(() => {
    const currentTabs = tabsRef.current;
    const closable = currentTabs.filter(t => !t.locked);
    if (closable.length === 0) return;
    if (!confirmDirtyRange(closable.map(t => currentTabs.indexOf(t)))) return;
    for (const t of closable) {
      if (t.path) void UnwatchFile(t.path);
    }
    const activeId = currentTabs[activeTabIndexRef.current]?.id;
    const lockedTabs = currentTabs.filter(t => t.locked);
    const newActiveIndex = lockedTabs.length > 0
      ? Math.max(0, lockedTabs.findIndex(t => t.id === activeId))
      : 0;
    setTabs(prev => {
      const remaining = prev.filter(t => t.locked);
      return remaining.length > 0 ? remaining : [createEmptyDocument()];
    });
    setActiveTabIndex(newActiveIndex);
    onOutlineReset();
    onShowStartPageChange(lockedTabs.length === 0);
  }, [onOutlineReset, onShowStartPageChange]);

  const handleCloseRight = useCallback((index: number) => {
    const currentTabs = tabsRef.current;
    const closable = currentTabs.filter((t, i) => i > index && !t.locked);
    if (closable.length === 0) return;
    if (!confirmDirtyRange(closable.map(t => currentTabs.indexOf(t)))) return;
    for (const t of closable) {
      if (t.path) void UnwatchFile(t.path);
    }
    setTabs(prev => prev.filter((t, i) => i <= index || t.locked));
    if (activeTabIndexRef.current > index && !currentTabs[activeTabIndexRef.current]?.locked) {
      setActiveTabIndex(index);
    }
  }, []);

  const handleCloseLeft = useCallback((index: number) => {
    const currentTabs = tabsRef.current;
    const closable = currentTabs.filter((t, i) => i < index && !t.locked);
    if (closable.length === 0) return;
    if (!confirmDirtyRange(closable.map(t => currentTabs.indexOf(t)))) return;
    for (const t of closable) {
      if (t.path) void UnwatchFile(t.path);
    }
    setTabs(prev => prev.filter((t, i) => i >= index || t.locked));
    if (activeTabIndexRef.current < index && !currentTabs[activeTabIndexRef.current]?.locked) {
      setActiveTabIndex(0);
    } else if (activeTabIndexRef.current >= index) {
      setActiveTabIndex(activeTabIndexRef.current - closable.length);
    }
  }, []);

  const handleToggleLock = useCallback((index: number) => {
    const tab = tabsRef.current[index];
    if (!tab) return;
    updateTabById(tab.id, t => ({ ...t, locked: !t.locked }));
    onMessage(tab.locked ? t('message.unlocked', { name: tab.name }) : t('message.locked', { name: tab.name }));
  }, [updateTabById, onMessage]);

  const handleReorder = useCallback((fromIndex: number, toIndex: number) => {
    setTabs(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    if (fromIndex === activeTabIndexRef.current) {
      setActiveTabIndex(toIndex);
    } else if (fromIndex < activeTabIndexRef.current && toIndex >= activeTabIndexRef.current) {
      setActiveTabIndex(activeTabIndexRef.current - 1);
    } else if (fromIndex > activeTabIndexRef.current && toIndex <= activeTabIndexRef.current) {
      setActiveTabIndex(activeTabIndexRef.current + 1);
    }
  }, []);

  return {
    tabs,
    setTabs,
    tabsRef,
    activeTabIndex,
    setActiveTabIndex,
    activeTabIndexRef,
    activeTab,
    fileNavHistory,
    fileNavIndex,
    pushFileNav,
    goBack,
    goForward,
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
  };
}
