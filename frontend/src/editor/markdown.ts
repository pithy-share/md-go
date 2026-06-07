import { marked } from 'marked';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

marked.use({
  async: false,
  breaks: false,
  gfm: true,
});

const turndown = new TurndownService({
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  headingStyle: 'atx',
  hr: '---',
});

turndown.use(gfm);

turndown.addRule('taskListItems', {
  filter(node) {
    return node.nodeName === 'LI' && node instanceof HTMLElement && node.dataset.type === 'taskItem';
  },
  replacement(content, node) {
    const element = node as HTMLElement;
    const checked = element.getAttribute('data-checked') === 'true' ? 'x' : ' ';
    return `- [${checked}] ${content.trim()}\n`;
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

export function markdownToHtml(markdown: string): string {
  const source = markdown.trim().length > 0 ? markdown : '# Untitled\n\n';
  const html = marked.parse(source);
  return typeof html === 'string' ? html : '';
}

export function htmlToMarkdown(html: string): string {
  const markdown = turndown.turndown(html);
  return normalizeMarkdown(markdown);
}

export function markdownToExportHtml(markdown: string, title: string): string {
  const body = markdownToHtml(markdown);
  const escapedTitle = escapeHtml(title || 'Document');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapedTitle}</title>
  <style>
    body { color: #1f2937; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.65; margin: 48px auto; max-width: 860px; padding: 0 24px; }
    pre { background: #111827; border-radius: 6px; color: #f9fafb; overflow: auto; padding: 16px; }
    code { background: #f3f4f6; border-radius: 4px; padding: 2px 4px; }
    pre code { background: transparent; padding: 0; }
    blockquote { border-left: 4px solid #d1d5db; color: #4b5563; margin-left: 0; padding-left: 16px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d1d5db; padding: 8px 10px; }
    img { max-width: 100%; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

function normalizeMarkdown(markdown: string): string {
  return markdown
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trimEnd() + '\n';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}