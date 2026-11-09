import { useCallback, useLayoutEffect, useReducer, useRef } from 'react';

import { normalizeWebsiteInput } from '../normalizeWebsiteInput';
import { analyzeSiteCheck } from './analyze';
import { announceReport } from './report-copy';
import { blockedCase } from './report-model';
import { CheckerTurnstileError, classifyRequestError, requestSiteCheck } from './request';
import { hostOf } from './scan-meta';
import type { SiteAnalysis, SiteCheckResponse } from './types';

export type ScanPhase = 'idle' | 'scanning' | 'challenged' | 'done' | 'error';
export type ScanErrorKind =
  | 'invalid' // client empty input, or worker code 'invalid_request'
  | 'rate-limited' // code 'rate_limited' (429)
  | 'checker' // code 'checker_error' (500) or JSON error without a known code
  | 'network' // fetch threw TypeError (offline, DNS of our own host)
  | 'timeout' // client ceiling reached (section 4.4)
  | 'unavailable' // non-JSON response, not localhost
  | 'local-dev' // non-JSON response on localhost / 127.0.0.1 / 0.0.0.0
  | 'forbidden'; // code 'cross_site_forbidden' (403)
export interface ScanError {
  kind: ScanErrorKind;
  message: string;
  retryAfterSeconds: number | null;
}
export interface ChallengeState {
  siteKey: string;
  retryAfterSeconds: number | null;
  note: string | null;
  widgetKey: number;
}
export interface ScanOutcome {
  result: SiteCheckResponse;
  analysis: SiteAnalysis;
}
export interface SiteCheckState {
  phase: ScanPhase;
  /** Increments on every start/cancel/reset. */
  runId: number;
  /** Normalized input of the current or last run ('' when idle). */
  requestedUrl: string;
  /** `performance.now()` at the start of the current run. */
  startedAt: number | null;
  /** The report on screen; kept during a rescan, a rescan challenge and a rescan error. */
  current: ScanOutcome | null;
  challenge: ChallengeState | null;
  /** Phase 'error' without current = full error card; with current = rescan-failed banner. */
  error: ScanError | null;
  /** Inline error under the active URL input. */
  fieldError: string | null;
  /** Bumps on every field error, so a repeated identical message still refocuses the input. */
  fieldErrorNonce: number;
  /** "Keep waiting" pressed (section 4.4). */
  slowPromptDismissed: boolean;
  /** Text for the one persistent live region. */
  announcement: string;
}
export type ScanSource = 'form' | 'auto' | 'rescan';
export interface SiteCheckActions {
  start(rawUrl: string, opts?: { token?: string; source?: ScanSource }): void;
  /** Abort the current run. */
  cancel(): void;
  /** Back to the empty landing. */
  reset(): void;
  /** Turnstile success: start(requestedUrl, { token }). */
  submitToken(token: string): void;
  /** Turnstile expired/error: note inside the challenge card. Clearing a note re-renders the widget. */
  setChallengeNote(note: string | null): void;
  /** Dismiss the 30 s prompt, extend the ceiling once. */
  keepWaiting(): void;
}

export const SCAN_SLOW_PROMPT_MS = 30_000;
export const SCAN_CLIENT_CEILING_MS = 45_000;
export const SCAN_CLIENT_CEILING_EXTENDED_MS = 75_000;

const EMPTY_INPUT_MESSAGE = 'Enter a website address, for example example.com.';

/**
 * Client-side gate before any request (spec 4.2 row 1, extended): the normalized
 * input must parse as an http(s) URL whose host has a dot (or is a bracketed IPv6
 * literal) and carries no space or percent sign. Anything else gets the same field
 * error as an empty input and never reaches the worker, so no report shell is ever
 * titled with text that is not a host. Private and local addresses still go to the
 * worker, which owns that rule.
 */
export function isScannableUrl(normalized: string): boolean {
  if (!normalized || /\s/.test(normalized)) return false;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  const host = parsed.hostname;
  if (!host || host.includes('%')) return false;
  if (host.startsWith('[')) return true;
  return host.includes('.') && !host.startsWith('.');
}

const INITIAL_STATE: SiteCheckState = {
  phase: 'idle',
  runId: 0,
  requestedUrl: '',
  startedAt: null,
  current: null,
  challenge: null,
  error: null,
  fieldError: null,
  fieldErrorNonce: 0,
  slowPromptDismissed: false,
  announcement: '',
};

/** The report a 'form' start replaced, kept aside until the new run answers (an invalid answer restores it). */
interface ReplacedReport {
  current: ScanOutcome;
  requestedUrl: string;
}

type Action =
  | { type: 'field-error'; message: string; url: string }
  | { type: 'start'; runId: number; url: string; source: ScanSource; token: boolean; startedAt: number }
  | { type: 'done'; runId: number; outcome: ScanOutcome }
  | { type: 'challenge'; runId: number; siteKey: string; retryAfterSeconds: number | null }
  | { type: 'fail'; runId: number; error: ScanError; restore?: ReplacedReport | null }
  | { type: 'cancel'; runId: number }
  | { type: 'reset'; runId: number }
  | { type: 'challenge-note'; note: string | null }
  | { type: 'keep-waiting' };

/** The live-region sentence when a report lands (section 9), from `announceReport` in report-copy. */
function announceOutcome(outcome: ScanOutcome, rescan: boolean): string {
  const report = outcome.analysis.report;
  return announceReport(report, hostOf(outcome.result.targetUrl), blockedCase(report, outcome.result), { rescan });
}

function reducer(state: SiteCheckState, action: Action): SiteCheckState {
  switch (action.type) {
    case 'field-error':
      // On the landing the rejected text stays in the input (Checker seeds it from requestedUrl).
      return state.phase === 'idle'
        ? { ...state, fieldError: action.message, fieldErrorNonce: state.fieldErrorNonce + 1, requestedUrl: action.url }
        : { ...state, fieldError: action.message, fieldErrorNonce: state.fieldErrorNonce + 1 };
    case 'start': {
      const current = action.source === 'rescan' ? state.current : null;
      const host = hostOf(action.url);
      return {
        ...state,
        phase: 'scanning',
        runId: action.runId,
        requestedUrl: action.url,
        startedAt: action.startedAt,
        current,
        challenge: action.token ? state.challenge : null,
        error: null,
        fieldError: null,
        slowPromptDismissed: false,
        announcement: current ? `Scanning ${host} again.` : `Scanning ${host}.`,
      };
    }
    case 'done':
      if (action.runId !== state.runId || state.phase !== 'scanning') return state;
      return {
        ...state,
        phase: 'done',
        current: action.outcome,
        challenge: null,
        error: null,
        startedAt: null,
        announcement: announceOutcome(action.outcome, state.current !== null),
      };
    case 'challenge':
      if (action.runId !== state.runId || state.phase !== 'scanning') return state;
      return {
        ...state,
        phase: 'challenged',
        startedAt: null,
        challenge: {
          siteKey: action.siteKey,
          retryAfterSeconds: action.retryAfterSeconds,
          note: null,
          widgetKey: (state.challenge?.widgetKey ?? 0) + 1,
        },
        announcement: 'One quick check is needed before the scan.',
      };
    case 'fail':
      if (action.runId !== state.runId || state.phase !== 'scanning') return state;
      if (action.error.kind === 'invalid' && !state.current) {
        // The worker rejected the address of a first scan: never a report shell
        // titled with it. Back to the report it replaced, or to the landing, with
        // the field error under the input.
        const restore = action.restore;
        return {
          ...state,
          phase: restore ? 'done' : 'idle',
          current: restore ? restore.current : null,
          requestedUrl: restore ? restore.requestedUrl : state.requestedUrl,
          startedAt: null,
          challenge: null,
          error: null,
          fieldError: action.error.message,
          fieldErrorNonce: state.fieldErrorNonce + 1,
          announcement: '',
        };
      }
      return {
        ...state,
        phase: state.current ? 'done' : 'error',
        startedAt: null,
        challenge: null,
        error: action.error,
        fieldError: action.error.kind === 'invalid' ? action.error.message : state.fieldError,
        fieldErrorNonce: action.error.kind === 'invalid' ? state.fieldErrorNonce + 1 : state.fieldErrorNonce,
        announcement: '',
      };
    case 'cancel':
      return {
        ...state,
        phase: state.current ? 'done' : 'idle',
        runId: action.runId,
        startedAt: null,
        challenge: null,
        error: null,
        announcement: 'Scan cancelled.',
      };
    case 'reset':
      return { ...INITIAL_STATE, runId: action.runId };
    case 'challenge-note': {
      const challenge = state.challenge;
      if (!challenge) return state;
      const showAgain = action.note === null && challenge.note !== null;
      return {
        ...state,
        challenge: {
          ...challenge,
          note: action.note,
          widgetKey: showAgain ? challenge.widgetKey + 1 : challenge.widgetKey,
        },
      };
    }
    case 'keep-waiting':
      return { ...state, slowPromptDismissed: true };
    default:
      return state;
  }
}

function writeUrlParam(url: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const next = new URL(window.location.href);
    if (url) {
      next.searchParams.set('url', url);
    } else {
      next.searchParams.delete('url');
    }
    window.history.replaceState(window.history.state, '', next);
  } catch {
    // A sandboxed history API must not stop the scan.
  }
}

/**
 * The checker's request owner (spec section 4). One request at a time; a stale
 * answer is dropped by `runId`. No effect cleanup aborts a request: StrictMode
 * runs cleanups on a simulated unmount, and an abort there would kill the
 * `?url=` auto-run. Requests end only through `start`, `cancel`, `reset` and the
 * client ceiling.
 */
export function useSiteCheck(): SiteCheckState & SiteCheckActions {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const stateRef = useRef(state);
  const runIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const ceilingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ceilingHitRunRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const replacedRef = useRef<ReplacedReport | null>(null);

  useLayoutEffect(() => {
    stateRef.current = state;
  });

  const clearCeiling = useCallback(() => {
    if (ceilingTimerRef.current !== null) {
      clearTimeout(ceilingTimerRef.current);
      ceilingTimerRef.current = null;
    }
  }, []);

  const stopRun = useCallback(() => {
    clearCeiling();
    const controller = controllerRef.current;
    controllerRef.current = null;
    controller?.abort();
  }, [clearCeiling]);

  const armCeiling = useCallback(
    (runId: number, totalMs: number) => {
      clearCeiling();
      const remaining = Math.max(0, startedAtRef.current + totalMs - performance.now());
      ceilingTimerRef.current = setTimeout(() => {
        ceilingTimerRef.current = null;
        if (runIdRef.current !== runId) return;
        ceilingHitRunRef.current = runId;
        controllerRef.current?.abort();
      }, remaining);
    },
    [clearCeiling]
  );

  const start = useCallback(
    (rawUrl: string, opts: { token?: string; source?: ScanSource } = {}) => {
      const url = normalizeWebsiteInput(rawUrl);
      if (!isScannableUrl(url)) {
        // A bad `?url=` must not re-run its error on every reload.
        if (opts.source === 'auto') writeUrlParam(null);
        dispatch({ type: 'field-error', message: EMPTY_INPUT_MESSAGE, url });
        return;
      }

      const source = opts.source ?? 'form';
      const latest = stateRef.current;
      if (source !== 'rescan' && latest.current) {
        replacedRef.current = { current: latest.current, requestedUrl: latest.requestedUrl };
      } else if (source !== 'rescan' && !opts.token) {
        replacedRef.current = null;
      }

      stopRun();
      runIdRef.current += 1;
      const runId = runIdRef.current;
      const controller = new AbortController();
      controllerRef.current = controller;
      startedAtRef.current = performance.now();
      writeUrlParam(url);
      dispatch({
        type: 'start',
        runId,
        url,
        source,
        token: Boolean(opts.token),
        startedAt: startedAtRef.current,
      });
      armCeiling(runId, SCAN_CLIENT_CEILING_MS);

      requestSiteCheck(url, { token: opts.token, signal: controller.signal }).then(
        (result) => {
          if (runIdRef.current !== runId) return;
          clearCeiling();
          controllerRef.current = null;
          let analysis: SiteAnalysis;
          try {
            analysis = analyzeSiteCheck(result);
          } catch (caught) {
            dispatch({
              type: 'fail',
              runId,
              error: {
                kind: 'checker',
                message: caught instanceof Error ? caught.message : String(caught),
                retryAfterSeconds: null,
              },
            });
            return;
          }
          replacedRef.current = null;
          dispatch({ type: 'done', runId, outcome: { result, analysis } });
        },
        (caught: unknown) => {
          if (runIdRef.current !== runId) return;
          clearCeiling();
          controllerRef.current = null;
          if (caught instanceof CheckerTurnstileError) {
            dispatch({
              type: 'challenge',
              runId,
              siteKey: caught.siteKey,
              retryAfterSeconds: caught.retryAfterSeconds,
            });
            return;
          }
          const error = classifyRequestError(caught, { ceiling: ceilingHitRunRef.current === runId });
          if (error) {
            const restore = error.kind === 'invalid' && !stateRef.current.current ? replacedRef.current : null;
            if (error.kind === 'invalid' && !stateRef.current.current) {
              // Only an address that was actually scanned belongs in `?url=`.
              writeUrlParam(restore ? restore.requestedUrl : null);
              replacedRef.current = null;
            }
            dispatch({ type: 'fail', runId, error, restore });
          }
        }
      );
    },
    [armCeiling, clearCeiling, stopRun]
  );

  const cancel = useCallback(() => {
    stopRun();
    runIdRef.current += 1;
    // A cancelled first scan goes back to the landing; a reload must not re-run it.
    if (!stateRef.current.current) writeUrlParam(null);
    replacedRef.current = null;
    dispatch({ type: 'cancel', runId: runIdRef.current });
  }, [stopRun]);

  const reset = useCallback(() => {
    stopRun();
    runIdRef.current += 1;
    replacedRef.current = null;
    writeUrlParam(null);
    dispatch({ type: 'reset', runId: runIdRef.current });
  }, [stopRun]);

  const submitToken = useCallback(
    (token: string) => {
      const latest = stateRef.current;
      // A widget callback that lands after cancel, reset or a newer start is obsolete.
      if (latest.phase !== 'challenged') return;
      start(latest.requestedUrl, { token, source: latest.current ? 'rescan' : 'form' });
    },
    [start]
  );

  const setChallengeNote = useCallback((note: string | null) => {
    dispatch({ type: 'challenge-note', note });
  }, []);

  const keepWaiting = useCallback(() => {
    if (stateRef.current.phase !== 'scanning') return;
    dispatch({ type: 'keep-waiting' });
    armCeiling(runIdRef.current, SCAN_CLIENT_CEILING_EXTENDED_MS);
  }, [armCeiling]);

  return { ...state, start, cancel, reset, submitToken, setChallengeNote, keepWaiting };
}
