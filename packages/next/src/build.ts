import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import {
  collectSchemasForPage,
  filterJsonLdByExistingTypes,
  generateLlmsFullTxt,
  generateLlmsTxt,
  generatePageMarkdown,
  generateJsonLdTags,
  hasExistingJsonLdScripts,
  injectHeadContent,
  injectJsonLdTags,
  markdownHrefForPagePath,
  normalizePagePath,
  patchHeadersFile,
  patchMarkdownCanonicalHeaders,
  patchRobotsTxt,
  presetToJsonLd,
  printReport,
  resolveLlmsTxtSections,
  validateExistingJsonLd,
  validateHtmlContent,
  validateLlmsTxt,
  validateLlmsTxtMarkdownCoverage,
  validateMarkdownContent,
  validateRobotsTxt,
  validateSchema,
} from '@agentmarkup/core';
import type {
  AgentMarkupConfig,
  MarkdownCanonicalHeaderEntry,
  ValidationResult,
} from '@agentmarkup/core';
import type {
  NextConfigLike,
  NextAdapterOutputsLike,
  ProcessNextBuildOptions,
  ProcessNextBuildResult,
} from './types.js';

interface HtmlFileEntry {
  filePath: string;
  pagePath: string;
  publicPagePath: string;
}

export async function processNextBuildOutput(
  config: AgentMarkupConfig,
  options: ProcessNextBuildOptions
): Promise<ProcessNextBuildResult> {
  const validationResults: ValidationResult[] = [];
  const projectDir = resolve(options.projectDir);
  const publicDir = join(projectDir, 'public');
  const nextConfig = options.nextConfig ?? {};
  const htmlFilesFromOutputs = collectProcessableHtmlFilesFromOutputs(
    options.outputs,
    projectDir,
    nextConfig
  );
  const target = await resolveBuildTarget(
    projectDir,
    nextConfig,
    options.distDir,
    htmlFilesFromOutputs
  );
  const htmlFiles =
    htmlFilesFromOutputs.length > 0
      ? htmlFilesFromOutputs
      : await collectProcessableHtmlFiles(target.htmlRoots, nextConfig);
  const resolvedLlmsSections = resolveLlmsTxtSections(config);
  const markdownByUrl: Record<string, string> = {};
  const availableMarkdownUrls = new Set<string>();
  const publicLlmsTxtPath = buildPublicLlmsTxtPath(nextConfig);
  const advertiseLlmsTxt =
    Boolean(config.llmsTxt) ||
    (await readFirstExisting([
      join(publicDir, 'llms.txt'),
      target.outputRoot ? join(target.outputRoot, 'llms.txt') : '',
    ])) !== null;

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

  for (const htmlFile of htmlFiles) {
    const html = await readFile(htmlFile.filePath, 'utf8');
    let nextHtml = html;
    const schemas = collectSchemasForPage(config, htmlFile.pagePath);
    const hasExistingJsonLd = hasExistingJsonLdScripts(nextHtml);

    if (!config.validation?.disabled) {
      validationResults.push(...validateHtmlContent(nextHtml, htmlFile.pagePath));
      validationResults.push(...validateExistingJsonLd(nextHtml, htmlFile.pagePath));
    }

    if (
      advertiseLlmsTxt &&
      !hasLlmsTxtDiscoveryLinkForHref(nextHtml, publicLlmsTxtPath)
    ) {
      nextHtml = injectHeadContent(
        nextHtml,
        buildLlmsTxtDiscoveryLink(publicLlmsTxtPath)
      );
    }

    const publicMarkdownPath = buildPublicMarkdownPath(
      htmlFile.pagePath,
      htmlFile.publicPagePath
    );
    if (
      isFeatureEnabled(config.markdownPages) &&
      !hasMarkdownAlternateLinkForHref(nextHtml, publicMarkdownPath)
    ) {
      nextHtml = injectHeadContent(
        nextHtml,
        buildMarkdownAlternateLink(publicMarkdownPath)
      );
    }

    if (
      isFeatureEnabled(config.markdownPages) &&
      !config.validation?.disabled
    ) {
      validationResults.push(
        ...validateMarkdownAlternateLinkForHref(
          nextHtml,
          publicMarkdownPath,
          htmlFile.pagePath
        )
      );
    }

    if (schemas.length === 0) {
      if (
        config.validation?.warnOnMissingSchema &&
        !config.validation.disabled &&
        !hasExistingJsonLd
      ) {
        validationResults.push({
          severity: 'warning',
          message: 'No structured data configured for this page',
          path: htmlFile.pagePath,
        });
      }

      if (nextHtml !== html) {
        await writeFile(htmlFile.filePath, nextHtml, 'utf8');
      }
      continue;
    }

    const jsonLdObjects = schemas.map(presetToJsonLd);
    const injectables = config.jsonLd?.replaceExistingTypes
      ? jsonLdObjects
      : filterJsonLdByExistingTypes(jsonLdObjects, nextHtml);

    if (!config.validation?.disabled) {
      for (const schema of schemas) {
        validationResults.push(...validateSchema(schema, htmlFile.pagePath));
      }
    }

    if (injectables.length === 0) {
      if (nextHtml !== html) {
        await writeFile(htmlFile.filePath, nextHtml, 'utf8');
      }
      continue;
    }

    nextHtml = injectJsonLdTags(nextHtml, generateJsonLdTags(injectables));
    await writeFile(htmlFile.filePath, nextHtml, 'utf8');
    jsonLdPages += 1;
  }

  const markdownCanonicalEntries: MarkdownCanonicalHeaderEntry[] = [];
  if (isFeatureEnabled(config.markdownPages)) {
    let preservedMarkdownPages = 0;

    for (const htmlFile of htmlFiles) {
      const html = await readFile(htmlFile.filePath, 'utf8');
      const markdown = generatePageMarkdown({
        html,
        pagePath: htmlFile.pagePath,
        siteUrl: config.site,
      });

      if (!markdown) {
        continue;
      }

      const outputMarkdownPath =
        target.mode === 'export'
          ? resolveContainedPath(
              target.outputRoot,
              markdownHrefForPagePath(htmlFile.pagePath).slice(1),
              'generated markdown file'
            )
          : resolveContainedPath(
              publicDir,
              markdownHrefForPagePath(htmlFile.pagePath).slice(1),
              'generated markdown file'
            );
      const existingMarkdown = await readFirstExisting([
        outputMarkdownPath,
        resolveContainedPath(
          publicDir,
          markdownHrefForPagePath(htmlFile.pagePath).slice(1),
          'generated markdown file'
        ),
      ]);
      const markdownAbsoluteUrl = buildAbsoluteMarkdownUrl(config.site, htmlFile.pagePath);

      if (existingMarkdown && !config.markdownPages?.replaceExisting) {
        preservedMarkdownPages += 1;
        markdownByUrl[markdownAbsoluteUrl] = existingMarkdown;
        availableMarkdownUrls.add(markdownAbsoluteUrl);
        markdownCanonicalEntries.push({
          markdownPath: buildPublicMarkdownPath(
            htmlFile.pagePath,
            htmlFile.publicPagePath
          ),
          canonicalUrl: buildCanonicalUrl(config.site, htmlFile.pagePath),
        });

        if (!config.validation?.disabled) {
          validationResults.push(
            ...validateMarkdownContent(existingMarkdown, htmlFile.pagePath)
          );
        }

        if (!(await fileExists(outputMarkdownPath))) {
          await writeTextFile(outputMarkdownPath, existingMarkdown);
        }
        continue;
      }

      await writeTextFile(outputMarkdownPath, markdown);
      markdownByUrl[markdownAbsoluteUrl] = markdown;
      availableMarkdownUrls.add(markdownAbsoluteUrl);
      markdownCanonicalEntries.push({
        markdownPath: buildPublicMarkdownPath(
          htmlFile.pagePath,
          htmlFile.publicPagePath
        ),
        canonicalUrl: buildCanonicalUrl(config.site, htmlFile.pagePath),
      });

      if (!config.validation?.disabled) {
        validationResults.push(...validateMarkdownContent(markdown, htmlFile.pagePath));
      }

      markdownPages += 1;
    }

    markdownPagesStatus =
      markdownPages > 0
        ? 'generated'
        : preservedMarkdownPages > 0
          ? 'preserved'
          : 'none';

    if (!config.validation?.disabled && resolvedLlmsSections.length > 0) {
      validationResults.push(
        ...validateLlmsTxtMarkdownCoverage(resolvedLlmsSections, availableMarkdownUrls)
      );
    }
  }

  if (config.llmsTxt || (await fileExists(join(publicDir, 'llms.txt')))) {
    const llmsTxtContent = generateLlmsTxt(config);
    const outputLlmsPath =
      target.mode === 'export'
        ? resolveContainedPath(target.outputRoot, 'llms.txt', 'generated llms.txt file')
        : resolveContainedPath(publicDir, 'llms.txt', 'generated llms.txt file');
    const existingLlms = await readFirstExisting([
      outputLlmsPath,
      resolveContainedPath(publicDir, 'llms.txt', 'generated llms.txt file'),
    ]);

    llmsTxtEntries = resolvedLlmsSections.reduce(
      (sum, section) => sum + section.entries.length,
      0
    );
    llmsTxtSections = resolvedLlmsSections.length;

    if (existingLlms && !config.llmsTxt?.replaceExisting) {
      llmsTxtStatus = 'preserved';
      if (!(await fileExists(outputLlmsPath))) {
        await writeTextFile(outputLlmsPath, existingLlms);
      }
      if (!config.validation?.disabled) {
        validationResults.push(...validateLlmsTxt(existingLlms));
      }
    } else if (llmsTxtContent) {
      await writeTextFile(outputLlmsPath, llmsTxtContent);
      llmsTxtStatus = llmsTxtEntries > 0 ? 'generated' : 'none';
      if (!config.validation?.disabled) {
        validationResults.push(...validateLlmsTxt(llmsTxtContent));
      }
    }
  }

  if (config.llmsFullTxt?.enabled) {
    const llmsFullTxtContent = generateLlmsFullTxt(config, {
      contentByUrl: markdownByUrl,
    });
    const outputLlmsFullPath =
      target.mode === 'export'
        ? resolveContainedPath(
            target.outputRoot,
            'llms-full.txt',
            'generated llms-full.txt file'
          )
        : resolveContainedPath(
            publicDir,
            'llms-full.txt',
            'generated llms-full.txt file'
          );
    const existingLlmsFull = await readFirstExisting([
      outputLlmsFullPath,
      resolveContainedPath(publicDir, 'llms-full.txt', 'generated llms-full.txt file'),
    ]);

    llmsFullTxtEntries = countInlinedLlmsFullEntries(
      resolvedLlmsSections,
      markdownByUrl
    );

    if (existingLlmsFull && !config.llmsFullTxt.replaceExisting) {
      llmsFullTxtStatus = 'preserved';
      if (!(await fileExists(outputLlmsFullPath))) {
        await writeTextFile(outputLlmsFullPath, existingLlmsFull);
      }
    } else if (llmsFullTxtContent) {
      await writeTextFile(outputLlmsFullPath, llmsFullTxtContent);
      llmsFullTxtStatus = 'generated';
    }
  }

  if (config.aiCrawlers) {
    crawlersConfigured = Object.keys(config.aiCrawlers).length;
    const outputRobotsPath =
      target.mode === 'export'
        ? resolveContainedPath(target.outputRoot, 'robots.txt', 'generated robots.txt file')
        : resolveContainedPath(publicDir, 'robots.txt', 'generated robots.txt file');
    const existingRobots = await readFirstExisting([
      outputRobotsPath,
      resolveContainedPath(publicDir, 'robots.txt', 'generated robots.txt file'),
    ]);
    const patchedRobots = patchRobotsTxt(existingRobots, config.aiCrawlers);
    const preserved =
      existingRobots !== null &&
      patchedRobots === ensureTrailingNewline(existingRobots);

    robotsTxtStatus = preserved ? 'preserved' : 'patched';
    await writeTextFile(outputRobotsPath, patchedRobots);

    if (!config.validation?.disabled) {
      validationResults.push(...validateRobotsTxt(patchedRobots, config.aiCrawlers));
    }
  }

  if (target.mode === 'export') {
    const outputHeadersPath = resolveContainedPath(
      target.outputRoot,
      '_headers',
      'generated _headers file'
    );
    const existingHeaders = await readFirstExisting([
      outputHeadersPath,
      resolveContainedPath(publicDir, '_headers', 'generated _headers file'),
    ]);
    const nextHeadersConfig = withBasePathContentSignalConfig(
      config.contentSignalHeaders,
      nextConfig.basePath
    );

    if (isFeatureEnabled(config.contentSignalHeaders) || markdownCanonicalEntries.length > 0) {
      let patchedHeaders: string;

      if (isFeatureEnabled(config.contentSignalHeaders)) {
        patchedHeaders = patchHeadersFile(existingHeaders, nextHeadersConfig, {
          markdownCanonicalEntries,
        });
      } else {
        patchedHeaders = patchMarkdownCanonicalHeaders(
          existingHeaders,
          markdownCanonicalEntries
        );
      }

      const preserved =
        existingHeaders !== null &&
        patchedHeaders === ensureTrailingNewline(existingHeaders);

      if (isFeatureEnabled(config.contentSignalHeaders)) {
        contentSignalHeadersStatus = preserved ? 'preserved' : 'generated';
      }

      if (markdownCanonicalEntries.length > 0) {
        markdownCanonicalHeadersCount = markdownCanonicalEntries.length;
        markdownCanonicalHeadersStatus = preserved ? 'preserved' : 'generated';
      }

      if (!preserved || !(await fileExists(outputHeadersPath))) {
        await writeTextFile(outputHeadersPath, patchedHeaders);
      }
    }
  }

  const result: ProcessNextBuildResult = {
    mode: target.mode,
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
  };

  printReport({
    label: '@agentmarkup/next',
    llmsTxtEntries: result.llmsTxtEntries,
    llmsTxtSections: result.llmsTxtSections,
    llmsTxtStatus: result.llmsTxtStatus,
    llmsFullTxtEntries: result.llmsFullTxtEntries,
    llmsFullTxtStatus: result.llmsFullTxtStatus,
    jsonLdPages: result.jsonLdPages,
    markdownPages: result.markdownPages,
    markdownPagesStatus: result.markdownPagesStatus,
    markdownCanonicalHeadersCount: result.markdownCanonicalHeadersCount,
    markdownCanonicalHeadersStatus: result.markdownCanonicalHeadersStatus,
    crawlersConfigured: result.crawlersConfigured,
    robotsTxtStatus: result.robotsTxtStatus,
    contentSignalHeadersStatus: result.contentSignalHeadersStatus,
    validationResults,
  });

  return result;
}

async function resolveBuildTarget(
  projectDir: string,
  nextConfig: NextConfigLike,
  distDir: string | undefined,
  htmlFilesFromOutputs: HtmlFileEntry[]
): Promise<{
  mode: 'export' | 'server';
  outputRoot: string;
  htmlRoots: string[];
}> {
  if (nextConfig.output === 'export') {
    const configuredOutDir = resolveContainedPath(
      projectDir,
      'out',
      'Next export output root'
    );
    const inferredOutputRoot = commonDirectory(
      htmlFilesFromOutputs.map((entry) => entry.filePath)
    );
    const candidates = uniquePaths([inferredOutputRoot ?? '', configuredOutDir]);
    const outputRoot =
      (await findFirstExistingDirectory(candidates)) ?? configuredOutDir;
    return {
      mode: 'export',
      outputRoot: resolveContainedPath(projectDir, outputRoot, 'Next output root'),
      htmlRoots: [outputRoot],
    };
  }

  const distRoot = distDir
    ? resolveContainedPath(projectDir, distDir, 'Next distDir')
    : resolveContainedPath(projectDir, nextConfig.distDir ?? '.next', 'Next distDir');
  return {
    mode: 'server',
    outputRoot: resolveContainedPath(projectDir, 'public', 'Next public output root'),
    htmlRoots: [
      resolveContainedPath(distRoot, join('server', 'app'), 'Next app html root'),
      resolveContainedPath(distRoot, join('server', 'pages'), 'Next pages html root'),
    ],
  };
}

async function collectProcessableHtmlFiles(
  roots: string[],
  nextConfig: NextConfigLike
): Promise<HtmlFileEntry[]> {
  const entries: HtmlFileEntry[] = [];
  const seen = new Set<string>();
  const basePath = normalizeBasePath(nextConfig.basePath);

  for (const root of roots) {
    if (!existsSync(root)) {
      continue;
    }

    const files = await findHtmlFiles(root);
    for (const filePath of files) {
      const relativePath = relative(root, filePath).replace(/\\/g, '/');
      if (shouldSkipHtmlFile(relativePath)) {
        continue;
      }

      const route = pagePathsFromOutputFile(relativePath, basePath);
      if (!route || seen.has(route.publicPagePath)) {
        continue;
      }

      seen.add(route.publicPagePath);
      entries.push({
        filePath,
        pagePath: route.pagePath,
        publicPagePath: route.publicPagePath,
      });
    }
  }

  return entries.sort((left, right) =>
    left.publicPagePath.localeCompare(right.publicPagePath)
  );
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

function shouldSkipHtmlFile(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  const segments = normalized.split('/');
  const fileName = segments[segments.length - 1]?.toLowerCase() ?? '';

  if (segments.some((segment) => segment.startsWith('_'))) {
    return true;
  }

  if (
    fileName === '404.html' ||
    fileName === '500.html' ||
    fileName === 'error.html' ||
    fileName === 'not-found.html' ||
    fileName === '_not-found.html'
  ) {
    return true;
  }

  return false;
}

function pagePathsFromOutputFile(
  relativePath: string,
  basePath: string
): { pagePath: string; publicPagePath: string } | null {
  const normalizedRelativePath = relativePath.replace(/\\/g, '/');
  const normalized = sanitizeOutputRelativePath(normalizedRelativePath)
    .replace(/\/page\.html$/i, '/index.html')
    .replace(/(^|\/)route\.html$/i, '$1');

  if (!normalized) {
    return null;
  }

  const candidatePath =
    normalized === 'index.html' ? '/' : `/${normalized}`;
  const candidatePagePath = normalizePagePath(candidatePath);
  const pagePath = stripBasePath(candidatePagePath, basePath);

  if (!pagePath.startsWith('/')) {
    return null;
  }

  return {
    pagePath,
    publicPagePath: buildPublicPagePath(pagePath, basePath),
  };
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

async function writeTextFile(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, ensureTrailingNewline(content), 'utf8');
}

async function readFirstExisting(filePaths: string[]): Promise<string | null> {
  for (const filePath of filePaths) {
    if (!filePath) {
      continue;
    }

    if (existsSync(filePath)) {
      return readFile(filePath, 'utf8');
    }
  }

  return null;
}

async function findFirstExistingDirectory(
  directories: string[]
): Promise<string | null> {
  for (const directory of directories) {
    if (directory && existsSync(directory)) {
      return directory;
    }
  }

  return null;
}

async function fileExists(filePath: string): Promise<boolean> {
  return existsSync(filePath);
}

function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths.filter(Boolean)));
}

function isFeatureEnabled(
  config: { enabled?: boolean } | undefined
): boolean {
  return Boolean(config && config.enabled !== false);
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`;
}

function collectProcessableHtmlFilesFromOutputs(
  outputs: NextAdapterOutputsLike | undefined,
  projectDir: string,
  nextConfig: NextConfigLike
): HtmlFileEntry[] {
  if (!outputs) {
    return [];
  }

  const entries: HtmlFileEntry[] = [];
  const seen = new Set<string>();
  const basePath = normalizeBasePath(nextConfig.basePath);

  const addEntry = (filePath: string | undefined, pathname: string | undefined) => {
    if (!filePath || !pathname || !filePath.toLowerCase().endsWith('.html')) {
      return;
    }

    const publicPagePath = normalizeOutputPathname(pathname);
    if (hasUnsafePathSegments(publicPagePath)) {
      throw new Error(
        `[agentmarkup/next] Refusing to process Next output pathname "${pathname}" because it contains "." or ".." path segments.`
      );
    }

    const pagePath = stripBasePath(publicPagePath, basePath);
    if (!pagePath.startsWith('/') || shouldSkipPagePath(pagePath)) {
      return;
    }

    if (seen.has(publicPagePath)) {
      return;
    }

    seen.add(publicPagePath);
    entries.push({
      filePath: resolveOutputFilePath(projectDir, filePath),
      pagePath,
      publicPagePath,
    });
  };

  for (const output of outputs.pages ?? []) {
    addEntry(output.filePath, output.pathname);
  }

  for (const output of outputs.appPages ?? []) {
    addEntry(output.filePath, output.pathname);
  }

  for (const output of outputs.staticFiles ?? []) {
    addEntry(output.filePath, output.pathname);
  }

  for (const prerender of outputs.prerenders ?? []) {
    addEntry(prerender.fallback?.filePath, prerender.pathname);
  }

  return entries.sort((left, right) =>
    left.publicPagePath.localeCompare(right.publicPagePath)
  );
}

function resolveOutputFilePath(projectDir: string, filePath: string): string {
  return resolveContainedPath(projectDir, filePath, 'Next output file');
}

function buildPublicLlmsTxtPath(nextConfig: NextConfigLike): string {
  const basePath = normalizeBasePath(nextConfig.basePath);
  return basePath ? `${basePath}/llms.txt` : '/llms.txt';
}

function buildPublicMarkdownPath(
  pagePath: string,
  publicPagePath: string
): string {
  const normalizedPublicPagePath = normalizePagePath(publicPagePath);

  if (pagePath === '/') {
    return normalizedPublicPagePath === '/'
      ? '/index.md'
      : `${normalizedPublicPagePath}/index.md`;
  }

  return normalizedPublicPagePath === '/'
    ? `${pagePath}.md`
    : `${normalizedPublicPagePath}.md`;
}

function buildPublicPagePath(pagePath: string, basePath: string): string {
  if (!basePath) {
    return pagePath;
  }

  if (pagePath === '/') {
    return basePath;
  }

  return `${basePath}${pagePath}`;
}

function stripBasePath(pathname: string, basePath: string): string {
  if (!basePath) {
    return pathname;
  }

  if (pathname === basePath) {
    return '/';
  }

  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length) || '/';
  }

  return pathname;
}

function normalizeBasePath(basePath: string | undefined): string {
  if (!basePath || basePath === '/') {
    return '';
  }

  const withLeadingSlash = basePath.startsWith('/') ? basePath : `/${basePath}`;
  return withLeadingSlash.replace(/\/$/, '');
}

function normalizeOutputPathname(pathname: string): string {
  const cleanPath = pathname
    .split(/[?#]/, 1)[0]
    .replace(/\.rsc$/i, '')
    .replace(/\.html$/i, '');
  const withoutIndex = cleanPath.replace(/\/index$/i, '/');

  return normalizePagePath(withoutIndex || '/');
}

function shouldSkipPagePath(pagePath: string): boolean {
  return (
    pagePath === '/404' ||
    pagePath === '/500' ||
    pagePath === '/error' ||
    pagePath === '/not-found' ||
    pagePath === '/_not-found' ||
    pagePath.split('/').some((segment) => segment.startsWith('_'))
  );
}

function sanitizeOutputRelativePath(relativePath: string): string {
  return relativePath
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => {
      if (!segment) {
        return false;
      }

      if (segment.startsWith('@')) {
        return false;
      }

      return !(segment.startsWith('(') && segment.endsWith(')'));
    })
    .join('/');
}

function hasUnsafePathSegments(pathname: string): boolean {
  return pathname
    .split('/')
    .some((segment) => segment === '.' || segment === '..');
}

function resolveContainedPath(
  rootDir: string,
  candidatePath: string,
  label: string
): string {
  const resolvedRoot = resolve(rootDir);
  const resolvedPath = resolve(resolvedRoot, candidatePath);
  const relativePath = relative(resolvedRoot, resolvedPath).replace(/\\/g, '/');

  if (
    relativePath === '' ||
    (!relativePath.startsWith('../') &&
      relativePath !== '..' &&
      !isAbsolute(relativePath))
  ) {
    return resolvedPath;
  }

  throw new Error(
    `[agentmarkup/next] Refusing to access ${label} outside ${resolvedRoot}: ${resolvedPath}`
  );
}

function buildLlmsTxtDiscoveryLink(href: string): string {
  return `<link rel="alternate" type="text/plain" href="${escapeAttribute(
    href
  )}" title="LLM-readable site summary" />`;
}

function hasLlmsTxtDiscoveryLinkForHref(html: string, href: string): boolean {
  return new RegExp(
    `<link\\b[^>]*rel=(['"])alternate\\1[^>]*type=(['"])text\\/plain\\2[^>]*href=(['"])${escapeRegExp(
      href
    )}\\3`,
    'i'
  ).test(html);
}

function buildMarkdownAlternateLink(href: string): string {
  return `<link rel="alternate" type="text/markdown" href="${escapeAttribute(
    href
  )}" title="Markdown version of this page" />`;
}

function hasMarkdownAlternateLinkForHref(html: string, href: string): boolean {
  const match = html.match(
    /<link\b[^>]*rel=(['"])alternate\1[^>]*type=(['"])text\/markdown\2[^>]*href=(['"])([\s\S]*?)\3/i
  );

  return match?.[4]?.trim() === href;
}

function validateMarkdownAlternateLinkForHref(
  html: string,
  expectedHref: string,
  pagePath: string
): ValidationResult[] {
  const match = html.match(
    /<link\b[^>]*rel=(['"])alternate\1[^>]*type=(['"])text\/markdown\2[^>]*href=(['"])([\s\S]*?)\3/i
  );

  if (!match) {
    return [
      {
        severity: 'warning',
        message: 'Page is missing a markdown alternate link in the head',
        path: pagePath,
      },
    ];
  }

  const actualHref = match[4]?.trim() ?? '';
  if (actualHref !== expectedHref) {
    return [
      {
        severity: 'warning',
        message: `Page markdown alternate link points to ${actualHref} instead of ${expectedHref}`,
        path: pagePath,
      },
    ];
  }

  return [];
}

function withBasePathContentSignalConfig(
  config: AgentMarkupConfig['contentSignalHeaders'],
  basePathValue: string | undefined
): AgentMarkupConfig['contentSignalHeaders'] {
  if (!config) {
    return config;
  }

  const basePath = normalizeBasePath(basePathValue);
  if (!basePath) {
    return config;
  }

  return {
    ...config,
    path: withBasePathPattern(config.path ?? '/*', basePath),
  };
}

function withBasePathPattern(path: string, basePath: string): string {
  if (!basePath || path === basePath || path.startsWith(`${basePath}/`)) {
    return path;
  }

  if (path === '/' || path === '/*') {
    return `${basePath}${path === '/*' ? '/*' : ''}`;
  }

  return `${basePath}${path.startsWith('/') ? path : `/${path}`}`;
}

function commonDirectory(filePaths: string[]): string | null {
  if (filePaths.length === 0) {
    return null;
  }

  let current = dirname(filePaths[0]);
  while (current !== dirname(current)) {
    const matchesAll = filePaths.every(
      (filePath) =>
        filePath === current ||
        filePath.startsWith(`${current}/`) ||
        filePath.startsWith(`${current}\\`)
    );

    if (matchesAll) {
      return current;
    }

    current = dirname(current);
  }

  return dirname(filePaths[0]);
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
