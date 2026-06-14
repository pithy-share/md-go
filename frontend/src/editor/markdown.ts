import { marked } from 'marked';
import DOMPurify from 'dompurify';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

marked.use({
  async: false,
  breaks: false,
  gfm: true,
});

// ==highlight== → <mark>
marked.use({
  extensions: [
    {
      name: 'highlight',
      level: 'inline',
      start(src: string) {
        return src.match(/==/)?.index;
      },
      tokenizer(src: string) {
        const match = /^==([^=\s][^=]*[^=\s]|[^=\s])==/.exec(src);
        if (!match) return undefined;
        return {
          type: 'highlight' as const,
          raw: match[0],
          text: match[1],
          tokens: this.lexer.inlineTokens(match[1]),
        };
      },
      renderer(token: any) {
        return `<mark>${this.parser.parseInline(token.tokens)}</mark>`;
      },
    } as any,
  ],
});

const turndown = new TurndownService({
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  headingStyle: 'atx',
  hr: '---',
});

turndown.use(gfm);

turndown.addRule('imageWithDimensions', {
  filter(node) {
    return node.nodeName === 'IMG' && node instanceof HTMLElement;
  },
  replacement(_content, node) {
    const el = node as HTMLImageElement;
    const src = el.dataset.markdownSrc || el.getAttribute('src') || '';
    const alt = el.getAttribute('alt') ?? '';
    const title = el.getAttribute('title');
    const width = el.getAttribute('width') || '';
    const height = el.getAttribute('height') || '';

    if (width || height) {
      let html = `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"`;
      if (title) html += ` title="${escapeAttr(title)}"`;
      if (width) html += ` width="${escapeAttr(width.toString())}"`;
      if (height) html += ` height="${escapeAttr(height.toString())}"`;
      html += ' />';
      return html;
    }

    const altPart = alt ? alt : '';
    const titlePart = title ? `"${title}"` : '';
    return `![${altPart}](${src}${titlePart})`;
  },
});

// Helper to escape HTML attribute values
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

turndown.addRule('taskListItems', {
  filter(node) {
    return node.nodeName === 'LI' && node instanceof HTMLElement && node.dataset.type === 'taskItem';
  },
  replacement(content, node) {
    const element = node as HTMLElement;
    const checked = element.getAttribute('data-checked') === 'true' ? 'x' : ' ';
    const lines = content.trim().split('\n');
    const firstLine = lines.shift()?.trim() ?? '';
    const rest = lines.length > 0 ? `\n${lines.map((line) => (line ? `  ${line}` : line)).join('\n')}` : '';
    return `- [${checked}] ${firstLine}${rest}\n`;
  },
});

turndown.addRule('inlineCodePreserve', {
  filter: ['code'],
  replacement(content, node) {
    const parent = node.parentNode?.nodeName.toLowerCase();
    if (parent === 'pre') {
      return content;
    }
    return `\`${content}\``;
  },
});

// <mark> → ==highlight==
turndown.addRule('highlight', {
  filter: ['mark'],
  replacement(content) {
    return `==${content}==`;
  },
});

// turndown defensively escapes a leading "N." (e.g. "## 1. 目标" → "## 1\. 目标")
// so the line can't be misread as an ordered-list item. But a heading is
// unambiguously a heading — "## 1. 目标" can never become a list — so strip
// that escaping and keep the heading text readable.
turndown.addRule('heading', {
  filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  replacement(content, node) {
    const level = Number(node.nodeName.charAt(1));
    const text = content.trim().replace(/^(\d+)\\\./, '$1.');
    return `\n\n${'#'.repeat(level)} ${text}\n\n`;
  },
});

// Split a leading YAML (`---`) or TOML (`+++`) front-matter block from the
// body so it can be preserved verbatim. Without this the leading fence is
// parsed as a thematic break / setext heading and the metadata is destroyed.
export function splitFrontmatter(markdown: string): { frontmatter: string; body: string } {
  const match = /^([+-]{3})\r?\n([\s\S]*?)\r?\n\1\r?\n?/.exec(markdown);
  if (!match) return { frontmatter: '', body: markdown };
  return { frontmatter: match[0], body: markdown.slice(match[0].length) };
}

export function markdownToHtml(markdown: string, documentPath = ''): string {
  const { body } = splitFrontmatter(markdown);
  const source = body.trim().length > 0 ? body : '# Untitled\n\n';
  const html = marked.parse(source);
  if (typeof html !== 'string') return '';
  return prepareEditorHtml(html, documentPath);
}

export function htmlToMarkdown(html: string): string {
  const markdown = turndown.turndown(prepareMarkdownHtml(html));
  return normalizeMarkdown(markdown);
}

export function markdownToExportHtml(markdown: string, title: string, documentPath = ''): string {
  const body = markdownToHtml(markdown, documentPath);
  const escapedTitle = escapeHtml(title || 'Document');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapedTitle}</title>
  <style>
    html { background: #ffffff; }
    body { color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.65; margin: 48px auto; max-width: 860px; padding: 0 24px; }
    pre { background: #111827; border-radius: 6px; color: #f9fafb; overflow: auto; padding: 16px; white-space: pre-wrap; }
    code { background: #f3f4f6; border-radius: 4px; padding: 2px 4px; }
    pre code { background: transparent; padding: 0; }
    blockquote { border-left: 4px solid #d1d5db; color: #4b5563; margin-left: 0; padding-left: 16px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d1d5db; padding: 8px 10px; }
    img { max-width: 100%; }
    h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; }
    pre, blockquote, table { break-inside: avoid; page-break-inside: avoid; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    @page { size: A4; margin: 14mm; }
    @media print {
      body { margin: 0; max-width: none; padding: 0; }
      a { color: inherit; text-decoration: underline; }
    }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

const LOCAL_IMAGE_ENDPOINT = '/local-image';
const BLOCK_TAG_NAMES = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DIV',
  'DL',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'UL',
]);

function prepareEditorHtml(html: string, documentPath: string): string {
  const parsed = parseHtml(html);
  prepareEditorImages(parsed, documentPath);
  prepareEditorTaskLists(parsed);
  return sanitizeMarkdownHtml(parsed.body.innerHTML);
}

function prepareMarkdownHtml(html: string): string {
  const parsed = parseHtml(html);
  restoreMarkdownImageSources(parsed);
  prepareMarkdownTaskLists(parsed);
  return sanitizeMarkdownHtml(parsed.body.innerHTML);
}

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

function sanitizeMarkdownHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['data-markdown-src', 'data-type', 'data-checked', 'target'],
    ALLOW_DATA_ATTR: true,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|file):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}

function prepareEditorImages(document: Document, documentPath: string): void {
  document.querySelectorAll('img').forEach((image) => {
    const source = image.getAttribute('src')?.trim() ?? '';
    if (!shouldProxyLocalImage(source, documentPath)) return;

    image.setAttribute('data-markdown-src', source);
    image.setAttribute('src', createLocalImageUrl(source, documentPath));
  });
}

function restoreMarkdownImageSources(document: Document): void {
  document.querySelectorAll('img[data-markdown-src]').forEach((image) => {
    const originalSource = image.getAttribute('data-markdown-src');
    if (!originalSource) return;
    image.setAttribute('src', originalSource);
  });
}

function shouldProxyLocalImage(source: string, documentPath: string): boolean {
  if (!source) return false;
  const lowerSource = source.toLowerCase();
  if (
    lowerSource.startsWith('http://') ||
    lowerSource.startsWith('https://') ||
    lowerSource.startsWith('data:') ||
    lowerSource.startsWith('blob:') ||
    lowerSource.startsWith(`${LOCAL_IMAGE_ENDPOINT}?`)
  ) {
    return false;
  }
  return Boolean(documentPath) || isAbsoluteLocalPath(source) || lowerSource.startsWith('file:');
}

function isAbsoluteLocalPath(source: string): boolean {
  return /^[a-z]:[\\/]/i.test(source) || source.startsWith('\\\\') || source.startsWith('/');
}

function createLocalImageUrl(source: string, documentPath: string): string {
  const params = new URLSearchParams({ src: source });
  if (documentPath) params.set('document', documentPath);
  return `${LOCAL_IMAGE_ENDPOINT}?${params.toString()}`;
}

function prepareEditorTaskLists(document: Document): void {
  const inputs = Array.from(document.querySelectorAll('li input[type="checkbox"]')) as HTMLInputElement[];

  inputs.forEach((input) => {
    const listItem = input.closest('li');
    const list = listItem?.parentElement;
    if (!listItem || list?.tagName !== 'UL') return;

    const checked = input.checked || input.hasAttribute('checked');
    list.setAttribute('data-type', 'taskList');
    listItem.setAttribute('data-type', 'taskItem');
    listItem.setAttribute('data-checked', checked ? 'true' : 'false');
    input.remove();

    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.setAttribute('type', 'checkbox');
    if (checked) checkbox.setAttribute('checked', 'checked');
    label.appendChild(checkbox);
    label.appendChild(document.createElement('span'));

    const content = document.createElement('div');
    while (listItem.firstChild) {
      content.appendChild(listItem.firstChild);
    }
    normalizeTaskItemContent(document, content);
    listItem.appendChild(label);
    listItem.appendChild(content);
  });
}

function normalizeTaskItemContent(document: Document, content: HTMLElement): void {
  const normalizedNodes: Node[] = [];
  let paragraph: HTMLParagraphElement | null = null;

  const flushParagraph = () => {
    if (!paragraph) return;
    normalizedNodes.push(paragraph);
    paragraph = null;
  };

  const appendInlineNode = (node: Node) => {
    if (!paragraph) paragraph = document.createElement('p');
    paragraph.appendChild(node);
  };

  while (content.firstChild) {
    const node = content.firstChild;
    if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim() && !paragraph) {
      content.removeChild(node);
      continue;
    }
    if (node instanceof HTMLElement && BLOCK_TAG_NAMES.has(node.tagName)) {
      flushParagraph();
      normalizedNodes.push(node);
      content.removeChild(node);
      continue;
    }
    content.removeChild(node);
    appendInlineNode(node);
  }

  flushParagraph();
  if (normalizedNodes.length === 0) {
    normalizedNodes.push(document.createElement('p'));
  }
  normalizedNodes.forEach((node) => content.appendChild(node));
}

function prepareMarkdownTaskLists(document: Document): void {
  document.querySelectorAll('li[data-type="taskItem"]').forEach((listItem) => {
    if (!(listItem instanceof HTMLElement)) return;
    const input = findDirectTaskCheckbox(listItem);
    const checked = listItem.getAttribute('data-checked') === 'true' || Boolean(input?.checked) || Boolean(input?.hasAttribute('checked'));
    listItem.setAttribute('data-checked', checked ? 'true' : 'false');

    const label = findDirectChild(listItem, 'LABEL');
    label?.remove();

    const content = findDirectChild(listItem, 'DIV');
    if (!content) return;
    while (content.firstChild) {
      listItem.insertBefore(content.firstChild, content);
    }
    content.remove();
  });
}

function findDirectTaskCheckbox(listItem: Element): HTMLInputElement | null {
  const label = findDirectChild(listItem, 'LABEL');
  const input = label?.querySelector('input[type="checkbox"]');
  return input instanceof HTMLInputElement ? input : null;
}

function findDirectChild(element: Element, tagName: string): HTMLElement | null {
  return Array.from(element.children).find((child) => child.tagName === tagName) as HTMLElement | undefined ?? null;
}

function normalizeMarkdown(markdown: string): string {
  return collapseTightLists(
    markdown
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+\n/g, '\n'),
  ).trimEnd() + '\n';
}

// marked wraps every list item's text in <p>, so turndown treats the whole
// list as "loose" and re-emits a blank line between items even when the source
// was a tight list. Drop those blank lines so a tight list round-trips as
// tight. A multi-paragraph item keeps its spacing (its continuation line is
// indented prose, not a list marker), and fenced code blocks are skipped
// verbatim so their contents are never touched.
function collapseTightLists(markdown: string): string {
  const parts = markdown.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g);
  return parts
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part.replace(
        /(^[ \t]*(?:[-*+]|\d+\.) +[^\n]*\n)(\n+)(?=^[ \t]*(?:[-*+]|\d+\.) +)/gm,
        '$1',
      );
    })
    .join('');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
