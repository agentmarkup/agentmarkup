import { BROWSER_CONTROL, CRAWLER_AGENTS } from './agents.js';
import {
  analyzeCrawlerAccess,
  type AgentProbe,
} from './analyzers/crawler-access.js';
import {
  analyzeJsDependence,
  analyzeMachineReadable,
  analyzeRobots,
} from './analyzers/site-checks.js';
import { countByLevel, worstLevel, type AuditFinding } from './findings.js';
import { safeFetch, type FetchResult } from './net.js';

export interface AuditOptions {
  timeoutMs?: number;
  /** Injected for tests; defaults to the real SSRF-safe fetch. */
  fetchImpl?: typeof safeFetch;
}

export interface AuditReport {
  url: string;
  finalUrl: string;
  fetchedAt: string;
  findings: AuditFinding[];
  summary: {
    pass: number;
    warn: number;
    error: number;
    checks: number;
    passed: number;
    worst: 'pass' | 'warn' | 'error';
  };
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url.replace(/\/+$/, '');
  }
}

/**
 * Audit a live URL. Fetches the page as a browser control and as each AI
 * crawler user-agent, plus robots.txt and llms.txt, then runs the analyzers.
 * `fetchedAt` is injected by the caller so the core stays deterministic/testable.
 */
export async function audit(
  targetUrl: string,
  options: AuditOptions & { fetchedAt: string }
): Promise<AuditReport> {
  const doFetch = options.fetchImpl ?? safeFetch;
  const timeoutMs = options.timeoutMs;
  const origin = originOf(targetUrl);

  const control: FetchResult = await doFetch(targetUrl, {
    userAgent: BROWSER_CONTROL.ua,
    timeoutMs,
    readBody: true,
  });

  const probes: AgentProbe[] = [];
  for (const agent of CRAWLER_AGENTS) {
    const result = await doFetch(targetUrl, {
      userAgent: agent.ua,
      timeoutMs,
      readBody: true,
      maxBytes: 64 * 1024,
    });
    probes.push({ agent, result });
  }

  const robots = await doFetch(`${origin}/robots.txt`, {
    userAgent: BROWSER_CONTROL.ua,
    timeoutMs,
    readBody: true,
    maxBytes: 256 * 1024,
  });
  const llms = await doFetch(`${origin}/llms.txt`, {
    userAgent: BROWSER_CONTROL.ua,
    timeoutMs,
    readBody: true,
    maxBytes: 1024 * 1024,
  });

  const findings: AuditFinding[] = [
    ...analyzeCrawlerAccess(control, probes),
    ...analyzeJsDependence(control),
    ...analyzeRobots(robots),
    ...analyzeMachineReadable(control, llms),
  ];

  const counts = countByLevel(findings);
  const passed = counts.pass;
  const checks = findings.length;

  return {
    url: targetUrl,
    finalUrl: control.finalUrl,
    fetchedAt: options.fetchedAt,
    findings,
    summary: {
      ...counts,
      checks,
      passed,
      worst: worstLevel(findings),
    },
  };
}
