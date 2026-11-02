// Shared evaluation context and result helpers for the per-check evaluators.
import {
  classifyResource,
  isHtmlBody,
  isMarkdownResource,
  isTextResource,
  readEvaluatedBody,
} from '../evidence.js';
import {
  collectAnchors,
  collectControls,
  collectFields,
  extractBodyText,
  extractHead,
  headingSequence,
  parseJsonLd,
  type AnchorEntry,
  type ControlSummary,
  type FieldSummary,
  type HeadingEntry,
  type JsonLdSummary,
} from '../html-lite.js';
import { roundTo } from '../formula.js';
import type {
  CheckResult,
  CheckStatus,
  CheckTier,
  EvidenceResourceKey,
  RemoteResource,
  ResourceOutcome,
  SiteEvidence,
} from '../types.js';

export const MAX_EVIDENCE_CHARS = 600;

/** Evidence strings carry counts, ids, URLs, attribute and header values only. */
export function evidenceText(parts: Array<string | null | undefined>): string {
  const joined = parts.filter((part): part is string => Boolean(part && part.trim())).join('; ');
  const cleaned = joined.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  return cleaned.length > MAX_EVIDENCE_CHARS ? `${cleaned.slice(0, MAX_EVIDENCE_CHARS - 3)}...` : cleaned;
}

export function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

/** A fetched resource with its classification and the capped body. */
export class ResourceView {
  readonly resource: RemoteResource | null;
  readonly outcome: ResourceOutcome;
  readonly body: string;
  readonly truncated: boolean;

  constructor(resource: RemoteResource | null | undefined) {
    this.resource = resource ?? null;
    this.outcome = classifyResource(resource);
    const evaluated = readEvaluatedBody(resource);
    this.body = evaluated.text;
    this.truncated = evaluated.truncated;
  }

  get status(): number {
    return this.resource?.status ?? 0;
  }

  get contentType(): string {
    return (this.resource?.contentType ?? '').toLowerCase();
  }

  get mediaType(): string {
    return this.contentType.split(';')[0].trim() || 'no content-type';
  }

  get finalUrl(): string | null {
    return this.resource?.finalUrl || this.resource?.requestedUrl || null;
  }

  get ok(): boolean {
    return this.outcome === 'ok';
  }

  get unverified(): boolean {
    return this.outcome === 'unverified';
  }

  get absent(): boolean {
    return this.outcome === 'absent';
  }

  get isText(): boolean {
    return isTextResource(this.resource);
  }

  get isMarkdown(): boolean {
    return isMarkdownResource(this.resource);
  }

  get isHtml(): boolean {
    return this.ok && (this.contentType.includes('text/html') || isHtmlBody(this.body));
  }

  header(name: string): string | null {
    const headers = this.resource?.headers;
    if (!headers) {
      return null;
    }
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === name && typeof value === 'string') {
        return value;
      }
    }
    return null;
  }

  get hasHeaders(): boolean {
    return Boolean(this.resource?.headers);
  }

  /** Short description of why a resource is not usable, for evidence strings. */
  describeState(): string {
    const resource = this.resource;
    if (!resource) {
      return 'not requested';
    }
    if (this.outcome === 'unverified') {
      if (resource.skipped) {
        return 'not fetched (request budget exhausted)';
      }
      if (resource.error) {
        return `could not be verified in time (${resource.error.replace(/\.$/, '')})`;
      }
      if (resource.status > 0 && resource.body === null && resource.status < 300) {
        return `HTTP ${resource.status} with no readable body`;
      }
      return `could not be verified in time (HTTP ${resource.status})`;
    }
    return `HTTP ${resource.status} ${this.mediaType}`;
  }

  truncationNote(): string | null {
    return this.truncated ? 'body truncated to 1,048,576 characters' : null;
  }
}

/** Lazily parsed HTML page (homepage or sample page). */
export class PageView extends ResourceView {
  private textCache: string | null = null;
  private headCache: string | null = null;
  private headingsCache: HeadingEntry[] | null = null;
  private jsonLdCache: JsonLdSummary | null = null;
  private controlsCache: ControlSummary | null = null;
  private fieldsCache: FieldSummary | null = null;
  private anchorsCache: AnchorEntry[] | null = null;

  get text(): string {
    if (this.textCache === null) {
      this.textCache = extractBodyText(this.body);
    }
    return this.textCache;
  }

  get head(): string {
    if (this.headCache === null) {
      this.headCache = extractHead(this.body);
    }
    return this.headCache;
  }

  get headings(): HeadingEntry[] {
    if (this.headingsCache === null) {
      this.headingsCache = headingSequence(this.body);
    }
    return this.headingsCache;
  }

  get jsonLd(): JsonLdSummary {
    if (this.jsonLdCache === null) {
      this.jsonLdCache = parseJsonLd(this.body);
    }
    return this.jsonLdCache;
  }

  get controls(): ControlSummary {
    if (this.controlsCache === null) {
      this.controlsCache = collectControls(this.body);
    }
    return this.controlsCache;
  }

  get fields(): FieldSummary {
    if (this.fieldsCache === null) {
      this.fieldsCache = collectFields(this.body);
    }
    return this.fieldsCache;
  }

  anchors(baseUrl: string): AnchorEntry[] {
    if (this.anchorsCache === null) {
      this.anchorsCache = collectAnchors(this.body, baseUrl);
    }
    return this.anchorsCache;
  }
}

export interface EvaluationContext {
  evidence: SiteEvidence;
  /** ISO timestamp used for freshness rules. */
  now: string;
  nowMs: number;
  /** Origin of the final homepage URL (never the requested URL). */
  origin: string;
  homepageUrl: string;
  homepage: PageView;
  sample: PageView;
  llms: ResourceView;
  robots: ResourceView;
  sitemap: ResourceView;
  probe: ResourceView;
  homepageMarkdown: ResourceView;
  sampleMarkdown: ResourceView;
  /** Results of checks evaluated earlier in catalog order. */
  results: Map<string, CheckResult>;
}

export interface EvaluatorOutput {
  fraction?: number | null;
  status?: Extract<CheckStatus, 'na' | 'unverified'>;
  reason?: string;
  evidence: string;
  resources: EvidenceResourceKey[];
}

export type Evaluator = (context: EvaluationContext) => EvaluatorOutput;

export interface EvaluatorEntry {
  run: Evaluator;
  /** True when the check reads the homepage body; `na` when the homepage is blocked. */
  needsHomepage: boolean;
}

export function scored(
  fraction: number,
  evidence: string,
  resources: EvidenceResourceKey[]
): EvaluatorOutput {
  return { fraction: roundTo(Math.min(1, Math.max(0, fraction)), 3), evidence, resources };
}

export function notApplicable(
  reason: string,
  evidence: string,
  resources: EvidenceResourceKey[]
): EvaluatorOutput {
  return { status: 'na', reason, evidence, resources };
}

export function unverified(
  reason: string,
  evidence: string,
  resources: EvidenceResourceKey[]
): EvaluatorOutput {
  return { status: 'unverified', reason, evidence, resources };
}

export function toCheckResult(id: string, tier: CheckTier, output: EvaluatorOutput): CheckResult {
  const evidence = evidenceText([output.evidence]);
  if (output.status === 'na' || output.status === 'unverified') {
    return {
      id,
      tier,
      status: output.status,
      fraction: null,
      evidence,
      reason: output.reason ?? output.status,
      resources: output.resources,
    };
  }
  const fraction = output.fraction ?? 0;
  const status: CheckStatus = fraction >= 1 ? 'pass' : fraction <= 0 ? 'fail' : 'partial';
  return {
    id,
    tier,
    status,
    fraction: fraction >= 1 ? 1 : fraction <= 0 ? 0 : fraction,
    evidence,
    resources: output.resources,
  };
}

/** `about N tokens` at 4 characters per token. */
export function tokenEstimate(chars: number): string {
  return `about ${formatCount(Math.round(chars / 4))} tokens at 4 chars per token`;
}

export function sampleState(context: EvaluationContext): string {
  const sample = context.sample;
  if (sample.absent) {
    return 'no sample page (no same-origin link on the homepage)';
  }
  if (sample.unverified) {
    return `sample page ${sample.finalUrl ?? ''} ${sample.describeState()}`.trim();
  }
  if (!sample.ok) {
    return `sample page ${sample.finalUrl ?? ''} answered HTTP ${sample.status}`;
  }
  if (!sample.isHtml) {
    return `sample page ${sample.finalUrl ?? ''} is not HTML (${sample.mediaType})`;
  }
  return `sample page ${sample.finalUrl ?? ''}`;
}

/** Sample page usable as an HTML page for content rules. */
export function sampleUsable(context: EvaluationContext): boolean {
  return context.sample.ok && context.sample.isHtml;
}
