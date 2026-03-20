import type { SchemaConfig, JsonLdBase } from '../types.js';
import { buildWebSite, buildOrganization, buildArticle, buildFaqPage } from './website.js';
import { buildProduct, buildOffer } from './ecommerce.js';

/**
 * Resolve a schema config (preset or custom) to a JSON-LD object.
 */
export function presetToJsonLd(config: SchemaConfig): JsonLdBase {
  if (!('preset' in config) || !config.preset) {
    // Custom schema — pass through as-is with @context
    return { '@context': 'https://schema.org', ...config };
  }

  switch (config.preset) {
    case 'webSite':
      return buildWebSite(config);
    case 'organization':
      return buildOrganization(config);
    case 'article':
      return buildArticle(config);
    case 'faqPage':
      return buildFaqPage(config);
    case 'product':
      return buildProduct(config);
    case 'offer':
      return buildOffer(config);
    default: {
      const _exhaustive: never = config;
      throw new Error(`Unknown preset: ${(_exhaustive as SchemaConfig & { preset: string }).preset}`);
    }
  }
}
