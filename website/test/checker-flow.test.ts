// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement, StrictMode, useLayoutEffect, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CheckerRequestError, classifyRequestError, requestSiteCheck } from '../src/checker/request';
import { isScannableUrl, useSiteCheck } from '../src/checker/use-site-check';
import Checker from '../src/pages/Checker';
import { ORIGIN, siteCheck, timedOut } from './helpers/score-fixture';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// happy-dom rewrites import.meta.url, so resolve from the test file's directory.
const websiteRoot = `${resolve(__dirname, '..')}/`;

interface PendingFetch {
  init: RequestInit;
  resolve(response: Response): void;
  reject(error: unknown): void;
}

let pending: PendingFetch[] = [];
let honorAbort = true;
let fetchMock: ReturnType<typeof vi.fn>;
let scrollToMock: ReturnType<typeof vi.fn>;
let scrollIntoViewMock: ReturnType<typeof vi.fn>;
let focusSpy: ReturnType<typeof vi.spyOn>;
const roots: Array<{ root: Root; container: HTMLElement }> = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 20; index += 1) {
      await Promise.resolve();
    }
  });
}

async function mount(element: ReactElement): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  await act(async () => {
    root.render(element);
  });
  return container;
}

function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** The report's Rescan action (ReportActions renders it without a dedicated class). */
function rescanButton(container: HTMLElement): HTMLButtonElement | null {
  const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('.report-actions button'));
  return buttons.find((button) => button.textContent?.trim() === 'Rescan') ?? null;
}

function liveRegion(container: HTMLElement): string {
  return container.querySelector('main > p[role="status"]')?.textContent ?? '';
}

function buttonByText(container: ParentNode, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label
  );
  if (!button) throw new Error(`no button labelled ${label}`);
  return button;
}

/** Type a URL into the landing and submit; returns the landing's submit button as it was at submit time. */
async function submitLanding(container: HTMLElement, url: string): Promise<HTMLButtonElement> {
  const input = container.querySelector<HTMLInputElement>('#checker-url');
  const form = container.querySelector<HTMLFormElement>('form.checker-form');
  const button = container.querySelector<HTMLButtonElement>('form.checker-form button[type="submit"]');
  if (!input || !form || !button) throw new Error('landing form missing');
  await act(async () => {
    typeInto(input, url);
  });
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  return button;
}

type SiteCheckApi = ReturnType<typeof useSiteCheck>;

/** Mounts the hook alone; `holder.api` is the latest committed hook value. */
async function mountHarness(): Promise<{ holder: { api: SiteCheckApi | null }; container: HTMLElement }> {
  const holder: { api: SiteCheckApi | null } = { api: null };
  function Harness() {
    const api = useSiteCheck();
    useLayoutEffect(() => {
      holder.api = api;
    });
    return createElement('p', { className: 'phase' }, api.phase);
  }
  const container = await mount(createElement(Harness));
  return { holder, container };
}

async function finishWith(index: number, response: Response): Promise<void> {
  await act(async () => {
    pending[index].resolve(response);
  });
  await flush();
}

beforeEach(() => {
  pending = [];
  honorAbort = true;
  window.history.replaceState({}, '', '/checker/');
  document.documentElement.removeAttribute('data-theme');
  fetchMock = vi.fn(
    (_input: RequestInfo | URL, init: RequestInit = {}) =>
      new Promise<Response>((resolve, reject) => {
        pending.push({ init, resolve, reject });
        if (honorAbort) {
          init.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
        }
      })
  );
  vi.stubGlobal('fetch', fetchMock);
  scrollToMock = vi.fn();
  window.scrollTo = scrollToMock as unknown as typeof window.scrollTo;
  scrollIntoViewMock = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoViewMock as unknown as typeof Element.prototype.scrollIntoView;
  focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
  Object.defineProperty(window, 'scrollY', { value: 640, configurable: true, writable: true });
});

afterEach(async () => {
  for (const { root, container } of roots.splice(0)) {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete window.turnstile;
});

describe('checker flow (deploy 1 shell)', () => {
  it('prerenders the landing with an empty live region and no report shell', () => {
    const html = renderToString(createElement(Checker));
    const container = document.createElement('div');
    container.innerHTML = html;
    expect(container.querySelector('.checker-start')).not.toBeNull();
    expect(container.querySelector('.report')).toBeNull();
    expect(container.querySelector('main > p[role="status"][aria-live="polite"]')?.textContent).toBe('');
    expect(container.querySelectorAll('.checker-goals li')).toHaveLength(6);
    expect(container.querySelector('.checker-promise')?.textContent).toContain('Usually under 10 seconds');
    expect(container.querySelector('form.checker-form button[type="submit"]')?.hasAttribute('disabled')).toBe(false);
  });

  it('puts the shell at the top on submit, focuses the domain without scrolling, and leaves it in place when the report lands', async () => {
    const container = await mount(createElement(Checker));
    const landingButton = await submitLanding(container, 'www.example.com');

    expect(container.querySelector('.checker-start')).toBeNull();
    const report = container.querySelector('article.report');
    expect(report).not.toBeNull();
    expect(report?.classList.contains('doc-page')).toBe(false);
    expect(report?.getAttribute('aria-busy')).toBe('true');

    const header = container.querySelector('.report-header');
    const hero = container.querySelector('.report-hero');
    expect(header).not.toBeNull();
    expect(hero?.querySelector('.scan-progress')).not.toBeNull();
    expect(header!.compareDocumentPosition(hero!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('.report-skeleton .report-skeleton-row')).not.toBeNull();

    expect(landingButton.getAttribute('aria-disabled')).toBe('true');
    expect(landingButton.classList.contains('is-busy')).toBe(true);
    expect(landingButton.hasAttribute('disabled')).toBe(false);

    const heading = container.querySelector('h1.report-domain');
    expect(heading?.textContent).toBe('example.com');
    expect(document.activeElement).toBe(heading);
    expect(focusSpy.mock.calls.length).toBeGreaterThan(0);
    for (const call of focusSpy.mock.calls) {
      expect(call[0]).toEqual({ preventScroll: true });
    }
    expect(liveRegion(container)).toBe('Scanning www.example.com.');
    expect(scrollToMock).toHaveBeenCalledTimes(1);
    expect(scrollToMock).toHaveBeenCalledWith({ top: 0 });
    expect(new URL(window.location.href).searchParams.get('url')).toBe('https://www.example.com');

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String((init as RequestInit).body)).url).toBe('https://www.example.com');

    await finishWith(0, jsonResponse(siteCheck()));

    expect(container.querySelector('.report-body')).not.toBeNull();
    expect(container.querySelector('.report-hero.is-skeleton')).toBeNull();
    expect(container.querySelector('article.report')?.getAttribute('aria-busy')).toBe('false');
    expect(scrollToMock).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(container.querySelector('h1.report-domain'));
    expect(liveRegion(container)).toMatch(/^Report ready for www\.example\.com: score \d+ of 100, grade /);
    for (const call of focusSpy.mock.calls) {
      expect(call[0]).toEqual({ preventScroll: true });
    }

    // Section 3: the marketing h1, the "Results for" heading and the verdict/counts card are gone.
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.textContent).not.toContain('Results for');
    expect(container.querySelector('.checker-summary')).toBeNull();
    expect(container.querySelector('.checker-counts')).toBeNull();
    expect(container.querySelector('.report-meta')?.textContent).toContain('Scanned ');
  });

  it('keeps the old report and shows a banner when a rescan fails', async () => {
    const container = await mount(createElement(Checker));
    await submitLanding(container, 'www.example.com');
    await finishWith(0, jsonResponse(siteCheck()));

    const rescan = rescanButton(container);
    expect(rescan).not.toBeNull();
    await act(async () => {
      rescan!.click();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector('.report-body')).not.toBeNull();
    expect(container.querySelector('.report-hero.is-skeleton')).toBeNull();
    expect(rescanButton(container)?.getAttribute('aria-disabled')).toBe('true');
    expect(container.querySelector('.report-sections')?.hasAttribute('inert')).toBe(true);
    expect(container.querySelector('.report-meta')?.textContent).toContain('Scanning again');
    expect(liveRegion(container)).toBe('Scanning www.example.com again.');

    await finishWith(1, jsonResponse({ error: 'The checker hit an internal error. Try again in a moment.', code: 'checker_error' }, 500));

    expect(container.querySelector('.report-body')).not.toBeNull();
    const banner = container.querySelector('.report-banner .scan-notice[data-variant="banner"]');
    expect(banner?.textContent).toContain('Rescan failed');
    expect(banner?.getAttribute('role')).toBe('alert');
    expect(document.activeElement).toBe(banner?.querySelector('h2'));
    expect(scrollToMock).toHaveBeenCalledTimes(1);
  });

  it('drops a late response after reset and removes ?url= from the address', async () => {
    honorAbort = false;
    const { holder, container } = await mountHarness();

    await act(async () => {
      holder.api!.start('example.com');
    });
    expect(holder.api!.phase).toBe('scanning');
    expect(new URL(window.location.href).searchParams.get('url')).toBe('https://example.com');

    await act(async () => {
      holder.api!.reset();
    });
    expect(new URL(window.location.href).searchParams.has('url')).toBe(false);

    await finishWith(0, jsonResponse(siteCheck()));
    expect(holder.api!.phase).toBe('idle');
    expect(holder.api!.current).toBeNull();
    expect(container.querySelector('.phase')?.textContent).toBe('idle');
  });

  it('drops a stale answer when a newer scan has started', async () => {
    honorAbort = false;
    const { holder } = await mountHarness();
    await act(async () => {
      holder.api!.start('first.example');
    });
    await act(async () => {
      holder.api!.start('www.example.com');
    });
    await finishWith(0, jsonResponse({ error: 'late', code: 'checker_error' }, 500));
    expect(holder.api!.phase).toBe('scanning');
    expect(holder.api!.error).toBeNull();
    await finishWith(1, jsonResponse(siteCheck()));
    expect(holder.api!.phase).toBe('done');
    expect(holder.api!.requestedUrl).toBe('https://www.example.com');
  });

  it('shows the rate-limit card with a live countdown', async () => {
    const container = await mount(createElement(Checker));
    await submitLanding(container, 'example.com');
    await finishWith(
      0,
      jsonResponse(
        { error: 'Too many checker or security scan requests came from this IP recently.', code: 'rate_limited', retryAfterSeconds: 192 },
        429
      )
    );

    const card = container.querySelector('.scan-notice-error[data-variant="card"]');
    expect(card?.querySelector('.scan-notice-title')?.textContent).toBe("You have used this network's free scans for now");
    expect(card?.textContent).toContain('3:12');
    expect(card?.textContent).not.toContain('IP');
    expect(document.activeElement).toBe(card?.querySelector('h2'));
    expect(card?.closest('.report')?.querySelector('.report-header')).not.toBeNull();
  });

  it('renders the Turnstile challenge in view and keeps an expired note inside the same card', async () => {
    let options: Record<string, unknown> | null = null;
    const render = vi.fn((_el: HTMLElement, opts: Record<string, unknown>) => {
      options = opts;
      return 'widget-1';
    });
    window.turnstile = { render, remove: vi.fn() } as unknown as typeof window.turnstile;

    const container = await mount(createElement(Checker));
    await submitLanding(container, 'anaf.ro');
    await finishWith(
      0,
      jsonResponse(
        {
          error: 'Additional verification is required before running more checks from this IP.',
          code: 'verification_required',
          turnstileRequired: true,
          turnstileSiteKey: 'site-key',
          retryAfterSeconds: null,
        },
        403
      )
    );

    const card = container.querySelector('.report .scan-notice-challenge');
    expect(card).not.toBeNull();
    expect(card?.querySelector('h2')?.textContent).toBe('Confirm you are human to scan anaf.ro');
    expect(document.activeElement).toBe(card?.querySelector('h2'));
    expect(liveRegion(container)).toBe('One quick check is needed before the scan.');
    expect(render).toHaveBeenCalledTimes(1);
    expect(options!.theme).toBe('dark');
    expect(container.textContent).not.toContain('from this IP');

    await act(async () => {
      (options!['expired-callback'] as () => void)();
    });
    expect(container.querySelector('.scan-notice-challenge')?.textContent).toContain('The check expired.');
    expect(container.querySelector('.scan-notice-error')).toBeNull();

    await act(async () => {
      buttonByText(container, 'Show it again').click();
    });
    await flush();
    expect(render).toHaveBeenCalledTimes(2);

    await act(async () => {
      (options!.callback as (token: string) => void)('token-1');
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, init] = fetchMock.mock.calls[1];
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ url: 'https://anaf.ro', turnstileToken: 'token-1' });
    expect(container.querySelector('.report-hero .scan-progress')).not.toBeNull();
  });

  it('runs ?url= exactly once under StrictMode and settles into a report', async () => {
    window.history.replaceState({}, '', '/checker/?url=example.com');
    const container = await mount(createElement(StrictMode, null, createElement(Checker)));
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.report .scan-progress')).not.toBeNull();
    expect(new URL(window.location.href).searchParams.get('url')).toBe('https://example.com');

    await finishWith(0, jsonResponse(siteCheck()));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.report-body')).not.toBeNull();
    expect(liveRegion(container)).toMatch(/^Report ready for/);
  });

  it('returns to the landing with the input filled when a first scan is cancelled', async () => {
    const container = await mount(createElement(Checker));
    await submitLanding(container, 'example.com');

    await act(async () => {
      buttonByText(container.querySelector('.scan-bar')!, 'Cancel').click();
    });
    await flush();

    expect(container.querySelector('.report')).toBeNull();
    const input = container.querySelector<HTMLInputElement>('#checker-url');
    expect(input?.value).toBe('https://example.com');
    expect(document.activeElement).toBe(input);
    expect(liveRegion(container)).toBe('Scan cancelled.');
    const button = container.querySelector('form.checker-form button[type="submit"]');
    expect(button?.getAttribute('aria-disabled')).toBeNull();
    expect(button?.classList.contains('is-busy')).toBe(false);
  });

  it('shows the slow prompt at 30 s and the timeout card at the 45 s ceiling', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    const container = await mount(createElement(Checker));
    await submitLanding(container, 'slow.example');

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(container.querySelector('.scan-progress .scan-files')).not.toBeNull();
    expect(container.querySelector('.scan-progress-note')?.textContent).toContain('One request, one answer');

    await act(async () => {
      vi.advanceTimersByTime(6_000);
    });
    expect(container.querySelector('.scan-progress-note')?.textContent).toContain('shared hosting');

    await act(async () => {
      vi.advanceTimersByTime(24_000);
    });
    expect(container.querySelector('.scan-progress-note')?.textContent).toContain('(25 seconds)');
    expect(container.querySelector('.scan-progress-actions')?.textContent).toContain('Keep waiting');

    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    await flush();
    const card = container.querySelector('.scan-notice-error[data-variant="card"]');
    expect(card?.querySelector('.scan-notice-title')?.textContent).toBe('The checker did not answer in time');
    expect(card?.textContent).toContain('Nothing was counted against slow.example.');
  });

  it('extends the ceiling once after Keep waiting', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    const container = await mount(createElement(Checker));
    await submitLanding(container, 'slow.example');
    await act(async () => {
      vi.advanceTimersByTime(30_100);
    });
    await act(async () => {
      buttonByText(container, 'Keep waiting').click();
    });
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    await flush();
    expect(container.querySelector('.scan-notice-error')).toBeNull();
    expect(container.querySelector('.scan-progress')).not.toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(25_000);
    });
    await flush();
    expect(container.querySelector('.scan-notice-error .scan-notice-title')?.textContent).toBe('The checker did not answer in time');
  });

  it('keeps the shell sources free of em and en dashes and the editorial serif', () => {
    const files = [
      'src/pages/Checker.tsx',
      'src/checker/request.ts',
      'src/checker/use-site-check.ts',
      'src/checker/scan-meta.ts',
      'src/ui/report/ReportShell.tsx',
      'src/ui/report/ScanBar.tsx',
      'src/ui/report/ScanProgress.tsx',
      'src/ui/report/ScanNotice.tsx',
      'src/ui/report/ReportSkeleton.tsx',
      'src/ui/report/scan.css',
    ];
    for (const file of files) {
      const source = readFileSync(`${websiteRoot}${file}`, 'utf8');
      expect(source, file).not.toMatch(/[\u2013\u2014]/);
    }
    expect(readFileSync(`${websiteRoot}src/ui/report/scan.css`, 'utf8')).not.toContain('font-editorial');
  });
});

describe('checker flow: refused addresses, cancel and phone layout (critic fixes)', () => {
  it('gates unparseable input on the client: no request, no report shell, the landing keeps the input', async () => {
    const container = await mount(createElement(Checker));
    const button = await submitLanding(container, 'not a url');
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector('.report')).toBeNull();
    expect(container.querySelector('.report-header')).toBeNull();
    expect(container.querySelector('#checker-url-error')?.textContent).toContain('Enter a website address, for example example.com.');
    expect(button.getAttribute('aria-disabled')).toBeNull();
    expect(button.classList.contains('is-busy')).toBe(false);
    expect(new URL(window.location.href).searchParams.has('url')).toBe(false);
  });

  it('sends a first scan the worker refuses back to the landing with its message, the input filled and no ?url=', async () => {
    const container = await mount(createElement(Checker));
    await submitLanding(container, '10.0.0.1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.report-header')).not.toBeNull();

    await finishWith(0, jsonResponse({ error: 'Enter a public http:// or https:// website URL.', code: 'invalid_request' }, 400));

    expect(container.querySelector('.report')).toBeNull();
    expect(container.querySelector('.report-header')).toBeNull();
    const input = container.querySelector<HTMLInputElement>('#checker-url');
    expect(input?.value).toBe('https://10.0.0.1');
    expect(container.querySelector('#checker-url-error')?.textContent).toContain('Enter a public http:// or https:// website URL.');
    expect(document.activeElement).toBe(input);
    expect(new URL(window.location.href).searchParams.has('url')).toBe(false);
    const button = container.querySelector('form.checker-form button[type="submit"]');
    expect(button?.getAttribute('aria-disabled')).toBeNull();
  });

  it('keeps the report on screen when a new address typed in the ScanBar is refused', async () => {
    const container = await mount(createElement(Checker));
    await submitLanding(container, 'www.example.com');
    await finishWith(0, jsonResponse(siteCheck()));
    expect(container.querySelector('.report-body')).not.toBeNull();
    const before = container.querySelector('.report-domain')?.textContent;

    const input = container.querySelector<HTMLInputElement>('#scan-bar-url');
    const form = container.querySelector<HTMLFormElement>('form.scan-bar');
    await act(async () => {
      typeInto(input!, '10.0.0.1');
    });
    await act(async () => {
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await finishWith(1, jsonResponse({ error: 'Enter a public http:// or https:// website URL.', code: 'invalid_request' }, 400));

    expect(container.querySelector('.report-body')).not.toBeNull();
    expect(container.querySelector('.report-domain')?.textContent).toBe(before);
    expect(container.querySelector('#scan-bar-error')?.textContent).toContain('Enter a public http:// or https:// website URL.');
    expect(container.querySelector('.scan-notice')).toBeNull();
    expect(new URL(window.location.href).searchParams.get('url')).toBe('https://www.example.com');
  });

  it('removes ?url= when a first scan is cancelled', async () => {
    const container = await mount(createElement(Checker));
    await submitLanding(container, 'example.com');
    expect(new URL(window.location.href).searchParams.get('url')).toBe('https://example.com');
    await act(async () => {
      buttonByText(container.querySelector('.scan-bar')!, 'Cancel').click();
    });
    await flush();
    expect(new URL(window.location.href).searchParams.has('url')).toBe(false);
  });

  it('accepts hosts with a dot or a bracketed IPv6 literal, nothing else', () => {
    for (const ok of ['https://example.com', 'https://www.example.co.uk/path', 'http://10.0.0.1', 'https://[2001:db8::1]']) {
      expect(isScannableUrl(ok), ok).toBe(true);
    }
    for (const bad of ['', 'https://not a url', 'https://not%20a%20url', 'https://localhost', 'ftp://example.com', 'https://.example']) {
      expect(isScannableUrl(bad), bad).toBe(false);
    }
  });

  it('classifies every request failure as spec 4.5 says', () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    expect(classifyRequestError(abort, { ceiling: false })).toBeNull();
    expect(classifyRequestError(abort, { ceiling: true })?.kind).toBe('timeout');
    expect(classifyRequestError(new TypeError('Failed to fetch'), { ceiling: false })?.kind).toBe('network');
    const json = (code: string | null, status: number) => new CheckerRequestError('message', { code, status, json: true });
    expect(classifyRequestError(new CheckerRequestError('m', { code: 'rate_limited', retryAfterSeconds: 90, status: 429 }), { ceiling: false })).toEqual({
      kind: 'rate-limited',
      message: 'm',
      retryAfterSeconds: 90,
    });
    expect(classifyRequestError(json('invalid_request', 400), { ceiling: false })?.kind).toBe('invalid');
    expect(classifyRequestError(json('cross_site_forbidden', 403), { ceiling: false })?.kind).toBe('forbidden');
    expect(classifyRequestError(json('checker_error', 500), { ceiling: false })?.kind).toBe('checker');
    expect(classifyRequestError(json('not_found', 404), { ceiling: false })?.kind).toBe('checker');
    expect(classifyRequestError(json(null, 500), { ceiling: false })?.kind).toBe('checker');
    expect(classifyRequestError(new Error('odd'), { ceiling: false })?.kind).toBe('checker');

    const nonJson = new CheckerRequestError('not json', { status: 404, json: false });
    const local = ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
    expect(classifyRequestError(nonJson, { ceiling: false })?.kind).toBe(local ? 'local-dev' : 'unavailable');
    const happyDOM = (window as unknown as { happyDOM?: { setURL(url: string): void } }).happyDOM;
    if (happyDOM) {
      const original = window.location.href;
      happyDOM.setURL('https://agentmarkup.dev/checker/');
      expect(classifyRequestError(nonJson, { ceiling: false })?.kind).toBe('unavailable');
      happyDOM.setURL('http://localhost:5173/checker/');
      expect(classifyRequestError(nonJson, { ceiling: false })?.kind).toBe('local-dev');
      happyDOM.setURL(original);
    }
  });

  it('refocuses the landing input when the same address is rejected twice in a row', async () => {
    const container = await mount(createElement(Checker));
    const input = container.querySelector<HTMLInputElement>('#checker-url');
    await submitLanding(container, 'not a url');
    await flush();
    expect(document.activeElement).toBe(input);

    await act(async () => {
      input?.blur();
      document.body.focus();
    });
    expect(document.activeElement).not.toBe(input);

    const form = container.querySelector<HTMLFormElement>('form.checker-form');
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector('#checker-url-error')?.textContent).toContain('Enter a website address');
    expect(document.activeElement).toBe(input);
  });

  it('ignores a Turnstile token that arrives after a newer scan replaced the challenge', async () => {
    let options: Record<string, unknown> | null = null;
    const render = vi.fn((_el: HTMLElement, opts: Record<string, unknown>) => {
      options = opts;
      return 'widget-1';
    });
    window.turnstile = { render, remove: vi.fn() } as unknown as typeof window.turnstile;

    const container = await mount(createElement(Checker));
    await submitLanding(container, 'anaf.ro');
    await finishWith(
      0,
      jsonResponse(
        { error: 'Additional verification is required.', code: 'verification_required', turnstileRequired: true, turnstileSiteKey: 'site-key', retryAfterSeconds: null },
        403
      )
    );
    expect(container.querySelector('.scan-notice-challenge')).not.toBeNull();
    expect(render).toHaveBeenCalledTimes(1);
    const callback = options!.callback as (token: string) => void;

    // The visitor moves on: a different address typed into the ScanBar starts a newer scan.
    const scanInput = container.querySelector<HTMLInputElement>('#scan-bar-url');
    const scanForm = container.querySelector<HTMLFormElement>('form.scan-bar');
    await act(async () => {
      typeInto(scanInput!, 'example.org');
    });
    await act(async () => {
      scanForm?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector('.scan-notice-challenge')).toBeNull();
    expect(container.querySelector('.report-hero .scan-progress')).not.toBeNull();

    // The old widget's token lands late: it must neither abort the newer scan nor start another.
    await act(async () => {
      callback('late-token');
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(pending[1].init.signal?.aborted).toBe(false);
    expect(container.querySelector('.report-hero .scan-progress')).not.toBeNull();
  });

  it('keeps an abort during the body read an AbortError, so the ceiling still reads as a timeout', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json; charset=utf-8' }),
      json: () => Promise.reject(abort),
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn(async () => response));
    await expect(requestSiteCheck('https://example.com', {})).rejects.toBe(abort);
    expect(classifyRequestError(abort, { ceiling: true })?.kind).toBe('timeout');
  });

  it('moves focus to the domain heading when a provisional report\'s inline Rescan lands a complete report', async () => {
    const container = await mount(createElement(Checker));
    await submitLanding(container, 'www.example.com');
    await finishWith(0, jsonResponse(siteCheck({ llms: timedOut(`${ORIGIN}/llms.txt`) })));

    const inline = container.querySelector<HTMLButtonElement>('button.report-rescan-inline');
    expect(inline).not.toBeNull();
    await act(async () => {
      inline!.focus();
      inline!.click();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(inline);

    await finishWith(1, jsonResponse(siteCheck()));
    expect(container.querySelector('button.report-rescan-inline')).toBeNull();
    expect(document.activeElement).toBe(container.querySelector('.report-domain'));
  });

  it('keeps focus on the Rescan button when it survives the rescan', async () => {
    const container = await mount(createElement(Checker));
    await submitLanding(container, 'www.example.com');
    await finishWith(0, jsonResponse(siteCheck()));
    const rescan = rescanButton(container)!;
    await act(async () => {
      rescan.focus();
      rescan.click();
    });
    await finishWith(1, jsonResponse(siteCheck({ fetchedAt: '2026-11-09T10:00:00.000Z' })));
    expect(document.activeElement).toBe(rescanButton(container));
  });

  it('treats a bare same-host address submitted from the ScanBar as a rescan of the report on screen', async () => {
    const container = await mount(createElement(Checker));
    await submitLanding(container, 'www.example.com');
    await finishWith(0, jsonResponse(siteCheck()));

    const scanInput = container.querySelector<HTMLInputElement>('#scan-bar-url')!;
    const scanForm = container.querySelector<HTMLFormElement>('form.scan-bar')!;
    await act(async () => {
      typeInto(scanInput, 'example.com');
    });
    await act(async () => {
      scanForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, init] = fetchMock.mock.calls[1];
    expect(JSON.parse(String((init as RequestInit).body)).url).toBe('https://www.example.com/');
    expect(container.querySelector('.report-body')).not.toBeNull();
    expect(container.querySelector('.report-hero.is-skeleton')).toBeNull();
    // While the rescan runs the ScanBar shows the host being checked.
    expect(scanInput.value).toBe('www.example.com');
  });

  it('keeps the ScanBar button at auto width on phones (components.css sets .checker-submit to 100% there)', () => {
    const css = readFileSync(`${websiteRoot}src/ui/report/scan.css`, 'utf8');
    const base = css.match(/\.scan-bar \.scan-bar-button\s*\{[^}]*\}/g) ?? [];
    expect(base.length).toBeGreaterThanOrEqual(2);
    for (const rule of base) expect(rule).toMatch(/width:\s*auto/);
    const phone = css.slice(css.indexOf('@media (max-width: 39.99rem)'));
    expect(phone).toMatch(/\.scan-bar \.scan-bar-button\s*\{[^}]*width:\s*auto/);
  });
});
