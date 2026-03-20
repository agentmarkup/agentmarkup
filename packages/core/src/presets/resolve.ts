import type { SchemaConfig, JsonLdBase } from '../types.js';
import { buildWebSite, buildOrganization, buildArticle, buildFaqPage } from './website.js';
import { buildProduct, buildOffer } from './ecommerce.js';

export function presetToJsonLd(config: SchemaConfig): JsonLdBase {
  if (!('preset' in config) || !config.preset) {
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
      const exhaustive: never = config;
      throw new Error(`Unknown preset: ${(exhaustive as SchemaConfig & { preset: string }).preset}`);
    }
  }
}
