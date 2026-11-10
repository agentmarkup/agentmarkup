// reachability: reach.bot-detection (reach.agent-ua is catalog 2.0, not measured).
import { findChallengeMarker } from '../evidence.js';
import { scored, unverified, type EvaluatorEntry } from './shared.js';

export const reachEvaluators: Record<string, EvaluatorEntry> = {
  'reach.bot-detection': {
    needsHomepage: false,
    run: (context) => {
      const homepage = context.homepage;
      const resource = homepage.resource;
      if (!resource || homepage.unverified) {
        return unverified('homepage-unverified', `homepage ${homepage.describeState()}`, ['homepage']);
      }
      const marker = findChallengeMarker(resource);
      const status = resource.status;
      // A 429 or 5xx with a marker is always `challenge` or `unverified` (pinned in
      // classify.test.ts), so the challenge outcome covers every marked answer here.
      if (homepage.outcome === 'challenge') {
        return scored(0, `HTTP ${status}, challenge marker "${marker}"`, ['homepage']);
      }
      if (status === 401 || status === 403) {
        return scored(
          0,
          marker ? `HTTP ${status}, challenge marker "${marker}"` : `HTTP ${status}, no challenge marker`,
          ['homepage']
        );
      }
      if (homepage.ok && marker) {
        return scored(0, `HTTP ${status} with challenge marker "${marker}"`, ['homepage']);
      }
      if (homepage.ok) {
        const kind = homepage.isHtml ? 'HTML' : homepage.mediaType;
        return scored(1, `HTTP ${status}, ${kind}, no challenge markers`, ['homepage']);
      }
      return unverified(`homepage-http-${status}`, `homepage answered HTTP ${status} ${homepage.mediaType}`, [
        'homepage',
      ]);
    },
  },
};
