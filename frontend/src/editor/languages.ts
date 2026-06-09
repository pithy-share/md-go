// Language list for code block syntax highlighting.
// Sources: lowlight `common` languages + custom display labels.

export interface LanguageOption {
  value: string;
  label: string;
}

// Map language identifiers to display labels. Add custom labels here;
// languages not listed fall back to their identifier.
const LABELS: Record<string, string> = {
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  css: 'CSS',
  graphql: 'GraphQL',
  html: 'HTML',
  ini: 'INI',
  javascript: 'JavaScript',
  json: 'JSON',
  kotlin: 'Kotlin',
  less: 'Less',
  makefile: 'Makefile',
  markdown: 'Markdown',
  objectivec: 'Objective-C',
  perl: 'Perl',
  php: 'PHP',
  'php-template': 'PHP Template',
  plaintext: 'Plain Text',
  python: 'Python',
  'python-repl': 'Python REPL',
  rust: 'Rust',
  scss: 'SCSS',
  shell: 'Shell',
  sql: 'SQL',
  swift: 'Swift',
  typescript: 'TypeScript',
  vbnet: 'VB.NET',
  wasm: 'WebAssembly',
  xml: 'XML',
  yaml: 'YAML',
};

// Sorted list of all supported languages.
// Includes languages from lowlight `common` plus any additional entries.
export const ALL_LANGUAGES: LanguageOption[] = (() => {
  const seen = new Set<string>();

  // Priority: lowlight `common` languages first
  const common = [
    'arduino', 'bash', 'c', 'cpp', 'csharp', 'css', 'diff', 'go', 'graphql',
    'ini', 'java', 'javascript', 'json', 'kotlin', 'less', 'lua', 'makefile',
    'markdown', 'objectivec', 'perl', 'php', 'php-template', 'plaintext',
    'python', 'python-repl', 'r', 'ruby', 'rust', 'scss', 'shell', 'sql',
    'swift', 'typescript', 'vbnet', 'wasm', 'xml', 'yaml',
  ];

  const languages: LanguageOption[] = [];

  for (const value of common) {
    if (seen.has(value)) continue;
    seen.add(value);
    languages.push({
      value,
      label: LABELS[value] ?? toDisplayLabel(value),
    });
  }

  return languages;
})();

// Alias map: non-standard language names → standard language identifier.
// Keys are user-input shortcuts (from Toolbar's lowlight.registerAlias and custom additions).
export const LANGUAGE_ALIASES: Record<string, string> = {
  sh: 'bash',
  cc: 'cpp',
  'c++': 'cpp',
  cs: 'csharp',
  js: 'javascript',
  md: 'markdown',
  text: 'plaintext',
  plain: 'plaintext',
  ts: 'typescript',
  html: 'xml',
  yml: 'yaml',
  objc: 'objectivec',
};

// Resolve a language string (possibly an alias) to a canonical identifier.
// If the value matches a known language directly, return it.
// If it's a known alias, return the canonical value.
// Otherwise return null (unknown language).
export function resolveLanguage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;

  // Direct match
  if (ALL_LANGUAGES.some((lang) => lang.value === normalized)) {
    return normalized;
  }

  // Alias match
  if (LANGUAGE_ALIASES[normalized]) {
    return LANGUAGE_ALIASES[normalized];
  }

  return null;
}

// Get the display label for a language value.
export function languageLabel(value: string): string {
  return LABELS[value] ?? toDisplayLabel(value);
}

function toDisplayLabel(value: string): string {
  return value
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}