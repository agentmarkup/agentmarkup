// The one calibration point: Ora's Essentials audit of agentmarkup.dev (contractVersion
// 1.38.0, scanned 2026-10-10). Mapped checks must agree in pass/non-pass direction unless a
// documented difference says why; the headline must land within 2 points. The other six
// panel sites have no Ora audit, so this harness claims nothing about them.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SCORE_CATALOG, getCheckDefinition } from '../../src/score/catalog.js';
import { evaluateSiteChecks } from '../../src/score/evaluate.js';
import { scoreChecks } from '../../src/score/formula.js';
import type { SiteEvidence } from '../../src/score/types.js';

interface OraEntry {
  tier: string;
  bonus: boolean;
  fraction: number | null;
  occurrences: number;
  essentialsGain: number | null;
}

interface OraFixture {
  contractVersion: string;
  scannedAt: string;
  domain: string;
  layeredScore: { score: number; grade: string };
  essentials: {
    score: number;
    required: { earned: number; passing: number; total: number };
    recommended: { earned: number; passing: number; total: number };
    bonusPoints: number;
    bonusSignals: number;
    checks: Record<string, OraEntry>;
  };
}

const dir = fileURLToPath(new URL('../fixtures/score/', import.meta.url));
const ora = JSON.parse(readFileSync(`${dir}ora-agentmarkup.dev.json`, 'utf8')) as OraFixture;
const evidence = JSON.parse(readFileSync(`${dir}agentmarkup.dev.json`, 'utf8')) as SiteEvidence;
const report = scoreChecks(evaluateSiteChecks(evidence));

/**
 * Documented differences: our check passes while Ora's counterpart does not (or the other
 * way round). Each needs a reason; a stale entry (no longer a disagreement) fails too.
 */
const DOCUMENTED_DIFFERENCES: Record<string, string> = {
  'llms.modular':
    'Ora scores modular-llms-txt 0 although llms.txt links llms-full.txt; its rule is unpublished and stricter. Ours credits a link to llms-full.txt or another /llms.txt (catalog row llms.modular).',
  'jsonld.same-as':
    'Ora gives json-ld-entity-linking half credit with 8 absolute sameAs URLs (rule unpublished, likely wants specific registries). Ours credits >= 2 absolute http(s) URLs.',
  'jsonld.type-breadth':
    'Ora gives schema-type-breadth half credit with FAQPage and SoftwareApplication beyond the baseline set (thresholds unpublished). Ours credits >= 2 extra types.',
};

/** Ora ids that this catalog maps but that Ora left out of its own audit export. */
const ABSENT_FROM_ORA_EXPORT = ['noindex-directives', 'pricing-info', 'mcp-server'];

function oraIdsOf(ourId: string): string[] {
  const counterpart = getCheckDefinition(ourId)?.oraCounterpart ?? '';
  return counterpart.split(/[\s,]+/).filter((token) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(token));
}

describe('Ora comparison on agentmarkup.dev', () => {
  it('cites the fixture provenance', () => {
    expect(ora.contractVersion).toBe('1.38.0');
    expect(ora.scannedAt.startsWith('2026-10-10')).toBe(true);
    expect(ora.domain).toBe('agentmarkup.dev');
    expect(evidence.targetUrl).toBe('https://agentmarkup.dev/');
  });

  it('matches the Essentials headline within 2 points (the layered 76 B is a different lens)', () => {
    expect(report.analysisStatus).toBe('complete');
    expect(report.score).not.toBeNull();
    expect(Math.abs((report.score ?? 0) - ora.essentials.score)).toBeLessThanOrEqual(2);
    expect(report.score).toBe(100);
    expect(ora.essentials.score).toBe(100);
    expect(ora.layeredScore).toMatchObject({ score: 76, grade: 'B' });
    expect(report.grade).toBe('A+');
  });

  it('agrees in pass/non-pass direction on every mapped check except the documented differences', () => {
    const disagreements: Record<string, string> = {};
    const compared: string[] = [];
    const absent: string[] = [];
    for (const check of report.checks) {
      const definition = getCheckDefinition(check.id);
      if (!definition || definition.availability !== 'now') {
        continue;
      }
      if (check.status === 'na' || check.status === 'unverified' || check.status === 'not-measured') {
        continue;
      }
      const candidates = oraIdsOf(check.id);
      const oraId = candidates.find((id) => id in ora.essentials.checks);
      if (!oraId) {
        if (candidates.length > 0) {
          absent.push(check.id);
        }
        continue;
      }
      compared.push(check.id);
      const oraEntry = ora.essentials.checks[oraId];
      const oursPass = check.status === 'pass';
      const oraPass = oraEntry.fraction === 1;
      if (oursPass !== oraPass) {
        disagreements[check.id] = `${check.id} ${check.status} ${check.fraction} vs Ora ${oraId} ${oraEntry.fraction}`;
      }
    }
    expect(compared.length).toBeGreaterThanOrEqual(28);
    expect(compared).toEqual(expect.arrayContaining([
      'reach.bot-detection',
      'content.no-js',
      'content.auth-gate',
      'nav.redirect-hygiene',
      'nav.not-found',
      'ax.document-structure',
      'ax.native-controls',
      'ax.accessible-names',
      'ax.form-labeling',
      'meta.completeness',
      'jsonld.identity',
      'jsonld.org-completeness',
      'sitemap.valid',
      'trust.anchors',
      'content.token-budget',
      'llms.agent-instruction',
      'markdown.code-fences',
      'llms.exists',
      'llms.formatting',
      'markdown.url-fallback',
      'markdown.alternate-link',
      'markdown.frontmatter',
      'sitemap.lastmod',
      'link.headers-discovery',
      'ax.injection-safe',
      'nav.not-found-markdown',
    ]));
    // Ora's own catalog drifted between the audit and its export (spec section 9.3).
    expect(absent).toEqual(['meta.noindex', 'robots.ai-search-access']);
    for (const id of ABSENT_FROM_ORA_EXPORT) {
      expect(ora.essentials.checks[id]).toBeUndefined();
    }
    expect(Object.keys(disagreements).sort()).toEqual(Object.keys(DOCUMENTED_DIFFERENCES).sort());
    for (const [id, reason] of Object.entries(DOCUMENTED_DIFFERENCES)) {
      expect(reason.length).toBeGreaterThan(40);
      expect(disagreements[id]).toBeDefined();
    }
  });

  it('lists the Ora checks this catalog does not measure instead of pretending to score them', () => {
    expect(report.notMeasured).toEqual(expect.arrayContaining([
      'reach.agent-ua',
      'content.markdown-negotiation',
      'search.brand-accuracy',
      'markdown.agent-ua',
      'a2a.agent-card',
    ]));
    for (const id of report.notMeasured) {
      const definition = getCheckDefinition(id);
      expect(definition?.availability).not.toBe('now');
    }
    const laterRows = SCORE_CATALOG.filter((definition) => definition.availability !== 'now');
    expect(laterRows.length).toBeGreaterThanOrEqual(14);
    // The two catalog-2.0 required rows are the ones Ora scores as required on this site.
    expect(ora.essentials.checks['agent-crawler-reachability']?.tier).toBe('required');
    expect(ora.essentials.checks['markdown-negotiation-vary']?.tier).toBe('required');
  });

  it('shares the published divergence on real 404s: both sides pass agentmarkup.dev', () => {
    const notFound = report.checks.find((check) => check.id === 'nav.not-found');
    expect(notFound?.status).toBe('pass');
    expect(ora.essentials.checks['agent-friendly-404'].fraction).toBe(1);
    expect(report.checks.find((check) => check.id === 'nav.not-found-markdown')?.status).toBe('pass');
  });
});
