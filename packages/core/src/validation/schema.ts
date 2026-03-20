import { extractJsonLdScriptContents } from '../html.js';
import { presetToJsonLd } from '../presets/resolve.js';
import type { JsonLdBase, SchemaConfig, ValidationResult } from '../types.js';

const REQUIRED_FIELDS: Record<string, string[]> = {
  website: ['name', 'url'],
  organization: ['name', 'url'],
  article: ['headline', 'url', 'datePublished', 'author'],
  product: ['name', 'url'],
  offer: ['price', 'priceCurrency'],
  webpage: ['name', 'url'],
  collectionpage: ['name', 'url'],
  profilepage: ['name', 'url'],
  person: ['name'],
  softwareapplication: ['name', 'url', 'applicationCategory'],
  blogposting: ['headline', 'url', 'datePublished', 'author'],
  newsarticle: ['headline', 'url', 'datePublished', 'author'],
  faqpage: ['mainEntity'],
};

const RECOMMENDED_FIELDS: Record<string, string[]> = {
  organization: ['logo'],
  article: ['description', 'image'],
  product: ['description', 'sku', 'offers'],
  offer: ['availability'],
  webpage: ['description'],
  collectionpage: ['description'],
  profilepage: ['description', 'mainEntity'],
  person: ['url'],
  softwareapplication: ['description'],
  blogposting: ['description', 'image'],
  newsarticle: ['description', 'image'],
};

export function validateSchema(
  schema: SchemaConfig,
  pagePath?: string
): ValidationResult[] {
  const results: ValidationResult[] = [];

  if (!('preset' in schema) || !schema.preset) {
    if (!schema['@type']) {
      results.push({
        severity: 'error',
        message: 'Custom schema missing @type',
        path: pagePath,
      });
    }

    if (schema['@type']) {
      results.push(...validateJsonLdNode(schema as JsonLdBase, pagePath));
    }

    return results;
  }

  if (schema.preset === 'faqPage' && schema.questions?.length === 0) {
    results.push({
      severity: 'error',
      message: 'FAQPage schema has empty questions array',
      path: pagePath,
    });
  }

  const presetName = normalizePresetName(schema.preset);
  const required = REQUIRED_FIELDS[presetName];
  if (required) {
    for (const field of required) {
      const value = getPresetValidationField(schema, field);
      if (value === undefined || value === null || value === '') {
        results.push({
          severity: 'error',
          message: `${displaySchemaName(schema.preset)} schema missing required field '${field}'`,
          path: pagePath,
        });
      }
    }
  }

  const recommended = RECOMMENDED_FIELDS[presetName];
  if (recommended) {
    for (const field of recommended) {
      const value = getPresetValidationField(schema, field);
      if (value === undefined || value === null || value === '') {
        results.push({
          severity: 'warning',
          message: `${displaySchemaName(schema.preset)} schema missing '${field}' field`,
          path: pagePath,
        });
      }
    }
  }

  return dedupeResults([
    ...results,
    ...validateJsonLdNode(presetToJsonLd(schema), pagePath),
  ]);
}

export function validateExistingJsonLd(
  html: string,
  pagePath?: string
): ValidationResult[] {
  const results: ValidationResult[] = [];

  for (const content of extractJsonLdScriptContents(html)) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(content);
    } catch {
      results.push({
        severity: 'error',
        message: 'Existing JSON-LD block is not valid JSON',
        path: pagePath,
      });
      continue;
    }

    results.push(...validateJsonLdValue(parsed, pagePath));
  }

  return dedupeResults(results);
}

function getSchemaField(schema: SchemaConfig, field: string): unknown {
  return (schema as unknown as Record<string, unknown>)[field];
}

function getPresetValidationField(schema: SchemaConfig, field: string): unknown {
  if (!('preset' in schema) || !schema.preset) {
    return getSchemaField(schema, field);
  }

  if (schema.preset === 'faqPage' && field === 'mainEntity') {
    return schema.questions;
  }

  return getSchemaField(schema, field);
}

function validateJsonLdValue(
  value: unknown,
  pagePath?: string
): ValidationResult[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => validateJsonLdValue(item, pagePath));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const record = value as Record<string, unknown>;
  const results: ValidationResult[] = [];

  if ('@graph' in record) {
    results.push(...validateJsonLdValue(record['@graph'], pagePath));
  }

  if (!record['@type']) {
    return results;
  }

  return [...results, ...validateJsonLdNode(record as JsonLdBase, pagePath)];
}

export function validateJsonLdNode(
  schema: JsonLdBase,
  pagePath?: string
): ValidationResult[] {
  const types = getTypeValues(schema['@type']);
  if (types.length === 0) {
    return [
      {
        severity: 'error',
        message: 'Custom schema missing @type',
        path: pagePath,
      },
    ];
  }

  const results: ValidationResult[] = [];

  for (const type of types) {
    const required = REQUIRED_FIELDS[type];
    if (required) {
      for (const field of required) {
        const value = (schema as Record<string, unknown>)[field];
        if (isMissingValue(value)) {
          results.push({
            severity: 'error',
            message: `${displaySchemaName(type)} schema missing required field '${field}'`,
            path: pagePath,
          });
        }
      }
    }

    const recommended = RECOMMENDED_FIELDS[type];
    if (recommended) {
      for (const field of recommended) {
        const value = (schema as Record<string, unknown>)[field];
        if (isMissingValue(value)) {
          results.push({
            severity: 'warning',
            message: `${displaySchemaName(type)} schema missing '${field}' field`,
            path: pagePath,
          });
        }
      }
    }

    if (type === 'faqpage') {
      const mainEntity = (schema as Record<string, unknown>).mainEntity;
      if (!Array.isArray(mainEntity) || mainEntity.length === 0) {
        results.push({
          severity: 'error',
          message: 'FAQPage schema has empty mainEntity array',
          path: pagePath,
        });
      }
    }
  }

  return dedupeResults(results);
}

function normalizePresetName(value: string): string {
  return value.toLowerCase();
}

function displaySchemaName(value: string): string {
  switch (value.toLowerCase()) {
    case 'website':
      return 'WebSite';
    case 'faqpage':
      return 'FAQPage';
    case 'webpage':
      return 'WebPage';
    case 'blogposting':
      return 'BlogPosting';
    case 'newsarticle':
      return 'NewsArticle';
    case 'softwareapplication':
      return 'SoftwareApplication';
    case 'profilepage':
      return 'ProfilePage';
    case 'collectionpage':
      return 'CollectionPage';
    default:
      return value
        .replace(/(^|[-_])([a-z])/g, (_match, _prefix, char) => char.toUpperCase());
  }
}

function isMissingValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return false;
}

function getTypeValues(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value.toLowerCase()];
  }

  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.toLowerCase());
  }

  return [];
}

function dedupeResults(results: ValidationResult[]): ValidationResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = `${result.severity}:${result.path ?? ''}:${result.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
