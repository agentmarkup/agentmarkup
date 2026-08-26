import {
  buildAgentCard,
  generateLlmsFullTxt,
  generateLlmsTxt,
  patchHeadersFile,
  patchRobotsTxt,
  presetToJsonLd,
  serializeJsonLd,
  validateAgentCardConfig,
  validateLlmsTxt,
  validateRobotsTxt,
} from '@agentmarkup/core';
import type {
  AgentMarkupConfig,
  EnabledAgentCardConfig,
  OrganizationSchema,
  SchemaConfig,
  ValidationResult,
  WebSiteSchema,
} from '@agentmarkup/core';

import type {
  AdapterName,
  CompiledSurface,
  StudioDraft,
} from './types';

const JSON_LD_SCRIPT_START = '<script type="application/ld+json">\n';
const JSON_LD_SCRIPT_END = '\n</script>';

export function toAgentMarkupConfig(draft: StudioDraft): AgentMarkupConfig {
  const config: AgentMarkupConfig = {
    site: draft.identity.site,
    name: draft.identity.name,
    description: draft.identity.description,
    contentSignalHeaders: {
      enabled: true,
      ...draft.access.contentSignal,
    },
    validation: {
      warnOnMissingSchema: true,
    },
  };

  const schemas = buildGlobalSchemas(draft);
  if (schemas.length > 0) {
    config.globalSchemas = schemas;
  }

  if (
    draft.content.llmsSections.length > 0 ||
    draft.content.whenToUse.length > 0
  ) {
    config.llmsTxt = {
      sections: draft.content.llmsSections.map((section) => ({
        ...section,
        entries: section.entries.map((entry) => ({ ...entry })),
      })),
      whenToUse: draft.content.whenToUse,
    };
  }

  if (draft.content.llmsFullEnabled) {
    config.llmsFullTxt = { enabled: true };
  }

  if (draft.content.markdownMirrors.enabled) {
    config.markdownPages = {
      enabled: true,
      exclude: draft.content.markdownMirrors.exclude,
    };
  }

  if (Object.keys(draft.access.crawlers).length > 0) {
    config.aiCrawlers = { ...draft.access.crawlers };
  }

  if (draft.agentCard.enabled) {
    const agentCard = toEnabledAgentCard(draft);
    const candidate = { ...config, agentCard };
    if (
      !validateAgentCardConfig(candidate).some(
        (result) => result.severity === 'error'
      )
    ) {
      config.agentCard = agentCard;
    }
  }

  return config;
}

export function compileDraft(draft: StudioDraft): CompiledSurface {
  const config = toAgentMarkupConfig(draft);
  const validations: ValidationResult[] = [];

  const siteValidation = validateSite(config.site);
  if (siteValidation) {
    pushUniqueValidations(validations, [siteValidation]);
  }

  if (draft.agentCard.enabled) {
    pushUniqueValidations(
      validations,
      validateAgentCardConfig({
        ...config,
        agentCard: toEnabledAgentCard(draft),
      })
    );
  }

  const llmsTxtResult = runGuarded(
    () => generateLlmsTxt(config),
    null,
    validations
  );
  if (llmsTxtResult !== null) {
    pushUniqueValidations(
      validations,
      runGuarded(() => validateLlmsTxt(llmsTxtResult), [], validations)
    );
  }

  const llmsFullTxt = config.llmsFullTxt?.enabled
    ? runGuarded(() => generateLlmsFullTxt(config), null, validations)
    : null;

  const crawlers = config.aiCrawlers ?? {};
  const robotsTxt = runGuarded(
    () => patchRobotsTxt('', crawlers, config.contentSignalHeaders),
    '',
    validations
  );
  pushUniqueValidations(
    validations,
    runGuarded(
      () => validateRobotsTxt(robotsTxt, crawlers),
      [],
      validations
    )
  );

  const headersFile = runGuarded(
    () => patchHeadersFile('', config.contentSignalHeaders),
    '',
    validations
  );

  const jsonLd = (config.globalSchemas ?? []).flatMap((schema) => {
    const serialized = runGuarded(
      () => serializeJsonLd(presetToJsonLd(schema)),
      null,
      validations
    );
    return serialized === null ? [] : [jsonLdScriptContents(serialized)];
  });

  let agentCardJson: string | null = null;
  const resolvedAgentCard = runGuarded(
    () => resolveValidAgentCard(config),
    { config: null, validations: [] },
    validations
  );
  pushUniqueValidations(validations, resolvedAgentCard.validations);

  if (resolvedAgentCard.config) {
    const card = runGuarded(() => buildAgentCard(config), null, validations);
    if (card !== null) {
      agentCardJson = `${JSON.stringify(card, null, 2)}\n`;
    }
  }

  return {
    llmsTxt: llmsTxtResult ?? '',
    llmsFullTxt,
    robotsTxt,
    headersFile,
    jsonLd,
    agentCardJson,
    configMjs: renderConfigMjs(draft),
    validations,
  };
}

export function renderConfigMjs(draft: StudioDraft): string {
  const config = toAgentMarkupConfig(draft);
  const agentCard = resolveValidAgentCard(config).config;
  const entries: Array<[string, unknown]> = [
    ['site', config.site],
    ['name', config.name],
  ];

  if (config.description) {
    entries.push(['description', config.description]);
  }
  if (agentCard) {
    entries.push(['agentCard', agentCard]);
  }
  if (config.llmsTxt) {
    entries.push(['llmsTxt', config.llmsTxt]);
  }
  if (config.llmsFullTxt?.enabled) {
    entries.push(['llmsFullTxt', config.llmsFullTxt]);
  }
  if (config.markdownPages?.enabled) {
    entries.push(['markdownPages', config.markdownPages]);
  }
  if (config.contentSignalHeaders?.enabled) {
    entries.push(['contentSignalHeaders', config.contentSignalHeaders]);
  }
  if (config.globalSchemas?.length) {
    entries.push(['globalSchemas', config.globalSchemas]);
  }
  if (config.aiCrawlers && Object.keys(config.aiCrawlers).length > 0) {
    entries.push(['aiCrawlers', config.aiCrawlers]);
  }
  if (config.validation) {
    entries.push(['validation', config.validation]);
  }

  const properties = entries
    .map(([key, value]) => `  ${key}: ${indentJsonValue(value)},`)
    .join('\n');

  return [
    '// Generated with AgentMarkup Studio by agentmarkup: https://agentmarkup.dev/studio/',
    '// Place at the project root as agentmarkup.config.mjs.',
    '// Review crawler and Content-Signal choices before running a build.',
    '',
    'export default {',
    properties,
    '};',
    '',
  ].join('\n');
}

export function renderAdapterSnippet(
  adapter: AdapterName,
  draft: StudioDraft
): string {
  void draft;
  const attribution =
    adapter === 'cli'
      ? '# AgentMarkup Studio by agentmarkup: https://agentmarkup.dev/studio/'
      : '// AgentMarkup Studio by agentmarkup: https://agentmarkup.dev/studio/';
  const snippets: Record<AdapterName, string> = {
    vite: [
      "import { defineConfig } from 'vite';",
      "import { agentmarkup } from '@agentmarkup/vite';",
      "import agentmarkupConfig from './agentmarkup.config.mjs';",
      '',
      'export default defineConfig({',
      '  plugins: [agentmarkup(agentmarkupConfig)],',
      '});',
    ].join('\n'),
    astro: [
      "import { defineConfig } from 'astro/config';",
      "import { agentmarkup } from '@agentmarkup/astro';",
      "import agentmarkupConfig from './agentmarkup.config.mjs';",
      '',
      'export default defineConfig({',
      '  integrations: [agentmarkup(agentmarkupConfig)],',
      '});',
    ].join('\n'),
    next: [
      "import type { NextConfig } from 'next';",
      "import { withAgentmarkup } from '@agentmarkup/next';",
      "import agentmarkupConfig from './agentmarkup.config.mjs';",
      '',
      'const nextConfig: NextConfig = {};',
      '',
      'export default withAgentmarkup(agentmarkupConfig, nextConfig);',
    ].join('\n'),
    nuxt: [
      "import agentmarkupConfig from './agentmarkup.config.mjs';",
      '',
      'export default defineNuxtConfig({',
      "  modules: ['@agentmarkup/nuxt'],",
      '  agentmarkup: agentmarkupConfig,',
      '});',
    ].join('\n'),
    cli: [
      'pnpm exec agentmarkup generate ./dist --config ./agentmarkup.config.mjs',
      'pnpm exec agentmarkup check ./dist --config ./agentmarkup.config.mjs',
    ].join('\n'),
  };

  return `${attribution}\n${snippets[adapter]}\n`;
}

function buildGlobalSchemas(draft: StudioDraft): SchemaConfig[] {
  const schemas: SchemaConfig[] = [];

  if (draft.identity.site && draft.identity.name) {
    const webSite: WebSiteSchema = {
      preset: 'webSite',
      name: draft.identity.name,
      url: draft.identity.site,
    };
    if (draft.identity.description) {
      webSite.description = draft.identity.description;
    }
    schemas.push(webSite);
  }

  const organization = draft.identity.organization;
  if (organization && (organization.name.trim() || organization.url.trim())) {
    const schema: OrganizationSchema = {
      preset: 'organization',
      name: organization.name,
      url: organization.url,
    };
    if (organization.logo) {
      schema.logo = organization.logo;
    }
    if (organization.description) {
      schema.description = organization.description;
    }
    if (organization.contactPoint?.length) {
      schema.contactPoint = organization.contactPoint;
    }
    if (organization.address) {
      schema.address = organization.address;
    }
    if (organization.sameAs?.length) {
      schema.sameAs = organization.sameAs;
    }
    schemas.push(schema);
  }

  return schemas;
}

export function toEnabledAgentCard(
  draft: StudioDraft
): EnabledAgentCardConfig {
  const rawAgentCard = draft.agentCard as unknown;
  const agentCard = isUnknownRecord(rawAgentCard) ? rawAgentCard : {};
  const card: EnabledAgentCardConfig = {
    enabled: true,
    supportedInterfaces: toObjectArray<
      EnabledAgentCardConfig['supportedInterfaces'][number]
    >(agentCard.supportedInterfaces),
    version: typeof agentCard.version === 'string' ? agentCard.version : '',
  };

  if (typeof agentCard.description === 'string') {
    card.description = agentCard.description;
  }
  if (Array.isArray(agentCard.skills) && agentCard.skills.length > 0) {
    card.skills = toObjectArray<
      NonNullable<EnabledAgentCardConfig['skills']>[number]
    >(agentCard.skills);
  }
  if (
    agentCard.providerOrganization !== undefined ||
    agentCard.providerUrl !== undefined
  ) {
    card.provider = {
      organization: typeof agentCard.providerOrganization === 'string'
        ? agentCard.providerOrganization
        : '',
      url: typeof agentCard.providerUrl === 'string'
        ? agentCard.providerUrl
        : '',
    };
  }

  return card;
}

function toObjectArray<T>(value: unknown): T[] {
  return Array.isArray(value)
    ? value.map((item) => isUnknownRecord(item) ? item as T : {} as T)
    : [];
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface ResolvedAgentCard {
  config: EnabledAgentCardConfig | null;
  validations: ValidationResult[];
}

function resolveValidAgentCard(config: AgentMarkupConfig): ResolvedAgentCard {
  const agentCard = config.agentCard;
  if (!agentCard || agentCard.enabled === false) {
    return { config: null, validations: [] };
  }

  const validations = validateAgentCardConfig(config);
  return {
    config: validations.some((result) => result.severity === 'error')
      ? null
      : agentCard,
    validations,
  };
}

function jsonLdScriptContents(serialized: string): string {
  if (
    serialized.startsWith(JSON_LD_SCRIPT_START) &&
    serialized.endsWith(JSON_LD_SCRIPT_END)
  ) {
    return serialized.slice(
      JSON_LD_SCRIPT_START.length,
      -JSON_LD_SCRIPT_END.length
    );
  }

  return serialized;
}

function indentJsonValue(value: unknown): string {
  const serialized = JSON.stringify(value, null, 2);
  if (serialized === undefined) {
    return 'null';
  }
  return serialized.replace(/\n/g, '\n  ');
}

function validateSite(site: string): ValidationResult | null {
  try {
    const url = new URL(site);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return null;
    }
  } catch {
    // Reported below with the same deterministic message as the core generator.
  }

  return {
    severity: 'error',
    message: `[agentmarkup/core] Invalid config.site "${site}". Expected an absolute http(s) URL like "https://example.com".`,
  };
}

function runGuarded<T>(
  operation: () => T,
  fallback: T,
  validations: ValidationResult[]
): T {
  try {
    return operation();
  } catch (error) {
    pushUniqueValidations(validations, [
      {
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
      },
    ]);
    return fallback;
  }
}

function pushUniqueValidations(
  target: ValidationResult[],
  additions: ValidationResult[]
): void {
  const existing = new Set(
    target.map(
      (result) =>
        `${result.severity}\u0000${result.path ?? ''}\u0000${result.message}`
    )
  );

  for (const result of additions) {
    const key = `${result.severity}\u0000${result.path ?? ''}\u0000${result.message}`;
    if (!existing.has(key)) {
      target.push(result);
      existing.add(key);
    }
  }
}
