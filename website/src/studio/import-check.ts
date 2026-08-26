import { analyzeSiteCheck } from '../checker/analyze';
import type {
  CheckerErrorResponse,
  RemoteResource,
  SiteAnalysis,
  SiteCheckResponse,
} from '../checker/types';
import { normalizeWebsiteInput } from '../normalizeWebsiteInput';
import { LIMITS } from './types';
import type { InspectSiteOutcome, StudioDraft } from './types';

const CHECK_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_SIZE = 6 * 1024 * 1024;
const SUMMARY_LIMIT = 1_200;
const FINDINGS_LIMIT = 10;
const FINDING_TITLE_LIMIT = 80;

export async function inspectSite(
  url: string,
  fetchImpl?: typeof fetch
): Promise<InspectSiteOutcome> {
  const normalizedUrl = normalizeInspectUrl(url);
  if (!normalizedUrl) {
    return failure(
      'invalid_url',
      'Enter a valid public website URL using http or https.'
    );
  }

  const controller = new AbortController();
  let timeoutTriggered = false;
  const timeoutId = globalThis.setTimeout(() => {
    timeoutTriggered = true;
    controller.abort();
  }, CHECK_TIMEOUT_MS);

  try {
    const request = fetchImpl ?? globalThis.fetch;
    const response = await request('/api/check', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ url: normalizedUrl }),
      signal: controller.signal,
    });

    const declaredContentLength = Number(
      response.headers?.get('content-length')
    );
    if (
      Number.isFinite(declaredContentLength) &&
      declaredContentLength > MAX_RESPONSE_SIZE
    ) {
      return responseTooLarge();
    }

    const responseText =
      typeof response.text === 'function'
        ? await response.text().catch(() => null)
        : await response
            .json()
            .then((value) => JSON.stringify(value) ?? null)
            .catch(() => null);
    if (responseText !== null && responseText.length > MAX_RESPONSE_SIZE) {
      return responseTooLarge();
    }

    let payload: unknown = null;
    if (responseText !== null) {
      try {
        payload = JSON.parse(responseText);
      } catch {
        // Preserve status-specific handling for non-JSON error responses.
      }
    }
    const checkerError = parseCheckerError(payload);

    if (checkerError?.turnstileRequired === true) {
      return {
        ok: false,
        humanActionNeeded: 'turnstile',
        errorCode: 'turnstile_required',
        summaryText:
          'Human action needed: complete the checker verification on the page, then run inspect_site again.',
      };
    }

    if (response.status === 429) {
      return {
        ok: false,
        humanActionNeeded: 'rate-limited',
        errorCode: 'rate_limited',
        summaryText: buildRateLimitSummary(checkerError?.retryAfterSeconds),
      };
    }

    if (response.status !== 200 || !response.ok || !isSiteCheckResponse(payload)) {
      return failure(
        'fetch_failed',
        'The site checker could not complete this request.'
      );
    }

    const origin = getHttpOrigin(payload.origin);
    if (!origin) {
      return failure(
        'fetch_failed',
        'The site checker returned an invalid site origin.'
      );
    }

    const analysis = analyzeSiteCheck(payload);
    const nestedPatch = {
      identity: { site: origin },
      content: {
        markdownMirrors: {
          enabled: payload.homepageMarkdown?.ok === true,
          exclude: [],
        },
      },
    };

    return {
      ok: true,
      summaryText: buildSummary(analysis, payload),
      findings: analysis.items.slice(0, FINDINGS_LIMIT).map((item) => ({
        level: item.level,
        title: normalizeFindingTitle(item.title),
      })),
      // IMPORT_FROM_CHECK accepts nested partial slices. The shared outcome
      // type is intentionally broader but uses a shallow Partial<StudioDraft>.
      draftPatch: nestedPatch as unknown as Partial<StudioDraft>,
      sourceUrl: origin,
    };
  } catch (error) {
    if (timeoutTriggered || isAbortError(error)) {
      return failure(
        'timeout',
        'The site checker timed out after 30 seconds. Try again.'
      );
    }

    return failure(
      'fetch_failed',
      'The site checker could not be reached or returned invalid data.'
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function normalizeInspectUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > LIMITS.url) {
    return null;
  }

  const normalized = normalizeWebsiteInput(trimmed);
  if (!normalized || normalized.length > LIMITS.url) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? normalized
      : null;
  } catch {
    return null;
  }
}

function getHttpOrigin(value: string): string | null {
  if (value.length > LIMITS.url) {
    return null;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}

function buildSummary(
  analysis: SiteAnalysis,
  response: SiteCheckResponse
): string {
  const lines = [
    `Finding counts: error ${analysis.counts.error}, warning ${analysis.counts.warning}, pass ${analysis.counts.pass}.`,
  ];

  if (response.llmsTxt.ok) {
    lines.push('llms.txt: present on the checked site.');
  }

  lines.push(
    ...analysis.items.map(
      (item) => `${item.level}: ${normalizeSummaryTitle(item.title)}`
    )
  );

  return joinWithinLimit(lines, SUMMARY_LIMIT);
}

function normalizeSummaryTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, LIMITS.shortText);
}

function normalizeFindingTitle(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, FINDING_TITLE_LIMIT);
}

function joinWithinLimit(lines: string[], maxLength: number): string {
  let result = '';

  for (const line of lines) {
    const next = result ? `${result}\n${line}` : line;
    if (next.length > maxLength) {
      break;
    }
    result = next;
  }

  return result.slice(0, maxLength);
}

function buildRateLimitSummary(retryAfterSeconds: number | null | undefined): string {
  if (
    typeof retryAfterSeconds === 'number' &&
    Number.isFinite(retryAfterSeconds) &&
    retryAfterSeconds > 0
  ) {
    const seconds = Math.ceil(retryAfterSeconds);
    return `The site checker is rate-limited. Wait about ${seconds} second${seconds === 1 ? '' : 's'} before trying again.`;
  }

  return 'The site checker is rate-limited. Wait before trying again.';
}

function failure(errorCode: string, summaryText: string): InspectSiteOutcome {
  return {
    ok: false,
    errorCode,
    summaryText: summaryText.slice(0, SUMMARY_LIMIT),
  };
}

function responseTooLarge(): InspectSiteOutcome {
  return failure(
    'response_too_large',
    'The site checker response was too large to inspect safely.'
  );
}

function parseCheckerError(value: unknown): CheckerErrorResponse | null {
  if (!isRecord(value) || typeof value.error !== 'string') {
    return null;
  }

  return {
    error: value.error,
    ...(isOptionalFiniteNumber(value.retryAfterSeconds)
      ? { retryAfterSeconds: value.retryAfterSeconds }
      : {}),
    ...(typeof value.turnstileRequired === 'boolean'
      ? { turnstileRequired: value.turnstileRequired }
      : {}),
    ...(typeof value.turnstileSiteKey === 'string' || value.turnstileSiteKey === null
      ? { turnstileSiteKey: value.turnstileSiteKey }
      : {}),
  };
}

function isSiteCheckResponse(value: unknown): value is SiteCheckResponse {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.targetUrl === 'string' &&
    getHttpOrigin(value.targetUrl) !== null &&
    typeof value.origin === 'string' &&
    typeof value.fetchedAt === 'string' &&
    isNullableString(value.normalizedFrom) &&
    isRemoteResource(value.homepage) &&
    isNullableRemoteResource(value.homepageMarkdown) &&
    isRemoteResource(value.llmsTxt) &&
    isRemoteResource(value.robotsTxt) &&
    isNullableRemoteResource(value.sitemap) &&
    isNullableString(value.sitemapUrl) &&
    (value.sitemapSource === 'robots' ||
      value.sitemapSource === 'default' ||
      value.sitemapSource === null) &&
    (value.notFoundProbe === undefined ||
      isNullableRemoteResource(value.notFoundProbe)) &&
    isNullableRemoteResource(value.samplePage) &&
    isNullableRemoteResource(value.samplePageMarkdown)
  );
}

function isRemoteResource(value: unknown): value is RemoteResource {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.requestedUrl === 'string' &&
    typeof value.finalUrl === 'string' &&
    typeof value.status === 'number' &&
    Number.isFinite(value.status) &&
    typeof value.ok === 'boolean' &&
    isNullableString(value.contentType) &&
    isNullableString(value.body) &&
    (value.error === undefined || typeof value.error === 'string') &&
    (value.xRobotsTag === undefined || isNullableString(value.xRobotsTag))
  );
}

function isNullableRemoteResource(
  value: unknown
): value is RemoteResource | null {
  return value === null || isRemoteResource(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isOptionalFiniteNumber(value: unknown): value is number | null {
  return value === null ||
    (typeof value === 'number' && Number.isFinite(value));
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === 'AbortError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
