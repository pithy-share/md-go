import { useEffect, useRef } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { mergeAttributes } from '@tiptap/core';
import type { Mark, MarkType, Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
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
import { common, createLowlight } from 'lowlight';
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

const lowlight = createLowlight(common);

lowlight.registerAlias({
  bash: ['sh'],
  cpp: ['cc', 'c++'],
  csharp: ['cs'],
  javascript: ['js'],
  markdown: ['md'],
  plaintext: ['text', 'plain'],
  typescript: ['ts'],
  xml: ['html'],
});

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
        codeBlock: false,
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: false,
      }),
      CodeBlockLowlight.configure({
        defaultLanguage: 'c',
        enableTabIndentation: true,
        languageClassPrefix: 'language-',
        lowlight,
        tabSize: 2,
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
      handleDOMEvents: {
        copy(view, event) {
          if (!(event instanceof ClipboardEvent)) return false;
          return copyLinkSelection(event, view.state);
        },
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

function copyLinkSelection(event: ClipboardEvent, state: EditorState): boolean {
  const link = getCopyableLink(state);
  if (!link || !event.clipboardData) return false;

  event.preventDefault();
  event.clipboardData.setData('text/plain', link.href);
  event.clipboardData.setData('text/uri-list', link.href);
  event.clipboardData.setData('text/html', `<a href="${escapeClipboardHtml(link.href)}">${escapeClipboardHtml(link.text || link.href)}</a>`);
  return true;
}

function getCopyableLink(state: EditorState): { href: string; text: string } | null {
  const linkMarkType = state.schema.marks.link;
  if (!linkMarkType) return null;

  const { selection } = state;
  if (selection.empty) {
    const mark = getActiveLinkMark(state, linkMarkType);
    const href = getLinkHref(mark);
    return href ? { href, text: href } : null;
  }

  return getSelectedLink(state, linkMarkType);
}

function getSelectedLink(state: EditorState, linkMarkType: MarkType): { href: string; text: string } | null {
  const { from, to } = state.selection;
  let href: string | null = null;
  let hasLinkedText = false;
  let hasUnlinkedText = false;
  let hasMultipleLinks = false;

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText || !node.text) return;

    const selectedText = getSelectedNodeText(node, pos, from, to);
    if (!selectedText.trim()) return;

    const nodeHref = getLinkHref(linkMarkType.isInSet(node.marks));
    if (!nodeHref) {
      hasUnlinkedText = true;
      return;
    }

    hasLinkedText = true;
    if (href && href !== nodeHref) {
      hasMultipleLinks = true;
      return;
    }
    href = nodeHref;
  });

  if (!href || !hasLinkedText || hasUnlinkedText || hasMultipleLinks) return null;
  return { href, text: state.doc.textBetween(from, to, '\n').trim() };
}

function getSelectedNodeText(node: ProseMirrorNode, pos: number, from: number, to: number): string {
  const start = Math.max(from, pos);
  const end = Math.min(to, pos + node.nodeSize);
  return node.text?.slice(start - pos, end - pos) ?? '';
}

function getActiveLinkMark(state: EditorState, linkMarkType: MarkType): Mark | null {
  const storedMark = linkMarkType.isInSet(state.storedMarks ?? []);
  if (storedMark) return storedMark;

  const { $from } = state.selection;
  const before = $from.parentOffset > 0 ? $from.parent.childBefore($from.parentOffset).node : null;
  const after = $from.parentOffset < $from.parent.content.size ? $from.parent.childAfter($from.parentOffset).node : null;

  return (after && linkMarkType.isInSet(after.marks)) || (before && linkMarkType.isInSet(before.marks)) || null;
}

function getLinkHref(mark: Mark | null | undefined): string {
  const href = mark?.attrs.href;
  return typeof href === 'string' ? href.trim() : '';
}

function escapeClipboardHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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