import type { ValidationResult } from '../types.js';

const BODY_RE = /<body\b[^>]*>([\s\S]*?)<\/body>/i;
const IGNORED_BLOCKS_RE =
  /<(script|style|noscript|template|svg|canvas|iframe|form)\b[^>]*>[\s\S]*?<\/\1>/gi;

export function validateHtmlContent(
  html: string,
  pagePath?: string
): ValidationResult[] {
  const body = extractBody(html);
  if (!body) {
    return [];
  }

  const cleanedBody = body.replace(IGNORED_BLOCKS_RE, '').trim();
  const text = cleanedBody
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (looksLikeClientShell(cleanedBody) || text.length < 40) {
    return [
      {
        severity: 'warning',
        message:
          'Page body has very little indexable HTML and may rely on client-side rendering',
        path: pagePath,
      },
    ];
  }

  return [];
}

function extractBody(html: string): string {
  const match = html.match(BODY_RE);
  return match ? match[1] : '';
}

function looksLikeClientShell(body: string): boolean {
  const normalized = body
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  if (!normalized) {
    return true;
  }

  return /^<(div|main|section)\b[^>]*(id|class)="[^"]*(root|app|__next|svelte|mount)[^"]*"[^>]*>\s*<\/\1>$/.test(
    normalized
  );
}
