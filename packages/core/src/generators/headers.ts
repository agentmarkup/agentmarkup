import type { ContentSignalHeadersConfig } from '../types.js';

const CONTENT_SIGNAL_MARKER_START = '# BEGIN agentmarkup Content-Signal';
const CONTENT_SIGNAL_MARKER_END = '# END agentmarkup Content-Signal';
const MARKDOWN_CANONICAL_MARKER_START = '# BEGIN agentmarkup Markdown canonicals';
const MARKDOWN_CANONICAL_MARKER_END = '# END agentmarkup Markdown canonicals';

export interface MarkdownCanonicalHeaderEntry {
  markdownPath: string;
  canonicalUrl: string;
}

export function generateContentSignalHeaderValue(
  config: ContentSignalHeadersConfig = {}
): string {
  const aiTrain = config.aiTrain ?? 'yes';
  const search = config.search ?? 'yes';
  const aiInput = config.aiInput ?? 'yes';

  return `ai-train=${aiTrain}, search=${search}, ai-input=${aiInput}`;
}

export function generateContentSignalHeaders(
  config: ContentSignalHeadersConfig = {}
): string {
  const path = config.path ?? '/*';
  const value = generateContentSignalHeaderValue(config);

  return [
    CONTENT_SIGNAL_MARKER_START,
    path,
    `  Content-Signal: ${value}`,
    CONTENT_SIGNAL_MARKER_END,
  ].join('\n');
}

export function generateMarkdownCanonicalHeaders(
  entries: MarkdownCanonicalHeaderEntry[]
): string {
  const normalizedEntries = normalizeMarkdownCanonicalEntries(entries);

  return [
    MARKDOWN_CANONICAL_MARKER_START,
    ...normalizedEntries.flatMap((entry) => [
      entry.markdownPath,
      `  Link: ${generateMarkdownCanonicalHeaderValue(entry)}`,
      '',
    ]),
    MARKDOWN_CANONICAL_MARKER_END,
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

export function patchHeadersFile(
  existing: string | null,
  config: ContentSignalHeadersConfig = {},
  options: {
    markdownCanonicalEntries?: MarkdownCanonicalHeaderEntry[];
  } = {}
): string {
  let nextHeaders = existing;

  nextHeaders = patchManagedHeadersBlock(nextHeaders, {
    markerStart: CONTENT_SIGNAL_MARKER_START,
    markerEnd: CONTENT_SIGNAL_MARKER_END,
    block: generateContentSignalHeaders(config),
    matches: (headers) => hasMatchingContentSignalHeaders(headers, config),
  });

  if (options.markdownCanonicalEntries?.length) {
    const normalizedEntries = normalizeMarkdownCanonicalEntries(
      options.markdownCanonicalEntries
    );
    nextHeaders = patchManagedHeadersBlock(nextHeaders, {
      markerStart: MARKDOWN_CANONICAL_MARKER_START,
      markerEnd: MARKDOWN_CANONICAL_MARKER_END,
      block: generateMarkdownCanonicalHeaders(normalizedEntries),
      matches: (headers) =>
        hasMatchingMarkdownCanonicalHeaders(headers, normalizedEntries),
    });
  }

  return nextHeaders ? ensureTrailingNewline(nextHeaders) : '';
}

export function patchMarkdownCanonicalHeaders(
  existing: string | null,
  entries: MarkdownCanonicalHeaderEntry[]
): string {
  if (entries.length === 0) {
    return existing ?? '';
  }

  const normalizedEntries = normalizeMarkdownCanonicalEntries(entries);
  return patchManagedHeadersBlock(existing, {
    markerStart: MARKDOWN_CANONICAL_MARKER_START,
    markerEnd: MARKDOWN_CANONICAL_MARKER_END,
    block: generateMarkdownCanonicalHeaders(normalizedEntries),
    matches: (headers) =>
      hasMatchingMarkdownCanonicalHeaders(headers, normalizedEntries),
  });
}

function generateMarkdownCanonicalHeaderValue(
  entry: MarkdownCanonicalHeaderEntry
): string {
  return `<${entry.canonicalUrl}>; rel="canonical"`;
}

function normalizeMarkdownCanonicalEntries(
  entries: MarkdownCanonicalHeaderEntry[]
): MarkdownCanonicalHeaderEntry[] {
  const byPath = new Map<string, MarkdownCanonicalHeaderEntry>();

  for (const entry of entries) {
    const markdownPath = entry.markdownPath.trim();
    const canonicalUrl = entry.canonicalUrl.trim();

    if (!markdownPath || !canonicalUrl) {
      continue;
    }

    byPath.set(markdownPath, { markdownPath, canonicalUrl });
  }

  return Array.from(byPath.values()).sort((left, right) =>
    left.markdownPath.localeCompare(right.markdownPath)
  );
}

function patchManagedHeadersBlock(
  existing: string | null,
  options: {
    markerStart: string;
    markerEnd: string;
    block: string;
    matches: (headers: string) => boolean;
  }
): string {
  if (!existing) {
    return ensureTrailingNewline(options.block);
  }

  const startIdx = existing.indexOf(options.markerStart);
  const endIdx = existing.indexOf(options.markerEnd);

  if (startIdx !== -1 && endIdx !== -1) {
    const before = existing.slice(0, startIdx).trimEnd();
    const after = existing.slice(endIdx + options.markerEnd.length).trimStart();
    const parts = [before, options.block, after].filter(Boolean);
    return ensureTrailingNewline(parts.join('\n\n'));
  }

  if (options.matches(existing)) {
    return ensureTrailingNewline(existing);
  }

  return ensureTrailingNewline(`${existing.trimEnd()}\n\n${options.block}`);
}

function hasMatchingContentSignalHeaders(
  existing: string,
  config: ContentSignalHeadersConfig
): boolean {
  const path = (config.path ?? '/*').trim();
  const expectedValue = generateContentSignalHeaderValue(config).toLowerCase();
  const lines = existing.split('\n');

  let currentPath: string | null = null;
  let hasExpectedValue = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      currentPath = null;
      continue;
    }

    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      currentPath = trimmed;
      continue;
    }

    if (
      currentPath === path &&
      /^Content-Signal:/i.test(trimmed) &&
      trimmed.slice('Content-Signal:'.length).trim().toLowerCase() === expectedValue
    ) {
      hasExpectedValue = true;
    }
  }

  return hasExpectedValue;
}

function hasMatchingMarkdownCanonicalHeaders(
  existing: string,
  entries: MarkdownCanonicalHeaderEntry[]
): boolean {
  const expectedByPath = new Map(
    entries.map((entry) => [
      entry.markdownPath,
      generateMarkdownCanonicalHeaderValue(entry).toLowerCase(),
    ])
  );
  const matchedPaths = new Set<string>();
  const lines = existing.split('\n');

  let currentPath: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      currentPath = null;
      continue;
    }

    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      currentPath = trimmed;
      continue;
    }

    if (
      currentPath &&
      expectedByPath.has(currentPath) &&
      /^Link:/i.test(trimmed) &&
      trimmed.slice('Link:'.length).trim().toLowerCase() ===
        expectedByPath.get(currentPath)
    ) {
      matchedPaths.add(currentPath);
    }
  }

  return matchedPaths.size === expectedByPath.size;
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}
