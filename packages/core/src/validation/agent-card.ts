import { previewAgentCard } from '../agent-card.js';
import type {
  AgentCard,
  AgentCardCapabilities,
  AgentCardInterface,
  AgentMarkupConfig,
  AgentCardProvider,
  AgentCardSecurityRequirement,
  AgentCardSkill,
  ValidationResult,
} from '../types.js';

export function validateAgentCard(
  value: unknown,
  path = '/.well-known/agent-card.json'
): ValidationResult[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [
      {
        severity: 'error',
        message: 'Agent Card must be a JSON object',
        path,
      },
    ];
  }

  const card = value as Partial<AgentCard>;
  const results: ValidationResult[] = [];

  validateRequiredString(card.name, 'name', path, results);
  validateRequiredString(card.description, 'description', path, results);
  validateRequiredString(card.version, 'version', path, results);

  if (!Array.isArray(card.supportedInterfaces)) {
    results.push({
      severity: 'error',
      message: "Agent Card missing required field 'supportedInterfaces'",
      path,
    });
  } else if (card.supportedInterfaces.length === 0) {
    results.push({
      severity: 'error',
      message: 'Agent Card supportedInterfaces must include at least one interface',
      path,
    });
  } else {
    for (const [index, entry] of card.supportedInterfaces.entries()) {
      results.push(...validateAgentInterface(entry, path, index));
    }
  }

  if (!card.capabilities || typeof card.capabilities !== 'object' || Array.isArray(card.capabilities)) {
    results.push({
      severity: 'error',
      message: "Agent Card missing required field 'capabilities'",
      path,
    });
  } else {
    results.push(...validateAgentCapabilities(card.capabilities, path));
  }

  if (!Array.isArray(card.defaultInputModes)) {
    results.push({
      severity: 'error',
      message: "Agent Card missing required field 'defaultInputModes'",
      path,
    });
  } else {
    results.push(...validateStringArray(card.defaultInputModes, 'defaultInputModes', path));
  }

  if (!Array.isArray(card.defaultOutputModes)) {
    results.push({
      severity: 'error',
      message: "Agent Card missing required field 'defaultOutputModes'",
      path,
    });
  } else {
    results.push(...validateStringArray(card.defaultOutputModes, 'defaultOutputModes', path));
  }

  if (!Array.isArray(card.skills)) {
    results.push({
      severity: 'error',
      message: "Agent Card missing required field 'skills'",
      path,
    });
  } else {
    for (const [index, skill] of card.skills.entries()) {
      results.push(...validateAgentSkill(skill, path, index));
    }
  }

  if (card.provider !== undefined) {
    results.push(...validateAgentProvider(card.provider, path));
  }

  if (card.documentationUrl !== undefined) {
    results.push(...validateAbsoluteUrl(card.documentationUrl, 'documentationUrl', path, ['http:', 'https:']));
  }

  if (card.iconUrl !== undefined) {
    results.push(...validateAbsoluteUrl(card.iconUrl, 'iconUrl', path, ['http:', 'https:']));
  }

  if (card.securitySchemes !== undefined) {
    if (
      !card.securitySchemes ||
      typeof card.securitySchemes !== 'object' ||
      Array.isArray(card.securitySchemes)
    ) {
      results.push({
        severity: 'error',
        message: 'Agent Card securitySchemes must be an object',
        path,
      });
    }
  }

  if (card.security !== undefined) {
    results.push(...validateSecurityRequirements(card.security, 'security', path));
  }

  if (card.signatures !== undefined) {
    if (!Array.isArray(card.signatures)) {
      results.push({
        severity: 'error',
        message: 'Agent Card signatures must be an array',
        path,
      });
    } else {
      for (const [index, signature] of card.signatures.entries()) {
        if (!signature || typeof signature !== 'object' || Array.isArray(signature)) {
          results.push({
            severity: 'error',
            message: `Agent Card signatures[${index}] must be an object`,
            path,
          });
          continue;
        }

        const record = signature as unknown as Record<string, unknown>;
        validateRequiredString(record.protected, `signatures[${index}].protected`, path, results);
        validateRequiredString(record.signature, `signatures[${index}].signature`, path, results);
      }
    }
  }

  return dedupeResults(results);
}

export function validateAgentCardConfig(
  config: AgentMarkupConfig,
  path = '/.well-known/agent-card.json'
): ValidationResult[] {
  const card = previewAgentCard(config);
  if (!card) {
    return [];
  }

  return validateAgentCard(card, path);
}

export function validateAgentCardJson(
  json: string,
  path = '/.well-known/agent-card.json'
): ValidationResult[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    return [
      {
        severity: 'error',
        message: 'Agent Card is not valid JSON',
        path,
      },
    ];
  }

  return validateAgentCard(parsed, path);
}

function validateAgentInterface(
  value: unknown,
  path: string,
  index: number
): ValidationResult[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [
      {
        severity: 'error',
        message: `Agent Card supportedInterfaces[${index}] must be an object`,
        path,
      },
    ];
  }

  const entry = value as Partial<AgentCardInterface>;
  const results: ValidationResult[] = [];
  validateRequiredString(entry.url, `supportedInterfaces[${index}].url`, path, results);
  validateRequiredString(
    entry.protocolBinding,
    `supportedInterfaces[${index}].protocolBinding`,
    path,
    results
  );
  validateRequiredString(
    entry.protocolVersion,
    `supportedInterfaces[${index}].protocolVersion`,
    path,
    results
  );

  if (typeof entry.url === 'string' && entry.url.trim() !== '') {
    results.push(
      ...validateAbsoluteUrl(entry.url, `supportedInterfaces[${index}].url`, path, [
        'http:',
        'https:',
        'ws:',
        'wss:',
      ])
    );
  }

  return results;
}

function validateAgentProvider(value: unknown, path: string): ValidationResult[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [
      {
        severity: 'error',
        message: 'Agent Card provider must be an object',
        path,
      },
    ];
  }

  const provider = value as Partial<AgentCardProvider>;
  const results: ValidationResult[] = [];
  validateRequiredString(provider.organization, 'provider.organization', path, results);
  validateRequiredString(provider.url, 'provider.url', path, results);

  if (typeof provider.url === 'string' && provider.url.trim() !== '') {
    results.push(...validateAbsoluteUrl(provider.url, 'provider.url', path, ['http:', 'https:']));
  }

  return results;
}

function validateAgentCapabilities(
  value: AgentCardCapabilities,
  path: string
): ValidationResult[] {
  const results: ValidationResult[] = [];

  for (const field of ['streaming', 'pushNotifications', 'extendedAgentCard'] as const) {
    const candidate = value[field];
    if (candidate !== undefined && typeof candidate !== 'boolean') {
      results.push({
        severity: 'error',
        message: `Agent Card capabilities.${field} must be a boolean`,
        path,
      });
    }
  }

  if (value.extensions !== undefined) {
    if (!Array.isArray(value.extensions)) {
      results.push({
        severity: 'error',
        message: 'Agent Card capabilities.extensions must be an array',
        path,
      });
    } else {
      for (const [index, extension] of value.extensions.entries()) {
        if (!extension || typeof extension !== 'object' || Array.isArray(extension)) {
          results.push({
            severity: 'error',
            message: `Agent Card capabilities.extensions[${index}] must be an object`,
            path,
          });
          continue;
        }

        const record = extension as unknown as Record<string, unknown>;
        validateRequiredString(
          record.uri,
          `capabilities.extensions[${index}].uri`,
          path,
          results
        );
        if (
          record.required !== undefined &&
          typeof record.required !== 'boolean'
        ) {
          results.push({
            severity: 'error',
            message: `Agent Card capabilities.extensions[${index}].required must be a boolean`,
            path,
          });
        }
      }
    }
  }

  return results;
}

function validateAgentSkill(
  value: unknown,
  path: string,
  index: number
): ValidationResult[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [
      {
        severity: 'error',
        message: `Agent Card skills[${index}] must be an object`,
        path,
      },
    ];
  }

  const skill = value as Partial<AgentCardSkill>;
  const results: ValidationResult[] = [];
  validateRequiredString(skill.id, `skills[${index}].id`, path, results);
  validateRequiredString(skill.name, `skills[${index}].name`, path, results);
  validateRequiredString(skill.description, `skills[${index}].description`, path, results);

  if (!Array.isArray(skill.tags)) {
    results.push({
      severity: 'error',
      message: `Agent Card missing required field 'skills[${index}].tags'`,
      path,
    });
  } else {
    results.push(...validateStringArray(skill.tags, `skills[${index}].tags`, path));
  }

  if (skill.examples !== undefined) {
    results.push(...validateStringArray(skill.examples, `skills[${index}].examples`, path));
  }

  if (skill.inputModes !== undefined) {
    results.push(...validateStringArray(skill.inputModes, `skills[${index}].inputModes`, path));
  }

  if (skill.outputModes !== undefined) {
    results.push(...validateStringArray(skill.outputModes, `skills[${index}].outputModes`, path));
  }

  if (skill.security !== undefined) {
    results.push(
      ...validateSecurityRequirements(skill.security, `skills[${index}].security`, path)
    );
  }

  return results;
}

function validateSecurityRequirements(
  value: unknown,
  field: string,
  path: string
): ValidationResult[] {
  if (!Array.isArray(value)) {
    return [
      {
        severity: 'error',
        message: `Agent Card ${field} must be an array`,
        path,
      },
    ];
  }

  const results: ValidationResult[] = [];

  for (const [index, requirement] of value.entries()) {
    if (!requirement || typeof requirement !== 'object' || Array.isArray(requirement)) {
      results.push({
        severity: 'error',
        message: `Agent Card ${field}[${index}] must be an object`,
        path,
      });
      continue;
    }

    for (const [schemeName, scopes] of Object.entries(
      requirement as AgentCardSecurityRequirement
    )) {
      if (!Array.isArray(scopes) || scopes.some((scope) => typeof scope !== 'string')) {
        results.push({
          severity: 'error',
          message: `Agent Card ${field}[${index}].${schemeName} must be an array of strings`,
          path,
        });
      }
    }
  }

  return results;
}

function validateAbsoluteUrl(
  value: string,
  field: string,
  path: string,
  protocols: string[]
): ValidationResult[] {
  try {
    const url = new URL(value);
    if (!protocols.includes(url.protocol)) {
      return [
        {
          severity: 'error',
          message: `Agent Card ${field} must use one of: ${protocols.join(', ')}`,
          path,
        },
      ];
    }

    return [];
  } catch {
    return [
      {
        severity: 'error',
        message: `Agent Card ${field} must be an absolute URL`,
        path,
      },
    ];
  }
}

function validateRequiredString(
  value: unknown,
  field: string,
  path: string,
  results: ValidationResult[]
): void {
  if (typeof value === 'string') {
    if (value.trim() !== '') {
      return;
    }

    results.push({
      severity: 'error',
      message: `Agent Card ${field} must be a non-empty string`,
      path,
    });
    return;
  }

  results.push({
    severity: 'error',
    message: `Agent Card missing required field '${field}'`,
    path,
  });
}

function validateStringArray(
  value: unknown,
  field: string,
  path: string
): ValidationResult[] {
  if (!Array.isArray(value)) {
    return [
      {
        severity: 'error',
        message: `Agent Card ${field} must be an array of strings`,
        path,
      },
    ];
  }

  if (value.some((entry) => typeof entry !== 'string')) {
    return [
      {
        severity: 'error',
        message: `Agent Card ${field} must be an array of strings`,
        path,
      },
    ];
  }

  return [];
}

function dedupeResults(results: ValidationResult[]): ValidationResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = `${result.severity}|${result.path ?? ''}|${result.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
