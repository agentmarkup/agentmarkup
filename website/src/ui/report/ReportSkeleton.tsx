import { SKELETON_QUESTIONS } from '../../checker/scan-meta';

/** The score column of the skeleton hero: no value, no status colour until the engine has one. */
export function ScoreSkeleton() {
  return (
    <div className="score-skeleton" aria-hidden="true">
      <p className="skeleton-score-row">
        <span className="skeleton-block skeleton-score">
          <span className="skeleton-digit" />
          <span className="skeleton-digit" />
        </span>
        <span className="skeleton-score-max">/100</span>
      </p>
      <p className="skeleton-grade-row">
        <span className="skeleton-block skeleton-grade" />
        <span className="skeleton-block skeleton-band" />
      </p>
      <span className="skeleton-line" />
      <span className="skeleton-line" />
      <span className="skeleton-line skeleton-line-short" />
    </div>
  );
}

/** Spec 5.3: the fix list and the six goal rows, laid out with the report's geometry. */
export function ReportSkeleton() {
  return (
    <div className="report-skeleton" aria-hidden="true">
      <p className="report-skeleton-heading">Fix these first</p>
      <div className="report-skeleton-fixes">
        <div className="skeleton-line" />
        <div className="skeleton-line" />
        <div className="skeleton-line" />
      </div>
      <p className="report-skeleton-heading">Checks by goal</p>
      <div className="report-skeleton-groups">
        {SKELETON_QUESTIONS.map((goal, index) => (
          <div className="report-skeleton-row" key={goal.label}>
            <span className="group-number">{index + 1}</span>
            <span className="report-skeleton-question">{goal.question}</span>
            <span className="report-skeleton-chips">
              <span className="skeleton-chip" />
              <span className="skeleton-chip" />
              <span className="skeleton-chip" />
            </span>
            <span className="report-skeleton-figure">--</span>
          </div>
        ))}
      </div>
    </div>
  );
}
