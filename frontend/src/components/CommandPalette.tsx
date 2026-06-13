import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { CommandItem } from '../types/app';
import { t } from '../i18n';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
}

interface CategoryGroup {
  name: string;
  items: CommandItem[];
}

const categoryDisplayNames: Record<CommandItem['category'], string> = {
  file: t('category.file'),
  edit: t('category.edit'),
  view: t('category.view'),
  tab: t('category.tab'),
  format: t('category.format'),
};

const categoryOrder: CommandItem['category'][] = ['file', 'edit', 'format', 'view', 'tab'];

export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      // Auto-focus input
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Filter & group commands
  const filteredGroups = useMemo(() => {
    const lowerQuery = query.toLowerCase().trim();
    const grouped: CategoryGroup[] = [];

    for (const cat of categoryOrder) {
      const catItems = commands.filter((cmd) => {
        if (cmd.category !== cat) return false;
        if (!lowerQuery) return true;
        return (
          cmd.label.toLowerCase().includes(lowerQuery) ||
          cmd.description.toLowerCase().includes(lowerQuery)
        );
      });
      if (catItems.length > 0) {
        grouped.push({ name: categoryDisplayNames[cat], items: catItems });
      }
    }
    return grouped;
  }, [commands, query]);

  // Flat list for keyboard navigation
  const flatItems = useMemo(() => {
    const result: CommandItem[] = [];
    for (const group of filteredGroups) {
      result.push(...group.items);
    }
    return result;
  }, [filteredGroups]);

  // Clamp selectedIndex when flatItems changes
  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, flatItems.length - 1)));
  }, [flatItems.length]);

  const executeCommand = (cmd: CommandItem) => {
    cmd.action();
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, flatItems.length));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + Math.max(1, flatItems.length)) % Math.max(1, flatItems.length));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatItems[selectedIndex]) {
          executeCommand(flatItems[selectedIndex]);
        }
        break;
    }
  };

  if (!isOpen) return null;

  // Compute per-item global index
  let globalIdx = -1;
  const groupIndexMaps: number[][] = [];
  for (const group of filteredGroups) {
    const indices: number[] = [];
    for (let i = 0; i < group.items.length; i++) {
      globalIdx++;
      indices.push(globalIdx);
    }
    groupIndexMaps.push(indices);
  }

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <div className="command-palette-header">
          <Search size={18} />
          <input
            ref={inputRef}
            className="command-palette-input"
            placeholder={t('command.placeholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="command-palette-list">
          {filteredGroups.length === 0 ? (
            <div className="empty-state">{t('command.empty')}</div>
          ) : (
            filteredGroups.map((group, gi) => (
              <div key={group.name}>
                <div className="command-palette-category">{group.name}</div>
                {group.items.map((cmd, ii) => {
                  const giIdx = groupIndexMaps[gi]?.[ii] ?? 0;
                  return (
                    <div
                      key={cmd.id}
                      className={`command-palette-item ${giIdx === selectedIndex ? 'selected' : ''}`}
                      onClick={() => executeCommand(cmd)}
                      onMouseEnter={() => setSelectedIndex(giIdx)}
                    >
                      <span>{cmd.label}</span>
                      {cmd.hotkeyLabel && <kbd>{cmd.hotkeyLabel}</kbd>}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
