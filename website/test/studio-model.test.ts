import { describe, expect, it } from 'vitest';

import {
  createInitialState,
  initialStudioDraft,
  studioReducer,
} from '../src/studio/model';
import { LIMITS } from '../src/studio/types';
import type { StudioAction, StudioState } from '../src/studio/types';

function setName(state: StudioState, name: string, source: 'agent' | 'human' = 'human') {
  return studioReducer(state, {
    type: 'SET_IDENTITY',
    source,
    payload: { name },
  });
}

describe('studioReducer setters', () => {
  it('merges identity fields while preserving the other draft slices', () => {
    const state = createInitialState();
    const next = studioReducer(state, {
      type: 'SET_IDENTITY',
      source: 'human',
      payload: {
        site: 'https://example.com',
        name: 'Example',
        organization: {
          name: 'Example LLC',
          url: 'https://example.com/about',
        },
      },
    });

    expect(next.draft.identity).toEqual({
      site: 'https://example.com',
      name: 'Example',
      description: '',
      organization: {
        name: 'Example LLC',
        url: 'https://example.com/about',
      },
    });
    expect(next.draft.access).toBe(state.draft.access);
    expect(next.draft.content).toBe(state.draft.content);
    expect(next.draft.agentCard).toBe(state.draft.agentCard);
  });

  it('curates content fields while preserving omitted content and draft fields', () => {
    const state = createInitialState();
    const next = studioReducer(state, {
      type: 'CURATE_PAGES',
      source: 'agent',
      payload: {
        llmsSections: [{
          title: 'Docs',
          entries: [{ title: 'Guide', url: 'https://example.com/guide' }],
        }],
        markdownMirrors: { enabled: true, exclude: ['/private'] },
      },
    });

    expect(next.draft.content).toEqual({
      llmsSections: [{
        title: 'Docs',
        entries: [{ title: 'Guide', url: 'https://example.com/guide' }],
      }],
      whenToUse: [],
      llmsFullEnabled: false,
      markdownMirrors: { enabled: true, exclude: ['/private'] },
    });
    expect(next.draft.identity).toBe(state.draft.identity);
  });

  it('configures agent card fields while preserving omitted card fields', () => {
    const configured = studioReducer(createInitialState(), {
      type: 'SET_AGENT_CARD',
      source: 'agent',
      payload: {
        enabled: true,
        version: '1.0.0',
        description: 'Answers questions about Example.',
      },
    });
    const next = studioReducer(configured, {
      type: 'SET_AGENT_CARD',
      source: 'human',
      payload: { providerOrganization: 'Example LLC' },
    });

    expect(next.draft.agentCard).toEqual({
      enabled: true,
      version: '1.0.0',
      description: 'Answers questions about Example.',
      providerOrganization: 'Example LLC',
    });
  });

  it('applies crawler groups before overrides and null deletions', () => {
    const next = studioReducer(createInitialState(), {
      type: 'SET_ACCESS_POLICY',
      source: 'agent',
      payload: {
        groups: { train: 'allow' },
        crawlers: {
          GPTBot: 'disallow',
          CCBot: null,
          CustomBot: 'allow',
        },
        contentSignal: { aiTrain: 'no' },
      },
    });

    expect(next.draft.access.crawlers.GPTBot).toBe('disallow');
    expect(next.draft.access.crawlers.ClaudeBot).toBe('allow');
    expect(next.draft.access.crawlers.CCBot).toBeUndefined();
    expect(next.draft.access.crawlers.CustomBot).toBe('allow');
    expect(next.draft.access.contentSignal).toEqual({
      aiTrain: 'no',
      search: 'yes',
      aiInput: 'yes',
    });
  });

  it('deep-merges imported slices and mentions the source URL', () => {
    const named = setName(createInitialState(), 'Before');
    const next = studioReducer(named, {
      type: 'IMPORT_FROM_CHECK',
      source: 'agent',
      sourceUrl: 'https://checked.example',
      payload: {
        identity: {
          site: 'https://checked.example',
          name: 'Imported',
          description: 'Imported description',
        },
        access: {
          crawlers: { GPTBot: 'disallow' },
          contentSignal: { aiTrain: 'no', search: 'yes', aiInput: 'yes' },
        },
      },
    });

    expect(next.draft.identity.name).toBe('Imported');
    expect(next.draft.access.crawlers.GPTBot).toBe('disallow');
    expect(next.draft.content).toBe(named.draft.content);
    expect(next.log.at(-1)?.summary).toContain('https://checked.example');
  });
});

describe('studioReducer history and activity', () => {
  it('caps undo history and restores the immediately prior draft', () => {
    let state = createInitialState();
    for (let index = 0; index < LIMITS.undoDepth + 3; index += 1) {
      state = setName(state, `Name ${index}`);
    }

    expect(state.history).toHaveLength(LIMITS.undoDepth);
    const beforeUndo = state;
    const undone = studioReducer(state, { type: 'UNDO', source: 'human' });

    expect(undone.draft.identity.name).toBe(`Name ${LIMITS.undoDepth + 1}`);
    expect(undone.history).toHaveLength(LIMITS.undoDepth - 1);
    expect(beforeUndo.history).toHaveLength(LIMITS.undoDepth);
  });

  it('handles undo with empty history safely', () => {
    const state = createInitialState();
    const next = studioReducer(state, { type: 'UNDO', source: 'agent' });

    expect(next.draft).toBe(state.draft);
    expect(next.history).toEqual([]);
    expect(next.log).toHaveLength(1);
    expect(next.log[0]).toMatchObject({ source: 'agent', actionType: 'UNDO' });
    expect(next.log[0].summary).toContain('nothing to undo');
  });

  it('does not let consecutive no-op actions evict a real undo snapshot', () => {
    let state = setName(createInitialState(), 'Changed');

    for (let index = 0; index < 25; index += 1) {
      state = setName(state, 'Changed');
    }

    expect(state.history).toHaveLength(1);
    expect(state.log).toHaveLength(26);

    const undone = studioReducer(state, { type: 'UNDO', source: 'human' });
    expect(undone.draft.identity.name).toBe('');
    expect(undone.history).toEqual([]);
  });

  it('logs a rejected patch without adding an undo snapshot', () => {
    const state = setName(createInitialState(), 'Preserved');
    const next = studioReducer(state, {
      type: 'SET_IDENTITY',
      source: 'agent',
      payload: { name: 42 },
    } as unknown as StudioAction);

    expect(next.draft).toBe(state.draft);
    expect(next.history).toBe(state.history);
    expect(next.history).toHaveLength(1);
    expect(next.log).toHaveLength(state.log.length + 1);
    expect(next.log.at(-1)).toMatchObject({
      source: 'agent',
      actionType: 'SET_IDENTITY',
      summary: 'Agent made no valid changes.',
    });
  });

  it('records agent and human sources with the correct action types', () => {
    const agentChange = setName(createInitialState(), 'Agent edit', 'agent');
    const humanChange = studioReducer(agentChange, {
      type: 'CURATE_PAGES',
      source: 'human',
      payload: { llmsFullEnabled: true },
    });

    expect(humanChange.log).toEqual([
      expect.objectContaining({ seq: 1, source: 'agent', actionType: 'SET_IDENTITY' }),
      expect.objectContaining({ seq: 2, source: 'human', actionType: 'CURATE_PAGES' }),
    ]);
    expect(humanChange.seq).toBe(3);
  });

  it('keeps the log across undo eviction, reset, and undo', () => {
    let state = createInitialState();
    const actionCount = LIMITS.undoDepth + 5;
    for (let index = 0; index < actionCount; index += 1) {
      state = setName(state, `Edit ${index}`, index % 2 === 0 ? 'agent' : 'human');
    }

    expect(state.history).toHaveLength(LIMITS.undoDepth);
    expect(state.log).toHaveLength(actionCount);

    const beforeReset = state.draft;
    state = studioReducer(state, { type: 'RESET', source: 'human' });
    expect(state.log).toHaveLength(actionCount + 1);
    expect(state.log.at(-1)?.actionType).toBe('RESET');

    state = studioReducer(state, { type: 'UNDO', source: 'human' });
    expect(state.draft).toBe(beforeReset);
    expect(state.log).toHaveLength(actionCount + 2);
    expect(state.log.at(-1)?.actionType).toBe('UNDO');
    expect(state.log[0].seq).toBe(1);
  });

  it('caps activity independently while sequence numbers keep increasing', () => {
    let state = createInitialState();
    for (let index = 0; index < LIMITS.activityLogMax + 3; index += 1) {
      state = setName(state, `Edit ${index}`);
    }

    expect(state.log).toHaveLength(LIMITS.activityLogMax);
    expect(state.log[0].seq).toBe(4);
    expect(state.log.at(-1)?.seq).toBe(LIMITS.activityLogMax + 3);
    expect(state.seq).toBe(LIMITS.activityLogMax + 4);
  });
});

describe('studioReducer boundaries', () => {
  it('restores the seed draft on reset without erasing the log', () => {
    const changed = setName(createInitialState(), 'Changed', 'agent');
    const reset = studioReducer(changed, { type: 'RESET', source: 'human' });

    expect(reset.draft).toBe(initialStudioDraft);
    expect(reset.history).toHaveLength(2);
    expect(reset.log.map((entry) => entry.actionType)).toEqual([
      'SET_IDENTITY',
      'RESET',
    ]);
  });

  it('logs a reset of the seed draft without adding an undo snapshot', () => {
    const state = createInitialState();
    const reset = studioReducer(state, { type: 'RESET', source: 'human' });

    expect(reset.draft).toBe(state.draft);
    expect(reset.history).toBe(state.history);
    expect(reset.history).toEqual([]);
    expect(reset.log).toHaveLength(1);
    expect(reset.log[0].actionType).toBe('RESET');
  });

  it('returns the identical state for an unknown action type', () => {
    const state = createInitialState();
    const next = studioReducer(
      state,
      { type: 'NOT_A_STUDIO_ACTION', source: 'agent' } as unknown as StudioAction
    );

    expect(next).toBe(state);
  });

  it('truncates strings and drops array items beyond their caps', () => {
    const longName = 'n'.repeat(LIMITS.shortText + 5);
    const longDescription = 'd'.repeat(LIMITS.longText + 5);
    const whenToUse = Array.from(
      { length: LIMITS.whenToUseMax + 3 },
      (_, index) => `${index}-${'x'.repeat(LIMITS.whenToUseEntry)}`
    );
    let state = studioReducer(createInitialState(), {
      type: 'SET_IDENTITY',
      source: 'agent',
      payload: { name: longName, description: longDescription },
    });
    state = studioReducer(state, {
      type: 'CURATE_PAGES',
      source: 'agent',
      payload: { whenToUse },
    });

    expect(state.draft.identity.name).toBe(longName.slice(0, LIMITS.shortText));
    expect(state.draft.identity.description).toBe(
      longDescription.slice(0, LIMITS.longText)
    );
    expect(state.draft.content.whenToUse).toHaveLength(LIMITS.whenToUseMax);
    expect(state.draft.content.whenToUse[0]).toHaveLength(LIMITS.whenToUseEntry);
    expect(state.draft.content.whenToUse.at(-1)?.startsWith('9-')).toBe(true);
  });

  it('caps organization contact points at the configured boundary', () => {
    const contactPoint = Array.from(
      { length: LIMITS.contactPointsMax + 1 },
      (_, index) => ({ contactType: `contact-${index}` })
    );
    const state = studioReducer(createInitialState(), {
      type: 'SET_IDENTITY',
      source: 'human',
      payload: {
        organization: {
          name: 'Example LLC',
          url: 'https://example.com',
          contactPoint,
        },
      },
    });

    const saved = state.draft.identity.organization?.contactPoint;
    expect(saved).toHaveLength(LIMITS.contactPointsMax);
    expect(saved?.at(-1)?.contactType).toBe(
      `contact-${LIMITS.contactPointsMax - 1}`
    );
    expect(saved?.some(({ contactType }) =>
      contactType === `contact-${LIMITS.contactPointsMax}`
    )).toBe(false);
  });

  it('caps agent skill tags at the configured boundary', () => {
    const tags = Array.from(
      { length: LIMITS.skillTagsMax + 1 },
      (_, index) => `tag-${index}`
    );
    const state = studioReducer(createInitialState(), {
      type: 'SET_AGENT_CARD',
      source: 'agent',
      payload: {
        skills: [{ id: 'search', name: 'Search', description: 'Searches.', tags }],
      },
    });

    const saved = state.draft.agentCard.skills?.[0]?.tags;
    expect(saved).toHaveLength(LIMITS.skillTagsMax);
    expect(saved?.at(-1)).toBe(`tag-${LIMITS.skillTagsMax - 1}`);
    expect(saved).not.toContain(`tag-${LIMITS.skillTagsMax}`);
  });

  it('caps agent skill examples at the configured boundary', () => {
    const examples = Array.from(
      { length: LIMITS.skillExamplesMax + 1 },
      (_, index) => `example-${index}`
    );
    const state = studioReducer(createInitialState(), {
      type: 'SET_AGENT_CARD',
      source: 'agent',
      payload: {
        skills: [{
          id: 'search',
          name: 'Search',
          description: 'Searches.',
          tags: [],
          examples,
        }],
      },
    });

    const saved = state.draft.agentCard.skills?.[0]?.examples;
    expect(saved).toHaveLength(LIMITS.skillExamplesMax);
    expect(saved?.at(-1)).toBe(`example-${LIMITS.skillExamplesMax - 1}`);
    expect(saved).not.toContain(`example-${LIMITS.skillExamplesMax}`);
  });

  it('caps agent skill input and output modes at the configured boundary', () => {
    const inputModes = Array.from(
      { length: LIMITS.modesMax + 1 },
      (_, index) => `input-${index}`
    );
    const outputModes = Array.from(
      { length: LIMITS.modesMax + 1 },
      (_, index) => `output-${index}`
    );
    const state = studioReducer(createInitialState(), {
      type: 'SET_AGENT_CARD',
      source: 'agent',
      payload: {
        skills: [{
          id: 'search',
          name: 'Search',
          description: 'Searches.',
          tags: [],
          inputModes,
          outputModes,
        }],
      },
    });

    const skill = state.draft.agentCard.skills?.[0];
    expect(skill?.inputModes).toHaveLength(LIMITS.modesMax);
    expect(skill?.inputModes?.at(-1)).toBe(`input-${LIMITS.modesMax - 1}`);
    expect(skill?.inputModes).not.toContain(`input-${LIMITS.modesMax}`);
    expect(skill?.outputModes).toHaveLength(LIMITS.modesMax);
    expect(skill?.outputModes?.at(-1)).toBe(`output-${LIMITS.modesMax - 1}`);
    expect(skill?.outputModes).not.toContain(`output-${LIMITS.modesMax}`);
  });

  it('caps crawler keys by insertion order at the configured boundary', () => {
    const crawlers = Object.fromEntries(
      Array.from(
        { length: LIMITS.crawlersMax + 1 },
        (_, index) => [`Crawler-${index}`, 'allow'] as const
      )
    );
    const state = studioReducer(createInitialState(), {
      type: 'SET_ACCESS_POLICY',
      source: 'human',
      payload: { crawlers },
    });

    const saved = state.draft.access.crawlers;
    expect(Object.keys(saved)).toHaveLength(LIMITS.crawlersMax);
    expect(saved[`Crawler-${LIMITS.crawlersMax - 1}`]).toBe('allow');
    expect(saved[`Crawler-${LIMITS.crawlersMax}`]).toBeUndefined();
  });

  it('keeps crawler names at the length cap and drops longer names', () => {
    const boundaryName = 'b'.repeat(LIMITS.crawlerNameMax);
    const overlongName = 'o'.repeat(LIMITS.crawlerNameMax + 1);
    const state = studioReducer(createInitialState(), {
      type: 'SET_ACCESS_POLICY',
      source: 'human',
      payload: {
        crawlers: {
          [boundaryName]: 'allow',
          [overlongName]: 'disallow',
        },
      },
    });

    expect(state.draft.access.crawlers[boundaryName]).toBe('allow');
    expect(state.draft.access.crawlers[overlongName]).toBeUndefined();
    expect(Object.keys(state.draft.access.crawlers)).toEqual([boundaryName]);
  });

  it('ignores invalid-shaped fields without throwing', () => {
    const state = setName(createInitialState(), 'Preserved');
    const next = studioReducer(state, {
      type: 'SET_IDENTITY',
      source: 'agent',
      payload: { name: 42, description: 'Valid' },
    } as unknown as StudioAction);

    expect(next.draft.identity.name).toBe('Preserved');
    expect(next.draft.identity.description).toBe('Valid');
    expect(next.log.at(-1)?.summary).toContain('(description)');
  });

  it('never mutates the input state', () => {
    const state = studioReducer(createInitialState(), {
      type: 'SET_ACCESS_POLICY',
      source: 'human',
      payload: {
        crawlers: { GPTBot: 'allow', CCBot: 'allow' },
        contentSignal: { search: 'no' },
      },
    });
    const before = structuredClone(state);

    studioReducer(state, {
      type: 'SET_ACCESS_POLICY',
      source: 'agent',
      payload: {
        groups: { train: 'disallow' },
        crawlers: { GPTBot: 'allow', CCBot: null },
        contentSignal: { aiInput: 'no' },
      },
    });

    expect(state).toEqual(before);
  });
});
