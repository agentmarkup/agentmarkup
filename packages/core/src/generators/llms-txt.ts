import { markdownHrefForPagePath } from '../html.js';
import type { AgentMarkupConfig } from '../types.js';

export function generateLlmsTxt(config: AgentMarkupConfig): string | null {
  if (!config.llmsTxt) return null;

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

  for (const section of config.llmsTxt.sections) {
    lines.push(`## ${section.title}`);
    lines.push('');

    for (const entry of section.entries) {
      const url = resolveEntryUrl(config, entry.url);
      const description = entry.description ? `: ${entry.description}` : '';
      lines.push(`- [${entry.title}](${url})${description}`);
    }

    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

function resolveEntryUrl(config: AgentMarkupConfig, path: string): string {
  const resolved = resolveUrl(config.site, path);

  if (!shouldPreferMarkdownMirror(config, resolved)) {
    return resolved;
  }

  return rewriteUrlToMarkdownMirror(config.site, resolved);
}

function resolveUrl(site: string, path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const base = site.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
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
