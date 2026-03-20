import type { ValidationResult } from '../types.js';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

/**
 * Print a build summary and validation results to the terminal.
 */
export function printReport(opts: {
  llmsTxtEntries: number;
  llmsTxtSections: number;
  jsonLdPages: number;
  crawlersConfigured: number;
  validationResults: ValidationResult[];
}): void {
  const { llmsTxtEntries, llmsTxtSections, jsonLdPages, crawlersConfigured, validationResults } =
    opts;

  console.log('');
  console.log(`  ${BOLD}@agentmarkup/vite${RESET}`);
  console.log('');

  if (llmsTxtEntries > 0) {
    console.log(
      `  ${GREEN}✓${RESET} llms.txt generated (${llmsTxtEntries} entries, ${llmsTxtSections} sections)`
    );
  }

  if (jsonLdPages > 0) {
    console.log(`  ${GREEN}✓${RESET} JSON-LD injected into ${jsonLdPages} pages`);
  }

  if (crawlersConfigured > 0) {
    console.log(
      `  ${GREEN}✓${RESET} robots.txt patched (${crawlersConfigured} AI crawlers configured)`
    );
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
