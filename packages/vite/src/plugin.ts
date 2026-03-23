import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve as resolvePath } from 'node:path';
import type { Plugin } from 'vite';
import {
  A2A_AGENT_CARD_FILE_NAME,
  collectSchemasForPage,
  filterJsonLdByExistingTypes,
  generateAgentCard,
  generateLlmsFullTxt,
  generateLlmsTxtDiscoveryLink,
  generateMarkdownAlternateLink,
  generatePageMarkdown,
  generateLlmsTxt,
  generateJsonLdTags,
  hasLlmsTxtDiscoveryLink,
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
  resolveLlmsTxtSections,
  validateAgentCardConfig,
  validateAgentCardJson,
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

interface AssetLike {
  type: 'asset';
  source: string | Uint8Array;
}

export function agentmarkup(config: AgentMarkupConfig): Plugin {
  const validationResults: ValidationResult[] = [];
  let agentCardStatus: 'generated' | 'preserved' | 'none' = 'none';
  let llmsTxtContent: string | null = null;
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
  let pendingMarkdownCanonicalEntries: MarkdownCanonicalHeaderEntry[] = [];
  let publicDir: string | undefined;
  let outDir: string | undefined;
  let writesBuildOutput = true;
  let isSsrBuild = false;

  function resetBuildState(): void {
    validationResults.length = 0;
    agentCardStatus = 'none';
    llmsTxtContent = null;
    llmsTxtEntries = 0;
    llmsTxtSections = 0;
    llmsTxtStatus = 'none';
    llmsFullTxtEntries = 0;
    llmsFullTxtStatus = 'none';
    jsonLdPages = 0;
    markdownPages = 0;
    markdownPagesStatus = 'none';
    markdownCanonicalHeadersCount = 0;
    markdownCanonicalHeadersStatus = 'none';
    crawlersConfigured = 0;
    robotsTxtStatus = 'none';
    contentSignalHeadersStatus = 'none';
    pendingMarkdownCanonicalEntries = [];
  }

  return {
    name: 'agentmarkup',
    enforce: 'post',

    configResolved(resolvedConfig) {
      resetBuildState();
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

    buildStart() {
      resetBuildState();
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
          shouldAdvertiseLlmsTxt(config, publicDir) &&
          !hasLlmsTxtDiscoveryLink(nextHtml)
        ) {
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

      const resolvedLlmsSections = resolveLlmsTxtSections(config);
      const markdownByUrl: Record<string, string> = {};
      const availableMarkdownUrls = new Set<string>();

      if (config.agentCard && config.agentCard.enabled !== false) {
        let existingAgentCard: string | null = null;
        let existingAgentCardFromBundle = false;

        for (const [fileName, asset] of Object.entries(bundle)) {
          if (fileName === A2A_AGENT_CARD_FILE_NAME && asset.type === 'asset') {
            existingAgentCard =
              typeof asset.source === 'string'
                ? asset.source
                : new TextDecoder().decode(asset.source);
            existingAgentCardFromBundle = true;
            break;
          }
        }

        if (!existingAgentCard && publicDir) {
          const publicAgentCardPath = join(publicDir, A2A_AGENT_CARD_FILE_NAME);
          if (existsSync(publicAgentCardPath)) {
            existingAgentCard = readFileSync(publicAgentCardPath, 'utf8');
          }
        }

        if (existingAgentCard && !config.agentCard?.replaceExisting) {
          agentCardStatus = 'preserved';

          if (!existingAgentCardFromBundle) {
            this.emitFile({
              type: 'asset',
              fileName: A2A_AGENT_CARD_FILE_NAME,
              source: existingAgentCard,
            });
          }

          if (!config.validation?.disabled) {
            validationResults.push(...validateAgentCardJson(existingAgentCard));
          }
        } else {
          const agentCardConfigIssues = validateAgentCardConfig(
            config,
            `/${A2A_AGENT_CARD_FILE_NAME}`
          );

          if (!config.validation?.disabled) {
            validationResults.push(...agentCardConfigIssues);
          }

          if (!agentCardConfigIssues.some((result) => result.severity === 'error')) {
            const agentCardContent = generateAgentCard(config);
            if (!agentCardContent) {
              throw new Error('Agent Card generation returned no output for a valid config');
            }

            agentCardStatus = 'generated';

            if (existingAgentCardFromBundle) {
              delete bundle[A2A_AGENT_CARD_FILE_NAME];
            }

            this.emitFile({
              type: 'asset',
              fileName: A2A_AGENT_CARD_FILE_NAME,
              source: agentCardContent,
            });

            if (!config.validation?.disabled) {
              validationResults.push(...validateAgentCardJson(agentCardContent));
            }
          }
        }
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
          const markdownAbsoluteUrl = buildAbsoluteMarkdownUrl(config.site, pagePath);
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
            markdownByUrl[markdownAbsoluteUrl] = preservedMarkdown;
            availableMarkdownUrls.add(markdownAbsoluteUrl);
            markdownCanonicalEntries.push({
              markdownPath: `/${markdownFileName}`,
              canonicalUrl: buildCanonicalUrl(config.site, pagePath),
            });
            if (!config.validation?.disabled && !writesBuildOutput) {
              validationResults.push(
                ...validateMarkdownContent(preservedMarkdown, pagePath)
              );
            }
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
          markdownByUrl[markdownAbsoluteUrl] = markdown;
          availableMarkdownUrls.add(markdownAbsoluteUrl);
          markdownCanonicalEntries.push({
            markdownPath: `/${markdownFileName}`,
            canonicalUrl: buildCanonicalUrl(config.site, pagePath),
          });
          if (!config.validation?.disabled && !writesBuildOutput) {
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

        if (!config.validation?.disabled && resolvedLlmsSections.length > 0) {
          validationResults.push(
            ...validateLlmsTxtMarkdownCoverage(
              resolvedLlmsSections,
              availableMarkdownUrls
            )
          );
        }
      }

      if (config.llmsFullTxt?.enabled) {
        const llmsFullTxtContent = generateLlmsFullTxt(config, {
          contentByUrl: markdownByUrl,
        });

        if (llmsFullTxtContent) {
          const inlineEntries = countInlinedLlmsFullEntries(
            resolvedLlmsSections,
            markdownByUrl
          );
          let existingLlmsFull: string | null = null;
          let existingLlmsFullFromBundle = false;

          for (const [fileName, asset] of Object.entries(bundle)) {
            if (fileName === 'llms-full.txt' && asset.type === 'asset') {
              existingLlmsFull =
                typeof asset.source === 'string'
                  ? asset.source
                  : new TextDecoder().decode(asset.source);
              existingLlmsFullFromBundle = true;
              break;
            }
          }

          if (!existingLlmsFull && publicDir) {
            const publicLlmsFullPath = join(publicDir, 'llms-full.txt');
            if (existsSync(publicLlmsFullPath)) {
              existingLlmsFull = readFileSync(publicLlmsFullPath, 'utf8');
            }
          }

          if (existingLlmsFull && !config.llmsFullTxt.replaceExisting) {
            llmsFullTxtStatus = 'preserved';

            if (!existingLlmsFullFromBundle) {
              this.emitFile({
                type: 'asset',
                fileName: 'llms-full.txt',
                source: existingLlmsFull,
              });
            }

            if (!config.validation?.disabled) {
              validationResults.push(...validateLlmsTxt(existingLlmsFull));
            }
          } else {
            llmsFullTxtStatus = 'generated';
            llmsFullTxtEntries = inlineEntries;

            if (existingLlmsFullFromBundle) {
              delete bundle['llms-full.txt'];
            }

            this.emitFile({
              type: 'asset',
              fileName: 'llms-full.txt',
              source: llmsFullTxtContent,
            });

            if (!config.validation?.disabled) {
              validationResults.push(...validateLlmsTxt(llmsFullTxtContent));
            }
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

      if (
        llmsFullTxtStatus !== 'preserved' &&
        config.llmsFullTxt?.enabled &&
        writesBuildOutput
      ) {
        const finalLlmsFullEntries = await rewriteFinalLlmsFullTxt(
          outDir,
          config
        );

        if (finalLlmsFullEntries !== null) {
          llmsFullTxtEntries = finalLlmsFullEntries;
          llmsFullTxtStatus = 'generated';
        }
      }

      const finalHtmlValidationResults = config.validation?.disabled
        ? []
        : await collectFinalHtmlValidationResults(
            writesBuildOutput ? outDir : undefined,
            config
          );

      printReport({
        label: '@agentmarkup/vite',
        agentCardStatus,
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
  outputDir: string | undefined,
  config: AgentMarkupConfig
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
    const pagePath = resolveOutputPagePath(relativeHtmlFile);

    results.push(...validateHtmlContent(html, pagePath));

    if (isFeatureEnabled(config.markdownPages)) {
      results.push(...validateMarkdownAlternateLink(html, pagePath));
    }
  }

  if (isFeatureEnabled(config.markdownPages)) {
    const markdownFiles = await findMarkdownFiles(outputDir);

    for (const markdownFile of markdownFiles) {
      const markdown = await readFile(markdownFile, 'utf8');
      const relativeMarkdownFile = markdownFile
        .slice(outputDir.length)
        .replace(/^[/\\]+/, '')
        .replace(/\\/g, '/');
      const pagePath = resolveOutputMarkdownPagePath(relativeMarkdownFile);

      results.push(...validateMarkdownContent(markdown, pagePath));
    }
  }

  return results;
}

async function rewriteFinalLlmsFullTxt(
  outputDir: string | undefined,
  config: AgentMarkupConfig
): Promise<number | null> {
  if (!outputDir || !existsSync(outputDir) || !config.llmsFullTxt?.enabled) {
    return null;
  }

  const markdownFiles = await findMarkdownFiles(outputDir);
  const markdownByUrl: Record<string, string> = {};

  for (const markdownFile of markdownFiles) {
    const markdown = await readFile(markdownFile, 'utf8');
    const relativeMarkdownFile = markdownFile
      .slice(outputDir.length)
      .replace(/^[/\\]+/, '')
      .replace(/\\/g, '/');
    const pagePath = resolveOutputMarkdownPagePath(relativeMarkdownFile);
    const markdownUrl = buildAbsoluteMarkdownUrl(config.site, pagePath);

    markdownByUrl[markdownUrl] = markdown;
  }

  const llmsFullTxtContent = generateLlmsFullTxt(config, {
    contentByUrl: markdownByUrl,
  });

  if (!llmsFullTxtContent) {
    return null;
  }

  await writeFile(join(outputDir, 'llms-full.txt'), llmsFullTxtContent, 'utf8');

  return countInlinedLlmsFullEntries(
    resolveLlmsTxtSections(config),
    markdownByUrl
  );
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

async function findMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const markdownFiles: string[] = [];

  for (const entry of entries) {
    const entryPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      markdownFiles.push(...(await findMarkdownFiles(entryPath)));
      continue;
    }

    if (
      entry.isFile() &&
      entry.name.endsWith('.md') &&
      entry.name !== 'llms.txt' &&
      entry.name !== 'llms-full.txt'
    ) {
      markdownFiles.push(entryPath);
    }
  }

  return markdownFiles;
}

function shouldAdvertiseLlmsTxt(
  config: AgentMarkupConfig,
  publicDir: string | undefined
): boolean {
  if (config.llmsTxt) {
    return true;
  }

  return Boolean(publicDir && existsSync(join(publicDir, 'llms.txt')));
}

function buildAbsoluteMarkdownUrl(siteUrl: string, pagePath: string): string {
  const base = siteUrl.replace(/\/$/, '');
  return pagePath === '/' ? `${base}/index.md` : `${base}${pagePath}.md`;
}

function resolveOutputMarkdownPagePath(fileName: string): string {
  if (fileName === 'index.md') {
    return '/';
  }

  return normalizePagePath(`/${fileName.replace(/\.md$/, '')}`);
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
