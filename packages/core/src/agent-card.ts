import type {
  AgentCard,
  AgentCardCapabilities,
  AgentCardConfig,
  AgentCardExtension,
  AgentCardInterface,
  AgentCardProvider,
  AgentCardSecurityRequirement,
  AgentCardSecurityScheme,
  AgentCardSignature,
  AgentCardSkill,
  AgentMarkupConfig,
} from './types.js';

const DEFAULT_AGENT_CARD_MODES = ['text/plain'];

export function previewAgentCard(config: AgentMarkupConfig): AgentCard | null {
  const agentCard = config.agentCard;
  if (!agentCard || agentCard.enabled === false) {
    return null;
  }

  return pruneUndefinedFields<AgentCard>({
    name: agentCard.name ?? config.name,
    description: agentCard.description ?? config.description ?? '',
    supportedInterfaces: (agentCard.supportedInterfaces ?? []).map((entry) =>
      pruneUndefinedFields<AgentCardInterface>({
        url: entry.url,
        protocolBinding: entry.protocolBinding,
        protocolVersion: entry.protocolVersion,
        tenant: entry.tenant,
      })
    ),
    provider: normalizeProvider(agentCard.provider),
    version: agentCard.version ?? '',
    documentationUrl: agentCard.documentationUrl,
    capabilities: normalizeCapabilities(agentCard.capabilities),
    securitySchemes: normalizeSecuritySchemes(agentCard.securitySchemes),
    security: normalizeSecurityRequirements(agentCard.security),
    defaultInputModes: normalizeStringArray(
      agentCard.defaultInputModes,
      DEFAULT_AGENT_CARD_MODES
    ),
    defaultOutputModes: normalizeStringArray(
      agentCard.defaultOutputModes,
      DEFAULT_AGENT_CARD_MODES
    ),
    skills: (agentCard.skills ?? []).map(normalizeSkill),
    signatures: normalizeSignatures(agentCard.signatures),
    iconUrl: agentCard.iconUrl,
  });
}

function normalizeProvider(
  provider: AgentCardConfig['provider']
): AgentCardProvider | undefined {
  if (!provider) {
    return undefined;
  }

  return pruneUndefinedFields<AgentCardProvider>({
    organization: provider.organization,
    url: provider.url,
  });
}

function normalizeCapabilities(
  capabilities: AgentCardConfig['capabilities']
): AgentCardCapabilities {
  if (!capabilities) {
    return {};
  }

  return pruneUndefinedFields<AgentCardCapabilities>({
    streaming: capabilities.streaming,
    pushNotifications: capabilities.pushNotifications,
    extensions: capabilities.extensions?.map(normalizeExtension),
    extendedAgentCard: capabilities.extendedAgentCard,
  });
}

function normalizeExtension(extension: AgentCardExtension): AgentCardExtension {
  return pruneUndefinedFields<AgentCardExtension>({
    uri: extension.uri,
    description: extension.description,
    required: extension.required,
    params: extension.params,
  });
}

function normalizeSkill(skill: AgentCardSkill): AgentCardSkill {
  return pruneUndefinedFields<AgentCardSkill>({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    tags: normalizeStringArray(skill.tags, []),
    examples: normalizeStringArray(skill.examples),
    inputModes: normalizeStringArray(skill.inputModes),
    outputModes: normalizeStringArray(skill.outputModes),
    security: normalizeSecurityRequirements(skill.security),
  });
}

function normalizeSecuritySchemes(
  value: AgentCardConfig['securitySchemes']
): Record<string, AgentCardSecurityScheme> | undefined {
  if (!value || Object.keys(value).length === 0) {
    return undefined;
  }

  return value;
}

function normalizeSecurityRequirements(
  value: AgentCardSecurityRequirement[] | undefined
): AgentCardSecurityRequirement[] | undefined {
  if (!value || value.length === 0) {
    return undefined;
  }

  return value.map((requirement) =>
    Object.fromEntries(
      Object.entries(requirement).map(([schemeName, scopes]) => [
        schemeName,
        Array.isArray(scopes) ? scopes.filter((scope) => typeof scope === 'string') : [],
      ])
    )
  );
}

function normalizeSignatures(
  value: AgentCardSignature[] | undefined
): AgentCardSignature[] | undefined {
  if (!value || value.length === 0) {
    return undefined;
  }

  return value.map((signature) =>
    pruneUndefinedFields<AgentCardSignature>({
      protected: signature.protected,
      signature: signature.signature,
      header: signature.header,
    })
  );
}

function normalizeStringArray(
  value: string[] | undefined,
  fallback?: string[]
): string[] {
  if (!value) {
    return [...(fallback ?? [])];
  }

  return value.filter((entry) => typeof entry === 'string');
}

function pruneUndefinedFields<T>(value: T): T {
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([, fieldValue]) => fieldValue !== undefined
    )
  ) as T;
}
