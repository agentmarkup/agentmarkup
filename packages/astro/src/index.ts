import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import {
  collectSchemasForPage,
  filterJsonLdByExistingTypes,
  generateJsonLdTags,
  generateLlmsTxt,
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

export * from '@agentmarkup/core';

export function agentmarkup(config: AgentMarkupConfig): AstroIntegration {
  const validationResults: ValidationResult[] = [];
  let llmsTxtEntries = 0;
  let llmsTxtSections = 0;
  let llmsTxtStatus: 'generated' | 'preserved' | 'none' = 'none';
  let jsonLdPages = 0;
  let crawlersConfigured = 0;
  let robotsTxtStatus: 'patched' | 'preserved' | 'none' = 'none';
  let publicDir: string | undefined;

  return {
    name: 'agentmarkup',
    hooks: {
      'astro:config:done': ({ config: resolvedConfig }) => {
        publicDir = fileURLToPath(resolvedConfig.publicDir);
      },

      'astro:build:done': async ({ dir }) => {
        const outDir = fileURLToPath(dir);
        const htmlFiles = await findHtmlFiles(outDir);

        for (const htmlFile of htmlFiles) {
          const pagePath = pagePathFromOutputFile(outDir, htmlFile);
          const html = await readFile(htmlFile, 'utf8');
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

            continue;
          }

          const jsonLdObjects = schemas.map(presetToJsonLd);
          const injectables = config.jsonLd?.replaceExistingTypes
            ? jsonLdObjects
            : filterJsonLdByExistingTypes(jsonLdObjects, html);

          if (!config.validation?.disabled) {
            for (const schema of schemas) {
              validationResults.push(...validateSchema(schema, pagePath));
            }
          }

          if (injectables.length === 0) {
            continue;
          }

          const tags = generateJsonLdTags(injectables);
          await writeFile(htmlFile, injectJsonLdTags(html, tags), 'utf8');
          jsonLdPages += 1;
        }

        const llmsTxtContent = generateLlmsTxt(config);
        if (llmsTxtContent) {
          const outputLlmsPath = join(outDir, 'llms.txt');
          const existingOutputLlms = await readTextFileIfExists(outputLlmsPath);
          const existingLlms =
            existingOutputLlms ??
            (publicDir ? await readTextFileIfExists(join(publicDir, 'llms.txt')) : null);

          if (existingLlms && !config.llmsTxt?.replaceExisting) {
            llmsTxtStatus = 'preserved';

            if (!existingOutputLlms) {
              await writeFile(outputLlmsPath, existingLlms, 'utf8');
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

            await writeFile(outputLlmsPath, llmsTxtContent, 'utf8');

            if (!config.validation?.disabled) {
              validationResults.push(...validateLlmsTxt(llmsTxtContent));
            }
          }
        }

        if (config.aiCrawlers) {
          const crawlerEntries = Object.entries(config.aiCrawlers).filter(
            ([, value]) => value !== undefined
          );
          crawlersConfigured = crawlerEntries.length;

          let existingRobots = await readTextFileIfExists(join(outDir, 'robots.txt'));
          if (!existingRobots && publicDir) {
            existingRobots = await readTextFileIfExists(join(publicDir, 'robots.txt'));
          }

          if (existingRobots && !config.validation?.disabled) {
            validationResults.push(
              ...validateRobotsTxt(existingRobots, config.aiCrawlers)
            );
          }

          const patched = patchRobotsTxt(existingRobots, config.aiCrawlers);
          const preserved = existingRobots !== null && patched === existingRobots;
          robotsTxtStatus = preserved ? 'preserved' : 'patched';

          const outputRobotsPath = join(outDir, 'robots.txt');
          if (!preserved || !existingOutputFileExists(outputRobotsPath)) {
            await writeFile(outputRobotsPath, patched, 'utf8');
          }
        }

        printReport({
          label: '@agentmarkup/astro',
          llmsTxtEntries,
          llmsTxtSections,
          llmsTxtStatus,
          jsonLdPages,
          crawlersConfigured,
          robotsTxtStatus,
          validationResults,
        });
      },
    },
  };
}

async function readTextFileIfExists(filePath: string): Promise<string | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  return readFile(filePath, 'utf8');
}

async function findHtmlFiles(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const htmlFiles: string[] = [];

  for (const entry of entries) {
    const entryPath = join(rootDir, entry.name);

    if (entry.isDirectory()) {
      htmlFiles.push(...(await findHtmlFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.html')) {
      htmlFiles.push(entryPath);
    }
  }

  return htmlFiles.sort();
}

function pagePathFromOutputFile(outDir: string, filePath: string): string {
  const relativePath = relative(outDir, filePath).replace(/\\/g, '/');
  const candidatePath = relativePath === 'index.html' ? '/' : `/${relativePath}`;
  return normalizePagePath(candidatePath);
}

function existingOutputFileExists(filePath: string): boolean {
  return existsSync(filePath);
}
