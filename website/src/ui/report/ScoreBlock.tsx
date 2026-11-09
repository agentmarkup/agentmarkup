import { GRADE_LABELS } from '@agentmarkup/core/score';
import type { ScoreReport } from '@agentmarkup/core/score';

import { partialInfo, type BlockedCase, type Tone } from '../../checker/report-model';
import { blockedCopy, partialLine } from '../../checker/report-copy';
import './report.css';

interface ScoreBlockProps {
  report: ScoreReport;
  tone: Tone;
  blocked: BlockedCase | null;
  host: string;
  onRescan(): void;
  rescanning: boolean;
}

/** The raw total for the number's tooltip; the full arithmetic lives in "How this was checked". */
function rawTitle(report: ScoreReport): string | undefined {
  if (report.raw === null) return undefined;
  const atCap = report.score !== null && report.score >= 100;
  return `Raw ${report.raw.toFixed(2)} before rounding${atCap ? ', at the cap' : ''}`;
}

/**
 * Score, grade chip and band word (the only verdict on the page), the provisional
 * line of a partial run, or the blocked headline. Every figure is an engine field.
 */
export function ScoreBlock({ report, tone, blocked, host, onRescan, rescanning }: ScoreBlockProps) {
  if (blocked || report.score === null || report.grade === null) {
    const copy = blocked ? blockedCopy(blocked, host, report) : null;
    return (
      <div className="report-score" data-tone={tone}>
        <div className="report-blocked" data-tone={blocked?.tone ?? tone}>
          <h2 className="report-blocked-title">{copy?.headline ?? 'No score yet'}</h2>
          {copy ? <p className="report-blocked-body">{copy.body}</p> : null}
        </div>
      </div>
    );
  }

  const info = report.analysisStatus === 'partial' ? partialInfo(report) : null;
  // Spec 5.8: a range when the two ends differ; equal ends show one number plus the Provisional badge
  // (partialLine still says how many checks could not be checked in time).
  const ranged = info !== null && info.low !== info.high;
  const title = rawTitle(report);

  let number;
  if (ranged) {
    number = (
      <p className="report-score-line" title={title}>
        <span className="report-score-range" aria-hidden="true">
          {info.low}
          <span className="report-score-to"> to </span>
          {info.high}
        </span>
        <span className="sr-only">
          Score between {info.low} and {info.high} out of 100, provisional
        </span>
      </p>
    );
  } else {
    number = (
      <p className="report-score-line" title={title}>
        <span className="report-score-number" aria-hidden="true">
          {report.score}
        </span>
        <span className="report-score-max" aria-hidden="true">
          /100
        </span>
        <span className="sr-only">Score {report.score} out of 100</span>
      </p>
    );
  }

  // H13: a partial run's grade and band phrase use the pessimistic end of the range.
  let grade: string = report.grade;
  let band: string = report.label ?? '';
  if (info) {
    grade = info.gradeLow === info.gradeHigh ? info.gradeLow : `${info.gradeLow} to ${info.gradeHigh}`;
    band =
      info.gradeLow === info.gradeHigh ? `${GRADE_LABELS[info.gradeLow]} · provisional` : 'provisional';
  }

  return (
    <div className="report-score" data-tone={tone}>
      {number}
      <p className="report-grade-line">
        <span className="sr-only">Grade </span>
        <span className="report-grade" data-tone={tone}>
          {grade}
        </span>
        <span className="report-band">{band}</span>
      </p>
      {info ? (
        <p className="report-provisional">
          <span className="score-badge">Provisional</span>
          <span className="report-provisional-text">{partialLine(info, report)}</span>
          <button
            type="button"
            className={`checker-action report-rescan-inline${rescanning ? ' is-busy' : ''}`}
            aria-disabled={rescanning ? 'true' : undefined}
            onClick={() => {
              if (!rescanning) onRescan();
            }}
          >
            Rescan
          </button>
        </p>
      ) : null}
    </div>
  );
}
