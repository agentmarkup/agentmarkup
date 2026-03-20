import type {
  WebSiteSchema,
  OrganizationSchema,
  ArticleSchema,
  FaqPageSchema,
  JsonLdBase,
} from '../types.js';

export function buildWebSite(config: WebSiteSchema): JsonLdBase {
  const schema: JsonLdBase = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: config.name,
    url: config.url,
  };

  if (config.description) {
    schema.description = config.description;
  }

  if (config.searchAction) {
    schema.potentialAction = {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: config.searchAction.targetUrl,
      },
      'query-input': config.searchAction.queryInput,
    };
  }

  return schema;
}

export function buildOrganization(config: OrganizationSchema): JsonLdBase {
  const schema: JsonLdBase = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: config.name,
    url: config.url,
  };

  if (config.logo) {
    schema.logo = config.logo;
  }

  if (config.description) {
    schema.description = config.description;
  }

  if (config.sameAs) {
    schema.sameAs = config.sameAs;
  }

  return schema;
}

export function buildArticle(config: ArticleSchema): JsonLdBase {
  const author =
    typeof config.author === 'string'
      ? { '@type': 'Person', name: config.author }
      : { '@type': 'Person', name: config.author.name, url: config.author.url };

  const schema: JsonLdBase = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: config.headline,
    url: config.url,
    datePublished: config.datePublished,
    author,
  };

  if (config.dateModified) {
    schema.dateModified = config.dateModified;
  }

  if (config.description) {
    schema.description = config.description;
  }

  if (config.image) {
    schema.image = config.image;
  }

  return schema;
}

export function buildFaqPage(config: FaqPageSchema): JsonLdBase {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    url: config.url,
    mainEntity: config.questions.map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: q.answer,
      },
    })),
  };
}
