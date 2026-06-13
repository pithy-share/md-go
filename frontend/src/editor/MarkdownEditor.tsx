import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { mergeAttributes } from '@tiptap/core';
import type { Mark, MarkType, Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { ClipboardPaste, Copy, Trash2 } from 'lucide-react';
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
import { SaveImageFile } from '../../wailsjs/go/main/App';
import { languageLabel } from './languages';
import { InlineCodeLanguage } from './InlineCodeLanguage';
import { InlineLinkEditor } from './InlineLinkEditor';
import { InlineTableMenu } from './InlineTableMenu';
import { InsertLinkPopover } from './InsertLinkPopover';
import { SearchBar } from './SearchBar';
import { createSearchPlugin, findMatches, findMatchesInDoc, searchPluginKey, type SearchResult } from './searchPlugin';
import type { OutlineItem } from '../types/app';

async function handleImageInsert(
  file: File,
  view: EditorView,
  documentPath: string,
): Promise<void> {
  const buffer = await file.arrayBuffer();
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const imageName = `paste-${timestamp}.${ext}`;

  let relativePath: string;
  if (documentPath) {
    try {
      const result = await SaveImageFile(documentPath, Array.from(new Uint8Array(buffer)), imageName);
      relativePath = result.relativePath || result.path;
    } catch (error) {
      console.error('Failed to save image file:', error);
      const mimeType = file.type || 'image/png';
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      relativePath = `data:${mimeType};base64,${btoa(binary)}`;
    }
  } else {
    const mimeType = file.type || 'image/png';
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    relativePath = `data:${mimeType};base64,${btoa(binary)}`;
  }

  const { state, dispatch } = view;
  const node = state.schema.nodes.image.create(createEditorImageAttributes(relativePath, documentPath));
  dispatch(state.tr.replaceSelectionWith(node));
}

function createEditorImageAttributes(source: string, documentPath: string): { src: string; dataMarkdownSrc?: string } {
  if (!shouldProxyEditorImage(source, documentPath)) {
    return { src: source };
  }

  return {
    src: createLocalImageUrl(source, documentPath),
    dataMarkdownSrc: source,
  };
}

function shouldProxyEditorImage(source: string, documentPath: string): boolean {
  if (!source || !documentPath) return false;
  const lowerSource = source.toLowerCase();
  return !(
    lowerSource.startsWith('http://') ||
    lowerSource.startsWith('https://') ||
    lowerSource.startsWith('data:') ||
    lowerSource.startsWith('blob:') ||
    lowerSource.startsWith(`${LOCAL_IMAGE_ENDPOINT}?`)
  );
}

function createLocalImageUrl(source: string, documentPath: string): string {
  const params = new URLSearchParams({ src: source, document: documentPath });
  return `${LOCAL_IMAGE_ENDPOINT}?${params.toString()}`;
}

interface MarkdownEditorProps {
  markdown: string;
  documentPath: string;
  onChange: (markdown: string) => void;
  onOutlineChange: (outline: OutlineItem[]) => void;
  onEditorReady: (editor: Editor | null) => void;
  onOpenLocalFile?: (path: string) => void;
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

type TableMenuState = {
  target: HTMLElement;
} | null;

type EditorContextMenuState = {
  x: number;
  y: number;
  canCopy: boolean;
  imagePos?: number;
} | null;

const LOCAL_IMAGE_ENDPOINT = '/local-image';

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
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('width') || element.style.width || null,
        renderHTML: (attributes: { width?: string | null }) => {
          if (!attributes.width) return {};
          return { width: attributes.width };
        },
      },
      height: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('height') || element.style.height || null,
        renderHTML: (attributes: { height?: string | null }) => {
          if (!attributes.height) return {};
          return { height: attributes.height };
        },
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'image-resize-wrapper';
      wrapper.contentEditable = 'false';
      (wrapper as unknown as Record<string, unknown>).__getPos = getPos;

      const img = document.createElement('img');
      img.src = node.attrs.src;
      img.draggable = true;
      if (node.attrs.width) {
        img.setAttribute('width', node.attrs.width);
        img.style.width = node.attrs.width;
      }
      if (node.attrs.height) {
        img.setAttribute('height', node.attrs.height);
        img.style.height = node.attrs.height;
      }

      wrapper.addEventListener('click', (e) => {
        e.stopPropagation();
        const pos = getPos();
        if (typeof pos === 'number') {
          editor.commands.command(({ tr }) => {
            tr.setSelection(TextSelection.create(tr.doc, pos));
            return true;
          });
        }
      });

      const handle = document.createElement('div');
      handle.className = 'resize-handle';
      handle.setAttribute('aria-label', 'Resize image');

      let startX = 0;
      let startWidth = 0;
      let resizing = false;

      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startX = e.clientX;
        startWidth = img.offsetWidth;
        resizing = true;
        wrapper.classList.add('selected');

        const onMouseMove = (moveEvent: MouseEvent) => {
          if (!resizing) return;
          const newWidth = Math.max(40, startWidth + (moveEvent.clientX - startX));
          img.style.width = `${newWidth}px`;
        };

        const onMouseUp = () => {
          if (!resizing) return;
          resizing = false;
          wrapper.classList.remove('selected');
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          const pos = getPos();
          if (typeof pos === 'number') {
            editor.commands.command(({ tr }) => {
              tr.setNodeAttribute(pos, 'width', img.style.width || null);
              return true;
            });
          }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });

      wrapper.appendChild(img);
      wrapper.appendChild(handle);

      return {
        dom: wrapper,
        update(updatedNode) {
          if (updatedNode.type.name !== 'image') return false;
          const newSrc = updatedNode.attrs.src;
          if (img.getAttribute('src') !== newSrc) {
            img.setAttribute('src', newSrc);
          }
          const newWidth = updatedNode.attrs.width;
          if (newWidth) {
            img.style.width = typeof newWidth === 'string' ? newWidth : '';
          }
          return true;
        },
      };
    };
  },
});



function cleanLocalPath(href: string): string {
  // Strip file:// protocol, query params, and hash fragments
  const cleaned = href.replace(/^file:\/\/+/i, '').replace(/[?#].*$/, '');
  return cleaned.trim();
}

function isLocalMdFile(href: string): boolean {
  const cleaned = cleanLocalPath(href);
  return !/^https?:\/\//i.test(cleaned) && /\.(md|markdown|mdown|mkd)$/i.test(cleaned);
}

function resolveLocalPath(href: string, documentPath: string): string {
  const cleaned = cleanLocalPath(href);
  // Already absolute path
  if (/^[a-zA-Z]:[\\/]/.test(cleaned) || cleaned.startsWith('/') || cleaned.startsWith('\\')) {
    return cleaned;
  }
  // Relative path: resolve against current document's directory
  const dir = documentPath ? documentPath.replace(/[\\/][^\\/]*$/, '') : '';
  if (!dir) return cleaned;
  // Normalize separators for the platform
  return dir.replace(/\\/g, '/') + '/' + cleaned;
}

function handleInlineClick(
  view: EditorView,
  event: MouseEvent,
  setInlineEdit: (state: InlineEditState) => void,
  onOpenLocalFile: ((path: string) => void) | undefined,
  setTableMenu: (state: TableMenuState) => void,
  documentPath: string,
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
      setInlineEdit({ type: 'code-language', pos, language, target: langTag });
      return true;
    } catch {
      return false;
    }
  }

  // Link click — check before table cell so links inside tables still work
  const linkEl = target.closest('a');
  if (linkEl instanceof HTMLAnchorElement) {
    const href = linkEl.getAttribute('href') || '';
    if (event.ctrlKey || event.metaKey) {
      // Ctrl+click: open local .md in editor, or external URL in browser
      if (isLocalMdFile(href) && onOpenLocalFile) {
        onOpenLocalFile(resolveLocalPath(href, documentPath));
      } else {
        window.open(linkEl.href, '_blank');
      }
      return true;
    }
    try {
      const pos = view.posAtDOM(linkEl, 0);
      const $pos = view.state.doc.resolve(pos);
      const linkMark = $pos.marks().find((m) => m.type.name === 'link');
      if (!linkMark) return false;
      const markHref = (linkMark.attrs.href as string) || '';
      const linkType = view.state.schema.marks.link;

      // Expand to find link range
      let from = pos;
      let to = pos;
      for (let i = pos - 1; i >= 0; i--) {
        const r = view.state.doc.resolve(i);
        if (!r.marks().some((m) => m.type === linkType && m.attrs.href === markHref)) {
          from = i + 1;
          break;
        }
        if (i === 0) from = 0;
      }
      for (let i = pos + 1; i <= view.state.doc.content.size; i++) {
        const r = view.state.doc.resolve(i);
        if (!r.marks().some((m) => m.type === linkType && m.attrs.href === markHref)) {
          to = i;
          break;
        }
        if (i === view.state.doc.content.size) to = i;
      }

      const text = view.state.doc.textBetween(from, to);
      setInlineEdit({ type: 'link', from, to, text, href: markHref, target: linkEl });
      return true;
    } catch {
      return false;
    }
  }

  // Table cell click — only fires when NOT clicking on a link inside the cell
  const cellEl = target.closest('td, th');
  if (cellEl instanceof HTMLElement) {
    setTableMenu({ target: cellEl });
    return true;
  }

  return false;
}

export function MarkdownEditor({ markdown, documentPath, onChange, onOutlineChange, onEditorReady, onOpenLocalFile }: MarkdownEditorProps) {
  const lastInternalMarkdownRef = useRef(markdown);
  const lastDocumentPathRef = useRef(documentPath);
  const skipInitialUpdateRef = useRef(true);
  const [inlineEdit, setInlineEdit] = useState<InlineEditState>(null);
  const [tableMenu, setTableMenu] = useState<TableMenuState>(null);
  const [insertLinkOpen, setInsertLinkOpen] = useState(false);
  const [insertLinkInit, setInsertLinkInit] = useState<{ text: string; href: string }>({ text: '', href: '' });
  const [editorContextMenu, setEditorContextMenu] = useState<EditorContextMenuState>(null);

  // ── Search state ──
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [searchMatches, setSearchMatches] = useState<SearchResult[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  const closeEditorContextMenu = useCallback(() => {
    setEditorContextMenu(null);
  }, []);

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
          closeEditorContextMenu();
          return handleInlineClick(view, event, setInlineEdit, onOpenLocalFile, setTableMenu, documentPath);
        },
        contextmenu(view, event) {
          if (!(event instanceof MouseEvent)) return false;
          event.preventDefault();
          event.stopPropagation();
          setInlineEdit(null);
          setTableMenu(null);

          const target = event.target instanceof Element ? event.target : null;
          const imageWrapper = target?.closest('.image-resize-wrapper') as HTMLElement | null;
          const getImagePos = imageWrapper
            ? (imageWrapper as unknown as Record<string, unknown>).__getPos as (() => number) | undefined
            : undefined;
          const imagePos = typeof getImagePos === 'function' ? getImagePos() : undefined;

          if (typeof imagePos === 'number') {
            view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, imagePos)));
          } else if (view.state.selection.empty) {
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (pos) {
              view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos.pos)));
            }
          }

          view.focus();
          setEditorContextMenu({
            x: event.clientX,
            y: event.clientY,
            canCopy: !view.state.selection.empty,
            imagePos,
          });
          return true;
        },
        copy(view, event) {
          if (!(event instanceof ClipboardEvent)) return false;
          return copyLinkSelection(event, view.state);
        },
        paste(view, event) {
          if (!(event instanceof ClipboardEvent)) return false;
          const items = event.clipboardData?.items;
          if (!items || items.length === 0) return false;

          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith('image/')) {
              event.preventDefault();
              const blob = item.getAsFile();
              if (!blob) continue;
              void handleImageInsert(blob, view, documentPath);
              return true;
            }
          }
          return false;
        },
        drop(view, event) {
          if (!(event instanceof DragEvent)) return false;
          const files = event.dataTransfer?.files;
          if (!files || files.length === 0) return false;

          let hasImage = false;
          for (let i = 0; i < files.length; i++) {
            if (files[i].type.startsWith('image/')) {
              hasImage = true;
              break;
            }
          }
          if (!hasImage) return false;

          event.preventDefault();

          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (pos) {
            const tr = view.state.tr;
            tr.setSelection(TextSelection.create(view.state.doc, pos.pos));
            view.dispatch(tr);
          }

          for (let i = 0; i < files.length; i++) {
            if (files[i].type.startsWith('image/')) {
              void handleImageInsert(files[i], view, documentPath);
            }
          }
          return true;
        },
      },
    },
    onCreate({ editor }) {
      onEditorReady(editor);
      onOutlineChange(extractOutline(editor));
    },
    onUpdate({ editor }) {
      const nextMarkdown = htmlToMarkdown(editor.getHTML());
      if (skipInitialUpdateRef.current) {
        skipInitialUpdateRef.current = false;
        lastInternalMarkdownRef.current = nextMarkdown;
        onOutlineChange(extractOutline(editor));
        return;
      }
      lastInternalMarkdownRef.current = nextMarkdown;
      onChange(nextMarkdown);
      onOutlineChange(extractOutline(editor));
    },
    immediatelyRender: false,
  });

  const copySelectionFromContextMenu = useCallback(() => {
    if (!editor) return;

    editor.chain().focus().run();
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      closeEditorContextMenu();
      return;
    }

    try {
      if (!document.execCommand('copy') && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(editor.state.doc.textBetween(from, to, '\n'));
      }
    } catch (error) {
      console.error('Failed to copy selection:', error);
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(editor.state.doc.textBetween(from, to, '\n'));
      }
    } finally {
      closeEditorContextMenu();
    }
  }, [closeEditorContextMenu, editor]);

  const pasteTextFromContextMenu = useCallback(async () => {
    if (!editor) return;

    closeEditorContextMenu();
    editor.chain().focus().run();

    try {
      const text = await navigator.clipboard?.readText?.();
      if (!text) return;
      editor.view.dispatch(editor.state.tr.insertText(text).scrollIntoView());
    } catch (error) {
      console.error('Failed to paste clipboard text:', error);
    }
  }, [closeEditorContextMenu, editor]);

  const deleteImageFromContextMenu = useCallback(() => {
    if (!editor || typeof editorContextMenu?.imagePos !== 'number') return;

    const pos = editorContextMenu.imagePos;
    const node = editor.state.doc.nodeAt(pos);
    closeEditorContextMenu();

    if (!node || node.type.name !== 'image') return;
    editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize).scrollIntoView());
    editor.view.focus();
  }, [closeEditorContextMenu, editor, editorContextMenu]);

  useEffect(() => {
    if (!editorContextMenu) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeEditorContextMenu();
    };
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('.editor-context-menu')) {
        closeEditorContextMenu();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', closeEditorContextMenu);
    document.addEventListener('click', handleClick, { capture: true });
    document.addEventListener('scroll', closeEditorContextMenu, { capture: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', closeEditorContextMenu);
      document.removeEventListener('click', handleClick, { capture: true });
      document.removeEventListener('scroll', closeEditorContextMenu, { capture: true });
    };
  }, [closeEditorContextMenu, editorContextMenu]);

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
        const { from, to, empty } = editor.state.selection;
        const selectedText = empty ? '' : editor.state.doc.textBetween(from, to, ' ');
        const previousUrl = (editor.getAttributes('link').href as string) || '';
        setInsertLinkInit({ text: selectedText, href: previousUrl });
        setInsertLinkOpen(true);
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

  // ── Link popover: listen for global insert-link trigger ──
  useEffect(() => {
    const handler = () => {
      if (!editor) return;
      const { from, to, empty } = editor.state.selection;
      const selectedText = empty ? '' : editor.state.doc.textBetween(from, to, ' ');
      const previousUrl = (editor.getAttributes('link').href as string) || '';
      setInsertLinkInit({ text: selectedText, href: previousUrl });
      setInsertLinkOpen(true);
    };
    window.addEventListener('md-go:open-link-popover', handler);
    return () => window.removeEventListener('md-go:open-link-popover', handler);
  }, [editor]);

  // ── Scroll caret fix: force repaint after scroll to correct WebView2 compositor color ──
  useEffect(() => {
    if (!editor) return;
    const scrollArea = editor.view.dom.closest('.document-area');
    if (!scrollArea) return;
    let timer: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const dom = editor.view.dom;
        dom.style.caretColor = 'transparent';
        requestAnimationFrame(() => {
          dom.style.caretColor = '';
        });
      }, 150);
    };
    scrollArea.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      scrollArea.removeEventListener('scroll', handleScroll);
    };
  }, [editor]);

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
    const tr = editor.state.tr
      .setSelection(TextSelection.create(editor.state.doc, match.from, match.to))
      .setMeta(searchPluginKey, { matches: searchMatches, activeIndex: nextIndex });
    editor.view.dispatch(tr);
    scrollMatchIntoView(editor, match);
  }, [editor, searchMatches, currentMatchIndex]);

  const goToPrevMatch = useCallback(() => {
    if (searchMatches.length === 0 || !editor) return;
    const prevIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    setCurrentMatchIndex(prevIndex);
    const match = searchMatches[prevIndex];
    const tr = editor.state.tr
      .setSelection(TextSelection.create(editor.state.doc, match.from, match.to))
      .setMeta(searchPluginKey, { matches: searchMatches, activeIndex: prevIndex });
    editor.view.dispatch(tr);
    scrollMatchIntoView(editor, match);
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
      {editorContextMenu && (
        <div
          className="editor-context-menu"
          style={{ left: editorContextMenu.x, top: editorContextMenu.y }}
        >
          <button
            className="editor-context-menu-item"
            disabled={!editorContextMenu.canCopy}
            onClick={copySelectionFromContextMenu}
          >
            <Copy size={14} />
            复制
          </button>
          <button
            className="editor-context-menu-item"
            onClick={() => {
              void pasteTextFromContextMenu();
            }}
          >
            <ClipboardPaste size={14} />
            粘贴
          </button>
          {typeof editorContextMenu.imagePos === 'number' && (
            <button
              className="editor-context-menu-item danger"
              onClick={deleteImageFromContextMenu}
            >
              <Trash2 size={14} />
              删除图片
            </button>
          )}
        </div>
      )}
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
            if (isLocalMdFile(inlineEdit.href) && onOpenLocalFile) {
              onOpenLocalFile(resolveLocalPath(inlineEdit.href, documentPath));
            } else {
              window.open(inlineEdit.href, '_blank');
            }
          }}
          onClose={() => setInlineEdit(null)}
        />
      )}
      {tableMenu && (
        <InlineTableMenu
          target={tableMenu.target}
          editor={editor}
          onClose={() => setTableMenu(null)}
        />
      )}
      {insertLinkOpen && editor && (
        <InsertLinkPopover
          editor={editor}
          initialText={insertLinkInit.text}
          initialUrl={insertLinkInit.href}
          documentPath={documentPath}
          onConfirm={(text, href) => {
            const chain = editor.chain().focus();
            const { empty, from } = editor.state.selection;
            if (!empty) {
              chain.extendMarkRange('link').setLink({ href }).run();
            } else {
              // No selection: insert text, select it, apply link, move cursor to end
              chain
                .insertContent(text)
                .setTextSelection({ from, to: from + text.length })
                .setLink({ href })
                .setTextSelection(from + text.length)
                .run();
            }
            setInsertLinkOpen(false);
          }}
          onCancel={() => setInsertLinkOpen(false)}
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
      textarea.setSelectionRange(match.from, match.to);
      scrollTextareaToSelection(textarea);
    }
  }, [searchMatches, currentMatchIndex]);

  const goToPrevMatch = useCallback(() => {
    if (searchMatches.length === 0) return;
    const prevIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    setCurrentMatchIndex(prevIndex);
    const match = searchMatches[prevIndex];
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.setSelectionRange(match.from, match.to);
      scrollTextareaToSelection(textarea);
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

function scrollTextareaToSelection(textarea: HTMLTextAreaElement) {
  const { selectionStart } = textarea;
  const value = textarea.value;
  // Count newlines before the selection start to estimate line number
  const linesBefore = value.slice(0, selectionStart).split('\n').length - 1;
  const lineHeight = Number.parseFloat(getComputedStyle(textarea).lineHeight) || 20;
  const paddingTop = Number.parseFloat(getComputedStyle(textarea).paddingTop) || 0;
  const targetY = linesBefore * lineHeight + paddingTop;
  const viewTop = textarea.scrollTop;
  const viewBottom = viewTop + textarea.clientHeight;

  if (targetY < viewTop) {
    textarea.scrollTop = Math.max(0, targetY - lineHeight);
  } else if (targetY + lineHeight > viewBottom) {
    textarea.scrollTop = targetY - textarea.clientHeight + lineHeight * 2;
  }
}

function scrollMatchIntoView(editor: Editor, match: SearchResult) {
  const { view } = editor;
  const start = view.coordsAtPos(match.from);
  const end = view.coordsAtPos(match.to);
  const scrollParent = view.dom.closest('.document-area') as HTMLElement | null;
  if (!scrollParent) return;
  const scrollTop = scrollParent.scrollTop;
  const scrollBottom = scrollTop + scrollParent.clientHeight;
  const matchTop = start.top - scrollParent.getBoundingClientRect().top + scrollTop;
  const matchBottom = end.bottom - scrollParent.getBoundingClientRect().top + scrollTop;

  if (matchTop < scrollTop) {
    scrollParent.scrollTop = matchTop - 16;
  } else if (matchBottom > scrollBottom) {
    scrollParent.scrollTop = matchBottom - scrollParent.clientHeight + 16;
  }
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
