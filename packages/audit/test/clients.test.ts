import { describe, expect, it } from 'vitest';
import {
  canonicalizeAgencyUrl,
  claimClientDomains,
  creditsAgency,
  exclusionReasonFor,
  extractLinks,
  findPortfolioItemPages,
  findPortfolioLocs,
  findPortfolioPages,
  genericSiblingWord,
  rankClientCandidates,
  sharedBrandRun,
  sitemapLocs,
  type LinkRegion,
  type SourcedLink,
} from '../src/clients.js';
import { registrableDomainOf } from '@agentmarkup/core/score';
import { registrableDomain } from '../src/registrable-domain.js';

const AGENCY = 'https://www.agency.com/';

const HOMEPAGE = `
<html><body>
  <nav>
    <a href="/">Home</a>
    <a href="/portfolio/">Our Work</a>
    <a href="/about-us/">About</a>
    <a href="/case-studies/">Case studies</a>
    <a href="/blog/">Clients &amp; news</a>
    <a href="/projects/web/">Projects</a>
    <a href="mailto:hi@agency.com">Email</a>
    <a href="tel:+1555">Call</a>
    <a href="#top">Top</a>
    <a href="javascript:void(0)">Menu</a>
    <a href="/brochure.pdf">Brochure</a>
  </nav>
  <a href="https://www.facebook.com/agency" rel="nofollow noopener" target="_blank">Facebook</a>
  <a href="https://wordpress.org/">Built on WordPress</a>
  <a href="https://clientone.com/" target="_blank"><img src="/one.png" alt="Client One"></a>
  <a href='https://www.clienttwo.co.uk/work?utm_source=agency' target='_blank'>Visit the live site</a>
  <a href="https://shop.clientthree.com/">clientthree.com</a>
  <a href="https://portal.app.clientfour.net/login">Client portal</a>
  <a href="https://cdn.wp.com/x">asset</a>
  <a href="https://play.google.com/store/apps">Play</a>
  <a href="https://g.page/agency">Reviews</a>
  <a href="https://support.agency.com/">Support</a>
</body></html>`;

describe('canonicalizeAgencyUrl', () => {
  it('forces https, strips tracking parameters, credentials and the path', () => {
    expect(canonicalizeAgencyUrl('http://user:pw@example.com/web-design/?utm_source=gmb&fbclid=1&gclid=2#x')).toBe(
      'https://example.com/'
    );
    expect(canonicalizeAgencyUrl('example.com')).toBe('https://example.com/');
    expect(canonicalizeAgencyUrl('  https://www.example.co.uk/?utm_campaign=a  ')).toBe('https://www.example.co.uk/');
  });
});

describe('registrableDomain', () => {
  it('cuts to the last two labels, or three under a listed second-level label and two-letter TLD', () => {
    expect(registrableDomain('www.example.com')).toBe('example.com');
    expect(registrableDomain('a.b.example.com')).toBe('example.com');
    expect(registrableDomain('www.example.co.uk')).toBe('example.co.uk');
    expect(registrableDomain('shop.example.com.au')).toBe('example.com.au');
    expect(registrableDomain('example.com')).toBe('example.com');
    expect(registrableDomain('Example.COM.')).toBe('example.com');
    expect(registrableDomain('localhost')).toBe('localhost');
    // The core rule: any of co/com/net/org/gov/edu/ac under a two-letter TLD.
    expect(registrableDomain('www.example.org.uk')).toBe('example.org.uk');
    expect(registrableDomain('shop.example.net.au')).toBe('example.net.au');
    expect(registrableDomain('dept.uni.ac.uk')).toBe('uni.ac.uk');
    expect(registrableDomain('www.example.co.za')).toBe('example.co.za');
    expect(registrableDomain('www.example.com.br')).toBe('example.com.br');
    // Not two letters, or not a listed label: last two labels.
    expect(registrableDomain('www.example.co.museum')).toBe('co.museum');
    expect(registrableDomain('www.example.info.uk')).toBe('info.uk');
    // IP literals only ever match exactly.
    expect(registrableDomain('93.184.216.34')).toBe('93.184.216.34');
    expect(registrableDomain('[::1]')).toBe('[::1]');
  });

  it('agrees with core registrableDomainOf on every host', () => {
    const hosts = [
      'www.example.com', 'a.b.example.com', 'www.example.co.uk', 'shop.example.com.au', 'example.org.uk',
      'x.example.gov.uk', 'x.example.edu.au', 'dept.uni.ac.uk', 'www.example.co.museum', 'www.example.info.uk',
      'example.com', 'Example.COM.', 'localhost', '93.184.216.34', '[::1]', 'a.b.c.d.example.net.nz',
    ];
    expect(hosts.map((host) => registrableDomain(host))).toEqual(hosts.map((host) => registrableDomainOf(host)));
  });
});

describe('extractLinks', () => {
  const links = extractLinks(HOMEPAGE, AGENCY);

  it('resolves hrefs, skips mailto, tel, hash, javascript and asset links, keeps externals', () => {
    const hrefs = links.map((link) => link.href);
    expect(hrefs).toContain('https://www.agency.com/portfolio/');
    expect(hrefs).toContain('https://clientone.com/');
    expect(hrefs).toContain('https://www.clienttwo.co.uk/work?utm_source=agency');
    expect(hrefs.some((href) => href.startsWith('mailto:') || href.startsWith('tel:'))).toBe(false);
    expect(hrefs).not.toContain('https://www.agency.com/#top');
    expect(hrefs).not.toContain('https://www.agency.com/brochure.pdf');
    expect(hrefs.some((href) => href.startsWith('javascript:'))).toBe(false);
  });

  it('records text, image wrapping, target and rel', () => {
    const one = links.find((link) => link.href === 'https://clientone.com/');
    expect(one).toMatchObject({ text: '', wrapsImage: true, targetBlank: true, rel: '' });
    const two = links.find((link) => link.href.startsWith('https://www.clienttwo.co.uk/'));
    expect(two).toMatchObject({ text: 'Visit the live site', wrapsImage: false, targetBlank: true });
    const fb = links.find((link) => link.href.includes('facebook.com'));
    expect(fb?.rel).toBe('nofollow noopener');
    const blog = links.find((link) => link.href === 'https://www.agency.com/blog/');
    expect(blog?.text).toBe('Clients & news');
  });

  it('tags each link with the nearest enclosing header, nav or footer, else main', () => {
    const html = `<body>
      <header><a href="https://h.example/">h</a><nav><a href="https://hn.example/">hn</a></nav></header>
      <nav><a href="https://n.example/">n</a></nav>
      <main><a href="https://m.example/">m</a>
        <article><header><a href="https://ah.example/">ah</a></header><footer><a href="https://af.example/">af</a></footer></article>
      </main>
      <a href="https://u.example/">unwrapped</a>
      <div role="contentinfo"><div class="col"><a href="https://rf.example/">rf</a></div><div><a href="https://rf2.example/">rf2</a></div></div>
      <a href="https://after.example/">after</a>
      <DIV ROLE="navigation"><a href="https://rn.example/">rn</a></DIV>
      <div role="banner"><a href="https://rb.example/">rb</a></div>
      <footer><section><a href="https://fs.example/">fs</a></section><p><a href="https://f.example/">f</a></p></footer>
      <a href="https://end.example/">end</a>
    </body>`;
    const regions = Object.fromEntries(extractLinks(html, AGENCY).map((link) => [new URL(link.href).hostname, link.region]));
    expect(regions).toEqual({
      'h.example': 'header',
      'hn.example': 'nav',
      'n.example': 'nav',
      'm.example': 'main',
      // Inside article: not the page banner or footer (ARIA mapping).
      'ah.example': 'main',
      'af.example': 'main',
      'u.example': 'main',
      'rf.example': 'footer',
      'rf2.example': 'footer',
      'after.example': 'main',
      'rn.example': 'nav',
      'rb.example': 'header',
      'fs.example': 'footer',
      'f.example': 'footer',
      'end.example': 'main',
    } satisfies Record<string, LinkRegion>);
  });

  it('skips links in comments and scripts, ends an unclosed anchor at the next one, reads exact attribute names', () => {
    const links = extractLinks(
      '<!-- <a href="https://commented.example/">c</a> -->' +
        '<script>document.write(\'<a href="https://scripted.example/">s</a>\')</script>' +
        '<a data-href="https://data.example/" href="https://real.example/">Real <!-- note --><b>site</b></a>' +
        '<a href="https://open.example/"><img src="/x.png">' +
        '<a href="https://next.example/">Next</a>' +
        '<a href="https://eof.example/">tail text',
      AGENCY
    );
    expect(links.map((link) => [link.href, link.text, link.wrapsImage])).toEqual([
      ['https://real.example/', 'Real site', false],
      ['https://open.example/', '', true],
      ['https://next.example/', 'Next', false],
      ['https://eof.example/', 'tail text', false],
    ]);
  });

  it('stays linear on 5 MB of unclosed footer anchors', () => {
    const unit = '<footer><a href=x>';
    const html = unit.repeat(Math.ceil((5 * 1024 * 1024) / unit.length));
    const started = performance.now();
    const links = extractLinks(html, AGENCY);
    const elapsed = performance.now() - started;
    expect(links.length).toBe(Math.ceil((5 * 1024 * 1024) / unit.length));
    expect(links[0]).toMatchObject({ href: 'https://www.agency.com/x', region: 'footer' });
    expect(elapsed).toBeLessThan(1000);
  });

  it('stays linear on 5 MB of unclosed anchors, divs and landmark divs', () => {
    const html =
      '<div role="contentinfo">'.repeat(40_000) +
      '<a href="https://a.example/">'.repeat(40_000) +
      '</div>'.repeat(80_000) +
      '<section><header>'.repeat(40_000) +
      '</header></nav>'.repeat(40_000);
    expect(html.length).toBeGreaterThan(3 * 1024 * 1024);
    const started = performance.now();
    const links = extractLinks(html, AGENCY);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(links).toHaveLength(40_000);
    expect(links[0].region).toBe('footer');
  });
});

describe('findPortfolioPages', () => {
  it('ranks path+text over path over text, then the shallowest path, at most three', () => {
    const links = extractLinks(HOMEPAGE, AGENCY);
    expect(findPortfolioPages(links, AGENCY)).toEqual([
      'https://www.agency.com/portfolio/',
      'https://www.agency.com/case-studies/',
      'https://www.agency.com/projects/web/',
    ]);
    expect(findPortfolioPages(links, AGENCY, 4)).toEqual([
      'https://www.agency.com/portfolio/',
      'https://www.agency.com/case-studies/',
      'https://www.agency.com/projects/web/',
      'https://www.agency.com/blog/',
    ]);
  });

  it('matches segments ending in -portfolio and the client-list paths added after the second pilot', () => {
    const links = extractLinks(
      '<a href="/houston-marketing-portfolio">Houston</a>' +
        '<a href="/san-diego-web-design-portfolio/">SD</a>' +
        '<a href="/website-design-portfolio/">Sites</a>' +
        '<a href="/our-clients/">Who we help</a>' +
        '<a href="/digital-clients/">Digital</a>' +
        '<a href="/portfolio-news/">News</a>' +
        '<a href="/about/">About</a>',
      AGENCY
    );
    expect(findPortfolioPages(links, AGENCY, 10)).toEqual([
      'https://www.agency.com/houston-marketing-portfolio',
      'https://www.agency.com/san-diego-web-design-portfolio/',
      'https://www.agency.com/website-design-portfolio/',
      'https://www.agency.com/our-clients/',
      'https://www.agency.com/digital-clients/',
    ]);
  });

  it('ignores other origins and /api/ paths', () => {
    const links = extractLinks(
      '<a href="https://other.example/portfolio/">Portfolio</a><a href="/api/portfolio/">Portfolio</a>',
      AGENCY
    );
    expect(findPortfolioPages(links, AGENCY)).toEqual([]);
  });
});

describe('sitemap helpers', () => {
  it('greps <loc> entries and keeps the portfolio-shaped same-origin ones', () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://www.agency.com/</loc></url>
      <url><loc> https://www.agency.com/our-work/acme/ </loc></url>
      <url><loc>https://www.agency.com/our-work/</loc></url>
      <url><loc>https://www.agency.com/blog/post/</loc></url>
      <url><loc>https://other.example/portfolio/</loc></url>
      <url><loc>https://www.agency.com/page?a=1&amp;b=2</loc></url>
    </urlset>`;
    const locs = sitemapLocs(xml);
    expect(locs).toHaveLength(6);
    expect(locs[5]).toBe('https://www.agency.com/page?a=1&b=2');
    expect(findPortfolioLocs(locs, AGENCY)).toEqual([
      'https://www.agency.com/our-work/',
      'https://www.agency.com/our-work/acme/',
    ]);
  });

  it('dedupes a large sitemap in linear time (20k distinct portfolio URLs plus repeats)', () => {
    const locs = Array.from({ length: 20_000 }, (_, i) => `https://www.agency.com/portfolio/item-${i}/`);
    locs.push(...locs.slice(0, 500), 'https://www.agency.com/portfolio/');
    const started = performance.now();
    const picked = findPortfolioLocs(locs, AGENCY, 3);
    expect(performance.now() - started).toBeLessThan(500);
    expect(picked).toEqual([
      'https://www.agency.com/portfolio/',
      'https://www.agency.com/portfolio/item-0/',
      'https://www.agency.com/portfolio/item-1/',
    ]);
  });
});

describe('exclusionReasonFor', () => {
  it('names the list a hostname falls under', () => {
    expect(exclusionReasonFor('www.facebook.com', 'agency.com')).toBe('social-directory');
    expect(exclusionReasonFor('play.google.com', 'agency.com')).toBe('social-directory');
    expect(exclusionReasonFor('g.page', 'agency.com')).toBe('social-directory');
    expect(exclusionReasonFor('cdn.wp.com', 'agency.com')).toBe('cdn-asset');
    expect(exclusionReasonFor('d1abc.cloudfront.net', 'agency.com')).toBe('cdn-asset');
    expect(exclusionReasonFor('wordpress.org', 'agency.com')).toBe('platform-vendor');
    expect(exclusionReasonFor('schema.org', 'agency.com')).toBe('platform-vendor');
    expect(exclusionReasonFor('support.agency.com', 'agency.com')).toBe('agency-domain');
    expect(exclusionReasonFor('93.184.216.34', 'agency.com')).toBe('not-a-domain');
    expect(exclusionReasonFor('www.reddit.com', 'agency.com')).toBe('social-directory');
    expect(exclusionReasonFor('agency.tumblr.com', 'agency.com')).toBe('social-directory');
    expect(exclusionReasonFor('medium.com', 'agency.com')).toBe('social-directory');
    expect(exclusionReasonFor('userway.org', 'agency.com')).toBe('platform-vendor');
    // Second batch pilot (2026-11-02).
    for (const host of [
      'statcounter.com',
      'agency.freshdesk.com',
      'www.freshworks.com',
      'cdn.trustindex.io',
      'www.siteground.es',
      'www.elegantthemes.com',
      'link.leadconnectorhq.com',
      'www.gohighlevel.com',
      'incsub.com',
      'wpmudev.com',
      'complianz.io',
      'cookiedatabase.org',
      'share.hsforms.com',
      'www.hubspot.com',
      'calendly.com',
    ]) {
      expect(exclusionReasonFor(host, 'agency.com'), host).toBe('platform-vendor');
    }
    for (const host of ['www.chamberofcommerce.com', 'share.google', 'goo.gl', 'maps.app.goo.gl']) {
      expect(exclusionReasonFor(host, 'agency.com'), host).toBe('social-directory');
    }
    expect(exclusionReasonFor('lh3.googleusercontent.com', 'agency.com')).toBe('cdn-asset');
    // Bare names match the second-level label only.
    expect(exclusionReasonFor('statcounterfan.com', 'agency.com')).toBeNull();
    expect(exclusionReasonFor('share.googlefan.com', 'agency.com')).toBeNull();
    expect(exclusionReasonFor('clientone.com', 'agency.com')).toBeNull();
    expect(exclusionReasonFor('www.clienttwo.co.uk', 'agency.com')).toBeNull();
  });
});

function sourced(
  href: string,
  sourceUrl: string,
  extra: Partial<SourcedLink> = {}
): SourcedLink {
  return {
    href,
    text: '',
    wrapsImage: false,
    targetBlank: false,
    rel: '',
    region: 'main',
    sourceUrl,
    portfolio: sourceUrl !== AGENCY,
    ...extra,
  };
}

describe('rankClientCandidates', () => {
  it('scores the published signals per external domain and lists exclusions with reasons', () => {
    const home = extractLinks(HOMEPAGE, AGENCY).map(
      (link): SourcedLink => ({ ...link, sourceUrl: AGENCY, portfolio: false })
    );
    const portfolio = extractLinks(
      '<a href="https://clientone.com/" target="_blank">View website</a><a href="https://clientfive.com/">Client Five</a>',
      'https://www.agency.com/portfolio/'
    ).map((link): SourcedLink => ({ ...link, sourceUrl: 'https://www.agency.com/portfolio/', portfolio: true }));

    const ranking = rankClientCandidates([...home, ...portfolio], 'agency.com');

    // No bonus for extra source pages any more; a pick needs the portfolio-page signal.
    expect(ranking.candidates.map((candidate) => [candidate.domain, candidate.score])).toEqual([
      ['clientone.com', 8],
      ['clientfive.com', 3],
    ]);
    const one = ranking.candidates.find((candidate) => candidate.domain === 'clientone.com');
    expect(one?.signals).toEqual(['portfolio-page', 'target-blank', 'visit-text', 'wraps-image']);
    expect(one?.sourcePages).toEqual([AGENCY, 'https://www.agency.com/portfolio/']);
    expect(ranking.excluded).toEqual([
      { domain: 'agency.com', reason: 'agency-domain' },
      { domain: 'clientfour.net', reason: 'homepage-only', score: -2, signals: ['deep-hostname'], sourcePages: [AGENCY] },
      { domain: 'clientthree.com', reason: 'homepage-only', score: 2, signals: ['visit-text'], sourcePages: [AGENCY] },
      {
        domain: 'clienttwo.co.uk',
        reason: 'homepage-only',
        score: 3,
        signals: ['target-blank', 'visit-text'],
        sourcePages: [AGENCY],
      },
      { domain: 'facebook.com', reason: 'social-directory' },
      { domain: 'g.page', reason: 'social-directory' },
      { domain: 'google.com', reason: 'social-directory' },
      { domain: 'wordpress.org', reason: 'platform-vendor' },
      { domain: 'wp.com', reason: 'cdn-asset' },
    ]);
  });

  it('skips social share endpoints on any host instead of ranking them', () => {
    const links: SourcedLink[] = [
      'https://www.reddit.com/submit?url=https%3A%2F%2Fagency.com',
      'https://www.tumblr.com/share/link?url=x',
      'https://twitter.com/intent/tweet?url=x',
      'https://www.facebook.com/sharer/sharer.php?u=x',
      'https://client.example/share-the-love/',
      'https://sharehost.example/submit/',
    ].map((href) => sourced(href, 'https://www.agency.com/our-work/', { text: 'Share', targetBlank: true }));
    const ranking = rankClientCandidates(links, 'agency.com');
    expect(ranking.candidates.map((candidate) => candidate.domain)).toEqual(['client.example']);
    expect(ranking.excluded).toEqual([]);
  });

  it('excludes the final homepage domain too when the agency redirected to another registrable domain', () => {
    // agency-old.com redirects to agencynew.com; the homepage links are gathered
    // from the final origin, so its own pages carry the new domain.
    const finalBase = 'https://www.agencynew.com/';
    const links = extractLinks(
      '<a href="https://www.agencynew.com/work/" target="_blank"><img src="/x.png" alt=""></a>' +
        '<a href="https://shop.agencynew.com/">Visit the live site</a>' +
        '<a href="https://agency-old.com/legacy/">Old site</a>' +
        '<a href="https://clientone.com/" target="_blank">clientone.com</a>',
      finalBase
    ).map((link): SourcedLink => ({ ...link, sourceUrl: `${finalBase}work/`, portfolio: true }));

    const requestedOnly = rankClientCandidates(links, 'agency-old.com');
    expect(requestedOnly.candidates.map((candidate) => candidate.domain)).toContain('agencynew.com');

    const both = rankClientCandidates(links, ['agency-old.com', 'agencynew.com']);
    expect(both.candidates.map((candidate) => candidate.domain)).toEqual(['clientone.com']);
    expect(both.excluded).toEqual([
      { domain: 'agency-old.com', reason: 'agency-domain' },
      { domain: 'agencynew.com', reason: 'agency-domain' },
    ]);
    expect(exclusionReasonFor('www.agencynew.com', ['agency-old.com', 'AgencyNew.com'])).toBe('agency-domain');
    expect(exclusionReasonFor('clientone.com', ['agency-old.com', 'agencynew.com'])).toBeNull();
  });

  it('excludes a domain linked from every fetched page once three or more were fetched', () => {
    const pages = [AGENCY, 'https://www.agency.com/portfolio/', 'https://www.agency.com/portfolio/acme/'];
    const links = [
      ...pages.map((page) => sourced('https://vendor.example/', page, { targetBlank: true })),
      sourced('https://acme.example/', pages[2], { text: 'Visit website' }),
      sourced('https://acme.example/', pages[1], { wrapsImage: true }),
      // Internal links only: the page still counts as fetched.
      sourced('https://www.agency.com/contact/', pages[1]),
    ];
    const ranking = rankClientCandidates(links, 'agency.com');
    expect(ranking.candidates.map((candidate) => [candidate.domain, candidate.score])).toEqual([['acme.example', 7]]);
    expect(ranking.excluded).toContainEqual({
      domain: 'vendor.example',
      reason: 'site-wide',
      score: 4,
      signals: ['portfolio-page', 'target-blank'],
      sourcePages: [...pages].sort(),
    });

    // Two fetched pages: on both is not site-wide.
    const two = rankClientCandidates(
      [AGENCY, pages[1]].map((page) => sourced('https://vendor.example/', page)),
      'agency.com'
    );
    expect(two.candidates.map((candidate) => candidate.domain)).toEqual(['vendor.example']);
  });

  it('keeps a client logo wall in main on every page out of site-wide; text footer links on every page stay site-wide', () => {
    const pages = [AGENCY, 'https://www.agency.com/portfolio/', 'https://www.agency.com/case-studies/'];
    const links = [
      // Logo wall in <main> on the homepage and every portfolio page.
      ...pages.map((page) => sourced('https://logowall.example/', page, { wrapsImage: true, region: 'main' })),
      // Vendor text link in the semantic footer of every page.
      ...pages.map((page) => sourced('https://footervendor.example/', page, { text: 'Powered by', region: 'footer' })),
      // Vendor image badge in the footer of every page: chrome, so still site-wide.
      ...pages.map((page) => sourced('https://badge.example/', page, { wrapsImage: true, region: 'footer' })),
      // Vendor text link in a non-semantic footer (region main) on every page: still site-wide.
      ...pages.map((page) => sourced('https://divfooter.example/', page, { text: 'Hosting by', region: 'main' })),
    ];
    const ranking = rankClientCandidates(links, 'agency.com');
    expect(ranking.candidates.map((candidate) => candidate.domain)).toEqual(['logowall.example']);
    expect(ranking.excluded.map((entry) => [entry.domain, entry.reason])).toEqual([
      ['badge.example', 'site-wide'],
      ['divfooter.example', 'site-wide'],
      ['footervendor.example', 'site-wide'],
    ]);
  });

  it('counts every successfully fetched page for site-wide, including one that kept no links', () => {
    const pages = [AGENCY, 'https://www.agency.com/portfolio/', 'https://www.agency.com/case-studies/'];
    const links = pages.map((page) => sourced('https://onthree.example/', page, { text: 'Our partner' }));
    expect(rankClientCandidates(links, 'agency.com').excluded.map((entry) => entry.reason)).toEqual(['site-wide']);
    const withEmptyPage = rankClientCandidates(links, 'agency.com', undefined, {
      fetchedPages: [...pages, 'https://www.agency.com/our-work/'],
    });
    expect(withEmptyPage.candidates.map((candidate) => candidate.domain)).toEqual(['onthree.example']);
    expect(withEmptyPage.excluded).toEqual([]);
  });

  it('excludes a domain linked only from headers, navs and footers unless a link wraps an image', () => {
    const page = 'https://www.agency.com/portfolio/';
    const regions: LinkRegion[] = ['header', 'nav', 'footer'];
    const links = [
      ...regions.map((region) => sourced('https://chrome.example/', page, { region, targetBlank: true })),
      sourced('https://logo.example/', page, { region: 'footer', wrapsImage: true }),
      sourced('https://mixed.example/', page, { region: 'footer' }),
      sourced('https://mixed.example/', page, { region: 'main' }),
    ];
    const ranking = rankClientCandidates(links, 'agency.com');
    expect(ranking.candidates.map((candidate) => candidate.domain)).toEqual(['logo.example', 'mixed.example']);
    expect(ranking.excluded).toEqual([
      {
        domain: 'chrome.example',
        reason: 'chrome-only',
        score: 4,
        signals: ['portfolio-page', 'target-blank'],
        sourcePages: [page],
      },
    ]);
  });

  it('excludes sibling brands of the agency', () => {
    const page = 'https://dallaswebstudios.com/portfolio/';
    const links = ['https://thewebstudios.com/', 'https://liftcreations.com/', 'https://singletwiststudio.com/'].map((href) =>
      sourced(href, page, { targetBlank: true })
    );
    const ranking = rankClientCandidates(links, 'dallaswebstudios.com');
    expect(ranking.candidates.map((candidate) => candidate.domain)).toEqual(['liftcreations.com', 'singletwiststudio.com']);
    expect(ranking.excluded).toEqual([{ domain: 'thewebstudios.com', reason: 'sibling-brand' }]);
  });
});

describe('sharedBrandRun', () => {
  it('finds a shared six-letter run of the second-level labels, letters only, case-insensitive', () => {
    expect(sharedBrandRun('infinihosting.com', 'infinimarketing.com')).toBe('infini');
    expect(sharedBrandRun('In-Fini-Hosting.co.uk', 'www.InfiniMarketing.com')).toBe('infini');
    expect(sharedBrandRun('in1fini2hosting.com', 'infinimarketing.com')).toBe('infini');
    expect(exclusionReasonFor('domains.infinihosting.com', 'infinimarketing.com')).toBe('sibling-brand');
    expect(exclusionReasonFor('www.thewebstudios.com', ['dallaswebstudios.com'])).toBe('sibling-brand');
  });

  it('ignores runs shorter than six letters and runs inside one generic business word', () => {
    // "studio" sits inside the generic word "studios": a trade, not a brand.
    expect(sharedBrandRun('singletwiststudio.com', 'dentonwebstudios.com')).toBeNull();
    expect(sharedBrandRun('stellasroomstudio.com', 'mckinneywebstudios.com')).toBeNull();
    expect(sharedBrandRun('acmemarketing.com', 'infinimarketing.com')).toBeNull();
    expect(sharedBrandRun('bestdesign.com', 'icebergwebdesign.com')).toBeNull();
    expect(sharedBrandRun('infin.com', 'infinimarketing.com')).toBeNull();
    expect(sharedBrandRun('liftcreations.com', 'dallaswebstudios.com')).toBeNull();
    expect(exclusionReasonFor('singletwiststudio.com', 'dentonwebstudios.com')).toBeNull();
  });

  it('ignores runs covered by a concatenation of generic words, keeps brand runs that are not', () => {
    // "etings" spans marketing + studio: two trade words, no brand.
    expect(sharedBrandRun('redmarketingstudio.com', 'bluemarketingstudio.com')).toBeNull();
    expect(exclusionReasonFor('redmarketingstudio.com', 'bluemarketingstudio.com')).toBeNull();
    expect(sharedBrandRun('acmedesignstudio.com', 'zenithdesignstudio.com')).toBeNull();
    // "webstu" spans web + studio: a real client of a web-studio agency is not a sibling.
    expect(sharedBrandRun('acmewebstudio.com', 'dallaswebstudios.com')).toBeNull();
    expect(exclusionReasonFor('acmewebstudio.com', 'dallaswebstudios.com')).toBeNull();
    expect(sharedBrandRun('thewebstudios.com', 'dallaswebstudios.com')).toBeNull();
    // Regressions: a brand run survives the guard.
    expect(sharedBrandRun('infinihosting.com', 'infinimarketing.com')).toBe('infini');
    expect(exclusionReasonFor('infinihosting.com', 'infinimarketing.com')).toBe('sibling-brand');
    expect(sharedBrandRun('acmemarketingstudio.com', 'acmemarketinggroup.com')).toBe('acmema');
  });
});

describe('genericSiblingWord', () => {
  it('excludes a generic-only name that shares a generic word with the agency (pilot 2: all four webstudios agencies)', () => {
    for (const agency of ['dallaswebstudios.com', 'dentonwebstudios.com', 'mckinneywebstudios.com', 'sandiegowebstudios.com']) {
      expect(genericSiblingWord('thewebstudios.com', agency)).toBe('web');
      expect(exclusionReasonFor('www.thewebstudios.com', agency)).toBe('sibling-brand');
    }
    expect(genericSiblingWord('The-Web-Studios.co.uk', 'www.DallasWebStudios.com')).toBe('web');
  });

  it('keeps a name with a brand of three or more letters, and a generic-only name sharing no word with the agency', () => {
    expect(genericSiblingWord('acmewebstudio.com', 'dallaswebstudios.com')).toBeNull();
    // Two letters left is generic-only, three is a brand.
    expect(genericSiblingWord('mywebstudio.com', 'dallaswebstudios.com')).toBe('web');
    expect(genericSiblingWord('abcwebstudio.com', 'dallaswebstudios.com')).toBeNull();
    expect(exclusionReasonFor('abcwebstudio.com', 'dallaswebstudios.com')).toBeNull();
    // Generic-only, but the agency's label holds none of its words.
    expect(genericSiblingWord('thewebstudios.com', 'infinimarketing.com')).toBeNull();
    expect(exclusionReasonFor('thewebstudios.com', 'infinimarketing.com')).toBeNull();
    // Brand names are left to sharedBrandRun.
    expect(genericSiblingWord('redmarketingstudio.com', 'bluemarketingstudio.com')).toBeNull();
    expect(genericSiblingWord('infinihosting.com', 'infinimarketing.com')).toBeNull();
  });

  it('skips labels longer than a DNS label instead of walking them', () => {
    const long = `${'web'.repeat(30_000)}.com`;
    const started = performance.now();
    expect(genericSiblingWord(long, 'dallaswebstudios.com')).toBeNull();
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe('findPortfolioItemPages', () => {
  it('keeps same-origin /portfolio|project(s)|case-stud(y|ies)|work/<slug>/ pages in link order, skipping fetched ones', () => {
    const links = extractLinks(
      '<a href="/portfolio/acme/">Acme</a>' +
        '<a href="/project/beta/?ref=x#top">Beta</a>' +
        '<a href="/projects/gamma/">Gamma</a>' +
        '<a href="/case-study/delta/">Delta</a>' +
        '<a href="/case-studies/epsilon/">Epsilon</a>' +
        '<a href="/work/zeta/">Zeta</a>' +
        '<a href="/portfolio/">Index</a>' +
        '<a href="/portfolio/page/2/">Page 2</a>' +
        '<a href="/portfolio/category/">Category</a>' +
        '<a href="/blog/post/">Post</a>' +
        '<a href="https://other.example/portfolio/x/">Other</a>' +
        '<a href="/portfolio/acme">Acme again</a>' +
        '<a href="/work/eta/">Eta</a>',
      AGENCY
    );
    expect(findPortfolioItemPages(links, AGENCY, ['https://www.agency.com/work/zeta'])).toEqual([
      'https://www.agency.com/portfolio/acme/',
      'https://www.agency.com/project/beta/',
      'https://www.agency.com/projects/gamma/',
      'https://www.agency.com/case-study/delta/',
      'https://www.agency.com/case-studies/epsilon/',
      'https://www.agency.com/work/eta/',
    ]);
    expect(findPortfolioItemPages(links, AGENCY, [], 2)).toHaveLength(2);
  });

  it('also follows item pages under our-work and any parent ending in -portfolio, as PORTFOLIO_PATH does', () => {
    const links = extractLinks(
      '<a href="/our-work/acme/">Acme</a>' +
        '<a href="/houston-marketing-portfolio/beta/">Beta</a>' +
        '<a href="/website-design-portfolio/gamma/">Gamma</a>' +
        '<a href="/portfolio-news/delta/">Not a parent</a>' +
        '<a href="/our-work/page/">Listing</a>',
      AGENCY
    );
    expect(findPortfolioItemPages(links, AGENCY)).toEqual([
      'https://www.agency.com/our-work/acme/',
      'https://www.agency.com/houston-marketing-portfolio/beta/',
      'https://www.agency.com/website-design-portfolio/gamma/',
    ]);
  });
});

describe('creditsAgency', () => {
  it('finds the agency domain as a link or text on a hostname boundary', () => {
    expect(creditsAgency('<footer>Website by <a href="https://www.agency.com/">Agency</a></footer>', 'agency.com')).toBe(true);
    expect(creditsAgency('<p>Designed by AGENCY.COM.</p>', 'agency.com')).toBe(true);
    expect(creditsAgency('<p>Designed by agency.com</p>', ['old-agency.com', 'agency.com'])).toBe(true);
    expect(creditsAgency('<a href="https://myagency.com/">x</a>', 'agency.com')).toBe(false);
    expect(creditsAgency('<a href="https://agency.company.com/">x</a>', 'agency.com')).toBe(false);
    expect(creditsAgency('<a href="https://agency.com.au/">x</a>', 'agency.com')).toBe(false);
    expect(creditsAgency('<p>no credit</p>', 'agency.com')).toBe(false);
  });
});

describe('claimClientDomains', () => {
  it('keeps the first claim, notes the agency that holds a shared client, and leaves the input registry alone', () => {
    const registry = new Map<string, string>();
    const first = claimClientDomains(
      [{ domain: 'arista-talent.com' }, { domain: 'brendabogart.com' }],
      registry,
      'dentonwebstudios.com'
    );
    expect(first.picks.map((pick) => pick.domain)).toEqual(['arista-talent.com', 'brendabogart.com']);
    expect(first.shared).toEqual([]);
    expect(registry.size).toBe(0);

    const second = claimClientDomains(
      [{ domain: 'www.arista-talent.com', score: 7 }, { domain: 'careambulance.com', score: 7 }],
      first.registry,
      'mckinneywebstudios.com'
    );
    expect(second.picks).toEqual([{ domain: 'careambulance.com', score: 7 }]);
    expect(second.shared).toEqual([{ domain: 'arista-talent.com', shared_with: 'dentonwebstudios.com' }]);
    expect([...second.registry]).toEqual([
      ['arista-talent.com', 'dentonwebstudios.com'],
      ['brendabogart.com', 'dentonwebstudios.com'],
      ['careambulance.com', 'mckinneywebstudios.com'],
    ]);

    // The same agency again (a resumed run) keeps its own claims.
    const again = claimClientDomains([{ domain: 'brendabogart.com' }], second.registry, 'DentonWebStudios.com');
    expect(again.picks).toEqual([{ domain: 'brendabogart.com' }]);
    expect(again.shared).toEqual([]);
  });
});
