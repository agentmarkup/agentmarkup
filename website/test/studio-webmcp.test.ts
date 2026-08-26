// @vitest-environment happy-dom
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import StudioAgentTools from '../src/studio/StudioAgentTools';
import { studioReducer } from '../src/studio/model';
import {
  STUDIO_TOOLS,
  boundedResult,
  detectModelContext,
  registerStudioTools,
} from '../src/studio/webmcp';
import { CRAWLER_GROUPS, LIMITS } from '../src/studio/types';
import type {
  ModelContextLike,
  ModelContextToolDescriptor,
  StudioToolDeps,
} from '../src/studio/webmcp';
import type {
  CompiledSurface,
  Contradiction,
  InspectSiteOutcome,
  StudioAction,
  StudioDraft,
  StudioState,
} from '../src/studio/types';

class MockModelContext implements ModelContextLike {
  readonly descriptors = new Map<string, ModelContextToolDescriptor>();
  readonly active = new Set<string>();
  readonly aborted = new Set<string>();
  registerCalls = 0;

  async registerTool(
    descriptor: ModelContextToolDescriptor,
    options: { signal?: AbortSignal } = {}
  ): Promise<void> {
    this.registerCalls += 1;
    if (options.signal?.aborted) {
      throw new DOMException('Registration aborted', 'AbortError');
    }

    this.descriptors.set(descriptor.name, descriptor);
    this.active.add(descriptor.name);
    options.signal?.addEventListener('abort', () => {
      this.active.delete(descriptor.name);
      this.aborted.add(descriptor.name);
    }, { once: true });
  }

  async executeTool(name: string, argsJson: string) {
    const descriptor = this.descriptors.get(name);
    if (!descriptor) {
      throw new Error(`Unknown mock tool: ${name}`);
    }

    // Chrome's agent-side call accepts JSON text, but page handlers receive parsed values.
    const parsedArgs: unknown = JSON.parse(argsJson);
    return descriptor.execute(parsedArgs);
  }
}

function baseDraft(): StudioDraft {
  return {
    identity: {
      site: 'https://example.com',
      name: 'Example',
      description: 'A useful example site.',
    },
    access: {
      crawlers: {},
      contentSignal: {
        aiTrain: 'yes',
        search: 'yes',
        aiInput: 'yes',
      },
    },
    content: {
      llmsSections: [],
      whenToUse: [],
      llmsFullEnabled: false,
      markdownMirrors: {
        enabled: false,
        exclude: [],
      },
    },
    agentCard: {
      enabled: false,
    },
  };
}

function stateFor(draft = baseDraft()): StudioState {
  return {
    draft,
    history: [],
    log: [],
    seq: 1,
  };
}

function compiled(overrides: Partial<CompiledSurface> = {}): CompiledSurface {
  return {
    llmsTxt: '# Example\n',
    llmsFullTxt: null,
    robotsTxt: 'User-agent: *\nAllow: /\n',
    headersFile: '/*\n  Content-Signal: ai-train=yes\n',
    jsonLd: ['{"@type":"WebSite"}'],
    agentCardJson: null,
    configMjs: 'export default {};\n',
    validations: [],
    ...overrides,
  };
}

function fakeDeps(options: {
  state?: StudioState;
  contradictions?: Contradiction[];
  compiled?: CompiledSurface;
  config?: string;
  inspectSite?: StudioToolDeps['inspectSite'];
} = {}) {
  let state = options.state ?? stateFor();
  const dispatch = vi.fn<(action: StudioAction) => void>((action) => {
    state = studioReducer(state, action);
  });
  const deps: StudioToolDeps = {
    getState: () => state,
    dispatch,
    compile: () => options.compiled ?? compiled(),
    detect: () => options.contradictions ?? [],
    renderConfig: () => options.config ?? 'export default {};\n',
    ...(options.inspectSite ? { inspectSite: options.inspectSite } : {}),
  };

  return { deps, dispatch };
}

function installDocumentContext(mc: ModelContextLike | undefined): void {
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    writable: true,
    value: mc,
  });
}

function installNavigatorContext(mc: ModelContextLike | undefined): void {
  Object.defineProperty(navigator, 'modelContext', {
    configurable: true,
    writable: true,
    value: mc,
  });
}

async function registerWith(
  deps: StudioToolDeps,
  mc = new MockModelContext(),
  signal?: AbortSignal
) {
  installDocumentContext(mc);
  const result = await registerStudioTools(deps, { signal });
  return { mc, result };
}

function resultText(result: Awaited<ReturnType<ModelContextToolDescriptor['execute']>>) {
  return result.content[0].text;
}

function collectDescriptions(value: unknown, target: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectDescriptions(item, target);
    return target;
  }
  if (!value || typeof value !== 'object') return target;

  const record = value as Record<string, unknown>;
  if (typeof record.description === 'string') target.push(record.description);
  for (const child of Object.values(record)) collectDescriptions(child, target);
  return target;
}

function makeContradictions(count: number): Contradiction[] {
  const codes = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'] as const;
  return Array.from({ length: count }, (_, index) => ({
    code: codes[index % codes.length],
    severity: index % 3 === 0 ? 'warning' : 'error',
    title: `Finding ${index.toString().padStart(2, '0')}`,
    detail: 'Detailed finding text that stays in the on-page interface.',
    loci: ['llms.txt', 'robots.txt'],
  }));
}

function maximalDraft(): StudioDraft {
  const short = 's'.repeat(LIMITS.shortText);
  const long = 'l'.repeat(LIMITS.longText);
  const url = `https://example.com/${'u'.repeat(LIMITS.url - 'https://example.com/'.length)}`;
  const crawlers = Object.fromEntries(
    Array.from({ length: LIMITS.crawlersMax }, (_, index) => [
      `Crawler-${index}`,
      index % 2 === 0 ? 'allow' : 'disallow',
    ])
  ) as StudioDraft['access']['crawlers'];

  for (const group of Object.values(CRAWLER_GROUPS)) {
    for (const crawler of group) {
      crawlers[crawler] = 'allow';
    }
  }

  return {
    identity: {
      site: url,
      name: short,
      description: long,
      organization: {
        name: short,
        url,
        logo: url,
        description: long,
        sameAs: Array.from({ length: LIMITS.sameAsMax }, () => url),
        contactPoint: Array.from({ length: LIMITS.contactPointsMax }, () => ({
          contactType: short,
          email: short,
          telephone: short,
          url,
          areaServed: Array.from({ length: LIMITS.sameAsMax }, () => short),
          availableLanguage: Array.from({ length: LIMITS.sameAsMax }, () => short),
        })),
        address: {
          streetAddress: short,
          addressLocality: short,
          addressRegion: short,
          postalCode: short,
          addressCountry: short,
        },
      },
    },
    access: {
      crawlers,
      contentSignal: { aiTrain: 'yes', search: 'yes', aiInput: 'yes' },
    },
    content: {
      llmsSections: Array.from({ length: LIMITS.sectionsMax }, (_, sectionIndex) => ({
        title: `${sectionIndex}-${short}`.slice(0, LIMITS.shortText),
        entries: Array.from({ length: LIMITS.entriesPerSectionMax }, (_, entryIndex) => ({
          title: `${entryIndex}-${short}`.slice(0, LIMITS.shortText),
          url,
          description: long,
        })),
      })),
      whenToUse: Array.from(
        { length: LIMITS.whenToUseMax },
        () => 'w'.repeat(LIMITS.whenToUseEntry)
      ),
      llmsFullEnabled: true,
      markdownMirrors: {
        enabled: true,
        exclude: Array.from({ length: LIMITS.excludeMax }, () => url),
      },
    },
    agentCard: {
      enabled: true,
      version: short,
      description: long,
      supportedInterfaces: Array.from({ length: LIMITS.interfacesMax }, () => ({
        url,
        protocolBinding: short,
        protocolVersion: short,
        tenant: short,
      })),
      skills: Array.from({ length: LIMITS.skillsMax }, (_, index) => ({
        id: `${index}-${short}`.slice(0, LIMITS.shortText),
        name: short,
        description: long,
        tags: Array.from({ length: LIMITS.skillTagsMax }, () => short),
        examples: Array.from({ length: LIMITS.skillExamplesMax }, () => long),
        inputModes: Array.from({ length: LIMITS.modesMax }, () => short),
        outputModes: Array.from({ length: LIMITS.modesMax }, () => short),
      })),
      providerOrganization: short,
      providerUrl: url,
    },
  };
}

beforeEach(() => {
  installDocumentContext(undefined);
  installNavigatorContext(undefined);
});

afterEach(() => {
  installDocumentContext(undefined);
  installNavigatorContext(undefined);
  document.body.replaceChildren();
});

describe('WebMCP registration', () => {
  it('registers all eight tools with schemas and metadata inside the budgets', async () => {
    const { deps } = fakeDeps();
    const { mc, result } = await registerWith(deps);

    expect(result).toEqual({
      registered: Object.values(STUDIO_TOOLS).map(({ name }) => name),
      surface: 'document',
    });
    expect(mc.descriptors).toHaveLength(8);

    for (const metadata of Object.values(STUDIO_TOOLS)) {
      expect(metadata.name.length).toBeLessThanOrEqual(30);
      expect(metadata.description.length).toBeLessThanOrEqual(500);
    }

    for (const descriptor of mc.descriptors.values()) {
      const schema = JSON.parse(JSON.stringify(descriptor.inputSchema)) as {
        type?: unknown;
      };
      expect(schema.type).toBe('object');
      expect(descriptor.name.length).toBeLessThanOrEqual(30);
      expect(descriptor.description.length).toBeLessThanOrEqual(500);
      for (const description of collectDescriptions(schema)) {
        expect(description.length).toBeLessThanOrEqual(150);
      }
    }

    expect(mc.descriptors.get('get_studio_state')?.annotations).toEqual({ readOnlyHint: true });
    expect(mc.descriptors.get('compile_agent_surface')?.annotations).toEqual({ readOnlyHint: true });
    expect(mc.descriptors.get('export_build_plan')?.annotations).toEqual({ readOnlyHint: true });
    expect(mc.descriptors.get('inspect_site')?.annotations).toEqual({
      untrustedContentHint: true,
    });
    expect(mc.descriptors.get('inspect_site')?.annotations).not.toHaveProperty('readOnlyHint');
    const inspectUrlSchema = (
      mc.descriptors.get('inspect_site')?.inputSchema.properties as
        | Record<string, Record<string, unknown>>
        | undefined
    )?.url;
    expect(inspectUrlSchema).toMatchObject({
      type: 'string',
      maxLength: LIMITS.url,
      description: expect.stringContaining('bare domain'),
    });
    expect(inspectUrlSchema).not.toHaveProperty('format');
  });

  it('prefers document.modelContext and falls back to navigator.modelContext', async () => {
    const documentContext = new MockModelContext();
    const navigatorContext = new MockModelContext();
    installDocumentContext(documentContext);
    installNavigatorContext(navigatorContext);

    expect(detectModelContext()).toEqual({ mc: documentContext, surface: 'document' });

    installDocumentContext(undefined);
    const { deps } = fakeDeps();
    const result = await registerStudioTools(deps);

    expect(result.surface).toBe('navigator');
    expect(result.registered).toHaveLength(8);
    expect(navigatorContext.descriptors).toHaveLength(8);
  });

  it('uses AbortSignal unregistration for every registered tool', async () => {
    const controller = new AbortController();
    const { deps } = fakeDeps();
    const { mc } = await registerWith(deps, new MockModelContext(), controller.signal);

    expect(mc.active).toHaveLength(8);
    controller.abort();
    expect(mc.active).toHaveLength(0);
    expect(mc.aborted).toHaveLength(8);
  });

  it('returns an unsupported result without throwing when the API is absent', async () => {
    const { deps } = fakeDeps();

    await expect(registerStudioTools(deps)).resolves.toEqual({
      registered: [],
      surface: 'none',
    });
    expect(detectModelContext()).toEqual({ mc: null, surface: 'none' });
  });
});

describe('write tool validation and dispatch', () => {
  it.each([
    {
      name: 'set_site_identity',
      args: {
        site: 'https://example.org',
        name: 'Example Org',
        description: 'Updated identity.',
        organization: { name: 'Example Org', url: 'https://example.org' },
      },
      actionType: 'SET_IDENTITY',
      confirmation: 'Agent set site identity',
    },
    {
      name: 'set_access_policy',
      args: {
        groups: { search: 'allow' },
        crawlers: { GPTBot: 'disallow', CCBot: null },
        contentSignal: { aiTrain: 'no', search: 'yes' },
      },
      actionType: 'SET_ACCESS_POLICY',
      confirmation: 'Agent set access policy',
    },
    {
      name: 'curate_agent_pages',
      args: {
        llmsSections: [{
          title: 'Guides',
          entries: [{ title: 'Start', url: '/start', description: 'Start here.' }],
        }],
        whenToUse: ['Use for metadata guidance.'],
        llmsFullEnabled: true,
        markdownMirrors: { enabled: true, exclude: ['/private'] },
      },
      actionType: 'CURATE_PAGES',
      confirmation: 'Agent curated pages',
    },
    {
      name: 'configure_agent_card',
      args: {
        enabled: true,
        version: '1.0.0',
        description: 'Answers questions about Example.',
        supportedInterfaces: [{
          url: 'https://example.com/a2a',
          protocolBinding: 'HTTP+JSON',
          protocolVersion: '1.0',
        }],
        skills: [{
          id: 'answer',
          name: 'Answer',
          description: 'Answers questions.',
          tags: ['questions'],
        }],
        providerOrganization: 'Example',
        providerUrl: 'https://example.com',
      },
      actionType: 'SET_AGENT_CARD',
      confirmation: 'Agent Card updated and valid',
    },
  ] as const)(
    '$name dispatches one agent-sourced action for valid input',
    async ({ name, args, actionType, confirmation }) => {
      const { deps, dispatch } = fakeDeps();
      const { mc } = await registerWith(deps);

      const result = await mc.executeTool(name, JSON.stringify(args));

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith({
        type: actionType,
        source: 'agent',
        payload: args,
      });
      const reducerSummary = deps.getState().log.at(-1)?.summary;
      expect(reducerSummary).toBeDefined();
      expect(resultText(result).startsWith(reducerSummary ?? '\0')).toBe(true);
      expect(resultText(result)).toContain(confirmation);
    }
  );

  it.each([
    ['set_site_identity', { name: 'x'.repeat(LIMITS.shortText + 1) }],
    ['set_access_policy', { groups: { train: 'sometimes' } }],
    ['curate_agent_pages', { whenToUse: [42] }],
    ['configure_agent_card', { enabled: 'yes' }],
  ])('%s rejects invalid input without dispatching', async (name, args) => {
    const { deps, dispatch } = fakeDeps();
    const { mc } = await registerWith(deps);

    const result = await mc.executeTool(name, JSON.stringify(args));
    const text = resultText(result);

    expect(dispatch).not.toHaveBeenCalled();
    expect(text).toMatch(/^Rejected: /);
    expect(text).toContain('"error":"invalid_arguments"');
  });

  it('rejects over-limit collections instead of letting the reducer truncate them', async () => {
    const { deps, dispatch } = fakeDeps();
    const { mc } = await registerWith(deps);
    const cases = [
      ['set_access_policy', {
        crawlers: Object.fromEntries(
          Array.from({ length: LIMITS.crawlersMax + 1 }, (_, index) => [`Bot-${index}`, 'allow'])
        ),
      }],
      ['curate_agent_pages', {
        llmsSections: Array.from({ length: LIMITS.sectionsMax + 1 }, () => ({
          title: 'Section',
          entries: [],
        })),
      }],
      ['configure_agent_card', {
        supportedInterfaces: Array.from({ length: LIMITS.interfacesMax + 1 }, () => ({
          url: 'https://example.com/a2a',
          protocolBinding: 'HTTP+JSON',
          protocolVersion: '1.0',
        })),
      }],
    ] as const;

    for (const [name, args] of cases) {
      const result = await mc.executeTool(name, JSON.stringify(args));
      expect(resultText(result)).toMatch(/^Rejected: /);
    }
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('rejects six skill security requirements instead of silently truncating them', async () => {
    const { deps, dispatch } = fakeDeps();
    const { mc } = await registerWith(deps);
    const result = await mc.executeTool('configure_agent_card', JSON.stringify({
      skills: [{
        id: 'answer',
        name: 'Answer',
        description: 'Answers questions.',
        tags: ['questions'],
        security: Array.from(
          { length: LIMITS.modesMax + 1 },
          (_, index) => ({ [`oauth${index}`]: [] })
        ),
      }],
    }));

    expect(resultText(result)).toMatch(/^Rejected: /);
    expect(resultText(result)).toContain(`at most ${LIMITS.modesMax} items`);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('rejects crawler names containing ASCII control characters', async () => {
    const { deps, dispatch } = fakeDeps();
    const { mc } = await registerWith(deps);
    const result = await mc.executeTool('set_access_policy', JSON.stringify({
      crawlers: { 'Poisoned\nBot': 'disallow' },
    }));

    expect(resultText(result)).toMatch(/^Rejected: /);
    expect(resultText(result)).toContain('"error":"invalid_arguments"');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('reports the missing fields when an enabled Agent Card remains invalid', async () => {
    const { deps, dispatch } = fakeDeps();
    const { mc } = await registerWith(deps);

    const result = await mc.executeTool('configure_agent_card', JSON.stringify({ enabled: true }));

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(resultText(result)).toContain('Missing or invalid');
    expect(resultText(result)).toContain('version');
    expect(resultText(result)).toContain('supportedInterfaces');
  });

  it('dispatches skill security requirements without changing them', async () => {
    const security = [{ oauth2: ['read:answers', 'write:answers'], apiKey: [] }];
    const args = {
      enabled: true,
      version: '1.0.0',
      supportedInterfaces: [{
        url: 'https://example.com/a2a',
        protocolBinding: 'HTTP+JSON',
        protocolVersion: '1.0',
      }],
      skills: [{
        id: 'answer',
        name: 'Answer',
        description: 'Answers questions.',
        tags: ['questions'],
        security,
      }],
    };
    const { deps, dispatch } = fakeDeps();
    const { mc } = await registerWith(deps);

    await mc.executeTool('configure_agent_card', JSON.stringify(args));

    expect(dispatch).toHaveBeenCalledExactlyOnceWith({
      type: 'SET_AGENT_CARD',
      source: 'agent',
      payload: args,
    });
    const dispatched = dispatch.mock.calls[0]?.[0];
    expect(
      dispatched?.type === 'SET_AGENT_CARD'
        ? dispatched.payload.skills?.[0]?.security
        : undefined
    ).toEqual(security);
  });

  it('returns the reducer drop note when a crawler addition exceeds the cap', async () => {
    const crawlers = Object.fromEntries(
      Array.from(
        { length: LIMITS.crawlersMax },
        (_, index) => [`Crawler-${index}`, 'allow'] as const
      )
    );
    const state = stateFor({
      ...baseDraft(),
      access: {
        ...baseDraft().access,
        crawlers,
      },
    });
    const { deps } = fakeDeps({ state });
    const { mc } = await registerWith(deps);

    const result = await mc.executeTool('set_access_policy', JSON.stringify({
      crawlers: { NewBot: 'allow' },
    }));

    expect(resultText(result)).toBe(
      'Agent made no valid changes. (1 crawler(s) dropped at the cap)'
    );
  });
});

describe('bounded read tool results', () => {
  it('truncates over-budget text with a visible marker and preserves exact-budget text', () => {
    const exact = 'x'.repeat(1500);
    const over = 'x'.repeat(1501);

    expect(resultText(boundedResult(exact))).toBe(exact);
    expect(resultText(boundedResult(over))).toHaveLength(1500);
    expect(resultText(boundedResult(over))).toContain('[truncated to fit the WebMCP result limit]');
  });

  it('keeps state and compile JSON under budget for a maximal draft', async () => {
    const draft = maximalDraft();
    const state = stateFor(draft);
    state.log = Array.from({ length: LIMITS.activityLogMax }, (_, index) => ({
      seq: index + 1,
      source: index % 2 === 0 ? 'agent' : 'human',
      actionType: 'SET_IDENTITY',
      summary: `Activity ${index}: ${'a'.repeat(LIMITS.url)}`,
    }));
    const contradictions = makeContradictions(15);
    const { deps } = fakeDeps({
      state,
      contradictions,
      compiled: compiled({
        llmsTxt: 'l'.repeat(50_000),
        llmsFullTxt: 'f'.repeat(50_000),
        robotsTxt: 'r'.repeat(50_000),
        headersFile: 'h'.repeat(50_000),
        jsonLd: ['j'.repeat(50_000)],
        agentCardJson: 'a'.repeat(50_000),
        configMjs: 'c'.repeat(50_000),
        validations: Array.from({ length: 100 }, () => ({
          severity: 'warning',
          message: 'A validation message.',
        })),
      }),
    });
    const { mc } = await registerWith(deps);

    const stateText = resultText(await mc.executeTool('get_studio_state', '{}'));
    const compileText = resultText(await mc.executeTool('compile_agent_surface', '{}'));

    expect(stateText.length).toBeLessThanOrEqual(1500);
    expect(compileText.length).toBeLessThanOrEqual(1500);
    expect(() => JSON.parse(stateText)).not.toThrow();
    const stateJson = JSON.parse(stateText) as {
      validations: { error: number; warning: number };
      artifacts: string[];
    };
    const compileJson = JSON.parse(compileText) as {
      contradictions: Array<{ detail: string }>;
      moreInUi: boolean;
      validationCount: number;
    };
    expect(stateJson.validations).toEqual({ error: 0, warning: 100 });
    expect(stateJson.artifacts).toEqual([
      'llms.txt',
      'robots.txt',
      '_headers',
      'json-ld',
      'agentmarkup.config.mjs',
      'llms-full.txt',
      '.well-known/agent-card.json',
    ]);
    expect(compileJson.contradictions).toHaveLength(10);
    expect(compileJson.contradictions.every(({ detail }) => (
      !detail.includes('\n') && detail.length <= 80
    ))).toBe(true);
    expect(compileJson.moreInUi).toBe(true);
    expect(compileJson.validationCount).toBe(100);
  });

  it('returns the full small build plan and an exact pointer for a large plan', async () => {
    const smallConfig = 'export default { site: "https://example.com" };\n';
    const small = fakeDeps({ config: smallConfig });
    const smallContext = await registerWith(small.deps);
    const smallText = resultText(await smallContext.mc.executeTool('export_build_plan', '{}'));

    expect(smallText).toContain(smallConfig.trimEnd());
    expect(smallText).toContain('Next steps:');
    expect(smallText).not.toContain('"tooLarge":true');

    const fragment = 'DO_NOT_RETURN_A_PARTIAL_CONFIG';
    const hugeConfig = fragment.repeat(400);
    const large = fakeDeps({ config: hugeConfig });
    const largeContext = await registerWith(large.deps);
    const largeText = resultText(await largeContext.mc.executeTool('export_build_plan', '{}'));
    const pointer = JSON.parse(largeText);

    expect(pointer).toEqual({
      tooLarge: true,
      bytes: new TextEncoder().encode(hugeConfig).byteLength,
      hint: 'use the on-page download control',
    });
    expect(largeText).not.toContain(fragment);
    expect(largeText).not.toContain('[truncated');
  });

  it('reports only an exception kind when tool execution fails', async () => {
    const privateMessage = 'private checker internals';
    const { deps } = fakeDeps();
    deps.compile = () => {
      throw new TypeError(privateMessage);
    };
    const { mc } = await registerWith(deps);

    const result = await mc.executeTool('compile_agent_surface', '{}');

    expect(resultText(result)).toBe(
      'Failed: {"error":"tool_execution_failed","kind":"TypeError"}'
    );
    expect(resultText(result)).not.toContain(privateMessage);
  });
});

describe('inspect_site', () => {
  it('returns an empty findings list without checker summary text', async () => {
    const patch: InspectSiteOutcome['draftPatch'] = {
      identity: {
        site: 'https://checked.example',
        name: 'Checked',
        description: 'Imported from the checker.',
      },
    };
    const inspectSite = vi.fn(async (): Promise<InspectSiteOutcome> => ({
      ok: true,
      summaryText: `Imported structured findings. ${'x'.repeat(2000)}`,
      draftPatch: patch,
      sourceUrl: 'https://checked.example',
    }));
    const { deps, dispatch } = fakeDeps({ inspectSite });
    const { mc } = await registerWith(deps);

    const result = await mc.executeTool('inspect_site', JSON.stringify({ url: 'checked.example' }));
    const text = resultText(result);

    expect(inspectSite).toHaveBeenCalledExactlyOnceWith('https://checked.example');
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({
      type: 'IMPORT_FROM_CHECK',
      source: 'agent',
      payload: patch,
      sourceUrl: 'https://checked.example',
    });
    expect(JSON.parse(text)).toEqual({ findings: [], imported: true });
    expect(text).not.toContain('Imported structured findings');
  });

  it('returns compact structured findings and whether a patch was imported', async () => {
    const patch: InspectSiteOutcome['draftPatch'] = {
      content: {
        llmsSections: [],
        whenToUse: ['Use for public documentation.'],
        llmsFullEnabled: false,
        markdownMirrors: { enabled: false, exclude: [] },
      },
    };
    const findings = Array.from({ length: 12 }, (_, index) => ({
      level: index % 2 === 0 ? 'warning' : 'pass',
      title: `Finding ${index}\n${'x'.repeat(100)}`,
    }));
    const inspectSite = vi.fn(async (): Promise<InspectSiteOutcome> => ({
      ok: true,
      summaryText: `Structured summary\n${'s'.repeat(400)}`,
      findings,
      draftPatch: patch,
      sourceUrl: 'https://checked.example',
    }));
    const { deps, dispatch } = fakeDeps({ inspectSite });
    const { mc } = await registerWith(deps);

    const text = resultText(await mc.executeTool(
      'inspect_site',
      JSON.stringify({ url: 'checked.example' })
    ));
    const parsed = JSON.parse(text) as {
      findings: Array<{ level: string; title: string }>;
      imported: boolean;
    };

    expect(text.length).toBeLessThanOrEqual(1500);
    expect(parsed).not.toHaveProperty('summary');
    expect(parsed.findings).toHaveLength(10);
    expect(parsed.findings.every(({ level, title }) => (
      level.length <= 16 && title.length <= 64 && !title.includes('\n')
    ))).toBe(true);
    expect(parsed.imported).toBe(true);
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({
      type: 'IMPORT_FROM_CHECK',
      source: 'agent',
      payload: patch,
      sourceUrl: 'https://checked.example',
    });
  });

  it.each(['turnstile', 'rate-limited'] as const)(
    'reports %s as a human action and does not dispatch',
    async (humanActionNeeded) => {
      const inspectSite = vi.fn(async (): Promise<InspectSiteOutcome> => ({
        ok: false,
        summaryText: 'Checker needs a human step.',
        humanActionNeeded,
      }));
      const { deps, dispatch } = fakeDeps({ inspectSite });
      const { mc } = await registerWith(deps);

      const result = await mc.executeTool(
        'inspect_site',
        JSON.stringify({ url: 'https://example.com' })
      );

      expect(dispatch).not.toHaveBeenCalled();
      expect(resultText(result)).toContain('human action needed:');
    }
  );

  it('reports when inspection is unavailable without dispatching', async () => {
    const { deps, dispatch } = fakeDeps();
    const { mc } = await registerWith(deps);

    const result = await mc.executeTool(
      'inspect_site',
      JSON.stringify({ url: 'https://example.com' })
    );

    expect(resultText(result)).toBe('inspect_site is not available in this build.');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each([
    ['not a valid host with spaces'],
    ['ftp://example.com'],
    ['x'.repeat(LIMITS.url + 1)],
  ])('rejects invalid URL %j without calling the inspector', async (url) => {
    const inspectSite = vi.fn(async (): Promise<InspectSiteOutcome> => ({
      ok: true,
      summaryText: 'Should not run.',
      draftPatch: {},
    }));
    const { deps, dispatch } = fakeDeps({ inspectSite });
    const { mc } = await registerWith(deps);

    const result = await mc.executeTool('inspect_site', JSON.stringify({ url }));

    expect(resultText(result)).toMatch(/^Rejected: /);
    expect(inspectSite).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('StudioAgentTools', () => {
  it('registers once, uses current props, and aborts every tool on unmount', async () => {
    const mc = new MockModelContext();
    installDocumentContext(mc);
    const initial = fakeDeps();
    const current = fakeDeps();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    let resolveStatus: ((value: { supported: boolean; registered: string[] }) => void) | undefined;
    const statusPromise = new Promise<{ supported: boolean; registered: string[] }>((resolve) => {
      resolveStatus = resolve;
    });
    const initialOnStatus = vi.fn();
    const currentOnStatus = vi.fn((status: { supported: boolean; registered: string[] }) => {
      resolveStatus?.(status);
    });

    flushSync(() => {
      root.render(createElement(StudioAgentTools, {
        deps: initial.deps,
        onStatus: initialOnStatus,
      }));
    });
    flushSync(() => {
      root.render(createElement(StudioAgentTools, {
        deps: current.deps,
        onStatus: currentOnStatus,
      }));
    });
    const status = await statusPromise;

    expect(status).toEqual({
      supported: true,
      registered: Object.values(STUDIO_TOOLS).map(({ name }) => name),
    });
    expect(initialOnStatus).not.toHaveBeenCalled();
    expect(currentOnStatus).toHaveBeenCalledTimes(1);
    expect(mc.registerCalls).toBe(8);
    expect(mc.active).toHaveLength(8);
    expect(mc.aborted).toHaveLength(0);

    await mc.executeTool('set_site_identity', JSON.stringify({ name: 'Current deps' }));
    expect(initial.dispatch).not.toHaveBeenCalled();
    expect(current.dispatch).toHaveBeenCalledExactlyOnceWith({
      type: 'SET_IDENTITY',
      source: 'agent',
      payload: { name: 'Current deps' },
    });

    flushSync(() => root.unmount());
    expect(mc.active).toHaveLength(0);
    expect(mc.aborted).toHaveLength(8);
  });
});
