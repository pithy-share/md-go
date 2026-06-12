import { Circle, Plus, X } from 'lucide-react';
import type { DocumentState } from '../types/app';
import { useEffect, useRef, useState, useCallback } from 'react';

interface TabBarProps {
  tabs: DocumentState[];
  activeTabIndex: number;
  onSelectTab: (index: number) => void;
  onCloseTab: (index: number) => void;
  onNewTab: () => void;
  onCloseAll: () => void;
  onCloseRight: (index: number) => void;
  onCloseLeft: (index: number) => void;
}

interface ContextMenuState {
  index: number;
  x: number;
  y: number;
}

export function TabBar({ tabs, activeTabIndex, onSelectTab, onCloseTab, onNewTab, onCloseAll, onCloseRight, onCloseLeft }: TabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

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
      onCloseTab(index);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ index, x: e.clientX, y: e.clientY });
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
          className={`tab-item${i === activeTabIndex ? ' active' : ''}`}
          onClick={() => onSelectTab(i)}
          onAuxClick={(e) => handleAuxClick(e, i)}
          onContextMenu={(e) => handleContextMenu(e, i)}
          title={tab.path || tab.name}
        >
          <span className="tab-name">{tab.name}</span>
          {tab.isDirty && <Circle size={8} className="tab-dirty-dot" fill="currentColor" />}
          {tabs.length > 1 && (
            <button
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(i);
              }}
              title="Close tab"
            >
              <X size={12} />
            </button>
          )}
        </div>
      ))}
      <button className="tab-new-btn" onClick={onNewTab} title="New tab">
        <Plus size={14} />
      </button>

      {contextMenu && (
        <div
          className="tab-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="tab-context-menu-item"
            onClick={() => executeMenuAction(() => onCloseTab(contextMenu.index))}
          >
            关闭
          </button>
          <button
            className="tab-context-menu-item"
            onClick={() => executeMenuAction(onCloseAll)}
          >
            关闭所有
          </button>
          <button
            className="tab-context-menu-item"
            disabled={contextMenu.index >= tabs.length - 1}
            onClick={() => executeMenuAction(() => onCloseRight(contextMenu.index))}
          >
            关闭右侧
          </button>
          <button
            className="tab-context-menu-item"
            disabled={contextMenu.index === 0}
            onClick={() => executeMenuAction(() => onCloseLeft(contextMenu.index))}
          >
            关闭左侧
          </button>
        </div>
      )}
    </div>
  );
}
