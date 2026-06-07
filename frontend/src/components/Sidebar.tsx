import { Clock3, FileText, ListTree } from 'lucide-react';
import type { OutlineItem, RecentDocument } from '../types/app';

interface SidebarProps {
  currentPath: string;
  recentDocuments: RecentDocument[];
  outline: OutlineItem[];
  onOpenRecent: (path: string) => void;
  onJumpToHeading: (pos: number) => void;
}

export function Sidebar({ currentPath, recentDocuments, outline, onOpenRecent, onJumpToHeading }: SidebarProps) {
  return (
    <aside className="sidebar">
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