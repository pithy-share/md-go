import type { Editor } from '@tiptap/react';
import {
  Bold,
  Code,
  Columns3,
  Download,
  FilePlus2,
  FolderOpen,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Quote,
  Redo2,
  Save,
  SaveAll,
  Strikethrough,
  Sun,
  Table2,
  Undo2,
} from 'lucide-react';
import type { ThemePreference } from '../types/app';

interface ToolbarProps {
  editor: Editor | null;
  theme: ThemePreference;
  sidebarVisible: boolean;
  autoSave: boolean;
  isDirty: boolean;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExport: () => void;
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
  onAutoSaveChange: (enabled: boolean) => void;
}

export function Toolbar({
  editor,
  theme,
  sidebarVisible,
  autoSave,
  isDirty,
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onExport,
  onToggleSidebar,
  onToggleTheme,
  onAutoSaveChange,
}: ToolbarProps) {
  const disabled = !editor;

  const setLink = () => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL', previousUrl ?? 'https://');
    if (url === null) return;
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  const addImage = () => {
    if (!editor) return;
    const src = window.prompt('Image URL or local path');
    if (!src) return;
    editor.chain().focus().setImage({ src: src.trim() }).run();
  };

  return (
    <header className="toolbar" data-tauri-drag-region>
      <div className="toolbar-group">
        <button className="icon-button" title="Toggle sidebar" onClick={onToggleSidebar}>
          {sidebarVisible ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
        <button className="icon-button" title="New document" onClick={onNew}>
          <FilePlus2 size={18} />
        </button>
        <button className="icon-button" title="Open document" onClick={onOpen}>
          <FolderOpen size={18} />
        </button>
        <button className={`icon-button ${isDirty ? 'attention' : ''}`} title="Save" onClick={onSave}>
          <Save size={18} />
        </button>
        <button className="icon-button" title="Save as" onClick={onSaveAs}>
          <SaveAll size={18} />
        </button>
        <button className="icon-button" title="Export HTML" onClick={onExport}>
          <Download size={18} />
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button className={markClass(editor, 'bold')} title="Bold" disabled={disabled} onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold size={17} />
        </button>
        <button className={markClass(editor, 'italic')} title="Italic" disabled={disabled} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic size={17} />
        </button>
        <button className={markClass(editor, 'strike')} title="Strikethrough" disabled={disabled} onClick={() => editor?.chain().focus().toggleStrike().run()}>
          <Strikethrough size={17} />
        </button>
        <button className={markClass(editor, 'code')} title="Inline code" disabled={disabled} onClick={() => editor?.chain().focus().toggleCode().run()}>
          <Code size={17} />
        </button>
        <button className={markClass(editor, 'link')} title="Link" disabled={disabled} onClick={setLink}>
          <LinkIcon size={17} />
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button className={headingClass(editor, 1)} title="Heading 1" disabled={disabled} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 size={17} />
        </button>
        <button className={headingClass(editor, 2)} title="Heading 2" disabled={disabled} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 size={17} />
        </button>
        <button className={headingClass(editor, 3)} title="Heading 3" disabled={disabled} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 size={17} />
        </button>
        <button className={nodeClass(editor, 'bulletList')} title="Bullet list" disabled={disabled} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          <List size={17} />
        </button>
        <button className={nodeClass(editor, 'orderedList')} title="Ordered list" disabled={disabled} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={17} />
        </button>
        <button className={nodeClass(editor, 'taskList')} title="Task list" disabled={disabled} onClick={() => editor?.chain().focus().toggleTaskList().run()}>
          <ListChecks size={17} />
        </button>
        <button className={nodeClass(editor, 'blockquote')} title="Quote" disabled={disabled} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
          <Quote size={17} />
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button className="icon-button" title="Insert table" disabled={disabled} onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <Table2 size={17} />
        </button>
        <button className="icon-button" title="Add column" disabled={disabled} onClick={() => editor?.chain().focus().addColumnAfter().run()}>
          <Columns3 size={17} />
        </button>
        <button className="icon-button" title="Insert image" disabled={disabled} onClick={addImage}>
          <ImageIcon size={17} />
        </button>
        <button className="icon-button" title="Undo" disabled={disabled} onClick={() => editor?.chain().focus().undo().run()}>
          <Undo2 size={17} />
        </button>
        <button className="icon-button" title="Redo" disabled={disabled} onClick={() => editor?.chain().focus().redo().run()}>
          <Redo2 size={17} />
        </button>
      </div>

      <div className="toolbar-spacer" />

      <label className="autosave-toggle" title="Auto save">
        <input type="checkbox" checked={autoSave} onChange={(event) => onAutoSaveChange(event.currentTarget.checked)} />
        <span>Auto</span>
      </label>
      <button className="icon-button" title={`Theme: ${theme}`} onClick={onToggleTheme}>
        {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
      </button>
    </header>
  );
}

function markClass(editor: Editor | null, mark: string) {
  return `icon-button ${editor?.isActive(mark) ? 'active' : ''}`;
}

function nodeClass(editor: Editor | null, node: string) {
  return `icon-button ${editor?.isActive(node) ? 'active' : ''}`;
}

function headingClass(editor: Editor | null, level: 1 | 2 | 3) {
  return `icon-button ${editor?.isActive('heading', { level }) ? 'active' : ''}`;
}