import { FilePlus, FolderOpen, RotateCcw, Search, FileText } from 'lucide-react';
import type { RecentDocument } from '../types/app';

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
          <p>{workspaceName ? `Workspace: ${workspaceName}` : 'Markdown workspace'}</p>
        </div>
        <div className="start-actions">
          <button type="button" className="start-action primary" onClick={onNew}>
            <FilePlus size={18} />
            <span>New document</span>
          </button>
          <button type="button" className="start-action" onClick={onOpenFile}>
            <FileText size={18} />
            <span>Open file</span>
          </button>
          <button type="button" className="start-action" onClick={onOpenFolder}>
            <FolderOpen size={18} />
            <span>Open folder</span>
          </button>
          <button type="button" className="start-action" onClick={onSearchWorkspace} disabled={!workspaceName}>
            <Search size={18} />
            <span>Search workspace</span>
          </button>
          <button type="button" className="start-action" onClick={onRestoreSession} disabled={!canRestoreSession}>
            <RotateCcw size={18} />
            <span>Restore session</span>
          </button>
        </div>
      </section>
      <section className="start-recent">
        <div className="start-section-title">Recent</div>
        {recentDocuments.length === 0 ? (
          <div className="start-empty">No recent files or folders</div>
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
                <span className="start-recent-kind">{item.type === 'folder' ? 'Folder' : 'File'}</span>
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
