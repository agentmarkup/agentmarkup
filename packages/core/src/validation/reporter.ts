import type { ValidationResult } from '../types.js';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

export function printReport(opts: {
  label?: string;
  llmsTxtEntries: number;
  llmsTxtSections: number;
  llmsTxtStatus?: 'generated' | 'preserved' | 'none';
  jsonLdPages: number;
  markdownPages?: number;
  markdownPagesStatus?: 'generated' | 'preserved' | 'none';
  crawlersConfigured: number;
  robotsTxtStatus?: 'patched' | 'preserved' | 'none';
  contentSignalHeadersStatus?: 'generated' | 'preserved' | 'none';
  validationResults: ValidationResult[];
}): void {
  const {
    label = '@agentmarkup',
    llmsTxtEntries,
    llmsTxtSections,
    llmsTxtStatus = llmsTxtEntries > 0 ? 'generated' : 'none',
    jsonLdPages,
    markdownPages = 0,
    markdownPagesStatus = markdownPages > 0 ? 'generated' : 'none',
    crawlersConfigured,
    robotsTxtStatus = crawlersConfigured > 0 ? 'patched' : 'none',
    contentSignalHeadersStatus = 'none',
    validationResults,
  } = opts;

  console.log('');
  console.log(`  ${BOLD}${label}${RESET}`);
  console.log('');

  if (llmsTxtStatus === 'generated' && llmsTxtEntries > 0) {
    console.log(
      `  ${GREEN}✓${RESET} llms.txt generated (${llmsTxtEntries} entries, ${llmsTxtSections} sections)`
    );
  } else if (llmsTxtStatus === 'preserved') {
    console.log(`  ${GREEN}✓${RESET} llms.txt preserved (existing file retained)`);
  }

  if (jsonLdPages > 0) {
    console.log(`  ${GREEN}✓${RESET} JSON-LD injected into ${jsonLdPages} pages`);
  }

  if (markdownPagesStatus === 'generated' && markdownPages > 0) {
    console.log(`  ${GREEN}✓${RESET} Markdown pages generated (${markdownPages} files)`);
  } else if (markdownPagesStatus === 'preserved') {
    console.log(`  ${GREEN}✓${RESET} Markdown pages preserved (existing files retained)`);
  }

  if (robotsTxtStatus === 'patched' && crawlersConfigured > 0) {
    console.log(
      `  ${GREEN}✓${RESET} robots.txt patched (${crawlersConfigured} AI crawlers configured)`
    );
  } else if (robotsTxtStatus === 'preserved' && crawlersConfigured > 0) {
    console.log(
      `  ${GREEN}✓${RESET} robots.txt left unchanged (${crawlersConfigured} AI crawlers already configured)`
    );
  }

  if (contentSignalHeadersStatus === 'generated') {
    console.log(`  ${GREEN}✓${RESET} _headers generated with Content-Signal`);
  } else if (contentSignalHeadersStatus === 'preserved') {
    console.log(`  ${GREEN}✓${RESET} _headers preserved (Content-Signal already configured)`);
  }

  if (validationResults.length === 0) {
    console.log('');
    console.log(`  ${DIM}No issues found${RESET}`);
    console.log('');
    return;
  }

  console.log('');
  console.log(`  ${BOLD}Checks:${RESET}`);

  for (const result of validationResults) {
    const icon = result.severity === 'error' ? `${RED}✗${RESET}` : `${YELLOW}⚠${RESET}`;
    const location = result.path ? `${DIM}${result.path}:${RESET} ` : '';
    console.log(`  ${icon} ${location}${result.message}`);
  }

  console.log('');
}
