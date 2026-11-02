import { describe, expect, it } from 'vitest';
import {
  canonicalizeAgencyUrl,
  exclusionReasonFor,
  extractLinks,
  findPortfolioLocs,
  findPortfolioPages,
  rankClientCandidates,
  sitemapLocs,
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
});

describe('findPortfolioPages', () => {
  it('ranks path+text over path over text, then the shallowest path, at most two', () => {
    const links = extractLinks(HOMEPAGE, AGENCY);
    expect(findPortfolioPages(links, AGENCY)).toEqual([
      'https://www.agency.com/portfolio/',
      'https://www.agency.com/case-studies/',
    ]);
    expect(findPortfolioPages(links, AGENCY, 4)).toEqual([
      'https://www.agency.com/portfolio/',
      'https://www.agency.com/case-studies/',
      'https://www.agency.com/projects/web/',
      'https://www.agency.com/blog/',
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
    expect(exclusionReasonFor('clientone.com', 'agency.com')).toBeNull();
    expect(exclusionReasonFor('www.clienttwo.co.uk', 'agency.com')).toBeNull();
  });
});

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

    expect(ranking.candidates.map((candidate) => [candidate.domain, candidate.score])).toEqual([
      ['clientone.com', 9],
      ['clientthree.com', 2],
      ['clienttwo.co.uk', 3],
      ['clientfive.com', 3],
      ['clientfour.net', -2],
    ].sort((a, b) => Number(b[1]) - Number(a[1]) || String(a[0]).localeCompare(String(b[0]))));
    const one = ranking.candidates.find((candidate) => candidate.domain === 'clientone.com');
    expect(one?.signals).toEqual([
      'portfolio-page',
      'target-blank',
      'visit-text',
      'wraps-image',
      'extra-source-pages:1',
    ]);
    expect(one?.sourcePages).toEqual([AGENCY, 'https://www.agency.com/portfolio/']);
    const four = ranking.candidates.find((candidate) => candidate.domain === 'clientfour.net');
    expect(four?.signals).toEqual(['deep-hostname']);
    expect(ranking.excluded).toEqual([
      { domain: 'agency.com', reason: 'agency-domain' },
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
    ].map((href) => ({
      href,
      text: 'Share',
      wrapsImage: false,
      targetBlank: true,
      rel: '',
      sourceUrl: 'https://www.agency.com/our-work/',
      portfolio: true,
    }));
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
    ).map((link): SourcedLink => ({ ...link, sourceUrl: finalBase, portfolio: false }));

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

  it('caps the extra-source-page bonus at two', () => {
    const links: SourcedLink[] = ['/a/', '/b/', '/c/', '/d/'].map((path) => ({
      href: 'https://client.example/',
      text: 'Client',
      wrapsImage: false,
      targetBlank: false,
      rel: '',
      sourceUrl: `https://www.agency.com${path}`,
      portfolio: false,
    }));
    const ranking = rankClientCandidates(links, 'agency.com');
    expect(ranking.candidates).toEqual([
      {
        domain: 'client.example',
        score: 2,
        signals: ['extra-source-pages:2'],
        sourcePages: [
          'https://www.agency.com/a/',
          'https://www.agency.com/b/',
          'https://www.agency.com/c/',
          'https://www.agency.com/d/',
        ],
      },
    ]);
  });
});
