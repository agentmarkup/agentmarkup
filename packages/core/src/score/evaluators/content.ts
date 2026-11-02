// content: content.no-js, content.auth-gate, content.token-budget.
import { looksLikeClientShell } from '../html-lite.js';
import {
  formatCount,
  sampleState,
  sampleUsable,
  scored,
  tokenEstimate,
  type EvaluatorEntry,
  type PageView,
} from './shared.js';

const MIN_PAGE_TEXT = 500;
const MAX_PAGE_TEXT = 100_000;
const PASSWORD_FIELD_RE = /<input\b[^>]*\btype\s*=\s*["']?password\b/i;

function hasPasswordField(page: PageView): boolean {
  return PASSWORD_FIELD_RE.test(page.body);
}

export const contentEvaluators: Record<string, EvaluatorEntry> = {
  'content.no-js': {
    needsHomepage: true,
    run: (context) => {
      const homepage = context.homepage;
      const text = homepage.text;
      const shell = looksLikeClientShell(homepage.body);
      const h1 = homepage.headings.find((heading) => heading.level === 1);
      const results: boolean[] = [text.length >= MIN_PAGE_TEXT && !shell, Boolean(h1 && h1.text)];
      const parts = [
        `homepage text ${formatCount(text.length)} chars${shell ? ' (client shell)' : ''}`,
        h1 && h1.text ? 'h1 present' : 'no h1 text',
      ];
      if (sampleUsable(context)) {
        const sampleText = context.sample.text;
        results.push(sampleText.length >= MIN_PAGE_TEXT);
        parts.push(`sample text ${formatCount(sampleText.length)} chars (${context.sample.finalUrl ?? ''})`);
      } else {
        parts.push(`sample sub-rule not applicable: ${sampleState(context)}`);
      }
      const passed = results.filter(Boolean).length;
      parts.push(`${passed}/${results.length} sub-rules`);
      parts.push(homepage.truncationNote() ?? '');
      return scored(passed / results.length, parts.filter(Boolean).join('; '), ['homepage', 'samplePage']);
    },
  },
  'content.auth-gate': {
    needsHomepage: true,
    run: (context) => {
      const findings: string[] = [];
      const homepage = context.homepage;
      if (hasPasswordField(homepage) && homepage.text.length < MIN_PAGE_TEXT) {
        findings.push(`homepage shows a password field with ${formatCount(homepage.text.length)} chars of text`);
      }
      const sample = context.sample;
      let scope = '';
      if (sample.absent || sample.unverified) {
        scope = `judged on the homepage alone (${sampleState(context)})`;
      } else if (sample.status === 401 || sample.status === 403) {
        findings.push(`sample page ${sample.finalUrl ?? ''} answered HTTP ${sample.status}`);
      } else if (sampleUsable(context) && hasPasswordField(sample) && sample.text.length < MIN_PAGE_TEXT) {
        findings.push(
          `sample page ${sample.finalUrl ?? ''} shows a password field with ${formatCount(sample.text.length)} chars of text`
        );
      }
      if (findings.length > 0) {
        return scored(0, findings.join('; '), ['homepage', 'samplePage']);
      }
      return scored(
        1,
        [scope || `homepage and sample page ${sample.finalUrl ?? ''} answered HTTP ${sample.status} without a login gate`]
          .join('; '),
        ['homepage', 'samplePage']
      );
    },
  },
  'content.token-budget': {
    needsHomepage: true,
    run: (context) => {
      const pages: Array<[string, number]> = [['homepage', context.homepage.text.length]];
      if (sampleUsable(context)) {
        pages.push([`sample page ${context.sample.finalUrl ?? ''}`, context.sample.text.length]);
      }
      const [largestName, largest] = pages.reduce((best, page) => (page[1] > best[1] ? page : best));
      const evidence = `largest sampled page text ${formatCount(largest)} chars (${largestName}, ${tokenEstimate(largest)}), limit ${formatCount(MAX_PAGE_TEXT)}`;
      return scored(largest <= MAX_PAGE_TEXT ? 1 : 0, evidence, ['homepage', 'samplePage']);
    },
  },
};
