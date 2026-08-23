import type { ValidationResult } from '../types.js';

export function validateLlmsTxt(content: string): ValidationResult[] {
  const results: ValidationResult[] = [];
  // Strip a leading UTF-8 BOM (U+FEFF): it is invisible but would otherwise
  // fail the H1 check, since the first line would start with the BOM, not "# ".
  const withoutBom =
    content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const lines = withoutBom.split('\n');

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

  let markdownLinkCount = 0;
  let bareUrlListLineCount = 0;
  // Everything before the first `## ` heading is the free-form details block,
  // which the llms.txt spec leaves as arbitrary Markdown. The bare-URL rule
  // exists for the link-list sections, so applying it to the details block
  // would flag prose (for example `llmsTxt.whenToUse` guidance) that is not a
  // link list at all.
  let inLinkSection = false;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      inLinkSection = true;
    }

    // Link labels may contain backslash-escaped brackets (e.g. "[A \[b\] title]"),
    // which is valid CommonMark, so the label group accepts escaped characters.
    const linkPattern = /\[((?:\\.|[^\]\\])*)\]\(([^)]*)\)/g;
    let match;
    while ((match = linkPattern.exec(line)) !== null) {
      markdownLinkCount++;
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

    // A list item that carries an http(s) URL outside Markdown link syntax is
    // a plain-text link the llms.txt spec (and tools like Google Lighthouse's
    // agentic-browsing audit) will not recognize as a link. Per-line regexes
    // keep URL checks independent across lines.
    const isListItem =
      inLinkSection && /^\s*(?:[-*+]|\d+[.)])\s+/.test(line);
    const lineWithoutMarkdownLinks = line.replace(
      /\[(?:\\.|[^\]\\])*\]\([^)]*\)/g,
      ''
    );
    const hasBareUrl = /https?:\/\/\S/.test(lineWithoutMarkdownLinks);
    if (isListItem && hasBareUrl) {
      bareUrlListLineCount++;
    }
  }

  if (bareUrlListLineCount > 0) {
    const lineWord = bareUrlListLineCount === 1 ? 'line' : 'lines';
    if (markdownLinkCount === 0) {
      results.push({
        severity: 'warning',
        message: `llms.txt links use plain-text URLs instead of Markdown links (found ${bareUrlListLineCount} bare-URL list ${lineWord}, 0 Markdown links). The llms.txt spec and tools like Google Lighthouse expect "- [Label](https://example.com)" link syntax.`,
      });
    } else {
      results.push({
        severity: 'warning',
        message: `llms.txt mixes Markdown links with ${bareUrlListLineCount} plain-text URL list ${lineWord}. Convert bare "- Label: https://example.com" lines to "- [Label](https://example.com)" so every link parses as Markdown.`,
      });
    }
  }

  return results;
}
