import { useCallback, useEffect, useRef } from 'react';
import { ArrowUp, ArrowDown, Replace, ReplaceAll, X } from 'lucide-react';

interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  replaceText: string;
  onReplaceTextChange: (text: string) => void;
  matchIndex: number;
  totalMatches: number;
  showReplace: boolean;
  onPrev: () => void;
  onNext: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
  onToggleReplace: () => void;
}

export function SearchBar({
  query,
  onQueryChange,
  replaceText,
  onReplaceTextChange,
  matchIndex,
  totalMatches,
  showReplace,
  onPrev,
  onNext,
  onReplace,
  onReplaceAll,
  onClose,
  onToggleReplace,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the find input when search opens
  useEffect(() => {
    if (query === '' && inputRef.current) {
      inputRef.current.focus();
    }
  }, []); // only on mount

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) {
          onPrev();
        } else {
          onNext();
        }
        return;
      }
    },
    [onClose, onNext, onPrev],
  );

  return (
    <div className="search-bar" onKeyDown={handleKeyDown}>
      <div className="search-bar-row">
        <div className="search-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder="Find..."
            value={query}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            spellCheck={false}
          />
          {totalMatches > 0 && (
            <span className="search-match-count">
              {matchIndex + 1}/{totalMatches}
            </span>
          )}
          {totalMatches === 0 && query !== '' && (
            <span className="search-match-count search-no-matches">No results</span>
          )}
        </div>
        <div className="search-nav-buttons">
          <button className="search-nav-btn" title="Previous match (Shift+Enter)" onClick={onPrev} disabled={totalMatches === 0}>
            <ArrowUp size={14} />
          </button>
          <button className="search-nav-btn" title="Next match (Enter)" onClick={onNext} disabled={totalMatches === 0}>
            <ArrowDown size={14} />
          </button>
        </div>
        <button
          className={`search-toggle-replace ${showReplace ? 'active' : ''}`}
          title="Toggle replace"
          onClick={onToggleReplace}
        >
          <ReplaceAll size={14} />
        </button>
        <button className="search-close-btn" title="Close (Esc)" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      {showReplace && (
        <div className="search-bar-row">
          <div className="search-input-wrapper">
            <input
              type="text"
              className="search-input search-replace-input"
              placeholder="Replace..."
              value={replaceText}
              onChange={(event) => onReplaceTextChange(event.currentTarget.value)}
              spellCheck={false}
            />
          </div>
          <div className="search-nav-buttons">
            <button className="search-nav-btn" title="Replace" onClick={onReplace} disabled={totalMatches === 0}>
              <Replace size={14} />
            </button>
            <button className="search-nav-btn" title="Replace All" onClick={onReplaceAll} disabled={totalMatches === 0}>
              <ReplaceAll size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}