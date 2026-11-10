// Every word the checker report says (spec 2026-11-09, sections 5.7 to 5.10, 6.6,
// 7.1, 7.5, 7.7, 7.10, 7.11, 7.13 and 9).
//
// Pure and deterministic: no LLM, no randomness, no free text except the host and
// the catalog's own names, sentences and evidence. Every number printed here is a
// report field (score, grade, range, estGain, tier totals, counts) or a published
// per-check worth from `report-model.ts`; no gain sums anywhere (H8).
// Plain hyphens only in user-visible strings; the product name is lowercase.
import {
  BONUS_PER_SIGNAL,
  POOLS,
  TOP_FIXES_LIMIT,
  catalogIndexOf,
  fixActionFor,
  getCheckDefinition,
  gradeFor,
  platformFixesApply,
  rankTopFixes,
  unverifiedResourcesWithoutChecks,
  type CheckBucket,
  type CheckTier,
  type Grade,
  type ReportComparison,
  type ScoreReport,
  type ScoredCheck,
} from '@agentmarkup/core/score';

import { blockedExplanation } from '../ui/status-model';
import { RESOURCE_LABELS, SCORE_METHODOLOGY_PATH, platformFixFor } from './check-copy';
import {
  blocked as blockedRow,
  blockedReasonStatus,
  checkWorth,
  formatPoints,
  gatedInfo,
  type BlockedCase,
  type CheckDisplayStatus,
  type FixPlan,
  type GatedInfo,
  type GroupSummary,
  type PartialInfo,
} from './report-model';

const SCORE_CEILING = POOLS.required + POOLS.recommended;

// ---------------------------------------------------------------------------
// Groups (7.1), verdict bands (6.6), status words and chips (7.5)

export interface GroupCopy {
  /** Area bar label. */
  label: string;
  /** Group row question (also the `/score/` Goal column). */
  question: string;
  /** Noun used inside the verdict sentence. */
  noun: string;
}

export const GROUP_COPY: Readonly<Record<CheckBucket, GroupCopy>> = {
  reachability: { label: 'Access', question: 'Can AI assistants get in?', noun: 'access' },
  content: { label: 'Content', question: 'Can they read your pages?', noun: 'readable content' },
  controls: {
    label: 'Controls',
    question: 'Can they use your buttons, links and forms?',
    noun: 'usable controls',
  },
  navigation: {
    label: 'Navigation',
    question: 'Do links and missing pages behave?',
    noun: 'navigation',
  },
  identity: { label: 'Identity', question: 'Do they know who you are?', noun: 'business identity' },
  discovery: {
    label: 'Discovery',
    question: 'Can they find your sitemap and AI guide files?',
    noun: 'AI guide files',
  },
};

export const BAND: Readonly<Record<Grade, string>> = {
  'A+': 'is ready for AI assistants',
  A: 'is in strong shape for AI assistants',
  B: 'is readable by AI assistants with a few gaps',
  C: 'is only partly readable by AI assistants',
  D: 'is hard for AI assistants to use',
  F: 'is not usable by AI assistants yet',
};

export const STATUS_WORDS: Readonly<Record<CheckDisplayStatus, string>> = {
  'fail-action': 'Needs fixing',
  'fail-attention': 'Needs fixing',
  partial: 'Partly in place',
  pass: 'In place',
  unverified: 'Not checked in time',
  na: "Doesn't apply",
  'not-measured': 'Not measured yet',
};

export const TIER_WORDS: Readonly<Record<CheckTier, string>> = {
  required: 'Required',
  recommended: 'Recommended',
  bonus: 'Bonus',
};

/** One short chip label per measured check (catalog 1.0.0, `availability === 'now'`). */
export const CHIP_LABELS: Readonly<Record<string, string>> = {
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
  'nav.not-found-markdown': '404 body',
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
};

/** The chip label for a check; the catalog name when no short label exists. */
export function chipLabel(id: string): string {
  return CHIP_LABELS[id] ?? getCheckDefinition(id)?.name ?? id;
}

/** The catalog name of a check, or its id outside the catalog. */
function checkName(id: string): string {
  return getCheckDefinition(id)?.name ?? id;
}

// ---------------------------------------------------------------------------
// Not-scored reasons (7.10)

/** Human reason for every `na` code the engine emits; never prints a raw code. */
export const NA_REASON_COPY: Readonly<Record<string, string>> = {
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
  // Codes the engine also emits (verified in packages/core/src/score/evaluators).
  'not-found-not-passing': 'Only applies once missing pages return a real 404',
  'identity-is-person': 'The site presents a person, not a business',
  'sitemap-index': 'The sitemap is an index of other sitemaps, which are not fetched',
  'sitemap-not-xml': 'The sitemap is not an XML list of pages',
  'not-applicable': 'Does not apply to this site',
};

const NA_FALLBACK = 'Does not apply to this site';

/** The human reason for an `na` code; unknown codes fall back, never print. */
export function naReason(code: string | null | undefined): string {
  if (!code) {
    return NA_FALLBACK;
  }
  const copy = NA_REASON_COPY[code];
  if (copy) {
    return copy;
  }
  const status = code.match(/^homepage-http-(\d{3})$/)?.[1];
  if (status) {
    return `The homepage answered HTTP ${status}`;
  }
  return NA_FALLBACK;
}

// ---------------------------------------------------------------------------
// Small helpers

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function joinWithAnd(parts: string[]): string {
  if (parts.length <= 1) {
    return parts.join('');
  }
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function withoutFinalPeriod(text: string): string {
  return text.trim().replace(/\.+$/, '');
}

/** The grade a partial run's band phrase uses: the pessimistic end (H13). */
function verdictGrade(report: ScoreReport): Grade | null {
  if (report.analysisStatus === 'partial' && report.range) {
    return gradeFor(report.range.pessimistic);
  }
  return report.grade;
}

// ---------------------------------------------------------------------------
// Verdict sentence (6.6)

function gatedSentence(gated: GatedInfo, host: string): string {
  const detail = [gated.status !== null ? `HTTP ${gated.status}` : null, gated.marker ? 'bot check' : null]
    .filter((part): part is string => part !== null)
    .join(' ');
  const count = gated.affected;
  return `${host} turns AI assistants away at the door${detail ? ` (${detail})` : ''}, so ${count} ${plural(count, 'check that needs', 'checks that need')} the homepage could not run and ${plural(count, 'is', 'are')} left out of the score.`;
}

/**
 * The one client sentence under the score. Null for a blocked run (the blocked
 * headline and body replace it). Deterministic rule, section 6.6.
 */
export function verdictSentence(
  report: ScoreReport,
  groups: GroupSummary[],
  host: string
): string | null {
  if (report.analysisStatus === 'blocked' || report.score === null) {
    return null;
  }
  const grade = verdictGrade(report);
  if (!grade) {
    return null;
  }

  let sentence: string;
  const gated = gatedInfo(report);
  if (gated) {
    sentence = gatedSentence(gated, host);
  } else {
    const lead = `${host} ${BAND[grade]}`;
    const ordered = [...groups].sort((left, right) => left.order - right.order);
    const inPlace = ordered.filter((group) => group.stake > 0 && group.inPlace).map((group) => GROUP_COPY[group.bucket].noun);
    let inPlaceClause = '';
    if (inPlace.length >= 4) {
      inPlaceClause = `${inPlace[0]}, ${inPlace[1]} and ${inPlace.length - 2} more areas are in place`;
    } else if (inPlace.length > 0) {
      inPlaceClause = `${joinWithAnd(inPlace)} ${inPlace.length === 1 ? 'is' : 'are'} in place`;
    }

    const top = rankTopFixes(report.checks, TOP_FIXES_LIMIT)[0];
    const topBucket = top ? getCheckDefinition(top.id)?.bucket : undefined;
    let gapClause: string;
    let joiner: string;
    let topClause: string | null = null;
    if (!top) {
      gapClause = 'every scored check passes';
      joiner = ', and ';
    } else if (report.score >= SCORE_CEILING) {
      gapClause = `the remaining gains sit above the ${SCORE_CEILING} cap`;
      joiner = ', and ';
    } else {
      const noun = topBucket ? GROUP_COPY[topBucket].noun : 'one area';
      topClause = `${noun} (${checkName(top.id)}, +${top.estGain ?? 0} points)`;
      gapClause = `the biggest gain is in ${topClause}`;
      joiner = ', but ';
    }

    if (inPlaceClause) {
      sentence = `${lead}: ${inPlaceClause}${joiner}${gapClause}.`;
    } else if (topClause) {
      sentence = `${lead}: ${capitalizeFirst(`start with ${topClause}`)}.`;
    } else {
      sentence = `${lead}: ${gapClause}.`;
    }
  }

  if (report.analysisStatus === 'partial') {
    const unverified = report.unverifiedChecks.length;
    const tail =
      unverified > 0
        ? ` ${unverified} ${plural(unverified, 'check', 'checks')} could not be checked in time.`
        : ' Some files could not be fetched in time.';
    sentence = `Provisional: ${sentence}${tail}`;
  }
  return sentence;
}

// ---------------------------------------------------------------------------
// Partial line (5.8)

/**
 * The line under a provisional score. With unverified checks: `74 with what
 * answered. 2 checks could not be checked in time and are left out until a
 * rescan.` Resource-only (range collapses to one number): `Sample page could not
 * be fetched in time, so the checks that read it were judged without it.`
 */
export function partialLine(info: PartialInfo, report: ScoreReport): string {
  if (info.low === info.high && info.unverified === 0) {
    const labels = info.resourceLabels;
    if (labels.length === 0) {
      return 'Some files could not be fetched in time, so the checks that read them were judged without them.';
    }
    const pronoun = labels.length === 1 ? 'it' : 'them';
    return `${joinWithAnd(labels)} could not be fetched in time, so the checks that read ${pronoun} were judged without ${pronoun}.`;
  }
  const answered = report.score !== null ? `${report.score} with what answered. ` : '';
  const count = info.unverified;
  if (count === 0) {
    return `${answered}Some files could not be fetched in time and the score is provisional until a rescan.`;
  }
  return `${answered}${count} ${plural(count, 'check', 'checks')} could not be checked in time and ${plural(count, 'is', 'are')} left out until a rescan.`;
}

// ---------------------------------------------------------------------------
// Blocked (5.9) and gated (5.10)

/** Headline and body for a blocked run, row by row from section 5.9. */
export function blockedCopy(
  blocked: BlockedCase,
  host: string,
  report: ScoreReport
): { headline: string; body: string } {
  switch (blocked.kind) {
    case 'budget':
      return {
        headline: 'No score yet',
        body: 'The checker ran out of its request budget before it reached the homepage, so nothing was scored. This is on our side and never counted against the site.',
      };
    case 'connection':
      return {
        headline: 'No score yet',
        body: `We could not connect to ${host} (DNS, TLS or a closed connection), so nothing was scored. This is never counted against a site.`,
      };
    case 'redirect-loop':
      if (blocked.detail === 'no-location') {
        return {
          headline: 'No score yet',
          body: 'The homepage answered a redirect without a destination, so the checker never reached a page.',
        };
      }
      return {
        headline: 'No score yet',
        body: `The homepage kept redirecting (more than 5 hops${blocked.lastHopHost ? `, last stop ${blocked.lastHopHost}` : ''}), so the checker never reached a page. Open the site in a private window to see where it sends visitors.`,
      };
    case 'size-limit':
      return {
        headline: 'No score yet',
        body: 'The homepage is larger than 5 MB, so the checker stopped reading it and scored nothing.',
      };
    case 'safety-rule':
      return {
        headline: 'No score',
        body: 'This address leads to a private or local network address, which the checker does not visit.',
      };
    case 'http-status':
      return {
        headline: 'No score yet',
        body: blockedExplanation('http-status', report.blockedReason),
      };
    case 'server-status': {
      const code = blocked.httpStatus;
      if (code !== null && code >= 200 && code < 300) {
        return {
          headline: 'No score yet',
          body: `${host} answered HTTP ${code} without a readable page, so nothing was scored. This is never counted against a site. Scan again in a few minutes.`,
        };
      }
      return {
        headline: 'No score yet',
        body: `${host} answered ${code !== null ? `HTTP ${code}` : 'an error status'} instead of a page, so nothing was scored. A server error or a rate limit is never counted against a site. Scan again in a few minutes.`,
      };
    }
    case 'timeout':
    default:
      return {
        headline: 'No score yet',
        body: `${host} did not answer our checker within 10 seconds, so nothing was scored. A fetch that does not finish is never counted against a site.`,
      };
  }
}

/** The red notice above the sentence when the homepage turned the checker away (5.10). */
export function gatedNotice(gated: GatedInfo, host: string): { title: string; body: string } {
  const count = gated.affected;
  const answer = withoutFinalPeriod(gated.evidence);
  return {
    title: 'AI assistants are stopped at the door.',
    body: `When our checker asked for ${host} it got ${answer || 'a bot check'}, instead of the page. ${count} ${plural(count, 'check that needs', 'checks that need')} the homepage could not be judged and ${plural(count, 'is', 'are')} left out of the score. Allow verified bots in your firewall or bot-protection settings, then scan again.`,
  };
}

// ---------------------------------------------------------------------------
// Fix list (5.7, 8)

/** Heading and note above the fix list. */
export function fixHeading(plan: FixPlan): { title: string; note: string | null } {
  if (plan.atCap) {
    if (plan.all.length === 0) {
      return { title: `Already at ${SCORE_CEILING}`, note: 'Every scored check passes. Nothing to fix.' };
    }
    if (plan.optionalOnly) {
      return { title: `Already at ${SCORE_CEILING}`, note: null };
    }
    // "Extras" is reserved for the bonus pool; these rows include recommended checks.
    return {
      title: `Already at ${SCORE_CEILING}: still worth doing`,
      note: 'These would add points above the cap.',
    };
  }
  if (plan.all.length === 0) {
    return { title: 'Fix these first', note: 'Every scored check passes. Nothing to fix.' };
  }
  return { title: 'Fix these first', note: 'Ranked by estimated gain on this score.' };
}

/** The gain of one ranked fix as shown in the list: `+8.9 pts`, or `+1.1 above 100` at the cap. */
export function fixGainLabel(check: ScoredCheck, atCap: boolean): string {
  const gain = check.estGain ?? 0;
  return atCap ? `+${gain} above ${SCORE_CEILING}` : `+${gain} pts`;
}

/**
 * The one line that replaces the list when every ranked fix at the cap is a bonus
 * signal: each gain listed separately, never summed (H8).
 */
export function optionalExtrasLine(plan: FixPlan): string {
  const count = plan.all.length;
  const items = plan.all.map((check) => `${checkName(check.id)} +${check.estGain ?? 0}`).join(' · ');
  return `${count} optional ${plural(count, 'extra', 'extras')} above the cap: ${items}`;
}

// ---------------------------------------------------------------------------
// Check line (7.7)

/** The Points fact of a check line: its published worth and the credit it earned. */
export function creditLine(check: ScoredCheck, report: ScoreReport): string {
  if (check.status === 'unverified') {
    return 'Not checked in time · left out of the score until a rescan';
  }
  if (check.status === 'na') {
    return "Doesn't apply to this site · left out of the score";
  }
  if (check.status === 'not-measured') {
    return 'Not measured yet · left out of the score';
  }
  if (check.tier === 'bonus') {
    return `Bonus signal: adds up to ${BONUS_PER_SIGNAL}, never subtracts`;
  }
  let credit: string;
  if (check.status === 'pass') {
    credit = 'full credit';
  } else if (check.status === 'partial' && check.fraction !== null) {
    // A partial result never reads as 0% or 100% (H9).
    credit = `${Math.min(99, Math.max(1, Math.round(check.fraction * 100)))}% credit`;
  } else {
    credit = 'no credit';
  }
  return `Worth ${formatPoints(checkWorth(check, report), 2)} of ${SCORE_CEILING} points · ${check.tier} check · ${credit}`;
}

// ---------------------------------------------------------------------------
// Change line (6.4)

function formatDay(iso: string | null): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  // Rendered only after mount (the report view never prerenders), so a locale read is hydration-safe.
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

/** `Up 6 points since 12 Oct 2026 (last check in this browser).`, or null when not comparable. */
export function changeLine(cmp: ReportComparison, previous: ScoreReport): string | null {
  if (!cmp.comparable || cmp.scoreDelta === null) {
    return null;
  }
  const day = formatDay(previous.fetchedAt);
  const since = day ? `since ${day} (last check in this browser).` : 'since the last check in this browser.';
  const delta = cmp.scoreDelta;
  const size = Math.abs(delta);
  const head =
    delta > 0
      ? `Up ${size} ${plural(size, 'point', 'points')} ${since}`
      : delta < 0
        ? `Down ${size} ${plural(size, 'point', 'points')} ${since}`
        : `No change ${since}`;
  const changed = cmp.changedChecks.length;
  return changed > 0 ? `${head} ${changed} ${plural(changed, 'check', 'checks')} changed.` : head;
}

// ---------------------------------------------------------------------------
// Developer brief (7.13)

export interface DeveloperBriefOptions {
  host: string;
  /** `location.origin`; rule links are absolute so the brief works when pasted elsewhere. */
  origin: string;
  /**
   * The blocked case from `blockedCase(report, result)` (needs the worker response).
   * Without it a blocked brief falls back to the http-status row, the server-status
   * row (the reason carries the HTTP status the homepage answered) or the timeout row.
   */
  blocked?: BlockedCase | null;
}

function fallbackBlockedCase(report: ScoreReport): BlockedCase {
  const status = blockedReasonStatus(report);
  if (report.blockedKind === 'http-status') {
    return blockedRow('http-status', { httpStatus: status });
  }
  return status !== null ? blockedRow('server-status', { httpStatus: status }) : blockedRow('timeout');
}

function compareRest(left: ScoredCheck, right: ScoredCheck): number {
  const gainDelta = (right.estGain ?? -1) - (left.estGain ?? -1);
  if (gainDelta !== 0) {
    return gainDelta;
  }
  return catalogIndexOf(left.id) - catalogIndexOf(right.id);
}

/**
 * Deterministic markdown for a developer: every fail and partial check (the
 * engine's top fixes first, then the rest by gain and catalog order) with its
 * evidence, fix and rule link. Plain hyphens throughout.
 */
export function renderDeveloperBrief(report: ScoreReport, options: DeveloperBriefOptions): string {
  const { host, origin } = options;
  const ruleBase = `${origin.replace(/\/+$/, '')}${SCORE_METHODOLOGY_PATH}`;
  const lines: string[] = [`# Agent-readiness fixes for ${host}`];

  if (report.analysisStatus === 'blocked' || report.score === null) {
    const copy = blockedCopy(options.blocked ?? fallbackBlockedCase(report), host, report);
    lines.push('', `${copy.headline}. ${copy.body}`);
    return `${lines.join('\n')}\n`;
  }

  const scanned = report.fetchedAt ? ` Scanned ${report.fetchedAt}.` : '';
  lines.push(
    `Score ${report.score}/${SCORE_CEILING}, grade ${report.grade} (${report.label}). Catalog ${report.catalogVersion}, formula ${report.formulaVersion}.${scanned}`
  );
  if (report.analysisStatus === 'partial') {
    const unverified = report.unverifiedChecks.length;
    if (report.range && unverified > 0) {
      lines.push(
        `Provisional: between ${report.range.pessimistic} and ${report.range.optimistic}; ${unverified} ${plural(unverified, 'check', 'checks')} could not be checked in time.`
      );
    } else {
      lines.push('Provisional: some files could not be fetched in time; the checks that read them were judged without them.');
    }
  }

  const atCap = report.score >= SCORE_CEILING;
  const top = rankTopFixes(report.checks, TOP_FIXES_LIMIT);
  const topIds = new Set(top.map((check) => check.id));
  const rest = report.checks
    .filter((check) => (check.status === 'fail' || check.status === 'partial') && !topIds.has(check.id))
    .sort(compareRest);
  const fixes = [...top, ...rest];

  lines.push('', '## Fix first');
  if (fixes.length === 0) {
    lines.push('Nothing to fix: every scored check passes.');
  }
  fixes.forEach((check, index) => {
    const gain = check.estGain === null ? '' : `, +${check.estGain} ${atCap ? `above ${SCORE_CEILING}` : 'pts'}`;
    lines.push(`${index + 1}. ${checkName(check.id)} (${check.id}, ${check.tier}${gain})`);
    lines.push(`   Found: ${check.evidence}`);
    const action = fixActionFor(check);
    if (action) {
      lines.push(`   Do: ${action}`);
    }
    const platform = platformFixesApply(check) ? platformFixFor(getCheckDefinition(check.id), report.platform) : null;
    if (platform) {
      lines.push(`   ${platform}`);
    }
    lines.push(`   Rule: ${ruleBase}#${check.id}`);
  });

  const unverifiedChecks = report.checks.filter((check) => check.status === 'unverified');
  const unverifiedResources = unverifiedResourcesWithoutChecks(report);
  if (unverifiedChecks.length > 0 || unverifiedResources.length > 0) {
    lines.push('', '## Could not be checked in time');
    for (const check of unverifiedChecks) {
      lines.push(`- ${checkName(check.id)} (${check.id}): ${check.evidence}`);
    }
    for (const resource of unverifiedResources) {
      lines.push(`- ${RESOURCE_LABELS[resource]}: did not answer in time; the checks that read it were judged without it`);
    }
  }

  lines.push(
    '',
    '## Not scored',
    `- ${report.naChecks.length} not applicable, ${report.notMeasured.length} not measured in catalog ${report.catalogVersion}. Details: ${ruleBase}`
  );
  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Product line (7.11) and announcements (9)

export const PRODUCT_LINE: Readonly<{ text: string; linkLabel: string; href: string }> = {
  text: 'agentmarkup generates llms.txt, JSON-LD, markdown mirrors and AI crawler rules at build time.',
  linkLabel: 'See how it works',
  href: '/',
};

/**
 * Text for the persistent live region when a scan finishes. First scan:
 * `Report ready for {host}: score 83 of 100, grade B, Readable, with fixable gaps.`;
 * with `{ rescan: true }`: `Report updated. Score 83 of 100, grade B.`
 */
export function announceReport(
  report: ScoreReport,
  host: string,
  blocked: BlockedCase | null,
  options: { rescan?: boolean } = {}
): string {
  if (report.analysisStatus === 'blocked' || report.score === null) {
    const copy = blockedCopy(blocked ?? fallbackBlockedCase(report), host, report);
    const text = `No score for ${host}: ${copy.headline}. ${copy.body}`;
    return options.rescan ? `Report updated. ${text}` : text;
  }
  if (report.analysisStatus === 'partial' && report.range && report.range.pessimistic !== report.range.optimistic) {
    const range = `score between ${report.range.pessimistic} and ${report.range.optimistic}`;
    return options.rescan
      ? `Report updated. Provisional ${range}.`
      : `Provisional report for ${host}: ${range}.`;
  }
  if (report.analysisStatus === 'partial') {
    return options.rescan
      ? `Report updated. Provisional score ${report.score} of ${SCORE_CEILING}, grade ${report.grade}.`
      : `Provisional report for ${host}: score ${report.score} of ${SCORE_CEILING}, grade ${report.grade}.`;
  }
  return options.rescan
    ? `Report updated. Score ${report.score} of ${SCORE_CEILING}, grade ${report.grade}.`
    : `Report ready for ${host}: score ${report.score} of ${SCORE_CEILING}, grade ${report.grade}, ${report.label}.`;
}
