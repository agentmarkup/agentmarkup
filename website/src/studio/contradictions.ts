import {
  isMarkdownPageExcluded,
  validateAgentCardConfig,
  type AgentMarkupConfig,
  type EnabledAgentCardConfig,
} from '@agentmarkup/core';

import {
  CRAWLER_GROUPS,
  type Contradiction,
  type StudioDraft,
} from './types';

type UnknownRecord = Record<string, unknown>;

interface SameSitePage {
  path: string;
  title: string;
  url: string;
}

const CODE_ORDER = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'] as const;

export function detectContradictions(draft: StudioDraft): Contradiction[] {
  const findings = [
    detectRetrievalBlockedButCited(draft),
    detectContentSignalVsLlms(draft),
    detectMirrorExcludedButListed(draft),
    detectIdentityDrift(draft),
    detectCardWithoutInterface(draft),
    detectTrainAllowedSignalDenied(draft),
    detectMirrorsWithoutPages(draft),
    detectWhenToUseEmptySurface(draft),
  ].filter(isContradiction);

  return findings.sort(
    (left, right) => CODE_ORDER.indexOf(left.code) - CODE_ORDER.indexOf(right.code)
  );
}

function detectRetrievalBlockedButCited(draft: StudioDraft): Contradiction | null {
  const entries = getLlmsEntries(draft);
  const crawlers = getCrawlers(draft);
  // Core treats search/retrieval crawlers as distinct from user-triggered agent fetchers.
  const allSearchCrawlersBlocked = CRAWLER_GROUPS.search.every(
    (crawler) => read(crawlers, crawler) === 'disallow'
  );

  if (entries.length === 0 || !allSearchCrawlersBlocked) {
    return null;
  }

  return {
    code: 'C1',
    severity: 'error',
    title: 'Cited content blocks retrieval',
    detail: `llms.txt lists ${entries.length} ${pluralize(entries.length, 'entry', 'entries')}, while ${CRAWLER_GROUPS.search.join(', ')} are all set to "disallow" in robots.txt.`,
    loci: ['llms.txt', 'robots.txt'],
  };
}

function detectContentSignalVsLlms(draft: StudioDraft): Contradiction | null {
  const entries = getLlmsEntries(draft);
  const whenToUse = getWhenToUse(draft);
  const contentSignal = getContentSignal(draft);

  if (
    read(contentSignal, 'search') === 'no' &&
    (entries.length > 0 || whenToUse.length > 0)
  ) {
    const llmsContent = [
      entries.length > 0
        ? `${entries.length} ${pluralize(entries.length, 'entry', 'entries')}`
        : null,
      whenToUse.length > 0
        ? `${whenToUse.length} whenToUse ${pluralize(whenToUse.length, 'entry', 'entries')}`
        : null,
    ]
      .filter((value): value is string => value !== null)
      .join(' and ');

    return {
      code: 'C2',
      severity: 'error',
      title: 'Content policy conflicts with llms.txt',
      detail: `Content-Signal search is "no", while llms.txt contains ${llmsContent}.`,
      loci: ['Content-Signal', 'llms.txt'],
    };
  }

  if (
    read(contentSignal, 'aiInput') === 'no' &&
    read(getMarkdownMirrors(draft), 'enabled') === true
  ) {
    return {
      code: 'C2',
      severity: 'error',
      title: 'Content policy conflicts with mirrors',
      detail: 'Content-Signal ai-input is "no", while markdown mirrors are enabled.',
      loci: ['Content-Signal', 'markdown mirrors'],
    };
  }

  return null;
}

function detectMirrorExcludedButListed(draft: StudioDraft): Contradiction | null {
  const mirrors = getMarkdownMirrors(draft);
  const exclude = getStringArray(read(mirrors, 'exclude'));

  if (read(mirrors, 'enabled') !== true || exclude.length === 0) {
    return null;
  }

  for (const entry of getLlmsEntries(draft)) {
    const page = getSameSitePage(draft, entry);
    if (!page) {
      continue;
    }

    const pattern = exclude.find((candidate) =>
      isMarkdownPageExcluded(page.path, [candidate])
    );
    if (pattern) {
      return {
        code: 'C3',
        severity: 'error',
        title: 'Listed page is excluded from mirrors',
        detail: `The llms.txt entry "${page.title}" uses "${page.url}", whose page path "${page.path}" matches the markdown mirror exclusion "${pattern}".`,
        loci: ['llms.txt', 'markdown mirrors'],
      };
    }
  }

  return null;
}

function detectIdentityDrift(draft: StudioDraft): Contradiction | null {
  const identity = getIdentity(draft);
  const identityName = getNonEmptyString(read(identity, 'name'));
  const identitySite = getNonEmptyString(read(identity, 'site'));
  const organization = asRecord(read(identity, 'organization'));
  const mismatches: string[] = [];

  if (organization) {
    const organizationName = getNonEmptyString(read(organization, 'name'));
    const organizationUrl = getNonEmptyString(read(organization, 'url'));

    if (
      organizationName &&
      identityName &&
      organizationName !== identityName
    ) {
      mismatches.push(
        `Organization name "${organizationName}" differs from site identity name "${identityName}".`
      );
    }

    if (
      organizationUrl &&
      identitySite &&
      normalizeTrailingSlash(organizationUrl) !== normalizeTrailingSlash(identitySite)
    ) {
      mismatches.push(
        `Organization URL "${organizationUrl}" differs from site identity URL "${identitySite}".`
      );
    }
  }

  if (mismatches.length > 0) {
    return {
      code: 'C4',
      severity: 'warning',
      title: 'Published identity values drift',
      detail: mismatches.join(' '),
      loci: ['JSON-LD', 'site identity'],
    };
  }

  const agentCard = getAgentCard(draft);
  const providerOrganization = getNonEmptyString(
    read(agentCard, 'providerOrganization')
  );
  const providerUrl = getNonEmptyString(read(agentCard, 'providerUrl'));
  const agentCardMismatches: string[] = [];

  if (read(agentCard, 'enabled') === true) {
    if (
      providerOrganization &&
      identityName &&
      providerOrganization !== identityName
    ) {
      agentCardMismatches.push(
        `Agent Card provider organization "${providerOrganization}" differs from site identity name "${identityName}".`
      );
    }

    if (
      providerUrl &&
      identitySite &&
      normalizeTrailingSlash(providerUrl) !== normalizeTrailingSlash(identitySite)
    ) {
      agentCardMismatches.push(
        `Agent Card provider URL "${providerUrl}" differs from site identity URL "${identitySite}".`
      );
    }
  }

  if (agentCardMismatches.length > 0) {
    return {
      code: 'C4',
      severity: 'warning',
      title: 'Agent Card identity drifts',
      detail: agentCardMismatches.join(' '),
      loci: ['Agent Card', 'site identity'],
    };
  }

  return null;
}

function detectCardWithoutInterface(draft: StudioDraft): Contradiction | null {
  const agentCard = getAgentCard(draft);
  if (read(agentCard, 'enabled') !== true) {
    return null;
  }

  const errors = validateAgentCardConfig(
    buildAgentCardValidationConfig(draft, agentCard)
  ).filter(({ severity }) => severity === 'error');

  if (errors.length === 0) {
    return null;
  }

  return {
    code: 'C5',
    severity: 'error',
    title: 'Advertised Agent Card is incomplete',
    detail: `The enabled Agent Card failed validation: ${errors.map(({ message }) => message).join('; ')}.`,
    loci: ['Agent Card'],
  };
}

function detectTrainAllowedSignalDenied(draft: StudioDraft): Contradiction | null {
  const aiTrain = read(getContentSignal(draft), 'aiTrain');
  const crawlers = getCrawlers(draft);
  const configured = CRAWLER_GROUPS.train.flatMap((crawler) => {
    const directive = read(crawlers, crawler);
    return directive === 'allow' || directive === 'disallow'
      ? [{ crawler, directive }]
      : [];
  });

  if (aiTrain === 'no') {
    const allowed = configured
      .filter(({ directive }) => directive === 'allow')
      .map(({ crawler }) => crawler);

    if (allowed.length > 0) {
      return {
        code: 'C6',
        severity: 'warning',
        title: 'Training policies disagree',
        detail: `Content-Signal ai-train is "no", while robots.txt sets ${allowed.join(', ')} to "allow".`,
        loci: ['Content-Signal', 'robots.txt'],
      };
    }
  }

  // Requiring the whole known training group avoids noise from common one-off blocks.
  if (
    aiTrain === 'yes' &&
    configured.length === CRAWLER_GROUPS.train.length &&
    configured.every(({ directive }) => directive === 'disallow')
  ) {
    return {
      code: 'C6',
      severity: 'warning',
      title: 'Training policies disagree',
      detail: `Content-Signal ai-train is "yes", while every configured training crawler is "disallow": ${configured.map(({ crawler }) => crawler).join(', ')}.`,
      loci: ['Content-Signal', 'robots.txt'],
    };
  }

  return null;
}

function detectMirrorsWithoutPages(draft: StudioDraft): Contradiction | null {
  const mirrors = getMarkdownMirrors(draft);
  if (read(mirrors, 'enabled') !== true) {
    return null;
  }

  const entries = getLlmsEntries(draft);
  if (entries.some((entry) => getSameSitePage(draft, entry) !== null)) {
    return null;
  }

  return {
    code: 'C7',
    severity: 'warning',
    title: 'Mirrors have no listed pages',
    detail: `Markdown mirrors are enabled, but llms.txt references 0 same-site pages across ${entries.length} ${pluralize(entries.length, 'entry', 'entries')}.`,
    loci: ['markdown mirrors', 'llms.txt'],
  };
}

function detectWhenToUseEmptySurface(draft: StudioDraft): Contradiction | null {
  const whenToUse = getWhenToUse(draft);

  if (whenToUse.length === 0 || getLlmsEntries(draft).length > 0) {
    return null;
  }

  return {
    code: 'C8',
    severity: 'warning',
    title: 'Usage guidance has no content',
    detail: `llms.txt has ${whenToUse.length} whenToUse ${pluralize(whenToUse.length, 'entry', 'entries')}, but its sections contain 0 entries.`,
    loci: ['llms.txt'],
  };
}

function getSameSitePage(draft: StudioDraft, entry: unknown): SameSitePage | null {
  const entryRecord = asRecord(entry);
  const url = getNonEmptyString(read(entryRecord, 'url'));
  if (!url) {
    return null;
  }

  const site = parseHttpUrl(getNonEmptyString(read(getIdentity(draft), 'site')));
  let path: string;

  if (url.startsWith('/') && !url.startsWith('//')) {
    try {
      path = new URL(url, 'https://studio.invalid').pathname;
    } catch {
      return null;
    }
  } else {
    const parsed = parseHttpUrl(url);
    if (!site || !parsed || parsed.origin !== site.origin) {
      return null;
    }
    path = pathRelativeToSite(site, parsed.pathname);
  }

  if (!isHtmlLikePath(path)) {
    return null;
  }

  return {
    path,
    title: getNonEmptyString(read(entryRecord, 'title')) ?? 'Untitled entry',
    url,
  };
}

function getLlmsEntries(draft: StudioDraft): unknown[] {
  const sections = read(getContent(draft), 'llmsSections');
  if (!Array.isArray(sections)) {
    return [];
  }

  const entries: unknown[] = [];
  for (const section of sections) {
    const sectionEntries = read(asRecord(section), 'entries');
    if (Array.isArray(sectionEntries)) {
      entries.push(...sectionEntries);
    }
  }
  return entries;
}

function getWhenToUse(draft: StudioDraft): string[] {
  return getStringArray(read(getContent(draft), 'whenToUse')).filter(
    (entry) => entry.trim().length > 0
  );
}

function buildAgentCardValidationConfig(
  draft: StudioDraft,
  agentCard: UnknownRecord | null
): AgentMarkupConfig {
  const identity = getIdentity(draft);
  const card: EnabledAgentCardConfig = {
    enabled: true,
    supportedInterfaces: getObjectArray(
      read(agentCard, 'supportedInterfaces')
    ) as unknown as EnabledAgentCardConfig['supportedInterfaces'],
    version: getString(read(agentCard, 'version')) ?? '',
  };
  const cardDescription = getString(read(agentCard, 'description'));
  const skills = read(agentCard, 'skills');

  if (cardDescription !== undefined) {
    card.description = cardDescription;
  }
  if (Array.isArray(skills) && skills.length > 0) {
    card.skills = getObjectArray(
      skills
    ) as unknown as EnabledAgentCardConfig['skills'];
  }
  if (
    read(agentCard, 'providerOrganization') !== undefined ||
    read(agentCard, 'providerUrl') !== undefined
  ) {
    card.provider = {
      organization: getString(read(agentCard, 'providerOrganization')) ?? '',
      url: getString(read(agentCard, 'providerUrl')) ?? '',
    };
  }

  const config: AgentMarkupConfig = {
    site: getString(read(identity, 'site')) ?? '',
    name: getString(read(identity, 'name')) ?? '',
    agentCard: card,
  };
  const identityDescription = getString(read(identity, 'description'));
  if (identityDescription !== undefined) {
    config.description = identityDescription;
  }

  return config;
}

function getIdentity(draft: StudioDraft): UnknownRecord | null {
  return asRecord(read(asRecord(draft), 'identity'));
}

function getCrawlers(draft: StudioDraft): UnknownRecord | null {
  return asRecord(read(asRecord(read(asRecord(draft), 'access')), 'crawlers'));
}

function getContentSignal(draft: StudioDraft): UnknownRecord | null {
  return asRecord(
    read(asRecord(read(asRecord(draft), 'access')), 'contentSignal')
  );
}

function getContent(draft: StudioDraft): UnknownRecord | null {
  return asRecord(read(asRecord(draft), 'content'));
}

function getMarkdownMirrors(draft: StudioDraft): UnknownRecord | null {
  return asRecord(read(getContent(draft), 'markdownMirrors'));
}

function getAgentCard(draft: StudioDraft): UnknownRecord | null {
  return asRecord(read(asRecord(draft), 'agentCard'));
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function read(record: UnknownRecord | null, key: string): unknown {
  return record?.[key];
}

function getNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function getObjectArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value)
    ? value.map((entry) => asRecord(entry) ?? {})
    : [];
}

function parseHttpUrl(value: string | null): URL | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function pathRelativeToSite(site: URL, pathname: string): string {
  const base = site.pathname.replace(/\/$/, '');
  if (base && (pathname === base || pathname.startsWith(`${base}/`))) {
    return pathname.slice(base.length) || '/';
  }
  return pathname;
}

function isHtmlLikePath(pathname: string): boolean {
  if (pathname === '' || pathname === '/' || pathname.endsWith('/')) {
    return true;
  }
  if (pathname.toLowerCase().endsWith('.html')) {
    return true;
  }

  const lastSegment = pathname.split('/').pop() ?? '';
  return !lastSegment.includes('.');
}

function normalizeTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function isContradiction(
  finding: Contradiction | null
): finding is Contradiction {
  return finding !== null;
}
