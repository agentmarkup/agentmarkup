import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import {
  A2A_AGENT_CARD_FILE_NAME,
  collectSchemasForPage,
  filterJsonLdByExistingTypes,
  generateAgentCard,
  generateLlmsFullTxt,
  generateLlmsTxt,
  generateLlmsTxtDiscoveryLink,
  generateMarkdownAlternateLink,
  generatePageMarkdown,
  generateJsonLdTags,
  hasExistingJsonLdScripts,
  hasLlmsTxtDiscoveryLink,
  injectHeadContent,
  injectJsonLdTags,
  markdownFileNameFromHtmlFile,
  normalizePagePath,
  patchHeadersFile,
  patchMarkdownCanonicalHeaders,
  patchRobotsTxt,
  presetToJsonLd,
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
} from './index.js';
import type {
  AgentMarkupConfig,
  MarkdownCanonicalHeaderEntry,
  ValidationResult,
} from './index.js';

/**
 * Execution modes for {@link processStaticOutput}.
 *
 * - `generate` injects and writes artifacts and mutated HTML.
 * - `dry-run` runs the full pass in memory but writes nothing.
 * - `check` validates the files exactly as they are on disk, with no injection
 *   step, so findings reflect the real served output rather than a would-be result.
 */
export type ProcessMode = 'generate' | 'dry-run' | 'check';

export interface ProcessStaticOutputOptions {
  /** Directory of emitted HTML to process. Acts as both the HTML root and the asset output root. */
  outDir: string;
  mode: ProcessMode;
}

export interface ProcessStaticOutputResult {
  mode: ProcessMode;
  outDir: string;
  htmlFilesProcessed: number;
  agentCardStatus: 'generated' | 'preserved' | 'none';
  llmsTxtEntries: number;
  llmsTxtSections: number;
  llmsTxtStatus: 'generated' | 'preserved' | 'none';
  llmsFullTxtEntries: number;
  llmsFullTxtStatus: 'generated' | 'preserved' | 'none';
  jsonLdPages: number;
  markdownPages: number;
  markdownPagesStatus: 'generated' | 'preserved' | 'none';
  markdownCanonicalHeadersCount: number;
  markdownCanonicalHeadersStatus: 'generated' | 'preserved' | 'none';
  crawlersConfigured: number;
  robotsTxtStatus: 'patched' | 'preserved' | 'none';
  contentSignalHeadersStatus: 'generated' | 'preserved' | 'none';
  validationResults: ValidationResult[];
  errorCount: number;
  warningCount: number;
}

/**
 * Run the agentmarkup machine-readability pass over a flat directory of emitted HTML.
 *
 * For a static output directory the HTML root and the asset output root are the same
 * directory, so coexistence (existing `llms.txt`, `robots.txt`, page JSON-LD, etc.) is
 * evaluated against files already present in `outDir`. This function never prints; the
 * caller owns reporting.
 */
export async function processStaticOutput(
  config: AgentMarkupConfig,
  options: ProcessStaticOutputOptions
): Promise<ProcessStaticOutputResult> {
  const outDir = options.outDir;
  const htmlFiles = await findHtmlFiles(outDir);

  const base =
    options.mode === 'check'
      ? await runCheck(config, outDir, htmlFiles)
      : await runGenerate(config, outDir, htmlFiles, options.mode === 'generate');

  const errorCount = base.validationResults.filter(
    (result) => result.severity === 'error'
  ).length;
  const warningCount = base.validationResults.filter(
    (result) => result.severity === 'warning'
  ).length;

  return {
    mode: options.mode,
    outDir,
    htmlFilesProcessed: htmlFiles.length,
    ...base,
    errorCount,
    warningCount,
  };
}

type GenerateResult = Omit<
  ProcessStaticOutputResult,
  'mode' | 'outDir' | 'htmlFilesProcessed' | 'errorCount' | 'warningCount'
>;

async function runGenerate(
  config: AgentMarkupConfig,
  outDir: string,
  htmlFiles: string[],
  write: boolean
): Promise<GenerateResult> {
  const validationResults: ValidationResult[] = [];
  const resolvedLlmsSections = resolveLlmsTxtSections(config);
  const markdownByUrl: Record<string, string> = {};
  const availableMarkdownUrls = new Set<string>();
  const finalHtmlByFile = new Map<string, string>();

  let agentCardStatus: GenerateResult['agentCardStatus'] = 'none';
  let llmsTxtEntries = 0;
  let llmsTxtSections = 0;
  let llmsTxtStatus: GenerateResult['llmsTxtStatus'] = 'none';
  let llmsFullTxtEntries = 0;
  let llmsFullTxtStatus: GenerateResult['llmsFullTxtStatus'] = 'none';
  let jsonLdPages = 0;
  let markdownPages = 0;
  let markdownPagesStatus: GenerateResult['markdownPagesStatus'] = 'none';
  let markdownCanonicalHeadersCount = 0;
  let markdownCanonicalHeadersStatus: GenerateResult['markdownCanonicalHeadersStatus'] =
    'none';
  let crawlersConfigured = 0;
  let robotsTxtStatus: GenerateResult['robotsTxtStatus'] = 'none';
  let contentSignalHeadersStatus: GenerateResult['contentSignalHeadersStatus'] =
    'none';

  const advertiseLlmsTxt =
    Boolean(config.llmsTxt) || existsSync(join(outDir, 'llms.txt'));

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

    if (isFeatureEnabled(config.markdownPages) && !config.validation?.disabled) {
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

      if (nextHtml !== html && write) {
        await writeFile(htmlFile, nextHtml, 'utf8');
      }
      finalHtmlByFile.set(htmlFile, nextHtml);
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
      if (nextHtml !== html && write) {
        await writeFile(htmlFile, nextHtml, 'utf8');
      }
      finalHtmlByFile.set(htmlFile, nextHtml);
      continue;
    }

    nextHtml = injectJsonLdTags(nextHtml, generateJsonLdTags(injectables));
    if (write) {
      await writeFile(htmlFile, nextHtml, 'utf8');
    }
    finalHtmlByFile.set(htmlFile, nextHtml);
    jsonLdPages += 1;
  }

  if (isFeatureEnabled(config.markdownPages)) {
    let preservedMarkdownPages = 0;
    const markdownCanonicalEntries: MarkdownCanonicalHeaderEntry[] = [];

    for (const htmlFile of htmlFiles) {
      const relativeHtmlPath = relative(outDir, htmlFile).replace(/\\/g, '/');
      const markdownFileName = markdownFileNameFromHtmlFile(relativeHtmlPath);
      const outputMarkdownPath = join(outDir, markdownFileName);
      const html =
        finalHtmlByFile.get(htmlFile) ?? (await readFile(htmlFile, 'utf8'));
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

      const existingMarkdown = await readTextFileIfExists(outputMarkdownPath);

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
        continue;
      }

      if (write) {
        await writeTextFile(outputMarkdownPath, markdown);
      }
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
      const existingHeaders = await readTextFileIfExists(outputHeadersPath);
      const patchedHeaders = patchMarkdownCanonicalHeaders(
        existingHeaders,
        markdownCanonicalEntries
      );
      const preserved =
        existingHeaders !== null &&
        patchedHeaders === ensureTrailingNewline(existingHeaders);

      markdownCanonicalHeadersCount = markdownCanonicalEntries.length;
      markdownCanonicalHeadersStatus = preserved ? 'preserved' : 'generated';

      if (write && (!preserved || !existsSync(outputHeadersPath))) {
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

  if (config.agentCard && config.agentCard.enabled !== false) {
    const outputAgentCardPath = join(outDir, A2A_AGENT_CARD_FILE_NAME);
    const existingAgentCard = await readTextFileIfExists(outputAgentCardPath);

    if (existingAgentCard && !config.agentCard?.replaceExisting) {
      agentCardStatus = 'preserved';
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
          throw new Error(
            'Agent Card generation returned no output for a valid config'
          );
        }

        agentCardStatus = 'generated';
        if (write) {
          await writeTextFile(outputAgentCardPath, agentCardContent);
        }
        if (!config.validation?.disabled) {
          validationResults.push(...validateAgentCardJson(agentCardContent));
        }
      }
    }
  }

  if (advertiseLlmsTxt) {
    const llmsTxtContent = generateLlmsTxt(config);
    const outputLlmsPath = join(outDir, 'llms.txt');
    const existingLlms = await readTextFileIfExists(outputLlmsPath);

    llmsTxtEntries = resolvedLlmsSections.reduce(
      (sum, section) => sum + section.entries.length,
      0
    );
    llmsTxtSections = resolvedLlmsSections.length;

    if (existingLlms && !config.llmsTxt?.replaceExisting) {
      llmsTxtStatus = 'preserved';
      if (!config.validation?.disabled) {
        validationResults.push(...validateLlmsTxt(existingLlms));
      }
    } else if (llmsTxtContent) {
      llmsTxtStatus = llmsTxtEntries > 0 ? 'generated' : 'none';
      if (write) {
        await writeTextFile(outputLlmsPath, llmsTxtContent);
      }
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
      const existingLlmsFull = await readTextFileIfExists(outputLlmsFullPath);
      llmsFullTxtEntries = countInlinedLlmsFullEntries(
        resolvedLlmsSections,
        markdownByUrl
      );

      if (existingLlmsFull && !config.llmsFullTxt.replaceExisting) {
        llmsFullTxtStatus = 'preserved';
        if (!config.validation?.disabled) {
          validationResults.push(...validateLlmsTxt(existingLlmsFull));
        }
      } else {
        llmsFullTxtStatus = 'generated';
        if (write) {
          await writeTextFile(outputLlmsFullPath, llmsFullTxtContent);
        }
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

    const outputRobotsPath = join(outDir, 'robots.txt');
    const existingRobots = await readTextFileIfExists(outputRobotsPath);

    if (existingRobots && !config.validation?.disabled) {
      validationResults.push(...validateRobotsTxt(existingRobots, config.aiCrawlers));
    }

    const patched = patchRobotsTxt(
      existingRobots,
      config.aiCrawlers,
      config.contentSignalHeaders
    );
    const preserved = existingRobots !== null && patched === existingRobots;
    robotsTxtStatus = preserved ? 'preserved' : 'patched';

    if (write && (!preserved || !existsSync(outputRobotsPath))) {
      await writeFile(outputRobotsPath, patched, 'utf8');
    }
  }

  if (isFeatureEnabled(config.contentSignalHeaders)) {
    const outputHeadersPath = join(outDir, '_headers');
    const existingHeaders = await readTextFileIfExists(outputHeadersPath);
    const patchedHeaders = patchHeadersFile(
      existingHeaders,
      config.contentSignalHeaders
    );
    const preserved =
      existingHeaders !== null &&
      patchedHeaders === ensureTrailingNewline(existingHeaders);

    contentSignalHeadersStatus = preserved ? 'preserved' : 'generated';

    if (write && (!preserved || !existsSync(outputHeadersPath))) {
      await writeFile(outputHeadersPath, patchedHeaders, 'utf8');
    }
  }

  return {
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
    validationResults,
  };
}

/**
 * Validate the files exactly as they are on disk. No injection, no writes — findings
 * reflect what is actually being served, which is the point of the CI gate.
 */
async function runCheck(
  config: AgentMarkupConfig,
  outDir: string,
  htmlFiles: string[]
): Promise<GenerateResult> {
  const validationResults: ValidationResult[] = [];
  const resolvedLlmsSections = resolveLlmsTxtSections(config);
  const availableMarkdownUrls = new Set<string>();
  const markdownEnabled = isFeatureEnabled(config.markdownPages);

  let markdownPages = 0;

  for (const htmlFile of htmlFiles) {
    const pagePath = pagePathFromOutputFile(outDir, htmlFile);
    const html = await readFile(htmlFile, 'utf8');

    validationResults.push(...validateHtmlContent(html, pagePath));
    validationResults.push(...validateExistingJsonLd(html, pagePath));

    // Configured schema with no JSON-LD on the page is a readiness gap (lenient
    // warning so default check passes, but `--strict` can gate it).
    if (
      collectSchemasForPage(config, pagePath).length > 0 &&
      !hasExistingJsonLdScripts(html)
    ) {
      validationResults.push({
        severity: 'warning',
        message: 'Configured JSON-LD is missing from this page',
        path: pagePath,
      });
    }

    if (markdownEnabled) {
      validationResults.push(...validateMarkdownAlternateLink(html, pagePath));

      const relativeHtmlPath = relative(outDir, htmlFile).replace(/\\/g, '/');
      const markdownFileName = markdownFileNameFromHtmlFile(relativeHtmlPath);
      const existingMarkdown = await readTextFileIfExists(
        join(outDir, markdownFileName)
      );
      if (existingMarkdown) {
        validationResults.push(...validateMarkdownContent(existingMarkdown, pagePath));
        availableMarkdownUrls.add(buildAbsoluteMarkdownUrl(config.site, pagePath));
        markdownPages += 1;
      }
    }
  }

  if (markdownEnabled && resolvedLlmsSections.length > 0) {
    validationResults.push(
      ...validateLlmsTxtMarkdownCoverage(resolvedLlmsSections, availableMarkdownUrls)
    );
  }

  // A configured artifact that is missing from the served output is a readiness gap.
  // Default `check` stays lenient (warning), so `--strict` can actually gate it.
  const warnMissing = (artifact: string): void => {
    validationResults.push({
      severity: 'warning',
      message: `Configured ${artifact} is missing from the output directory`,
    });
  };

  const existingLlms = await readTextFileIfExists(join(outDir, 'llms.txt'));
  let llmsTxtStatus: GenerateResult['llmsTxtStatus'] = 'none';
  if (existingLlms) {
    validationResults.push(...validateLlmsTxt(existingLlms));
    llmsTxtStatus = 'preserved';
  } else if (config.llmsTxt) {
    warnMissing('llms.txt');
  }

  let llmsFullTxtStatus: GenerateResult['llmsFullTxtStatus'] = 'none';
  const existingLlmsFull = await readTextFileIfExists(join(outDir, 'llms-full.txt'));
  if (existingLlmsFull) {
    validationResults.push(...validateLlmsTxt(existingLlmsFull));
    llmsFullTxtStatus = 'preserved';
  } else if (config.llmsFullTxt?.enabled) {
    warnMissing('llms-full.txt');
  }

  let robotsTxtStatus: GenerateResult['robotsTxtStatus'] = 'none';
  if (config.aiCrawlers) {
    const existingRobots = await readTextFileIfExists(join(outDir, 'robots.txt'));
    if (existingRobots) {
      validationResults.push(...validateRobotsTxt(existingRobots, config.aiCrawlers));
      robotsTxtStatus = 'preserved';
    } else {
      warnMissing('robots.txt');
    }
  }

  if (markdownEnabled && markdownPages === 0 && htmlFiles.length > 0) {
    warnMissing('markdown mirrors');
  }

  let agentCardStatus: GenerateResult['agentCardStatus'] = 'none';
  const existingAgentCard = await readTextFileIfExists(
    join(outDir, A2A_AGENT_CARD_FILE_NAME)
  );
  if (existingAgentCard) {
    validationResults.push(...validateAgentCardJson(existingAgentCard));
    agentCardStatus = 'preserved';
  } else if (config.agentCard && config.agentCard.enabled !== false) {
    warnMissing('Agent Card');
  }

  let contentSignalHeadersStatus: GenerateResult['contentSignalHeadersStatus'] =
    'none';
  if (isFeatureEnabled(config.contentSignalHeaders)) {
    const existingHeaders = await readTextFileIfExists(join(outDir, '_headers'));
    if (existingHeaders) {
      contentSignalHeadersStatus = 'preserved';
    } else {
      warnMissing('_headers (Content-Signal)');
    }
  }

  return {
    agentCardStatus,
    llmsTxtEntries: resolvedLlmsSections.reduce(
      (sum, section) => sum + section.entries.length,
      0
    ),
    llmsTxtSections: resolvedLlmsSections.length,
    llmsTxtStatus,
    llmsFullTxtEntries: 0,
    llmsFullTxtStatus,
    jsonLdPages: 0,
    markdownPages,
    markdownPagesStatus: markdownPages > 0 ? 'preserved' : 'none',
    markdownCanonicalHeadersCount: 0,
    markdownCanonicalHeadersStatus: 'none',
    crawlersConfigured: config.aiCrawlers
      ? Object.keys(config.aiCrawlers).length
      : 0,
    robotsTxtStatus,
    contentSignalHeadersStatus,
    validationResults,
  };
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

async function readTextFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return null;
    }

    throw error;
  }
}

async function writeTextFile(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, ensureTrailingNewline(content), 'utf8');
}

function isFeatureEnabled(config: { enabled?: boolean } | undefined): boolean {
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
