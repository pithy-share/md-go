import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export interface SearchResult {
  from: number;
  to: number;
}

/** Case-insensitive find all occurrences of query in a plain text string */
export function findMatches(text: string, query: string): SearchResult[] {
  if (!query) return [];
  const results: SearchResult[] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let index = 0;

  while (index < lowerText.length) {
    const pos = lowerText.indexOf(lowerQuery, index);
    if (pos === -1) break;
    results.push({ from: pos, to: pos + query.length });
    index = pos + 1;
  }

  return results;
}

/**
 * Find all occurrences of query in a ProseMirror document.
 * Walks text nodes via nodesBetween so positions match doc positions for Decoration.inline.
 */
export function findMatchesInDoc(doc: ProseMirrorNode, query: string): SearchResult[] {
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

export interface SearchPluginState {
  matches: SearchResult[];
  activeIndex: number;
}

export const searchPluginKey = new PluginKey<SearchPluginState>('search');

/**
 * ProseMirror plugin that renders search-match decorations.
 * The component updates matches/activeIndex via tr.setMeta(searchPluginKey, { matches, activeIndex }).
 */
export function createSearchPlugin() {
  return new Plugin<SearchPluginState>({
    key: searchPluginKey,
    state: {
      init() {
        return { matches: [], activeIndex: 0 };
      },
      apply(tr, prev) {
        const meta = tr.getMeta(searchPluginKey) as Partial<SearchPluginState> | undefined;
        if (meta) {
          return {
            matches: meta.matches ?? prev.matches,
            activeIndex: meta.activeIndex ?? prev.activeIndex,
          };
        }
        return prev;
      },
    },
    props: {
      decorations(state) {
        const ps = searchPluginKey.getState(state);
        if (!ps || ps.matches.length === 0) return DecorationSet.empty;

        const decorations = ps.matches.map((match, index) =>
          Decoration.inline(match.from, match.to, {
            class: index === ps.activeIndex ? 'search-match search-match-active' : 'search-match',
          }),
        );

        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}