import { describe, expect, it } from 'vitest';
import {
  A2A_AGENT_CARD_PATH,
  buildAgentCard,
  generateAgentCard,
  validateAgentCard,
  validateAgentCardConfig,
  validateAgentCardJson,
} from '../src/index.js';

describe('Agent Card helpers', () => {
  it('builds and validates an A2A Agent Card from config defaults and explicit interfaces', () => {
    const config = {
      site: 'https://example.com',
      name: 'Example',
      description: 'Machine-readable example site.',
      agentCard: {
        version: '1.0.0',
        supportedInterfaces: [
          {
            url: 'https://agent.example.com/a2a/v1',
            protocolBinding: 'HTTP+JSON',
            protocolVersion: '1.0',
          },
        ],
        skills: [
          {
            id: 'docs-search',
            name: 'Docs search',
            description: 'Answers product questions from the docs set.',
            tags: ['docs', 'support'],
          },
        ],
      },
    };
    const agentCard = buildAgentCard(config);

    expect(agentCard).toEqual(
      expect.objectContaining({
        name: 'Example',
        description: 'Machine-readable example site.',
        version: '1.0.0',
        defaultInputModes: ['text/plain'],
        defaultOutputModes: ['text/plain'],
      })
    );
    expect(agentCard?.supportedInterfaces).toEqual([
      expect.objectContaining({
        url: 'https://agent.example.com/a2a/v1',
        protocolBinding: 'HTTP+JSON',
        protocolVersion: '1.0',
      }),
    ]);
    expect(validateAgentCardConfig(config)).toEqual([]);
    expect(validateAgentCard(agentCard, A2A_AGENT_CARD_PATH)).toEqual([]);
  });

  it('serializes an Agent Card to the well-known JSON file format', () => {
    const json = generateAgentCard({
      site: 'https://example.com',
      name: 'Example',
      description: 'Machine-readable example site.',
      agentCard: {
        version: '1.0.0',
        supportedInterfaces: [
          {
            url: 'https://agent.example.com/a2a/v1',
            protocolBinding: 'JSONRPC',
            protocolVersion: '1.0',
          },
        ],
      },
    });

    expect(json).toContain('"supportedInterfaces"');
    expect(json).toContain('"protocolBinding": "JSONRPC"');
    expect(json?.endsWith('\n')).toBe(true);
  });

  it('returns null and no config issues when the Agent Card feature is disabled', () => {
    const config = {
      site: 'https://example.com',
      name: 'Example',
      agentCard: {
        enabled: false as const,
      },
    };

    expect(validateAgentCardConfig(config)).toEqual([]);
    expect(buildAgentCard(config)).toBeNull();
    expect(generateAgentCard(config)).toBeNull();
  });

  it('rejects invalid enabled Agent Card configs before generation', () => {
    const config = {
      site: 'https://example.com',
      name: 'Example',
      agentCard: {
        version: '1.0.0',
        supportedInterfaces: [],
      },
    };
    const results = validateAgentCardConfig(config);

    expect(
      results.some((result) => result.message.includes('description must be a non-empty string'))
    ).toBe(true);
    expect(
      results.some((result) =>
        result.message.includes('supportedInterfaces must include at least one interface')
      )
    ).toBe(true);
    expect(() => buildAgentCard(config)).toThrow(/Invalid Agent Card config/);
    expect(() => generateAgentCard(config)).toThrow(/Invalid Agent Card config/);
  });

  it('validates missing Agent Card fields', () => {
    const results = validateAgentCard(
      {
        name: 'Example',
        supportedInterfaces: [],
        capabilities: {},
        defaultInputModes: ['text/plain'],
        defaultOutputModes: ['text/plain'],
      },
      A2A_AGENT_CARD_PATH
    );

    expect(
      results.some((result) => result.message.includes("required field 'description'"))
    ).toBe(true);
    expect(
      results.some((result) =>
        result.message.includes('supportedInterfaces must include at least one interface')
      )
    ).toBe(true);
    expect(results.every((result) => result.path === A2A_AGENT_CARD_PATH)).toBe(true);
  });

  it('validates Agent Card JSON strings', () => {
    const results = validateAgentCardJson(
      JSON.stringify({
        name: 'Example',
        description: 'Machine-readable example site.',
        version: '1.0.0',
        supportedInterfaces: [
          {
            url: 'https://agent.example.com/a2a/v1',
            protocolBinding: 'HTTP+JSON',
            protocolVersion: '1.0',
          },
        ],
        capabilities: {
          streaming: true,
        },
        defaultInputModes: ['text/plain'],
        defaultOutputModes: ['text/plain'],
        skills: [],
      })
    );

    expect(results).toEqual([]);
  });
});
