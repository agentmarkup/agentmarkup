// Client-facing copy for one check result: which catalog sentence applies and what
// the fix line says. The client summary, the website checker and the batch report
// read it from here, so a partial result or a bot-challenge answer reads the same
// everywhere instead of falling back to the fail sentence.
import { getCheckDefinition } from './catalog.js';
import { RESOURCE_NOTE_LABELS } from './evaluate.js';
import type { CheckChallenge, CheckResult } from './types.js';

type CopyInput = Pick<CheckResult, 'id' | 'status' | 'evidence' | 'challenge' | 'sentenceVariant'>;

/** The path that answered the challenge (`/llms.txt`), or the resource label without a URL. */
function challengePath(challenge: CheckChallenge): string {
  if (challenge.url) {
    try {
      return new URL(challenge.url).pathname || '/';
    } catch {
      return challenge.url;
    }
  }
  return `the ${RESOURCE_NOTE_LABELS[challenge.resource]}`;
}

/**
 * The client sentence for a result. Pass uses the pass sentence. Fail and partial use,
 * in order: the bot-challenge line when a challenge decided the result, the variant the
 * evaluator selected, the partial sentence (or, without one, the check name with its
 * evidence), and the fail sentence. Other statuses get the check name.
 */
export function clientSentenceFor(check: CopyInput): string {
  const definition = getCheckDefinition(check.id);
  const name = definition?.name ?? check.id;
  if (check.status === 'pass') {
    return definition?.clientSentence.pass ?? name;
  }
  if (check.status !== 'fail' && check.status !== 'partial') {
    return name;
  }
  if (check.challenge) {
    return `Your bot protection shows AI assistants a challenge page instead of ${challengePath(check.challenge)} (HTTP ${check.challenge.status}).`;
  }
  const sentences = definition?.clientSentence;
  const variant = check.sentenceVariant ? sentences?.variants?.[check.sentenceVariant] : undefined;
  if (variant) {
    return variant;
  }
  if (check.status === 'partial') {
    return sentences?.partial ?? `${name} is only partly in place: ${check.evidence.replace(/\.$/, '')}.`;
  }
  return sentences?.fail ?? name;
}

/**
 * The fix line: letting agents through the challenge on the path that answered one, or
 * the catalog action. Null for an id outside the catalog.
 */
export function fixActionFor(check: Pick<CheckResult, 'id' | 'challenge'>): string | null {
  if (check.challenge) {
    const { status, marker } = check.challenge;
    return `Let AI agents through the bot challenge on ${challengePath(check.challenge)}: it answered HTTP ${status} with ${marker}. Allow verified bots on that path in the bot-protection or firewall settings.`;
  }
  return getCheckDefinition(check.id)?.action ?? null;
}

/** False when a bot challenge decided the result, so the catalog's platform recipes are the wrong fix. */
export function platformFixesApply(check: Pick<CheckResult, 'challenge'>): boolean {
  return !check.challenge;
}
