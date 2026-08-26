/**
 * Shared contract for the AgentMarkup Studio.
 *
 * This file is the single source of truth for the Studio's draft state,
 * reducer actions, compiled artifacts, and contradiction findings. The
 * model, compiler, and contradiction modules all build against these types;
 * change them here first.
 */

import type {
  AiCrawlersConfig,
  AgentCardInterface,
  AgentCardSkill,
  ContentSignalDirective,
  CrawlerDirective,
  LlmsTxtSection,
  OrganizationContactPoint,
  OrganizationPostalAddress,
  ValidationResult,
} from '@agentmarkup/core';

/** Who caused a state change. Every entry in the activity log carries one. */
export type ActionSource = 'agent' | 'human';

export interface StudioOrganization {
  name: string;
  url: string;
  logo?: string;
  description?: string;
  sameAs?: string[];
  contactPoint?: OrganizationContactPoint[];
  address?: OrganizationPostalAddress;
}

export interface StudioIdentity {
  /** Absolute http(s) site root, e.g. "https://example.com". */
  site: string;
  name: string;
  description: string;
  organization?: StudioOrganization;
}

export interface StudioContentSignal {
  aiTrain: ContentSignalDirective;
  search: ContentSignalDirective;
  aiInput: ContentSignalDirective;
}

export interface StudioAccessPolicy {
  /** Per-crawler directives; keys are crawler user-agent names. */
  crawlers: AiCrawlersConfig;
  contentSignal: StudioContentSignal;
}

export interface StudioContent {
  llmsSections: LlmsTxtSection[];
  whenToUse: string[];
  llmsFullEnabled: boolean;
  markdownMirrors: {
    enabled: boolean;
    exclude: string[];
  };
}

export interface StudioAgentCardDraft {
  enabled: boolean;
  version?: string;
  description?: string;
  supportedInterfaces?: AgentCardInterface[];
  skills?: AgentCardSkill[];
  providerOrganization?: string;
  providerUrl?: string;
}

export interface StudioDraft {
  identity: StudioIdentity;
  access: StudioAccessPolicy;
  content: StudioContent;
  agentCard: StudioAgentCardDraft;
}

/** Crawler intent groups, mirroring the grouping documented on AiCrawlersConfig in core. */
export const CRAWLER_GROUPS = {
  train: [
    'GPTBot',
    'ClaudeBot',
    'Google-Extended',
    'CCBot',
    'Applebot-Extended',
    'Amazonbot',
    'meta-externalagent',
    'Bytespider',
  ],
  search: ['OAI-SearchBot', 'PerplexityBot', 'Claude-SearchBot', 'DuckAssistBot'],
  agent: [
    'ChatGPT-User',
    'Claude-User',
    'Perplexity-User',
    'Meta-ExternalFetcher',
    'MistralAI-User',
  ],
} as const satisfies Record<string, readonly string[]>;

export type CrawlerGroupName = keyof typeof CRAWLER_GROUPS;

/**
 * Input caps shared by runtime validation (tool layer) and the reducer.
 * Rejections at these boundaries are structured errors, never throws.
 */
export const LIMITS = {
  shortText: 300,
  longText: 1000,
  url: 2000,
  whenToUseEntry: 200,
  whenToUseMax: 10,
  sectionsMax: 20,
  entriesPerSectionMax: 50,
  excludeMax: 50,
  sameAsMax: 10,
  skillsMax: 10,
  interfacesMax: 5,
  contactPointsMax: 5,
  skillTagsMax: 10,
  skillExamplesMax: 5,
  modesMax: 5,
  crawlersMax: 40,
  crawlerNameMax: 60,
  undoDepth: 20,
  activityLogMax: 200,
} as const;

export type StudioAction =
  | { type: 'SET_IDENTITY'; source: ActionSource; payload: Partial<StudioIdentity> }
  | {
      type: 'SET_ACCESS_POLICY';
      source: ActionSource;
      payload: {
        /** Directive applied to every crawler in the named group. */
        groups?: Partial<Record<CrawlerGroupName, CrawlerDirective>>;
        /** Per-crawler overrides; a null value removes the directive. */
        crawlers?: Record<string, CrawlerDirective | null>;
        contentSignal?: Partial<StudioContentSignal>;
      };
    }
  | { type: 'CURATE_PAGES'; source: ActionSource; payload: Partial<StudioContent> }
  | { type: 'SET_AGENT_CARD'; source: ActionSource; payload: Partial<StudioAgentCardDraft> }
  | { type: 'IMPORT_FROM_CHECK'; source: ActionSource; payload: Partial<StudioDraft>; sourceUrl: string }
  | { type: 'UNDO'; source: ActionSource }
  | { type: 'RESET'; source: ActionSource };

export type StudioActionType = StudioAction['type'];

export interface ActivityEntry {
  /** Monotonic sequence number within the session. */
  seq: number;
  source: ActionSource;
  actionType: StudioActionType;
  /** One human-readable sentence describing the change. */
  summary: string;
}

export interface StudioState {
  draft: StudioDraft;
  /**
   * Append-only within the session; capped at LIMITS.activityLogMax by
   * dropping the oldest entries. UNDO and RESET append entries and never
   * erase history. Lives outside the undo snapshots.
   */
  log: ActivityEntry[];
  /** Previous drafts, newest last; capped at LIMITS.undoDepth. */
  history: StudioDraft[];
  /** Next activity sequence number. */
  seq: number;
}

export type ContradictionCode =
  | 'C1' // retrieval-blocked-but-cited
  | 'C2' // content-signal-vs-llms
  | 'C3' // mirror-excluded-but-listed
  | 'C4' // identity-drift
  | 'C5' // card-without-interface
  | 'C6' // train-allowed-signal-denied
  | 'C7' // mirrors-without-pages
  | 'C8'; // whenToUse-empty-surface

export interface Contradiction {
  code: ContradictionCode;
  severity: 'error' | 'warning';
  title: string;
  detail: string;
  /** Which surfaces disagree, e.g. ["llms.txt", "robots.txt"]. */
  loci: string[];
}

export type AdapterName = 'vite' | 'astro' | 'next' | 'nuxt' | 'cli';

/**
 * Result of the inspect_site intake (same-origin /api/check). Carries only
 * structured findings, never raw page text; the WebMCP tool layer consumes
 * this via dependency injection.
 */
export interface InspectSiteOutcome {
  ok: boolean;
  /** Bounded human-readable summary for the agent-facing tool result. */
  summaryText: string;
  /** Structured findings (bounded list); levels mirror the checker's AuditLevel. */
  findings?: Array<{ level: string; title: string }>;
  /** Draft slices derived from the check, for IMPORT_FROM_CHECK. Absent on failure. */
  draftPatch?: Partial<StudioDraft>;
  /** The checked site root the patch was derived from. */
  sourceUrl?: string;
  /** Set when the checker requires a human step (Turnstile) or rate limit cooldown. */
  humanActionNeeded?: 'turnstile' | 'rate-limited';
  /** Structured error code when ok is false (e.g. 'invalid_url', 'fetch_failed'). */
  errorCode?: string;
}

export interface CompiledSurface {
  llmsTxt: string;
  /** Skeleton form; real inlined content is produced at build time. Null when disabled. */
  llmsFullTxt: string | null;
  robotsTxt: string;
  /** The marker-managed `_headers` block (Content-Signal + related). */
  headersFile: string;
  /** One serialized JSON-LD object per schema (script contents, not tags). */
  jsonLd: string[];
  /** Serialized agent-card.json, null when the card is disabled. */
  agentCardJson: string | null;
  /** Ready-to-install agentmarkup.config.mjs text. */
  configMjs: string;
  validations: ValidationResult[];
}
