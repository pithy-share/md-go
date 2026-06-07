import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { mergeAttributes } from '@tiptap/core';
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
  documentPath: string;
  onChange: (markdown: string) => void;
  onOutlineChange: (outline: OutlineItem[]) => void;
  onEditorReady: (editor: Editor | null) => void;
}

interface SourceMarkdownEditorProps extends MarkdownEditorProps {
  onSourceReady: (textarea: HTMLTextAreaElement | null) => void;
}

const MarkdownImage = Image.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      dataMarkdownSrc: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-markdown-src'),
        renderHTML: (attributes: { dataMarkdownSrc?: string | null }) => {
          if (!attributes.dataMarkdownSrc) return {};
          return { 'data-markdown-src': attributes.dataMarkdownSrc };
        },
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
  },
});

export function MarkdownEditor({ markdown, documentPath, onChange, onOutlineChange, onEditorReady }: MarkdownEditorProps) {
  const lastInternalMarkdownRef = useRef(markdown);
  const lastDocumentPathRef = useRef(documentPath);
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
      MarkdownImage.configure({
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
    content: markdownToHtml(markdown, documentPath),
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
      const nextMarkdown = htmlToMarkdown(editor.getHTML());
      lastInternalMarkdownRef.current = nextMarkdown;
      onChange(nextMarkdown);
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
    if (lastInternalMarkdownRef.current === markdown && lastDocumentPathRef.current === documentPath) return;
    const incomingHtml = markdownToHtml(markdown, documentPath);
    if (normalizeHtml(editor.getHTML()) === normalizeHtml(incomingHtml)) {
      lastInternalMarkdownRef.current = markdown;
      lastDocumentPathRef.current = documentPath;
      return;
    }
    editor.commands.setContent(incomingHtml, { emitUpdate: false });
    lastInternalMarkdownRef.current = markdown;
    lastDocumentPathRef.current = documentPath;
    onOutlineChange(extractOutline(editor));
  }, [editor, markdown, documentPath, onOutlineChange]);

  return (
    <div className="editor-shell">
      <EditorContent editor={editor} />
    </div>
  );
}

export function SourceMarkdownEditor({ markdown, onChange, onOutlineChange, onEditorReady, onSourceReady }: SourceMarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    onEditorReady(null);
    onSourceReady(textareaRef.current);
    return () => onSourceReady(null);
  }, [onEditorReady, onSourceReady]);

  useEffect(() => {
    onOutlineChange(extractMarkdownOutline(markdown));
  }, [markdown, onOutlineChange]);

  return (
    <div className="editor-shell source-editor-shell">
      <textarea
        ref={textareaRef}
        className="source-editor"
        spellCheck="true"
        value={markdown}
        onChange={(event) => onChange(event.currentTarget.value)}
        aria-label="Markdown source"
      />
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

function extractMarkdownOutline(markdown: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const linePattern = /([^\r\n]*)(\r\n|\r|\n|$)/g;
  let fence: { marker: string; length: number } | null = null;
  let previousTextLine: { pos: number; text: string } | null = null;
  let match: RegExpExecArray | null;

  while ((match = linePattern.exec(markdown)) !== null) {
    if (match[0] === '') break;

    const line = match[1];
    const pos = match.index;
    const fenceMatch = /^\s*([`~]{3,})/.exec(line);

    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      const length = fenceMatch[1].length;
      if (!fence) {
        fence = { marker, length };
      } else if (marker === fence.marker && length >= fence.length) {
        fence = null;
      }
      previousTextLine = null;
      continue;
    }

    if (fence) {
      previousTextLine = null;
      continue;
    }

    const atxHeading = /^(#{1,6})(?:\s+|$)(.*?)\s*#*\s*$/.exec(line);
    if (atxHeading) {
      const level = atxHeading[1].length;
      const text = atxHeading[2].trim();
      if (text) items.push(createOutlineItem(pos, level, text));
      previousTextLine = null;
      continue;
    }

    const setextHeading = /^(=+|-+)\s*$/.exec(line);
    if (setextHeading && previousTextLine) {
      const level = setextHeading[1][0] === '=' ? 1 : 2;
      items.push(createOutlineItem(previousTextLine.pos, level, previousTextLine.text));
      previousTextLine = null;
      continue;
    }

    const text = line.trim();
    previousTextLine = text ? { pos, text } : null;
  }

  return items;
}

function createOutlineItem(pos: number, level: number, text: string): OutlineItem {
  return {
    id: `${pos}-${level}-${slugify(text)}`,
    level,
    pos,
    text,
  };
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