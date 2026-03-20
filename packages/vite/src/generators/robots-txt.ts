import type { AiCrawlersConfig } from '../types.js';

const MARKER_START = '# BEGIN agentmarkup AI crawlers';
const MARKER_END = '# END agentmarkup AI crawlers';

/**
 * Generate the AI crawler section for robots.txt.
 */
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

/**
 * Patch an existing robots.txt with AI crawler rules.
 * Replaces any existing agentmarkup block, or appends.
 */
export function patchRobotsTxt(
  existing: string | null,
  crawlers: AiCrawlersConfig
): string {
  const rules = generateCrawlerRules(crawlers);

  if (!existing) {
    return `User-agent: *\nAllow: /\n\n${rules}\n`;
  }

  // Replace existing agentmarkup block
  const startIdx = existing.indexOf(MARKER_START);
  const endIdx = existing.indexOf(MARKER_END);

  if (startIdx !== -1 && endIdx !== -1) {
    const before = existing.slice(0, startIdx).trimEnd();
    const after = existing.slice(endIdx + MARKER_END.length).trimStart();
    const parts = [before, rules, after].filter(Boolean);
    return parts.join('\n\n') + '\n';
  }

  // Append
  const trimmed = existing.trimEnd();
  return `${trimmed}\n\n${rules}\n`;
}

/**
 * Check if existing robots.txt rules block any of the specified AI crawlers.
 * Returns list of crawlers that are unintentionally blocked.
 */
export function findBlockedCrawlers(
  robotsTxt: string,
  crawlers: AiCrawlersConfig
): string[] {
  const blocked: string[] = [];

  // Parse robots.txt into user-agent blocks
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
        // Check if this wildcard or specific rule blocks an AI crawler we want to allow
        if (agent === '*') {
          for (const [bot, directive] of Object.entries(crawlers)) {
            if (directive === 'allow') {
              blocked.push(bot);
            }
          }
        } else if (
          bot(agent, crawlers) &&
          crawlers[agent] === 'allow'
        ) {
          blocked.push(agent);
        }
      }
    }

    // Reset agents on empty line
    if (trimmed === '') {
      currentAgents = [];
    }
  }

  return [...new Set(blocked)];
}

function bot(agent: string, crawlers: AiCrawlersConfig): boolean {
  return Object.keys(crawlers).some(
    (key) => key.toLowerCase() === agent.toLowerCase()
  );
}
