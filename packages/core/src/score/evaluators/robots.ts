// reachability via robots.txt: robots.ai-search-access, robots.content-signal.
import { AI_SEARCH_AGENTS, TRAINING_CRAWLERS } from '../catalog.js';
import { parseContentSignal, robotsBlockedAgents } from '../html-lite.js';
import { notApplicable, scored, unverified, type EvaluatorEntry, type ResourceView } from './shared.js';

function robotsState(robots: ResourceView): string {
  if (robots.unverified) {
    return `robots.txt ${robots.describeState()}`;
  }
  if (robots.outcome === 'not-found') {
    return `no robots.txt (HTTP ${robots.status})`;
  }
  if (robots.ok && !robots.isText) {
    return `robots.txt answered HTTP ${robots.status} ${robots.mediaType} with an HTML body (treated as absent)`;
  }
  if (!robots.ok) {
    return `robots.txt answered HTTP ${robots.status}`;
  }
  return 'robots.txt present';
}

export const robotsEvaluators: Record<string, EvaluatorEntry> = {
  'robots.ai-search-access': {
    needsHomepage: false,
    run: (context) => {
      const robots = context.robots;
      if (robots.unverified) {
        return unverified('robots-unverified', robotsState(robots), ['robotsTxt']);
      }
      if (!robots.isText) {
        return scored(1, `${robotsState(robots)}: all ${AI_SEARCH_AGENTS.length} AI search and user agents allowed by default`, [
          'robotsTxt',
        ]);
      }
      const blocked = robotsBlockedAgents(robots.body, AI_SEARCH_AGENTS);
      const allowed = AI_SEARCH_AGENTS.length - blocked.length;
      const trainingBlocked = robotsBlockedAgents(robots.body, TRAINING_CRAWLERS);
      const evidence = [
        `${allowed}/${AI_SEARCH_AGENTS.length} AI search and user agents root-allowed`,
        blocked.length > 0 ? `blocked: ${blocked.join(', ')}` : '',
        trainingBlocked.length > 0
          ? `policy note (never subtracts): training crawlers blocked: ${trainingBlocked.join(', ')}`
          : 'policy note: no training crawler blocked',
      ]
        .filter(Boolean)
        .join('; ');
      return scored(allowed / AI_SEARCH_AGENTS.length, evidence, ['robotsTxt']);
    },
  },
  'robots.content-signal': {
    needsHomepage: false,
    run: (context) => {
      const robots = context.robots;
      if (robots.unverified) {
        return unverified('robots-unverified', robotsState(robots), ['robotsTxt']);
      }
      if (!robots.isText) {
        return notApplicable('no-robots', robotsState(robots), ['robotsTxt']);
      }
      const signal = parseContentSignal(robots.body);
      const directives = Object.keys(signal.directives);
      if (signal.present && directives.length > 0) {
        return scored(
          1,
          `${signal.raw.length} Content-Signal line(s): ${signal.raw.join(' | ')}`,
          ['robotsTxt']
        );
      }
      return scored(
        0,
        signal.present ? `Content-Signal line present but no key=value directive parsed (${signal.raw.join(' | ')})` : 'no Content-Signal line in robots.txt',
        ['robotsTxt']
      );
    },
  },
};
