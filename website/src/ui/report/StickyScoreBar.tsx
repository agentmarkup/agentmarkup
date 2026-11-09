import { useEffect, useState, type RefObject } from 'react';
import type { ScoreReport } from '@agentmarkup/core/score';

import { partialInfo } from '../../checker/report-model';
import './report.css';

interface StickyScoreBarProps {
  report: ScoreReport;
  host: string;
  targetRef: RefObject<HTMLElement | null>;
}

/**
 * Section 10.7: a compact score line once the hero card has scrolled out. It only
 * repeats the hero, so it is `aria-hidden`; CSS shows it at 40rem and wider only
 * and hides it in print.
 */
export function StickyScoreBar({ report, host, targetRef }: StickyScoreBarProps) {
  const [visible, setVisible] = useState(false);
  const blocked = report.analysisStatus === 'blocked' || report.score === null;

  useEffect(() => {
    const target = targetRef.current;
    if (blocked || !target || typeof IntersectionObserver === 'undefined') return;
    // The hero counts as gone once it is under the sticky nav, not only above the viewport.
    let navPx = 0;
    try {
      const rootStyle = getComputedStyle(document.documentElement);
      const rem = Number.parseFloat(rootStyle.fontSize) || 16;
      navPx = Math.round((Number.parseFloat(rootStyle.getPropertyValue('--nav-height')) || 0) * rem);
    } catch {
      navPx = 0;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setVisible(!entry.isIntersecting && entry.boundingClientRect.top < navPx);
      },
      { rootMargin: `-${navPx}px 0px 0px 0px` }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [blocked, targetRef]);

  if (blocked) return null;

  const info = report.analysisStatus === 'partial' ? partialInfo(report) : null;
  // Same rule as `partialLine`: a range whenever checks are missing, one number for a resource-only partial.
  const ranged = info !== null && info.low !== info.high;
  const toImprove = report.checks.filter((check) => check.status === 'fail' || check.status === 'partial').length;

  return (
    <div className="sticky-score" data-visible={visible ? 'true' : 'false'} aria-hidden="true">
      {/* Separators are the CSS borders between children; no text dots (they doubled up). */}
      <span className="sticky-score-host">{host}</span>
      <span className="sticky-score-number">{ranged ? `${info.low} to ${info.high}` : `${report.score}/100`}</span>
      <span className="sticky-score-grade">{info ? 'provisional' : report.grade}</span>
      <span className="sticky-score-todo">{toImprove} to improve</span>
    </div>
  );
}
