import { markdownHrefForPagePath, normalizePagePath } from '../html.js';
import type {
  ResolvedLlmsTxtSection,
  ValidationResult,
} from '../types.js';

export function validateMarkdownContent(
  markdown: string,
  pagePath?: string
): ValidationResult[] {
  const body = stripMarkdownPreamble(markdown);
  const text = body
    .replace(/```[^\n]*\n([\s\S]*?)```/g, ' $1 ')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length < 80) {
    return [
      {
        severity: 'warning',
        message:
          'Markdown mirror has very little useful body content beyond title and metadata',
        path: pagePath,
      },
    ];
  }

  return [];
}

export function validateMarkdownAlternateLink(
  html: string,
  pagePath: string
): ValidationResult[] {
  const expectedHref = markdownHrefForPagePath(pagePath);
  const match = html.match(
    /<link\b[^>]*rel=(['"])alternate\1[^>]*type=(['"])text\/markdown\2[^>]*href=(['"])([\s\S]*?)\3/i
  );

  if (!match) {
    return [
      {
        severity: 'warning',
        message: 'Page is missing a markdown alternate link in the head',
        path: pagePath,
      },
    ];
  }

  const actualHref = match[4].trim();
  if (actualHref !== expectedHref) {
    return [
      {
        severity: 'warning',
        message: `Page markdown alternate link points to ${actualHref} instead of ${expectedHref}`,
        path: pagePath,
      },
    ];
  }

  return [];
}

export function validateLlmsTxtMarkdownCoverage(
  sections: ResolvedLlmsTxtSection[],
  availableMarkdownUrls: Set<string>
): ValidationResult[] {
  const results: ValidationResult[] = [];
  const seen = new Set<string>();

  for (const section of sections) {
    for (const entry of section.entries) {
      const requiredMarkdownUrl = getRequiredMarkdownUrl(entry);

      if (!requiredMarkdownUrl || availableMarkdownUrls.has(requiredMarkdownUrl)) {
        continue;
      }

      const key = `${entry.canonicalUrl}|${requiredMarkdownUrl}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      results.push({
        severity: 'warning',
        message: `llms.txt entry points to markdown mirror ${requiredMarkdownUrl} but no markdown file was emitted`,
        path: pathFromUrl(entry.canonicalUrl),
      });
    }
  }

  return results;
}

function stripMarkdownPreamble(markdown: string): string {
  const lines = markdown.trim().split('\n');

  trimLeadingBlankLines(lines);

  if (lines[0]?.startsWith('# ')) {
    lines.shift();
  }

  stripGeneratedMarkdownMetadata(lines);

  if (lines[0]?.startsWith('# ')) {
    lines.shift();
  }

  trimLeadingBlankLines(lines);
  return lines.join('\n').trim();
}

function stripGeneratedMarkdownMetadata(lines: string[]): void {
  while (true) {
    trimLeadingBlankLines(lines);

    if (lines[0]?.startsWith('> ')) {
      while (lines[0]?.startsWith('> ')) {
        lines.shift();
      }
      continue;
    }

    if (lines[0]?.startsWith('Source: ') || lines[0]?.startsWith('By ')) {
      lines.shift();
      continue;
    }

    break;
  }

  trimLeadingBlankLines(lines);
}

function trimLeadingBlankLines(lines: string[]): void {
  while (lines[0]?.trim() === '') {
    lines.shift();
  }
}

function getRequiredMarkdownUrl(entry: ResolvedLlmsTxtSection['entries'][number]): string | null {
  try {
    const emittedUrl = new URL(entry.url);

    if (entry.sameSite && emittedUrl.pathname.toLowerCase().endsWith('.md')) {
      return emittedUrl.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function pathFromUrl(url: string): string | undefined {
  try {
    return normalizePagePath(new URL(url).pathname);
  } catch {
    return undefined;
  }
}
