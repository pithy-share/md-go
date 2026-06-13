import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, X, RotateCcw } from 'lucide-react';
import { LoadHotkeys, ResetHotkeys, SaveHotkeys } from '../../wailsjs/go/main/App';
import type { HotkeyBinding } from '../types/app';
import { t, type I18nKey } from '../i18n';

interface HotkeySettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (bindings: HotkeyBinding[]) => void;
}

const hotkeyLabelKeys: Record<string, I18nKey> = {
  save: 'command.save.label',
  open: 'command.open.label',
  new: 'command.new.label',
  export: 'command.exportHtml.label',
  'export-html': 'command.exportHtml.label',
  'export-pdf': 'command.exportPdf.label',
  'save-as': 'command.saveAs.label',
  'open-folder': 'command.openFolder.label',
  'close-tab': 'command.closeTab.label',
  'next-tab': 'command.nextTab.label',
  'prev-tab': 'command.prevTab.label',
  bold: 'command.bold.label',
  italic: 'command.italic.label',
  heading1: 'command.heading1.label',
  heading2: 'command.heading2.label',
  heading3: 'command.heading3.label',
  link: 'command.link.label',
  'inline-code': 'command.inlineCode.label',
  find: 'command.find.label',
  'workspace-search': 'command.workspaceSearch.label',
  'toggle-sidebar': 'command.toggleSidebar.label',
  'toggle-outline': 'command.toggleOutline.label',
  'toggle-editor-mode': 'command.toggleEditorMode.label',
  'toggle-theme': 'command.toggleTheme.label',
};

export function HotkeySettings({ isOpen, onClose, onSaved }: HotkeySettingsProps) {
  const [bindings, setBindings] = useState<HotkeyBinding[]>([]);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const recordRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setDirty(false);
    setRecordingId(null);
    LoadHotkeys()
      .then((loaded) => setBindings(loaded ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOpen]);

  // Global keydown listener for recording mode
  useEffect(() => {
    if (recordingId === null) return;
    const handler = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        setRecordingId(null);
        return;
      }
      // Ignore modifier-only presses
      if (event.key === 'Control' || event.key === 'Alt' || event.key === 'Shift' || event.key === 'Meta') return;

      setBindings((prev) =>
        prev.map((b) =>
          b.id === recordingId
            ? {
                ...b,
                key: event.key.toLowerCase(),
                ctrl: event.ctrlKey || event.metaKey,
                alt: event.altKey,
                shift: event.shiftKey,
                meta: event.metaKey,
              }
            : b,
        ),
      );
      setDirty(true);
      setRecordingId(null);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [recordingId]);

  // Focus the recording button when entering record mode
  useEffect(() => {
    if (recordingId && recordRef.current) {
      recordRef.current.focus();
    }
  }, [recordingId]);

  const handleSave = useCallback(async () => {
    try {
      const saved = await SaveHotkeys(bindings);
      setBindings(saved ?? []);
      setDirty(false);
      onSaved(saved ?? []);
    } catch (error) {
      console.error(error);
    }
  }, [bindings, onSaved]);

  const handleReset = useCallback(async () => {
    try {
      const defaults = await ResetHotkeys();
      setBindings(defaults ?? []);
      setDirty(true);
    } catch (error) {
      console.error(error);
    }
  }, []);

  const categories = useMemo(() => {
    const map = new Map<string, HotkeyBinding[]>();
    const order: string[] = [];
    for (const b of bindings) {
      const cat = b.category || 'other';
      if (!map.has(cat)) {
        map.set(cat, []);
        order.push(cat);
      }
      map.get(cat)!.push(b);
    }
    return order.map((cat) => [cat, map.get(cat)!] as [string, HotkeyBinding[]]);
  }, [bindings]);

  const categoryLabel = (cat: string) => {
    const labels: Record<string, string> = {
      file: t('category.file'),
      edit: t('category.edit'),
      format: t('category.format'),
      view: t('category.view'),
      tab: t('category.tab'),
      other: t('category.other'),
    };
    return labels[cat] || cat;
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="hotkey-settings" onClick={(e) => e.stopPropagation()}>
        <div className="hotkey-settings-header">
          <Keyboard size={18} />
          <span>{t('hotkeys.title')}</span>
          <button className="hotkey-close-btn" title={t('hotkeys.close')} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="hotkey-settings-body">
          {loading ? (
            <div className="empty-state">{t('hotkeys.loading')}</div>
          ) : categories.length === 0 ? (
            <div className="empty-state">{t('hotkeys.empty')}</div>
          ) : (
            categories.map(([cat, items]) => (
              <div key={cat} className="hotkey-category">
                <div className="hotkey-category-title">{categoryLabel(cat)}</div>
                {items.map((binding) => (
                  <div key={binding.id} className="hotkey-row">
                    <span className="hotkey-label">{hotkeyLabel(binding)}</span>
                    <button
                      ref={recordingId === binding.id ? recordRef : undefined}
                      className={`hotkey-combo ${recordingId === binding.id ? 'recording' : ''}`}
                      onClick={() => setRecordingId(recordingId === binding.id ? null : binding.id)}
                      disabled={!binding.enabled}
                    >
                      {recordingId === binding.id ? (
                        <span className="hotkey-recording-hint">{t('hotkeys.pressShortcut')}</span>
                      ) : binding.enabled ? (
                        formatKeyCombo(binding)
                      ) : (
                        <span className="hotkey-disabled">—</span>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="hotkey-settings-footer">
          <button className="hotkey-btn hotkey-btn-danger" onClick={handleReset}>
            <RotateCcw size={14} />
            {t('hotkeys.resetAll')}
          </button>
          <div className="hotkey-footer-spacer" />
          <button className="hotkey-btn" onClick={onClose}>
            {t('hotkeys.cancel')}
          </button>
          <button className="hotkey-btn hotkey-btn-primary" onClick={handleSave} disabled={!dirty || loading}>
            {t('hotkeys.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function hotkeyLabel(binding: HotkeyBinding): string {
  const key = hotkeyLabelKeys[binding.id] || hotkeyLabelKeys[binding.action];
  return key ? t(key) : binding.label;
}

function formatKeyCombo(binding: HotkeyBinding): string {
  const parts: string[] = [];
  if (binding.ctrl) parts.push('Ctrl');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');
  if (binding.meta) parts.push('⌘');
  parts.push(binding.key.toUpperCase());
  return parts.join('+');
}
