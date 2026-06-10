# Frontend Patterns & ProseMirror Guide

> **Purpose**: Capture frontend-specific gotchas, patterns, and conventions for the Wails/React/ProseMirror stack.

---

## ProseMirror: Decoration Position Mapping

### The Problem

When searching text in a ProseMirror document for `Decoration.inline`, you need **document positions** (matching `state.doc.resolve(pos)`). Using `doc.textBetween(from, to, '\n', '')` and searching in the returned string gives **wrong positions** because the `blockSeparator` (`\n`) adds extra characters at block boundaries, shifting all subsequent positions.

### Mistake

```typescript
// ❌ WRONG: textBetween positions != doc positions
const docText = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', '');
const matchPos = docText.indexOf(query); // position in concatenated text
// Using matchPos as Decoration.inline from → highlights at wrong location!
```

### Correct Pattern

Walk text nodes via `nodesBetween` and compute positions as `node_pos + offset_within_node`:

```typescript
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

interface SearchResult { from: number; to: number; }

function findMatchesInDoc(doc: ProseMirrorNode, query: string): SearchResult[] {
  const results: SearchResult[] = [];
  if (!query) return results;
  const lowerQuery = query.toLowerCase();

  doc.nodesBetween(0, doc.content.size, (node, pos) => {
    if (!node.isText || !node.text) return;
    const lowerText = node.text.toLowerCase();
    let index = 0;
    while (index < lowerText.length) {
      const matchIdx = lowerText.indexOf(lowerQuery, index);
      if (matchIdx === -1) break;
      results.push({
        from: pos + matchIdx,
        to: pos + matchIdx + query.length,
      });
      index = matchIdx + 1;
    }
  });
  return results;
}
```

**Why**: `node.pos` in `nodesBetween` is the actual document position. Adding the text offset gives a position valid for `Decoration.inline`.

### Limitations

- Matches spanning multiple text nodes (e.g., across bold/italic marks) won't be found. This is acceptable for search highlighting since most queries are single-word or short phrases.

---

## Sticky Toolbar Pattern

### The Problem

When placing a toolbar/control bar (e.g., search bar) **inside** a scrollable content area, it scrolls away with the content.

```tsx
<div className="document-area"> {/* overflow: auto */}
  <div className="editor-shell">
    <SearchBar /> {/* ← scrolls away! */}
    <EditorContent />
  </div>
</div>
```

### Solution: `position: sticky`

```css
.search-bar {
  position: sticky;
  top: 0;
  z-index: 10;              /* above editor content */
  background: var(--surface); /* opaque so content doesn't show through */
}

/* When parent has padding-top, match it in top offset so sticky takes effect immediately: */
.editor-shell {
  padding-top: 34px;
}
.search-bar {
  position: sticky;
  top: 34px; /* same as parent padding, so it never needs to "travel" before sticking */
}
```

Or simpler: use `top: 0` and accept a brief scroll-before-stick (the 34px of padding is small enough).

### How It Works

- `position: sticky` makes the element switch from relative to fixed positioning when scrolling would push it past the `top` threshold.
- The nearest scrollable ancestor (the one with `overflow: auto/scroll`) is the sticky container.
- `z-index` keeps it above the content that scrolls beneath it.

---

## Limitations Noted

- `findMatchesInDoc` won't find matches that span **marked text boundaries** (e.g., bold/italic within a word). Acceptable for product search.
- `findMatches` (the plain-string version) is still useful for the source/textarea mode where the entire markdown text is one string.