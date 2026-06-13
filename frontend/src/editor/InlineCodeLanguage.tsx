import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ALL_LANGUAGES, languageLabel, type LanguageOption } from './languages';

interface InlineCodeLanguageProps {
  target: HTMLElement;
  currentLanguage: string;
  onSelect: (language: string) => void;
  onClose: () => void;
}

export function InlineCodeLanguage({ target, currentLanguage, onSelect, onClose }: InlineCodeLanguageProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    if (!query.trim()) return ALL_LANGUAGES;
    const lower = query.toLowerCase();
    return ALL_LANGUAGES.filter(
      (lang) =>
        lang.value.toLowerCase().includes(lower) ||
        lang.label.toLowerCase().includes(lower),
    );
  }, [query]);

  // Clamp activeIndex when filtered list changes
  const safeIndex = Math.min(activeIndex, Math.max(0, filtered.length - 1));

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const lang = filtered[safeIndex];
        if (lang) onSelect(lang.value);
        return;
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, filtered, safeIndex, onSelect]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !target.contains(event.target)) {
        // Check if click is inside our portal
        const portal = document.querySelector('.inline-code-language-portal');
        if (portal && !portal.contains(event.target as Node)) {
          onClose();
        }
      }
    };

    // Delay to avoid the click that opened us from closing us
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose, target]);

  // Scroll active item into view
  useEffect(() => {
    const item = listRef.current?.children[safeIndex] as HTMLElement | undefined;
    item?.scrollIntoView?.({ block: 'nearest' });
  }, [safeIndex]);

  const rect = target.getBoundingClientRect();
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.max(8, rect.left),
    top: rect.bottom + 4,
    zIndex: 1000,
  };

  return createPortal(
    <div className="inline-code-language-portal" style={style}>
      <div className="inline-code-language-popover">
        <input
          ref={inputRef}
          className="inline-code-language-input"
          type="text"
          placeholder={languageLabel(currentLanguage || 'plaintext')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
        />
        <ul ref={listRef} className="inline-code-language-list">
          {filtered.map((lang, index) => (
            <li
              key={lang.value}
              className={`inline-code-language-item ${
                index === safeIndex ? 'active' : ''
              } ${lang.value === currentLanguage ? 'current' : ''}`}
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(lang.value);
              }}
            >
              {lang.label}
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="inline-code-language-item empty">No match</li>
          )}
        </ul>
      </div>
    </div>,
    document.body,
  );
}