import type { CrawlerAgent } from '../agents.js';
import type { AuditFinding } from '../findings.js';
import type { FetchResult } from '../net.js';

export interface AgentProbe {
  agent: CrawlerAgent;
  result: FetchResult;
}

const CHALLENGE_MARKERS = [
  'cf-browser-verification',
  'challenge-platform',
  'just a moment',
  'attention required',
  'enable javascript and cookies to continue',
];

function looksLikeBotChallenge(result: FetchResult): boolean {
  const mitigated = result.headers['cf-mitigated'];
  if (mitigated && mitigated.toLowerCase().includes('challenge')) return true;
  const body = (result.body ?? '').toLowerCase();
  return CHALLENGE_MARKERS.some((marker) => body.includes(marker));
}

function statusClass(status: number | null): number | null {
  return status === null ? null : Math.floor(status / 100);
}

/**
 * Diffs each crawler user-agent's response against the browser control and
 * classifies the difference. Every finding states the evidence and never
 * asserts "your site blocks AI" from a user-agent-only 403 (see plan §6):
 * a 403 for a spoofed UA can mean an intentional IP-verification policy, not a
 * block bug, so those are surfaced as warnings, not errors.
 */
export function analyzeCrawlerAccess(
  control: FetchResult,
  probes: AgentProbe[]
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const controlClass = statusClass(control.status);

  if (control.error || controlClass !== 2) {
    findings.push({
      code: 'crawler.control-failed',
      level: 'warn',
      title: 'Could not establish a browser baseline',
      detail:
        'The control request (normal browser user-agent) did not return a 2xx response, so bot-vs-browser differences cannot be judged reliably.',
      evidence: `browser control: status=${control.status ?? 'none'}${
        control.error ? ` error=${control.error}` : ''
      }`,
      fix: 'Confirm the URL is reachable and returns 200 in a browser, then re-run the audit.',
    });
    return findings;
  }

  for (const { agent, result } of probes) {
    const botClass = statusClass(result.status);
    const evidence = `${agent.id} → status=${result.status ?? 'none'}${
      result.error ? ` error=${result.error}` : ''
    }; browser → status=${control.status}`;

    if (result.error === 'timeout' || result.error === 'network-error') {
      findings.push({
        code: 'crawler.probe-failed',
        level: 'warn',
        title: `Could not probe as ${agent.vendor} ${agent.id}`,
        detail: `The request as ${agent.id} failed (${result.error}); no conclusion drawn for this crawler.`,
        evidence,
      });
      continue;
    }

    if (botClass === 2) {
      findings.push({
        code: 'crawler.accessible',
        level: 'pass',
        title: `${agent.vendor} ${agent.id} can reach the page`,
        detail: `A request with the ${agent.id} user-agent returned the same success class as a browser.`,
        evidence,
      });
      continue;
    }

    if (result.status === 429) {
      findings.push({
        code: 'crawler.rate-limited',
        level: 'warn',
        title: `${agent.vendor} ${agent.id} is rate-limited`,
        detail: `The ${agent.id} request was rate-limited (429). This is usually transient, but aggressive rate limits can starve crawlers of your content.`,
        evidence,
      });
      continue;
    }

    if (result.status === 403 || result.status === 401) {
      // A spoofed user-agent from a generic IP cannot prove which case this is,
      // so it is always a warning with both explanations — never a bare
      // "you block AI" error (see plan §4/§6).
      const challenge = looksLikeBotChallenge(result);
      if (challenge) {
        findings.push({
          code: 'crawler.bot-challenge',
          level: 'warn',
          title: `${agent.vendor} ${agent.id} hit a bot challenge`,
          detail: `The ${agent.id} user-agent got a challenge/verification response (${result.status}). Because ${agent.id} is verified by ${
            agent.verification ?? 'its published identity'
          }, the real crawler may pass where this spoofed user-agent does not. Confirm the verified bot is allowlisted at your CDN.`,
          evidence,
          fix: 'Allowlist the crawler by its published IP ranges (verified bots) rather than relying on user-agent rules.',
        });
      } else {
        findings.push({
          code: 'crawler.ua-differential-block',
          level: 'warn',
          title: `${agent.vendor} ${agent.id} is blocked from a generic IP`,
          detail: `A browser gets ${control.status} but the ${agent.id} user-agent gets ${result.status}, with no challenge signal. Two things cause this and they mean opposite things: a user-agent-string WAF rule (which also blocks the real ${agent.id}) or IP allowlisting (where the verified ${agent.id} is fine). Check which it is at your CDN.`,
          evidence,
          fix: `If a WAF rule blocks the "${agent.id}" user-agent, remove or narrow it. If you allowlist verified bots by IP, no action is needed.`,
        });
      }
      continue;
    }

    if (botClass === 5) {
      findings.push({
        code: 'crawler.origin-error',
        level: 'warn',
        title: `${agent.vendor} ${agent.id} triggered a server error`,
        detail: `The ${agent.id} user-agent got a ${result.status} while the browser got ${control.status}. Something in the stack treats this crawler differently and errors.`,
        evidence,
      });
      continue;
    }

    findings.push({
      code: 'crawler.differential-unknown',
      level: 'warn',
      title: `${agent.vendor} ${agent.id} is treated differently than a browser`,
      detail: `The ${agent.id} user-agent returned ${result.status} while a browser returned ${control.status}. The cause is unclear from the response; inspect the evidence.`,
      evidence,
    });
  }

  return findings;
}
