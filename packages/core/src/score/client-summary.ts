// Plain-text client summary of a ScoreReport: no markdown markers, ready to paste
// into an email. Every line comes from the catalog's client copy.
import { getCheckDefinition } from './catalog.js';
import { clientSentenceFor, fixActionFor, platformFixesApply } from './check-copy.js';
import { RESOURCE_NOTE_LABELS } from './evaluate.js';
import { compareReports, unverifiedResourcesWithoutChecks } from './formula.js';
import type { ScoreReport, ScoredCheck, SitePlatform } from './types.js';

export interface ClientSummaryOptions {
  siteName: string;
  /** A previous complete report of the same site, for the change line. */
  previous?: ScoreReport | null;
  /** How many fixes to print (default 3). */
  fixes?: number;
}

const PLATFORM_LABELS: Record<SitePlatform, string> = {
  wordpress: 'WordPress',
  webflow: 'Webflow',
  squarespace: 'Squarespace',
  wix: 'Wix',
};

function platformFix(check: ScoredCheck, platform: SitePlatform | null): string | null {
  const definition = getCheckDefinition(check.id);
  if (!definition || !platform || platform === 'wix' || !platformFixesApply(check)) {
    return null;
  }
  const fix = definition.fixes[platform];
  if (!fix || fix === 'same') {
    return null;
  }
  return `${PLATFORM_LABELS[platform]}: ${fix}`;
}

function describeFix(check: ScoredCheck, index: number, platform: SitePlatform | null): string[] {
  const definition = getCheckDefinition(check.id);
  const name = definition?.name ?? check.id;
  const sentence = definition ? clientSentenceFor(check) : '';
  const gain = check.estGain !== null ? ` Estimated gain: ${check.estGain} points.` : '';
  const lines = [`${index + 1}. ${name}. ${sentence}${gain}`.trim()];
  const action = fixActionFor(check);
  if (action) {
    lines.push(`   What to do: ${action}`);
  }
  const fix = platformFix(check, platform);
  if (fix) {
    lines.push(`   On ${fix}`);
  }
  return lines;
}

function nameOf(id: string): string {
  return getCheckDefinition(id)?.name ?? id;
}

/** Renders a plain-text summary for a non-technical client. */
export function renderClientSummary(report: ScoreReport, options: ClientSummaryOptions): string {
  const lines: string[] = [];
  const site = options.siteName;
  if (report.analysisStatus === 'blocked' || report.score === null) {
    if (report.blockedKind === 'http-status') {
      const status = report.blockedReason?.match(/HTTP (\d{3})/)?.[1] ?? 'an error status';
      lines.push(`${site}: the homepage answered HTTP ${status}, so there is nothing to score yet.`);
      lines.push('Make the site root serve a page, then run the check again.');
      return lines.join('\n');
    }
    // The homepage answered (a 429 or 5xx without challenge markers, or a 2xx
    // without a body): say so instead of claiming it timed out.
    const answered = report.blockedReason?.match(/HTTP (\d{3})/)?.[1];
    if (answered) {
      const code = Number(answered);
      if (code >= 300) {
        lines.push(`${site}: the homepage answered HTTP ${code} instead of a page, so there is no score yet.`);
        lines.push('Please re-run the check in a few minutes; a server error or a rate limit is never counted against the site.');
      } else {
        lines.push(`${site}: the homepage answered HTTP ${code} without a readable page, so there is no score yet.`);
        lines.push('Please re-run the check in a few minutes; this is never counted against the site.');
      }
      return lines.join('\n');
    }
    lines.push(`${site}: we could not reach the site in time, so there is no score yet.`);
    lines.push('Please re-run the check; a timed-out fetch is never counted against you.');
    return lines.join('\n');
  }
  lines.push(`${site}: agent-readiness score ${report.score} of 100, grade ${report.grade} (${report.label}).`);
  const resourcesOnly = unverifiedResourcesWithoutChecks(report).map((key) => RESOURCE_NOTE_LABELS[key]);
  if (report.analysisStatus === 'partial' && report.range) {
    const checks = report.unverifiedChecks.length;
    if (checks > 0) {
      lines.push(
        `This reading is provisional: ${checks} check${checks === 1 ? '' : 's'} could not be verified in time, so the score is between ${report.range.pessimistic} and ${report.range.optimistic}. Re-run to confirm.`
      );
    }
    if (resourcesOnly.length > 0) {
      const what = `the ${resourcesOnly.join(' and the ')}`;
      const pronoun = resourcesOnly.length === 1 ? 'it' : 'them';
      lines.push(
        checks > 0
          ? `${what.charAt(0).toUpperCase()}${what.slice(1)} could not be fetched in time either; the checks that read ${pronoun} were judged without ${pronoun}.`
          : `This reading is provisional: ${what} could not be fetched in time, so the checks that read ${pronoun} were judged without ${pronoun}. Re-run to confirm.`
      );
    }
  }
  const eligible = report.required.total + report.recommended.total;
  const passing = report.required.passing + report.recommended.passing;
  lines.push(
    `${passing} of ${eligible} scored checks pass. Required checks earn ${report.required.earned} of ${report.required.available} points, recommended checks ${report.recommended.earned} of ${report.recommended.available}, plus ${report.bonus.points} bonus points from ${report.bonus.signals} extra signals.`
  );
  if (report.fetchedAt) {
    lines.push(`Checked ${report.fetchedAt}${report.samplePageUrl ? `, sample page ${report.samplePageUrl}` : ''}.`);
  }

  const previous = options.previous;
  if (previous) {
    const comparison = compareReports(previous, report);
    if (comparison.comparable && comparison.scoreDelta !== null) {
      const delta = comparison.scoreDelta;
      const sign = delta > 0 ? '+' : '';
      lines.push(
        `Change since the previous check: ${sign}${delta} points (grade ${comparison.previousGrade} to ${comparison.currentGrade}), ${comparison.changedChecks.length} check${comparison.changedChecks.length === 1 ? '' : 's'} changed.`
      );
    } else {
      lines.push(`Change since the previous check: not comparable (${comparison.reason ?? 'unknown reason'}).`);
    }
  }

  const fixes = report.topFixes.slice(0, options.fixes ?? 3);
  lines.push('');
  if (fixes.length === 0) {
    lines.push(report.score >= 100 ? 'At the cap: every scored check passes.' : 'No fixes to list.');
  } else {
    lines.push(report.score >= 100 ? 'At the cap. Remaining gains:' : 'Top fixes:');
    fixes.forEach((check, index) => {
      lines.push(...describeFix(check, index, report.platform));
    });
  }

  if (report.unverifiedChecks.length > 0 || resourcesOnly.length > 0) {
    lines.push('');
    lines.push('Could not be verified in time, re-run:');
    for (const id of report.unverifiedChecks) {
      lines.push(`   ${nameOf(id)}`);
    }
    for (const label of resourcesOnly) {
      lines.push(`   the ${label} fetch (the checks that read it were judged without it)`);
    }
  }
  if (report.naChecks.length > 0) {
    lines.push('');
    lines.push('Not applicable to this site:');
    for (const entry of report.naChecks) {
      lines.push(`   ${nameOf(entry.id)} (${entry.reason})`);
    }
  }
  lines.push('');
  lines.push(
    `Computed by agentmarkup from a published formula (catalog ${report.catalogVersion}, formula ${report.formulaVersion}); every point traces to a check you can see at https://agentmarkup.dev/score/`
  );
  return lines.join('\n');
}
