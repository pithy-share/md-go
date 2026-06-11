import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { PickMdFile } from '../../wailsjs/go/main/App';

interface InsertLinkPopoverProps {
  editor: Editor;
  initialText: string;
  initialUrl: string;
  documentPath: string;
  onConfirm: (text: string, href: string) => void;
  onCancel: () => void;
}

export function InsertLinkPopover({
  editor,
  initialText,
  initialUrl,
  documentPath,
  onConfirm,
  onCancel,
}: InsertLinkPopoverProps) {
  const [linkText, setLinkText] = useState(initialText);
  const [linkUrl, setLinkUrl] = useState(initialUrl);
  const textInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    textInputRef.current?.focus();
    textInputRef.current?.select();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const trimmedText = linkText.trim();
        const trimmedHref = linkUrl.trim();
        // Auto-fill text with href if empty
        const finalText = trimmedText || trimmedHref;
        if (finalText && trimmedHref) {
          onConfirm(finalText, trimmedHref);
        }
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel, onConfirm, linkText, linkUrl]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onCancel();
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onCancel]);

  const handleBrowse = useCallback(async () => {
    try {
      const path = await PickMdFile();
      if (!path) return;

      // Compute relative path from document directory
      const relativePath = computeRelativeLink(path, documentPath);
      setLinkUrl(relativePath);
      // Set link text to file name if text is empty
      if (!linkText.trim()) {
        const fileName = path.replace(/\\/g, '/').split('/').pop() || '';
        setLinkText(fileName.replace(/\.(md|markdown|mdown|mkd)$/i, ''));
      }
      // Focus back to URL input
      const urlInput = popoverRef.current?.querySelector<HTMLInputElement>('.insert-link-url');
      urlInput?.focus();
    } catch {
      // User cancelled or dialog failed — do nothing
    }
  }, [documentPath, linkText]);

  // Compute popover position near cursor/selection
  const { from } = editor.state.selection;
  const cursorCoords = editor.view.coordsAtPos(from);
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.max(8, cursorCoords.left),
    top: cursorCoords.bottom + 4,
    zIndex: 1000,
  };

  return createPortal(
    <div ref={popoverRef} className="insert-link-popover-portal" style={style}>
      <div className="insert-link-popover">
        <div className="insert-link-popover-field">
          <label className="insert-link-popover-label">Text</label>
          <input
            ref={textInputRef}
            className="insert-link-popover-input"
            type="text"
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
            placeholder="Link text"
          />
        </div>
        <div className="insert-link-popover-field">
          <label className="insert-link-popover-label">URL</label>
          <div className="insert-link-popover-url-row">
            <input
              className="insert-link-popover-input insert-link-url"
              type="text"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https:// or ./path/to/file.md"
            />
            <button
              className="insert-link-popover-browse-btn"
              title="Browse local Markdown file"
              onClick={handleBrowse}
              type="button"
            >
              <FolderOpen size={15} />
            </button>
          </div>
        </div>
        <div className="insert-link-popover-hint">
          Enter to confirm, Esc to cancel
        </div>
      </div>
    </div>,
    document.body,
  );
}

function computeRelativeLink(targetPath: string, documentPath: string): string {
  if (!documentPath) return targetPath.replace(/\\/g, '/');

  // Normalize paths to forward slashes
  const target = targetPath.replace(/\\/g, '/');
  const doc = documentPath.replace(/\\/g, '/');
  const docDir = doc.substring(0, doc.lastIndexOf('/'));

  if (!docDir) return target;

  // Compute relative path from docDir to target
  const docParts = docDir.split('/');
  const targetParts = target.split('/');

  // Find common prefix
  let commonLen = 0;
  while (
    commonLen < docParts.length &&
    commonLen < targetParts.length &&
    docParts[commonLen].toLowerCase() === targetParts[commonLen].toLowerCase()
  ) {
    commonLen++;
  }

  const upCount = docParts.length - commonLen;
  const relParts = targetParts.slice(commonLen);

  const result = [...Array(upCount).fill('..'), ...relParts].join('/');
  return result || '.';
}