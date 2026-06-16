import { X, Info } from 'lucide-react';
import { t, type Locale } from '../i18n';

interface AboutPanelProps {
  isOpen: boolean;
  onClose: () => void;
  version: string;
  locale: Locale;
}

export function AboutPanel({ isOpen, onClose, version }: AboutPanelProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="about-panel" onClick={(e) => e.stopPropagation()}>
        <div className="about-panel-header">
          <Info size={18} />
          <span>{t('about.title')}</span>
          <button className="about-close-btn" title={t('hotkeys.close')} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="about-panel-body">
          <div className="about-logo">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="48" height="48" rx="10" fill="var(--accent)" />
              <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="20" fontWeight="700" fontFamily="system-ui, sans-serif">MD</text>
            </svg>
          </div>
          <h2 className="about-app-name">MD Go</h2>
          <p className="about-version-line">{t('about.version')} <strong>{version}</strong></p>
          <p className="about-description">{t('about.description')}</p>
        </div>
      </div>
    </div>
  );
}