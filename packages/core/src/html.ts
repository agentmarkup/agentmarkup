import type { AgentMarkupConfig, JsonLdBase } from './types.js';

export function collectSchemasForPage(
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

export function normalizePagePath(path: string): string {
  const cleanPath = path.split(/[?#]/, 1)[0];
  const withoutIndex = cleanPath.replace(/\/index\.html$/i, '/');
  const withoutHtml = withoutIndex.replace(/\.html$/i, '');

  if (withoutHtml === '' || withoutHtml === '/') {
    return '/';
  }

  return withoutHtml.endsWith('/') ? withoutHtml.slice(0, -1) : withoutHtml;
}

export function matchesPage(actual: string, configured: string): boolean {
  return normalizePagePath(actual) === normalizePagePath(configured);
}

export function injectJsonLdTags(html: string, tags: string): string {
  return (
    injectBeforePattern(html, tags, /<\/head\s*>/i) ??
    injectBeforePattern(html, tags, /<body\b[^>]*>/i) ??
    `${html}\n${tags}`
  );
}

export function hasExistingJsonLdScripts(html: string): boolean {
  return /<script\b[^>]*type=(['"])application\/ld\+json\1[^>]*>/i.test(html);
}

export function findExistingJsonLdTypes(html: string): Set<string> {
  const types = new Set<string>();
  const pattern =
    /<script\b[^>]*type=(['"])application\/ld\+json\1[^>]*>([\s\S]*?)<\/script\s*>/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const content = match[2].trim();
    if (!content) {
      continue;
    }

    try {
      collectJsonLdTypes(JSON.parse(content), types);
    } catch {
      // Ignore invalid or non-JSON script content. Existing validation remains explicit.
    }
  }

  return types;
}

export function filterJsonLdByExistingTypes(
  schemas: JsonLdBase[],
  html: string
): JsonLdBase[] {
  const existingTypes = findExistingJsonLdTypes(html);
  if (existingTypes.size === 0) {
    return schemas;
  }

  return schemas.filter((schema) =>
    getJsonLdTypes(schema).every((type) => !existingTypes.has(type))
  );
}

function injectBeforePattern(
  html: string,
  content: string,
  pattern: RegExp
): string | null {
  const match = pattern.exec(html);

  if (!match || match.index === undefined) {
    return null;
  }

  return `${html.slice(0, match.index)}${content}\n${html.slice(match.index)}`;
}

function collectJsonLdTypes(value: unknown, types: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectJsonLdTypes(item, types);
    }
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  const record = value as Record<string, unknown>;

  for (const type of getTypeValues(record['@type'])) {
    types.add(type);
  }

  if ('@graph' in record) {
    collectJsonLdTypes(record['@graph'], types);
  }
}

function getJsonLdTypes(schema: JsonLdBase): string[] {
  return getTypeValues(schema['@type']);
}

function getTypeValues(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value.toLowerCase()];
  }

  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.toLowerCase());
  }

  return [];
}
