import type { AgentMarkupConfig } from '@agentmarkup/core';

export interface NextHeader {
  key: string;
  value: string;
}

export interface NextHeaderRoute {
  source: string;
  headers: NextHeader[];
  basePath?: boolean;
  locale?: boolean;
  has?: unknown[];
  missing?: unknown[];
}

export interface NextConfigLike {
  output?: string;
  distDir?: string;
  basePath?: string;
  trailingSlash?: boolean;
  adapterPath?: string;
  experimental?: Record<string, unknown> & {
    adapterPath?: string;
  };
  headers?: NextHeaderRoute[] | (() => Promise<NextHeaderRoute[]> | NextHeaderRoute[]);
  [key: string]: unknown;
}

export interface NextAdapterLike {
  name?: string;
  modifyConfig?: (
    nextConfig: NextConfigLike,
    context: Record<string, unknown>
  ) => Promise<NextConfigLike> | NextConfigLike;
  onBuildComplete?: (
    context: NextAdapterContextLike
  ) => Promise<void> | void;
}

export interface NextAdapterContextLike {
  projectDir: string;
  repoRoot?: string;
  distDir?: string;
  config?: NextConfigLike;
  nextConfig?: NextConfigLike;
  outputs?: NextAdapterOutputsLike;
  nextVersion?: string;
  buildId?: string;
  [key: string]: unknown;
}

export interface NextAdapterOutputLike {
  filePath: string;
  pathname: string;
  [key: string]: unknown;
}

export interface NextAdapterPrerenderLike {
  pathname: string;
  fallback?: {
    filePath?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface NextAdapterOutputsLike {
  pages?: NextAdapterOutputLike[];
  appPages?: NextAdapterOutputLike[];
  pagesApi?: NextAdapterOutputLike[];
  appRoutes?: NextAdapterOutputLike[];
  staticFiles?: NextAdapterOutputLike[];
  prerenders?: NextAdapterPrerenderLike[];
  middleware?: unknown;
}

export interface ProcessNextBuildOptions {
  projectDir: string;
  distDir?: string;
  nextConfig?: NextConfigLike;
  outputs?: NextAdapterOutputsLike;
}

export interface ProcessNextBuildResult {
  mode: 'export' | 'server';
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
}

export interface AgentmarkupNextPluginResult {
  config: AgentMarkupConfig;
  nextConfig: NextConfigLike;
}
