import { normalizeWebsiteInput } from '../normalizeWebsiteInput';
import { CRAWLER_GROUPS, LIMITS } from './types';
import type {
  CompiledSurface,
  Contradiction,
  InspectSiteOutcome,
  StudioAction,
  StudioAgentCardDraft,
  StudioContent,
  StudioDraft,
  StudioIdentity,
  StudioState,
} from './types';

const TOOL_RESULT_LIMIT = 1500;
const TOOL_NAME_LIMIT = 30;
const TOOL_DESCRIPTION_LIMIT = 500;
const PARAM_DESCRIPTION_LIMIT = 150;
const TRUNCATION_MARKER = '\n[truncated to fit the WebMCP result limit]';

type JsonSchema = Record<string, unknown>;
type ModelContextSurface = 'document' | 'navigator' | 'none';
type ToolResult = { content: [{ type: 'text'; text: string }] };
type UnknownRecord = Record<string, unknown>;

export interface StudioToolDeps {
  getState(): StudioState;
  dispatch(action: StudioAction): void;
  compile(draft: StudioDraft): CompiledSurface;
  detect(draft: StudioDraft): Contradiction[];
  renderConfig(draft: StudioDraft): string;
  inspectSite?(url: string): Promise<InspectSiteOutcome>;
}

export interface ModelContextToolDescriptor {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute(args: unknown): Promise<ToolResult>;
}

export interface ModelContextLike {
  registerTool(
    descriptor: ModelContextToolDescriptor,
    options?: { signal?: AbortSignal }
  ): Promise<unknown>;
}

declare global {
  interface Document {
    modelContext?: ModelContextLike;
  }

  interface Navigator {
    modelContext?: ModelContextLike;
  }
}

const STUDIO_TOOL_METADATA = {
  getStudioState: {
    name: 'get_studio_state',
    description:
      'Read a compact summary of the current Agent Surface Studio draft, contradictions, and recent activity.',
  },
  setSiteIdentity: {
    name: 'set_site_identity',
    description:
      'Update the site identity and optional Organization metadata in the in-memory Studio draft.',
  },
  setAccessPolicy: {
    name: 'set_access_policy',
    description:
      'Set crawler access by intent group or crawler name and update Content-Signal directives in the Studio draft.',
  },
  curateAgentPages: {
    name: 'curate_agent_pages',
    description:
      'Curate llms.txt sections, usage guidance, full-text output, and markdown mirror settings in the Studio draft.',
  },
  configureAgentCard: {
    name: 'configure_agent_card',
    description:
      'Configure the optional A2A Agent Card in the Studio draft and report whether the resulting card is valid.',
  },
  compileAgentSurface: {
    name: 'compile_agent_surface',
    description:
      'Compile the current draft and return artifact byte sizes, validation count, and top cross-surface contradictions.',
  },
  exportBuildPlan: {
    name: 'export_build_plan',
    description:
      'Return the complete agentmarkup.config.mjs build plan when it fits, or point to the on-page download control.',
  },
  inspectSite: {
    name: 'inspect_site',
    description:
      'Inspect a public site through the existing checker, import a bounded structured draft patch, and report required human steps.',
  },
} as const;

export const STUDIO_TOOLS = Object.values(STUDIO_TOOL_METADATA);

const STRING_ARRAY_DESCRIPTION = 'A bounded list of text values.';

const CONTACT_POINT_SCHEMA: JsonSchema = {
  type: 'object',
  description: 'A schema.org contact point for the organization.',
  additionalProperties: false,
  required: ['contactType'],
  properties: {
    contactType: stringSchema('The contact role, such as technical support.', LIMITS.shortText),
    email: stringSchema('An email address for this contact.', LIMITS.shortText),
    telephone: stringSchema('A telephone number for this contact.', LIMITS.shortText),
    url: urlSchema('An absolute HTTP or HTTPS URL for this contact.'),
    areaServed: stringOrArraySchema('A service area or a bounded list of service areas.'),
    availableLanguage: stringOrArraySchema('A language or a bounded list of languages.'),
  },
};

const ADDRESS_SCHEMA: JsonSchema = {
  type: 'object',
  description: 'A schema.org postal address for the organization.',
  additionalProperties: false,
  required: ['addressCountry'],
  properties: {
    streetAddress: stringSchema('The street address.', LIMITS.shortText),
    addressLocality: stringSchema('The city or locality.', LIMITS.shortText),
    addressRegion: stringSchema('The state, county, or region.', LIMITS.shortText),
    postalCode: stringSchema('The postal code.', LIMITS.shortText),
    addressCountry: stringSchema('The country name or ISO country code.', LIMITS.shortText),
  },
};

const ORGANIZATION_SCHEMA: JsonSchema = {
  type: 'object',
  description: 'Optional Organization metadata paired with the site identity.',
  additionalProperties: false,
  required: ['name', 'url'],
  properties: {
    name: stringSchema('The organization name.', LIMITS.shortText),
    url: urlSchema('The organization canonical HTTP or HTTPS URL.'),
    logo: urlSchema('An absolute HTTP or HTTPS logo URL.'),
    description: stringSchema('A concise organization description.', LIMITS.longText),
    sameAs: {
      type: 'array',
      description: 'Absolute HTTP or HTTPS profile URLs for the organization.',
      maxItems: LIMITS.sameAsMax,
      items: urlSchema('An organization profile URL.'),
    },
    contactPoint: {
      type: 'array',
      description: 'Public contact points for the organization.',
      maxItems: LIMITS.contactPointsMax,
      items: CONTACT_POINT_SCHEMA,
    },
    address: ADDRESS_SCHEMA,
  },
};

const IDENTITY_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    site: urlSchema('The absolute HTTP or HTTPS site root.'),
    name: stringSchema('The public site name.', LIMITS.shortText),
    description: stringSchema('A concise site description.', LIMITS.longText),
    organization: ORGANIZATION_SCHEMA,
  },
};

const ACCESS_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    groups: {
      type: 'object',
      description: 'Crawler directives applied to train, search, or agent groups.',
      additionalProperties: false,
      properties: {
        train: crawlerDirectiveSchema('Directive for model-training crawlers.'),
        search: crawlerDirectiveSchema('Directive for AI search and retrieval crawlers.'),
        agent: crawlerDirectiveSchema('Directive for user-triggered agent fetchers.'),
      },
    },
    crawlers: {
      type: 'object',
      description: 'Per-crawler allow, disallow, or null-to-clear overrides.',
      maxProperties: LIMITS.crawlersMax,
      propertyNames: { maxLength: LIMITS.crawlerNameMax },
      additionalProperties: {
        anyOf: [
          { type: 'string', enum: ['allow', 'disallow'] },
          { type: 'null' },
        ],
      },
    },
    contentSignal: {
      type: 'object',
      description: 'Content-Signal permissions for training, search, and AI input.',
      additionalProperties: false,
      properties: {
        aiTrain: contentSignalSchema('Whether model training is permitted.'),
        search: contentSignalSchema('Whether search and retrieval are permitted.'),
        aiInput: contentSignalSchema('Whether agent input use is permitted.'),
      },
    },
  },
};

const LLMS_ENTRY_SCHEMA: JsonSchema = {
  type: 'object',
  description: 'One page advertised in an llms.txt section.',
  additionalProperties: false,
  required: ['title', 'url'],
  properties: {
    title: stringSchema('The page title.', LIMITS.shortText),
    url: stringSchema('A relative or absolute page URL.', LIMITS.url),
    description: stringSchema('An optional page description.', LIMITS.longText),
  },
};

const CONTENT_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    llmsSections: {
      type: 'array',
      description: 'The curated sections and entries emitted into llms.txt.',
      maxItems: LIMITS.sectionsMax,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'entries'],
        properties: {
          title: stringSchema('The llms.txt section title.', LIMITS.shortText),
          entries: {
            type: 'array',
            description: 'Pages included in this section.',
            maxItems: LIMITS.entriesPerSectionMax,
            items: LLMS_ENTRY_SCHEMA,
          },
        },
      },
    },
    whenToUse: {
      type: 'array',
      description: 'Short statements explaining when an agent should use this site.',
      maxItems: LIMITS.whenToUseMax,
      items: stringSchema('One usage statement.', LIMITS.whenToUseEntry),
    },
    llmsFullEnabled: {
      type: 'boolean',
      description: 'Whether to generate the optional llms-full.txt artifact.',
    },
    markdownMirrors: {
      type: 'object',
      description: 'Markdown mirror generation and exclusion settings.',
      additionalProperties: false,
      required: ['enabled', 'exclude'],
      properties: {
        enabled: {
          type: 'boolean',
          description: 'Whether markdown mirrors are generated.',
        },
        exclude: {
          type: 'array',
          description: 'Page patterns excluded from markdown mirrors.',
          maxItems: LIMITS.excludeMax,
          items: stringSchema('One exclusion path or pattern.', LIMITS.url),
        },
      },
    },
  },
};

const INTERFACE_SCHEMA: JsonSchema = {
  type: 'object',
  description: 'One transport interface advertised by the Agent Card.',
  additionalProperties: false,
  required: ['url', 'protocolBinding', 'protocolVersion'],
  properties: {
    url: stringSchema('An absolute HTTP, HTTPS, WS, or WSS interface URL.', LIMITS.url),
    protocolBinding: stringSchema('The interface protocol binding.', LIMITS.shortText),
    protocolVersion: stringSchema('The interface protocol version.', LIMITS.shortText),
    tenant: stringSchema('An optional tenant identifier.', LIMITS.shortText),
  },
};

const SECURITY_REQUIREMENT_SCHEMA: JsonSchema = {
  type: 'object',
  description: 'A security scheme name mapped to required scopes.',
  maxProperties: LIMITS.skillTagsMax,
  propertyNames: { maxLength: LIMITS.shortText },
  additionalProperties: {
    type: 'array',
    maxItems: LIMITS.modesMax,
    items: stringSchema('One required security scope.', LIMITS.shortText),
  },
};

const SKILL_SCHEMA: JsonSchema = {
  type: 'object',
  description: 'One skill advertised by the Agent Card.',
  additionalProperties: false,
  required: ['id', 'name', 'description', 'tags'],
  properties: {
    id: stringSchema('The stable skill identifier.', LIMITS.shortText),
    name: stringSchema('The human-readable skill name.', LIMITS.shortText),
    description: stringSchema('A concise skill description.', LIMITS.longText),
    tags: boundedStringArray('Searchable tags for this skill.', LIMITS.skillTagsMax, LIMITS.shortText),
    examples: boundedStringArray('Example requests for this skill.', LIMITS.skillExamplesMax, LIMITS.longText),
    inputModes: boundedStringArray('Supported input media types.', LIMITS.modesMax, LIMITS.shortText),
    outputModes: boundedStringArray('Supported output media types.', LIMITS.modesMax, LIMITS.shortText),
    security: {
      type: 'array',
      description: 'Optional security requirements for this skill.',
      maxItems: LIMITS.modesMax,
      items: SECURITY_REQUIREMENT_SCHEMA,
    },
  },
};

const AGENT_CARD_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    enabled: {
      type: 'boolean',
      description: 'Whether to emit the Agent Card discovery file.',
    },
    version: stringSchema('The Agent Card version.', LIMITS.shortText),
    description: stringSchema('The Agent Card description.', LIMITS.longText),
    supportedInterfaces: {
      type: 'array',
      description: 'Transport interfaces exposed by the agent.',
      maxItems: LIMITS.interfacesMax,
      items: INTERFACE_SCHEMA,
    },
    skills: {
      type: 'array',
      description: 'Skills advertised by the Agent Card.',
      maxItems: LIMITS.skillsMax,
      items: SKILL_SCHEMA,
    },
    providerOrganization: stringSchema('The provider organization name.', LIMITS.shortText),
    providerUrl: urlSchema('The provider organization HTTP or HTTPS URL.'),
  },
};

const EMPTY_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  maxProperties: 0,
  properties: {},
};

const INSPECT_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['url'],
  properties: {
    url: stringSchema('A site root or bare domain to inspect.', LIMITS.url),
  },
};

export function detectModelContext(): {
  mc: ModelContextLike | null;
  surface: ModelContextSurface;
} {
  if (
    typeof document !== 'undefined' &&
    isModelContextLike(document.modelContext)
  ) {
    return { mc: document.modelContext, surface: 'document' };
  }

  if (
    typeof navigator !== 'undefined' &&
    isModelContextLike(navigator.modelContext)
  ) {
    return { mc: navigator.modelContext, surface: 'navigator' };
  }

  return { mc: null, surface: 'none' };
}

export function boundedResult(text: string): ToolResult {
  if (text.length <= TOOL_RESULT_LIMIT) {
    return { content: [{ type: 'text', text }] };
  }

  return {
    content: [{
      type: 'text',
      text: `${text.slice(0, TOOL_RESULT_LIMIT - TRUNCATION_MARKER.length)}${TRUNCATION_MARKER}`,
    }],
  };
}

export async function registerStudioTools(
  deps: StudioToolDeps,
  options: { signal?: AbortSignal } = {}
): Promise<{ registered: string[]; surface: ModelContextSurface }> {
  const { mc, surface } = detectModelContext();
  if (!mc || surface === 'none') {
    return { registered: [], surface: 'none' };
  }

  const registerTool = getRegisterTool(mc, surface);
  const registered: string[] = [];

  for (const descriptor of buildToolDescriptors(deps)) {
    if (options.signal?.aborted) {
      break;
    }

    try {
      await registerTool(descriptor, { signal: options.signal });
      registered.push(descriptor.name);
    } catch {
      // A rejected registration should not prevent the remaining independent tools.
    }
  }

  return { registered, surface };
}

function getRegisterTool(
  mc: ModelContextLike,
  surface: Exclude<ModelContextSurface, 'none'>
): ModelContextLike['registerTool'] {
  if (
    surface === 'document' &&
    typeof document !== 'undefined' &&
    document.modelContext === mc
  ) {
    return document.modelContext.registerTool.bind(document.modelContext);
  }

  if (
    surface === 'navigator' &&
    typeof navigator !== 'undefined' &&
    navigator.modelContext === mc
  ) {
    return navigator.modelContext.registerTool.bind(navigator.modelContext);
  }

  return mc.registerTool.bind(mc);
}

function buildToolDescriptors(deps: StudioToolDeps): ModelContextToolDescriptor[] {
  return [
    {
      ...STUDIO_TOOL_METADATA.getStudioState,
      inputSchema: EMPTY_INPUT_SCHEMA,
      annotations: { readOnlyHint: true },
      execute: safelyExecute(async (args) => {
        const rejection = validateEmptyArgs(args);
        if (rejection) return rejected(rejection);
        return compactStateResult(deps.getState(), deps.detect, deps.compile);
      }),
    },
    {
      ...STUDIO_TOOL_METADATA.setSiteIdentity,
      inputSchema: IDENTITY_INPUT_SCHEMA,
      execute: safelyExecute(async (args) => {
        const parsed = validateIdentityArgs(args);
        if (!parsed.ok) return rejected(parsed.reason);

        deps.dispatch({
          type: 'SET_IDENTITY',
          source: 'agent',
          payload: parsed.value,
        });
        return reducerSummaryResult(deps);
      }),
    },
    {
      ...STUDIO_TOOL_METADATA.setAccessPolicy,
      inputSchema: ACCESS_INPUT_SCHEMA,
      execute: safelyExecute(async (args) => {
        const parsed = validateAccessArgs(args);
        if (!parsed.ok) return rejected(parsed.reason);

        deps.dispatch({
          type: 'SET_ACCESS_POLICY',
          source: 'agent',
          payload: parsed.value,
        });
        return reducerSummaryResult(deps);
      }),
    },
    {
      ...STUDIO_TOOL_METADATA.curateAgentPages,
      inputSchema: CONTENT_INPUT_SCHEMA,
      execute: safelyExecute(async (args) => {
        const parsed = validateContentArgs(args);
        if (!parsed.ok) return rejected(parsed.reason);

        deps.dispatch({
          type: 'CURATE_PAGES',
          source: 'agent',
          payload: parsed.value,
        });
        return reducerSummaryResult(deps);
      }),
    },
    {
      ...STUDIO_TOOL_METADATA.configureAgentCard,
      inputSchema: AGENT_CARD_INPUT_SCHEMA,
      execute: safelyExecute(async (args) => {
        const parsed = validateAgentCardArgs(args);
        if (!parsed.ok) return rejected(parsed.reason);

        const currentDraft = deps.getState().draft;
        const prospectiveDraft: StudioDraft = {
          ...currentDraft,
          agentCard: { ...currentDraft.agentCard, ...parsed.value },
        };
        const problems = getAgentCardProblems(prospectiveDraft, deps.compile);

        deps.dispatch({
          type: 'SET_AGENT_CARD',
          source: 'agent',
          payload: parsed.value,
        });

        const summary = latestReducerSummary(deps);
        if (!prospectiveDraft.agentCard.enabled) {
          return boundedResult(`${summary} Agent Card disabled.`);
        }
        if (problems.length > 0) {
          return boundedResult(`${summary} Agent Card updated but invalid. Missing or invalid: ${problems.join('; ')}.`);
        }
        return boundedResult(`${summary} Agent Card updated and valid.`);
      }),
    },
    {
      ...STUDIO_TOOL_METADATA.compileAgentSurface,
      inputSchema: EMPTY_INPUT_SCHEMA,
      annotations: { readOnlyHint: true },
      execute: safelyExecute(async (args) => {
        const rejection = validateEmptyArgs(args);
        if (rejection) return rejected(rejection);

        const draft = deps.getState().draft;
        return compileResult(deps.compile(draft), deps.detect(draft));
      }),
    },
    {
      ...STUDIO_TOOL_METADATA.exportBuildPlan,
      inputSchema: EMPTY_INPUT_SCHEMA,
      annotations: { readOnlyHint: true },
      execute: safelyExecute(async (args) => {
        const rejection = validateEmptyArgs(args);
        if (rejection) return rejected(rejection);

        return exportResult(deps.renderConfig(deps.getState().draft));
      }),
    },
    {
      ...STUDIO_TOOL_METADATA.inspectSite,
      inputSchema: INSPECT_INPUT_SCHEMA,
      annotations: { untrustedContentHint: true },
      execute: safelyExecute(async (args) => {
        const parsed = validateInspectArgs(args);
        if (!parsed.ok) return rejected(parsed.reason);
        if (!deps.inspectSite) {
          return boundedResult('inspect_site is not available in this build.');
        }

        const outcome = await deps.inspectSite(parsed.value.url);
        if (outcome.humanActionNeeded) {
          const action = outcome.humanActionNeeded === 'turnstile'
            ? 'complete the Turnstile challenge in the Studio'
            : 'wait for the checker cooldown shown in the Studio';
          return boundedResult(`human action needed: ${action}, then retry inspect_site.`);
        }

        if (!outcome.ok) {
          const code = outcome.errorCode ? ` (${outcome.errorCode})` : '';
          return boundedResult(`inspect_site failed${code}: ${outcome.summaryText}`);
        }

        if (outcome.draftPatch) {
          deps.dispatch({
            type: 'IMPORT_FROM_CHECK',
            source: 'agent',
            payload: outcome.draftPatch,
            sourceUrl: outcome.sourceUrl ?? parsed.value.url,
          });
        }

        return inspectResult(outcome);
      }),
    },
  ];
}

function compactStateResult(
  state: StudioState,
  detect: StudioToolDeps['detect'],
  compile: StudioToolDeps['compile']
): ToolResult {
  const contradictions = detect(state.draft);
  const compiled = compile(state.draft);
  const sectionCount = state.draft.content.llmsSections.length;
  const entryCount = state.draft.content.llmsSections.reduce(
    (total, section) => total + section.entries.length,
    0
  );
  const summary = {
    identity: {
      site: compactText(state.draft.identity.site, 120),
      name: compactText(state.draft.identity.name, 80),
      descriptionChars: state.draft.identity.description.length,
      organization: compactText(state.draft.identity.organization?.name ?? '', 80) || null,
    },
    crawlerDirectives: Object.fromEntries(
      Object.entries(CRAWLER_GROUPS).map(([group, crawlers]) => [
        group,
        countCrawlerDirectives(state.draft, crawlers),
      ])
    ),
    content: {
      sections: sectionCount,
      entries: entryCount,
      whenToUse: state.draft.content.whenToUse.length,
      llmsFullEnabled: state.draft.content.llmsFullEnabled,
      markdownMirrorsEnabled: state.draft.content.markdownMirrors.enabled,
    },
    agentCardEnabled: state.draft.agentCard.enabled,
    contradictions: {
      error: contradictions.filter(({ severity }) => severity === 'error').length,
      warning: contradictions.filter(({ severity }) => severity === 'warning').length,
    },
    validations: {
      error: compiled.validations.filter(({ severity }) => severity === 'error').length,
      warning: compiled.validations.filter(({ severity }) => severity === 'warning').length,
    },
    artifacts: Object.keys(artifactByteSizes(compiled)),
    recentActivity: state.log.slice(-3).map(({ seq, source, actionType, summary: text }) => ({
      seq,
      source,
      actionType,
      summary: compactText(text, 100),
    })),
  };
  const serialized = JSON.stringify(summary);

  if (serialized.length <= TOOL_RESULT_LIMIT) {
    return boundedResult(serialized);
  }

  return boundedResult(JSON.stringify({
    ...summary,
    identity: {
      site: compactText(state.draft.identity.site, 60),
      name: compactText(state.draft.identity.name, 40),
      descriptionChars: state.draft.identity.description.length,
      organization: Boolean(state.draft.identity.organization),
    },
    recentActivity: state.log.slice(-3).map(({ seq, actionType }) => ({ seq, actionType })),
  }));
}

function countCrawlerDirectives(
  draft: StudioDraft,
  crawlers: readonly string[]
): { allow: number; disallow: number; unset: number } {
  let allow = 0;
  let disallow = 0;

  for (const crawler of crawlers) {
    const directive = draft.access.crawlers[crawler];
    if (directive === 'allow') allow += 1;
    if (directive === 'disallow') disallow += 1;
  }

  return { allow, disallow, unset: crawlers.length - allow - disallow };
}

function compileResult(
  compiled: CompiledSurface,
  contradictions: Contradiction[]
): ToolResult {
  const sorted = [...contradictions].sort((left, right) => {
    const severityOrder = severityRank(left.severity) - severityRank(right.severity);
    return severityOrder || left.code.localeCompare(right.code);
  });
  const artifacts = artifactByteSizes(compiled);

  const build = (limit: number, includeTitles: boolean) => JSON.stringify({
    artifacts,
    validationCount: compiled.validations.length,
    contradictions: sorted.slice(0, limit).map((finding) => ({
      code: finding.code,
      severity: finding.severity,
      ...(includeTitles ? { title: finding.title } : {}),
      detail: compactOneLine(finding.detail, 80),
    })),
    moreInUi: sorted.length > limit,
  });

  const candidates = [build(10, true), build(10, false), build(5, false)];
  return boundedResult(
    candidates.find((candidate) => candidate.length <= TOOL_RESULT_LIMIT)
      ?? JSON.stringify({
        artifacts: {},
        validationCount: compiled.validations.length,
        contradictions: [],
        moreInUi: sorted.length > 0,
      })
  );
}

function inspectResult(outcome: InspectSiteOutcome): ToolResult {
  return boundedResult(JSON.stringify({
    findings: (outcome.findings ?? []).slice(0, 10).map(({ level, title }) => ({
      level: compactOneLine(level, 16),
      title: compactOneLine(title, 64),
    })),
    imported: Boolean(outcome.draftPatch),
  }));
}

function artifactByteSizes(compiled: CompiledSurface): Record<string, number> {
  const artifacts: Record<string, number> = {
    'llms.txt': byteSize(compiled.llmsTxt),
    'robots.txt': byteSize(compiled.robotsTxt),
    _headers: byteSize(compiled.headersFile),
    'json-ld': byteSize(compiled.jsonLd.join('\n')),
    'agentmarkup.config.mjs': byteSize(compiled.configMjs),
  };

  if (compiled.llmsFullTxt !== null) {
    artifacts['llms-full.txt'] = byteSize(compiled.llmsFullTxt);
  }
  if (compiled.agentCardJson !== null) {
    artifacts['.well-known/agent-card.json'] = byteSize(compiled.agentCardJson);
  }

  return artifacts;
}

function exportResult(config: string): ToolResult {
  const guidance =
    '// Next steps: place agentmarkup.config.mjs at the site repo root, add the one-line adapter for your framework (Vite, Astro, Next, or Nuxt when it owns final output; CLI otherwise), then build and deploy as usual.';
  const fullResult = `${config.trimEnd()}\n${guidance}\n`;

  if (fullResult.length <= TOOL_RESULT_LIMIT) {
    return boundedResult(fullResult);
  }

  return boundedResult(JSON.stringify({
    tooLarge: true,
    bytes: byteSize(config),
    hint: 'use the on-page download control',
  }));
}

function getAgentCardProblems(
  draft: StudioDraft,
  compile: StudioToolDeps['compile']
): string[] {
  if (!draft.agentCard.enabled) {
    return [];
  }

  const problems: string[] = [];
  if (!draft.identity.name.trim()) problems.push('site identity name');
  if (!(draft.agentCard.description ?? draft.identity.description).trim()) {
    problems.push('description');
  }
  if (!draft.agentCard.version?.trim()) problems.push('version');
  if (!draft.agentCard.supportedInterfaces?.length) {
    problems.push('supportedInterfaces');
  }

  const compiled = compile(draft);
  for (const validation of compiled.validations) {
    if (
      validation.severity === 'error' &&
      (/agent card/i.test(validation.message) || validation.path?.includes('agent-card'))
    ) {
      problems.push(validation.message);
    }
  }

  return [...new Set(problems)];
}

function validateIdentityArgs(value: unknown): Validation<Partial<StudioIdentity>> {
  const record = validateRecord(value, 'arguments', ['site', 'name', 'description', 'organization']);
  if (!record.ok) return record;
  if (Object.keys(record.value).length === 0) return invalid('provide at least one identity field');

  let reason = optionalString(record.value, 'site', LIMITS.url);
  if (!reason && record.value.site !== undefined) reason = absoluteUrl(record.value.site, 'site', ['http:', 'https:']);
  reason ||= optionalString(record.value, 'name', LIMITS.shortText);
  reason ||= optionalString(record.value, 'description', LIMITS.longText);
  if (reason) return invalid(reason);

  if (record.value.organization !== undefined) {
    reason = validateOrganization(record.value.organization);
    if (reason) return invalid(reason);
  }

  return valid(record.value as Partial<StudioIdentity>);
}

function validateOrganization(value: unknown): string | null {
  const record = validateRecord(value, 'organization', [
    'name', 'url', 'logo', 'description', 'sameAs', 'contactPoint', 'address',
  ]);
  if (!record.ok) return record.reason;

  let reason = requiredString(record.value, 'name', LIMITS.shortText, 'organization.name');
  reason ||= requiredString(record.value, 'url', LIMITS.url, 'organization.url');
  if (!reason) reason = absoluteUrl(record.value.url, 'organization.url', ['http:', 'https:']);
  reason ||= optionalString(record.value, 'logo', LIMITS.url, 'organization.logo');
  if (!reason && record.value.logo !== undefined) {
    reason = absoluteUrl(record.value.logo, 'organization.logo', ['http:', 'https:']);
  }
  reason ||= optionalString(record.value, 'description', LIMITS.longText, 'organization.description');
  if (reason) return reason;

  if (record.value.sameAs !== undefined) {
    reason = stringArray(record.value.sameAs, 'organization.sameAs', LIMITS.sameAsMax, LIMITS.url);
    if (reason) return reason;
    for (const [index, url] of (record.value.sameAs as string[]).entries()) {
      reason = absoluteUrl(url, `organization.sameAs[${index}]`, ['http:', 'https:']);
      if (reason) return reason;
    }
  }

  if (record.value.contactPoint !== undefined) {
    if (!Array.isArray(record.value.contactPoint)) return 'organization.contactPoint must be an array';
    if (record.value.contactPoint.length > LIMITS.contactPointsMax) {
      return `organization.contactPoint must contain at most ${LIMITS.contactPointsMax} items`;
    }
    for (const [index, point] of record.value.contactPoint.entries()) {
      reason = validateContactPoint(point, index);
      if (reason) return reason;
    }
  }

  if (record.value.address !== undefined) {
    reason = validateAddress(record.value.address);
    if (reason) return reason;
  }

  return null;
}

function validateContactPoint(value: unknown, index: number): string | null {
  const label = `organization.contactPoint[${index}]`;
  const record = validateRecord(value, label, [
    'contactType', 'email', 'telephone', 'url', 'areaServed', 'availableLanguage',
  ]);
  if (!record.ok) return record.reason;

  let reason = requiredString(record.value, 'contactType', LIMITS.shortText, `${label}.contactType`);
  reason ||= optionalString(record.value, 'email', LIMITS.shortText, `${label}.email`);
  reason ||= optionalString(record.value, 'telephone', LIMITS.shortText, `${label}.telephone`);
  reason ||= optionalString(record.value, 'url', LIMITS.url, `${label}.url`);
  if (!reason && record.value.url !== undefined) {
    reason = absoluteUrl(record.value.url, `${label}.url`, ['http:', 'https:']);
  }
  if (reason) return reason;

  for (const key of ['areaServed', 'availableLanguage'] as const) {
    const field = record.value[key];
    if (field === undefined) continue;
    if (typeof field === 'string') {
      if (field.length > LIMITS.shortText) return `${label}.${key} exceeds ${LIMITS.shortText} characters`;
      continue;
    }
    reason = stringArray(field, `${label}.${key}`, LIMITS.sameAsMax, LIMITS.shortText);
    if (reason) return reason;
  }

  return null;
}

function validateAddress(value: unknown): string | null {
  const record = validateRecord(value, 'organization.address', [
    'streetAddress', 'addressLocality', 'addressRegion', 'postalCode', 'addressCountry',
  ]);
  if (!record.ok) return record.reason;

  let reason = requiredString(record.value, 'addressCountry', LIMITS.shortText, 'organization.address.addressCountry');
  for (const key of ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode'] as const) {
    reason ||= optionalString(record.value, key, LIMITS.shortText, `organization.address.${key}`);
  }
  return reason;
}

function validateAccessArgs(value: unknown): Validation<AccessPolicyPayload> {
  const record = validateRecord(value, 'arguments', ['groups', 'crawlers', 'contentSignal']);
  if (!record.ok) return record;
  if (Object.keys(record.value).length === 0) return invalid('provide at least one access policy field');

  let appliedValues = 0;
  if (record.value.groups !== undefined) {
    const groups = validateRecord(record.value.groups, 'groups', ['train', 'search', 'agent']);
    if (!groups.ok) return groups;
    for (const [key, directive] of Object.entries(groups.value)) {
      if (!isCrawlerDirective(directive)) return invalid(`groups.${key} must be allow or disallow`);
      appliedValues += 1;
    }
  }

  if (record.value.crawlers !== undefined) {
    if (!isRecord(record.value.crawlers)) return invalid('crawlers must be an object');
    const entries = Object.entries(record.value.crawlers);
    if (entries.length > LIMITS.crawlersMax) return invalid(`crawlers must contain at most ${LIMITS.crawlersMax} entries`);
    for (const [crawler, directive] of entries) {
      if (
        !crawler ||
        crawler.length > LIMITS.crawlerNameMax ||
        isUnsafeKey(crawler) ||
        hasAsciiControlCharacter(crawler)
      ) {
        return invalid(`crawler names must be 1 to ${LIMITS.crawlerNameMax} safe characters`);
      }
      if (directive !== null && !isCrawlerDirective(directive)) {
        return invalid(`crawlers.${crawler} must be allow, disallow, or null`);
      }
      appliedValues += 1;
    }
  }

  if (record.value.contentSignal !== undefined) {
    const signal = validateRecord(record.value.contentSignal, 'contentSignal', ['aiTrain', 'search', 'aiInput']);
    if (!signal.ok) return signal;
    for (const [key, directive] of Object.entries(signal.value)) {
      if (!isContentSignalDirective(directive)) return invalid(`contentSignal.${key} must be yes or no`);
      appliedValues += 1;
    }
  }

  if (appliedValues === 0) return invalid('provide at least one crawler or Content-Signal directive');
  return valid(record.value as AccessPolicyPayload);
}

function validateContentArgs(value: unknown): Validation<Partial<StudioContent>> {
  const record = validateRecord(value, 'arguments', [
    'llmsSections', 'whenToUse', 'llmsFullEnabled', 'markdownMirrors',
  ]);
  if (!record.ok) return record;
  if (Object.keys(record.value).length === 0) return invalid('provide at least one content field');

  if (record.value.llmsSections !== undefined) {
    if (!Array.isArray(record.value.llmsSections)) return invalid('llmsSections must be an array');
    if (record.value.llmsSections.length > LIMITS.sectionsMax) {
      return invalid(`llmsSections must contain at most ${LIMITS.sectionsMax} sections`);
    }
    for (const [sectionIndex, section] of record.value.llmsSections.entries()) {
      const sectionRecord = validateRecord(section, `llmsSections[${sectionIndex}]`, ['title', 'entries']);
      if (!sectionRecord.ok) return sectionRecord;
      let reason = requiredString(sectionRecord.value, 'title', LIMITS.shortText, `llmsSections[${sectionIndex}].title`);
      if (reason) return invalid(reason);
      if (!Array.isArray(sectionRecord.value.entries)) return invalid(`llmsSections[${sectionIndex}].entries must be an array`);
      if (sectionRecord.value.entries.length > LIMITS.entriesPerSectionMax) {
        return invalid(`llmsSections[${sectionIndex}].entries must contain at most ${LIMITS.entriesPerSectionMax} entries`);
      }
      for (const [entryIndex, entry] of sectionRecord.value.entries.entries()) {
        const label = `llmsSections[${sectionIndex}].entries[${entryIndex}]`;
        const entryRecord = validateRecord(entry, label, ['title', 'url', 'description']);
        if (!entryRecord.ok) return entryRecord;
        reason = requiredString(entryRecord.value, 'title', LIMITS.shortText, `${label}.title`);
        reason ||= requiredString(entryRecord.value, 'url', LIMITS.url, `${label}.url`);
        reason ||= optionalString(entryRecord.value, 'description', LIMITS.longText, `${label}.description`);
        if (reason) return invalid(reason);
      }
    }
  }

  if (record.value.whenToUse !== undefined) {
    const reason = stringArray(
      record.value.whenToUse,
      'whenToUse',
      LIMITS.whenToUseMax,
      LIMITS.whenToUseEntry
    );
    if (reason) return invalid(reason);
  }

  if (
    record.value.llmsFullEnabled !== undefined &&
    typeof record.value.llmsFullEnabled !== 'boolean'
  ) {
    return invalid('llmsFullEnabled must be a boolean');
  }

  if (record.value.markdownMirrors !== undefined) {
    const mirrors = validateRecord(record.value.markdownMirrors, 'markdownMirrors', ['enabled', 'exclude']);
    if (!mirrors.ok) return mirrors;
    if (typeof mirrors.value.enabled !== 'boolean') return invalid('markdownMirrors.enabled must be a boolean');
    const reason = stringArray(mirrors.value.exclude, 'markdownMirrors.exclude', LIMITS.excludeMax, LIMITS.url);
    if (reason) return invalid(reason);
  }

  return valid(record.value as Partial<StudioContent>);
}

function validateAgentCardArgs(value: unknown): Validation<Partial<StudioAgentCardDraft>> {
  const record = validateRecord(value, 'arguments', [
    'enabled', 'version', 'description', 'supportedInterfaces', 'skills',
    'providerOrganization', 'providerUrl',
  ]);
  if (!record.ok) return record;
  if (Object.keys(record.value).length === 0) return invalid('provide at least one Agent Card field');

  if (record.value.enabled !== undefined && typeof record.value.enabled !== 'boolean') {
    return invalid('enabled must be a boolean');
  }
  let reason = optionalString(record.value, 'version', LIMITS.shortText);
  reason ||= optionalString(record.value, 'description', LIMITS.longText);
  reason ||= optionalString(record.value, 'providerOrganization', LIMITS.shortText);
  reason ||= optionalString(record.value, 'providerUrl', LIMITS.url);
  if (!reason && record.value.providerUrl !== undefined) {
    reason = absoluteUrl(record.value.providerUrl, 'providerUrl', ['http:', 'https:']);
  }
  if (reason) return invalid(reason);

  if (record.value.supportedInterfaces !== undefined) {
    if (!Array.isArray(record.value.supportedInterfaces)) return invalid('supportedInterfaces must be an array');
    if (record.value.supportedInterfaces.length > LIMITS.interfacesMax) {
      return invalid(`supportedInterfaces must contain at most ${LIMITS.interfacesMax} items`);
    }
    for (const [index, item] of record.value.supportedInterfaces.entries()) {
      reason = validateInterface(item, index);
      if (reason) return invalid(reason);
    }
  }

  if (record.value.skills !== undefined) {
    if (!Array.isArray(record.value.skills)) return invalid('skills must be an array');
    if (record.value.skills.length > LIMITS.skillsMax) {
      return invalid(`skills must contain at most ${LIMITS.skillsMax} items`);
    }
    for (const [index, skill] of record.value.skills.entries()) {
      reason = validateSkill(skill, index);
      if (reason) return invalid(reason);
    }
  }

  return valid(record.value as Partial<StudioAgentCardDraft>);
}

function validateInterface(value: unknown, index: number): string | null {
  const label = `supportedInterfaces[${index}]`;
  const record = validateRecord(value, label, ['url', 'protocolBinding', 'protocolVersion', 'tenant']);
  if (!record.ok) return record.reason;

  let reason = requiredString(record.value, 'url', LIMITS.url, `${label}.url`);
  if (!reason) reason = absoluteUrl(record.value.url, `${label}.url`, ['http:', 'https:', 'ws:', 'wss:']);
  reason ||= requiredString(record.value, 'protocolBinding', LIMITS.shortText, `${label}.protocolBinding`);
  reason ||= requiredString(record.value, 'protocolVersion', LIMITS.shortText, `${label}.protocolVersion`);
  reason ||= optionalString(record.value, 'tenant', LIMITS.shortText, `${label}.tenant`);
  return reason;
}

function validateSkill(value: unknown, index: number): string | null {
  const label = `skills[${index}]`;
  const record = validateRecord(value, label, [
    'id', 'name', 'description', 'tags', 'examples', 'inputModes', 'outputModes', 'security',
  ]);
  if (!record.ok) return record.reason;

  let reason = requiredString(record.value, 'id', LIMITS.shortText, `${label}.id`);
  reason ||= requiredString(record.value, 'name', LIMITS.shortText, `${label}.name`);
  reason ||= requiredString(record.value, 'description', LIMITS.longText, `${label}.description`);
  reason ||= stringArray(record.value.tags, `${label}.tags`, LIMITS.skillTagsMax, LIMITS.shortText);
  if (reason) return reason;

  for (const [key, maxItems, maxLength] of [
    ['examples', LIMITS.skillExamplesMax, LIMITS.longText],
    ['inputModes', LIMITS.modesMax, LIMITS.shortText],
    ['outputModes', LIMITS.modesMax, LIMITS.shortText],
  ] as const) {
    if (record.value[key] === undefined) continue;
    reason = stringArray(record.value[key], `${label}.${key}`, maxItems, maxLength);
    if (reason) return reason;
  }

  if (record.value.security !== undefined) {
    if (!Array.isArray(record.value.security)) return `${label}.security must be an array`;
    if (record.value.security.length > LIMITS.modesMax) {
      return `${label}.security must contain at most ${LIMITS.modesMax} items`;
    }
    for (const [requirementIndex, requirement] of record.value.security.entries()) {
      if (!isRecord(requirement)) return `${label}.security[${requirementIndex}] must be an object`;
      const entries = Object.entries(requirement);
      if (entries.length > LIMITS.skillTagsMax) {
        return `${label}.security[${requirementIndex}] has too many schemes`;
      }
      for (const [scheme, scopes] of entries) {
        if (!scheme || scheme.length > LIMITS.shortText || isUnsafeKey(scheme)) {
          return `${label}.security[${requirementIndex}] has an invalid scheme name`;
        }
        reason = stringArray(scopes, `${label}.security[${requirementIndex}].${scheme}`, LIMITS.modesMax, LIMITS.shortText);
        if (reason) return reason;
      }
    }
  }

  return null;
}

function validateInspectArgs(value: unknown): Validation<{ url: string }> {
  const record = validateRecord(value, 'arguments', ['url']);
  if (!record.ok) return record;
  const reason = requiredString(record.value, 'url', LIMITS.url);
  if (reason) return invalid(reason);

  const normalized = normalizeWebsiteInput(record.value.url as string);
  if (normalized.length > LIMITS.url) {
    return invalid(`url exceeds ${LIMITS.url} characters after normalization`);
  }
  const urlReason = absoluteUrl(normalized, 'url', ['http:', 'https:']);
  if (urlReason) return invalid(urlReason);
  return valid({ url: normalized });
}

function validateEmptyArgs(value: unknown): string | null {
  if (!isRecord(value)) return 'arguments must be an object';
  return Object.keys(value).length === 0 ? null : 'this tool does not accept arguments';
}

type AccessPolicyPayload = Extract<
  StudioAction,
  { type: 'SET_ACCESS_POLICY' }
>['payload'];

type Validation<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

function valid<T>(value: T): Validation<T> {
  return { ok: true, value };
}

function invalid(reason: string): Validation<never> {
  return { ok: false, reason };
}

function validateRecord(
  value: unknown,
  label: string,
  allowedKeys: readonly string[]
): Validation<UnknownRecord> {
  if (!isRecord(value)) return invalid(`${label} must be an object`);
  const unknownKey = Object.keys(value).find((key) => !allowedKeys.includes(key));
  if (unknownKey) return invalid(`${label} contains unknown field ${unknownKey}`);
  return valid(value);
}

function requiredString(
  record: UnknownRecord,
  key: string,
  maxLength: number,
  label = key
): string | null {
  const value = record[key];
  if (typeof value !== 'string') return `${label} must be a string`;
  if (!value.trim()) return `${label} must not be empty`;
  return value.length <= maxLength ? null : `${label} exceeds ${maxLength} characters`;
}

function optionalString(
  record: UnknownRecord,
  key: string,
  maxLength: number,
  label = key
): string | null {
  const value = record[key];
  if (value === undefined) return null;
  if (typeof value !== 'string') return `${label} must be a string`;
  return value.length <= maxLength ? null : `${label} exceeds ${maxLength} characters`;
}

function stringArray(
  value: unknown,
  label: string,
  maxItems: number,
  maxLength: number
): string | null {
  if (!Array.isArray(value)) return `${label} must be an array`;
  if (value.length > maxItems) return `${label} must contain at most ${maxItems} items`;
  for (const [index, item] of value.entries()) {
    if (typeof item !== 'string') return `${label}[${index}] must be a string`;
    if (item.length > maxLength) return `${label}[${index}] exceeds ${maxLength} characters`;
  }
  return null;
}

function absoluteUrl(
  value: unknown,
  label: string,
  protocols: readonly string[]
): string | null {
  if (typeof value !== 'string') return `${label} must be a string`;
  try {
    const parsed = new URL(value);
    return protocols.includes(parsed.protocol)
      ? null
      : `${label} must use ${protocols.join(', ')}`;
  } catch {
    return `${label} must be an absolute URL`;
  }
}

function safelyExecute(
  execute: (args: unknown) => Promise<ToolResult>
): (args: unknown) => Promise<ToolResult> {
  return async (args) => {
    try {
      return await execute(args);
    } catch (error) {
      return boundedResult(`Failed: ${JSON.stringify({
        error: 'tool_execution_failed',
        kind: error instanceof Error ? error.constructor.name : 'Unknown',
      })}`);
    }
  };
}

function reducerSummaryResult(deps: StudioToolDeps): ToolResult {
  return boundedResult(latestReducerSummary(deps));
}

function latestReducerSummary(deps: StudioToolDeps): string {
  return deps.getState().log.at(-1)?.summary ?? 'No reducer summary was recorded.';
}

function rejected(reason: string): ToolResult {
  return boundedResult(`Rejected: ${JSON.stringify({
    error: 'invalid_arguments',
    reason,
  })}`);
}

function compactText(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function compactOneLine(value: string, maxLength: number): string {
  return compactText(value.replace(/\s+/g, ' ').trim(), maxLength);
}

function severityRank(severity: Contradiction['severity']): number {
  return severity === 'error' ? 0 : 1;
}

function byteSize(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function isCrawlerDirective(value: unknown): value is 'allow' | 'disallow' {
  return value === 'allow' || value === 'disallow';
}

function isContentSignalDirective(value: unknown): value is 'yes' | 'no' {
  return value === 'yes' || value === 'no';
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnsafeKey(value: string): boolean {
  return value === '__proto__' || value === 'prototype' || value === 'constructor';
}

function hasAsciiControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function isModelContextLike(value: unknown): value is ModelContextLike {
  return isRecord(value) && typeof value.registerTool === 'function';
}

function stringSchema(description: string, maxLength: number): JsonSchema {
  assertDescriptionBudget(description);
  return { type: 'string', description, maxLength };
}

function urlSchema(description: string): JsonSchema {
  return { ...stringSchema(description, LIMITS.url), format: 'uri' };
}

function stringOrArraySchema(description: string): JsonSchema {
  assertDescriptionBudget(description);
  return {
    description,
    oneOf: [
      { type: 'string', maxLength: LIMITS.shortText },
      {
        type: 'array',
        maxItems: LIMITS.sameAsMax,
        items: { type: 'string', maxLength: LIMITS.shortText },
      },
    ],
  };
}

function boundedStringArray(
  description: string,
  maxItems: number,
  maxLength: number
): JsonSchema {
  assertDescriptionBudget(description);
  return {
    type: 'array',
    description,
    maxItems,
    items: { type: 'string', description: STRING_ARRAY_DESCRIPTION, maxLength },
  };
}

function crawlerDirectiveSchema(description: string): JsonSchema {
  assertDescriptionBudget(description);
  return { type: 'string', description, enum: ['allow', 'disallow'] };
}

function contentSignalSchema(description: string): JsonSchema {
  assertDescriptionBudget(description);
  return { type: 'string', description, enum: ['yes', 'no'] };
}

function assertDescriptionBudget(description: string): void {
  if (description.length > PARAM_DESCRIPTION_LIMIT) {
    throw new Error(`Tool parameter description exceeds ${PARAM_DESCRIPTION_LIMIT} characters.`);
  }
}

for (const tool of STUDIO_TOOLS) {
  if (tool.name.length > TOOL_NAME_LIMIT) {
    throw new Error(`Tool name exceeds ${TOOL_NAME_LIMIT} characters: ${tool.name}`);
  }
  if (tool.description.length > TOOL_DESCRIPTION_LIMIT) {
    throw new Error(`Tool description exceeds ${TOOL_DESCRIPTION_LIMIT} characters: ${tool.name}`);
  }
}
