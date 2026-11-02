// Maps score-engine results onto the checker's `AuditItem` shape using the
// catalog's client copy. Nothing here is duplicated prose: titles are the
// catalog's client sentences, details are the evidence strings (counts, ids,
// URLs and header values only), actions and help lines come from the row.
import {
  catalogIndexOf,
  getCheckDefinition,
  type CheckDefinition,
  type CheckTier,
  type EvidenceResourceKey,
  type ScoreReport,
  type ScoredCheck,
  type SitePlatform,
} from '@agentmarkup/core/score';

import type { AuditItem, AuditLevel } from './types';

export const SCORE_METHODOLOGY_PATH = '/score/';

export const RESOURCE_LABELS: Readonly<Record<EvidenceResourceKey, string>> = {
  homepage: 'Homepage',
  homepageMarkdown: 'Homepage markdown mirror',
  llmsTxt: 'llms.txt',
  robotsTxt: 'robots.txt',
  sitemap: 'Sitemap',
  notFoundProbe: 'Missing-path probe',
  samplePage: 'Sample page',
  samplePageMarkdown: 'Sample page markdown mirror',
};

export const PLATFORM_LABELS: Readonly<Record<SitePlatform, string>> = {
  wordpress: 'WordPress',
  webflow: 'Webflow',
  squarespace: 'Squarespace',
  wix: 'Wix',
};

const TIER_LABELS: Readonly<Record<CheckTier, string>> = {
  required: 'required check',
  recommended: 'recommended check',
  bonus: 'bonus signal',
};

const LEVEL_WEIGHT: Readonly<Record<AuditLevel, number>> = {
  error: 0,
  warning: 1,
  pass: 2,
};

/**
 * Level rules: required fail is an error; a recommended or bonus fail and any
 * partial result is a warning; pass is pass; unverified is a warning (reported
 * per resource); `na` and `not-measured` are listed in the panel, not as items.
 * An upside-only bonus (`jsonld.syntax`, `ax.injection-safe`) never subtracts
 * from the score but a fail there is still shown as an error-level finding.
 */
export function levelForCheck(check: ScoredCheck): AuditLevel | null {
  const definition = getCheckDefinition(check.id);
  switch (check.status) {
    case 'pass':
      return 'pass';
    case 'partial':
      return 'warning';
    case 'fail':
      return check.tier === 'required' || definition?.upsideOnly ? 'error' : 'warning';
    case 'unverified':
      return 'warning';
    default:
      return null;
  }
}

/** The resource a check's decision hinges on (the first it reads). */
export function primaryResource(check: ScoredCheck): EvidenceResourceKey {
  return check.resources?.[0] ?? 'homepage';
}

export function platformFixFor(
  definition: CheckDefinition | undefined,
  platform: SitePlatform | null
): string | null {
  if (!definition || !platform || platform === 'wix') {
    return null;
  }
  const fix = definition.fixes[platform];
  if (!fix || fix === 'same') {
    return null;
  }
  return `${PLATFORM_LABELS[platform]}: ${fix}`;
}

function creditLabel(check: ScoredCheck): string {
  if (check.status === 'pass') {
    return 'full credit';
  }
  if (check.status === 'partial' && check.fraction !== null) {
    return `${Math.round(check.fraction * 100)}% credit`;
  }
  return 'no credit';
}

function gainSentence(check: ScoredCheck): string {
  if (check.estGain === null || check.estGain <= 0) {
    return '';
  }
  return ` Estimated gain: ${check.estGain} point${check.estGain === 1 ? '' : 's'}.`;
}

/** One finding for a scored (pass, partial or fail) check; null for anything else. */
export function auditItemForCheck(check: ScoredCheck): AuditItem | null {
  const level = levelForCheck(check);
  if (!level || check.status === 'unverified') {
    return null;
  }
  const definition = getCheckDefinition(check.id);
  const name = definition?.name ?? check.id;
  const sentence =
    check.status === 'pass' ? definition?.clientSentence.pass : definition?.clientSentence.fail;
  return {
    id: check.id,
    checkId: check.id,
    level,
    title: sentence ?? name,
    detail: `${name} (${TIER_LABELS[check.tier]}, ${creditLabel(check)}): ${check.evidence}.${gainSentence(check)}`,
    action:
      check.status === 'pass'
        ? 'No change needed. Keep it this way when the site changes.'
        : definition?.action ?? 'See the score methodology for this check.',
    docUrl: definition?.docUrl ?? SCORE_METHODOLOGY_PATH,
    agentmarkupHelp: definition?.agentmarkupHelp,
  };
}

/**
 * One warning per resource whose fetch did not complete. A transport failure is
 * never a finding against the site: the checks that read the resource leave the
 * denominator and the item says so. A sitemap declared in robots.txt keeps the
 * declaration in its evidence.
 */
export function auditItemForUnverified(
  resource: EvidenceResourceKey,
  checks: ScoredCheck[]
): AuditItem {
  const label = RESOURCE_LABELS[resource];
  const names = checks.map((check) => getCheckDefinition(check.id)?.name ?? check.id);
  const evidence = checks[0]?.evidence ?? '';
  return {
    id: `unverified-${resource}`,
    level: 'warning',
    title: `${label} could not be verified in time`,
    detail: `${evidence ? `${evidence}. ` : ''}${names.length === 1 ? 'The check waiting on it' : `The ${names.length} checks waiting on it`} (${names.join(', ')}) left the score's denominator, so this reading is provisional and was not cached.`,
    action: `Re-run the check. If it repeats, confirm by hand that ${label.toLowerCase()} answers within a few seconds.`,
    docUrl: `${SCORE_METHODOLOGY_PATH}#statuses`,
    agentmarkupHelp:
      'agentmarkup never counts a timed-out or failed fetch against a site; only completed responses are judged.',
  };
}

function compareItems(left: AuditItem, right: AuditItem, gains: Map<string, number>): number {
  const weightDiff = LEVEL_WEIGHT[left.level] - LEVEL_WEIGHT[right.level];
  if (weightDiff !== 0) {
    return weightDiff;
  }
  const gainDiff = (gains.get(right.id) ?? -1) - (gains.get(left.id) ?? -1);
  if (gainDiff !== 0) {
    return gainDiff;
  }
  const catalogDiff = catalogIndexOf(left.checkId ?? '') - catalogIndexOf(right.checkId ?? '');
  if (catalogDiff !== 0) {
    return catalogDiff;
  }
  return left.id.localeCompare(right.id);
}

/**
 * Every finding for a report: scored checks as items, unverified checks grouped
 * by resource, ordered by level, then estimated gain, then catalog order.
 */
export function auditItemsForReport(report: ScoreReport): AuditItem[] {
  const items: AuditItem[] = [];
  const gains = new Map<string, number>();
  const unverified = new Map<EvidenceResourceKey, ScoredCheck[]>();

  for (const check of report.checks) {
    if (check.status === 'unverified') {
      const resource = primaryResource(check);
      const list = unverified.get(resource) ?? [];
      list.push(check);
      unverified.set(resource, list);
      continue;
    }
    const item = auditItemForCheck(check);
    if (item) {
      items.push(item);
      gains.set(item.id, check.estGain ?? -1);
    }
  }

  for (const [resource, checks] of unverified) {
    items.push(auditItemForUnverified(resource, checks));
  }

  return items.sort((left, right) => compareItems(left, right, gains));
}

/** React key for a finding: the check id, never the title plus an index. */
export function findingKey(item: AuditItem): string {
  return item.id;
}
