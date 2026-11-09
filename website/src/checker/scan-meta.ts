import type { ScoreReport } from '@agentmarkup/core/score';

import { PLATFORM_LABELS } from './check-copy';
import type { SiteCheckResponse } from './types';

/**
 * The six report questions in their fixed order (spec 7.1). The landing's
 * "What the report answers" list and the scanning skeleton use them until
 * `GROUP_COPY` in `report-copy.ts` lands; integration may switch the import.
 */
export const SKELETON_QUESTIONS: ReadonlyArray<{ label: string; question: string }> = [
  { label: 'Access', question: 'Can AI assistants get in?' },
  { label: 'Content', question: 'Can they read your pages?' },
  { label: 'Controls', question: 'Can they use your buttons, links and forms?' },
  { label: 'Navigation', question: 'Do links and missing pages behave?' },
  { label: 'Identity', question: 'Do they know who you are?' },
  { label: 'Discovery', question: 'Can they find your sitemap and AI guide files?' },
];

/** `3.4 s`: one decimal, for the scanning timer and the meta line. */
export function formatElapsed(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)} s`;
}

export function stripWww(host: string): string {
  return host.replace(/^www\./i, '');
}

/** The host of a URL (with `www.` and port), or the input itself when it does not parse. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function formatDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(date);
}

/** `9 Nov 2026, 11:52` for the rescan-failed banner; null when the timestamp is unusable. */
export function reportTime(iso: string | null | undefined): string | null {
  return formatDateTime(iso);
}

function pathOf(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

/**
 * Spec 6.2: the meta line segments, joined by ` · ` by the caller. Each segment
 * is omitted when its data is missing. Locale formatting: call after mount only.
 */
export function scanMeta(result: SiteCheckResponse, report: ScoreReport): string[] {
  const segments: string[] = [];

  const cachedAt = result.cache?.hit ? formatTime(result.cache.cachedAt) : null;
  if (cachedAt) {
    segments.push(`Saved scan from ${cachedAt}`);
    const expiresAt = formatTime(result.cache?.expiresAt);
    if (expiresAt) segments.push(`a fresh scan is possible after ${expiresAt}`);
  } else {
    const scanned = formatDateTime(result.fetchedAt);
    if (scanned) segments.push(`Scanned ${scanned}`);
    const elapsedMs = result.fetchSummary?.elapsedMs;
    // A connection that failed at once has no meaningful duration ("took 0.0 s").
    if (typeof elapsedMs === 'number' && Number.isFinite(elapsedMs) && elapsedMs >= 50) {
      segments.push(`took ${(elapsedMs / 1000).toFixed(1)} s`);
    }
  }

  if (report.analysisStatus !== 'blocked') {
    const samplePath = report.samplePageUrl ? pathOf(report.samplePageUrl) : null;
    segments.push(samplePath ? `homepage and ${samplePath} sampled` : 'homepage only (no inner link found)');
  }

  if (report.platform) {
    segments.push(`${PLATFORM_LABELS[report.platform]} site`);
  }

  return segments;
}

/** Spec 6.2: shown under the ScanBar only when three or fewer free scans remain. */
export function quotaNote(result: SiteCheckResponse): string | null {
  const protection = result.protection;
  const remaining = protection?.remainingChecks;
  if (!protection || typeof remaining !== 'number' || remaining > 3 || remaining < 0) {
    return null;
  }
  const minutes = Math.max(1, Math.round(protection.rateLimitWindowSeconds / 60));
  return `${remaining} more free scan${remaining === 1 ? '' : 's'} from your network in the next ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

/** Spec 5.11: null when the hosts match after dropping `www.`. */
export function redirectNotice(requestedUrl: string, targetUrl: string): string | null {
  const entered = stripWww(hostOf(requestedUrl)).toLowerCase();
  const landed = stripWww(hostOf(targetUrl)).toLowerCase();
  if (!entered || !landed || entered === landed) {
    return null;
  }
  return `You entered ${entered}. It redirected our checker to ${landed}, so this report is for ${landed}.`;
}

function withoutTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Spec 5.11: printed in "How this was checked" when the input was more than the site root. */
export function normalizationNote(result: SiteCheckResponse): string | null {
  const from = result.normalizedFrom;
  if (!from) return null;
  if (withoutTrailingSlash(from) === withoutTrailingSlash(result.targetUrl)) return null;
  return `You entered ${from}; the checker scans the site root.`;
}
