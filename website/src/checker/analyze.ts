// Website checker adapter: turns a `/api/check` payload into the findings the
// page renders. Every finding comes from the score engine in `@agentmarkup/core`
// through `check-copy.ts`; this file only adds the resource panel. No DOM APIs,
// so it runs in the browser, in Node tests and in the Studio import tool alike.
import { findExistingJsonLdTypes, validateHtmlContent } from '@agentmarkup/core';
import { classifyResource, evaluateSiteChecks, scoreChecks } from '@agentmarkup/core/score';

import { auditItemsForReport } from './check-copy';
import type {
  AuditItem,
  AuditLevel,
  RemoteResource,
  ResourceLevel,
  ResourceStatus,
  SiteAnalysis,
  SiteCheckResponse,
} from './types';

const AGENTMARKUP = {
  llms:
    'agentmarkup can generate /llms.txt at build time and add the homepage discovery link automatically.',
  markdown:
    'agentmarkup can generate markdown mirrors from final HTML and advertise them with a markdown alternate link.',
  markdownOptional:
    'agentmarkup can still add markdown mirrors for cleaner LLM fetches, but this page already serves meaningful raw HTML.',
  crawlers:
    'agentmarkup can patch robots.txt with explicit AI crawler directives and emit Content-Signal headers.',
  notFound:
    'agentmarkup cannot fix this for you: the status code for an unknown path is decided by your host or framework, not by your build output. On static hosts it usually means emitting a 404.html so the platform stops falling back to index.html.',
  sitemap:
    'agentmarkup does not generate sitemaps, but it pairs well with a published sitemap and explicit crawler metadata.',
  reachability:
    'agentmarkup can layer on llms.txt, JSON-LD, markdown mirrors, and crawler controls, but the page still needs to be publicly reachable first.',
} as const;

type MarkdownRequirement = 'required' | 'optional' | 'undetermined';

export function analyzeSiteCheck(result: SiteCheckResponse): SiteAnalysis {
  const report = scoreChecks(evaluateSiteChecks(result));
  const items = auditItemsForReport(report);

  return {
    normalizedUrl: result.targetUrl,
    normalizedFrom: result.normalizedFrom,
    items,
    resources: buildResourceStatuses(result),
    counts: countByLevel(items),
    jsonLdTypes: getJsonLdTypes(result.homepage.body),
    report,
  };
}

function buildResourceStatuses(result: SiteCheckResponse): ResourceStatus[] {
  const homepageMarkdownRequirement = getMarkdownRequirement(result.homepage);
  const samplePageMarkdownRequirement = getMarkdownRequirement(result.samplePage);
  const resources: ResourceStatus[] = [
    buildResourceStatus('homepage', 'Homepage', result.homepage),
    buildMarkdownResourceStatus(
      'homepageMarkdown',
      'Homepage markdown',
      result.homepageMarkdown,
      homepageMarkdownRequirement
    ),
    buildResourceStatus('llmsTxt', 'llms.txt', result.llmsTxt),
    buildResourceStatus('robotsTxt', 'robots.txt', result.robotsTxt),
    buildResourceStatus('sitemap', 'Sitemap', result.sitemap),
  ];

  if (result.notFoundProbe) {
    resources.push(buildProbeStatus(result.notFoundProbe));
  }

  if (result.samplePage) {
    resources.push(
      buildResourceStatus('samplePage', 'Sample linked page', result.samplePage)
    );
  }

  if (result.samplePageMarkdown) {
    resources.push(
      buildMarkdownResourceStatus(
        'samplePageMarkdown',
        'Sample linked markdown',
        result.samplePageMarkdown,
        samplePageMarkdownRequirement
      )
    );
  }

  return resources;
}

function buildResourceStatus(
  key: ResourceStatus['key'],
  label: string,
  resource: RemoteResource | null
): ResourceStatus {
  const level = inferResourceLevel(key, resource);

  if (!resource) {
    return {
      key,
      level,
      label,
      url: null,
      status: 'Not checked',
      detail: 'This resource was not fetched.',
      ok: false,
      agentmarkupHelp: inferResourceAgentmarkupHelp(key, level),
    };
  }

  // The engine's classification wins over `ok`: a 2xx whose body could not be read
  // (error set, body null) is unverified, not a fetched resource.
  const fetched = resource.ok && classifyResource(resource) !== 'unverified';
  return {
    key,
    level,
    label,
    url: resource.finalUrl || resource.requestedUrl,
    status: statusLabel(resource),
    detail: fetched
      ? `Fetched ${resource.finalUrl || resource.requestedUrl}${durationNote(resource)}`
      : buildFetchFailureDetail(resource, label),
    ok: fetched,
    agentmarkupHelp: inferResourceAgentmarkupHelp(key, level),
  };
}

/**
 * The probe for a path that cannot exist: a real 404 or 410 is the good state
 * here, a 2xx or a redirect is the finding the `nav.not-found` check reports.
 */
function buildProbeStatus(resource: RemoteResource): ResourceStatus {
  const outcome = classifyResource(resource);
  const level: ResourceLevel =
    outcome === 'not-found' ? 'pass' : outcome === 'unverified' ? 'warning' : 'warning';
  const detail =
    outcome === 'not-found'
      ? `A path that cannot exist answered HTTP ${resource.status}${resource.contentType ? ` as ${resource.contentType}` : ''}, so an agent can tell a missing resource from a real one.${durationNote(resource)}`
      : outcome === 'unverified'
        ? buildFetchFailureDetail(resource, 'the missing-path probe')
        : `A path that cannot exist answered HTTP ${resource.status}; the nav.not-found finding above explains what that means.`;
  return {
    key: 'notFoundProbe',
    level,
    label: 'Missing-path probe',
    url: resource.finalUrl || resource.requestedUrl,
    status: statusLabel(resource),
    detail,
    ok: outcome === 'not-found',
    agentmarkupHelp: AGENTMARKUP.notFound,
  };
}

function buildMarkdownResourceStatus(
  key: Extract<ResourceStatus['key'], 'homepageMarkdown' | 'samplePageMarkdown'>,
  label: string,
  resource: RemoteResource | null,
  requirement: MarkdownRequirement
): ResourceStatus {
  if (!resource || !resource.ok || !resource.body) {
    const unverified = resource ? classifyResource(resource) === 'unverified' : false;
    const level: ResourceLevel = unverified
      ? 'warning'
      : requirement === 'required'
        ? resource?.status === 404
          ? 'warning'
          : 'error'
        : 'info';
    const detail = buildMarkdownFailureDetail(resource, requirement);

    return {
      key,
      level,
      label,
      url: resource?.finalUrl || resource?.requestedUrl || null,
      status: resource
        ? statusLabel(resource)
        : requirement === 'required'
          ? 'Request failed'
          : 'Optional',
      detail,
      ok: false,
      agentmarkupHelp:
        requirement === 'optional'
          ? AGENTMARKUP.markdownOptional
          : AGENTMARKUP.markdown,
    };
  }

  const markdownScore = assessMarkdownBody(resource.body);
  if (!markdownScore.ok) {
    return {
      key,
      level: 'warning',
      label,
      url: resource.finalUrl || resource.requestedUrl,
      status: statusLabel(resource),
      detail: markdownScore.detail,
      ok: false,
      agentmarkupHelp: AGENTMARKUP.markdown,
    };
  }

  return {
    key,
    level: 'pass',
    label,
    url: resource.finalUrl || resource.requestedUrl,
    status: statusLabel(resource),
    detail: `Fetched ${resource.finalUrl} and found readable markdown content.${durationNote(resource)}`,
    ok: true,
  };
}

function statusLabel(resource: RemoteResource): string {
  if (resource.skipped) {
    return 'Not fetched';
  }
  if (resource.status) {
    return `HTTP ${resource.status}`;
  }
  return 'Request failed';
}

function durationNote(resource: RemoteResource): string {
  return typeof resource.durationMs === 'number' ? ` in ${resource.durationMs} ms` : '';
}

function buildFetchFailureDetail(resource: RemoteResource, label: string): string {
  if (classifyResource(resource) === 'unverified') {
    const reason = resource.skipped
      ? 'the request budget was exhausted before it started'
      : resource.error
        ? resource.error.replace(/\.$/, '')
        : resource.status
          ? `HTTP ${resource.status} without a readable body`
          : 'no response';
    return `${capitalize(label)} could not be verified on this run (${reason}). A fetch that did not complete, a rate limit or a server error is never counted against the site; re-run the check.`;
  }

  if (resource.status) {
    return `The checker fetched ${resource.requestedUrl} and received HTTP ${resource.status}.`;
  }

  return `The checker could not fetch ${resource.requestedUrl}.`;
}

/** Sentence-cases a label, but never a file name such as llms.txt or robots.txt. */
function capitalize(value: string): string {
  return /^[\w-]+\.\w+/.test(value) ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

function looksLikeHtml(resource: RemoteResource): boolean {
  const contentType = resource.contentType?.toLowerCase() ?? '';
  return contentType.includes('text/html') || resource.body?.includes('<html') === true;
}

function assessMarkdownBody(markdown: string): { ok: boolean; detail: string } {
  if (/<html[\s>]/i.test(markdown) || /<body[\s>]/i.test(markdown)) {
    return {
      ok: false,
      detail: 'The fetched markdown resource still looks like raw HTML rather than a cleaned markdown mirror.',
    };
  }

  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[>#*_()[\]-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length < 120) {
    return {
      ok: false,
      detail: 'The fetched markdown exists, but it is still very thin and would not give an LLM much more context than a title and description.',
    };
  }

  return {
    ok: true,
    detail: 'Readable markdown content is available.',
  };
}

function resourceNeedsMarkdownMirror(resource: RemoteResource | null): boolean {
  if (!resource?.ok || !resource.body || !looksLikeHtml(resource)) {
    return false;
  }

  return validateHtmlContent(resource.body, resource.finalUrl || resource.requestedUrl)
    .length > 0;
}

function getMarkdownRequirement(resource: RemoteResource | null): MarkdownRequirement {
  if (!resource?.ok || !resource.body || !looksLikeHtml(resource)) {
    return 'undetermined';
  }

  return resourceNeedsMarkdownMirror(resource) ? 'required' : 'optional';
}

function buildMarkdownFailureDetail(
  resource: RemoteResource | null,
  requirement: MarkdownRequirement
): string {
  if (requirement === 'required') {
    return resource
      ? buildFetchFailureDetail(resource, 'markdown resource')
      : 'The checker did not fetch a markdown resource here.';
  }

  if (requirement === 'optional') {
    return resource
      ? `${buildFetchFailureDetail(resource, 'markdown resource')} The paired HTML already looks substantial, so this mirror is optional.`
      : 'The checker did not fetch a markdown resource here. The paired HTML already looks substantial, so this mirror is optional.';
  }

  return resource
    ? `${buildFetchFailureDetail(resource, 'markdown resource')} The paired HTML page could not be fetched successfully, so this mirror was not treated as required.`
    : 'The checker did not fetch a markdown resource here because the paired HTML page could not be fetched successfully.';
}

function getJsonLdTypes(html: string | null): string[] {
  if (!html) {
    return [];
  }

  return Array.from(findExistingJsonLdTypes(html)).sort();
}

function countByLevel(items: AuditItem[]): Record<AuditLevel, number> {
  return items.reduce<Record<AuditLevel, number>>(
    (counts, item) => {
      counts[item.level] += 1;
      return counts;
    },
    { error: 0, warning: 0, pass: 0 }
  );
}

function inferResourceLevel(
  key: ResourceStatus['key'],
  resource: RemoteResource | null
): ResourceLevel {
  if (!resource) {
    switch (key) {
      case 'samplePage':
      case 'samplePageMarkdown':
        return 'info';
      default:
        return 'warning';
    }
  }

  // A transport failure is an unknown state, never evidence against the site. It is
  // checked before `ok`: a 2xx with an error and no readable body is unverified.
  if (classifyResource(resource) === 'unverified') {
    return 'warning';
  }

  if (resource.ok) {
    return 'pass';
  }

  switch (key) {
    case 'homepage':
      return 'error';
    case 'llmsTxt':
    case 'robotsTxt':
      return resource.status === 404 ? 'warning' : 'error';
    case 'sitemap':
    case 'samplePage':
      return 'warning';
    default:
      return resource.status === 404 ? 'warning' : 'error';
  }
}

function inferResourceAgentmarkupHelp(
  key: ResourceStatus['key'],
  level: ResourceLevel
): string | undefined {
  switch (key) {
    case 'homepage':
      return AGENTMARKUP.reachability;
    case 'homepageMarkdown':
    case 'samplePageMarkdown':
      return level === 'info' ? AGENTMARKUP.markdownOptional : AGENTMARKUP.markdown;
    case 'llmsTxt':
      return AGENTMARKUP.llms;
    case 'robotsTxt':
      return AGENTMARKUP.crawlers;
    case 'sitemap':
      return AGENTMARKUP.sitemap;
    case 'notFoundProbe':
      return AGENTMARKUP.notFound;
    case 'samplePage':
      return AGENTMARKUP.reachability;
  }
}
