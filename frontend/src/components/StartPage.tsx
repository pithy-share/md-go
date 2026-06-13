import { FilePlus, FolderOpen, RotateCcw, Search, FileText } from 'lucide-react';
import type { RecentDocument } from '../types/app';
import { t } from '../i18n';

interface StartPageProps {
  recentDocuments: RecentDocument[];
  workspaceName: string;
  canRestoreSession: boolean;
  onNew: () => void;
  onOpenFile: () => void;
  onOpenFolder: () => void;
  onRestoreSession: () => void;
  onOpenRecent: (item: RecentDocument) => void;
  onSearchWorkspace: () => void;
}

export function StartPage({
  recentDocuments,
  workspaceName,
  canRestoreSession,
  onNew,
  onOpenFile,
  onOpenFolder,
  onRestoreSession,
  onOpenRecent,
  onSearchWorkspace,
}: StartPageProps) {
  return (
    <div className="start-page">
      <section className="start-main">
        <div className="start-title">
          <h1>MD Go</h1>
          <p>{workspaceName ? t('start.workspace', { name: workspaceName }) : t('start.markdownWorkspace')}</p>
        </div>
        <div className="start-actions">
          <button type="button" className="start-action primary" onClick={onNew}>
            <FilePlus size={18} />
            <span>{t('start.newDocument')}</span>
          </button>
          <button type="button" className="start-action" onClick={onOpenFile}>
            <FileText size={18} />
            <span>{t('start.openFile')}</span>
          </button>
          <button type="button" className="start-action" onClick={onOpenFolder}>
            <FolderOpen size={18} />
            <span>{t('start.openFolder')}</span>
          </button>
          <button type="button" className="start-action" onClick={onSearchWorkspace} disabled={!workspaceName}>
            <Search size={18} />
            <span>{t('start.searchWorkspace')}</span>
          </button>
          <button type="button" className="start-action" onClick={onRestoreSession} disabled={!canRestoreSession}>
            <RotateCcw size={18} />
            <span>{t('start.restoreSession')}</span>
          </button>
        </div>
      </section>
      <section className="start-recent">
        <div className="start-section-title">{t('start.recent')}</div>
        {recentDocuments.length === 0 ? (
          <div className="start-empty">{t('start.noRecent')}</div>
        ) : (
          <div className="start-recent-list">
            {recentDocuments.map((item) => (
              <button
                type="button"
                key={`${item.type}-${item.path}`}
                className="start-recent-item"
                onClick={() => onOpenRecent(item)}
                title={item.path}
              >
                <span className="start-recent-kind">{item.type === 'folder' ? t('start.kindFolder') : t('start.kindFile')}</span>
                <span className="start-recent-name">{item.name}</span>
                <span className="start-recent-path">{item.path}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
