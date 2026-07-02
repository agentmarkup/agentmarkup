/**
 * SSRF-safe fetch used by every audit probe. The hostname blocklist mirrors the
 * hardened checker worker (`website/public/_worker.js`) — evaluated as numeric
 * IPs so IPv4-mapped IPv6, `::`, `fe80::/10`, and CGNAT cannot slip through.
 *
 * The audit CLI runs on the user's own machine auditing their own site, so the
 * SSRF surface is lower than the hosted checker, but the same guard keeps the
 * probe honest and lets this module be reused by a future hosted audit.
 */

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;

export interface FetchOptions {
  userAgent: string;
  timeoutMs?: number;
  maxBytes?: number;
  /** Read and return the response body (default true). */
  readBody?: boolean;
}

export interface FetchResult {
  requestedUrl: string;
  finalUrl: string;
  status: number | null;
  ok: boolean;
  headers: Record<string, string>;
  body: string | null;
  bodyBytes: number;
  redirects: number;
  blocked: boolean;
  error?: string;
}

export function parseIpv4(value: string): number[] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  return octets.some((octet) => octet > 255) ? null : octets;
}

function isBlockedIpv4(octets: number[]): boolean {
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

export function parseIpv6(value: string): number[] | null {
  if (!value.includes(':')) return null;

  let head = value;
  const embedded: number[] = [];
  const lastColon = value.lastIndexOf(':');
  const suffix = value.slice(lastColon + 1);
  if (suffix.includes('.')) {
    const v4 = parseIpv4(suffix);
    if (!v4) return null;
    embedded.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
    head = value.slice(0, lastColon);
  }

  const halves = head.split('::');
  if (halves.length > 2) return null;

  const parseGroups = (part: string): number[] =>
    part === ''
      ? []
      : part
          .split(':')
          .map((group) =>
            /^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : NaN
          );

  const left = parseGroups(halves[0]);
  const right = halves.length === 2 ? parseGroups(halves[1]) : null;

  let groups: number[];
  if (right === null) {
    groups = [...left, ...embedded];
  } else {
    const known = left.length + right.length + embedded.length;
    const missing = 8 - known;
    if (missing < 1) return null;
    groups = [...left, ...Array(missing).fill(0), ...right, ...embedded];
  }

  if (groups.length !== 8 || groups.some((group) => Number.isNaN(group))) {
    return null;
  }
  return groups;
}

function isBlockedIpv6(groups: number[]): boolean {
  const [first] = groups;
  if (groups.every((group) => group === 0)) return true;
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) {
    return true;
  }
  const mapped =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  const compatible = groups.slice(0, 6).every((group) => group === 0);
  if (mapped || compatible) {
    return isBlockedIpv4([
      groups[6] >> 8,
      groups[6] & 0xff,
      groups[7] >> 8,
      groups[7] & 0xff,
    ]);
  }
  return (
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xffc0) === 0xfec0
  );
}

export function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local')
  ) {
    return true;
  }
  const ipv4 = parseIpv4(lower);
  if (ipv4) return isBlockedIpv4(ipv4);
  const ipv6 = parseIpv6(lower.replace(/^\[|\]$/g, ''));
  if (ipv6) return isBlockedIpv6(ipv6);
  return false;
}

function isFetchableUrl(url: URL): boolean {
  return (
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    !isBlockedHostname(url.hostname)
  );
}

async function readBounded(
  response: Response,
  maxBytes: number
): Promise<{ text: string; bytes: number }> {
  if (!response.body) {
    const text = await response.text();
    return { text: text.slice(0, maxBytes), bytes: Buffer.byteLength(text) };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let kept = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (kept < maxBytes) {
      const room = maxBytes - kept;
      const slice = value.byteLength <= room ? value : value.slice(0, room);
      chunks.push(slice);
      kept += slice.byteLength;
    }
    if (total >= maxBytes) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return { text: buffer.toString('utf8'), bytes: total };
}

/** Fetch a URL with a spoofed user-agent, SSRF-safe manual redirects, timeout, and a size bound. */
export async function safeFetch(
  targetUrl: string,
  options: FetchOptions
): Promise<FetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const readBody = options.readBody ?? true;

  const base: FetchResult = {
    requestedUrl: targetUrl,
    finalUrl: targetUrl,
    status: null,
    ok: false,
    headers: {},
    body: null,
    bodyBytes: 0,
    redirects: 0,
    blocked: false,
  };

  let currentUrl: string;
  try {
    const parsed = new URL(targetUrl);
    if (!isFetchableUrl(parsed)) {
      return { ...base, blocked: true, error: 'blocked-by-ssrf-rules' };
    }
    currentUrl = parsed.toString();
  } catch {
    return { ...base, error: 'invalid-url' };
  }

  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': options.userAgent,
          accept:
            'text/html,text/plain,application/xml,application/json;q=0.9,*/*;q=0.1',
        },
      });

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          return {
            ...base,
            finalUrl: currentUrl,
            status: response.status,
            headers,
            redirects: hop,
            error: 'redirect-without-location',
          };
        }
        let nextUrl: URL;
        try {
          nextUrl = new URL(location, currentUrl);
        } catch {
          return {
            ...base,
            finalUrl: currentUrl,
            status: response.status,
            headers,
            redirects: hop,
            error: 'invalid-redirect-target',
          };
        }
        if (!isFetchableUrl(nextUrl)) {
          return {
            ...base,
            finalUrl: nextUrl.toString(),
            status: response.status,
            headers,
            redirects: hop,
            blocked: true,
            error: 'blocked-by-ssrf-rules',
          };
        }
        await response.body?.cancel().catch(() => undefined);
        currentUrl = nextUrl.toString();
        continue;
      }

      let body: string | null = null;
      let bodyBytes = 0;
      if (readBody) {
        const read = await readBounded(response, maxBytes);
        body = read.text;
        bodyBytes = read.bytes;
      } else {
        await response.body?.cancel().catch(() => undefined);
      }

      return {
        requestedUrl: targetUrl,
        finalUrl: currentUrl,
        status: response.status,
        ok: response.ok,
        headers,
        body,
        bodyBytes,
        redirects: hop,
        blocked: false,
      };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      return {
        ...base,
        finalUrl: currentUrl,
        redirects: hop,
        error: aborted ? 'timeout' : 'network-error',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return { ...base, finalUrl: currentUrl, error: 'too-many-redirects' };
}
