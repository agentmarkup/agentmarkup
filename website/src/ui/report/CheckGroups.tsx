import { useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { POOLS, catalogIndexOf, getCheckDefinition } from '@agentmarkup/core/score';
import type { CheckBucket, CheckStatus, CheckTier, ScoreReport, ScoredCheck } from '@agentmarkup/core/score';

import {
  GROUP_ORDER,
  bucketOf,
  compareForList,
  displayStatus,
  formatPoints,
  statusRows,
  tierRows,
  type CheckDisplayStatus,
  type GroupSummary,
  type StatusRowKey,
  type TierRow,
  type Tone,
} from '../../checker/report-model';
import { GROUP_COPY, STATUS_WORDS, TIER_WORDS, naReason } from '../../checker/report-copy';
import type { AuditItem } from '../../checker/types';
import { StatusIcon } from '../Status';
import { CheckLine } from './CheckLine';
import { Chip, ExtraMark, StatusMark } from './Chip';
import './report.css';

interface CheckGroupsProps {
  report: ScoreReport;
  groups: GroupSummary[];
  items: AuditItem[];
  openRequest: { id: string; nonce: number } | null;
}

type View = 'goals' | 'status' | 'tier';

/** Title word, tone and mark of each Status-view row (the rows come from `statusRows`). */
const STATUS_ROW_LOOK: Readonly<Record<StatusRowKey, { status: CheckDisplayStatus; tone: Tone }>> = {
  fail: { status: 'fail-action', tone: 'action' },
  partial: { status: 'partial', tone: 'attention' },
  unverified: { status: 'unverified', tone: 'neutral' },
  pass: { status: 'pass', tone: 'good' },
  na: { status: 'na', tone: 'neutral' },
  'not-measured': { status: 'not-measured', tone: 'neutral' },
};

interface OpenState {
  rows: ReadonlySet<string>;
  checks: ReadonlySet<string>;
  passes: ReadonlySet<string>;
}

const VIEW_STORAGE_KEY = 'am-checker-groupby';
const VIEWS: ReadonlyArray<{ value: View; label: string; heading: string }> = [
  { value: 'goals', label: 'Goals', heading: 'Checks by goal' },
  { value: 'status', label: 'Status', heading: 'Checks by status' },
  { value: 'tier', label: 'Tier', heading: 'Checks by tier' },
];
const CHIP_LIMIT_WIDE = 8;
const CHIP_LIMIT_NARROW = 3;
const CHIP_ORDER: Partial<Record<CheckStatus, number>> = { fail: 0, partial: 1, unverified: 2, pass: 3 };
const TIER_TITLES: Readonly<Record<CheckTier, (report: ScoreReport) => string>> = {
  required: () => `Required (${POOLS.required}-point pool)`,
  recommended: () => `Recommended (${POOLS.recommended}-point pool)`,
  bonus: (report) => `Bonus (up to +${formatPoints(report.bonus.cap)}, never subtracts)`,
};
const EMPTY_OPEN: OpenState = { rows: new Set(), checks: new Set(), passes: new Set() };

function isView(value: unknown): value is View {
  return value === 'goals' || value === 'status' || value === 'tier';
}

function readStoredView(): View {
  try {
    const value = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return isView(value) ? value : 'goals';
  } catch {
    return 'goals';
  }
}

function storeView(view: View): void {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // Per-viewer convenience only.
  }
}

/** A `#check-<id>` hash that names a check of this report, or null. */
function readHashCheck(report: ScoreReport): ScoredCheck | null {
  try {
    const match = window.location.hash.match(/^#check-(.+)$/);
    if (!match) return null;
    const id = decodeURIComponent(match[1]);
    return report.checks.find((check) => check.id === id) ?? null;
  } catch {
    return null;
  }
}

function byCatalog(left: ScoredCheck, right: ScoredCheck): number {
  return catalogIndexOf(left.id) - catalogIndexOf(right.id);
}

function withCheckOpen(state: OpenState, check: ScoredCheck): OpenState {
  const bucket = bucketOf(check.id);
  const rows = new Set(state.rows);
  if (bucket) rows.add(`group-${bucket}`);
  const checks = new Set(state.checks);
  checks.add(check.id);
  const passes = new Set(state.passes);
  if (bucket && check.status === 'pass') passes.add(bucket);
  return { rows, checks, passes };
}

function toggled(set: ReadonlySet<string>, key: string, open: boolean): ReadonlySet<string> | null {
  if (set.has(key) === open) return null;
  const next = new Set(set);
  if (open) next.add(key);
  else next.delete(key);
  return next;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** The sr-only status line of a group summary, e.g. `2 needs fixing, 2 partly in place, 1 in place.` */
function statusLine(checks: ScoredCheck[]): string {
  const count = (statuses: CheckStatus[]) => checks.filter((check) => statuses.includes(check.status)).length;
  const parts: Array<[number, string]> = [
    [count(['fail']), STATUS_WORDS['fail-action']],
    [count(['partial']), STATUS_WORDS.partial],
    [count(['unverified']), STATUS_WORDS.unverified],
    [count(['pass']), STATUS_WORDS.pass],
    [count(['na', 'not-measured']), 'not scored'],
  ];
  const text = parts
    .filter(([n]) => n > 0)
    .map(([n, word]) => `${n} ${word.toLowerCase()}`)
    .join(', ');
  return text ? `${text}.` : 'No checks in this area.';
}

function GroupChips({ checks }: { checks: ScoredCheck[] }) {
  const shown = checks
    .filter((check) => CHIP_ORDER[check.status] !== undefined)
    .sort((left, right) => (CHIP_ORDER[left.status] ?? 0) - (CHIP_ORDER[right.status] ?? 0) || byCatalog(left, right));
  const ghost = checks.length - shown.length;
  const total = shown.length + (ghost > 0 ? 1 : 0);
  const overflowAt = (index: number) =>
    index >= CHIP_LIMIT_WIDE ? 'wide' : index >= CHIP_LIMIT_NARROW ? 'narrow' : undefined;

  return (
    <span className="group-chips" aria-hidden="true">
      {shown.map((check, index) => (
        <Chip key={check.id} check={check} overflow={overflowAt(index)} />
      ))}
      {ghost > 0 ? <Chip ghostCount={ghost} overflow={overflowAt(shown.length)} /> : null}
      {total > CHIP_LIMIT_NARROW ? <Chip more={total - CHIP_LIMIT_NARROW} breakpoint="narrow" /> : null}
      {total > CHIP_LIMIT_WIDE ? <Chip more={total - CHIP_LIMIT_WIDE} breakpoint="wide" /> : null}
    </span>
  );
}

/**
 * Sections 7.4 to 7.6: the check list grouped by goal (default), status or tier.
 * Every view renders the same `CheckLine`; one view is on screen at a time, so
 * `check-<id>` ids stay unique.
 */
export function CheckGroups({ report, groups, items, openRequest }: CheckGroupsProps) {
  const radioName = useId();
  const blocked = report.analysisStatus === 'blocked' || report.score === null;

  // The report only renders after a client-side scan, so these reads never run during prerender.
  const [hashCheck] = useState(() => readHashCheck(report));
  const [view, setView] = useState<View>(() => (hashCheck ? 'goals' : readStoredView()));
  const [open, setOpen] = useState<OpenState>(() => (hashCheck ? withCheckOpen(EMPTY_OPEN, hashCheck) : EMPTY_OPEN));
  const [jump, setJump] = useState<{ id: string; nonce: number } | null>(() =>
    hashCheck ? { id: hashCheck.id, nonce: -1 } : null
  );
  const [handledRequest, setHandledRequest] = useState<number | null>(null);

  // A jump from the fix list: adjust state during render (no effect round trip).
  if (openRequest && openRequest.nonce !== handledRequest) {
    setHandledRequest(openRequest.nonce);
    const target = report.checks.find((check) => check.id === openRequest.id);
    if (target) {
      setView('goals');
      setOpen((state) => withCheckOpen(state, target));
      setJump({ id: target.id, nonce: openRequest.nonce });
    }
  }

  const activeView: View = blocked ? 'goals' : view;

  const statusView = activeView === 'status' ? statusRows(report, items) : [];
  const hasActionFail = report.checks.some((check) => displayStatus(check) === 'fail-action');

  // Row ids of the view on screen and the non-pass checks, for Expand all and print.
  const rowIds =
    activeView === 'goals'
      ? GROUP_ORDER.map((bucket) => `group-${bucket}`)
      : activeView === 'tier'
        ? ['tier-required', 'tier-recommended', 'tier-bonus']
        : statusView.map((row) => `status-${row.key}`);
  const printChecks = report.checks
    .filter((check) => check.status === 'fail' || check.status === 'partial' || check.status === 'unverified')
    .map((check) => check.id);

  // Mirrors for the window listeners (read only inside event handlers).
  const openRef = useRef(open);
  const viewRef = useRef(view);
  const printTargetRef = useRef({ rows: rowIds, checks: printChecks });
  const savedRef = useRef<{ open: OpenState; view: View } | null>(null);
  useEffect(() => {
    openRef.current = open;
    viewRef.current = view;
    printTargetRef.current = { rows: GROUP_ORDER.map((bucket) => `group-${bucket}`), checks: printChecks };
  });

  // 10.8: print opens every row and every non-pass check, then restores.
  useEffect(() => {
    function beforePrint() {
      savedRef.current = { open: openRef.current, view: viewRef.current };
      const target = printTargetRef.current;
      flushSync(() => {
        // The handout always shows the six goal groups, whichever view is on screen.
        setView('goals');
        setOpen((state) => ({
          rows: new Set([...state.rows, ...target.rows]),
          checks: new Set([...state.checks, ...target.checks]),
          passes: state.passes,
        }));
      });
    }
    function afterPrint() {
      const saved = savedRef.current;
      savedRef.current = null;
      if (saved) {
        setOpen(saved.open);
        setView(saved.view);
      }
    }
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);
    return () => {
      window.removeEventListener('beforeprint', beforePrint);
      window.removeEventListener('afterprint', afterPrint);
    };
  }, []);

  // Shared deep links: a later `#check-<id>` hash opens the same way.
  useEffect(() => {
    function onHashChange() {
      const target = readHashCheck(report);
      if (!target) return;
      setView('goals');
      setOpen((state) => withCheckOpen(state, target));
      setJump((previous) => ({ id: target.id, nonce: (previous?.nonce ?? 0) + 1 }));
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [report]);

  // The only automatic scroll in the report, and it is user-initiated (section 9).
  useEffect(() => {
    if (!jump) return;
    // A check that does not apply or is not measured has no line of its own: land on its group row.
    const bucket = bucketOf(jump.id);
    const element =
      document.getElementById(`check-${jump.id}`) ?? (bucket ? document.getElementById(`group-${bucket}`) : null);
    if (!element) return;
    const reduceMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    element.querySelector('summary')?.focus({ preventScroll: true });
  }, [jump]);

  function setRow(id: string, value: boolean) {
    setOpen((state) => {
      const rows = toggled(state.rows, id, value);
      return rows ? { ...state, rows } : state;
    });
  }

  function setCheck(id: string, value: boolean) {
    setOpen((state) => {
      const checks = toggled(state.checks, id, value);
      return checks ? { ...state, checks } : state;
    });
  }

  function setPasses(bucket: string, value: boolean) {
    setOpen((state) => {
      const passes = toggled(state.passes, bucket, value);
      return passes ? { ...state, passes } : state;
    });
  }

  const allOpen = rowIds.length > 0 && rowIds.every((id) => open.rows.has(id));
  function toggleAll() {
    setOpen((state) => {
      const rows = new Set(state.rows);
      for (const id of rowIds) {
        if (allOpen) rows.delete(id);
        else rows.add(id);
      }
      return { ...state, rows };
    });
  }

  function chooseView(next: View) {
    setView(next);
    storeView(next);
  }

  function line(check: ScoredCheck) {
    return (
      <CheckLine
        key={check.id}
        check={check}
        report={report}
        open={open.checks.has(check.id)}
        onToggle={(value) => setCheck(check.id, value)}
      />
    );
  }

  function goalRow(bucket: CheckBucket, index: number) {
    const id = `group-${bucket}`;
    const copy = GROUP_COPY[bucket];
    const group = groups.find((entry) => entry.bucket === bucket) ?? null;
    const checks = group?.checks ?? [];
    const tone: Tone = group?.tone ?? 'neutral';

    let pctText = 'Not scored';
    let pointsText: string | null = null;
    if (group && group.pct !== null) {
      pctText = `${group.pct}%`;
      pointsText = `${formatPoints(group.earned, 1)} of ${formatPoints(group.stake, 1)} pts`;
    } else if (group?.allHomepageBlocked) {
      pointsText = 'the homepage turned the checker away';
    } else if (checks.length > 0 && checks.every((check) => check.status === 'not-measured')) {
      pctText = 'Not measured yet';
    }
    if (group && group.bonus > 0) {
      pointsText = `${pointsText ? `${pointsText} ` : ''}+${formatPoints(group.bonus)} extras`;
    }

    const needs = checks.filter((check) => check.status === 'fail' || check.status === 'partial').sort(compareForList);
    const unverified = checks.filter((check) => check.status === 'unverified').sort(byCatalog);
    const passes = checks.filter((check) => check.status === 'pass').sort(byCatalog);
    const na = checks.filter((check) => check.status === 'na').sort(byCatalog);
    const notMeasured = checks.filter((check) => check.status === 'not-measured').length;

    return (
      <details
        key={bucket}
        className="group-row"
        id={id}
        data-tone={tone}
        open={open.rows.has(id)}
        onToggle={(event) => setRow(id, event.currentTarget.open)}
      >
        <summary className="group-summary">
          <span className="group-number" aria-hidden="true">
            {group?.order ?? index + 1}
          </span>
          <span className="group-question" role="heading" aria-level={3}>
            {copy.question}
          </span>
          {blocked ? null : <GroupChips checks={checks} />}
          <span className="group-figure">
            <span className="group-pct">{pctText}</span>
            {pointsText ? (
              // The body's first line repeats these points, so phones drop them from the row (the question keeps its width).
              <span className="group-points" data-narrow={group && group.pct !== null ? 'hide' : undefined}>
                {pointsText}
              </span>
            ) : null}
          </span>
          {blocked ? null : <span className="sr-only">{statusLine(checks)}</span>}
        </summary>
        <div className="group-body">
          {blocked ? <p className="group-na-line">Nothing in this area was scored on this run.</p> : null}
          {group && group.stake > 0 ? (
            <p className="group-points-line">
              {formatPoints(group.earned, 1)} of {formatPoints(group.stake, 1)} points in this area
            </p>
          ) : null}
          {!blocked && needs.length > 0 ? (
            <>
              <h4 className="group-subhead">{STATUS_WORDS['fail-action']}</h4>
              {needs.map(line)}
            </>
          ) : null}
          {!blocked && unverified.length > 0 ? (
            <>
              <h4 className="group-subhead">{STATUS_WORDS.unverified}</h4>
              {unverified.map(line)}
            </>
          ) : null}
          {!blocked && passes.length > 0 ? (
            <details
              className="group-passes"
              open={open.passes.has(bucket)}
              onToggle={(event) => setPasses(bucket, event.currentTarget.open)}
            >
              <summary>In place ({passes.length})</summary>
              {passes.map(line)}
            </details>
          ) : null}
          {!blocked && na.length > 0 ? (
            <p className="group-na-line">
              Doesn&apos;t apply here:{' '}
              {na
                .map(
                  (check) =>
                    `${getCheckDefinition(check.id)?.name ?? check.id} (${naReason(check.reason ?? 'not-applicable')})`
                )
                .join(' · ')}
            </p>
          ) : null}
          {!blocked && notMeasured > 0 ? <p className="group-na-line">Not measured yet: {notMeasured}</p> : null}
        </div>
      </details>
    );
  }

  function tierRow(row: TierRow) {
    const id = `tier-${row.tier}`;
    const title = TIER_TITLES[row.tier](report);
    const note =
      row.signals !== null
        ? `${row.signals} extra signal${row.signals === 1 ? '' : 's'}, never subtracts`
        : `${row.passing ?? 0} of ${row.total ?? 0} eligible checks pass`;
    // Bar width only (not a shown figure): the engine's earned over available, like the old tier bars.
    const percent = row.available > 0 ? Math.max(0, Math.min(100, (row.earned / row.available) * 100)) : 0;
    const valueText = `${formatPoints(row.earned)} / ${formatPoints(row.available)}`;

    return (
      <details
        key={row.tier}
        className="tier-row"
        id={id}
        data-tier={row.tier}
        open={open.rows.has(id)}
        onToggle={(event) => setRow(id, event.currentTarget.open)}
      >
        <summary className="group-summary">
          <span className="group-question" role="heading" aria-level={3}>
            {title}
          </span>
          <span className="group-figure">
            <span className="group-pct">{plural(row.checks.length, 'check')}</span>
          </span>
          <div className={`report-tier report-tier-${row.tier}`}>
            <div className="report-tier-head">
              <span className="report-tier-value">{valueText}</span>
            </div>
            <div
              className="report-tier-bar"
              role="img"
              aria-label={`${TIER_WORDS[row.tier]}: ${formatPoints(row.earned)} of ${formatPoints(row.available)} points`}
            >
              <span className="report-tier-fill" style={{ width: `${percent}%` }} />
            </div>
            <small className="report-tier-note">{note}</small>
          </div>
        </summary>
        <div className="group-body">{row.checks.map(line)}</div>
      </details>
    );
  }

  const heading = VIEWS.find((entry) => entry.value === activeView)?.heading ?? 'Checks by goal';

  return (
    <section className="groups-section" aria-labelledby="groups-title">
      <div className="groups-head">
        <h2 id="groups-title">{heading}</h2>
        {blocked ? null : (
          <>
            <fieldset className="groupby">
              <legend>Group by</legend>
              {VIEWS.map((entry) => (
                <label key={entry.value} className="groupby-option">
                  <input
                    type="radio"
                    name={radioName}
                    value={entry.value}
                    checked={activeView === entry.value}
                    onChange={() => chooseView(entry.value)}
                  />
                  {entry.label}
                </label>
              ))}
            </fieldset>
            <button type="button" className="groups-expand" onClick={toggleAll}>
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
          </>
        )}
      </div>
      {blocked ? null : (
        <p className="status-legend">
          <span className="status-legend-item">
            <StatusIcon status="action" size={12} /> {STATUS_WORDS['fail-action']}
          </span>
          <span className="status-legend-item">
            <StatusIcon status="attention" size={12} /> {STATUS_WORDS.partial}
          </span>
          <span className="status-legend-item">
            <StatusIcon status="good" size={12} /> {STATUS_WORDS.pass}
          </span>
          <span className="status-legend-item">
            <StatusIcon status="neutral" size={12} /> Not scored
          </span>
          <span className="status-legend-item status-legend-extra" data-tone="extra">
            <ExtraMark size={12} /> Extra, not counted in %
          </span>
        </p>
      )}
      {blocked ? (
        // Nothing was scored: six plain rows and one shared line, not six disclosures that each open to the same sentence.
        <>
          <ol className="group-list group-list-blocked">
            {GROUP_ORDER.map((bucket, index) => (
              <li key={bucket} className="group-row group-row-static" id={`group-${bucket}`} data-tone="neutral">
                <span className="group-number" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="group-question">{GROUP_COPY[bucket].question}</span>
                <span className="group-figure">
                  <span className="group-pct">Not scored</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="group-footnote">Nothing was scored on this run, so all six areas are empty.</p>
        </>
      ) : (
      <div className="group-list">
        {activeView === 'goals' ? GROUP_ORDER.map(goalRow) : null}
        {activeView === 'status'
          ? statusView.map((row) => {
              const id = `status-${row.key}`;
              const look = STATUS_ROW_LOOK[row.key];
              const mark: CheckDisplayStatus = row.key === 'fail' && !hasActionFail ? 'fail-attention' : look.status;
              const tone: Tone = row.key === 'fail' && !hasActionFail ? 'attention' : look.tone;
              return (
                <details
                  key={row.key}
                  className="status-row"
                  id={id}
                  data-tone={tone}
                  open={open.rows.has(id)}
                  onToggle={(event) => setRow(id, event.currentTarget.open)}
                >
                  <summary className="group-summary">
                    <span className="group-number" aria-hidden="true">
                      <StatusMark status={mark} size={16} />
                    </span>
                    <span className="group-question" role="heading" aria-level={3}>
                      {STATUS_WORDS[look.status]}
                    </span>
                    <span className="group-figure">
                      <span className="group-pct">{plural(row.count, 'check')}</span>
                    </span>
                  </summary>
                  <div className="group-body">
                    {row.checks.map(line)}
                    {row.resourceItems.map((item) => (
                      <div key={item.id} className="status-resource">
                        <p className="status-resource-title">{item.title}</p>
                        <p className="status-resource-detail">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })
          : null}
        {activeView === 'tier' ? tierRows(report).map(tierRow) : null}
      </div>
      )}
      {activeView === 'goals' && !blocked ? (
        <p className="group-footnote">Area figures are rounded sums of the checks inside them.</p>
      ) : null}
    </section>
  );
}
