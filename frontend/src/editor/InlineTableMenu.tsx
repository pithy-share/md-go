import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Trash2 } from 'lucide-react';

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
            <ArrowUp size={15} />
          </button>
          <button
            className="inline-table-menu-btn"
            title="Insert row below"
            onClick={() => runCommand(() => editor?.chain().focus().addRowAfter().run())}
            type="button"
          >
            <ArrowDown size={15} />
          </button>
          <button
            className="inline-table-menu-btn danger"
            title="Delete row"
            onClick={() => runCommand(() => editor?.chain().focus().deleteRow().run())}
            type="button"
          >
            <Trash2 size={15} />
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
            <ArrowLeft size={15} />
          </button>
          <button
            className="inline-table-menu-btn"
            title="Insert column right"
            onClick={() => runCommand(() => editor?.chain().focus().addColumnAfter().run())}
            type="button"
          >
            <ArrowRight size={15} />
          </button>
          <button
            className="inline-table-menu-btn danger"
            title="Delete column"
            onClick={() => runCommand(() => editor?.chain().focus().deleteColumn().run())}
            type="button"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}