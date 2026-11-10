// @vitest-environment node
// Report copy (spec 2026-11-09-report-ux-spec.md, sections 6.6, 7.1, 7.5, 7.7, 7.10, 7.13, 8, 9
// and 12.3). The verdict sentence is a deterministic rule, so its outputs on the recorded site
// fixtures are pinned word for word; every other string is checked for plain hyphens and for
// the jargon the report must not use (H7, the 11.5 list).
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  GRADE_LABELS,
  SCORE_CATALOG,
  SCORE_CATALOG_VERSION,
  TOP_FIXES_LIMIT,
  WORKER_ERROR_MESSAGES,
  clientSentenceFor,
  compareReports,
  evaluateSiteChecks,
  getCheckDefinition,
  gradeFor,
  rankTopFixes,
  scoreChecks,
  type CheckBucket,
  type ScoreReport,
  type ScoredCheck,
  type SiteEvidence,
} from '@agentmarkup/core/score';

import { isProductHelp, titleForCheck } from '../src/checker/check-copy';
import {
  BAND,
  CHIP_LABELS,
  GROUP_COPY,
  NA_REASON_COPY,
  PRODUCT_LINE,
  STATUS_WORDS,
  announceReport,
  blockedCopy,
  changeLine,
  chipLabel,
  creditLine,
  fixHeading,
  gatedNotice,
  naReason,
  optionalExtrasLine,
  partialLine,
  renderDeveloperBrief,
  verdictSentence,
} from '../src/checker/report-copy';
import {
  GROUP_ORDER,
  blockedCase,
  checkWorth,
  fixPlan,
  formatPoints,
  gatedInfo,
  groupReport,
  partialInfo,
  type BlockedCase,
  type FixPlan,
} from '../src/checker/report-model';
import type { SiteCheckResponse } from '../src/checker/types';
import { blockedExplanation } from '../src/ui/status-model';
import {
  DEFAULT_BODY,
  HOME,
  ORIGIN,
  PROBE_URL,
  homepage,
  notFound,
  resource,
  siteCheck,
  status,
  text,
  timedOut,
} from './helpers/score-fixture';

// ---------------------------------------------------------------------------
// Inputs (same panel as checker-report-model.test.ts)

const FIXTURE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/core/test/fixtures/score');
const FIXTURE_HOSTS = readdirSync(FIXTURE_DIR)
  .filter((file) => file.endsWith('.json') && !file.endsWith('.expected.json') && !file.startsWith('ora-'))
  .map((file) => file.replace(/\.json$/, ''))
  .sort();

function fixtureResult(host: string): SiteCheckResponse {
  const evidence = JSON.parse(readFileSync(resolve(FIXTURE_DIR, `${host}.json`), 'utf8')) as SiteEvidence;
  return { ...evidence, normalizedFrom: null };
}

function score(result: SiteCheckResponse): ScoreReport {
  return scoreChecks(evaluateSiteChecks(result));
}

const FIXTURES: Record<string, ScoreReport> = Object.fromEntries(
  FIXTURE_HOSTS.map((host) => [host, score(fixtureResult(host))])
);

const HOST = 'example.com';
const BRIEF_ORIGIN = 'https://agentmarkup.dev';
const CHALLENGE_BODY = '<html><head><title>Just a moment...</title></head><body></body></html>';
const FAILING_PARTS = {
  homepage: homepage(DEFAULT_BODY, { jsonLd: [], canonical: null, llmsLink: false, markdownLink: false }),
  llms: notFound(`${ORIGIN}/llms.txt`),
  sitemap: notFound(`${ORIGIN}/sitemap.xml`),
  probe: status(PROBE_URL, 302, { headers: { location: HOME } }),
  robots: text(`${ORIGIN}/robots.txt`, 'User-agent: PerplexityBot\nDisallow: /\n'),
  homeMd: null,
  sampleMd: null,
};

const RESULTS = {
  reference: siteCheck(),
  provisional: siteCheck({ llms: timedOut(`${ORIGIN}/llms.txt`) }),
  sampleTimedOut: siteCheck({ sample: timedOut(`${ORIGIN}/services/`), sampleMd: null }),
  blocked: siteCheck({ homepage: timedOut(HOME) }),
  homepage404: siteCheck({ homepage: notFound(HOME) }),
  failing: siteCheck(FAILING_PARTS),
  failingProbe: siteCheck({ ...FAILING_PARTS, probe: timedOut(PROBE_URL) }),
  gated: siteCheck({
    homepage: status(HOME, 403, {
      contentType: 'text/html; charset=UTF-8',
      body: CHALLENGE_BODY,
      headers: { 'cf-mitigated': 'challenge' },
    }),
  }),
  challenged: siteCheck({
    llms: status(`${ORIGIN}/llms.txt`, 403, {
      contentType: 'text/html; charset=UTF-8',
      body: CHALLENGE_BODY,
      headers: { 'cf-mitigated': 'challenge' },
    }),
  }),
};
type SyntheticName = keyof typeof RESULTS;

const SYNTHETIC = Object.fromEntries(
  Object.entries(RESULTS).map(([name, result]) => [name, score(result)])
) as Record<SyntheticName, ScoreReport>;

function blockedResult(error: string, overrides: Parameters<typeof resource>[1] = {}): SiteCheckResponse {
  return siteCheck({
    homepage: resource(HOME, { status: 0, ok: false, contentType: null, body: null, error, ...overrides }),
  });
}

const BLOCKED_RESULTS: Record<string, SiteCheckResponse> = {
  ...Object.fromEntries(WORKER_ERROR_MESSAGES.map((message) => [message, blockedResult(message)])),
  'redirect loop away': blockedResult('Too many redirects.', { finalUrl: 'https://loop.example.net/' }),
  'safety rule with a private target': blockedResult('Request was blocked by checker safety rules.', {
    finalUrl: 'http://10.0.0.7/',
  }),
  'http-status 404': RESULTS.homepage404,
  'server-status 511': siteCheck({ homepage: status(HOME, 511, { body: '<html><body>Network Authentication Required</body></html>' }) }),
  'server-status 429': siteCheck({ homepage: status(HOME, 429) }),
  'server-status 200 without a body': siteCheck({ homepage: resource(HOME, { status: 200, body: null }) }),
};

function blockedFor(result: SiteCheckResponse): { report: ScoreReport; blocked: BlockedCase } {
  const report = score(result);
  const found = blockedCase(report, result);
  if (!found) {
    throw new Error('expected a blocked case');
  }
  return { report, blocked: found };
}

/** Every scored report the copy can be asked about: fixtures plus synthetic non-blocked runs. */
const SCORED: Array<[string, string, ScoreReport]> = [
  ...FIXTURE_HOSTS.map((host): [string, string, ScoreReport] => [host, host, FIXTURES[host]]),
  ...(['reference', 'provisional', 'sampleTimedOut', 'failing', 'failingProbe', 'gated', 'challenged'] as const).map(
    (name): [string, string, ScoreReport] => [`synthetic ${name}`, HOST, SYNTHETIC[name]]
  ),
];

const FORBIDDEN: Array<[string, RegExp]> = [
  ['em dash', /—/],
  ['en dash', /–/],
  ['denominator', /denominator/i],
  ['cached', /cached/i],
  ['IP window', /IP window/i],
  ['normalized', /normalized/i],
  // Word match: "Organization schema completeness" is a catalog name, not an Ora mention (H7).
  ['Ora', /\bOra\b/],
  ['old verdict words', /Looks good|Needs attention|Action required/],
  ['unrendered value', /\bundefined\b|\bNaN\b|\[object Object\]/],
];

function expectClean(label: string, value: string): void {
  for (const [name, pattern] of FORBIDDEN) {
    expect(pattern.test(value), `${label} contains ${name}: ${value}`).toBe(false);
  }
}

function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(stringsIn);
  }
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(stringsIn);
  }
  return [];
}

// ---------------------------------------------------------------------------

describe('verdictSentence (6.6)', () => {
  const EXPECTED: Record<string, string> = {
    'tagteamdesign.com':
      'tagteamdesign.com is readable by AI assistants with a few gaps: access, readable content and navigation are in place, but the biggest gain is in usable controls (Form control labelling, +8.9 points).',
    'visualwebz.com':
      'visualwebz.com is readable by AI assistants with a few gaps: access and readable content are in place, but the biggest gain is in navigation (Missing paths return a real 404, +8.9 points).',
    'animafelix.com':
      'animafelix.com is ready for AI assistants: access, readable content and navigation are in place, and the remaining gains sit above the 100 cap.',
    'agentmarkup.dev':
      'agentmarkup.dev is ready for AI assistants: access, readable content and 4 more areas are in place, and the remaining gains sit above the 100 cap.',
    'cochinescu.com':
      'cochinescu.com is ready for AI assistants: access, readable content and 2 more areas are in place, but the biggest gain is in business identity (Organization schema completeness, +2.2 points).',
    'sandiegowebstudios.com':
      'sandiegowebstudios.com is in strong shape for AI assistants: access, readable content and navigation are in place, but the biggest gain is in usable controls (Document structure, +3 points).',
    'seodesignchicago.com':
      'seodesignchicago.com is ready for AI assistants: access, readable content and navigation are in place, but the biggest gain is in usable controls (Document structure, +3 points).',
    // The AWS WAF captcha served with HTTP 511 (catalog 1.1.0): gated, provisional because
    // the challenged probe leaves nav.not-found unverified.
    'emag.ro':
      'Provisional: emag.ro turns AI assistants away at the door (HTTP 511 bot check), so 19 checks that need the homepage could not run and are left out of the score. 1 check could not be checked in time.',
  };

  it.each(Object.entries(EXPECTED))('says exactly the 6.6 sentence for %s', (host, sentence) => {
    expect(FIXTURE_HOSTS).toContain(host);
    const report = FIXTURES[host];
    expect(verdictSentence(report, groupReport(report), host)).toBe(sentence);
  });

  it('pins a sentence for every recorded fixture, so a new fixture needs a reviewed sentence', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(FIXTURE_HOSTS);
  });

  it('prefixes a partial run with Provisional and counts the unverified checks', () => {
    const report = SYNTHETIC.failingProbe;
    const sentence = verdictSentence(report, groupReport(report), HOST) ?? '';
    expect(report.analysisStatus).toBe('partial');
    expect(sentence.startsWith('Provisional: ')).toBe(true);
    const count = report.unverifiedChecks.length;
    expect(sentence.endsWith(` ${count} check${count === 1 ? '' : 's'} could not be checked in time.`)).toBe(true);
  });

  it('H13: a partial run uses the band of the pessimistic end, not the score', () => {
    const report = SYNTHETIC.failingProbe;
    const pessimistic = gradeFor(report.range?.pessimistic ?? 0);
    expect(pessimistic).not.toBe(report.grade);
    const sentence = verdictSentence(report, groupReport(report), HOST) ?? '';
    expect(sentence.startsWith(`Provisional: ${HOST} ${BAND[pessimistic]}: `)).toBe(true);
    expect(sentence).not.toContain(BAND[report.grade ?? 'F']);
  });

  it('says some files were missing when only an unread resource made the run partial', () => {
    const report = SYNTHETIC.sampleTimedOut;
    expect(report.unverifiedChecks).toEqual([]);
    const sentence = verdictSentence(report, groupReport(report), HOST) ?? '';
    expect(sentence.startsWith('Provisional: ')).toBe(true);
    expect(sentence.endsWith(' Some files could not be fetched in time.')).toBe(true);
  });

  it('names the counted homepage-blocked checks on a gated run', () => {
    const report = SYNTHETIC.gated;
    const affected = report.naChecks.filter((entry) => entry.reason === 'homepage-blocked').length;
    expect(gatedInfo(report)?.affected).toBe(affected);
    expect(verdictSentence(report, groupReport(report), HOST)).toBe(
      `${HOST} turns AI assistants away at the door (HTTP 403 bot check), so ${affected} checks that need the homepage could not run and are left out of the score.`
    );
  });

  it('returns null for blocked runs', () => {
    for (const report of [SYNTHETIC.blocked, SYNTHETIC.homepage404]) {
      expect(verdictSentence(report, groupReport(report), HOST)).toBeNull();
    }
  });

  it('only quotes the engine top fix gain as a number (no gain sums, H8)', () => {
    for (const [name, host, report] of SCORED) {
      const sentence = verdictSentence(report, groupReport(report), host) ?? '';
      const top = rankTopFixes(report.checks, TOP_FIXES_LIMIT)[0];
      const gains = sentence.match(/\+[\d.]+ points/g) ?? [];
      if (gains.length > 0) {
        expect(gains, name).toEqual([`+${top?.estGain} points`]);
      }
      expect(sentence, name).not.toMatch(/ {2}/);
      expect(sentence.endsWith('.'), name).toBe(true);
    }
  });
});

describe('copy tables', () => {
  it('words every bucket exactly as 7.1', () => {
    const expected: Record<CheckBucket, { label: string; question: string; noun: string }> = {
      reachability: { label: 'Access', question: 'Can AI assistants get in?', noun: 'access' },
      content: { label: 'Content', question: 'Can they read your pages?', noun: 'readable content' },
      controls: { label: 'Controls', question: 'Can they use your buttons, links and forms?', noun: 'usable controls' },
      navigation: { label: 'Navigation', question: 'Do links and missing pages behave?', noun: 'navigation' },
      identity: { label: 'Identity', question: 'Do they know who you are?', noun: 'business identity' },
      discovery: { label: 'Discovery', question: 'Can they find your sitemap and AI guide files?', noun: 'AI guide files' },
    };
    for (const bucket of GROUP_ORDER) {
      expect({ ...GROUP_COPY[bucket] }, bucket).toEqual(expected[bucket]);
    }
    for (const definition of SCORE_CATALOG) {
      expect(GROUP_COPY[definition.bucket], definition.id).toBeDefined();
    }
  });

  it('keeps the six band phrases of 6.6', () => {
    expect({ ...BAND }).toEqual({
      'A+': 'is ready for AI assistants',
      A: 'is in strong shape for AI assistants',
      B: 'is readable by AI assistants with a few gaps',
      C: 'is only partly readable by AI assistants',
      D: 'is hard for AI assistants to use',
      F: 'is not usable by AI assistants yet',
    });
    expect(Object.keys(BAND).sort()).toEqual(Object.keys(GRADE_LABELS).sort());
  });

  it('keeps the status words of 7.5', () => {
    expect({ ...STATUS_WORDS }).toEqual({
      'fail-action': 'Needs fixing',
      'fail-attention': 'Needs fixing',
      partial: 'Partly in place',
      pass: 'In place',
      unverified: 'Not checked in time',
      na: "Doesn't apply",
      'not-measured': 'Not measured yet',
    });
  });

  it('labels every measured check with the 7.5 chip label and falls back to the catalog name', () => {
    const expected: Record<string, string> = {
      'reach.bot-detection': 'Bot wall',
      'robots.ai-search-access': 'robots.txt',
      'robots.content-signal': 'Content-Signal',
      'content.no-js': 'No-JS text',
      'content.auth-gate': 'No login wall',
      'content.token-budget': 'Page size',
      'markdown.code-fences': 'Code fences',
      'markdown.url-fallback': '.md pages',
      'markdown.alternate-link': '.md link',
      'markdown.frontmatter': '.md titles',
      'ax.document-structure': 'Landmarks',
      'ax.native-controls': 'Real buttons',
      'ax.accessible-names': 'Control names',
      'ax.form-labeling': 'Form labels',
      'ax.injection-safe': 'Injection-safe',
      'nav.redirect-hygiene': 'Redirects',
      'nav.not-found': 'Real 404',
      'meta.completeness': 'Meta tags',
      'meta.noindex': 'Indexable',
      'jsonld.identity': 'JSON-LD',
      'jsonld.org-completeness': 'Org details',
      'trust.anchors': 'About/Contact',
      'jsonld.same-as': 'Profiles',
      'jsonld.type-breadth': 'Schema types',
      'jsonld.syntax': 'Valid JSON-LD',
      'sitemap.valid': 'Sitemap',
      'sitemap.lastmod': 'Dates',
      'llms.exists': 'llms.txt',
      'llms.formatting': 'llms layout',
      'llms.modular': 'llms-full',
      'llms.discovery-link': 'llms link',
      'llms.agent-instruction': 'When-to-use',
      'link.headers-discovery': 'Link header',
      'nav.not-found-markdown': '404 body',
    };
    for (const [id, label] of Object.entries(expected)) {
      expect(CHIP_LABELS[id], id).toBe(label);
      expect(chipLabel(id), id).toBe(label);
    }
    for (const definition of SCORE_CATALOG.filter((candidate) => candidate.availability === 'now')) {
      expect(CHIP_LABELS[definition.id], `${definition.id} has no chip label`).toBeTruthy();
    }
    const unlabeled = SCORE_CATALOG.find((definition) => !(definition.id in CHIP_LABELS));
    if (unlabeled) {
      expect(chipLabel(unlabeled.id)).toBe(unlabeled.name);
    }
  });

  it('words every not-applicable reason in 7.10 and never prints a raw code', () => {
    const expected: Record<string, string> = {
      'no-api-surface': 'No public API was found on the homepage',
      'no-mcp-surface': 'No MCP server is advertised',
      'no-commerce-surface': 'No shop or pricing surface was found',
      'no-forms-surface': 'No forms were found',
      'no-markdown-surface': 'No markdown versions were found',
      'no-code-fences': 'No code blocks were found in the markdown',
      'no-controls': 'The page has no links, buttons or form controls to judge',
      'no-fields': 'The page has no form fields',
      'no-identity-node': 'No business identity node was found in the JSON-LD',
      'no-jsonld': 'No JSON-LD was found',
      'no-llms': 'No llms.txt to judge',
      'no-markdown-served': 'No markdown version was served',
      'no-robots': 'No robots.txt to judge',
      'probe-not-run': 'The missing-page probe was not run',
      'sitemap-absent': 'No sitemap to judge',
      'sitemap-unverified': 'The sitemap could not be checked in time',
      'headers-not-captured': 'Response headers were not recorded',
      'homepage-blocked': 'Needs the homepage, which showed a bot check',
    };
    for (const [code, copy] of Object.entries(expected)) {
      expect(NA_REASON_COPY[code], code).toBe(copy);
      expect(naReason(code), code).toBe(copy);
    }
    expect(naReason('not-applicable')).toBe('Does not apply to this site');
    expect(naReason('a-code-nobody-wrote-copy-for')).toBe('Does not apply to this site');
    expect(naReason(undefined)).toBe('Does not apply to this site');

    const seen = new Set<string>(Object.keys(expected));
    for (const [, , report] of SCORED) {
      for (const entry of report.naChecks) {
        seen.add(entry.reason);
      }
    }
    for (const entry of SYNTHETIC.homepage404.naChecks) {
      seen.add(entry.reason);
    }
    for (const code of seen) {
      const copy = naReason(code);
      expect(copy.length, code).toBeGreaterThan(0);
      expect(copy, `${code} prints its raw code`).not.toContain(code);
    }
  });

  it('keeps one product line (7.11)', () => {
    expect({ ...PRODUCT_LINE }).toEqual({
      text: 'agentmarkup generates llms.txt, JSON-LD, markdown mirrors and AI crawler rules at build time.',
      linkLabel: 'See how it works',
      href: '/',
    });
  });
});

describe('titleForCheck and isProductHelp (7.7)', () => {
  it('replaces the evidence-dump partial title with "{name}: partly in place"', () => {
    const check = FIXTURES['animafelix.com'].checks.find((candidate) => candidate.id === 'ax.accessible-names');
    expect(check?.status).toBe('partial');
    expect(titleForCheck(check as ScoredCheck)).toBe('Accessible names on controls: partly in place');
  });

  it('keeps challenge and variant sentences, and the client sentence everywhere else', () => {
    const challenged = SYNTHETIC.challenged.checks.find((candidate) => candidate.id === 'llms.exists') as ScoredCheck;
    expect(challenged.challenge).toBeDefined();
    expect(titleForCheck(challenged)).toBe(clientSentenceFor(challenged));
    expect(titleForCheck(challenged)).toBe(
      'Your bot protection shows AI assistants a challenge page instead of /llms.txt (HTTP 403).'
    );

    let variants = 0;
    for (const [name, , report] of SCORED) {
      for (const check of report.checks) {
        const definition = getCheckDefinition(check.id);
        const variant = check.sentenceVariant ? definition?.clientSentence.variants?.[check.sentenceVariant] : undefined;
        if (variant) {
          variants += 1;
        }
        const bare =
          check.status === 'partial' && !check.challenge && !variant && !definition?.clientSentence.partial;
        expect(titleForCheck(check), `${name} ${check.id}`).toBe(
          bare ? `${definition?.name}: partly in place` : clientSentenceFor(check)
        );
        expect(titleForCheck(check), `${name} ${check.id}`).not.toMatch(/is only partly in place:/);
      }
    }
    // seodesignchicago.com, tagteamdesign.com and visualwebz.com carry a variant sentence.
    expect(variants).toBeGreaterThan(0);
  });

  it('keeps only help lines that name an agentmarkup capability', () => {
    expect(isProductHelp('agentmarkup generates llms.txt at build time.')).toBe(true);
    expect(isProductHelp('The agentmarkup adapters inject the link.')).toBe(true);
    expect(isProductHelp('The checker lists the landmarks it found.')).toBe(false);
    expect(isProductHelp('Not measured by agentmarkup in this catalog version.')).toBe(false);
    expect(isProductHelp(undefined)).toBe(false);
    expect(isProductHelp('')).toBe(false);
  });
});

describe('fix list copy (8, 5.7, H8)', () => {
  const plan = (overrides: Partial<FixPlan>): FixPlan => ({
    all: [],
    primary: [],
    then: [],
    atCap: false,
    optionalOnly: false,
    ...overrides,
  });

  it('heads each variant of the fix list', () => {
    expect(fixHeading(fixPlan(FIXTURES['tagteamdesign.com']))).toEqual({
      title: 'Fix these first',
      note: 'Ranked by estimated gain on this score.',
    });
    // "Extras" is reserved for the bonus pool: a cap list with recommended rows is "still worth doing".
    expect(fixHeading(fixPlan(FIXTURES['animafelix.com']))).toEqual({
      title: 'Already at 100: still worth doing',
      note: 'These would add points above the cap.',
    });
    expect(fixHeading(fixPlan(FIXTURES['agentmarkup.dev'])).title).toBe('Already at 100');
    expect(fixHeading(plan({ atCap: true })).title).toBe('Already at 100');
    expect(fixHeading(plan({}))).toEqual({
      title: 'Fix these first',
      note: 'Every scored check passes. Nothing to fix.',
    });
  });

  it('lists each optional extra with its own gain and no summed figure', () => {
    const line = optionalExtrasLine(fixPlan(FIXTURES['agentmarkup.dev']));
    expect(line).toBe(
      '4 optional extras above the cap: Modular llms.txt +0.25 · Markdown frontmatter +0.25 · Sitemap freshness +0.25 · HTTP Link discovery headers +0.25'
    );
    expect(line).not.toContain('+1 ');
    expect(line).not.toMatch(/\+1(\.0+)?\b/);
  });

  it('states each check worth with the engine numbers (7.7 Points line)', () => {
    const formLabels = FIXTURES['tagteamdesign.com'].checks.find((check) => check.id === 'ax.form-labeling') as ScoredCheck;
    expect(creditLine(formLabels, FIXTURES['tagteamdesign.com'])).toBe(
      'Worth 8.89 of 100 points · required check · no credit'
    );
    for (const [name, , report] of SCORED) {
      for (const check of report.checks) {
        if (check.tier === 'bonus') {
          if (check.status === 'pass' || check.status === 'partial' || check.status === 'fail') {
            expect(creditLine(check, report), `${name} ${check.id}`).toBe('Bonus signal: adds up to 0.25, never subtracts');
          }
          continue;
        }
        if (check.status !== 'pass' && check.status !== 'partial' && check.status !== 'fail') {
          continue;
        }
        const credit =
          check.status === 'pass'
            ? 'full credit'
            : check.status === 'fail'
              ? 'no credit'
              : `${Math.round((check.fraction ?? 0) * 100)}% credit`;
        expect(creditLine(check, report), `${name} ${check.id}`).toBe(
          `Worth ${formatPoints(checkWorth(check, report), 2)} of 100 points · ${check.tier} check · ${credit}`
        );
      }
    }
  });
});

describe('partial, blocked and gated copy (5.8, 5.9, 5.10, H2, H4)', () => {
  it('puts the engine score next to the range as "with what answered"', () => {
    const report = SYNTHETIC.provisional;
    const info = partialInfo(report);
    expect(info).not.toBeNull();
    const count = report.unverifiedChecks.length;
    expect(count).toBeGreaterThan(1);
    expect(partialLine(info!, report)).toBe(
      `${report.score} with what answered. ${count} checks could not be checked in time and are left out until a rescan.`
    );
  });

  it('names the unread sample page when no check waited on it', () => {
    const report = SYNTHETIC.sampleTimedOut;
    expect(partialLine(partialInfo(report)!, report)).toBe(
      'Sample page could not be fetched in time, so the checks that read it were judged without it.'
    );
  });

  it('words every blocked row of 5.9', () => {
    const copy = (key: string) => {
      const { report, blocked } = blockedFor(BLOCKED_RESULTS[key]);
      return blockedCopy(blocked, HOST, report);
    };
    const timeout = {
      headline: 'No score yet',
      body: `${HOST} did not answer our checker within 10 seconds, so nothing was scored. A fetch that does not finish is never counted against a site.`,
    };
    expect(copy('Request timed out.')).toEqual(timeout);
    expect(copy('Checker time budget exhausted.')).toEqual(timeout);
    expect(copy('Checker request budget exhausted.')).toEqual({
      headline: 'No score yet',
      body: 'The checker ran out of its request budget before it reached the homepage, so nothing was scored. This is on our side and never counted against the site.',
    });
    expect(copy('Request failed.')).toEqual({
      headline: 'No score yet',
      body: `We could not connect to ${HOST} (DNS, TLS or a closed connection), so nothing was scored. This is never counted against a site.`,
    });
    expect(copy('Too many redirects.')).toEqual({
      headline: 'No score yet',
      body: 'The homepage kept redirecting (more than 5 hops), so the checker never reached a page. Open the site in a private window to see where it sends visitors.',
    });
    expect(copy('redirect loop away')).toEqual({
      headline: 'No score yet',
      body: 'The homepage kept redirecting (more than 5 hops, last stop loop.example.net), so the checker never reached a page. Open the site in a private window to see where it sends visitors.',
    });
    expect(copy('Redirect response had no Location header.')).toEqual({
      headline: 'No score yet',
      body: 'The homepage answered a redirect without a destination, so the checker never reached a page.',
    });
    expect(copy('Response exceeded the checker size limit.')).toEqual({
      headline: 'No score yet',
      body: 'The homepage is larger than 5 MB, so the checker stopped reading it and scored nothing.',
    });
    const safety = {
      headline: 'No score',
      body: 'This address leads to a private or local network address, which the checker does not visit.',
    };
    expect(copy('Request was blocked by checker safety rules.')).toEqual(safety);
    expect(copy('safety rule with a private target')).toEqual(safety);

    const http = blockedFor(RESULTS.homepage404);
    const httpCopy = blockedCopy(http.blocked, HOST, http.report);
    expect(httpCopy.headline).toBe('No score yet');
    expect(httpCopy.body).toBe(blockedExplanation('http-status', http.report.blockedReason));
    expect(httpCopy.body).toBe(
      'The homepage answered HTTP 404, so there is nothing to score yet. Make the site root serve a page, then run the check again.'
    );
    expect(httpCopy.body).not.toMatch(/in time|timed out|never counted against/i);
  });

  it('never blames the site for a transport failure (H4)', () => {
    for (const message of ['Request timed out.', 'Checker time budget exhausted.', 'Checker request budget exhausted.', 'Request failed.']) {
      const { report, blocked } = blockedFor(BLOCKED_RESULTS[message]);
      expect(blockedCopy(blocked, HOST, report).body, message).toMatch(/never counted against/);
    }
  });

  it('names the status a homepage answered instead of claiming a timeout (server-status row)', () => {
    const copy = (key: string) => {
      const { report, blocked } = blockedFor(BLOCKED_RESULTS[key]);
      expect(blocked.kind, key).toBe('server-status');
      return blockedCopy(blocked, HOST, report);
    };
    expect(copy('server-status 511')).toEqual({
      headline: 'No score yet',
      body: `${HOST} answered HTTP 511 instead of a page, so nothing was scored. A server error or a rate limit is never counted against a site. Scan again in a few minutes.`,
    });
    expect(copy('server-status 429')).toEqual({
      headline: 'No score yet',
      body: `${HOST} answered HTTP 429 instead of a page, so nothing was scored. A server error or a rate limit is never counted against a site. Scan again in a few minutes.`,
    });
    expect(copy('server-status 200 without a body')).toEqual({
      headline: 'No score yet',
      body: `${HOST} answered HTTP 200 without a readable page, so nothing was scored. This is never counted against a site. Scan again in a few minutes.`,
    });
    for (const key of ['server-status 511', 'server-status 429', 'server-status 200 without a body']) {
      expect(copy(key).body, key).not.toMatch(/within 10 seconds|in time|timed out/);
    }
  });

  it('falls back to the server-status row from blockedReason when no blocked case is passed', () => {
    const { report, blocked } = blockedFor(BLOCKED_RESULTS['server-status 511']);
    const expected = blockedCopy(blocked, HOST, report);
    expect(renderDeveloperBrief(report, { host: HOST, origin: BRIEF_ORIGIN })).toContain(`${expected.headline}. ${expected.body}`);
    expect(announceReport(report, HOST, null)).toBe(`No score for ${HOST}: ${expected.headline}. ${expected.body}`);
    expect(announceReport(report, HOST, blocked, { rescan: true })).toBe(`Report updated. No score for ${HOST}: ${expected.headline}. ${expected.body}`);
    // A real timeout still falls back to the timeout row.
    const timeout = blockedFor(RESULTS.blocked);
    expect(announceReport(timeout.report, HOST, null)).toContain('did not answer our checker within 10 seconds');
  });

  it('explains an answered status in the shared blocked explanation, keeping the timeout sentence for timeouts', () => {
    expect(blockedExplanation('unverified', 'homepage answered HTTP 511 without a usable page')).toBe(
      'The homepage answered HTTP 511 instead of a page, so there is no score yet. Re-run the check in a few minutes; a server error or a rate limit is never counted against a site.'
    );
    expect(blockedExplanation('unverified', 'homepage HTTP 200 with no readable body')).toBe(
      'The homepage answered HTTP 200 without a readable page, so there is no score yet. Re-run the check in a few minutes; this is never counted against a site.'
    );
    expect(blockedExplanation('unverified', 'homepage could not be verified in time (Request timed out)')).toBe(
      'The site could not be reached in time, so there is no score yet. Re-run the check; a timed-out fetch is never counted against a site.'
    );
    expect(blockedExplanation(null, null)).toContain('could not be reached in time');
  });

  it('counts the checks a bot wall kept out (5.10)', () => {
    const report = SYNTHETIC.gated;
    const info = gatedInfo(report);
    expect(info).not.toBeNull();
    const affected = report.naChecks.filter((entry) => entry.reason === 'homepage-blocked').length;
    expect(gatedNotice(info!, HOST)).toEqual({
      title: 'AI assistants are stopped at the door.',
      body: `When our checker asked for ${HOST} it got HTTP 403, challenge marker "cf-mitigated: challenge", instead of the page. ${affected} checks that need the homepage could not be judged and are left out of the score. Allow verified bots in your firewall or bot-protection settings, then scan again.`,
    });
  });
});

describe('announcements (9)', () => {
  it('announces a complete, a partial and a blocked report', () => {
    const failing = SYNTHETIC.failing;
    expect(announceReport(failing, HOST, null)).toBe(
      `Report ready for ${HOST}: score ${failing.score} of 100, grade ${failing.grade}, ${failing.label}.`
    );
    const partial = SYNTHETIC.failingProbe;
    expect(announceReport(partial, HOST, null)).toBe(
      `Provisional report for ${HOST}: score between ${partial.range?.pessimistic} and ${partial.range?.optimistic}.`
    );
    const { report, blocked } = blockedFor(RESULTS.blocked);
    const copy = blockedCopy(blocked, HOST, report);
    expect(announceReport(report, HOST, blocked)).toBe(`No score for ${HOST}: ${copy.headline}. ${copy.body}`);
  });
});

describe('change line (6.4)', () => {
  const earlier = score(siteCheck({ fetchedAt: '2026-10-30T10:00:00.000Z' }));
  const laterFailing = score(siteCheck({ ...FAILING_PARTS, fetchedAt: '2026-11-02T12:00:00.000Z' }));
  const laterSame = score(siteCheck({ fetchedAt: '2026-11-02T12:00:00.000Z' }));

  it('says down, up or no change since the last check in this browser', () => {
    const down = compareReports(earlier, laterFailing);
    expect(down.comparable).toBe(true);
    const drop = Math.abs(down.scoreDelta ?? 0);
    expect(drop).toBeGreaterThan(1);
    const changed = down.changedChecks.length;
    expect(changeLine(down, earlier)).toMatch(
      new RegExp(`^Down ${drop} points since .*2026.* \\(last check in this browser\\)\\. ${changed} checks? changed\\.$`)
    );

    const up = compareReports(laterFailing, laterSame);
    expect(changeLine(up, laterFailing)).toMatch(new RegExp(`^Up ${drop} points since .*2026.* \\(last check in this browser\\)\\.`));

    const same = compareReports(earlier, laterSame);
    expect(same.changedChecks).toEqual([]);
    expect(changeLine(same, earlier)).toMatch(/^No change since .*2026.* \(last check in this browser\)\.$/);
  });

  it('says nothing when the reports cannot be compared', () => {
    const otherCatalog: ScoreReport = { ...earlier, catalogVersion: '0.9.0' };
    const cmp = compareReports(otherCatalog, laterSame);
    expect(cmp.comparable).toBe(false);
    expect(changeLine(cmp, otherCatalog)).toBeNull();
  });
});

describe('developer brief (7.13, H6)', () => {
  it.each(SCORED)('lists every fail and partial check of %s with its rule link', (name, host, report) => {
    const brief = renderDeveloperBrief(report, { host, origin: BRIEF_ORIGIN });
    expect(brief.startsWith(`# Agent-readiness fixes for ${host}\n`), name).toBe(true);
    expect(brief).toContain(`Catalog ${report.catalogVersion}, formula ${report.formulaVersion}.`);
    const open = report.checks.filter((check) => check.status === 'fail' || check.status === 'partial');
    for (const check of open) {
      expect(brief, check.id).toContain(`(${check.id}, `);
      expect(brief, check.id).toContain(`Rule: ${BRIEF_ORIGIN}/score/#${check.id}`);
    }
    if (open.length > 0) {
      expect(brief).toContain('## Fix first');
      // The engine's top fixes come first, in its own order.
      const positions = rankTopFixes(report.checks, TOP_FIXES_LIMIT).map((check) => brief.indexOf(`(${check.id}, `));
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    }
    expect(brief).toContain(`Details: ${BRIEF_ORIGIN}/score/`);
    expect(brief).toContain(`not measured in catalog ${SCORE_CATALOG_VERSION}`);
  });

  it('gives a blocked run the title, headline and body only', () => {
    const { report, blocked } = blockedFor(RESULTS.blocked);
    const brief = renderDeveloperBrief(report, { host: HOST, origin: BRIEF_ORIGIN });
    const copy = blockedCopy(blocked, HOST, report);
    expect(brief).toContain(`# Agent-readiness fixes for ${HOST}`);
    expect(brief).toContain(copy.headline);
    expect(brief).toContain(copy.body);
    expect(brief).not.toContain('## Fix first');
    expect(brief).not.toMatch(/Score \d+\/100/);
  });
});

describe('plain hyphens and no jargon in any report string (12.3, H7)', () => {
  it('exported constants', () => {
    const constants = { GROUP_COPY, BAND, STATUS_WORDS, CHIP_LABELS, NA_REASON_COPY, PRODUCT_LINE };
    for (const [name, value] of Object.entries(constants)) {
      for (const entry of stringsIn(value)) {
        expectClean(name, entry);
      }
    }
  });

  it.each(SCORED)('outputs for %s', (name, host, report) => {
    const groups = groupReport(report);
    const plan = fixPlan(report);
    const outputs: string[] = [
      verdictSentence(report, groups, host) ?? '',
      ...stringsIn(fixHeading(plan)),
      optionalExtrasLine(plan),
      renderDeveloperBrief(report, { host, origin: BRIEF_ORIGIN }),
      announceReport(report, host, null),
      ...report.naChecks.map((entry) => naReason(entry.reason)),
      ...report.checks.map((check) => chipLabel(check.id)),
      ...report.checks
        .filter((check) => check.status === 'pass' || check.status === 'partial' || check.status === 'fail')
        .map((check) => creditLine(check, report)),
      ...report.checks.map((check) => titleForCheck(check)),
    ];
    const info = partialInfo(report);
    if (info) {
      outputs.push(partialLine(info, report));
    }
    const gated = gatedInfo(report);
    if (gated) {
      outputs.push(...stringsIn(gatedNotice(gated, host)));
    }
    for (const output of outputs) {
      expectClean(name, output);
    }
  });

  it('blocked outputs', () => {
    for (const [key, result] of Object.entries(BLOCKED_RESULTS)) {
      const { report, blocked } = blockedFor(result);
      for (const output of [
        ...stringsIn(blockedCopy(blocked, HOST, report)),
        announceReport(report, HOST, blocked),
        renderDeveloperBrief(report, { host: HOST, origin: BRIEF_ORIGIN }),
        verdictSentence(report, groupReport(report), HOST) ?? '',
      ]) {
        expectClean(key, output);
      }
    }
  });

  it('change lines', () => {
    const earlier = score(siteCheck({ fetchedAt: '2026-10-30T10:00:00.000Z' }));
    const later = score(siteCheck({ ...FAILING_PARTS, fetchedAt: '2026-11-02T12:00:00.000Z' }));
    for (const [previous, current] of [
      [earlier, later],
      [later, earlier],
      [earlier, earlier],
    ] as const) {
      expectClean('changeLine', changeLine(compareReports(previous, current), previous) ?? '');
    }
  });
});
