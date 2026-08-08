export type AuditLevel = 'pass' | 'warning' | 'error';
export type ResourceLevel = AuditLevel | 'info';

export interface RemoteResource {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  contentType: string | null;
  body: string | null;
  error?: string;
  xRobotsTag?: string | null;
  headers?: Record<string, string | null>;
  cookies?: CookieMeta[] | null;
}

export interface CookieMeta {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string | null;
}

export interface DnsResult {
  status: number;
  ad: boolean;
  answers: string[];
}

export interface HttpProbeResult {
  requestedUrl: string;
  status: number;
  location: string | null;
  error?: string;
}

export interface SecurityScanResponse {
  targetUrl: string;
  origin: string;
  fetchedAt: string;
  normalizedFrom: string | null;
  homepage: RemoteResource;
  httpProbe: HttpProbeResult | null;
  securityTxt: RemoteResource;
  securityTxtFallback: RemoteResource | null;
  crossOriginRedirect: boolean;
  dns: {
    spf: DnsResult | null;
    dmarc: DnsResult | null;
    dnssec: DnsResult | null;
  };
  cache?: {
    hit: boolean;
    cachedAt: string | null;
    expiresAt: string | null;
  };
  protection?: {
    rateLimitWindowSeconds: number;
    maxChecksPerWindow: number;
    remainingChecks: number | null;
    turnstileThreshold: number | null;
    turnstileVerified: boolean;
  };
}

export interface SecurityScanErrorResponse {
  error: string;
  retryAfterSeconds?: number | null;
  turnstileRequired?: boolean;
  turnstileSiteKey?: string | null;
}

export interface SecurityAuditItem {
  level: AuditLevel;
  title: string;
  detail: string;
  explainer: string;
  docUrl?: string;
}

export interface SecurityResourceStatus {
  key: string;
  level: ResourceLevel;
  label: string;
  url: string | null;
  status: string;
  detail: string;
  ok: boolean;
  explainer?: string;
}

export interface SecurityScanAnalysis {
  normalizedUrl: string;
  normalizedFrom: string | null;
  items: SecurityAuditItem[];
  resources: SecurityResourceStatus[];
  counts: Record<AuditLevel, number>;
}
