export type {
  AgentMarkupConfig,
  JsonLdBase,
  SchemaConfig,
  SchemaPreset,
  CustomSchema,
  WebSiteSchema,
  OrganizationSchema,
  ArticleSchema,
  FaqPageSchema,
  ProductSchema,
  OfferSchema,
  OfferData,
  LlmsTxtConfig,
  LlmsTxtSection,
  LlmsTxtEntry,
  AgentCard,
  AgentCardConfig,
  EnabledAgentCardConfig,
  DisabledAgentCardConfig,
  AgentCardInterface,
  AgentCardProvider,
  AgentCardCapabilities,
  AgentCardExtension,
  AgentCardSecurityScheme,
  AgentCardSecurityRequirement,
  AgentCardSkill,
  AgentCardSignature,
  LlmsFullTxtConfig,
  ResolvedLlmsTxtEntry,
  ResolvedLlmsTxtSection,
  MarkdownPagesConfig,
  ContentSignalDirective,
  ContentSignalHeadersConfig,
  AiCrawlersConfig,
  CrawlerDirective,
  PageConfig,
  ValidationResult,
  ValidationSeverity,
} from './types.js';
export {
  collectSchemasForPage,
  filterJsonLdByExistingTypes,
  findExistingJsonLdTypes,
  hasExistingJsonLdScripts,
  extractJsonLdScriptContents,
  injectHeadContent,
  injectJsonLdTags,
  markdownFileNameFromHtmlFile,
  markdownHrefForPagePath,
  matchesPage,
  normalizePagePath,
} from './html.js';
export {
  A2A_AGENT_CARD_PATH,
  A2A_AGENT_CARD_FILE_NAME,
  buildAgentCard,
  generateAgentCard,
} from './generators/agent-card.js';
export {
  serializeJsonLd,
  generateJsonLdTags,
} from './generators/json-ld.js';
export {
  generatePageMarkdown,
  generateMarkdownAlternateLink,
} from './generators/markdown.js';
export {
  generateLlmsTxt,
  generateLlmsFullTxt,
  generateLlmsTxtDiscoveryLink,
  hasLlmsTxtDiscoveryLink,
  resolveLlmsTxtSections,
} from './generators/llms-txt.js';
export {
  generateCrawlerRules,
  patchRobotsTxt,
  findBlockedCrawlers,
} from './generators/robots-txt.js';
export {
  generateContentSignalHeaderValue,
  generateContentSignalHeaders,
  generateMarkdownCanonicalHeaders,
  patchHeadersFile,
  patchMarkdownCanonicalHeaders,
} from './generators/headers.js';
export type { MarkdownCanonicalHeaderEntry } from './generators/headers.js';
export {
  buildWebSite,
  buildOrganization,
  buildArticle,
  buildFaqPage,
  buildProduct,
  buildOffer,
  presetToJsonLd,
} from './presets/index.js';
export {
  validateAgentCard,
  validateAgentCardConfig,
  validateAgentCardJson,
} from './validation/agent-card.js';
export {
  validateSchema,
  validateExistingJsonLd,
  validateJsonLdNode,
} from './validation/schema.js';
export { validateRobotsTxt } from './validation/robots.js';
export { validateLlmsTxt } from './validation/llms-txt.js';
export { validateHtmlContent } from './validation/html.js';
export {
  validateMarkdownAlternateLink,
  validateMarkdownContent,
  validateLlmsTxtMarkdownCoverage,
} from './validation/markdown.js';
export { printReport } from './validation/reporter.js';
