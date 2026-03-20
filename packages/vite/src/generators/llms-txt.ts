import type { AgentMarkupConfig } from '../types.js';

/**
 * Generate /llms.txt content following llmstxt.org spec.
 *
 * Format:
 * # Site Name
 *
 * > Description
 *
 * Optional instructions block
 *
 * ## Section Title
 *
 * - [Entry Title](url): Description
 */
export function generateLlmsTxt(config: AgentMarkupConfig): string | null {
  if (!config.llmsTxt) return null;

  const lines: string[] = [];

  // H1 — site name (required by spec)
  lines.push(`# ${config.name}`);
  lines.push('');

  // Blockquote — description
  if (config.description) {
    lines.push(`> ${config.description}`);
    lines.push('');
  }

  // Optional instructions
  if (config.llmsTxt.instructions) {
    lines.push(config.llmsTxt.instructions);
    lines.push('');
  }

  // Sections
  for (const section of config.llmsTxt.sections) {
    lines.push(`## ${section.title}`);
    lines.push('');

    for (const entry of section.entries) {
      const url = resolveUrl(config.site, entry.url);
      const desc = entry.description ? `: ${entry.description}` : '';
      lines.push(`- [${entry.title}](${url})${desc}`);
    }

    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

function resolveUrl(site: string, path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const base = site.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}
