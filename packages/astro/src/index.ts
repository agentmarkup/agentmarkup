import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import {
  collectSchemasForPage,
  filterJsonLdByExistingTypes,
  generateLlmsFullTxt,
  generateLlmsTxtDiscoveryLink,
  generateMarkdownAlternateLink,
  generatePageMarkdown,
  generateJsonLdTags,
  generateLlmsTxt,
  hasLlmsTxtDiscoveryLink,
  hasExistingJsonLdScripts,
  injectHeadContent,
  injectJsonLdTags,
  markdownFileNameFromHtmlFile,
  patchMarkdownCanonicalHeaders,
  patchHeadersFile,
  normalizePagePath,
  patchRobotsTxt,
  presetToJsonLd,
  printReport,
  resolveLlmsTxtSections,
  validateExistingJsonLd,
  validateHtmlContent,
  validateLlmsTxt,
  validateLlmsTxtMarkdownCoverage,
  validateMarkdownAlternateLink,
  validateMarkdownContent,
  validateRobotsTxt,
  validateSchema,
} from '@agentmarkup/core';
import type {
  AgentMarkupConfig,
  MarkdownCanonicalHeaderEntry,
  ValidationResult,
} from '@agentmarkup/core';

export * from '@agentmarkup/core';

export function agentmarkup(config: AgentMarkupConfig): AstroIntegration {
  const validationResults: ValidationResult[] = [];
  let llmsTxtEntries = 0;
  let llmsTxtSections = 0;
  let llmsTxtStatus: 'generated' | 'preserved' | 'none' = 'none';
  let llmsFullTxtEntries = 0;
  let llmsFullTxtStatus: 'generated' | 'preserved' | 'none' = 'none';
  let jsonLdPages = 0;
  let markdownPages = 0;
  let markdownPagesStatus: 'generated' | 'preserved' | 'none' = 'none';
  let markdownCanonicalHeadersCount = 0;
  let markdownCanonicalHeadersStatus: 'generated' | 'preserved' | 'none' = 'none';
  let crawlersConfigured = 0;
  let robotsTxtStatus: 'patched' | 'preserved' | 'none' = 'none';
  let contentSignalHeadersStatus: 'generated' | 'preserved' | 'none' = 'none';
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
        const resolvedLlmsSections = resolveLlmsTxtSections(config);
        const markdownByUrl: Record<string, string> = {};
        const availableMarkdownUrls = new Set<string>();
        const advertiseLlmsTxt =
          Boolean(config.llmsTxt) ||
          Boolean(publicDir && existsSync(join(publicDir, 'llms.txt')));

        for (const htmlFile of htmlFiles) {
          const pagePath = pagePathFromOutputFile(outDir, htmlFile);
          const html = await readFile(htmlFile, 'utf8');
          let nextHtml = html;
          const schemas = collectSchemasForPage(config, pagePath);
          const hasExistingJsonLd = hasExistingJsonLdScripts(nextHtml);

          if (!config.validation?.disabled) {
            validationResults.push(...validateHtmlContent(nextHtml, pagePath));
            validationResults.push(...validateExistingJsonLd(nextHtml, pagePath));
          }

          if (advertiseLlmsTxt && !hasLlmsTxtDiscoveryLink(nextHtml)) {
            nextHtml = injectHeadContent(nextHtml, generateLlmsTxtDiscoveryLink());
          }

          if (
            isFeatureEnabled(config.markdownPages) &&
            pagePath &&
            !hasMarkdownAlternateLink(nextHtml)
          ) {
            nextHtml = injectHeadContent(
              nextHtml,
              generateMarkdownAlternateLink(pagePath)
            );
          }

          if (
            isFeatureEnabled(config.markdownPages) &&
            !config.validation?.disabled
          ) {
            validationResults.push(...validateMarkdownAlternateLink(nextHtml, pagePath));
          }

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

            if (nextHtml !== html) {
              await writeFile(htmlFile, nextHtml, 'utf8');
            }
            continue;
          }

          const jsonLdObjects = schemas.map(presetToJsonLd);
          const injectables = config.jsonLd?.replaceExistingTypes
            ? jsonLdObjects
            : filterJsonLdByExistingTypes(jsonLdObjects, nextHtml);

          if (!config.validation?.disabled) {
            for (const schema of schemas) {
              validationResults.push(...validateSchema(schema, pagePath));
            }
          }

          if (injectables.length === 0) {
            if (nextHtml !== html) {
              await writeFile(htmlFile, nextHtml, 'utf8');
            }
            continue;
          }

          const tags = generateJsonLdTags(injectables);
          nextHtml = injectJsonLdTags(nextHtml, tags);
          await writeFile(htmlFile, nextHtml, 'utf8');
          jsonLdPages += 1;
        }

        if (isFeatureEnabled(config.markdownPages)) {
          let preservedMarkdownPages = 0;
          const markdownCanonicalEntries: MarkdownCanonicalHeaderEntry[] = [];

          for (const htmlFile of htmlFiles) {
            const relativeHtmlPath = relative(outDir, htmlFile).replace(/\\/g, '/');
            const markdownFileName = markdownFileNameFromHtmlFile(relativeHtmlPath);
            const outputMarkdownPath = join(outDir, markdownFileName);
            const html = await readFile(htmlFile, 'utf8');
            const pagePath = pagePathFromOutputFile(outDir, htmlFile);
            const markdownAbsoluteUrl = buildAbsoluteMarkdownUrl(config.site, pagePath);
            const markdown = generatePageMarkdown({
              html,
              pagePath,
              siteUrl: config.site,
            });

            if (!markdown) {
              continue;
            }

            const existingOutputMarkdown = await readTextFileIfExists(outputMarkdownPath);
            const existingMarkdown =
              existingOutputMarkdown ??
              (publicDir
                ? await readTextFileIfExists(join(publicDir, markdownFileName))
                : null);

            if (existingMarkdown && !config.markdownPages?.replaceExisting) {
              preservedMarkdownPages += 1;
              markdownByUrl[markdownAbsoluteUrl] = existingMarkdown;
              availableMarkdownUrls.add(markdownAbsoluteUrl);
              markdownCanonicalEntries.push({
                markdownPath: `/${markdownFileName}`,
                canonicalUrl: buildCanonicalUrl(config.site, pagePath),
              });

              if (!config.validation?.disabled) {
                validationResults.push(
                  ...validateMarkdownContent(existingMarkdown, pagePath)
                );
              }

              if (!existingOutputMarkdown) {
                await writeFile(outputMarkdownPath, existingMarkdown, 'utf8');
              }
              continue;
            }

            await writeFile(outputMarkdownPath, markdown, 'utf8');
            markdownByUrl[markdownAbsoluteUrl] = markdown;
            availableMarkdownUrls.add(markdownAbsoluteUrl);
            markdownCanonicalEntries.push({
              markdownPath: `/${markdownFileName}`,
              canonicalUrl: buildCanonicalUrl(config.site, pagePath),
            });
            if (!config.validation?.disabled) {
              validationResults.push(...validateMarkdownContent(markdown, pagePath));
            }
            markdownPages += 1;
          }

          markdownPagesStatus =
            markdownPages > 0
              ? 'generated'
              : preservedMarkdownPages > 0
                ? 'preserved'
                : 'none';

          if (markdownCanonicalEntries.length > 0) {
            const outputHeadersPath = join(outDir, '_headers');
            const existingOutputHeaders = await readTextFileIfExists(outputHeadersPath);
            const existingHeaders =
              existingOutputHeaders ??
              (publicDir ? await readTextFileIfExists(join(publicDir, '_headers')) : null);

            const patchedHeaders = patchMarkdownCanonicalHeaders(
              existingHeaders,
              markdownCanonicalEntries
            );
            const preserved =
              existingHeaders !== null &&
              patchedHeaders === ensureTrailingNewline(existingHeaders);

            markdownCanonicalHeadersCount = markdownCanonicalEntries.length;
            markdownCanonicalHeadersStatus = preserved ? 'preserved' : 'generated';

            if (!preserved || !existingOutputFileExists(outputHeadersPath)) {
              await writeFile(outputHeadersPath, patchedHeaders, 'utf8');
            }
          }

          if (!config.validation?.disabled && resolvedLlmsSections.length > 0) {
            validationResults.push(
              ...validateLlmsTxtMarkdownCoverage(
                resolvedLlmsSections,
                availableMarkdownUrls
              )
            );
          }
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

        if (config.llmsFullTxt?.enabled) {
          const llmsFullTxtContent = generateLlmsFullTxt(config, {
            contentByUrl: markdownByUrl,
          });

          if (llmsFullTxtContent) {
            const outputLlmsFullPath = join(outDir, 'llms-full.txt');
            const inlineEntries = countInlinedLlmsFullEntries(
              resolvedLlmsSections,
              markdownByUrl
            );
            const existingOutputLlmsFull = await readTextFileIfExists(outputLlmsFullPath);
            const existingLlmsFull =
              existingOutputLlmsFull ??
              (publicDir
                ? await readTextFileIfExists(join(publicDir, 'llms-full.txt'))
                : null);

            if (existingLlmsFull && !config.llmsFullTxt.replaceExisting) {
              llmsFullTxtStatus = 'preserved';

              if (!existingOutputLlmsFull) {
                await writeFile(outputLlmsFullPath, existingLlmsFull, 'utf8');
              }

              if (!config.validation?.disabled) {
                validationResults.push(...validateLlmsTxt(existingLlmsFull));
              }
            } else {
              llmsFullTxtStatus = 'generated';
              llmsFullTxtEntries = inlineEntries;

              await writeFile(outputLlmsFullPath, llmsFullTxtContent, 'utf8');

              if (!config.validation?.disabled) {
                validationResults.push(...validateLlmsTxt(llmsFullTxtContent));
              }
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

        if (isFeatureEnabled(config.contentSignalHeaders)) {
          const outputHeadersPath = join(outDir, '_headers');
          const existingOutputHeaders = await readTextFileIfExists(outputHeadersPath);
          const existingHeaders =
            existingOutputHeaders ??
            (publicDir ? await readTextFileIfExists(join(publicDir, '_headers')) : null);

          const patchedHeaders = patchHeadersFile(
            existingHeaders,
            config.contentSignalHeaders
          );
          const preserved =
            existingHeaders !== null &&
            patchedHeaders === ensureTrailingNewline(existingHeaders);

          contentSignalHeadersStatus = preserved ? 'preserved' : 'generated';

          if (!preserved || !existingOutputFileExists(outputHeadersPath)) {
            await writeFile(outputHeadersPath, patchedHeaders, 'utf8');
          }
        }

        printReport({
          label: '@agentmarkup/astro',
          llmsTxtEntries,
          llmsTxtSections,
          llmsTxtStatus,
          llmsFullTxtEntries,
          llmsFullTxtStatus,
          jsonLdPages,
          markdownPages,
          markdownPagesStatus,
          markdownCanonicalHeadersCount,
          markdownCanonicalHeadersStatus,
          crawlersConfigured,
          robotsTxtStatus,
          contentSignalHeadersStatus,
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

function buildCanonicalUrl(siteUrl: string, pagePath: string): string {
  const base = siteUrl.replace(/\/$/, '');
  return pagePath === '/' ? `${base}/` : `${base}${pagePath}`;
}

function buildAbsoluteMarkdownUrl(siteUrl: string, pagePath: string): string {
  const base = siteUrl.replace(/\/$/, '');
  return pagePath === '/' ? `${base}/index.md` : `${base}${pagePath}.md`;
}

function countInlinedLlmsFullEntries(
  sections: ReturnType<typeof resolveLlmsTxtSections>,
  markdownByUrl: Record<string, string>
): number {
  return sections.reduce(
    (sum, section) =>
      sum +
      section.entries.filter(
        (entry) => Boolean(entry.markdownUrl && markdownByUrl[entry.markdownUrl])
      ).length,
    0
  );
}

function existingOutputFileExists(filePath: string): boolean {
  return existsSync(filePath);
}

function isFeatureEnabled(
  config: { enabled?: boolean } | undefined
): boolean {
  return Boolean(config && config.enabled !== false);
}

function hasMarkdownAlternateLink(html: string): boolean {
  return /<link\b[^>]*rel=(['"])alternate\1[^>]*type=(['"])text\/markdown\2/i.test(
    html
  );
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}
