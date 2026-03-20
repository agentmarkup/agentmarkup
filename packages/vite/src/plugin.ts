import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve as resolvePath } from 'node:path';
import type { Plugin } from 'vite';
import {
  collectSchemasForPage,
  filterJsonLdByExistingTypes,
  generateMarkdownAlternateLink,
  generatePageMarkdown,
  generateLlmsTxt,
  generateJsonLdTags,
  hasExistingJsonLdScripts,
  injectHeadContent,
  injectJsonLdTags,
  markdownFileNameFromHtmlFile,
  normalizePagePath,
  patchMarkdownCanonicalHeaders,
  patchHeadersFile,
  patchRobotsTxt,
  presetToJsonLd,
  printReport,
  validateExistingJsonLd,
  validateHtmlContent,
  validateLlmsTxt,
  validateRobotsTxt,
  validateSchema,
} from '@agentmarkup/core';
import type {
  AgentMarkupConfig,
  MarkdownCanonicalHeaderEntry,
  ValidationResult,
} from '@agentmarkup/core';

interface AssetLike {
  type: 'asset';
  source: string | Uint8Array;
}

export function agentmarkup(config: AgentMarkupConfig): Plugin {
  const validationResults: ValidationResult[] = [];
  let llmsTxtContent: string | null = null;
  let llmsTxtEntries = 0;
  let llmsTxtSections = 0;
  let llmsTxtStatus: 'generated' | 'preserved' | 'none' = 'none';
  let jsonLdPages = 0;
  let markdownPages = 0;
  let markdownPagesStatus: 'generated' | 'preserved' | 'none' = 'none';
  let markdownCanonicalHeadersCount = 0;
  let markdownCanonicalHeadersStatus: 'generated' | 'preserved' | 'none' = 'none';
  let crawlersConfigured = 0;
  let robotsTxtStatus: 'patched' | 'preserved' | 'none' = 'none';
  let contentSignalHeadersStatus: 'generated' | 'preserved' | 'none' = 'none';
  let pendingMarkdownCanonicalEntries: MarkdownCanonicalHeaderEntry[] = [];
  let publicDir: string | undefined;
  let outDir: string | undefined;
  let writesBuildOutput = true;
  let isSsrBuild = false;

  return {
    name: 'agentmarkup',
    enforce: 'post',

    configResolved(resolvedConfig) {
      publicDir = resolvedConfig.publicDir;
      outDir =
        resolvedConfig.root && resolvedConfig.build.outDir
          ? resolvePath(resolvedConfig.root, resolvedConfig.build.outDir)
          : undefined;
      writesBuildOutput =
        Boolean(resolvedConfig.root && resolvedConfig.build.outDir) &&
        resolvedConfig.build.write !== false;
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
        let nextHtml = html;
        const hasExistingJsonLd = hasExistingJsonLdScripts(nextHtml);

        if (!config.validation?.disabled) {
          validationResults.push(...validateExistingJsonLd(nextHtml, pagePath));
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

          return nextHtml;
        }

        const jsonLdObjects = schemas.map(presetToJsonLd);
        const injectables = config.jsonLd?.replaceExistingTypes
          ? jsonLdObjects
          : filterJsonLdByExistingTypes(jsonLdObjects, nextHtml);

        // Validate schemas
        if (!config.validation?.disabled) {
          for (const schema of schemas) {
            const results = validateSchema(schema, pagePath);
            validationResults.push(...results);
          }
        }

        if (injectables.length === 0) {
          return nextHtml;
        }

        const tags = generateJsonLdTags(injectables);
        jsonLdPages++;

        return injectJsonLdTags(nextHtml, tags);
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

      if (isFeatureEnabled(config.markdownPages)) {
        let preservedMarkdownPages = 0;
        const markdownCanonicalEntries: MarkdownCanonicalHeaderEntry[] = [];
        const htmlAssets: Array<[string, AssetLike]> = Object.entries(bundle).flatMap(
          ([fileName, asset]) =>
            fileName.endsWith('.html') && isAssetLike(asset)
              ? [[fileName, asset]]
              : []
        );

        for (const [htmlFileName, asset] of htmlAssets) {
          const html = getAssetText(asset.source);
          const pagePath = resolveOutputPagePath(htmlFileName);
          const markdownFileName = markdownFileNameFromHtmlFile(htmlFileName);
          const markdown = generatePageMarkdown({
            html,
            pagePath,
            siteUrl: config.site,
          });

          if (!markdown) {
            continue;
          }

          const existingMarkdownAsset = getBundleAsset(bundle, markdownFileName);
          const existingMarkdown =
            existingMarkdownAsset ? getAssetText(existingMarkdownAsset.source) : null;

          let publicMarkdown: string | null = null;
          if (!existingMarkdown && publicDir) {
            const publicMarkdownPath = join(publicDir, markdownFileName);
            if (existsSync(publicMarkdownPath)) {
              publicMarkdown = readFileSync(publicMarkdownPath, 'utf8');
            }
          }

          const preservedMarkdown = existingMarkdown ?? publicMarkdown;
          if (preservedMarkdown && !config.markdownPages?.replaceExisting) {
            preservedMarkdownPages += 1;
            markdownCanonicalEntries.push({
              markdownPath: `/${markdownFileName}`,
              canonicalUrl: buildCanonicalUrl(config.site, pagePath),
            });
            if (!existingMarkdownAsset) {
              this.emitFile({
                type: 'asset',
                fileName: markdownFileName,
                source: preservedMarkdown,
              });
            }
            continue;
          }

          if (existingMarkdownAsset) {
            delete bundle[markdownFileName];
          }

          this.emitFile({
            type: 'asset',
            fileName: markdownFileName,
            source: markdown,
          });
          markdownCanonicalEntries.push({
            markdownPath: `/${markdownFileName}`,
            canonicalUrl: buildCanonicalUrl(config.site, pagePath),
          });
          markdownPages += 1;
        }

        markdownPagesStatus =
          markdownPages > 0
            ? 'generated'
            : preservedMarkdownPages > 0
              ? 'preserved'
              : 'none';
        pendingMarkdownCanonicalEntries = markdownCanonicalEntries;

        if (markdownCanonicalEntries.length > 0) {
          const headersFileName = '_headers';
          const headersPatch = resolveHeadersPatchInputs(
            bundle,
            publicDir,
            headersFileName
          );
          const existingHeadersText = headersPatch.existingHeadersText;
          const patchedHeaders = patchMarkdownCanonicalHeaders(
            existingHeadersText,
            markdownCanonicalEntries
          );
          const preserved =
            existingHeadersText !== null &&
            patchedHeaders === ensureTrailingNewline(existingHeadersText);

          markdownCanonicalHeadersCount = markdownCanonicalEntries.length;
          markdownCanonicalHeadersStatus = preserved ? 'preserved' : 'generated';

          if (preserved) {
            if (!headersPatch.existingHeadersAsset && existingHeadersText) {
              this.emitFile({
                type: 'asset',
                fileName: headersFileName,
                source: ensureTrailingNewline(existingHeadersText),
              });
            }
          } else {
            if (headersPatch.existingHeadersAsset) {
              delete bundle[headersFileName];
            }

            this.emitFile({
              type: 'asset',
              fileName: headersFileName,
              source: patchedHeaders,
            });
          }
        }
      }

      if (isFeatureEnabled(config.contentSignalHeaders)) {
        const headersFileName = '_headers';
        const headersPatch = resolveHeadersPatchInputs(
          bundle,
          publicDir,
          headersFileName
        );
        const existingHeadersText = headersPatch.existingHeadersText;
        const patchedHeaders = patchHeadersFile(
          existingHeadersText,
          config.contentSignalHeaders,
          {
            markdownCanonicalEntries: pendingMarkdownCanonicalEntries,
          }
        );
        const preserved =
          existingHeadersText !== null &&
          patchedHeaders === ensureTrailingNewline(existingHeadersText);

        contentSignalHeadersStatus = preserved ? 'preserved' : 'generated';

        if (preserved) {
          if (!headersPatch.existingHeadersAsset && existingHeadersText) {
            this.emitFile({
              type: 'asset',
              fileName: headersFileName,
              source: ensureTrailingNewline(existingHeadersText),
            });
          }
        } else {
          if (headersPatch.existingHeadersAsset) {
            delete bundle[headersFileName];
          }

          this.emitFile({
            type: 'asset',
            fileName: headersFileName,
            source: patchedHeaders,
          });
        }
      }
    },

    /**
     * Print validation report after build completes.
     */
    async closeBundle() {
      if (isSsrBuild) {
        return;
      }

      const finalHtmlValidationResults = config.validation?.disabled
        ? []
        : await collectFinalHtmlValidationResults(
            writesBuildOutput ? outDir : undefined
          );

      printReport({
        label: '@agentmarkup/vite',
        llmsTxtEntries,
        llmsTxtSections,
        llmsTxtStatus,
        jsonLdPages,
        markdownPages,
        markdownPagesStatus,
        markdownCanonicalHeadersCount,
        markdownCanonicalHeadersStatus,
        crawlersConfigured,
        robotsTxtStatus,
        contentSignalHeadersStatus,
        validationResults: [...validationResults, ...finalHtmlValidationResults],
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

function resolveOutputPagePath(fileName: string): string {
  return normalizePagePath(fileName === 'index.html' ? '/' : `/${fileName}`);
}

function buildCanonicalUrl(siteUrl: string, pagePath: string): string {
  const base = siteUrl.replace(/\/$/, '');
  return pagePath === '/' ? `${base}/` : `${base}${pagePath}`;
}

function getAssetText(source: string | Uint8Array): string {
  return typeof source === 'string'
    ? source
    : new TextDecoder().decode(source);
}

function getBundleAsset(
  bundle: Record<string, unknown>,
  fileName: string
): AssetLike | null {
  const entry = bundle[fileName];
  if (!isAssetLike(entry)) {
    return null;
  }

  return entry;
}

function resolveHeadersPatchInputs(
  bundle: Record<string, unknown>,
  publicDir: string | undefined,
  headersFileName: string
): {
  existingHeadersAsset: AssetLike | null;
  existingHeadersText: string | null;
} {
  const existingHeadersAsset = getBundleAsset(bundle, headersFileName);
  const existingHeaders = existingHeadersAsset
    ? getAssetText(existingHeadersAsset.source)
    : null;

  let publicHeaders: string | null = null;
  if (!existingHeaders && publicDir) {
    const publicHeadersPath = join(publicDir, headersFileName);
    if (existsSync(publicHeadersPath)) {
      publicHeaders = readFileSync(publicHeadersPath, 'utf8');
    }
  }

  return {
    existingHeadersAsset,
    existingHeadersText: existingHeaders ?? publicHeaders,
  };
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}

function isAssetLike(value: unknown): value is AssetLike {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return (
    'type' in value &&
    value.type === 'asset' &&
    'source' in value
  );
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

async function collectFinalHtmlValidationResults(
  outputDir: string | undefined
): Promise<ValidationResult[]> {
  if (!outputDir || !existsSync(outputDir)) {
    return [];
  }

  const htmlFiles = await findHtmlFiles(outputDir);
  const results: ValidationResult[] = [];

  for (const htmlFile of htmlFiles) {
    const html = await readFile(htmlFile, 'utf8');
    const relativeHtmlFile = htmlFile
      .slice(outputDir.length)
      .replace(/^[/\\]+/, '')
      .replace(/\\/g, '/');

    results.push(
      ...validateHtmlContent(html, resolveOutputPagePath(relativeHtmlFile))
    );
  }

  return results;
}

async function findHtmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const htmlFiles: string[] = [];

  for (const entry of entries) {
    const entryPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      htmlFiles.push(...(await findHtmlFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.html')) {
      htmlFiles.push(entryPath);
    }
  }

  return htmlFiles;
}
