import type { ValidationResult } from '../types.js';

export function validateLlmsTxt(content: string): ValidationResult[] {
  const results: ValidationResult[] = [];
  const lines = content.split('\n');

  const firstContentLine = lines.find((line) => line.trim() !== '');
  if (!firstContentLine || !firstContentLine.startsWith('# ')) {
    results.push({
      severity: 'error',
      message: 'llms.txt must start with an H1 heading (# Site Name)',
    });
  }

  const hasSections = lines.some((line) => line.startsWith('## '));
  if (!hasSections) {
    results.push({
      severity: 'warning',
      message: 'llms.txt has no sections (## headings)',
    });
  }

  for (const line of lines) {
    const linkPattern = /\[([^\]]*)\]\(([^)]*)\)/g;
    let match;
    while ((match = linkPattern.exec(line)) !== null) {
      const [, title, url] = match;
      if (!title.trim()) {
        results.push({
          severity: 'warning',
          message: `llms.txt has link with empty title: ${match[0]}`,
        });
      }

      if (!url.trim()) {
        results.push({
          severity: 'error',
          message: `llms.txt has link with empty URL: ${match[0]}`,
        });
      }
    }
  }

  return results;
}
