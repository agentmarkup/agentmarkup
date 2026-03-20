import type { SchemaConfig, ValidationResult } from '../types.js';

const REQUIRED_FIELDS: Record<string, string[]> = {
  webSite: ['name', 'url'],
  organization: ['name', 'url'],
  article: ['headline', 'url', 'datePublished', 'author'],
  faqPage: ['url', 'questions'],
  product: ['name', 'url'],
  offer: ['price', 'priceCurrency'],
};

const RECOMMENDED_FIELDS: Record<string, string[]> = {
  organization: ['logo'],
  article: ['description', 'image'],
  product: ['description', 'sku', 'offers'],
  offer: ['availability'],
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

    return results;
  }

  const required = REQUIRED_FIELDS[schema.preset];
  if (required) {
    for (const field of required) {
      const value = getSchemaField(schema, field);
      if (value === undefined || value === null || value === '') {
        results.push({
          severity: 'error',
          message: `${schema.preset} schema missing required field '${field}'`,
          path: pagePath,
        });
      }
    }
  }

  const recommended = RECOMMENDED_FIELDS[schema.preset];
  if (recommended) {
    for (const field of recommended) {
      const value = getSchemaField(schema, field);
      if (value === undefined || value === null || value === '') {
        results.push({
          severity: 'warning',
          message: `${schema.preset} schema missing '${field}' field`,
          path: pagePath,
        });
      }
    }
  }

  if (schema.preset === 'faqPage' && schema.questions?.length === 0) {
    results.push({
      severity: 'error',
      message: 'faqPage schema has empty questions array',
      path: pagePath,
    });
  }

  return results;
}

function getSchemaField(schema: SchemaConfig, field: string): unknown {
  return (schema as unknown as Record<string, unknown>)[field];
}
