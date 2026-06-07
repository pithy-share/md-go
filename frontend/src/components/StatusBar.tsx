import { Circle, CircleCheck, FilePenLine } from 'lucide-react';
import type { DocumentStats } from '../types/app';

interface StatusBarProps {
  path: string;
  isDirty: boolean;
  lastSavedAt: string;
  stats: DocumentStats;
}

export function StatusBar({ path, isDirty, lastSavedAt, stats }: StatusBarProps) {
  const savedLabel = isDirty ? 'Unsaved' : lastSavedAt ? `Saved ${formatTime(lastSavedAt)}` : 'Saved';

  return (
    <footer className="statusbar">
      <div className="statusbar-section path-section" title={path || 'Untitled.md'}>
        <FilePenLine size={14} />
        <span>{path || 'Untitled.md'}</span>
      </div>
      <div className="statusbar-section">
        <span>{stats.words} words</span>
        <span>{stats.characters} chars</span>
        <span>{stats.lines} lines</span>
      </div>
      <div className="statusbar-section save-section">
        {isDirty ? <Circle size={10} className="dirty-dot" /> : <CircleCheck size={14} className="saved-dot" />}
        <span>{savedLabel}</span>
      </div>
    </footer>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}