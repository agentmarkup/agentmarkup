export type AuditLevel = 'pass' | 'warning' | 'error';

export interface RemoteResource {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  contentType: string | null;
  body: string | null;
  error?: string;
  xRobotsTag?: string | null;
}

export interface CheckerCacheStatus {
  hit: boolean;
  cachedAt: string | null;
  expiresAt: string | null;
}

export interface CheckerProtectionStatus {
  rateLimitWindowSeconds: number;
  maxChecksPerWindow: number;
  remainingChecks: number | null;
  turnstileThreshold: number | null;
  turnstileVerified: boolean;
}

export interface SiteCheckResponse {
  targetUrl: string;
  origin: string;
  fetchedAt: string;
  normalizedFrom: string | null;
  homepage: RemoteResource;
  homepageMarkdown: RemoteResource | null;
  llmsTxt: RemoteResource;
  robotsTxt: RemoteResource;
  sitemap: RemoteResource | null;
  sitemapUrl: string | null;
  sitemapSource: 'robots' | 'default' | null;
  samplePage: RemoteResource | null;
  samplePageMarkdown: RemoteResource | null;
  cache?: CheckerCacheStatus;
  protection?: CheckerProtectionStatus;
}

export interface CheckerErrorResponse {
  error: string;
  retryAfterSeconds?: number | null;
  turnstileRequired?: boolean;
  turnstileSiteKey?: string | null;
}

export interface AuditItem {
  level: AuditLevel;
  title: string;
  detail: string;
  action: string;
  docUrl?: string;
}

export interface ResourceStatus {
  key:
    | 'homepage'
    | 'homepageMarkdown'
    | 'llmsTxt'
    | 'robotsTxt'
    | 'sitemap'
    | 'samplePage'
    | 'samplePageMarkdown';
  label: string;
  url: string | null;
  status: string;
  detail: string;
  ok: boolean;
}

export interface SiteAnalysis {
  normalizedUrl: string;
  normalizedFrom: string | null;
  items: AuditItem[];
  resources: ResourceStatus[];
  counts: Record<AuditLevel, number>;
  jsonLdTypes: string[];
}
