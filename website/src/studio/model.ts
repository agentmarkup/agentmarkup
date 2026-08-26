import { CRAWLER_GROUPS, LIMITS } from './types';
import type {
  ActionSource,
  ActivityEntry,
  StudioAccessPolicy,
  StudioAction,
  StudioActionType,
  StudioAgentCardDraft,
  StudioContent,
  StudioDraft,
  StudioIdentity,
  StudioState,
} from './types';

type StudioOrganization = NonNullable<StudioIdentity['organization']>;
type StudioContactPoint = NonNullable<StudioOrganization['contactPoint']>[number];
type StudioAddress = NonNullable<StudioOrganization['address']>;
type StudioInterface = NonNullable<StudioAgentCardDraft['supportedInterfaces']>[number];
type StudioSkill = NonNullable<StudioAgentCardDraft['skills']>[number];

export const initialStudioDraft: StudioDraft = {
  identity: {
    site: '',
    name: '',
    description: '',
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

export function createInitialState(): StudioState {
  return {
    draft: initialStudioDraft,
    log: [],
    history: [],
    seq: 1,
  };
}

export function studioReducer(
  state: StudioState,
  action: StudioAction
): StudioState {
  if (!isRecord(action) || typeof action.type !== 'string') {
    return state;
  }

  switch (action.type) {
    case 'SET_IDENTITY': {
      const patch = sanitizeIdentityPatch(action.payload);
      const draft = {
        ...state.draft,
        identity: { ...state.draft.identity, ...patch },
      };

      return recordAction(
        state,
        action.type,
        action.source,
        draft,
        summarizeFields(action.source, 'set site identity', Object.keys(patch))
      );
    }

    case 'SET_ACCESS_POLICY': {
      const result = applyAccessPatch(state.draft.access, action.payload);
      const draft = {
        ...state.draft,
        access: result.value,
      };
      const droppedSummary = result.droppedCrawlers > 0
        ? ` (${result.droppedCrawlers} crawler(s) dropped at the cap)`
        : '';

      return recordAction(
        state,
        action.type,
        action.source,
        draft,
        `${summarizeFields(action.source, 'set access policy', result.appliedKeys)}${droppedSummary}`
      );
    }

    case 'CURATE_PAGES': {
      const patch = sanitizeContentPatch(action.payload);
      const draft = {
        ...state.draft,
        content: { ...state.draft.content, ...patch },
      };

      return recordAction(
        state,
        action.type,
        action.source,
        draft,
        summarizeFields(action.source, 'curated pages', Object.keys(patch))
      );
    }

    case 'SET_AGENT_CARD': {
      const patch = sanitizeAgentCardPatch(action.payload);
      const draft = {
        ...state.draft,
        agentCard: { ...state.draft.agentCard, ...patch },
      };

      return recordAction(
        state,
        action.type,
        action.source,
        draft,
        summarizeFields(action.source, 'configured the agent card', Object.keys(patch))
      );
    }

    case 'IMPORT_FROM_CHECK': {
      const result = applyImport(state.draft, action.payload);
      const sourceUrl =
        typeof action.sourceUrl === 'string'
          ? truncate(action.sourceUrl, LIMITS.url)
          : 'an unknown source';
      const fields = result.appliedKeys.length > 0
        ? ` (${result.appliedKeys.join(', ')})`
        : '';
      const droppedSummary = result.droppedCrawlers > 0
        ? ` (${result.droppedCrawlers} crawler(s) dropped at the cap)`
        : '';
      const summary = `${sourceLabel(action.source)} imported settings from ${sourceUrl}${fields}.${droppedSummary}`;

      return recordAction(
        state,
        action.type,
        action.source,
        result.value,
        summary
      );
    }

    case 'UNDO': {
      const previousDraft = state.history.at(-1);
      const summary = previousDraft
        ? `${sourceLabel(action.source)} undid the last change.`
        : `${sourceLabel(action.source)} had nothing to undo.`;

      return recordUndo(state, action.source, previousDraft ?? state.draft, summary);
    }

    case 'RESET':
      return recordAction(
        state,
        action.type,
        action.source,
        initialStudioDraft,
        `${sourceLabel(action.source)} reset the studio draft.`
      );

    default:
      // Runtime callers can cast arbitrary actions from JavaScript. Unknown types are true no-ops.
      return state;
  }
}

function recordAction(
  state: StudioState,
  actionType: StudioActionType,
  source: ActionSource,
  draft: StudioDraft,
  summary: string
): StudioState {
  const draftChanged = !isDeepEqual(state.draft, draft);

  return {
    draft: draftChanged ? draft : state.draft,
    history: draftChanged
      ? appendCapped(state.history, state.draft, LIMITS.undoDepth)
      : state.history,
    log: appendActivity(state, actionType, source, summary),
    seq: state.seq + 1,
  };
}

function recordUndo(
  state: StudioState,
  source: ActionSource,
  draft: StudioDraft,
  summary: string
): StudioState {
  return {
    draft,
    history: state.history.slice(0, -1),
    log: appendActivity(state, 'UNDO', source, summary),
    seq: state.seq + 1,
  };
}

function appendActivity(
  state: StudioState,
  actionType: StudioActionType,
  source: ActionSource,
  summary: string
): ActivityEntry[] {
  return appendCapped(
    state.log,
    { seq: state.seq, source, actionType, summary },
    LIMITS.activityLogMax
  );
}

function appendCapped<T>(items: T[], item: T, max: number): T[] {
  return [...items, item].slice(-max);
}

function isDeepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((item, index) => isDeepEqual(item, right[index]));
  }

  if (!isRecord(left) || !isRecord(right)) {
    return false;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) =>
      Object.hasOwn(right, key) && isDeepEqual(left[key], right[key])
    );
}

function applyImport(
  draft: StudioDraft,
  value: unknown
): { value: StudioDraft; appliedKeys: string[]; droppedCrawlers: number } {
  if (!isRecord(value)) {
    return { value: draft, appliedKeys: [], droppedCrawlers: 0 };
  }

  let next = draft;
  const appliedKeys: string[] = [];
  let droppedCrawlers = 0;

  if (isRecord(value.identity)) {
    const patch = sanitizeIdentityPatch(value.identity);
    if (Object.keys(patch).length > 0) {
      next = { ...next, identity: { ...next.identity, ...patch } };
      appliedKeys.push('identity');
    }
  }

  if (isRecord(value.access)) {
    const result = applyAccessPatch(next.access, value.access);
    droppedCrawlers = result.droppedCrawlers;
    if (result.appliedKeys.length > 0) {
      next = { ...next, access: result.value };
      appliedKeys.push('access');
    }
  }

  if (isRecord(value.content)) {
    const patch = sanitizeContentPatch(value.content);
    if (Object.keys(patch).length > 0) {
      next = { ...next, content: { ...next.content, ...patch } };
      appliedKeys.push('content');
    }
  }

  if (isRecord(value.agentCard)) {
    const patch = sanitizeAgentCardPatch(value.agentCard);
    if (Object.keys(patch).length > 0) {
      next = { ...next, agentCard: { ...next.agentCard, ...patch } };
      appliedKeys.push('agentCard');
    }
  }

  return { value: next, appliedKeys, droppedCrawlers };
}

function applyAccessPatch(
  current: StudioAccessPolicy,
  value: unknown
): { value: StudioAccessPolicy; appliedKeys: string[]; droppedCrawlers: number } {
  if (!isRecord(value)) {
    return { value: current, appliedKeys: [], droppedCrawlers: 0 };
  }

  const crawlers = { ...current.crawlers };
  const appliedKeys: string[] = [];
  let groupsApplied = false;
  let crawlersApplied = false;
  let droppedCrawlers = 0;

  const applyCrawlerDirective = (
    crawler: string,
    directive: 'allow' | 'disallow'
  ): boolean => {
    if (
      !Object.hasOwn(crawlers, crawler) &&
      Object.keys(crawlers).length >= LIMITS.crawlersMax
    ) {
      droppedCrawlers += 1;
      return false;
    }

    crawlers[crawler] = directive;
    return true;
  };

  if (isRecord(value.groups)) {
    for (const groupName of Object.keys(CRAWLER_GROUPS) as Array<keyof typeof CRAWLER_GROUPS>) {
      const directive = value.groups[groupName];
      if (!isCrawlerDirective(directive)) {
        continue;
      }

      for (const crawler of CRAWLER_GROUPS[groupName]) {
        groupsApplied = applyCrawlerDirective(crawler, directive) || groupsApplied;
      }
    }
  }

  if (isRecord(value.crawlers)) {
    for (const [crawler, directive] of Object.entries(value.crawlers)) {
      if (
        isUnsafeObjectKey(crawler) ||
        hasAsciiControlCharacter(crawler) ||
        crawler.length > LIMITS.crawlerNameMax
      ) {
        continue;
      }

      if (directive === null) {
        if (Object.hasOwn(crawlers, crawler)) {
          delete crawlers[crawler];
          crawlersApplied = true;
        }
      } else if (isCrawlerDirective(directive)) {
        crawlersApplied = applyCrawlerDirective(crawler, directive) || crawlersApplied;
      }
    }
  }

  if (groupsApplied) {
    appliedKeys.push('groups');
  }
  if (crawlersApplied) {
    appliedKeys.push('crawlers');
  }

  const contentSignalPatch = sanitizeContentSignalPatch(value.contentSignal);
  if (Object.keys(contentSignalPatch).length > 0) {
    appliedKeys.push('contentSignal');
  }

  if (appliedKeys.length === 0) {
    return { value: current, appliedKeys, droppedCrawlers };
  }

  return {
    value: {
      crawlers: Object.fromEntries(
        Object.entries(crawlers)
          .filter(
            ([crawler]) =>
              !isUnsafeObjectKey(crawler) &&
              !hasAsciiControlCharacter(crawler) &&
              crawler.length <= LIMITS.crawlerNameMax
          )
      ),
      contentSignal: { ...current.contentSignal, ...contentSignalPatch },
    },
    appliedKeys,
    droppedCrawlers,
  };
}

function sanitizeIdentityPatch(value: unknown): Partial<StudioIdentity> {
  if (!isRecord(value)) {
    return {};
  }

  const patch: Partial<StudioIdentity> = {};
  const site = stringField(value, 'site', LIMITS.url);
  const name = stringField(value, 'name', LIMITS.shortText);
  const description = stringField(value, 'description', LIMITS.longText);
  const organization = sanitizeOrganization(value.organization);

  if (site !== undefined) patch.site = site;
  if (name !== undefined) patch.name = name;
  if (description !== undefined) patch.description = description;
  if (organization !== undefined) patch.organization = organization;

  return patch;
}

function sanitizeOrganization(value: unknown): StudioOrganization | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const name = stringField(value, 'name', LIMITS.shortText);
  const url = stringField(value, 'url', LIMITS.url);
  if (name === undefined || url === undefined) {
    return undefined;
  }

  const organization: StudioOrganization = { name, url };
  const logo = stringField(value, 'logo', LIMITS.url);
  const description = stringField(value, 'description', LIMITS.longText);
  const sameAs = sanitizeStringArray(value.sameAs, LIMITS.sameAsMax, LIMITS.url);
  const contactPoint = sanitizeContactPoints(value.contactPoint);
  const address = sanitizeAddress(value.address);

  if (logo !== undefined) organization.logo = logo;
  if (description !== undefined) organization.description = description;
  if (sameAs !== undefined) organization.sameAs = sameAs;
  if (contactPoint !== undefined) organization.contactPoint = contactPoint;
  if (address !== undefined) organization.address = address;

  return organization;
}

function sanitizeContactPoints(value: unknown): StudioContactPoint[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.slice(0, LIMITS.contactPointsMax).flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const contactType = stringField(item, 'contactType', LIMITS.shortText);
    if (contactType === undefined) {
      return [];
    }

    const point: StudioContactPoint = { contactType };
    const email = stringField(item, 'email', LIMITS.shortText);
    const telephone = stringField(item, 'telephone', LIMITS.shortText);
    const url = stringField(item, 'url', LIMITS.url);
    const areaServed = sanitizeStringOrArray(item.areaServed, LIMITS.shortText);
    const availableLanguage = sanitizeStringOrArray(
      item.availableLanguage,
      LIMITS.shortText
    );

    if (email !== undefined) point.email = email;
    if (telephone !== undefined) point.telephone = telephone;
    if (url !== undefined) point.url = url;
    if (areaServed !== undefined) point.areaServed = areaServed;
    if (availableLanguage !== undefined) point.availableLanguage = availableLanguage;

    return [point];
  });
}

function sanitizeAddress(value: unknown): StudioAddress | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const addressCountry = stringField(value, 'addressCountry', LIMITS.shortText);
  if (addressCountry === undefined) {
    return undefined;
  }

  const address: StudioAddress = { addressCountry };
  const streetAddress = stringField(value, 'streetAddress', LIMITS.shortText);
  const addressLocality = stringField(value, 'addressLocality', LIMITS.shortText);
  const addressRegion = stringField(value, 'addressRegion', LIMITS.shortText);
  const postalCode = stringField(value, 'postalCode', LIMITS.shortText);

  if (streetAddress !== undefined) address.streetAddress = streetAddress;
  if (addressLocality !== undefined) address.addressLocality = addressLocality;
  if (addressRegion !== undefined) address.addressRegion = addressRegion;
  if (postalCode !== undefined) address.postalCode = postalCode;

  return address;
}

function sanitizeContentPatch(value: unknown): Partial<StudioContent> {
  if (!isRecord(value)) {
    return {};
  }

  const patch: Partial<StudioContent> = {};
  const sections = sanitizeSections(value.llmsSections);
  const whenToUse = sanitizeStringArray(
    value.whenToUse,
    LIMITS.whenToUseMax,
    LIMITS.whenToUseEntry
  );
  const mirrors = sanitizeMarkdownMirrors(value.markdownMirrors);

  if (sections !== undefined) patch.llmsSections = sections;
  if (whenToUse !== undefined) patch.whenToUse = whenToUse;
  if (typeof value.llmsFullEnabled === 'boolean') {
    patch.llmsFullEnabled = value.llmsFullEnabled;
  }
  if (mirrors !== undefined) patch.markdownMirrors = mirrors;

  return patch;
}

function sanitizeSections(value: unknown): StudioContent['llmsSections'] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.slice(0, LIMITS.sectionsMax).flatMap((section) => {
    if (!isRecord(section) || !Array.isArray(section.entries)) {
      return [];
    }

    const title = stringField(section, 'title', LIMITS.shortText);
    if (title === undefined) {
      return [];
    }

    const entries = section.entries
      .slice(0, LIMITS.entriesPerSectionMax)
      .flatMap((entry) => {
        if (!isRecord(entry)) {
          return [];
        }

        const entryTitle = stringField(entry, 'title', LIMITS.shortText);
        const url = stringField(entry, 'url', LIMITS.url);
        if (entryTitle === undefined || url === undefined) {
          return [];
        }

        const description = stringField(entry, 'description', LIMITS.longText);
        return [{
          title: entryTitle,
          url,
          ...(description === undefined ? {} : { description }),
        }];
      });

    return [{ title, entries }];
  });
}

function sanitizeMarkdownMirrors(
  value: unknown
): StudioContent['markdownMirrors'] | undefined {
  if (!isRecord(value) || typeof value.enabled !== 'boolean') {
    return undefined;
  }

  const exclude = sanitizeStringArray(value.exclude, LIMITS.excludeMax, LIMITS.url);
  if (exclude === undefined) {
    return undefined;
  }

  return { enabled: value.enabled, exclude };
}

function sanitizeAgentCardPatch(value: unknown): Partial<StudioAgentCardDraft> {
  if (!isRecord(value)) {
    return {};
  }

  const patch: Partial<StudioAgentCardDraft> = {};
  const version = stringField(value, 'version', LIMITS.shortText);
  const description = stringField(value, 'description', LIMITS.longText);
  const interfaces = sanitizeInterfaces(value.supportedInterfaces);
  const skills = sanitizeSkills(value.skills);
  const providerOrganization = stringField(
    value,
    'providerOrganization',
    LIMITS.shortText
  );
  const providerUrl = stringField(value, 'providerUrl', LIMITS.url);

  if (typeof value.enabled === 'boolean') patch.enabled = value.enabled;
  if (version !== undefined) patch.version = version;
  if (description !== undefined) patch.description = description;
  if (interfaces !== undefined) patch.supportedInterfaces = interfaces;
  if (skills !== undefined) patch.skills = skills;
  if (providerOrganization !== undefined) {
    patch.providerOrganization = providerOrganization;
  }
  if (providerUrl !== undefined) patch.providerUrl = providerUrl;

  return patch;
}

function sanitizeInterfaces(value: unknown): StudioInterface[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.slice(0, LIMITS.interfacesMax).flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const url = stringField(item, 'url', LIMITS.url);
    const protocolBinding = stringField(item, 'protocolBinding', LIMITS.shortText);
    const protocolVersion = stringField(item, 'protocolVersion', LIMITS.shortText);
    if (url === undefined || protocolBinding === undefined || protocolVersion === undefined) {
      return [];
    }

    const tenant = stringField(item, 'tenant', LIMITS.shortText);
    return [{
      url,
      protocolBinding,
      protocolVersion,
      ...(tenant === undefined ? {} : { tenant }),
    }];
  });
}

function sanitizeSkills(value: unknown): StudioSkill[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.slice(0, LIMITS.skillsMax).flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const id = stringField(item, 'id', LIMITS.shortText);
    const name = stringField(item, 'name', LIMITS.shortText);
    const description = stringField(item, 'description', LIMITS.longText);
    const tags = sanitizeStringArray(
      item.tags,
      LIMITS.skillTagsMax,
      LIMITS.shortText
    );
    if (id === undefined || name === undefined || description === undefined || tags === undefined) {
      return [];
    }

    const skill: StudioSkill = { id, name, description, tags };
    const examples = sanitizeStringArray(
      item.examples,
      LIMITS.skillExamplesMax,
      LIMITS.longText
    );
    const inputModes = sanitizeStringArray(
      item.inputModes,
      LIMITS.modesMax,
      LIMITS.shortText
    );
    const outputModes = sanitizeStringArray(
      item.outputModes,
      LIMITS.modesMax,
      LIMITS.shortText
    );
    const security = sanitizeSkillSecurity(item.security);

    if (examples !== undefined) skill.examples = examples;
    if (inputModes !== undefined) skill.inputModes = inputModes;
    if (outputModes !== undefined) skill.outputModes = outputModes;
    if (security !== undefined) skill.security = security;

    return [skill];
  });
}

function sanitizeSkillSecurity(
  value: unknown
): NonNullable<StudioSkill['security']> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.slice(0, LIMITS.modesMax).flatMap((requirement) => {
    if (!isRecord(requirement)) {
      return [];
    }

    const entries = Object.entries(requirement)
      .slice(0, LIMITS.skillTagsMax)
      .flatMap(([scheme, scopes]) => {
        if (isUnsafeObjectKey(scheme)) {
          return [];
        }
        const sanitizedScopes = sanitizeStringArray(
          scopes,
          LIMITS.modesMax,
          LIMITS.shortText
        );
        return sanitizedScopes === undefined
          ? []
          : [[truncate(scheme, LIMITS.shortText), sanitizedScopes] as const];
      });

    return [Object.fromEntries(entries)];
  });
}

function sanitizeContentSignalPatch(
  value: unknown
): Partial<StudioAccessPolicy['contentSignal']> {
  if (!isRecord(value)) {
    return {};
  }

  const patch: Partial<StudioAccessPolicy['contentSignal']> = {};
  if (isContentSignalDirective(value.aiTrain)) patch.aiTrain = value.aiTrain;
  if (isContentSignalDirective(value.search)) patch.search = value.search;
  if (isContentSignalDirective(value.aiInput)) patch.aiInput = value.aiInput;
  return patch;
}

function sanitizeStringOrArray(
  value: unknown,
  maxLength: number
): string | string[] | undefined {
  if (typeof value === 'string') {
    return truncate(value, maxLength);
  }
  return sanitizeStringArray(value, undefined, maxLength);
}

function sanitizeStringArray(
  value: unknown,
  maxItems: number | undefined,
  maxLength: number
): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = maxItems === undefined ? value : value.slice(0, maxItems);
  return values.flatMap((item) =>
    typeof item === 'string' ? [truncate(item, maxLength)] : []
  );
}

function stringField(
  value: Record<string, unknown>,
  key: string,
  maxLength: number
): string | undefined {
  const field = value[key];
  return typeof field === 'string' ? truncate(field, maxLength) : undefined;
}

function truncate(value: string, maxLength: number): string {
  return value.slice(0, maxLength);
}

function isCrawlerDirective(value: unknown): value is 'allow' | 'disallow' {
  return value === 'allow' || value === 'disallow';
}

function isContentSignalDirective(value: unknown): value is 'yes' | 'no' {
  return value === 'yes' || value === 'no';
}

function isUnsafeObjectKey(value: string): boolean {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function summarizeFields(
  source: ActionSource,
  verb: string,
  fields: string[]
): string {
  const actor = sourceLabel(source);
  return fields.length > 0
    ? `${actor} ${verb} (${fields.join(', ')}).`
    : `${actor} made no valid changes.`;
}

function sourceLabel(source: ActionSource): 'Agent' | 'Human' {
  return source === 'agent' ? 'Agent' : 'Human';
}
