import { Search, X } from 'lucide-react';
import type { WorkspaceSearchResult } from '../types/app';
import { t } from '../i18n';

interface WorkspaceSearchProps {
  open: boolean;
  query: string;
  results: WorkspaceSearchResult[];
  loading: boolean;
  workspaceName: string;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onOpenResult: (result: WorkspaceSearchResult) => void;
}

export function WorkspaceSearch({
  open,
  query,
  results,
  loading,
  workspaceName,
  onQueryChange,
  onClose,
  onOpenResult,
}: WorkspaceSearchProps) {
  if (!open) return null;

  return (
    <div className="workspace-search-backdrop" onMouseDown={onClose}>
      <section className="workspace-search-panel" onMouseDown={(event) => event.stopPropagation()}>
        <header className="workspace-search-header">
          <Search size={18} />
          <input
            autoFocus
            className="workspace-search-input"
            value={query}
            placeholder={workspaceName ? t('search.placeholder', { name: workspaceName }) : t('search.placeholderNoWorkspace')}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose();
            }}
            disabled={!workspaceName}
          />
          <button type="button" className="workspace-search-close" onClick={onClose} aria-label={t('search.close')}>
            <X size={17} />
          </button>
        </header>
        <div className="workspace-search-meta">
          {loading ? t('search.loading') : query.trim() ? t('search.resultCount', { count: results.length }) : t('search.typeToSearch')}
        </div>
        <div className="workspace-search-results">
          {!workspaceName ? (
            <div className="workspace-search-empty">{t('search.openFolderFirst')}</div>
          ) : query.trim() && !loading && results.length === 0 ? (
            <div className="workspace-search-empty">{t('search.noMatches')}</div>
          ) : (
            results.map((result) => (
              <button
                type="button"
                key={`${result.path}-${result.line}-${result.column}`}
                className="workspace-search-result"
                onClick={() => onOpenResult(result)}
              >
                <span className="workspace-search-result-path">{result.relativePath}</span>
                <span className="workspace-search-result-line">{t('search.line', { line: result.line })}</span>
                <span className="workspace-search-result-snippet">{result.snippet}</span>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
