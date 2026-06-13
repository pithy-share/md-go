import { Circle, CircleCheck, FilePenLine } from 'lucide-react';
import type { DocumentStats } from '../types/app';
import { t } from '../i18n';

interface StatusBarProps {
  path: string;
  isDirty: boolean;
  lastSavedAt: string;
  stats: DocumentStats;
}

export function StatusBar({ path, isDirty, lastSavedAt, stats }: StatusBarProps) {
  const title = path || t('document.untitled');
  const savedLabel = isDirty
    ? t('status.unsaved')
    : lastSavedAt
      ? t('status.savedAt', { time: formatTime(lastSavedAt) })
      : t('status.saved');

  return (
    <footer className="statusbar">
      <div className="statusbar-section path-section" title={title}>
        <FilePenLine size={14} />
        <span>{title}</span>
      </div>
      <div className="statusbar-section">
        <span>{t('status.words', { count: stats.words })}</span>
        <span>{t('status.characters', { count: stats.characters })}</span>
        <span>{t('status.lines', { count: stats.lines })}</span>
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
