import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Trash2 } from 'lucide-react';

interface InlineLinkEditorProps {
  target: HTMLElement;
  text: string;
  href: string;
  onApply: (text: string, href: string) => void;
  onUnlink: () => void;
  onOpen: () => void;
  onClose: () => void;
}

export function InlineLinkEditor({ target, text, href, onApply, onUnlink, onOpen, onClose }: InlineLinkEditorProps) {
  const [linkText, setLinkText] = useState(text);
  const [linkUrl, setLinkUrl] = useState(href);
  const textInputRef = useRef<HTMLInputElement>(null);

  // Focus text input on mount
  useEffect(() => {
    textInputRef.current?.focus();
    textInputRef.current?.select();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const trimmedText = linkText.trim();
        const trimmedHref = linkUrl.trim();
        if (trimmedText && trimmedHref) {
          onApply(trimmedText, trimmedHref);
        }
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, onApply, linkText, linkUrl]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !target.contains(event.target)) {
        const portal = document.querySelector('.inline-link-editor-portal');
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

  const rect = target.getBoundingClientRect();
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.max(8, rect.left),
    top: rect.bottom + 4,
    zIndex: 1000,
  };

  const handleOpen = () => {
    onOpen();
    onClose();
  };

  const handleUnlink = () => {
    onUnlink();
    onClose();
  };

  return createPortal(
    <div className="inline-link-editor-portal" style={style}>
      <div className="inline-link-editor-popover">
        <div className="inline-link-editor-field">
          <label className="inline-link-editor-label">Text</label>
          <input
            ref={textInputRef}
            className="inline-link-editor-input"
            type="text"
            value={linkText}
            onChange={(event) => setLinkText(event.target.value)}
            placeholder="Link text"
          />
        </div>
        <div className="inline-link-editor-field">
          <label className="inline-link-editor-label">URL</label>
          <input
            className="inline-link-editor-input"
            type="text"
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            placeholder="https://"
          />
        </div>
        <div className="inline-link-editor-actions">
          <button
            className="inline-link-editor-btn"
            title="Open link (Ctrl+click)"
            onClick={handleOpen}
            type="button"
          >
            <ExternalLink size={15} />
          </button>
          <button
            className="inline-link-editor-btn danger"
            title="Remove link"
            onClick={handleUnlink}
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