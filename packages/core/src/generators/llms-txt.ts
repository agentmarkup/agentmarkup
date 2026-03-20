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
      const url = resolveUrl(config.site, entry.url);
      const description = entry.description ? `: ${entry.description}` : '';
      lines.push(`- [${entry.title}](${url})${description}`);
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
