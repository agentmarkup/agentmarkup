import {
  findExistingJsonLdTypes,
  hasExistingJsonLdScripts,
  validateExistingJsonLd,
  validateHtmlContent,
  validateLlmsTxt,
  validateRobotsTxt,
} from '@agentmarkup/core';

import type {
  AuditItem,
  AuditLevel,
  RemoteResource,
  ResourceStatus,
  SiteAnalysis,
  SiteCheckResponse,
} from './types';

const DOCS = {
  llms: '/docs/llms-txt/',
  jsonLd: '/docs/json-ld/',
  crawlers: '/docs/ai-crawlers/',
} as const;

const TARGET_CRAWLERS = {
  GPTBot: 'allow',
  ClaudeBot: 'allow',
  PerplexityBot: 'allow',
  'Google-Extended': 'allow',
  CCBot: 'allow',
} as const;

export function analyzeSiteCheck(result: SiteCheckResponse): SiteAnalysis {
  const items: AuditItem[] = [];

  analyzeHomepage(result, items);
  analyzeMarkdown(result, items);
  analyzeLlmsTxt(result.llmsTxt, items);
  analyzeRobotsTxt(result.robotsTxt, items);
  analyzeSitemap(result, items);

  const sortedItems = sortItems(items);

  return {
    normalizedUrl: result.targetUrl,
    normalizedFrom: result.normalizedFrom,
    items: sortedItems,
    resources: buildResourceStatuses(result),
    counts: countByLevel(sortedItems),
    jsonLdTypes: getJsonLdTypes(result.homepage.body),
  };
}

function analyzeHomepage(result: SiteCheckResponse, items: AuditItem[]): void {
  const { homepage } = result;

  if (!homepage.ok || !homepage.body) {
    push(items, {
      level: 'error',
      title: 'Homepage could not be fetched',
      detail: buildFetchFailureDetail(homepage, 'homepage'),
      action: 'Make sure the site root is publicly reachable over HTTPS before checking deeper metadata.',
    });
    return;
  }

  if (!looksLikeHtml(homepage)) {
    push(items, {
      level: 'error',
      title: 'Homepage does not look like HTML',
      detail: `The checker fetched ${homepage.finalUrl}, but the response content type was ${homepage.contentType ?? 'unknown'}.`,
      action: 'Serve an HTML homepage from the site root so crawlers and agents can discover your metadata.',
    });
    return;
  }

  push(items, {
    level: 'pass',
    title: 'Homepage is reachable',
    detail: `Fetched ${homepage.finalUrl} successfully with status ${homepage.status}.`,
    action: 'Keep the site root public and indexable.',
  });

  for (const validationResult of validateHtmlContent(homepage.body, '/')) {
    push(items, {
      level: validationResult.severity,
      title: 'Homepage body is thin HTML',
      detail: validationResult.message,
      action: 'Publish meaningful HTML in the raw response or ship a markdown mirror so fetch-based crawlers do not just see an empty app shell.',
    });
  }

  const xRobotsTag = homepage.xRobotsTag?.toLowerCase() ?? '';
  if (xRobotsTag.includes('noindex')) {
    push(items, {
      level: 'error',
      title: 'Homepage sends a noindex directive',
      detail: `The homepage response includes X-Robots-Tag: ${homepage.xRobotsTag}.`,
      action: 'Remove the noindex directive if you want search engines and AI crawlers to keep discovering the site.',
    });
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(homepage.body, 'text/html');

  const canonicalHref = document
    .querySelector('link[rel="canonical"]')
    ?.getAttribute('href')
    ?.trim();

  if (!canonicalHref) {
    push(items, {
      level: 'warning',
      title: 'Canonical URL is missing',
      detail: 'The homepage has no <link rel="canonical"> tag.',
      action: 'Add a canonical tag that points at the preferred public homepage URL.',
    });
  } else {
    const canonicalUrl = tryParseUrl(canonicalHref, result.targetUrl);
    if (!canonicalUrl || canonicalUrl.origin !== result.origin) {
      push(items, {
        level: 'warning',
        title: 'Canonical URL points outside the checked site',
        detail: `The homepage canonical is set to ${canonicalHref}.`,
        action: 'Point the canonical URL at the correct public homepage for this site.',
      });
    } else {
      push(items, {
        level: 'pass',
        title: 'Canonical URL is present',
        detail: `The homepage advertises ${canonicalUrl.href} as its canonical URL.`,
        action: 'Keep canonical URLs aligned with the public site URL.',
      });
    }
  }

  const metaDescription = document
    .querySelector('meta[name="description"]')
    ?.getAttribute('content')
    ?.trim();

  if (!metaDescription) {
    push(items, {
      level: 'warning',
      title: 'Meta description is missing',
      detail: 'The homepage does not define a <meta name="description"> tag.',
      action: 'Add a concise homepage description so crawlers, search engines, and social previews get useful context.',
    });
  }

  const language = document.documentElement.getAttribute('lang')?.trim();
  if (!language) {
    push(items, {
      level: 'warning',
      title: 'HTML lang attribute is missing',
      detail: 'The homepage <html> element has no lang attribute.',
      action: 'Set the page language explicitly, for example <html lang="en">.',
    });
  }

  const h1 = document.querySelector('h1')?.textContent?.trim();
  if (!h1) {
    push(items, {
      level: 'warning',
      title: 'Homepage is missing an H1',
      detail: 'The checker could not find a meaningful <h1> element on the homepage.',
      action: 'Add a clear H1 so the page has an explicit primary heading for users and crawlers.',
    });
  }

  const llmsDiscoveryLink = Array.from(
    document.querySelectorAll('link[rel="alternate"]')
  ).find((element) => {
    const type = element.getAttribute('type')?.toLowerCase();
    const href = element.getAttribute('href')?.toLowerCase() ?? '';
    return type === 'text/plain' && href.includes('llms.txt');
  });

  if (!llmsDiscoveryLink) {
    push(items, {
      level: 'warning',
      title: 'Homepage does not advertise llms.txt',
      detail: 'The checker did not find a <link rel="alternate" type="text/plain" href="/llms.txt"> tag in the homepage head.',
      action: 'Add an llms.txt discovery link so models can find your machine-readable summary more reliably.',
      docUrl: DOCS.llms,
    });
  } else {
    push(items, {
      level: 'pass',
      title: 'Homepage advertises llms.txt',
      detail: `The homepage head links to ${llmsDiscoveryLink.getAttribute('href')}.`,
      action: 'Keep the llms.txt discovery link in the page head.',
      docUrl: DOCS.llms,
    });
  }

  analyzeJsonLd(homepage.body, items);
}

function analyzeJsonLd(html: string, items: AuditItem[]): void {
  if (!hasExistingJsonLdScripts(html)) {
    push(items, {
      level: 'warning',
      title: 'Homepage has no JSON-LD',
      detail: 'The checker did not find any <script type="application/ld+json"> blocks on the homepage.',
      action: 'Add at least WebSite and Organization schema on the homepage so machines can identify the site and owner.',
      docUrl: DOCS.jsonLd,
    });
    return;
  }

  const document = new DOMParser().parseFromString(html, 'text/html');
  const scripts = Array.from(
    document.querySelectorAll('script[type="application/ld+json"]')
  );
  const nodes: Array<Record<string, unknown>> = [];
  let invalidBlocks = 0;

  for (const script of scripts) {
    const content = script.textContent?.trim();
    if (!content) {
      continue;
    }

    try {
      collectJsonLdNodes(JSON.parse(content), nodes);
    } catch {
      invalidBlocks += 1;
    }
  }

  if (invalidBlocks > 0) {
    push(items, {
      level: 'error',
      title: 'Homepage contains invalid JSON-LD',
      detail: `${invalidBlocks} JSON-LD block${invalidBlocks === 1 ? '' : 's'} could not be parsed as valid JSON.`,
      action: 'Fix invalid JSON-LD syntax before deploying so search engines and AI systems can parse the structured data.',
      docUrl: DOCS.jsonLd,
    });
  }

  const types = findExistingJsonLdTypes(html);
  const hasWebSite = types.has('website');
  const hasOrganization = types.has('organization');
  const organizationNodes = nodes.filter((node) => hasSchemaType(node, 'organization'));

  if (!hasWebSite) {
    push(items, {
      level: 'warning',
      title: 'Homepage is missing WebSite schema',
      detail: 'The checker found JSON-LD, but no WebSite type on the homepage.',
      action: 'Add WebSite schema to describe the site itself and its canonical homepage URL.',
      docUrl: DOCS.jsonLd,
    });
  } else {
    push(items, {
      level: 'pass',
      title: 'Homepage includes WebSite schema',
      detail: `Detected these JSON-LD types: ${Array.from(types).sort().join(', ')}.`,
      action: 'Keep homepage WebSite metadata aligned with the public site URL and name.',
      docUrl: DOCS.jsonLd,
    });
  }

  if (!hasOrganization) {
    push(items, {
      level: 'warning',
      title: 'Homepage is missing Organization schema',
      detail: 'The checker found JSON-LD, but no Organization type on the homepage.',
      action: 'Add Organization schema so AI systems and search engines can identify who owns the site.',
      docUrl: DOCS.jsonLd,
    });
  } else {
    const organizationWithLogo = organizationNodes.some((node) => {
      const logo = node.logo;
      if (!logo) {
        return false;
      }

      if (typeof logo === 'string') {
        return logo.trim().length > 0;
      }

      if (logo && typeof logo === 'object') {
        const url = (logo as Record<string, unknown>).url;
        return typeof url === 'string' && url.trim().length > 0;
      }

      return false;
    });

    if (!organizationWithLogo) {
      push(items, {
        level: 'warning',
        title: 'Organization schema is missing a logo URL',
        detail: 'Organization schema was present, but the checker did not find a usable logo URL.',
        action: 'Add a stable logo URL to Organization schema so search engines and AI systems can identify the brand consistently.',
        docUrl: DOCS.jsonLd,
      });
    } else {
      push(items, {
        level: 'pass',
        title: 'Homepage includes Organization schema',
        detail: 'Organization schema is present and includes a usable logo URL.',
        action: 'Keep organization metadata aligned with your public brand assets.',
        docUrl: DOCS.jsonLd,
      });
    }
  }

  const schemaValidationResults = validateExistingJsonLd(html).filter(
    (result) => !result.message.includes("'logo' field")
  );

  for (const result of schemaValidationResults) {
    push(items, {
      level: result.severity,
      title:
        result.severity === 'error'
          ? 'Existing JSON-LD has a blocking issue'
          : 'Existing JSON-LD needs improvement',
      detail: result.message,
      action: 'Fill in the missing required or recommended JSON-LD fields so crawlers and AI systems can rely on the schema.',
      docUrl: DOCS.jsonLd,
    });
  }
}

function analyzeMarkdown(result: SiteCheckResponse, items: AuditItem[]): void {
  analyzeMarkdownResource(
    result.homepageMarkdown,
    {
      missingTitle: 'Homepage markdown mirror is missing',
      availableTitle: 'Homepage markdown mirror is available',
      thinTitle: 'Homepage markdown mirror is thin',
      action:
        'Publish a richer markdown mirror for the homepage so LLM fetches get more than just metadata.',
    },
    items
  );

  if (result.samplePage?.ok && result.samplePage.body && looksLikeHtml(result.samplePage)) {
    for (const validationResult of validateHtmlContent(
      result.samplePage.body,
      result.samplePage.finalUrl
    )) {
      push(items, {
        level: validationResult.severity,
        title: 'Sample linked page is thin HTML',
        detail: `${result.samplePage.finalUrl} returned very little indexable HTML before JavaScript ran.`,
        action:
          'Pre-render that page or provide a markdown mirror so fetch-based agents can extract the page content.',
      });
    }
  }

  if (result.samplePage) {
    analyzeMarkdownResource(
      result.samplePageMarkdown,
      {
        missingTitle: 'Sample linked page has no markdown mirror',
        availableTitle: 'Sample linked page exposes a markdown mirror',
        thinTitle: 'Sample linked page markdown is thin',
        action:
          'Generate markdown for important linked pages so an LLM that follows one link can fetch useful body content.',
      },
      items
    );
  }
}

function analyzeLlmsTxt(llmsTxt: RemoteResource, items: AuditItem[]): void {
  if (!llmsTxt.ok || !llmsTxt.body) {
    push(items, {
      level: llmsTxt.status === 404 ? 'warning' : 'error',
      title: llmsTxt.status === 404 ? 'llms.txt is missing' : 'llms.txt could not be read',
      detail: buildFetchFailureDetail(llmsTxt, 'llms.txt'),
      action: 'Publish a valid /llms.txt file so models can discover a structured summary of your site.',
      docUrl: DOCS.llms,
    });
    return;
  }

  const validationResults = validateLlmsTxt(llmsTxt.body);

  for (const result of validationResults) {
    push(items, {
      level: result.severity,
      title: result.severity === 'error' ? 'llms.txt has a blocking issue' : 'llms.txt needs improvement',
      detail: result.message,
      action: 'Fix the llms.txt format so it stays easy for humans and machines to parse.',
      docUrl: DOCS.llms,
    });
  }

  if (validationResults.length === 0) {
    push(items, {
      level: 'pass',
      title: 'llms.txt is present and structurally valid',
      detail: `Fetched ${llmsTxt.finalUrl} successfully and found no structural llms.txt issues.`,
      action: 'Keep llms.txt aligned with the public pages you want models to discover.',
      docUrl: DOCS.llms,
    });
  }
}

function analyzeRobotsTxt(robotsTxt: RemoteResource, items: AuditItem[]): void {
  if (!robotsTxt.ok || !robotsTxt.body) {
    push(items, {
      level: robotsTxt.status === 404 ? 'warning' : 'error',
      title: robotsTxt.status === 404 ? 'robots.txt is missing' : 'robots.txt could not be read',
      detail: buildFetchFailureDetail(robotsTxt, 'robots.txt'),
      action: 'Publish a robots.txt file so crawler access and sitemap discovery are explicit.',
      docUrl: DOCS.crawlers,
    });
    return;
  }

  const validationResults = validateRobotsTxt(robotsTxt.body, TARGET_CRAWLERS);
  for (const result of validationResults) {
    push(items, {
      level: result.severity,
      title: 'robots.txt may conflict with AI crawler access',
      detail: result.message,
      action: 'Make sure broad robots rules do not accidentally override the crawler policy you intend to expose.',
      docUrl: DOCS.crawlers,
    });
  }

  const robotsBody = robotsTxt.body;
  const explicitAiRules = Object.keys(TARGET_CRAWLERS).some((bot) =>
    new RegExp(`User-agent:\\s*${escapeRegExp(bot)}`, 'i').test(robotsBody)
  );

  if (!explicitAiRules) {
    push(items, {
      level: 'warning',
      title: 'robots.txt has no explicit AI crawler section',
      detail: 'The checker found robots.txt, but none of the common AI crawlers are mentioned explicitly.',
      action: 'Add explicit directives for GPTBot, ClaudeBot, PerplexityBot, Google-Extended, or CCBot if you want your policy to be obvious.',
      docUrl: DOCS.crawlers,
    });
  } else if (validationResults.length === 0) {
    push(items, {
      level: 'pass',
      title: 'robots.txt exposes explicit AI crawler rules',
      detail: 'robots.txt is reachable and does not show obvious conflicts for the common AI crawlers checked here.',
      action: 'Keep explicit crawler rules stable so your policy is easy to inspect.',
      docUrl: DOCS.crawlers,
    });
  }
}

function analyzeSitemap(result: SiteCheckResponse, items: AuditItem[]): void {
  if (!result.sitemap || !result.sitemap.ok) {
    push(items, {
      level: 'warning',
      title: 'Sitemap could not be discovered',
      detail: result.sitemap
        ? buildFetchFailureDetail(result.sitemap, 'sitemap')
        : 'The checker could not determine a sitemap URL from robots.txt or the default /sitemap.xml path.',
      action: 'Publish a sitemap and advertise it in robots.txt so machines can discover your pages more reliably.',
    });
    return;
  }

  if (result.sitemapSource === 'robots') {
    push(items, {
      level: 'pass',
      title: 'Sitemap is advertised in robots.txt',
      detail: `The checker found the sitemap at ${result.sitemap.finalUrl} via robots.txt.`,
      action: 'Keep the sitemap reference in robots.txt up to date.',
    });
  } else {
    push(items, {
      level: 'warning',
      title: 'Sitemap exists but is not advertised in robots.txt',
      detail: `The checker found ${result.sitemap.finalUrl}, but it was not declared in robots.txt.`,
      action: 'Add a Sitemap line to robots.txt so crawlers can discover it directly.',
    });
  }
}

function buildResourceStatuses(result: SiteCheckResponse): ResourceStatus[] {
  const resources: ResourceStatus[] = [
    buildResourceStatus('homepage', 'Homepage', result.homepage),
    buildResourceStatus('homepageMarkdown', 'Homepage markdown', result.homepageMarkdown),
    buildResourceStatus('llmsTxt', 'llms.txt', result.llmsTxt),
    buildResourceStatus('robotsTxt', 'robots.txt', result.robotsTxt),
    buildResourceStatus('sitemap', 'Sitemap', result.sitemap),
  ];

  if (result.samplePage) {
    resources.push(
      buildResourceStatus('samplePage', 'Sample linked page', result.samplePage)
    );
  }

  if (result.samplePageMarkdown) {
    resources.push(
      buildResourceStatus(
        'samplePageMarkdown',
        'Sample linked markdown',
        result.samplePageMarkdown
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
  if (!resource) {
    return {
      key,
      label,
      url: null,
      status: 'Not checked',
      detail: 'This resource was not fetched.',
      ok: false,
    };
  }

  return {
    key,
    label,
    url: resource.finalUrl || resource.requestedUrl,
    status: resource.ok ? `HTTP ${resource.status}` : resource.status ? `HTTP ${resource.status}` : 'Request failed',
    detail: resource.ok
      ? `Fetched ${resource.finalUrl || resource.requestedUrl}`
      : buildFetchFailureDetail(resource, label),
    ok: resource.ok,
  };
}

function buildFetchFailureDetail(resource: RemoteResource, label: string): string {
  if (resource.error) {
    return `The checker could not fetch ${label}: ${resource.error}.`;
  }

  if (resource.status) {
    return `The checker fetched ${resource.requestedUrl} and received HTTP ${resource.status}.`;
  }

  return `The checker could not fetch ${resource.requestedUrl}.`;
}

function analyzeMarkdownResource(
  resource: RemoteResource | null,
  copy: {
    missingTitle: string;
    availableTitle: string;
    thinTitle: string;
    action: string;
  },
  items: AuditItem[]
): void {
  if (!resource || !resource.ok || !resource.body) {
    push(items, {
      level: resource?.status === 404 ? 'warning' : 'error',
      title: copy.missingTitle,
      detail: resource
        ? buildFetchFailureDetail(resource, 'markdown resource')
        : 'The checker did not fetch a markdown resource here.',
      action: copy.action,
    });
    return;
  }

  const markdownScore = assessMarkdownBody(resource.body);
  if (!markdownScore.ok) {
    push(items, {
      level: 'warning',
      title: copy.thinTitle,
      detail: markdownScore.detail,
      action: copy.action,
    });
    return;
  }

  push(items, {
    level: 'pass',
    title: copy.availableTitle,
    detail: `Fetched ${resource.finalUrl} and found readable markdown content.`,
    action: 'Keep markdown mirrors aligned with the final public page content.',
  });
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

function getJsonLdTypes(html: string | null): string[] {
  if (!html) {
    return [];
  }

  return Array.from(findExistingJsonLdTypes(html)).sort();
}

function collectJsonLdNodes(
  value: unknown,
  nodes: Array<Record<string, unknown>>
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectJsonLdNodes(item, nodes);
    }
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  const record = value as Record<string, unknown>;
  nodes.push(record);

  if ('@graph' in record) {
    collectJsonLdNodes(record['@graph'], nodes);
  }
}

function hasSchemaType(node: Record<string, unknown>, expected: string): boolean {
  const type = node['@type'];
  if (typeof type === 'string') {
    return type.toLowerCase() === expected;
  }

  if (Array.isArray(type)) {
    return type.some(
      (value) => typeof value === 'string' && value.toLowerCase() === expected
    );
  }

  return false;
}

function tryParseUrl(value: string, base?: string): URL | null {
  try {
    return base ? new URL(value, base) : new URL(value);
  } catch {
    return null;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sortItems(items: AuditItem[]): AuditItem[] {
  const weight: Record<AuditLevel, number> = {
    error: 0,
    warning: 1,
    pass: 2,
  };

  return [...items].sort((left, right) => {
    const weightDiff = weight[left.level] - weight[right.level];
    if (weightDiff !== 0) {
      return weightDiff;
    }

    return left.title.localeCompare(right.title);
  });
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

function push(items: AuditItem[], item: AuditItem): void {
  items.push(item);
}
