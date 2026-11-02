// navigation: nav.redirect-hygiene, nav.not-found, nav.not-found-markdown.
import { bodyByteLength } from '../evidence.js';
import { hasMetaRefresh, normalizeBodyForComparison, scriptBlockContents } from '../html-lite.js';
import {
  notApplicable,
  sampleUsable,
  scored,
  unverified,
  type EvaluatorEntry,
  type PageView,
} from './shared.js';

const REDIRECT_STUB_TEXT_MAX = 40;
const LOCATION_RE = /location\.(?:href|replace\(|assign\()/;

function scriptRedirect(page: PageView): boolean {
  return scriptBlockContents(page.body).some((content) => LOCATION_RE.test(content));
}

function redirectFindings(name: string, page: PageView): string[] {
  const findings: string[] = [];
  if (hasMetaRefresh(page.head)) {
    findings.push(`${name} has a meta refresh in the head`);
  }
  if (page.text.length < REDIRECT_STUB_TEXT_MAX && scriptRedirect(page)) {
    findings.push(`${name} has ${page.text.length} chars of text and a script that sets location`);
  }
  return findings;
}

export const navEvaluators: Record<string, EvaluatorEntry> = {
  'nav.redirect-hygiene': {
    needsHomepage: true,
    run: (context) => {
      const findings = redirectFindings('homepage', context.homepage);
      if (sampleUsable(context)) {
        findings.push(...redirectFindings(`sample page ${context.sample.finalUrl ?? ''}`, context.sample));
      }
      if (findings.length > 0) {
        return scored(0, findings.join('; '), ['homepage', 'samplePage']);
      }
      const homepageText = context.homepage.text.length;
      return scored(
        1,
        `no meta refresh; homepage text ${homepageText} chars${sampleUsable(context) ? `, sample text ${context.sample.text.length} chars` : ''}; script redirects only count on pages under ${REDIRECT_STUB_TEXT_MAX} chars`,
        ['homepage', 'samplePage']
      );
    },
  },
  'nav.not-found': {
    needsHomepage: false,
    run: (context) => {
      const probe = context.probe;
      const resource = probe.resource;
      if (!resource) {
        return unverified('probe-not-run', 'the missing-path probe was not run', ['notFoundProbe']);
      }
      if (probe.unverified) {
        return unverified('probe-unverified', `probe ${probe.describeState()}`, ['notFoundProbe']);
      }
      const status = resource.status;
      const url = resource.requestedUrl;
      if (probe.outcome === 'not-found') {
        return scored(1, `probe ${url} answered HTTP ${status} ${probe.mediaType}`, ['notFoundProbe']);
      }
      if (probe.ok) {
        const homepageBody = context.homepage.body;
        const soft =
          Boolean(probe.body) &&
          Boolean(homepageBody) &&
          normalizeBodyForComparison(probe.body) === normalizeBodyForComparison(homepageBody);
        return scored(
          0,
          soft
            ? `soft-404: probe ${url} answered HTTP ${status} with the homepage body`
            : `missing paths answer ${status}: probe ${url} answered HTTP ${status} ${probe.mediaType}`,
          ['notFoundProbe', 'homepage']
        );
      }
      if (status >= 300 && status < 400) {
        const location = probe.header('location');
        return scored(
          0,
          `missing paths redirect: probe ${url} answered HTTP ${status}${location ? ` to ${location}` : ''}`,
          ['notFoundProbe']
        );
      }
      if (status === 401 || status === 403) {
        return scored(0, `probe ${url} answered ${probe.challengeState() ?? `HTTP ${status}`}`, ['notFoundProbe'], {
          challenge: probe.challengeNote('notFoundProbe'),
        });
      }
      if (probe.outcome === 'challenge') {
        return unverified('probe-challenged', `probe answered HTTP ${status} with a challenge page`, [
          'notFoundProbe',
        ]);
      }
      return scored(0, `probe ${url} answered HTTP ${status} ${probe.mediaType}`, ['notFoundProbe']);
    },
  },
  'nav.not-found-markdown': {
    needsHomepage: false,
    run: (context) => {
      const parent = context.results.get('nav.not-found');
      if (!parent || parent.status !== 'pass') {
        return notApplicable(
          'not-found-not-passing',
          `only applies when nav.not-found scores 1 (it is ${parent?.status ?? 'missing'})`,
          ['notFoundProbe']
        );
      }
      const probe = context.probe;
      const resource = probe.resource;
      if (!resource) {
        return notApplicable('probe-not-run', 'the missing-path probe was not run', ['notFoundProbe']);
      }
      const bytes = bodyByteLength(resource);
      const type = probe.mediaType;
      const agentReadable = (type === 'text/markdown' || type === 'application/json') && bytes >= 20;
      return scored(
        agentReadable ? 1 : 0,
        `probe answered ${type} with ${bytes} bytes`,
        ['notFoundProbe']
      );
    },
  },
};
