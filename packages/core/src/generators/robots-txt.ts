import type { AiCrawlersConfig, CrawlerDirective } from '../types.js';

const MARKER_START = '# BEGIN agentmarkup AI crawlers';
const MARKER_END = '# END agentmarkup AI crawlers';

export function generateCrawlerRules(crawlers: AiCrawlersConfig): string {
  const lines: string[] = [MARKER_START];

  for (const [bot, directive] of Object.entries(crawlers)) {
    if (directive === undefined) continue;
    lines.push(`User-agent: ${bot}`);
    lines.push(directive === 'allow' ? 'Allow: /' : 'Disallow: /');
    lines.push('');
  }

  lines.push(MARKER_END);
  return lines.join('\n');
}

export function patchRobotsTxt(
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

export function findBlockedCrawlers(
  robotsTxt: string,
  crawlers: AiCrawlersConfig
): string[] {
  const blocked: string[] = [];
  const lines = robotsTxt.split('\n');
  let currentAgents: string[] = [];
  let insideManagedBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === MARKER_START) {
      insideManagedBlock = true;
      currentAgents = [];
      continue;
    }

    if (trimmed === MARKER_END) {
      insideManagedBlock = false;
      currentAgents = [];
      continue;
    }

    if (insideManagedBlock) {
      continue;
    }

    const agentMatch = trimmed.match(/^User-agent:\s*(.+)$/i);
    if (agentMatch) {
      currentAgents.push(agentMatch[1].trim());
      continue;
    }

    const disallowMatch = trimmed.match(/^Disallow:\s*\/\s*$/i);
    if (disallowMatch && currentAgents.length > 0) {
      for (const agent of currentAgents) {
        if (agent === '*') {
          for (const [bot, directive] of Object.entries(crawlers)) {
            if (directive === 'allow') {
              blocked.push(bot);
            }
          }
        } else if (
          isConfiguredBot(agent, crawlers) &&
          crawlers[agent] === 'allow'
        ) {
          blocked.push(agent);
        }
      }
    }

    if (trimmed === '') {
      currentAgents = [];
    }
  }

  return [...new Set(blocked)];
}

function isConfiguredBot(agent: string, crawlers: AiCrawlersConfig): boolean {
  return Object.keys(crawlers).some(
    (key) => key.toLowerCase() === agent.toLowerCase()
  );
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
