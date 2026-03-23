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

export interface AgentCardInterface {
  url: string;
  protocolBinding: string;
  protocolVersion: string;
  tenant?: string;
}

export interface AgentCardProvider {
  organization: string;
  url: string;
}

export interface AgentCardExtension {
  uri: string;
  description?: string;
  required?: boolean;
  params?: Record<string, unknown>;
}

export interface AgentCardCapabilities {
  streaming?: boolean;
  pushNotifications?: boolean;
  extensions?: AgentCardExtension[];
  extendedAgentCard?: boolean;
}

export type AgentCardSecurityScheme = Record<string, unknown>;
export type AgentCardSecurityRequirement = Record<string, string[]>;

export interface AgentCardSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
  security?: AgentCardSecurityRequirement[];
}

export interface AgentCardSignature {
  protected: string;
  signature: string;
  header?: Record<string, unknown>;
}

export interface AgentCard {
  name: string;
  description: string;
  supportedInterfaces: AgentCardInterface[];
  provider?: AgentCardProvider;
  version: string;
  documentationUrl?: string;
  capabilities: AgentCardCapabilities;
  securitySchemes?: Record<string, AgentCardSecurityScheme>;
  security?: AgentCardSecurityRequirement[];
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: AgentCardSkill[];
  signatures?: AgentCardSignature[];
  iconUrl?: string;
}

interface BaseAgentCardConfig {
  replaceExisting?: boolean;
  name?: string;
  description?: string;
  provider?: AgentCardProvider;
  documentationUrl?: string;
  capabilities?: AgentCardCapabilities;
  securitySchemes?: Record<string, AgentCardSecurityScheme>;
  security?: AgentCardSecurityRequirement[];
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  skills?: AgentCardSkill[];
  signatures?: AgentCardSignature[];
  iconUrl?: string;
}

export interface EnabledAgentCardConfig extends BaseAgentCardConfig {
  enabled?: true;
  supportedInterfaces: AgentCardInterface[];
  version: string;
}

export interface DisabledAgentCardConfig extends BaseAgentCardConfig {
  enabled: false;
  supportedInterfaces?: AgentCardInterface[];
  version?: string;
}

export type AgentCardConfig = EnabledAgentCardConfig | DisabledAgentCardConfig;

export interface LlmsFullTxtConfig {
  enabled?: boolean;
  replaceExisting?: boolean;
}

export interface ResolvedLlmsTxtEntry {
  title: string;
  description?: string;
  originalUrl: string;
  url: string;
  canonicalUrl: string;
  markdownUrl: string | null;
  sameSite: boolean;
  htmlLike: boolean;
}

export interface ResolvedLlmsTxtSection {
  title: string;
  entries: ResolvedLlmsTxtEntry[];
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
  agentCard?: AgentCardConfig;
  llmsTxt?: LlmsTxtConfig;
  llmsFullTxt?: LlmsFullTxtConfig;
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
