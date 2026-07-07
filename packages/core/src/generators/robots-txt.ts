import type {
  AiCrawlersConfig,
  ContentSignalHeadersConfig,
  CrawlerDirective,
} from '../types.js';
import { generateContentSignalHeaderValue } from './headers.js';
import { hasControlCharacters } from './sanitize.js';

const MARKER_START = '# BEGIN agentmarkup AI crawlers';
const MARKER_END = '# END agentmarkup AI crawlers';
const CONTENT_SIGNAL_MARKER_START = '# BEGIN agentmarkup Content-Signal';
const CONTENT_SIGNAL_MARKER_END = '# END agentmarkup Content-Signal';

/**
 * Builds the canonical robots.txt Content-Signal group. The Content Signals
 * Policy (and tools like Lighthouse) expect this directive in robots.txt, not
 * only in an HTTP header, so this mirrors the `_headers` value into robots.txt.
 */
export function generateContentSignalRobotsBlock(
  config: ContentSignalHeadersConfig = {}
): string {
  return [
    CONTENT_SIGNAL_MARKER_START,
    'User-agent: *',
    `Content-Signal: ${generateContentSignalHeaderValue(config)}`,
    CONTENT_SIGNAL_MARKER_END,
  ].join('\n');
}

export function generateCrawlerRules(crawlers: AiCrawlersConfig): string {
  const lines: string[] = [MARKER_START];

  for (const [bot, directive] of Object.entries(crawlers)) {
    if (directive === undefined) continue;
    if (hasControlCharacters(bot)) {
      throw new Error(
        `[agentmarkup/core] Invalid AI crawler name "${bot}". Crawler names must not contain control characters or newlines.`
      );
    }
    lines.push(`User-agent: ${bot}`);
    lines.push(directive === 'allow' ? 'Allow: /' : 'Disallow: /');
    lines.push('');
  }

  lines.push(MARKER_END);
  return lines.join('\n');
}

export function patchRobotsTxt(
  existing: string | null,
  crawlers: AiCrawlersConfig,
  contentSignal?: ContentSignalHeadersConfig
): string {
  const withCrawlers = patchCrawlerRules(existing, crawlers);

  if (!contentSignal || contentSignal.enabled === false) {
    return withCrawlers;
  }

  return patchContentSignalBlock(withCrawlers, contentSignal);
}

function patchCrawlerRules(
  existing: string | null,
  crawlers: AiCrawlersConfig
): string {
  const rules = generateCrawlerRules(crawlers);

  if (!existing) {
    return `User-agent: *\nAllow: /\n\n${rules}\n`;
  }

  const startIdx = existing.indexOf(MARKER_START);
  const endIdx = existing.indexOf(MARKER_END);

  if (startIdx !== -1 && endIdx !== -1) {
    const before = existing.slice(0, startIdx).trimEnd();
    const after = existing.slice(endIdx + MARKER_END.length).trimStart();
    const parts = [before, rules, after].filter(Boolean);
    return parts.join('\n\n') + '\n';
  }

  if (hasMatchingCrawlerRules(existing, crawlers)) {
    return existing;
  }

  const trimmed = existing.trimEnd();
  return `${trimmed}\n\n${rules}\n`;
}

/**
 * Inserts (or replaces) the marked Content-Signal group at the top of
 * robots.txt without touching any other user-authored directives.
 */
function patchContentSignalBlock(
  content: string,
  config: ContentSignalHeadersConfig
): string {
  const block = generateContentSignalRobotsBlock(config);
  const startIdx = content.indexOf(CONTENT_SIGNAL_MARKER_START);
  const endIdx = content.indexOf(CONTENT_SIGNAL_MARKER_END);

  if (startIdx !== -1 && endIdx !== -1) {
    const before = content.slice(0, startIdx).trimEnd();
    const after = content
      .slice(endIdx + CONTENT_SIGNAL_MARKER_END.length)
      .trimStart();
    const parts = [before, block, after].filter(Boolean);
    return parts.join('\n\n').replace(/\n+$/, '') + '\n';
  }

  return `${block}\n\n${content.trimStart()}`.replace(/\n+$/, '') + '\n';
}

export function findBlockedCrawlers(
  robotsTxt: string,
  crawlers: AiCrawlersConfig
): string[] {
  const lines = robotsTxt.split('\n');
  let currentAgents: string[] = [];
  let groupHasRules = false;
  let insideManagedBlock = false;

  // Per RFC 9309, a crawler obeys only its own most-specific group; the wildcard
  // `*` group applies only to crawlers that have no group of their own. So track
  // which bots have their own group separately from any root Allow/Disallow.
  const botHasOwnGroup = new Set<string>();
  const explicitRootDirective = new Map<string, 'allow' | 'disallow'>();
  let wildcardRootDirective: 'allow' | 'disallow' | undefined = undefined;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === MARKER_START) {
      insideManagedBlock = true;
      currentAgents = [];
      groupHasRules = false;
      continue;
    }

    if (trimmed === MARKER_END) {
      insideManagedBlock = false;
      currentAgents = [];
      groupHasRules = false;
      continue;
    }

    if (insideManagedBlock) {
      continue;
    }

    const agentMatch = trimmed.match(/^User-agent:\s*(.+)$/i);
    if (agentMatch) {
      // A User-agent line following a rule starts a new group; blank line
      // separators are optional in robots.txt, so do not rely on them.
      if (groupHasRules) {
        currentAgents = [];
        groupHasRules = false;
      }
      const agent = agentMatch[1].trim();
      currentAgents.push(agent);
      if (agent !== '*') {
        botHasOwnGroup.add(agent.toLowerCase());
      }
      continue;
    }

    if (/^(?:allow|disallow)\s*:/i.test(trimmed)) {
      const rootDisallow = /^Disallow:\s*\/\s*$/i.test(trimmed);
      const rootAllow = /^Allow:\s*\/\s*$/i.test(trimmed);
      if ((rootDisallow || rootAllow) && currentAgents.length > 0) {
        const type: 'allow' | 'disallow' = rootDisallow ? 'disallow' : 'allow';
        for (const agent of currentAgents) {
          if (agent === '*') {
            if (!wildcardRootDirective) wildcardRootDirective = type;
          } else {
            const key = agent.toLowerCase();
            if (!explicitRootDirective.has(key)) {
              explicitRootDirective.set(key, type);
            }
          }
        }
      }
      groupHasRules = true;
    }

    if (trimmed === '') {
      currentAgents = [];
      groupHasRules = false;
    }
  }

  const blocked: string[] = [];
  for (const [bot, directive] of Object.entries(crawlers)) {
    if (directive !== 'allow') {
      continue;
    }
    const key = bot.toLowerCase();
    if (botHasOwnGroup.has(key)) {
      // Only its own group applies; blocked solely by a root Disallow there.
      if (explicitRootDirective.get(key) === 'disallow') {
        blocked.push(bot);
      }
    } else if (wildcardRootDirective === 'disallow') {
      blocked.push(bot);
    }
  }

  return [...new Set(blocked)];
}



function hasMatchingCrawlerRules(
  robotsTxt: string,
  crawlers: AiCrawlersConfig
): boolean {
  const directivesByAgent = new Map<string, Set<CrawlerDirective>>();
  const lines = robotsTxt.split('\n');
  let currentAgents: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const agentMatch = trimmed.match(/^User-agent:\s*(.+)$/i);

    if (agentMatch) {
      currentAgents.push(agentMatch[1].trim().toLowerCase());
      continue;
    }

    if (currentAgents.length > 0) {
      const directive = parseCrawlerDirective(trimmed);
      if (directive) {
        for (const agent of currentAgents) {
          if (!directivesByAgent.has(agent)) {
            directivesByAgent.set(agent, new Set());
          }

          directivesByAgent.get(agent)?.add(directive);
        }
      }
    }

    if (trimmed === '') {
      currentAgents = [];
    }
  }

  return Object.entries(crawlers)
    .filter(([, directive]) => directive !== undefined)
    .every(([bot, directive]) =>
      directivesByAgent.get(bot.toLowerCase())?.has(directive as CrawlerDirective)
    );
}

function parseCrawlerDirective(value: string): CrawlerDirective | null {
  if (/^Allow:\s*\/\s*$/i.test(value)) {
    return 'allow';
  }

  if (/^Disallow:\s*\/\s*$/i.test(value)) {
    return 'disallow';
  }

  return null;
}
