import { fileURLToPath } from 'node:url';
import type { AgentMarkupConfig } from '@agentmarkup/core';
import { generateContentSignalHeaderValue } from '@agentmarkup/core';
import type {
  NextConfigLike,
  NextHeaderRoute,
  AgentmarkupNextPluginResult,
} from './types.js';

export * from '@agentmarkup/core';
export { processNextBuildOutput } from './build.js';
export type {
  NextConfigLike,
  NextHeader,
  NextHeaderRoute,
  NextAdapterContextLike,
  ProcessNextBuildOptions,
  ProcessNextBuildResult,
  AgentmarkupNextPluginResult,
} from './types.js';

export const AGENTMARKUP_NEXT_CONFIG_ENV = 'AGENTMARKUP_NEXT_CONFIG';
export const AGENTMARKUP_NEXT_PREVIOUS_ADAPTER_ENV =
  'AGENTMARKUP_NEXT_PREVIOUS_ADAPTER';

export function withAgentmarkup(
  config: AgentMarkupConfig,
  nextConfig: NextConfigLike = {}
): NextConfigLike {
  const adapterPath = fileURLToPath(new URL('./adapter.js', import.meta.url));
  const previousAdapterPath =
    typeof nextConfig.adapterPath === 'string'
      ? nextConfig.adapterPath
      : typeof nextConfig.experimental?.adapterPath === 'string'
        ? nextConfig.experimental.adapterPath
        : '';
  const nextExperimental = { ...(nextConfig.experimental ?? {}) };
  delete nextExperimental.adapterPath;

  process.env[AGENTMARKUP_NEXT_CONFIG_ENV] = encodeAgentmarkupConfig(config);
  process.env[AGENTMARKUP_NEXT_PREVIOUS_ADAPTER_ENV] = previousAdapterPath;

  const mergedConfig: NextConfigLike = {
    ...nextConfig,
    adapterPath,
    experimental: Object.keys(nextExperimental).length > 0 ? nextExperimental : undefined,
  };

  if (!isStaticExport(mergedConfig)) {
    const additionalHeaders = getAgentmarkupHeaders(config, mergedConfig);
    mergedConfig.headers = mergeHeaders(nextConfig.headers, additionalHeaders);
  }

  return mergedConfig;
}

export function agentmarkup(
  config: AgentMarkupConfig,
  nextConfig: NextConfigLike = {}
): NextConfigLike {
  return withAgentmarkup(config, nextConfig);
}

export function createAgentmarkupNextConfig(
  config: AgentMarkupConfig,
  nextConfig: NextConfigLike = {}
): AgentmarkupNextPluginResult {
  return {
    config,
    nextConfig: withAgentmarkup(config, nextConfig),
  };
}

export function getAgentmarkupHeaders(
  config: AgentMarkupConfig,
  nextConfig: NextConfigLike = {}
): NextHeaderRoute[] {
  const routes: NextHeaderRoute[] = [];
  const basePath = normalizeBasePath(nextConfig.basePath);

  if (config.contentSignalHeaders?.enabled !== false && config.contentSignalHeaders) {
    routes.push({
      source: withBasePath(
        toNextSourcePattern(config.contentSignalHeaders.path ?? '/*'),
        basePath
      ),
      headers: [
        {
          key: 'Content-Signal',
          value: generateContentSignalHeaderValue(config.contentSignalHeaders),
        },
      ],
    });
  }

  if (config.markdownPages?.enabled !== false && config.markdownPages) {
    const base = config.site.replace(/\/$/, '');
    routes.push({
      source: withBasePath('/:agentmarkupPath*.md', basePath),
      headers: [
        {
          key: 'Link',
          value: `<${base}/:agentmarkupPath*>; rel="canonical"`,
        },
      ],
    });
    routes.push({
      source: withBasePath('/index.md', basePath),
      headers: [
        {
          key: 'Link',
          value: `<${base}/>; rel="canonical"`,
        },
      ],
    });
  }

  return routes;
}

export function encodeAgentmarkupConfig(config: AgentMarkupConfig): string {
  return Buffer.from(JSON.stringify(config), 'utf8').toString('base64url');
}

export function decodeAgentmarkupConfig(encoded: string): AgentMarkupConfig {
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AgentMarkupConfig;
}

function toNextSourcePattern(path: string): string {
  if (path === '/*') {
    return '/:path*';
  }

  if (path.endsWith('/*')) {
    const prefix = path.slice(0, -2) || '';
    return `${prefix}/:path*`;
  }

  return path;
}

function mergeHeaders(
  existing: NextConfigLike['headers'],
  additional: NextHeaderRoute[]
): () => Promise<NextHeaderRoute[]> {
  return async () => {
    const current = await resolveHeaders(existing);
    return [...current, ...additional];
  };
}

async function resolveHeaders(
  headers: NextConfigLike['headers']
): Promise<NextHeaderRoute[]> {
  if (!headers) {
    return [];
  }

  if (typeof headers === 'function') {
    return headers();
  }

  return headers;
}

function isStaticExport(nextConfig: NextConfigLike): boolean {
  return nextConfig.output === 'export';
}

function normalizeBasePath(basePath: string | undefined): string {
  if (!basePath || basePath === '/') {
    return '';
  }

  const withLeadingSlash = basePath.startsWith('/') ? basePath : `/${basePath}`;
  return withLeadingSlash.replace(/\/$/, '');
}

function withBasePath(path: string, basePath: string): string {
  if (!basePath || path === basePath || path.startsWith(`${basePath}/`)) {
    return path;
  }

  if (path === '/') {
    return basePath;
  }

  return `${basePath}${path.startsWith('/') ? path : `/${path}`}`;
}
