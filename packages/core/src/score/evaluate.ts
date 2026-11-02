// `evaluateSiteChecks`: runs every catalog check over a recorded `SiteEvidence` and
// returns `CheckResult[]` plus the run-level facts the formula needs. Deterministic:
// `now` comes from the options or `evidence.fetchedAt`, never from the clock.
import { SCORE_CATALOG } from './catalog.js';
import { axEvaluators } from './evaluators/ax.js';
import { contentEvaluators } from './evaluators/content.js';
import { discoveryEvaluators } from './evaluators/discovery.js';
import { identityEvaluators } from './evaluators/identity.js';
import { markdownEvaluators } from './evaluators/markdown.js';
import { navEvaluators } from './evaluators/nav.js';
import { reachEvaluators } from './evaluators/reach.js';
import { robotsEvaluators } from './evaluators/robots.js';
import {
  PageView,
  ResourceView,
  evidenceText,
  toCheckResult,
  type EvaluationContext,
  type EvaluatorEntry,
} from './evaluators/shared.js';
import { findChallengeMarker } from './evidence.js';
import { jsonLdTypes } from './html-lite.js';
import type {
  CheckDefinition,
  CheckResult,
  EvaluateOptions,
  SiteEvaluation,
  SiteEvidence,
  SitePlatform,
  SurfaceDetection,
} from './types.js';

/** One evaluator per implemented catalog id. */
export const EVALUATORS: Readonly<Record<string, EvaluatorEntry>> = {
  ...reachEvaluators,
  ...contentEvaluators,
  ...navEvaluators,
  ...axEvaluators,
  ...identityEvaluators,
  ...discoveryEvaluators,
  ...markdownEvaluators,
  ...robotsEvaluators,
};

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Platform from homepage markup: WordPress, Webflow, Squarespace or Wix, else null. */
export function detectPlatform(homepageHtml: string | null | undefined): SitePlatform | null {
  if (!homepageHtml) {
    return null;
  }
  if (/\/wp-content\//i.test(homepageHtml)) return 'wordpress';
  if (/webflow\.com/i.test(homepageHtml)) return 'webflow';
  if (/squarespace/i.test(homepageHtml)) return 'squarespace';
  if (/wixstatic/i.test(homepageHtml)) return 'wix';
  return null;
}

const API_PATH_RE = /^\/(?:api|docs|developers?|openapi|swagger)(?:\/|$)/i;
const MCP_PATH_RE = /^\/(?:\.well-known\/mcp\.json|mcp)(?:\/|$)/i;

function detectSurfacesFrom(context: EvaluationContext): SurfaceDetection {
  const homepage = context.homepage;
  const usable = homepage.ok && homepage.isHtml;
  const anchors = usable ? homepage.anchors(context.homepageUrl) : [];
  const link = homepage.header('link') ?? '';
  const sameOriginPaths = anchors
    .map((anchor) => anchor.resolved)
    .filter((url): url is URL => url !== null && url.origin === context.origin)
    .map((url) => url.pathname);
  const types = new Set<string>();
  if (usable) {
    for (const node of homepage.jsonLd.nodes) {
      for (const type of jsonLdTypes(node)) {
        types.add(type);
      }
    }
  }
  const markdown = [context.homepageMarkdown, context.sampleMarkdown].some((view) => view.isMarkdown);
  return {
    api: sameOriginPaths.some((path) => API_PATH_RE.test(path)) || /\/\.well-known\/api-catalog/i.test(link),
    mcp:
      sameOriginPaths.some((path) => MCP_PATH_RE.test(path)) ||
      /\.well-known\/mcp\.json/i.test(link) ||
      /rel\s*=\s*"?mcp\b/i.test(link),
    commerce:
      types.has('Product') || types.has('Offer') || sameOriginPaths.some((path) => /^\/pricing(?:\/|$)/i.test(path)),
    forms: usable && homepage.fields.total > 0,
    markdown,
  };
}

/** Surface detection over a `SiteEvidence` (section 3.4): api, mcp, commerce, forms, markdown. */
export function detectSurfaces(evidence: SiteEvidence, options: EvaluateOptions = {}): SurfaceDetection {
  return detectSurfacesFrom(buildContext(evidence, options));
}

function buildContext(evidence: SiteEvidence, options: EvaluateOptions): EvaluationContext {
  const now = options.now ?? evidence.fetchedAt;
  const nowMs = Date.parse(now);
  const homepage = new PageView(evidence.homepage);
  const homepageUrl = evidence.homepage?.finalUrl || evidence.homepage?.requestedUrl || evidence.targetUrl;
  const origin = originOf(homepageUrl) ?? originOf(evidence.targetUrl) ?? evidence.origin;
  return {
    evidence,
    now,
    nowMs: Number.isNaN(nowMs) ? 0 : nowMs,
    origin,
    homepageUrl,
    homepage,
    sample: new PageView(evidence.samplePage),
    llms: new ResourceView(evidence.llmsTxt),
    robots: new ResourceView(evidence.robotsTxt),
    sitemap: new ResourceView(evidence.sitemap),
    probe: new ResourceView(evidence.notFoundProbe ?? null),
    homepageMarkdown: new ResourceView(evidence.homepageMarkdown),
    sampleMarkdown: new ResourceView(evidence.samplePageMarkdown),
    results: new Map(),
  };
}

function surfaceOf(definition: CheckDefinition, surfaces: SurfaceDetection): boolean | null {
  if (!definition.surface) {
    return null;
  }
  return surfaces[definition.surface];
}

function notMeasured(definition: CheckDefinition, surfaces: SurfaceDetection): CheckResult {
  const surfacePresent = surfaceOf(definition, surfaces);
  if (surfacePresent === false) {
    return {
      id: definition.id,
      tier: definition.tier,
      status: 'na',
      fraction: null,
      evidence: evidenceText([`no ${definition.surface} surface detected on this site`]),
      reason: `no-${definition.surface}-surface`,
    };
  }
  return {
    id: definition.id,
    tier: definition.tier,
    status: 'not-measured',
    fraction: null,
    evidence: evidenceText([
      definition.availability === 'catalog-2.0'
        ? 'needs one extra fetch; a catalog 2.0 decision'
        : 'not measured in this catalog version',
    ]),
    reason: definition.availability === 'catalog-2.0' ? 'catalog-2.0' : 'not-measured',
  };
}

function homepageBlockedReason(context: EvaluationContext): string | null {
  const homepage = context.homepage;
  const resource = homepage.resource;
  if (!resource || homepage.unverified) {
    return null;
  }
  const marker = findChallengeMarker(resource);
  if (homepage.outcome === 'challenge') {
    return `HTTP ${resource.status} challenge page (${marker})`;
  }
  if (resource.status === 401 || resource.status === 403) {
    return `HTTP ${resource.status}`;
  }
  if (homepage.ok && marker) {
    return `HTTP ${resource.status} with challenge marker "${marker}"`;
  }
  return null;
}

/**
 * Evaluates every catalog check. Homepage unverified: every check `unverified` and the
 * run is `blocked`. Homepage challenged or 401/403: `reach.bot-detection` fails and every
 * homepage-derived check is `na` with reason `homepage-blocked`; the rest is scored.
 */
export function evaluateSiteChecks(evidence: SiteEvidence, options: EvaluateOptions = {}): SiteEvaluation {
  const context = buildContext(evidence, options);
  const homepage = context.homepage;
  const surfaces = detectSurfacesFrom(context);
  const platform = homepage.ok ? detectPlatform(homepage.body) : null;
  const base = {
    targetUrl: evidence.targetUrl,
    samplePageUrl: context.sample.resource?.finalUrl || context.sample.resource?.requestedUrl || null,
    fetchedAt: evidence.fetchedAt,
    platform,
    surfaces,
  };

  const unreachable =
    !homepage.resource ||
    homepage.unverified ||
    homepage.outcome === 'not-found' ||
    (homepage.outcome === 'http-error' && homepage.status !== 401 && homepage.status !== 403);
  if (unreachable) {
    const state = homepage.resource ? homepage.describeState() : 'homepage not recorded';
    const checks: CheckResult[] = SCORE_CATALOG.map((definition) => ({
      id: definition.id,
      tier: definition.tier,
      status: 'unverified',
      fraction: null,
      evidence: evidenceText([`homepage ${state}`]),
      reason: homepage.unverified || !homepage.resource ? 'homepage-unverified' : `homepage-http-${homepage.status}`,
      resources: ['homepage'],
    }));
    return { ...base, checks, blocked: true, blockedReason: `homepage ${state}` };
  }

  const blockedReason = homepageBlockedReason(context);
  const checks: CheckResult[] = [];
  for (const definition of SCORE_CATALOG) {
    const evaluator = definition.availability === 'now' ? EVALUATORS[definition.id] : undefined;
    let result: CheckResult;
    if (!evaluator) {
      result = notMeasured(definition, surfaces);
    } else if (blockedReason && evaluator.needsHomepage) {
      result = {
        id: definition.id,
        tier: definition.tier,
        status: 'na',
        fraction: null,
        evidence: evidenceText([`homepage blocked (${blockedReason}); a challenge page is never evaluated`]),
        reason: 'homepage-blocked',
        resources: ['homepage'],
      };
    } else {
      result = toCheckResult(definition.id, definition.tier, evaluator.run(context));
    }
    context.results.set(definition.id, result);
    checks.push(result);
  }
  return { ...base, checks, blocked: false, blockedReason: blockedReason ? `Agents cannot reach this site: ${blockedReason}` : null };
}
