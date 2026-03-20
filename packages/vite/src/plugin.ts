import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import type { AgentMarkupConfig, ValidationResult } from './types.js';
import { generateLlmsTxt } from './generators/llms-txt.js';
import { generateJsonLdTags } from './generators/json-ld.js';
import { patchRobotsTxt } from './generators/robots-txt.js';
import { presetToJsonLd } from './presets/resolve.js';
import { validateSchema } from './validation/schema.js';
import { validateRobotsTxt } from './validation/robots.js';
import { validateLlmsTxt } from './validation/llms-txt.js';
import { printReport } from './validation/reporter.js';

export function agentmarkup(config: AgentMarkupConfig): Plugin {
  const validationResults: ValidationResult[] = [];
  let llmsTxtContent: string | null = null;
  let llmsTxtEntries = 0;
  let llmsTxtSections = 0;
  let jsonLdPages = 0;
  let crawlersConfigured = 0;
  let publicDir: string | undefined;

  return {
    name: 'agentmarkup',
    enforce: 'post',

    configResolved(resolvedConfig) {
      publicDir = resolvedConfig.publicDir;
    },

    /**
     * Inject JSON-LD into HTML pages during build.
     */
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const pagePath = resolvePagePath(ctx.path);
        const schemas = collectSchemasForPage(config, pagePath);

        if (schemas.length === 0) {
          if (
            pagePath &&
            config.validation?.warnOnMissingSchema &&
            !config.validation.disabled
          ) {
            validationResults.push({
              severity: 'warning',
              message: 'No structured data configured for this page',
              path: pagePath,
            });
          }

          return html;
        }

        const jsonLdObjects = schemas.map(presetToJsonLd);

        // Validate schemas
        if (!config.validation?.disabled) {
          for (const schema of schemas) {
            const results = validateSchema(schema, pagePath);
            validationResults.push(...results);
          }
        }

        const tags = generateJsonLdTags(jsonLdObjects);
        jsonLdPages++;

        // Inject before </head>
        return html.replace('</head>', `${tags}\n</head>`);
      },
    },

    /**
     * Generate llms.txt and patch robots.txt in the build output.
     */
    generateBundle(_, bundle) {
      // Generate llms.txt
      llmsTxtContent = generateLlmsTxt(config);
      if (llmsTxtContent) {
        llmsTxtSections = config.llmsTxt?.sections.length ?? 0;
        llmsTxtEntries = config.llmsTxt?.sections.reduce(
          (sum, s) => sum + s.entries.length,
          0
        ) ?? 0;

        this.emitFile({
          type: 'asset',
          fileName: 'llms.txt',
          source: llmsTxtContent,
        });

        // Validate llms.txt
        if (!config.validation?.disabled) {
          validationResults.push(...validateLlmsTxt(llmsTxtContent));
        }
      }

      // Handle robots.txt
      if (config.aiCrawlers) {
        const crawlerEntries = Object.entries(config.aiCrawlers).filter(
          ([, v]) => v !== undefined
        );
        crawlersConfigured = crawlerEntries.length;

        // Check for existing robots.txt in bundle
        let existingRobots: string | null = null;
        for (const [fileName, asset] of Object.entries(bundle)) {
          if (fileName === 'robots.txt' && asset.type === 'asset') {
            existingRobots =
              typeof asset.source === 'string'
                ? asset.source
                : new TextDecoder().decode(asset.source);

            // Remove old and emit patched
            delete bundle[fileName];
            break;
          }
        }

        if (!existingRobots && publicDir) {
          const publicRobotsPath = join(publicDir, 'robots.txt');
          if (existsSync(publicRobotsPath)) {
            existingRobots = readFileSync(publicRobotsPath, 'utf8');
          }
        }

        if (existingRobots && !config.validation?.disabled) {
          validationResults.push(
            ...validateRobotsTxt(existingRobots, config.aiCrawlers)
          );
        }

        const patched = patchRobotsTxt(existingRobots, config.aiCrawlers);
        this.emitFile({
          type: 'asset',
          fileName: 'robots.txt',
          source: patched,
        });
      }
    },

    /**
     * Print validation report after build completes.
     */
    closeBundle() {
      printReport({
        llmsTxtEntries,
        llmsTxtSections,
        jsonLdPages,
        crawlersConfigured,
        validationResults,
      });
    },
  };
}

/**
 * Collect all schemas that apply to a given HTML page.
 */
function collectSchemasForPage(
  config: AgentMarkupConfig,
  pagePath: string | undefined
) {
  const schemas = [...(config.globalSchemas ?? [])];

  if (config.pages && pagePath) {
    for (const page of config.pages) {
      if (matchesPage(pagePath, page.path)) {
        schemas.push(...page.schemas);
      }
    }
  }

  return schemas;
}

/**
 * Normalize a served route path to the configured page format.
 */
function resolvePagePath(servedPath: string | undefined): string | undefined {
  if (!servedPath) return undefined;
  return normalizePagePath(servedPath);
}

function normalizePagePath(path: string): string {
  const cleanPath = path.split(/[?#]/, 1)[0];
  const withoutIndex = cleanPath.replace(/\/index\.html$/i, '/');
  const withoutHtml = withoutIndex.replace(/\.html$/i, '');

  if (withoutHtml === '' || withoutHtml === '/') {
    return '/';
  }

  return withoutHtml.endsWith('/') ? withoutHtml.slice(0, -1) : withoutHtml;
}

/**
 * Match a page path against a configured path.
 */
function matchesPage(actual: string, configured: string): boolean {
  return normalizePagePath(actual) === normalizePagePath(configured);
}
