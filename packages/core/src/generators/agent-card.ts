import { previewAgentCard } from '../agent-card.js';
import { validateAgentCardConfig } from '../validation/agent-card.js';
import type { AgentCard, AgentMarkupConfig } from '../types.js';

export const A2A_AGENT_CARD_PATH = '/.well-known/agent-card.json';
export const A2A_AGENT_CARD_FILE_NAME = '.well-known/agent-card.json';

export function buildAgentCard(config: AgentMarkupConfig): AgentCard | null {
  const card = previewAgentCard(config);
  if (!card) {
    return null;
  }

  const validationResults = validateAgentCardConfig(config, A2A_AGENT_CARD_PATH);
  if (validationResults.length > 0) {
    const details = validationResults.map((result) => result.message).join('; ');
    throw new Error(`Invalid Agent Card config: ${details}`);
  }

  return card;
}

export function generateAgentCard(config: AgentMarkupConfig): string | null {
  const card = buildAgentCard(config);
  if (!card) {
    return null;
  }

  return `${JSON.stringify(card, null, 2)}\n`;
}
