import type {
  AnalysisStatus,
  FetchSummary,
  Grade,
  RemoteResource as CoreRemoteResource,
  ResourceOutcome,
  ScoreReport,
  ScoredCheck,
  SiteEvidence,
} from '@agentmarkup/core/score';

export type AuditLevel = 'pass' | 'warning' | 'error';
export type ResourceLevel = AuditLevel | 'info';

// The checker payload's resource shape is the score engine's evidence shape:
// the worker adds `outcome`, `durationMs`, `hops`, `skipped`, `headers`,
// `bodyBytes` and `bodyDropped` on top of the original fields.
export type RemoteResource = CoreRemoteResource;

export type {
  AnalysisStatus,
  FetchSummary,
  Grade,
  ResourceOutcome,
  ScoreReport,
  ScoredCheck,
  SiteEvidence,
};

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

/** The `/api/check` payload: a `SiteEvidence` plus cache and protection facts. */
export interface SiteCheckResponse extends SiteEvidence {
  normalizedFrom: string | null;
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
  /** Stable key: the catalog check id, or `unverified-<resource>` for a grouped transport failure. */
  id: string;
  /** The catalog check this finding reports, absent on grouped transport failures. */
  checkId?: string;
  level: AuditLevel;
  title: string;
  detail: string;
  action: string;
  docUrl?: string;
  agentmarkupHelp?: string;
}

export interface ResourceStatus {
  key:
    | 'homepage'
    | 'homepageMarkdown'
    | 'llmsTxt'
    | 'robotsTxt'
    | 'sitemap'
    | 'notFoundProbe'
    | 'samplePage'
    | 'samplePageMarkdown';
  level: ResourceLevel;
  label: string;
  url: string | null;
  status: string;
  detail: string;
  ok: boolean;
  agentmarkupHelp?: string;
}

export interface SiteAnalysis {
  normalizedUrl: string;
  normalizedFrom: string | null;
  items: AuditItem[];
  resources: ResourceStatus[];
  counts: Record<AuditLevel, number>;
  jsonLdTypes: string[];
  /** The agent-readiness score computed in the browser from the payload. */
  report: ScoreReport;
}
