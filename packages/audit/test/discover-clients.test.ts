import { afterEach, describe, expect, it, vi } from 'vitest';
import { DISCOVERY_DEFAULTS, discoverAgencyClients, type DiscoveryInput } from '../src/discover-clients.js';
import { createFetchStub, settleWithFakeTimers } from './helpers/fetch-stub.js';

interface Page {
  status: number;
  body?: string;
  /** Location header of a 3xx answer. */
  location?: string;
}

/** A fetch stub keyed by full URL (discovery talks to several hosts); unknown URLs answer 404. */
function fakeFetch(routes: Record<string, Page>) {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);
    const page = routes[url] ?? { status: 404, body: '<html><body>Not found</body></html>' };
    if (page.location) {
      return new Response(null, { status: page.status, headers: { location: page.location } });
    }
    return new Response(page.body ?? '', { status: page.status, headers: { 'content-type': 'text/html' } });
  };
  return { fetchImpl, calls };
}

const AGENCY = 'https://www.agency.com/';
const FOOTER = '<footer><a href="https://vendorwidget.io/" target="_blank">Widget</a></footer>';
const html = (main: string) =>
  `<html><body><header><nav><a href="/">Home</a><a href="/portfolio/">Portfolio</a></nav></header><main>${main}</main>${FOOTER}</body></html>`;

function input(homeMain: string, extra: Partial<DiscoveryInput> = {}): DiscoveryInput {
  return {
    agencyDomain: 'agency.com',
    homepageUrl: AGENCY,
    homepageStatus: 200,
    homepageHtml: html(homeMain),
    ...extra,
  };
}

describe('discoverAgencyClients', () => {
  it('follows item pages when the index names fewer than three candidates, ranks blocked after 2xx and boosts credit-back', async () => {
    const { fetchImpl, calls } = fakeFetch({
      'https://www.agency.com/portfolio/': {
        status: 200,
        body: html(
          '<a href="https://direct.com/" target="_blank">Visit website</a>' +
            '<a href="/portfolio/alpha/">Alpha</a><a href="/portfolio/beta/">Beta</a><a href="/portfolio/gamma/">Gamma</a>'
        ),
      },
      'https://www.agency.com/portfolio/alpha/': {
        status: 200,
        body: html('<a href="https://alpha.com/" target="_blank">Visit website</a>'),
      },
      'https://www.agency.com/portfolio/beta/': { status: 200, body: html('<a href="https://beta.org/">Visit website</a>') },
      'https://www.agency.com/portfolio/gamma/': { status: 200, body: html('<a href="https://gamma.net/">Visit website</a>') },
      'https://direct.com/': { status: 200, body: '<html><body>Direct</body></html>' },
      'https://alpha.com/': { status: 403, body: 'Forbidden' },
      'https://beta.org/': { status: 200, body: '<html><body><footer>Site by <a href="https://agency.com/">Agency</a></footer></body></html>' },
      'https://gamma.net/': { status: 200, body: '<html><body>Gamma</body></html>' },
    });

    const discovery = await discoverAgencyClients(
      input('<a href="https://homeonly.com/" target="_blank"><img src="/logo.png" alt="Home only"></a>'),
      { fetchImpl, minGapMs: 0 }
    );

    expect(discovery.pagesFetched.map((page) => [page.role, page.url, page.status])).toEqual([
      ['homepage', AGENCY, 200],
      ['portfolio', 'https://www.agency.com/portfolio/', 200],
      ['portfolio-item', 'https://www.agency.com/portfolio/alpha/', 200],
      ['portfolio-item', 'https://www.agency.com/portfolio/beta/', 200],
      ['portfolio-item', 'https://www.agency.com/portfolio/gamma/', 200],
    ]);
    expect(discovery.candidates.map((candidate) => [candidate.domain, candidate.score])).toEqual([
      ['alpha.com', 6],
      ['direct.com', 6],
      ['beta.org', 5],
      ['gamma.net', 5],
    ]);
    expect(discovery.excluded.filter((entry) => entry.reason !== 'agency-domain').map((entry) => [entry.domain, entry.reason])).toEqual([
      ['homeonly.com', 'homepage-only'],
      ['vendorwidget.io', 'site-wide'],
    ]);
    expect(discovery.liveness.map((check) => [check.domain, check.alive, check.credit, check.accepted])).toEqual([
      ['alpha.com', 'blocked', false, true],
      ['direct.com', 'yes', false, true],
      ['beta.org', 'yes', true, true],
      ['gamma.net', 'yes', false, true],
    ]);
    // Every 2xx candidate before the blocked one; beta's credit-back lifts it to the top.
    expect(discovery.picked.map((pick) => [pick.domain, pick.score, pick.alive])).toEqual([
      ['beta.org', 7, 'yes'],
      ['direct.com', 6, 'yes'],
      ['gamma.net', 5, 'yes'],
    ]);
    expect(discovery.picked[0].signals).toContain('credit-back');
    expect(discovery.picked[0].url).toBe('https://beta.org/');
    expect(discovery.fetches).toBe(8);
    expect(calls).toHaveLength(8);
    expect(discovery.maxFetches).toBe(12);
    expect(discovery.needs_manual).toBe(false);
    expect(discovery.needs_manual_reasons).toEqual([]);
  });

  it('picks a blocked candidate when fewer than three answer 2xx and says so', async () => {
    const { fetchImpl } = fakeFetch({
      'https://www.agency.com/portfolio/': {
        status: 200,
        body: html('<a href="https://open.com/">Visit website</a><a href="https://guarded.com/" target="_blank">Visit website</a>'),
      },
      'https://open.com/': { status: 200, body: '<html></html>' },
      'https://guarded.com/': { status: 429, body: 'Too many requests' },
    });
    const discovery = await discoverAgencyClients(input(''), { fetchImpl, minGapMs: 0 });
    expect(discovery.picked.map((pick) => [pick.domain, pick.alive])).toEqual([
      ['open.com', 'yes'],
      ['guarded.com', 'blocked'],
    ]);
    expect(discovery.needs_manual).toBe(true);
    expect(discovery.needs_manual_reasons).toEqual(['too-few-picks']);
  });

  it('caps discovery at twelve fetches including liveness, keeping a liveness reserve from item pages', async () => {
    const routes: Record<string, Page> = {};
    const items: string[] = [];
    for (const index of ['portfolio', 'our-work', 'case-studies']) {
      const slugs = Array.from({ length: 4 }, (_, i) => `/${index === 'our-work' ? 'work' : index}/${index}-${i}/`);
      items.push(...slugs);
      routes[`https://www.agency.com/${index}/`] = {
        status: 200,
        body: html(slugs.map((slug) => `<a href="${slug}">Item</a>`).join('')),
      };
    }
    items.forEach((slug, i) => {
      routes[`https://www.agency.com${slug}`] = {
        status: 200,
        body: html(`<a href="https://client${i}.com/" target="_blank">Visit website</a>`),
      };
      routes[`https://client${i}.com/`] = { status: 200, body: '<html></html>' };
    });
    const { fetchImpl, calls } = fakeFetch(routes);

    const discovery = await discoverAgencyClients(
      input('<a href="/portfolio/">Portfolio</a><a href="/our-work/">Our work</a><a href="/case-studies/">Case studies</a>'),
      { fetchImpl, minGapMs: 0 }
    );

    expect(discovery.fetches).toBe(DISCOVERY_DEFAULTS.maxFetches);
    expect(calls).toHaveLength(DISCOVERY_DEFAULTS.maxFetches);
    const roles = discovery.pagesFetched.map((page) => page.role);
    expect(roles.filter((role) => role === 'portfolio')).toHaveLength(3);
    // 3 index pages, then item pages while more than 4 fetches remain: 5 of 6.
    expect(roles.filter((role) => role === 'portfolio-item')).toHaveLength(5);
    expect(discovery.liveness.map((check) => check.alive)).toEqual(['yes', 'yes', 'yes', 'yes', 'unchecked']);
    expect(discovery.liveness[4].reason).toBe('fetch-budget');
    expect(discovery.picked).toHaveLength(3);
    expect(discovery.needs_manual).toBe(false);
  });

  it('reports a budget or deadline stop as a needs_manual reason, not an error', async () => {
    const { fetchImpl, calls } = fakeFetch({});
    const stopped = await discoverAgencyClients(input(''), { fetchImpl, minGapMs: 0, deadlineMs: 0 });
    expect(calls).toHaveLength(0);
    expect(stopped.pagesFetched[1]).toMatchObject({ role: 'portfolio', status: null, error: 'Checker time budget exhausted.' });
    expect(stopped.needs_manual).toBe(true);
    expect(stopped.needs_manual_reasons).toEqual(['too-few-picks', 'deadline']);

    const tiny = fakeFetch({
      'https://www.agency.com/portfolio/': {
        status: 200,
        body: html('<a href="https://one.com/">Visit website</a><a href="https://two.com/">Visit website</a>'),
      },
      'https://one.com/': { status: 200, body: '<html></html>' },
    });
    const capped = await discoverAgencyClients(input(''), { fetchImpl: tiny.fetchImpl, minGapMs: 0, maxFetches: 2 });
    expect(capped.fetches).toBe(2);
    expect(capped.liveness.map((check) => [check.domain, check.alive])).toEqual([
      ['one.com', 'yes'],
      ['two.com', 'unchecked'],
    ]);
    expect(capped.needs_manual_reasons).toEqual(['too-few-picks', 'fetch-budget']);
  });

  it('reads the sitemap index child when the homepage names no portfolio page, and excludes the final agency domain', async () => {
    const { fetchImpl } = fakeFetch({
      'https://www.agencynew.com/sitemap-pages.xml': {
        status: 200,
        body: '<urlset><url><loc>https://www.agencynew.com/our-work/</loc></url></urlset>',
      },
      'https://www.agencynew.com/our-work/': {
        status: 200,
        body: '<main><a href="https://client.com/">Visit website</a><a href="https://shop.agencynew.com/">Shop</a></main>',
      },
      'https://client.com/': { status: 200, body: '<html></html>' },
    });
    const discovery = await discoverAgencyClients(
      {
        agencyDomain: 'agency-old.com',
        homepageUrl: 'https://www.agencynew.com/',
        homepageStatus: 200,
        homepageHtml: '<main><a href="/about/">About</a></main>',
        sitemapXml: '<sitemapindex><sitemap><loc>https://www.agencynew.com/sitemap-pages.xml</loc></sitemap></sitemapindex>',
      },
      { fetchImpl, minGapMs: 0 }
    );
    expect(discovery.agencyFinalDomain).toBe('agencynew.com');
    expect(discovery.pagesFetched.map((page) => page.role)).toEqual(['homepage', 'sitemap-child', 'portfolio']);
    expect(discovery.picked.map((pick) => pick.domain)).toEqual(['client.com']);
    expect(discovery.excluded).toContainEqual({ domain: 'agencynew.com', reason: 'agency-domain' });
  });

  it('counts a fetched page that kept no links in the site-wide denominator', async () => {
    const partner = '<a href="https://partner.com/">Our partner</a>';
    const { fetchImpl } = fakeFetch({
      'https://www.agency.com/portfolio/': { status: 200, body: html(partner) },
      'https://www.agency.com/our-work/': { status: 200, body: html(partner) },
      'https://www.agency.com/case-studies/': { status: 200, body: '<html><body><main><p>No links here.</p></main></body></html>' },
      'https://partner.com/': { status: 200, body: '<html></html>' },
    });
    const discovery = await discoverAgencyClients(
      input(`${partner}<a href="/our-work/">Our work</a><a href="/case-studies/">Case studies</a>`),
      { fetchImpl, minGapMs: 0 }
    );
    expect(discovery.pagesFetched.filter((page) => page.outcome === 'ok')).toHaveLength(3);
    // On 3 of the 4 pages read (the homepage, two index pages, an index page without anchors).
    expect(discovery.candidates.map((candidate) => [candidate.domain, candidate.sourcePages.length])).toEqual([['partner.com', 3]]);
    expect(discovery.excluded.find((entry) => entry.domain === 'partner.com')).toBeUndefined();
    expect(discovery.picked.map((pick) => pick.domain)).toEqual(['partner.com']);
  });

  it('counts redirect hops against the fetch budget and ends in needs_manual, not a throw', async () => {
    const routes: Record<string, Page> = {
      'https://www.agency.com/portfolio/': {
        status: 200,
        body: html([1, 2, 3].map((n) => `<a href="https://client${n}.com/">Visit website</a>`).join('')),
      },
    };
    for (const n of [1, 2, 3]) {
      routes[`https://client${n}.com/`] = { status: 301, location: `https://www.client${n}.com/` };
      routes[`https://www.client${n}.com/`] = { status: 301, location: `https://www.client${n}.com/home/` };
      routes[`https://www.client${n}.com/home/`] = { status: 302, location: `https://www.client${n}.com/start/` };
      routes[`https://www.client${n}.com/start/`] = { status: 200, body: '<html></html>' };
    }
    const { fetchImpl, calls } = fakeFetch(routes);
    const discovery = await discoverAgencyClients(input(''), { fetchImpl, minGapMs: 0 });
    // 1 index page + 4 fetches per client (3 hops): client3 runs out on its fourth hop.
    expect(calls).toHaveLength(12);
    expect(discovery.fetches).toBe(12);
    expect(discovery.liveness.map((check) => [check.domain, check.alive, check.reason])).toEqual([
      ['client1.com', 'yes', null],
      ['client2.com', 'yes', null],
      ['client3.com', 'unchecked', 'fetch-budget'],
    ]);
    expect(discovery.picked.map((pick) => [pick.domain, pick.url])).toEqual([
      ['client1.com', 'https://www.client1.com/'],
      ['client2.com', 'https://www.client2.com/'],
    ]);
    expect(discovery.needs_manual).toBe(true);
    expect(discovery.needs_manual_reasons).toEqual(['too-few-picks', 'fetch-budget']);
  });

  describe('with fake timers', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('lets a host-gate wait run into the 40 s deadline and ends in needs_manual, not a throw', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-02T12:00:00.000Z'));
      // Pathname-keyed stub that honours abort signals; the client is the only "/" route.
      const stub = createFetchStub({
        '/portfolio/': () => ({ status: 200, body: html('<a href="https://one.com/">Visit website</a>') }),
        '/our-work/': () => ({ status: 200, body: html(''), delayMs: 5000 }),
        '/case-studies/': () => ({ status: 200, body: html('') }),
        '/': () => ({ status: 200, body: '<html></html>' }),
      });
      const pending = discoverAgencyClients(
        input('<a href="/our-work/">Our work</a><a href="/case-studies/">Case studies</a>'),
        // The second agency-host request may start only 39.5 s in; its slow answer runs past 40 s.
        { fetchImpl: stub.fetch, minGapMs: 39_500 }
      );
      const discovery = await settleWithFakeTimers(pending, 120);
      expect(discovery.pagesFetched.slice(1).map((page) => [page.url, page.error ?? null])).toEqual([
        ['https://www.agency.com/portfolio/', null],
        ['https://www.agency.com/our-work/', 'Checker time budget exhausted.'],
        ['https://www.agency.com/case-studies/', 'Checker time budget exhausted.'],
      ]);
      expect(stub.calls.map((call) => call.path)).toEqual(['/portfolio/', '/our-work/']);
      expect(discovery.liveness.map((check) => [check.domain, check.alive, check.reason])).toEqual([
        ['one.com', 'unchecked', 'deadline'],
      ]);
      expect(discovery.picked).toEqual([]);
      expect(discovery.needs_manual).toBe(true);
      expect(discovery.needs_manual_reasons).toEqual(['too-few-picks', 'deadline']);
    });
  });
});
