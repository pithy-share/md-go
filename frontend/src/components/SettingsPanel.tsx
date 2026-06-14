import { Settings as SettingsIcon, X, Sun, Moon, Monitor } from 'lucide-react';
import type { AppConfig, EditorMode, ThemePreference } from '../types/app';
import { t, type Locale } from '../i18n';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
  locale: Locale;
  onConfigChange: (updates: Partial<AppConfig>) => void;
  onLocaleChange: (locale: Locale) => void;
}

export function SettingsPanel({ isOpen, onClose, config, locale, onConfigChange, onLocaleChange }: SettingsPanelProps) {
  if (!isOpen) return null;

  const themeOptions = [
    { value: 'system' as const, labelKey: 'settings.themeSystem' as const, Icon: Monitor },
    { value: 'light' as const, labelKey: 'settings.themeLight' as const, Icon: Sun },
    { value: 'dark' as const, labelKey: 'settings.themeDark' as const, Icon: Moon },
  ];

  const modeOptions = [
    { value: 'rendered' as const, labelKey: 'settings.modeRendered' as const },
    { value: 'source' as const, labelKey: 'settings.modeSource' as const },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-panel-header">
          <SettingsIcon size={18} />
          <span>{t('settings.title')}</span>
          <button className="settings-close-btn" title={t('hotkeys.close')} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="settings-panel-body">
          <section className="settings-section">
            <div className="settings-section-title">{t('settings.appearance')}</div>
            <div className="settings-row">
              <span className="settings-label">{t('settings.theme')}</span>
              <div className="segmented">
                {themeOptions.map(({ value, labelKey, Icon }) => (
                  <button key={value} className={`segmented-btn ${config.theme === value ? 'active' : ''}`} onClick={() => onConfigChange({ theme: value })}>
                    <Icon size={14} />
                    {t(labelKey)}
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-row">
              <span className="settings-label">{t('settings.language')}</span>
              <div className="segmented">
                <button className={`segmented-btn ${locale === 'zh' ? 'active' : ''}`} onClick={() => onLocaleChange('zh')}>
                  {t('language.zh')}
                </button>
                <button className={`segmented-btn ${locale === 'en' ? 'active' : ''}`} onClick={() => onLocaleChange('en')}>
                  {t('language.en')}
                </button>
              </div>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-title">{t('settings.editor')}</div>
            <div className="settings-row">
              <span className="settings-label">{t('settings.fontSize')}</span>
              <div className="settings-control">
                <input
                  type="range"
                  min={12}
                  max={28}
                  step={1}
                  value={config.editorFontSize}
                  onChange={(e) => onConfigChange({ editorFontSize: Number(e.currentTarget.value) })}
                />
                <span className="settings-value">{config.editorFontSize}px</span>
              </div>
            </div>
            <div className="settings-row">
              <span className="settings-label">{t('settings.editorMode')}</span>
              <div className="segmented">
                {modeOptions.map(({ value, labelKey }) => (
                  <button key={value} className={`segmented-btn ${config.editorMode === value ? 'active' : ''}`} onClick={() => onConfigChange({ editorMode: value })}>
                    {t(labelKey)}
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-row">
              <span className="settings-label">{t('settings.showOutline')}</span>
              <label className="toggle">
                <input type="checkbox" checked={config.showOutline} onChange={(e) => onConfigChange({ showOutline: e.currentTarget.checked })} />
                <span className="toggle-track" />
              </label>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-title">{t('settings.saving')}</div>
            <div className="settings-row">
              <span className="settings-label">{t('settings.autoSave')}</span>
              <label className="toggle">
                <input type="checkbox" checked={config.autoSave} onChange={(e) => onConfigChange({ autoSave: e.currentTarget.checked })} />
                <span className="toggle-track" />
              </label>
            </div>
            <div className="settings-row">
              <span className="settings-label">{t('settings.autoSaveDelay')}</span>
              <div className="settings-control">
                <input
                  type="number"
                  min={300}
                  max={10000}
                  step={100}
                  value={config.autoSaveDelay}
                  disabled={!config.autoSave}
                  onChange={(e) => onConfigChange({ autoSaveDelay: Number(e.currentTarget.value) })}
                />
                <span className="settings-value">ms</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
