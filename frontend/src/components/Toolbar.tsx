import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  ChevronDown,
  Code,
  Code2,
  CodeXml,
  Columns3,
  Copy,
  Download,
  FilePlus2,
  FileText,
  FolderOpen,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Languages,
  Link as LinkIcon,
  Keyboard,
  List,
  ListChecks,
  ListOrdered,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Quote,
  Redo2,
  Rows3,
  Save,
  SaveAll,
  Settings,
  Strikethrough,
  Sun,
  Table2,
  Trash2,
  Undo2,
} from 'lucide-react';
import type { EditorMode, ThemePreference } from '../types/app';
import { ALL_LANGUAGES } from '../editor/languages';
import { t, type Locale } from '../i18n';

interface ToolbarProps {
  editor: Editor | null;
  theme: ThemePreference;
  sidebarVisible: boolean;
  outlineVisible: boolean;
  editorMode: EditorMode;
  autoSave: boolean;
  isDirty: boolean;
  onNew: () => void;
  onOpen: () => void;
  onOpenFolder: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExport: () => void;
  onExportPdf: () => void;
  onToggleSidebar: () => void;
  onToggleOutline: () => void;
  onToggleEditorMode: () => void;
  onToggleTheme: () => void;
  onAutoSaveChange: (enabled: boolean) => void;
  onToggleHotkeySettings: () => void;
  onOpenSettings: () => void;
  locale: Locale;
  onSwitchLocale: () => void;
}

export function Toolbar({
  editor,
  theme,
  sidebarVisible,
  outlineVisible,
  editorMode,
  autoSave,
  isDirty,
  onNew,
  onOpen,
  onOpenFolder,
  onSave,
  onSaveAs,
  onExport,
  onExportPdf,
  onToggleSidebar,
  onToggleOutline,
  onToggleEditorMode,
  onToggleTheme,
  onAutoSaveChange,
  onToggleHotkeySettings,
  onOpenSettings,
  locale,
  onSwitchLocale,
}: ToolbarProps) {
  const [openMenu, setOpenMenu] = useState<'code' | 'table' | null>(null);
  const toolbarRef = useRef<HTMLElement | null>(null);
  const disabled = !editor;
  const currentLinkHref = getCurrentLinkHref(editor);

  useEffect(() => {
    const closeMenu = (event: MouseEvent) => {
      if (!toolbarRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };

    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, []);

  const toggleMenu = (menu: 'code' | 'table') => {
    if (!editor) return;
    setOpenMenu((current) => (current === menu ? null : menu));
  };

  const runCommand = (command: (editor: Editor) => void) => {
    if (!editor) return;
    command(editor);
    setOpenMenu(null);
  };

  const setCodeBlock = (language: string) => {
    runCommand((editor) => {
      if (editor.isActive('codeBlock')) {
        editor.chain().focus().updateAttributes('codeBlock', { language }).run();
        return;
      }
      editor.chain().focus().setCodeBlock({ language }).run();
    });
  };

  const copyLink = () => {
    if (!currentLinkHref) return;
    void writeClipboardText(currentLinkHref);
  };

  const setLink = () => {
    if (!editor) return;
    editor.commands.focus();
    window.dispatchEvent(new CustomEvent('md-go:open-link-popover'));
  };

  const addImage = () => {
    if (!editor) return;
    const src = window.prompt(t('toolbar.imagePrompt'));
    if (!src) return;
    editor.chain().focus().setImage({ src: src.trim() }).run();
  };

  return (
    <header ref={toolbarRef} className="toolbar" data-tauri-drag-region>
      <div className="toolbar-group">
        <button className="icon-button" title={t('toolbar.toggleSidebar')} onClick={onToggleSidebar}>
          {sidebarVisible ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
        <button className="icon-button" title={t('toolbar.newDocument')} onClick={onNew}>
          <FilePlus2 size={18} />
        </button>
        <button className="icon-button" title={t('toolbar.openDocument')} onClick={onOpen}>
          <FileText size={18} />
        </button>
        <button className="icon-button" title={t('toolbar.openFolder')} onClick={onOpenFolder}>
          <FolderOpen size={18} />
        </button>
        <button className={`icon-button ${isDirty ? 'attention' : ''}`} title={t('toolbar.save')} onClick={onSave}>
          <Save size={18} />
        </button>
        <button className="icon-button" title={t('toolbar.saveAs')} onClick={onSaveAs}>
          <SaveAll size={18} />
        </button>
        <button className="icon-button" title={t('toolbar.exportHtml')} onClick={onExport}>
          <Download size={18} />
        </button>
        <button className="icon-button" title={t('toolbar.exportPdf')} onClick={onExportPdf}>
          <FileText size={18} />
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button className={markClass(editor, 'bold')} title={t('toolbar.bold')} disabled={disabled} onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold size={17} />
        </button>
        <button className={markClass(editor, 'italic')} title={t('toolbar.italic')} disabled={disabled} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic size={17} />
        </button>
        <button className={markClass(editor, 'strike')} title={t('toolbar.strike')} disabled={disabled} onClick={() => editor?.chain().focus().toggleStrike().run()}>
          <Strikethrough size={17} />
        </button>
        <button className={markClass(editor, 'code')} title={t('toolbar.inlineCode')} disabled={disabled} onClick={() => editor?.chain().focus().toggleCode().run()}>
          <Code size={17} />
        </button>
        <button className={markClass(editor, 'link')} title={t('toolbar.link')} disabled={disabled} onClick={setLink}>
          <LinkIcon size={17} />
        </button>
        <button className="icon-button" title={t('toolbar.copyLink')} disabled={!currentLinkHref} onClick={copyLink}>
          <Copy size={17} />
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button className={headingClass(editor, 1)} title={t('toolbar.heading1')} disabled={disabled} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 size={17} />
        </button>
        <button className={headingClass(editor, 2)} title={t('toolbar.heading2')} disabled={disabled} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 size={17} />
        </button>
        <button className={headingClass(editor, 3)} title={t('toolbar.heading3')} disabled={disabled} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 size={17} />
        </button>
        <button className={nodeClass(editor, 'bulletList')} title={t('toolbar.bulletList')} disabled={disabled} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          <List size={17} />
        </button>
        <button className={nodeClass(editor, 'orderedList')} title={t('toolbar.orderedList')} disabled={disabled} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={17} />
        </button>
        <button className={nodeClass(editor, 'taskList')} title={t('toolbar.taskList')} disabled={disabled} onClick={() => editor?.chain().focus().toggleTaskList().run()}>
          <ListChecks size={17} />
        </button>
        <button className={nodeClass(editor, 'blockquote')} title={t('toolbar.quote')} disabled={disabled} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
          <Quote size={17} />
        </button>
        <div className="toolbar-menu">
          <button className={nodeClass(editor, 'codeBlock', 'menu-trigger')} title={t('toolbar.codeBlock')} disabled={disabled} onClick={() => toggleMenu('code')}>
            <CodeXml size={17} />
            <ChevronDown size={12} />
          </button>
          {openMenu === 'code' && (
            <div className="toolbar-menu-panel code-menu" role="menu">
              {ALL_LANGUAGES.map((language) => (
                <button
                  key={language.value}
                  className={`toolbar-menu-item ${editor?.isActive('codeBlock', { language: language.value }) ? 'active' : ''}`}
                  onClick={() => setCodeBlock(language.value)}
                  role="menuitem"
                  type="button"
                >
                  <span>{language.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button className="icon-button" title={t('toolbar.insertTable')} disabled={disabled} onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <Table2 size={17} />
        </button>
        <div className="toolbar-menu">
          <button className="icon-button menu-trigger" title={t('toolbar.tableActions')} disabled={disabled} onClick={() => toggleMenu('table')}>
            <Rows3 size={17} />
            <ChevronDown size={12} />
          </button>
          {openMenu === 'table' && (
            <div className="toolbar-menu-panel table-menu" role="menu">
              <button className="toolbar-menu-item" onClick={() => runCommand((editor) => editor.chain().focus().addRowBefore().run())} role="menuitem" type="button">
                <Rows3 size={15} />
                <span>{t('toolbar.rowBefore')}</span>
              </button>
              <button className="toolbar-menu-item" onClick={() => runCommand((editor) => editor.chain().focus().addRowAfter().run())} role="menuitem" type="button">
                <Rows3 size={15} />
                <span>{t('toolbar.rowAfter')}</span>
              </button>
              <button className="toolbar-menu-item danger" onClick={() => runCommand((editor) => editor.chain().focus().deleteRow().run())} role="menuitem" type="button">
                <Trash2 size={15} />
                <span>{t('toolbar.deleteRow')}</span>
              </button>
              <div className="toolbar-menu-separator" />
              <button className="toolbar-menu-item" onClick={() => runCommand((editor) => editor.chain().focus().addColumnBefore().run())} role="menuitem" type="button">
                <Columns3 size={15} />
                <span>{t('toolbar.columnBefore')}</span>
              </button>
              <button className="toolbar-menu-item" onClick={() => runCommand((editor) => editor.chain().focus().addColumnAfter().run())} role="menuitem" type="button">
                <Columns3 size={15} />
                <span>{t('toolbar.columnAfter')}</span>
              </button>
              <button className="toolbar-menu-item danger" onClick={() => runCommand((editor) => editor.chain().focus().deleteColumn().run())} role="menuitem" type="button">
                <Trash2 size={15} />
                <span>{t('toolbar.deleteColumn')}</span>
              </button>
            </div>
          )}
        </div>
        <button className="icon-button" title={t('toolbar.insertImage')} disabled={disabled} onClick={addImage}>
          <ImageIcon size={17} />
        </button>
        <button className="icon-button" title={t('toolbar.undo')} disabled={disabled} onClick={() => editor?.chain().focus().undo().run()}>
          <Undo2 size={17} />
        </button>
        <button className="icon-button" title={t('toolbar.redo')} disabled={disabled} onClick={() => editor?.chain().focus().redo().run()}>
          <Redo2 size={17} />
        </button>
      </div>

      <div className="toolbar-spacer" />

      <label className="autosave-toggle" title={t('toolbar.autoSaveTitle')}>
        <input type="checkbox" checked={autoSave} onChange={(event) => onAutoSaveChange(event.currentTarget.checked)} />
        <span>{t('toolbar.autoSave')}</span>
      </label>
      <button className="icon-button" title={editorMode === 'source' ? t('toolbar.switchRendered') : t('toolbar.switchSource')} onClick={onToggleEditorMode}>
        {editorMode === 'source' ? <FileText size={18} /> : <Code2 size={18} />}
      </button>
      <button className="icon-button" title={t('toolbar.toggleOutline')} onClick={onToggleOutline}>
        {outlineVisible ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
      </button>
      <button className="icon-button" title={t('toolbar.theme', { theme })} onClick={onToggleTheme}>
        {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
      </button>
      <button className="icon-button" title={t('toolbar.language', { language: t(locale === 'zh' ? 'language.zh' : 'language.en') })} onClick={onSwitchLocale}>
        <Languages size={18} />
      </button>
      <button className="icon-button" title={t('toolbar.hotkeys')} onClick={onToggleHotkeySettings}>
        <Keyboard size={18} />
      </button>
      <button className="icon-button" title={t('toolbar.settings')} onClick={onOpenSettings}>
        <Settings size={18} />
      </button>
    </header>
  );
}


function markClass(editor: Editor | null, mark: string, extraClass = '') {
  return buttonClass(editor?.isActive(mark), extraClass);
}

function nodeClass(editor: Editor | null, node: string, extraClass = '') {
  return buttonClass(editor?.isActive(node), extraClass);
}

function headingClass(editor: Editor | null, level: 1 | 2 | 3) {
  return buttonClass(editor?.isActive('heading', { level }));
}

function buttonClass(active: boolean | undefined, extraClass = '') {
  return ['icon-button', active ? 'active' : '', extraClass].filter(Boolean).join(' ');
}

function getCurrentLinkHref(editor: Editor | null): string {
  if (!editor) return '';

  const activeHref = normalizeHref(editor.getAttributes('link').href);
  if (activeHref) return activeHref;

  const linkMarkType = editor.state.schema.marks.link;
  if (!linkMarkType) return '';

  const { from, to, empty } = editor.state.selection;
  if (empty) {
    const { $from } = editor.state.selection;
    const before = $from.parentOffset > 0 ? $from.parent.childBefore($from.parentOffset).node : null;
    const after = $from.parentOffset < $from.parent.content.size ? $from.parent.childAfter($from.parentOffset).node : null;
    return normalizeHref(linkMarkType.isInSet(after?.marks ?? [])?.attrs.href || linkMarkType.isInSet(before?.marks ?? [])?.attrs.href);
  }

  let href = '';
  let mixedLinks = false;
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return;
    const nodeHref = normalizeHref(linkMarkType.isInSet(node.marks)?.attrs.href);
    if (!nodeHref) return;
    if (href && href !== nodeHref) mixedLinks = true;
    href = nodeHref;
  });

  return mixedLinks ? '' : href;
}

function normalizeHref(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function writeClipboardText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  writeClipboardTextFallback(value);
}

function writeClipboardTextFallback(value: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'readonly');
  textarea.style.left = '-9999px';
  textarea.style.position = 'fixed';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}
