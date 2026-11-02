// Markdown helpers for the batch reports. Every site-derived string (titles,
// URLs, evidence, domains) goes through `md()` so a hostile page cannot inject
// markup into summary.md; plain hyphens only, never em dashes.

/** Escapes markdown and HTML-significant characters and collapses whitespace. */
export function md(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\\`*_[\]<>|#]/g, (char) => `\\${char}`)
    .trim();
}

/** A markdown table from a header and rows; cells are escaped by the caller. */
export function table(header, rows) {
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ];
  return lines.join('\n');
}

/** A bullet list; items are escaped by the caller. */
export function bullets(items) {
  return items.map((item) => `- ${item}`).join('\n');
}
