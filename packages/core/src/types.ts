/**
 * Core configuration types for agentmarkup adapters.
 */

export interface JsonLdBase {
  '@type'?: string;
  [key: string]: unknown;
}

export interface WebSiteSchema {
  preset: 'webSite';
  name: string;
  url: string;
  description?: string;
  searchAction?: {
    targetUrl: string;
    queryInput: string;
  };
}

export interface OrganizationSchema {
  preset: 'organization';
  name: string;
  url: string;
  logo?: string;
  description?: string;
  sameAs?: string[];
}

export interface ArticleSchema {
  preset: 'article';
  headline: string;
  url: string;
  datePublished: string;
  dateModified?: string;
  author: { name: string; url?: string } | string;
  description?: string;
  image?: string;
}

export interface FaqPageSchema {
  preset: 'faqPage';
  url: string;
  questions: Array<{
    question: string;
    answer: string;
  }>;
}

export interface ProductSchema {
  preset: 'product';
  name: string;
  url: string;
  description?: string;
  image?: string;
  sku?: string;
  brand?: string;
  offers?: OfferData | OfferData[];
}

export interface OfferData {
  price: number | string;
  priceCurrency: string;
  availability?: 'InStock' | 'OutOfStock' | 'PreOrder' | 'Discontinued';
  url?: string;
}

export interface OfferSchema {
  preset: 'offer';
  price: number | string;
  priceCurrency: string;
  availability?: 'InStock' | 'OutOfStock' | 'PreOrder' | 'Discontinued';
  url?: string;
  itemOffered?: {
    name: string;
    url?: string;
  };
}

export type SchemaPreset =
  | WebSiteSchema
  | OrganizationSchema
  | ArticleSchema
  | FaqPageSchema
  | ProductSchema
  | OfferSchema;

export interface CustomSchema {
  preset?: never;
  '@type': string;
  [key: string]: unknown;
}

export type SchemaConfig = SchemaPreset | CustomSchema;

export interface LlmsTxtEntry {
  title: string;
  url: string;
  description?: string;
}

export interface LlmsTxtSection {
  title: string;
  entries: LlmsTxtEntry[];
}

export interface LlmsTxtConfig {
  instructions?: string;
  sections: LlmsTxtSection[];
  replaceExisting?: boolean;
  preferMarkdownMirrors?: boolean;
}

export interface MarkdownPagesConfig {
  enabled?: boolean;
  replaceExisting?: boolean;
}

export type ContentSignalDirective = 'yes' | 'no';

export interface ContentSignalHeadersConfig {
  enabled?: boolean;
  replaceExisting?: boolean;
  path?: string;
  aiTrain?: ContentSignalDirective;
  search?: ContentSignalDirective;
  aiInput?: ContentSignalDirective;
}

export type CrawlerDirective = 'allow' | 'disallow';

export interface AiCrawlersConfig {
  GPTBot?: CrawlerDirective;
  ClaudeBot?: CrawlerDirective;
  PerplexityBot?: CrawlerDirective;
  'Google-Extended'?: CrawlerDirective;
  CCBot?: CrawlerDirective;
  [key: string]: CrawlerDirective | undefined;
}

export interface PageConfig {
  path: string;
  title?: string;
  schemas: SchemaConfig[];
}

export interface AgentMarkupConfig {
  site: string;
  name: string;
  description?: string;
  llmsTxt?: LlmsTxtConfig;
  markdownPages?: MarkdownPagesConfig;
  contentSignalHeaders?: ContentSignalHeadersConfig;
  jsonLd?: {
    replaceExistingTypes?: boolean;
  };
  globalSchemas?: SchemaConfig[];
  pages?: PageConfig[];
  aiCrawlers?: AiCrawlersConfig;
  validation?: {
    warnOnMissingSchema?: boolean;
    disabled?: boolean;
  };
}

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationResult {
  severity: ValidationSeverity;
  message: string;
  path?: string;
}
