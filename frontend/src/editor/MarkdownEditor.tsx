import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { mergeAttributes } from '@tiptap/core';
import type { Mark, MarkType, Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
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
import { languageLabel } from './languages';
import { InlineCodeLanguage } from './InlineCodeLanguage';
import { InlineLinkEditor } from './InlineLinkEditor';
import { SearchBar } from './SearchBar';
import { createSearchPlugin, findMatches, findMatchesInDoc, searchPluginKey, type SearchResult } from './searchPlugin';
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

type InlineEditState =
  | {
      type: 'code-language';
      pos: number;
      language: string;
      target: HTMLElement;
    }
  | {
      type: 'link';
      from: number;
      to: number;
      text: string;
      href: string;
      target: HTMLElement;
    }
  | null;

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

const CodeBlockWithLanguage = CodeBlockLowlight.extend({
  addNodeView() {
    return ({ node, getPos }) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'code-block-wrapper';
      (wrapper as unknown as Record<string, unknown>).__getPos = getPos;

      const pre = document.createElement('pre');
      wrapper.appendChild(pre);

      const code = document.createElement('code');
      const lang = (node.attrs.language as string) || 'c';
      code.classList.add(`language-${lang}`);
      pre.appendChild(code);

      const tag = document.createElement('div');
      tag.className = 'code-lang-tag';
      tag.contentEditable = 'false';
      tag.textContent = languageLabel(lang);
      wrapper.appendChild(tag);

      return {
        dom: wrapper,
        contentDOM: code,
        update(updatedNode) {
          if (updatedNode.type.name !== 'codeBlock') return false;
          const newLang = (updatedNode.attrs.language as string) || 'c';
          tag.textContent = languageLabel(newLang);
          code.className = code.className
            .replace(/language-\w+/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          code.classList.add(`language-${newLang}`);
          return true;
        },
      };
    };
  },
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

function handleInlineClick(
  view: EditorView,
  event: MouseEvent,
  setState: (state: InlineEditState) => void,
): boolean {
  const target = event.target as HTMLElement;

  // Code block language tag click
  const langTag = target.closest('.code-lang-tag');
  if (langTag instanceof HTMLElement) {
    const wrapper = langTag.closest('.code-block-wrapper') as HTMLElement | null;
    if (!wrapper) return false;
    const getPos = (wrapper as unknown as Record<string, unknown>).__getPos as (() => number) | undefined;
    if (typeof getPos !== 'function') return false;
    try {
      const pos = getPos();
      const node = view.state.doc.nodeAt(pos);
      if (!node || node.type.name !== 'codeBlock') return false;
      const language = (node.attrs.language as string) || 'c';
      setState({ type: 'code-language', pos, language, target: langTag });
      return true;
    } catch {
      return false;
    }
  }

  // Link click
  const linkEl = target.closest('a');
  if (linkEl instanceof HTMLAnchorElement) {
    if (event.ctrlKey || event.metaKey) {
      window.open(linkEl.href, '_blank');
      return true;
    }
    try {
      const pos = view.posAtDOM(linkEl, 0);
      const $pos = view.state.doc.resolve(pos);
      const linkMark = $pos.marks().find((m) => m.type.name === 'link');
      if (!linkMark) return false;
      const href = (linkMark.attrs.href as string) || '';
      const linkType = view.state.schema.marks.link;

      // Expand to find link range
      let from = pos;
      let to = pos;
      for (let i = pos - 1; i >= 0; i--) {
        const r = view.state.doc.resolve(i);
        if (!r.marks().some((m) => m.type === linkType && m.attrs.href === href)) {
          from = i + 1;
          break;
        }
        if (i === 0) from = 0;
      }
      for (let i = pos + 1; i <= view.state.doc.content.size; i++) {
        const r = view.state.doc.resolve(i);
        if (!r.marks().some((m) => m.type === linkType && m.attrs.href === href)) {
          to = i;
          break;
        }
        if (i === view.state.doc.content.size) to = i;
      }

      const text = view.state.doc.textBetween(from, to);
      setState({ type: 'link', from, to, text, href, target: linkEl });
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

export function MarkdownEditor({ markdown, documentPath, onChange, onOutlineChange, onEditorReady }: MarkdownEditorProps) {
  const lastInternalMarkdownRef = useRef(markdown);
  const lastDocumentPathRef = useRef(documentPath);
  const [inlineEdit, setInlineEdit] = useState<InlineEditState>(null);

  // ── Search state ──
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [searchMatches, setSearchMatches] = useState<SearchResult[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: false,
      }),
      CodeBlockWithLanguage.configure({
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
        click(view, event) {
          if (!(event instanceof MouseEvent)) return false;
          return handleInlineClick(view, event, setInlineEdit);
        },
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
    const element = editor.view.dom;

    const handleKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;

      // Ctrl+1/2/3 → toggle heading (already heading at this level → paragraph)
      if (event.key === '1' || event.key === '2' || event.key === '3') {
        if (event.shiftKey || event.altKey) return;
        event.preventDefault();
        const level = parseInt(event.key, 10) as 1 | 2 | 3;
        editor.chain().focus().toggleHeading({ level }).run();
        return;
      }

      // Ctrl+Shift+` → toggle inline code
      if (event.shiftKey && event.code === 'Backquote') {
        event.preventDefault();
        editor.chain().focus().toggleCode().run();
        return;
      }

      // Ctrl+K → insert/edit link
      if (event.key === 'k' && !event.shiftKey) {
        event.preventDefault();
        const previousUrl = editor.getAttributes('link').href as string | undefined;
        const url = window.prompt('Link URL', previousUrl ?? 'https://');
        if (url === null) return;
        if (url.trim() === '') {
          editor.chain().focus().extendMarkRange('link').unsetLink().run();
          return;
        }
        editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
        return;
      }

      // Ctrl+F → open search
      if (event.key === 'f' && !event.shiftKey) {
        event.preventDefault();
        setSearchOpen((prev) => !prev);
        setShowReplace(false);
        return;
      }

      // Ctrl+H → open search with replace
      if (event.key === 'h' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        setSearchOpen(true);
        setShowReplace(true);
        return;
      }
    };

    element.addEventListener('keydown', handleKeyDown);
    return () => element.removeEventListener('keydown', handleKeyDown);
  }, [editor]);

  // ── Search: listen for global find trigger ──
  useEffect(() => {
    const handler = () => setSearchOpen((prev) => {
      if (!prev) setShowReplace(false);
      return !prev;
    });
    window.addEventListener('md-go:open-search', handler);
    return () => window.removeEventListener('md-go:open-search', handler);
  }, []);

  // ── Search: register ProseMirror plugin ──
  useEffect(() => {
    if (!editor) return;
    editor.registerPlugin(createSearchPlugin());
    return () => {
      try { editor.unregisterPlugin(searchPluginKey); } catch { /* ok */ }
    };
  }, [editor]);

  // ── Search: recalculate matches when query changes ──
  useEffect(() => {
    if (!editor) return;

    if (!searchQuery) {
      setSearchMatches([]);
      setCurrentMatchIndex(0);
      editor.view.dispatch(editor.state.tr.setMeta(searchPluginKey, { matches: [], activeIndex: 0 }));
      return;
    }

    const matches = findMatchesInDoc(editor.state.doc, searchQuery);
    setSearchMatches(matches);
    setCurrentMatchIndex((prev) => Math.min(prev, Math.max(0, matches.length - 1)));
    editor.view.dispatch(editor.state.tr.setMeta(searchPluginKey, { matches, activeIndex: 0 }));
  }, [editor, searchQuery]);

  // ── Search: navigation & replace callbacks ──
  const goToNextMatch = useCallback(() => {
    if (searchMatches.length === 0 || !editor) return;
    const nextIndex = (currentMatchIndex + 1) % searchMatches.length;
    setCurrentMatchIndex(nextIndex);
    const match = searchMatches[nextIndex];
    editor.chain().focus().setTextSelection({ from: match.from, to: match.to }).run();
    editor.view.dispatch(editor.state.tr.setMeta(searchPluginKey, { matches: searchMatches, activeIndex: nextIndex }));
  }, [editor, searchMatches, currentMatchIndex]);

  const goToPrevMatch = useCallback(() => {
    if (searchMatches.length === 0 || !editor) return;
    const prevIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    setCurrentMatchIndex(prevIndex);
    const match = searchMatches[prevIndex];
    editor.chain().focus().setTextSelection({ from: match.from, to: match.to }).run();
    editor.view.dispatch(editor.state.tr.setMeta(searchPluginKey, { matches: searchMatches, activeIndex: prevIndex }));
  }, [editor, searchMatches, currentMatchIndex]);

  const handleReplace = useCallback(() => {
    if (searchMatches.length === 0 || !editor) return;
    const match = searchMatches[currentMatchIndex];
    if (!match) return;

    editor
      .chain()
      .focus()
      .setTextSelection({ from: match.from, to: match.to })
      .deleteSelection()
      .insertContent(replaceText)
      .run();

    // Recalculate matches
    const newMatches = findMatchesInDoc(editor.state.doc, searchQuery);
    setSearchMatches(newMatches);
    setCurrentMatchIndex(Math.min(currentMatchIndex, newMatches.length - 1));
    editor.view.dispatch(editor.state.tr.setMeta(searchPluginKey, { matches: newMatches, activeIndex: 0 }));
  }, [editor, searchMatches, currentMatchIndex, replaceText, searchQuery]);

  const handleReplaceAll = useCallback(() => {
    if (searchMatches.length === 0 || !editor) return;

    let tr = editor.state.tr;
    const sorted = [...searchMatches].sort((a, b) => b.from - a.from);
    for (const match of sorted) {
      tr = tr.replaceWith(match.from, match.to, editor.state.schema.text(replaceText));
    }
    editor.view.dispatch(tr);

    setSearchMatches([]);
    setCurrentMatchIndex(0);
  }, [editor, searchMatches, replaceText]);

  const handleCloseSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchMatches([]);
    setReplaceText('');
    setCurrentMatchIndex(0);
    editor?.view.dispatch(editor.state.tr.setMeta(searchPluginKey, { matches: [], activeIndex: 0 }));
    editor?.chain().focus().run();
  }, [editor]);

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
      {searchOpen && (
        <SearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          replaceText={replaceText}
          onReplaceTextChange={setReplaceText}
          matchIndex={currentMatchIndex}
          totalMatches={searchMatches.length}
          showReplace={showReplace}
          onPrev={goToPrevMatch}
          onNext={goToNextMatch}
          onReplace={handleReplace}
          onReplaceAll={handleReplaceAll}
          onClose={handleCloseSearch}
          onToggleReplace={() => setShowReplace((prev) => !prev)}
        />
      )}
      <EditorContent editor={editor} />
      {inlineEdit?.type === 'code-language' && (
        <InlineCodeLanguage
          target={inlineEdit.target}
          currentLanguage={inlineEdit.language}
          onSelect={(newLang) => {
            editor?.chain().focus().setNodeSelection(inlineEdit.pos).updateAttributes('codeBlock', { language: newLang }).run();
            setInlineEdit(null);
          }}
          onClose={() => setInlineEdit(null)}
        />
      )}
      {inlineEdit?.type === 'link' && (
        <InlineLinkEditor
          target={inlineEdit.target}
          text={inlineEdit.text}
          href={inlineEdit.href}
          onApply={(newText, newHref) => {
            const chain = editor?.chain().focus();
            if (newText !== inlineEdit.text) {
              // Text changed: replace content and re-apply link
              chain?.setTextSelection({ from: inlineEdit.from, to: inlineEdit.to }).deleteSelection().insertContent(newText).run();
              const newTo = inlineEdit.from + newText.length;
              editor?.chain().focus().setTextSelection({ from: inlineEdit.from, to: newTo }).setLink({ href: newHref }).run();
            } else {
              // Only href changed
              chain?.setTextSelection({ from: inlineEdit.from, to: inlineEdit.to }).extendMarkRange('link').setLink({ href: newHref }).run();
            }
            setInlineEdit(null);
          }}
          onUnlink={() => {
            editor?.chain().focus().setTextSelection({ from: inlineEdit.from, to: inlineEdit.to }).unsetLink().run();
            setInlineEdit(null);
          }}
          onOpen={() => {
            window.open(inlineEdit.href, '_blank');
          }}
          onClose={() => setInlineEdit(null)}
        />
      )}
    </div>
  );
}

export function SourceMarkdownEditor({ markdown, onChange, onOutlineChange, onEditorReady, onSourceReady }: SourceMarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightsRef = useRef<HTMLPreElement | null>(null);

  // ── Search state ──
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [searchMatches, setSearchMatches] = useState<SearchResult[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  useEffect(() => {
    onEditorReady(null);
    onSourceReady(textareaRef.current);
    return () => onSourceReady(null);
  }, [onEditorReady, onSourceReady]);

  useEffect(() => {
    onOutlineChange(extractMarkdownOutline(markdown));
  }, [markdown, onOutlineChange]);

  // ── Ctrl+F / Ctrl+H ──
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;

      if (event.key === 'f' && !event.shiftKey) {
        event.preventDefault();
        setSearchOpen((prev) => !prev);
        setShowReplace(false);
        return;
      }

      if (event.key === 'h' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        setSearchOpen(true);
        setShowReplace(true);
        return;
      }
    };

    textarea.addEventListener('keydown', handleKeyDown);
    return () => textarea.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Recalculate matches when query or markdown changes ──
  useEffect(() => {
    if (!searchQuery) {
      setSearchMatches([]);
      setCurrentMatchIndex(0);
      return;
    }
    const matches = findMatches(markdown, searchQuery);
    setSearchMatches(matches);
    setCurrentMatchIndex((prev) => Math.min(prev, Math.max(0, matches.length - 1)));
  }, [searchQuery, markdown]);

  // ── Sync highlight scroll with textarea ──
  const handleScroll = useCallback(() => {
    if (highlightsRef.current && textareaRef.current) {
      highlightsRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightsRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  // ── Navigate current match ──
  const goToNextMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    const nextIndex = (currentMatchIndex + 1) % searchMatches.length;
    setCurrentMatchIndex(nextIndex);
    const match = searchMatches[nextIndex];
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(match.from, match.to);
    }
  }, [searchMatches, currentMatchIndex]);

  const goToPrevMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    const prevIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    setCurrentMatchIndex(prevIndex);
    const match = searchMatches[prevIndex];
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(match.from, match.to);
    }
  }, [searchMatches, currentMatchIndex]);

  // ── Replace ──
  const handleReplace = useCallback(() => {
    if (searchMatches.length === 0) return;
    const match = searchMatches[currentMatchIndex];
    if (!match) return;
    const next = markdown.slice(0, match.from) + replaceText + markdown.slice(match.to);
    onChange(next);
  }, [searchMatches, currentMatchIndex, markdown, replaceText, onChange]);

  const handleReplaceAll = useCallback(() => {
    if (searchMatches.length === 0) return;
    let result = markdown;
    const sorted = [...searchMatches].sort((a, b) => b.from - a.from);
    for (const match of sorted) {
      result = result.slice(0, match.from) + replaceText + result.slice(match.to);
    }
    onChange(result);
  }, [searchMatches, markdown, replaceText, onChange]);

  const handleCloseSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchMatches([]);
    setReplaceText('');
    setCurrentMatchIndex(0);
    textareaRef.current?.focus();
  }, []);

  // Build highlighted HTML for the backdrop
  const highlightedMarkdown = useMemo(() => {
    if (!searchQuery || searchMatches.length === 0) return escapeHtml(markdown);

    let result = '';
    let lastEnd = 0;
    for (let i = 0; i < searchMatches.length; i++) {
      const { from, to } = searchMatches[i];
      const isActive = i === currentMatchIndex;
      result += escapeHtml(markdown.slice(lastEnd, from));
      result += isActive
        ? `<mark class="search-match search-match-active">${escapeHtml(markdown.slice(from, to))}</mark>`
        : `<mark class="search-match">${escapeHtml(markdown.slice(from, to))}</mark>`;
      lastEnd = to;
    }
    result += escapeHtml(markdown.slice(lastEnd));
    return result;
  }, [markdown, searchQuery, searchMatches, currentMatchIndex]);

  return (
    <div className="editor-shell source-editor-shell">
      {searchOpen && (
        <SearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          replaceText={replaceText}
          onReplaceTextChange={setReplaceText}
          matchIndex={currentMatchIndex}
          totalMatches={searchMatches.length}
          showReplace={showReplace}
          onPrev={goToPrevMatch}
          onNext={goToNextMatch}
          onReplace={handleReplace}
          onReplaceAll={handleReplaceAll}
          onClose={handleCloseSearch}
          onToggleReplace={() => setShowReplace((prev) => !prev)}
        />
      )}
      <div className="source-editor-wrapper">
        <pre
          ref={highlightsRef}
          className="source-editor-highlights"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: highlightedMarkdown + '\n' }}
        />
        <textarea
          ref={textareaRef}
          className="source-editor"
          spellCheck="true"
          value={markdown}
          onChange={(event) => onChange(event.currentTarget.value)}
          onScroll={handleScroll}
          aria-label="Markdown source"
        />
      </div>
    </div>
  );
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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