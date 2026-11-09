// Per-viewer score history for the report's change line (spec 2026-11-09, 6.4).
//
// A browser convenience only: it lives in this viewer's localStorage, is never
// shared and never read back by anyone else. Call these from effects after mount
// (never during render: the page is prerendered). Every storage access sits in
// try/catch; any failure just hides the change line. Only `complete` reports are
// stored or returned (core's `compareReports` refuses provisional sides anyway).
import type { ScoreReport } from '@agentmarkup/core/score';

export const HISTORY_STORAGE_KEY = 'am-checker-history-v1';
export const HISTORY_MAX_HOSTS = 10;

interface HistoryEntry {
  host: string;
  latest: ScoreReport;
  previous: ScoreReport | null;
}

interface HistoryStore {
  version: 1;
  /** Most recently saved first; at most `HISTORY_MAX_HOSTS` entries. */
  entries: HistoryEntry[];
}

function storage(): Storage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function hostKey(host: string): string {
  return host.trim().toLowerCase();
}

function isStorableReport(value: unknown): value is ScoreReport {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const report = value as Partial<ScoreReport>;
  return (
    report.analysisStatus === 'complete' &&
    typeof report.score === 'number' &&
    Number.isFinite(report.score) &&
    typeof report.fetchedAt === 'string' &&
    typeof report.catalogVersion === 'string' &&
    typeof report.formulaVersion === 'string' &&
    Array.isArray(report.checks) &&
    report.checks.every(
      (check) =>
        Boolean(check) &&
        typeof check === 'object' &&
        typeof (check as { id?: unknown }).id === 'string' &&
        typeof (check as { status?: unknown }).status === 'string'
    )
  );
}

function readStore(): HistoryStore {
  const empty: HistoryStore = { version: 1, entries: [] };
  try {
    const raw = storage()?.getItem(HISTORY_STORAGE_KEY);
    if (!raw) {
      return empty;
    }
    const parsed = JSON.parse(raw) as Partial<HistoryStore> | null;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return empty;
    }
    const entries = parsed.entries
      .filter(
        (entry): entry is HistoryEntry =>
          Boolean(entry) &&
          typeof entry.host === 'string' &&
          isStorableReport(entry.latest) &&
          (entry.previous === null || isStorableReport(entry.previous))
      )
      .slice(0, HISTORY_MAX_HOSTS);
    return { version: 1, entries };
  } catch {
    return empty;
  }
}

function writeStore(store: HistoryStore): void {
  try {
    storage()?.setItem(HISTORY_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota, private mode or blocked storage: the change line simply stays hidden.
  }
}

/**
 * Remembers a complete report for `host`. Idempotent per `fetchedAt` (a repeated
 * call, such as a StrictMode double effect, changes nothing). The host's previous
 * latest report becomes `previous`; the least recently saved host is dropped past
 * `HISTORY_MAX_HOSTS`.
 */
export function rememberReport(host: string, report: ScoreReport): void {
  if (!isStorableReport(report)) {
    return;
  }
  const key = hostKey(host);
  if (!key) {
    return;
  }
  const store = readStore();
  const existing = store.entries.find((entry) => entry.host === key);
  if (existing && existing.latest.fetchedAt === report.fetchedAt) {
    return;
  }
  const entry: HistoryEntry = { host: key, latest: report, previous: existing?.latest ?? null };
  const entries = [entry, ...store.entries.filter((item) => item.host !== key)].slice(0, HISTORY_MAX_HOSTS);
  writeStore({ version: 1, entries });
}

/**
 * The report to compare against: the stored latest when it is not the report on
 * screen (`fetchedAt` differs), else the one before it. Null when nothing usable
 * is stored.
 */
export function previousReport(host: string, fetchedAt: string | null): ScoreReport | null {
  const key = hostKey(host);
  if (!key) {
    return null;
  }
  const entry = readStore().entries.find((item) => item.host === key);
  if (!entry) {
    return null;
  }
  return entry.latest.fetchedAt !== fetchedAt ? entry.latest : entry.previous;
}
