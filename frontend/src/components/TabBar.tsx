import { Circle, Plus, X } from 'lucide-react';
import type { DocumentState } from '../types/app';
import { useEffect, useRef } from 'react';

interface TabBarProps {
  tabs: DocumentState[];
  activeTabIndex: number;
  onSelectTab: (index: number) => void;
  onCloseTab: (index: number) => void;
  onNewTab: () => void;
}

export function TabBar({ tabs, activeTabIndex, onSelectTab, onCloseTab, onNewTab }: TabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const tab = el.children[activeTabIndex] as HTMLElement | undefined;
    if (tab) tab.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeTabIndex]);

  const handleAuxClick = (e: React.MouseEvent, index: number) => {
    if (e.button === 1) {
      e.preventDefault();
      onCloseTab(index);
    }
  };

  return (
    <div className="tab-bar" ref={scrollRef}>
      {tabs.map((tab, i) => (
        <div
          key={tab.id}
          className={`tab-item${i === activeTabIndex ? ' active' : ''}`}
          onClick={() => onSelectTab(i)}
          onAuxClick={(e) => handleAuxClick(e, i)}
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
    </div>
  );
}
