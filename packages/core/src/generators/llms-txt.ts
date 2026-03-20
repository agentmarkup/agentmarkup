import { markdownHrefForPagePath } from '../html.js';
import type {
  AgentMarkupConfig,
  ResolvedLlmsTxtEntry,
  ResolvedLlmsTxtSection,
} from '../types.js';

export interface LlmsFullTxtOptions {
  contentByUrl?: Record<string, string>;
}

export function generateLlmsTxt(config: AgentMarkupConfig): string | null {
  if (!config.llmsTxt) return null;

  const lines: string[] = [];
  const sections = resolveLlmsTxtSections(config);

  lines.push(`# ${config.name}`);
  lines.push('');

  if (config.description) {
    lines.push(`> ${config.description}`);
    lines.push('');
  }

  if (config.llmsTxt.instructions) {
    lines.push(config.llmsTxt.instructions);
    lines.push('');
  }

  for (const section of sections) {
    lines.push(`## ${section.title}`);
    lines.push('');

    for (const entry of section.entries) {
      const description = entry.description ? `: ${entry.description}` : '';
      lines.push(`- [${entry.title}](${entry.url})${description}`);
    }

    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function generateLlmsFullTxt(
  config: AgentMarkupConfig,
  options: LlmsFullTxtOptions = {}
): string | null {
  if (!config.llmsTxt || !config.llmsFullTxt?.enabled) {
    return null;
  }

  const sections = resolveLlmsTxtSections(config);
  const lines: string[] = [];

  lines.push(`# ${config.name}`);
  lines.push('');

  if (config.description) {
    lines.push(`> ${config.description}`);
    lines.push('');
  }

  if (config.llmsTxt.instructions) {
    lines.push(config.llmsTxt.instructions);
    lines.push('');
  }

  lines.push(
    'This optional agentmarkup context file expands the published llms.txt manifest with inline same-site markdown content when those mirrors are available.'
  );
  lines.push('');

  for (const section of sections) {
    lines.push(`## ${section.title}`);
    lines.push('');

    for (const entry of section.entries) {
      const description = entry.description ? `: ${entry.description}` : '';
      lines.push(`- [${entry.title}](${entry.url})${description}`);
    }

    const entriesWithContent = section.entries.filter((entry) =>
      Boolean(resolveLlmsFullContent(entry, options.contentByUrl))
    );

    if (entriesWithContent.length > 0) {
      lines.push('');
    }

    for (const entry of entriesWithContent) {
      const inlineContent = resolveLlmsFullContent(entry, options.contentByUrl);

      if (!inlineContent) {
        continue;
      }

      lines.push(`### ${entry.title}`);
      lines.push('');

      if (entry.description) {
        lines.push(`> ${entry.description}`);
        lines.push('');
      }

      lines.push(`Source: ${entry.canonicalUrl}`);
      if (entry.markdownUrl && entry.markdownUrl !== entry.canonicalUrl) {
        lines.push(`Preferred fetch: ${entry.url}`);
      }

      const normalizedBody = stripEmbeddedMarkdownPreamble(inlineContent);
      if (normalizedBody) {
        lines.push('');
        lines.push(normalizedBody);
      }

      lines.push('');
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function resolveLlmsTxtSections(
  config: AgentMarkupConfig
): ResolvedLlmsTxtSection[] {
  if (!config.llmsTxt) {
    return [];
  }

  return config.llmsTxt.sections.map((section) => ({
    title: section.title,
    entries: section.entries.map((entry) => resolveLlmsTxtEntry(config, entry)),
  }));
}

export function generateLlmsTxtDiscoveryLink(): string {
  return '<link rel="alternate" type="text/plain" href="/llms.txt" title="LLM-readable site summary" />';
}

export function hasLlmsTxtDiscoveryLink(html: string): boolean {
  return /<link\b[^>]*rel=(['"])alternate\1[^>]*type=(['"])text\/plain\2[^>]*href=(['"])\/llms\.txt\3/i.test(
    html
  );
}

function resolveLlmsTxtEntry(
  config: AgentMarkupConfig,
  entry: { title: string; url: string; description?: string }
): ResolvedLlmsTxtEntry {
  const canonicalUrl = resolveUrl(config.site, entry.url);
  const sameSite = isSameSiteUrl(config.site, canonicalUrl);
  const htmlLike = isHtmlLikeRoute(new URL(canonicalUrl).pathname);
  const markdownUrl =
    sameSite && htmlLike ? rewriteUrlToMarkdownMirror(config.site, canonicalUrl) : null;
  const url =
    markdownUrl && shouldPreferMarkdownMirror(config, canonicalUrl)
      ? markdownUrl
      : canonicalUrl;

  return {
    title: entry.title,
    description: entry.description,
    originalUrl: entry.url,
    url,
    canonicalUrl,
    markdownUrl,
    sameSite,
    htmlLike,
  };
}

function resolveLlmsFullContent(
  entry: ResolvedLlmsTxtEntry,
  contentByUrl: Record<string, string> | undefined
): string | null {
  if (!contentByUrl) {
    return null;
  }

  return (
    (entry.markdownUrl ? contentByUrl[entry.markdownUrl] : null) ??
    contentByUrl[entry.url] ??
    contentByUrl[entry.canonicalUrl] ??
    null
  );
}

function stripEmbeddedMarkdownPreamble(markdown: string): string {
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

function resolveUrl(site: string, path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const base = site.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

function isSameSiteUrl(siteUrl: string, resolvedUrl: string): boolean {
  try {
    return new URL(siteUrl).origin === new URL(resolvedUrl).origin;
  } catch {
    return false;
  }
}

function shouldPreferMarkdownMirror(
  config: AgentMarkupConfig,
  resolvedUrl: string
): boolean {
  if (
    !config.markdownPages ||
    config.markdownPages.enabled === false ||
    config.llmsTxt?.preferMarkdownMirrors === false
  ) {
    return false;
  }

  let site: URL;
  let url: URL;

  try {
    site = new URL(config.site);
    url = new URL(resolvedUrl);
  } catch {
    return false;
  }

  if (url.origin !== site.origin) {
    return false;
  }

  const pathname = url.pathname;
  if (pathname.toLowerCase().endsWith('.md')) {
    return false;
  }

  return isHtmlLikeRoute(pathname);
}

function rewriteUrlToMarkdownMirror(siteUrl: string, resolvedUrl: string): string {
  const site = new URL(siteUrl);
  const url = new URL(resolvedUrl);
  url.pathname = markdownHrefForPagePath(url.pathname);
  url.protocol = site.protocol;
  url.host = site.host;
  return url.toString();
}

function isHtmlLikeRoute(pathname: string): boolean {
  if (pathname === '' || pathname === '/' || pathname.endsWith('/')) {
    return true;
  }

  if (pathname.toLowerCase().endsWith('.html')) {
    return true;
  }

  const lastSegment = pathname.split('/').pop() ?? '';
  return !lastSegment.includes('.');
}
