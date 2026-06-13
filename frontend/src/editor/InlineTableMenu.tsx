import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';

// ── Inline SVG table icons (16x16) ──

function IconInsertRowAbove() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      {/* 3 existing rows */}
      <rect x="2" y="4" width="10" height="2" rx="0.5" fill="currentColor" opacity="0.85" />
      <rect x="2" y="7" width="10" height="2" rx="0.5" fill="currentColor" opacity="0.85" />
      <rect x="2" y="10" width="10" height="2" rx="0.5" fill="currentColor" opacity="0.85" />
      {/* dashed placeholder row above */}
      <rect x="2" y="0.5" width="10" height="2" rx="0.5" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="0.4" strokeDasharray="1 0.8" />
      {/* green plus sign */}
      <line x1="7" y1="0" x2="7" y2="3" stroke="#059669" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="5.5" y1="1.5" x2="8.5" y2="1.5" stroke="#059669" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconInsertRowBelow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      {/* 3 existing rows */}
      <rect x="2" y="1" width="10" height="2" rx="0.5" fill="currentColor" opacity="0.85" />
      <rect x="2" y="4" width="10" height="2" rx="0.5" fill="currentColor" opacity="0.85" />
      <rect x="2" y="7" width="10" height="2" rx="0.5" fill="currentColor" opacity="0.85" />
      {/* dashed placeholder row below */}
      <rect x="2" y="10.5" width="10" height="2" rx="0.5" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="0.4" strokeDasharray="1 0.8" />
      {/* green plus sign */}
      <line x1="7" y1="10" x2="7" y2="13" stroke="#059669" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="5.5" y1="11.5" x2="8.5" y2="11.5" stroke="#059669" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconDeleteRow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      {/* 3 rows */}
      <rect x="2" y="1" width="10" height="2" rx="0.5" fill="currentColor" opacity="0.85" />
      <rect x="2" y="6" width="10" height="2" rx="0.5" fill="currentColor" opacity="0.85" />
      <rect x="2" y="11" width="10" height="2" rx="0.5" fill="currentColor" opacity="0.85" />
      {/* red X over the table */}
      <line x1="3.5" y1="2.5" x2="10.5" y2="11.5" stroke="#e06c75" strokeWidth="1.7" strokeLinecap="round" />
      <line x1="10.5" y1="2.5" x2="3.5" y2="11.5" stroke="#e06c75" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function IconInsertColLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      {/* 3 existing columns */}
      <rect x="5" y="2" width="2" height="10" rx="0.5" fill="currentColor" opacity="0.85" />
      <rect x="8" y="2" width="2" height="10" rx="0.5" fill="currentColor" opacity="0.85" />
      <rect x="11" y="2" width="2" height="10" rx="0.5" fill="currentColor" opacity="0.85" />
      {/* dashed placeholder column on left */}
      <rect x="1" y="2" width="2" height="10" rx="0.5" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="0.4" strokeDasharray="1 0.8" />
      {/* green plus sign */}
      <line x1="2" y1="7" x2="5" y2="7" stroke="#059669" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="3.5" y1="5.5" x2="3.5" y2="8.5" stroke="#059669" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconInsertColRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      {/* 3 existing columns */}
      <rect x="0" y="2" width="2" height="10" rx="0.5" fill="currentColor" opacity="0.85" />
      <rect x="3" y="2" width="2" height="10" rx="0.5" fill="currentColor" opacity="0.85" />
      <rect x="6" y="2" width="2" height="10" rx="0.5" fill="currentColor" opacity="0.85" />
      {/* dashed placeholder column on right */}
      <rect x="9.5" y="2" width="2" height="10" rx="0.5" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="0.4" strokeDasharray="1 0.8" />
      {/* green plus sign */}
      <line x1="9" y1="7" x2="12" y2="7" stroke="#059669" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="10.5" y1="5.5" x2="10.5" y2="8.5" stroke="#059669" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconDeleteCol() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      {/* 3 columns */}
      <rect x="1" y="2" width="2" height="10" rx="0.5" fill="currentColor" opacity="0.85" />
      <rect x="6" y="2" width="2" height="10" rx="0.5" fill="currentColor" opacity="0.85" />
      <rect x="11" y="2" width="2" height="10" rx="0.5" fill="currentColor" opacity="0.85" />
      {/* red X over the table */}
      <line x1="2.5" y1="3.5" x2="11.5" y2="10.5" stroke="#e06c75" strokeWidth="1.7" strokeLinecap="round" />
      <line x1="11.5" y1="3.5" x2="2.5" y2="10.5" stroke="#e06c75" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

interface InlineTableMenuProps {
  target: HTMLElement;
  editor: Editor | null;
  onClose: () => void;
}

export function InlineTableMenu({ target, editor, onClose }: InlineTableMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !target.contains(event.target)) {
        const portal = document.querySelector('.inline-table-menu-portal');
        if (portal && !portal.contains(event.target as Node)) {
          onClose();
        }
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose, target]);

  const runCommand = (command: () => void) => {
    if (!editor) return;
    editor.chain().focus();
    command();
    onClose();
  };

  const rect = target.getBoundingClientRect();
  const estimatedHeight = 44;
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.max(8, rect.left),
    top: rect.top - estimatedHeight - 8,
    zIndex: 1000,
  };

  return createPortal(
    <div className="inline-table-menu-portal" style={style} ref={menuRef}>
      <div className="inline-table-menu-popover">
        <div className="inline-table-menu-group">
          <span className="inline-table-menu-label">Row</span>
          <button
            className="inline-table-menu-btn"
            title="Insert row above"
            onClick={() => runCommand(() => editor?.chain().focus().addRowBefore().run())}
            type="button"
          >
            <IconInsertRowAbove />
          </button>
          <button
            className="inline-table-menu-btn danger"
            title="Delete row"
            onClick={() => runCommand(() => editor?.chain().focus().deleteRow().run())}
            type="button"
          >
            <IconDeleteRow />
          </button>
          <button
            className="inline-table-menu-btn"
            title="Insert row below"
            onClick={() => runCommand(() => editor?.chain().focus().addRowAfter().run())}
            type="button"
          >
            <IconInsertRowBelow />
          </button>
        </div>
        <div className="inline-table-menu-group">
          <span className="inline-table-menu-label">Col</span>
          <button
            className="inline-table-menu-btn"
            title="Insert column left"
            onClick={() => runCommand(() => editor?.chain().focus().addColumnBefore().run())}
            type="button"
          >
            <IconInsertColLeft />
          </button>
          <button
            className="inline-table-menu-btn danger"
            title="Delete column"
            onClick={() => runCommand(() => editor?.chain().focus().deleteColumn().run())}
            type="button"
          >
            <IconDeleteCol />
          </button>
          <button
            className="inline-table-menu-btn"
            title="Insert column right"
            onClick={() => runCommand(() => editor?.chain().focus().addColumnAfter().run())}
            type="button"
          >
            <IconInsertColRight />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}