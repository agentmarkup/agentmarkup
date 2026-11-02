// An abort-honouring fetch stub keyed by pathname, shared by the collector, the
// --score CLI and the worker-parity tests. The collector's and the worker's
// timeouts are setTimeout + AbortController, so a stub that ignored the signal
// would never time out under fake timers. Every call records fake-clock start
// and end times so ordering and concurrency can be asserted.
import { vi } from 'vitest';

export interface Reply {
  status: number;
  body?: string | null;
  headers?: Record<string, string>;
  /** Fake-timer delay before the reply resolves. */
  delayMs?: number;
  /** Never resolve: only the request's abort signal ends the call. */
  never?: boolean;
  /**
   * Serve the body as a pull-based stream in `chunkBytes` chunks whose
   * cancellation is recorded on the call (`bodyCancelled`), so tests can assert
   * the collector released it.
   */
  stream?: boolean;
  chunkBytes?: number;
}

/** `hit` counts earlier requests for the same pathname. */
export type Route = (url: URL, hit: number) => Reply;

export interface Call {
  url: string;
  path: string;
  host: string;
  init: RequestInit;
  startedAt: number;
  endedAt: number | null;
  /** Set when a `stream: true` reply's body was cancelled by the client. */
  bodyCancelled: boolean;
}

export const PROBE_PATH = '/agentmarkup-probe-404-does-not-exist-9f3a2c';
export const PROBE_ACCEPT = 'text/markdown, application/json;q=0.9, text/html;q=0.8, */*;q=0.1';
export const HTML_ACCEPT = 'text/html,text/plain,application/xml,text/xml;q=0.9,*/*;q=0.1';

export const HOMEPAGE_HTML =
  '<!doctype html><html lang="en"><head><title>Example</title><link rel="canonical" href="https://example.com/"></head><body><main><h1>Example</h1><p>Enough text for a homepage.</p><a href="/about/">About</a></main></body></html>';
export const ABOUT_HTML =
  '<!doctype html><html lang="en"><head><title>About</title></head><body><main><h1>About</h1><p>About us.</p></main></body></html>';
export const NOT_FOUND_HTML = '<html><body><h1>Not found</h1></body></html>';
export const ROBOTS_TXT =
  'User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap_index.xml\n';

function abortError() {
  const error = new Error('This operation was aborted');
  error.name = 'AbortError';
  return error;
}

function toResponse(reply: Reply, call: Call) {
  const body = reply.body === undefined ? null : reply.body;
  if (reply.stream && body !== null) {
    const bytes = new TextEncoder().encode(body);
    const chunk = reply.chunkBytes ?? 512;
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close();
          return;
        }
        controller.enqueue(bytes.slice(offset, offset + chunk));
        offset += chunk;
      },
      cancel() {
        call.bodyCancelled = true;
      },
    });
    return new Response(stream, { status: reply.status, headers: reply.headers ?? {} });
  }
  return new Response(body, { status: reply.status, headers: reply.headers ?? {} });
}

export function createFetchStub(routes: Record<string, Route>) {
  const calls: Call[] = [];
  const events: string[] = [];
  const hits = new Map<string, number>();
  let inFlight = 0;
  let maxInFlight = 0;

  const fetchStub = vi.fn((input: string | URL | Request, init: RequestInit = {}) => {
    const urlString =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(urlString);
    const hit = hits.get(url.pathname) ?? 0;
    hits.set(url.pathname, hit + 1);
    const route =
      routes[url.pathname] ?? routes['*'] ?? (() => ({ status: 404, body: NOT_FOUND_HTML }));
    const reply = route(url, hit);
    const call: Call = {
      url: urlString,
      path: url.pathname,
      host: url.hostname,
      init,
      startedAt: Date.now(),
      endedAt: null,
      bodyCancelled: false,
    };
    calls.push(call);
    events.push(`start ${url.pathname}`);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const signal = init.signal as AbortSignal | null | undefined;

    return new Promise<Response>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const settle = (done: () => void) => {
        inFlight -= 1;
        call.endedAt = Date.now();
        events.push(`end ${url.pathname}`);
        done();
      };
      const onAbort = () => {
        if (timer !== undefined) clearTimeout(timer);
        settle(() => reject(abortError()));
      };
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });
      if (!reply.never) {
        timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          settle(() => resolve(toResponse(reply, call)));
        }, reply.delayMs ?? 0);
      }
    });
  });

  return { fetch: fetchStub, calls, events, hits, maxInFlight: () => maxInFlight };
}

export function healthySite(): Record<string, Route> {
  return {
    '/': () => ({
      status: 200,
      body: HOMEPAGE_HTML,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
    '/about/': () => ({
      status: 200,
      body: ABOUT_HTML,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
    '/robots.txt': () => ({ status: 200, body: ROBOTS_TXT, headers: { 'content-type': 'text/plain' } }),
    '/sitemap_index.xml': () => ({
      status: 200,
      body: '<?xml version="1.0"?><sitemapindex></sitemapindex>',
      headers: { 'content-type': 'application/xml' },
    }),
    '/llms.txt': () => ({
      status: 200,
      body: '# Example\n\n> A summary.\n',
      headers: { 'content-type': 'text/plain' },
    }),
    '/index.md': () => ({ status: 404, body: NOT_FOUND_HTML, headers: { 'content-type': 'text/html' } }),
    '/about.md': () => ({ status: 404, body: NOT_FOUND_HTML, headers: { 'content-type': 'text/html' } }),
    [PROBE_PATH]: () => ({ status: 404, body: NOT_FOUND_HTML, headers: { 'content-type': 'text/html' } }),
  };
}

export function withDelay(routes: Record<string, Route>, delayMs: number, except: string[] = []) {
  const delayed: Record<string, Route> = {};
  for (const [path, route] of Object.entries(routes)) {
    delayed[path] = except.includes(path) ? route : (url, hit) => ({ ...route(url, hit), delayMs });
  }
  return delayed;
}

export function callFor(calls: Call[], path: string): Call {
  const call = calls.find((candidate) => candidate.path === path);
  if (!call) throw new Error(`no fetch() call for ${path}`);
  return call;
}

/** Awaits a promise while advancing the fake clock in 1 s steps until it settles. */
export async function settleWithFakeTimers<T>(pending: Promise<T>, maxSteps = 240): Promise<T> {
  let settled = false;
  void pending.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );
  for (let step = 0; step < maxSteps && !settled; step += 1) {
    await vi.advanceTimersByTimeAsync(1000);
  }
  return pending;
}
