import { normalizeWebsiteInput } from '../normalizeWebsiteInput';
import type { CheckerErrorResponse, SiteCheckResponse } from './types';
import type { ScanError } from './use-site-check';

/** A failed `/api/check` call. `code` is the worker's machine code, null when the body was not JSON. */
export class CheckerRequestError extends Error {
  code: string | null;
  retryAfterSeconds: number | null;
  /** HTTP status of the response. */
  status: number;
  /** False when the response was not JSON (no worker behind `/api/check`). */
  json: boolean;

  constructor(
    message: string,
    options: { code?: string | null; retryAfterSeconds?: number | null; status?: number; json?: boolean } = {}
  ) {
    super(message);
    this.name = 'CheckerRequestError';
    this.code = options.code ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
    this.status = options.status ?? 0;
    this.json = options.json ?? true;
  }
}

/** The worker wants a Turnstile token before it runs this check. Not an error for the visitor. */
export class CheckerTurnstileError extends CheckerRequestError {
  siteKey: string;

  constructor(message: string, siteKey: string, retryAfterSeconds: number | null = null, status = 403) {
    super(message, { code: 'verification_required', retryAfterSeconds, status, json: true });
    this.name = 'CheckerTurnstileError';
    this.siteKey = siteKey;
  }
}

/** `about 4 minutes` / `about 30 seconds`, or null when there is nothing to wait for. */
export function retryAfterPhrase(retryAfterSeconds: number | null): string | null {
  if (!retryAfterSeconds || retryAfterSeconds <= 0) {
    return null;
  }
  if (retryAfterSeconds < 60) {
    return `about ${retryAfterSeconds} second${retryAfterSeconds === 1 ? '' : 's'}`;
  }
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `about ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

export function formatRetryAfter(retryAfterSeconds: number | null): string | null {
  const phrase = retryAfterPhrase(retryAfterSeconds);
  return phrase ? `Try again in ${phrase}.` : null;
}

/** One POST to `/api/check`. Throws `CheckerTurnstileError`, `CheckerRequestError`, or whatever `fetch` throws. */
export async function requestSiteCheck(
  url: string,
  opts: { token?: string; signal: AbortSignal }
): Promise<SiteCheckResponse> {
  const response = await fetch('/api/check', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ url: normalizeWebsiteInput(url), turnstileToken: opts.token }),
    signal: opts.signal,
  });

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw new CheckerRequestError(`The checker API did not return JSON (HTTP ${response.status}).`, {
      status: response.status,
      json: false,
    });
  }

  let payload: SiteCheckResponse & Partial<CheckerErrorResponse>;
  try {
    payload = (await response.json()) as SiteCheckResponse & Partial<CheckerErrorResponse>;
  } catch (error) {
    // The client ceiling can abort while the body is still arriving: that is a timeout, not bad JSON.
    if (isAbortError(error)) throw error;
    throw new CheckerRequestError(`The checker API returned unreadable JSON (HTTP ${response.status}).`, {
      status: response.status,
      json: false,
    });
  }

  if (!response.ok) {
    if (payload.turnstileRequired && payload.turnstileSiteKey) {
      throw new CheckerTurnstileError(
        payload.error ?? 'Additional verification is required.',
        payload.turnstileSiteKey,
        payload.retryAfterSeconds ?? null,
        response.status
      );
    }
    throw new CheckerRequestError(payload.error ?? `HTTP ${response.status}`, {
      code: payload.code ?? null,
      retryAfterSeconds: payload.retryAfterSeconds ?? null,
      status: response.status,
      json: true,
    });
  }

  return payload;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: unknown }).name === 'AbortError'
  );
}

function isLocalHost(): boolean {
  return (
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname)
  );
}

/**
 * Section 4.5. Returns null for an abort the visitor caused (cancel, a new start,
 * reset): those are silent. A Turnstile demand is not classified here; the hook
 * handles `CheckerTurnstileError` before calling this.
 */
export function classifyRequestError(error: unknown, ctx: { ceiling: boolean }): ScanError | null {
  const message = error instanceof Error ? error.message : String(error);

  if (isAbortError(error)) {
    return ctx.ceiling ? { kind: 'timeout', message, retryAfterSeconds: null } : null;
  }

  if (error instanceof CheckerRequestError) {
    if (!error.json) {
      return { kind: isLocalHost() ? 'local-dev' : 'unavailable', message, retryAfterSeconds: null };
    }
    switch (error.code) {
      case 'rate_limited':
        return { kind: 'rate-limited', message, retryAfterSeconds: error.retryAfterSeconds };
      case 'invalid_request':
        return { kind: 'invalid', message, retryAfterSeconds: null };
      case 'cross_site_forbidden':
        return { kind: 'forbidden', message, retryAfterSeconds: null };
      default:
        return { kind: 'checker', message, retryAfterSeconds: error.retryAfterSeconds };
    }
  }

  if (error instanceof TypeError) {
    return { kind: 'network', message, retryAfterSeconds: null };
  }

  return { kind: 'checker', message, retryAfterSeconds: null };
}
