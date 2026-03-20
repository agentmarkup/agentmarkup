import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import {
  collectSchemasForPage,
  filterJsonLdByExistingTypes,
  generateLlmsTxt,
  generateJsonLdTags,
  hasExistingJsonLdScripts,
  injectJsonLdTags,
  normalizePagePath,
  patchRobotsTxt,
  presetToJsonLd,
  printReport,
  validateLlmsTxt,
  validateRobotsTxt,
  validateSchema,
} from '@agentmarkup/core';
import type { AgentMarkupConfig, ValidationResult } from '@agentmarkup/core';

export function agentmarkup(config: AgentMarkupConfig): Plugin {
  const validationResults: ValidationResult[] = [];
  let llmsTxtContent: string | null = null;
  let llmsTxtEntries = 0;
  let llmsTxtSections = 0;
  let llmsTxtStatus: 'generated' | 'preserved' | 'none' = 'none';
  let jsonLdPages = 0;
  let crawlersConfigured = 0;
  let robotsTxtStatus: 'patched' | 'preserved' | 'none' = 'none';
  let publicDir: string | undefined;
  let isSsrBuild = false;

  return {
    name: 'agentmarkup',
    enforce: 'post',

    configResolved(resolvedConfig) {
      publicDir = resolvedConfig.publicDir;
      isSsrBuild = Boolean(resolvedConfig.build.ssr);
    },

    /**
     * Inject JSON-LD into HTML pages during build.
     */
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (isSsrBuild) {
          return html;
        }

        const pagePath = resolvePagePath(ctx.path);
        const schemas = collectSchemasForPage(config, pagePath);
        const hasExistingJsonLd = hasExistingJsonLdScripts(html);

        if (schemas.length === 0) {
          if (
            pagePath &&
            config.validation?.warnOnMissingSchema &&
            !config.validation.disabled &&
            !hasExistingJsonLd
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
        const injectables = config.jsonLd?.replaceExistingTypes
          ? jsonLdObjects
          : filterJsonLdByExistingTypes(jsonLdObjects, html);

        // Validate schemas
        if (!config.validation?.disabled) {
          for (const schema of schemas) {
            const results = validateSchema(schema, pagePath);
            validationResults.push(...results);
          }
        }

        if (injectables.length === 0) {
          return html;
        }

        const tags = generateJsonLdTags(injectables);
        jsonLdPages++;

        return injectJsonLdTags(html, tags);
      },
    },

    /**
     * Generate llms.txt and patch robots.txt in the build output.
     */
    generateBundle(_, bundle) {
      if (isSsrBuild) {
        return;
      }

      // Generate llms.txt
      llmsTxtContent = generateLlmsTxt(config);
      if (llmsTxtContent) {
        let existingLlms: string | null = null;
        let existingLlmsFromBundle = false;

        for (const [fileName, asset] of Object.entries(bundle)) {
          if (fileName === 'llms.txt' && asset.type === 'asset') {
            existingLlms =
              typeof asset.source === 'string'
                ? asset.source
                : new TextDecoder().decode(asset.source);
            existingLlmsFromBundle = true;
            break;
          }
        }

        if (!existingLlms && publicDir) {
          const publicLlmsPath = join(publicDir, 'llms.txt');
          if (existsSync(publicLlmsPath)) {
            existingLlms = readFileSync(publicLlmsPath, 'utf8');
          }
        }

        if (existingLlms && !config.llmsTxt?.replaceExisting) {
          llmsTxtStatus = 'preserved';

          if (!existingLlmsFromBundle) {
            this.emitFile({
              type: 'asset',
              fileName: 'llms.txt',
              source: existingLlms,
            });
          }

          if (!config.validation?.disabled) {
            validationResults.push(...validateLlmsTxt(existingLlms));
          }
        } else {
          llmsTxtStatus = 'generated';
          llmsTxtSections = config.llmsTxt?.sections.length ?? 0;
          llmsTxtEntries = config.llmsTxt?.sections.reduce(
            (sum, section) => sum + section.entries.length,
            0
          ) ?? 0;

          if (existingLlmsFromBundle) {
            delete bundle['llms.txt'];
          }

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
      }

      // Handle robots.txt
      if (config.aiCrawlers) {
        const crawlerEntries = Object.entries(config.aiCrawlers).filter(
          ([, v]) => v !== undefined
        );
        crawlersConfigured = crawlerEntries.length;

        // Check for existing robots.txt in bundle
        let existingRobots: string | null = null;
        let existingRobotsFromBundle = false;
        for (const [fileName, asset] of Object.entries(bundle)) {
          if (fileName === 'robots.txt' && asset.type === 'asset') {
            existingRobots =
              typeof asset.source === 'string'
                ? asset.source
                : new TextDecoder().decode(asset.source);
            existingRobotsFromBundle = true;
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
        const preserved = existingRobots !== null && patched === existingRobots;
        robotsTxtStatus = preserved ? 'preserved' : 'patched';

        if (preserved) {
          if (!existingRobotsFromBundle && existingRobots) {
            this.emitFile({
              type: 'asset',
              fileName: 'robots.txt',
              source: existingRobots,
            });
          }
        } else {
          if (existingRobotsFromBundle) {
            delete bundle['robots.txt'];
          }

          this.emitFile({
            type: 'asset',
            fileName: 'robots.txt',
            source: patched,
          });
        }
      }
    },

    /**
     * Print validation report after build completes.
     */
    closeBundle() {
      if (isSsrBuild) {
        return;
      }

      printReport({
        label: '@agentmarkup/vite',
        llmsTxtEntries,
        llmsTxtSections,
        llmsTxtStatus,
        jsonLdPages,
        crawlersConfigured,
        robotsTxtStatus,
        validationResults,
      });
    },
  };
}

/**
 * Normalize a served route path to the configured page format.
 */
function resolvePagePath(servedPath: string | undefined): string | undefined {
  if (!servedPath) return undefined;
  return normalizePagePath(servedPath);
}
