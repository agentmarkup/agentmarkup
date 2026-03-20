/**
 * Core configuration types for @agentmarkup/vite
 */

// --- JSON-LD Types ---

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

// --- llms.txt Types ---

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
  /** Additional instructions block at the top */
  instructions?: string;
  /** Grouped sections of links */
  sections: LlmsTxtSection[];
}

// --- AI Crawler Types ---

export type CrawlerDirective = 'allow' | 'disallow';

export interface AiCrawlersConfig {
  GPTBot?: CrawlerDirective;
  ClaudeBot?: CrawlerDirective;
  PerplexityBot?: CrawlerDirective;
  'Google-Extended'?: CrawlerDirective;
  CCBot?: CrawlerDirective;
  /** Additional custom crawlers */
  [key: string]: CrawlerDirective | undefined;
}

// --- Page Config ---

export interface PageConfig {
  /** URL path (e.g., '/faq', '/products/wallets') */
  path: string;
  /** Page title for llms.txt if included */
  title?: string;
  /** JSON-LD schemas for this specific page */
  schemas: SchemaConfig[];
}

// --- Plugin Config ---

export interface AgentMarkupConfig {
  /** Site URL (e.g., 'https://example.com') */
  site: string;
  /** Site name */
  name: string;
  /** Site description */
  description?: string;

  /** llms.txt configuration */
  llmsTxt?: LlmsTxtConfig;

  /** JSON-LD schemas applied to all pages */
  globalSchemas?: SchemaConfig[];

  /** Per-page configuration */
  pages?: PageConfig[];

  /** AI crawler robots.txt directives */
  aiCrawlers?: AiCrawlersConfig;

  /** Validation options */
  validation?: {
    /** Warn on pages with no structured data (default: false) */
    warnOnMissingSchema?: boolean;
    /** Disable validation entirely (default: false) */
    disabled?: boolean;
  };
}

// --- Validation Types ---

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationResult {
  severity: ValidationSeverity;
  message: string;
  path?: string;
}
