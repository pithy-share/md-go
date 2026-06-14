import { Circle, Lock, Plus, X } from 'lucide-react';
import type { DocumentState } from '../types/app';
import { useEffect, useRef, useState, useCallback } from 'react';
import { t } from '../i18n';

interface TabBarProps {
  tabs: DocumentState[];
  activeTabIndex: number;
  onSelectTab: (index: number) => void;
  onCloseTab: (index: number) => void;
  onNewTab: () => void;
  onCloseAll: () => void;
  onCloseRight: (index: number) => void;
  onCloseLeft: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onToggleLock: (index: number) => void;
}

interface ContextMenuState {
  index: number;
  x: number;
  y: number;
}

export function TabBar({ tabs, activeTabIndex, onSelectTab, onCloseTab, onNewTab, onCloseAll, onCloseRight, onCloseLeft, onReorder, onToggleLock }: TabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const tab = el.children[activeTabIndex] as HTMLElement | undefined;
    if (tab) tab.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeTabIndex]);

  // Close context menu on outside click / Escape
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.tab-context-menu')) close();
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', onClick, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', onClick, { capture: true });
    };
  }, [contextMenu]);

  const handleAuxClick = (e: React.MouseEvent, index: number) => {
    if (e.button === 1) {
      e.preventDefault();
      if (tabs[index]?.locked) return;
      onCloseTab(index);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ index, x: e.clientX, y: e.clientY });
  };

  // ── Drag & drop reordering ──

  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragIndexRef.current = index;
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    const el = e.target as HTMLElement;
    requestAnimationFrame(() => el.classList.add('tab-dragging'));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from === null || from === index) return;
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from === null || from === toIndex) return;
    onReorder(from, toIndex);
  };

  const handleDragEnd = () => {
    dragIndexRef.current = null;
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const executeMenuAction = useCallback((action: () => void) => {
    setContextMenu(null);
    action();
  }, []);

  return (
    <div className="tab-bar" ref={scrollRef}>
      {tabs.map((tab, i) => (
        <div
          key={tab.id}
          draggable
          className={`tab-item${i === activeTabIndex ? ' active' : ''}${dragOverIndex === i ? ' drag-over' : ''}${dragIndex === i ? ' dragging' : ''}`}
          onClick={() => onSelectTab(i)}
          onAuxClick={(e) => handleAuxClick(e, i)}
          onContextMenu={(e) => handleContextMenu(e, i)}
          onDragStart={(e) => handleDragStart(e, i)}
          onDragOver={(e) => handleDragOver(e, i)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, i)}
          onDragEnd={handleDragEnd}
          title={tab.path || tab.name}
        >
          <span className="tab-name">{tab.name}</span>
          {tab.isDirty && <Circle size={8} className="tab-dirty-dot" fill="currentColor" />}
          {tab.locked ? (
            <button
              className="tab-lock-btn"
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock(i);
              }}
              title={t('tab.lockedClickToUnlock')}
            >
              <Lock size={10} />
            </button>
          ) : (
            tabs.length > 1 && (
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(i);
                }}
                title={t('tab.closeTab')}
              >
                <X size={12} />
              </button>
            )
          )}
        </div>
      ))}
      <button className="tab-new-btn" onClick={onNewTab} title={t('tab.newTab')}>
        <Plus size={14} />
      </button>

      {contextMenu && (
        <div
          className="tab-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="tab-context-menu-item"
            disabled={tabs[contextMenu.index]?.locked}
            onClick={() => executeMenuAction(() => onCloseTab(contextMenu.index))}
          >
            {t('tab.close')}
          </button>
          <button
            className="tab-context-menu-item"
            onClick={() => executeMenuAction(() => onToggleLock(contextMenu.index))}
          >
            {tabs[contextMenu.index]?.locked ? t('tab.unlock') : t('tab.lock')}
          </button>
          <button
            className="tab-context-menu-item"
            onClick={() => executeMenuAction(onCloseAll)}
          >
            {t('tab.closeAll')}
          </button>
          <button
            className="tab-context-menu-item"
            disabled={contextMenu.index >= tabs.length - 1}
            onClick={() => executeMenuAction(() => onCloseRight(contextMenu.index))}
          >
            {t('tab.closeRight')}
          </button>
          <button
            className="tab-context-menu-item"
            disabled={contextMenu.index === 0}
            onClick={() => executeMenuAction(() => onCloseLeft(contextMenu.index))}
          >
            {t('tab.closeLeft')}
          </button>
        </div>
      )}
    </div>
  );
}
