import { describe, expect, it } from 'vitest';
import {
  IDENTITY_TYPES,
  SCORE_CATALOG,
  SCORE_CATALOG_VERSION,
  catalogChecksForTier,
  catalogIndexOf,
  getCheckDefinition,
  implementedChecks,
} from '../../src/score/catalog.js';
import { EVALUATORS } from '../../src/score/evaluate.js';
import { SCORE_FORMULA_VERSION } from '../../src/score/formula.js';

const SEMVER = /^\d+\.\d+\.\d+$/;
const DASHES = /[–—]/;

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((entry) => strings(entry, out));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((entry) => strings(entry, out));
  }
  return out;
}

describe('SCORE_CATALOG v1.0.0', () => {
  it('has semver versions', () => {
    expect(SCORE_CATALOG_VERSION).toBe('1.0.0');
    expect(SCORE_CATALOG_VERSION).toMatch(SEMVER);
    expect(SCORE_FORMULA_VERSION).toMatch(SEMVER);
  });

  it('has unique dotted ids', () => {
    const ids = SCORE_CATALOG.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
    expect(new Set(IDENTITY_TYPES).size).toBe(IDENTITY_TYPES.length);
  });

  it('has an evaluator for every implemented id and vice versa', () => {
    const implemented = implementedChecks().map((definition) => definition.id).sort();
    const evaluators = Object.keys(EVALUATORS).sort();
    expect(evaluators).toEqual(implemented);
    for (const definition of SCORE_CATALOG) {
      if (definition.availability !== 'now') {
        expect(EVALUATORS[definition.id]).toBeUndefined();
      }
    }
  });

  it('counts 9 required, 10 recommended and 15 bonus implementable checks plus the later rows', () => {
    const now = (tier: 'required' | 'recommended' | 'bonus') =>
      catalogChecksForTier(tier).filter((definition) => definition.availability === 'now').length;
    expect(now('required')).toBe(9);
    expect(now('recommended')).toBe(10);
    expect(now('bonus')).toBe(15);
    expect(catalogChecksForTier('required')).toHaveLength(13);
    expect(catalogChecksForTier('recommended')).toHaveLength(15);
    expect(catalogChecksForTier('bonus')).toHaveLength(20);
    expect(SCORE_CATALOG).toHaveLength(48);
    const catalog20 = SCORE_CATALOG.filter((definition) => definition.availability === 'catalog-2.0').map((d) => d.id);
    expect(catalog20).toEqual(['reach.agent-ua', 'content.markdown-negotiation', 'markdown.agent-ua']);
  });

  it('carries client copy, an action, three platform fixes, a doc URL and help on every row', () => {
    for (const definition of SCORE_CATALOG) {
      expect(definition.clientSentence.pass.length).toBeGreaterThan(10);
      expect(definition.clientSentence.fail.length).toBeGreaterThan(10);
      expect(definition.action.length).toBeGreaterThan(5);
      expect(definition.fixes.wordpress.length).toBeGreaterThan(0);
      expect(definition.fixes.webflow.length).toBeGreaterThan(0);
      expect(definition.fixes.squarespace.length).toBeGreaterThan(0);
      expect(definition.docUrl).toBe(`https://agentmarkup.dev/score/#${definition.id}`);
      expect(definition.agentmarkupHelp.length).toBeGreaterThan(5);
      expect(definition.rule.length).toBeGreaterThan(10);
      expect(definition.applicability.length).toBeGreaterThan(3);
      expect(definition.evidence.length).toBeGreaterThan(3);
    }
  });

  it('uses plain hyphens only (no em or en dashes) in any catalog string', () => {
    for (const text of strings(SCORE_CATALOG)) {
      expect(text).not.toMatch(DASHES);
    }
  });

  it('marks the surfaces that keep SMB denominators honest', () => {
    expect(getCheckDefinition('api.required-group')?.surface).toBe('api');
    expect(getCheckDefinition('mcp.required-group')?.surface).toBe('mcp');
    expect(getCheckDefinition('commerce.pricing-info')?.surface).toBe('commerce');
    expect(getCheckDefinition('search.developer-resources')?.surface).toBe('api');
    expect(getCheckDefinition('jsonld.syntax')?.upsideOnly).toBe(true);
    expect(getCheckDefinition('ax.injection-safe')?.upsideOnly).toBe(true);
  });

  it('keeps catalog order for ranking ties', () => {
    expect(catalogIndexOf('reach.bot-detection')).toBe(0);
    expect(catalogIndexOf('content.no-js')).toBe(1);
    expect(catalogIndexOf('nope.unknown')).toBe(Number.MAX_SAFE_INTEGER);
    expect(getCheckDefinition('nope.unknown')).toBeUndefined();
  });
});
