import { Clock3, FileText, Folder, ListTree } from 'lucide-react';
import type { OutlineItem, RecentDocument, Workspace } from '../types/app';

interface SidebarProps {
  currentPath: string;
  workspace: Workspace | null;
  recentDocuments: RecentDocument[];
  outline: OutlineItem[];
  onOpenWorkspaceFile: (path: string) => void;
  onOpenRecent: (path: string) => void;
  onJumpToHeading: (pos: number) => void;
}

export function Sidebar({
  currentPath,
  workspace,
  recentDocuments,
  outline,
  onOpenWorkspaceFile,
  onOpenRecent,
  onJumpToHeading,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <section className="sidebar-section workspace-section">
        <div className="sidebar-heading">
          <Folder size={15} />
          <span>{workspace?.name || 'Workspace'}</span>
        </div>
        <div className="sidebar-list">
          {!workspace ? (
            <div className="empty-state">No folder open</div>
          ) : workspace.files.length === 0 ? (
            <div className="empty-state">No Markdown files</div>
          ) : (
            workspace.files.map((item) => (
              <button
                key={item.path}
                className={`sidebar-item workspace-file ${item.path === currentPath ? 'active' : ''}`}
                style={{ paddingLeft: `${8 + Math.min(item.depth, 6) * 12}px` }}
                title={item.path}
                onClick={() => onOpenWorkspaceFile(item.path)}
              >
                <FileText size={15} />
                <span>{item.relativePath}</span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="sidebar-section">
        <div className="sidebar-heading">
          <Clock3 size={15} />
          <span>Recent</span>
        </div>
        <div className="sidebar-list">
          {recentDocuments.length === 0 ? (
            <div className="empty-state">No recent files</div>
          ) : (
            recentDocuments.map((item) => (
              <button
                key={item.path}
                className={`sidebar-item ${item.path === currentPath ? 'active' : ''}`}
                title={item.path}
                onClick={() => onOpenRecent(item.path)}
              >
                <FileText size={15} />
                <span>{item.name}</span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="sidebar-section outline-section">
        <div className="sidebar-heading">
          <ListTree size={15} />
          <span>Outline</span>
        </div>
        <div className="sidebar-list">
          {outline.length === 0 ? (
            <div className="empty-state">No headings</div>
          ) : (
            outline.map((item) => (
              <button
                key={item.id}
                className="outline-item"
                style={{ paddingLeft: `${8 + (item.level - 1) * 14}px` }}
                title={item.text}
                onClick={() => onJumpToHeading(item.pos)}
              >
                {item.text}
              </button>
            ))
          )}
        </div>
      </section>
    </aside>
  );
}