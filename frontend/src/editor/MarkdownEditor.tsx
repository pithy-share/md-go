import { useEffect } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import Typography from '@tiptap/extension-typography';
import { htmlToMarkdown, markdownToHtml } from './markdown';
import type { OutlineItem } from '../types/app';

interface MarkdownEditorProps {
  markdown: string;
  onChange: (markdown: string) => void;
  onOutlineChange: (outline: OutlineItem[]) => void;
  onEditorReady: (editor: Editor | null) => void;
}

export function MarkdownEditor({ markdown, onChange, onOutlineChange, onEditorReady }: MarkdownEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: false,
      }),
      Link.configure({
        autolink: true,
        defaultProtocol: 'https',
        openOnClick: false,
      }),
      Image.configure({
        allowBase64: true,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Typography,
      Placeholder.configure({
        placeholder: 'Start writing...',
      }),
    ],
    content: markdownToHtml(markdown),
    editorProps: {
      attributes: {
        class: 'prose-editor',
        spellcheck: 'true',
      },
    },
    onCreate({ editor }) {
      onEditorReady(editor);
      onOutlineChange(extractOutline(editor));
    },
    onUpdate({ editor }) {
      onChange(htmlToMarkdown(editor.getHTML()));
      onOutlineChange(extractOutline(editor));
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    onEditorReady(editor ?? null);
    return () => onEditorReady(null);
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (!editor) return;
    const incomingHtml = markdownToHtml(markdown);
    if (normalizeHtml(editor.getHTML()) === normalizeHtml(incomingHtml)) return;
    editor.commands.setContent(incomingHtml, { emitUpdate: false });
    onOutlineChange(extractOutline(editor));
  }, [editor, markdown, onOutlineChange]);

  return (
    <div className="editor-shell">
      <EditorContent editor={editor} />
    </div>
  );
}

function extractOutline(editor: Editor): OutlineItem[] {
  const items: OutlineItem[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return;
    const text = node.textContent.trim();
    if (!text) return;
    const level = Number(node.attrs.level ?? 1);
    items.push({
      id: `${pos}-${level}-${slugify(text)}`,
      level,
      pos,
      text,
    });
  });

  return items;
}

function normalizeHtml(html: string): string {
  return html.replace(/\s+/g, ' ').trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'heading';
}