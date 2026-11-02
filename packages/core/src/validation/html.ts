import { blockPattern, isLoneMountNode, replaceBlocks, replaceTags, scanBlocks } from '../html-scan.js';
import type { ValidationResult } from '../types.js';

/** `/<body\b[^>]*>([\s\S]*?)<\/body>/i`, in linear time (see html-scan.ts). */
const BODY_BLOCK = blockPattern(['body'], { openerEndsAtGt: true, closeAllowsSpace: false });
/** `/<(script|style|noscript|template|svg|canvas|iframe|form)\b[^>]*>[\s\S]*?<\/\1>/gi`, in linear time. */
const IGNORED_BLOCKS = blockPattern(
  ['script', 'style', 'noscript', 'template', 'svg', 'canvas', 'iframe', 'form'],
  { openerEndsAtGt: true, closeAllowsSpace: false }
);

export function validateHtmlContent(
  html: string,
  pagePath?: string
): ValidationResult[] {
  const body = extractBody(html);
  if (!body) {
    return [];
  }

  const cleanedBody = replaceBlocks(body, IGNORED_BLOCKS, '').trim();
  const text = replaceTags(cleanedBody, ' ')
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
  const [match] = scanBlocks(html, BODY_BLOCK, 1);
  return match ? match.content : '';
}

function looksLikeClientShell(body: string): boolean {
  const normalized = body
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  if (!normalized) {
    return true;
  }

  return isLoneMountNode(normalized);
}
