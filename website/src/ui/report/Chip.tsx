import type { ScoredCheck } from '@agentmarkup/core/score';

import { displayStatus, isUncountedExtra, type CheckDisplayStatus } from '../../checker/report-model';
import { chipLabel } from '../../checker/report-copy';
import { StatusIcon } from '../Status';
import type { SemanticStatus } from '../status-model';
import './report.css';

/** The `StatusIcon` shape for a display status; `na` and `not-measured` carry no mark. */
const MARK: Readonly<Record<CheckDisplayStatus, SemanticStatus | null>> = {
  'fail-action': 'action',
  'fail-attention': 'attention',
  partial: 'attention',
  pass: 'good',
  unverified: 'neutral',
  na: null,
  'not-measured': null,
};

/** Shape-coded status mark shared by chips, check lines and the legend (never colour alone). */
export function StatusMark({ status, size = 11 }: { status: CheckDisplayStatus; size?: number }) {
  const mark = MARK[status];
  return mark ? <StatusIcon status={mark} size={size} /> : null;
}

/** The mark of a short bonus check: a plus, because it can only add points (never the warning triangle). */
export function ExtraMark({ size = 11 }: { size?: number }) {
  return (
    <svg className="status-icon extra-mark" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

type Overflow = 'wide' | 'narrow';

type ChipProps = (
  | { check: ScoredCheck }
  | { ghostCount: number }
  | { more: number; breakpoint: Overflow }
) & {
  /** Set on chips beyond the per-breakpoint limit (7.5): CSS hides them at that width. */
  overflow?: Overflow;
};

export function Chip(props: ChipProps) {
  if ('check' in props) {
    const status = displayStatus(props.check);
    const extra = isUncountedExtra(props.check);
    return (
      <span className="chip" data-status={status} data-extra={extra ? 'true' : undefined} data-overflow={props.overflow}>
        <span className="chip-icon">{extra ? <ExtraMark /> : <StatusMark status={status} />}</span>
        {chipLabel(props.check.id)}
      </span>
    );
  }
  if ('ghostCount' in props) {
    return (
      <span className="chip chip-ghost" data-overflow={props.overflow}>
        +{props.ghostCount} not scored
      </span>
    );
  }
  return <span className={`chip chip-more chip-more-${props.breakpoint}`}>+{props.more}</span>;
}
