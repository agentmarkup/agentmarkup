function NotFound() {
  return (
    <main>
      <article className="doc-page legal-page">
        <p className="license-kicker">HTTP 404</p>
        <h1>Page not found</h1>
        <p className="doc-intro">
          This URL does not exist on agentmarkup.dev. The response you are
          reading carries a real HTTP 404 status, so crawlers and agents can
          tell it apart from a page that does exist.
        </p>

        <section>
          <h2>Machine-readable entry points</h2>
          <p>
            If you are an agent looking for the structure of this site, start
            with one of these instead of guessing paths:
          </p>
          <ul>
            <li>
              <a href="/llms.txt">/llms.txt</a> - the site manifest, including
              what agentmarkup is for and when to use it
            </li>
            <li>
              <a href="/llms-full.txt">/llms-full.txt</a> - the same manifest
              with page content inlined
            </li>
            <li>
              <a href="/sitemap.xml">/sitemap.xml</a> - every indexable URL
            </li>
            <li>
              <a href="/robots.txt">/robots.txt</a> - crawler rules, including
              AI crawler directives
            </li>
          </ul>
          <p>
            Every indexable content page on this site also has a markdown mirror
            at the same path with a <code>.md</code> extension, for example{' '}
            <a href="/learn.md">/learn.md</a>. This 404 page deliberately does
            not, so no URL answers 200 with not-found content.
          </p>
        </section>

        <section>
          <h2>Where you probably wanted to go</h2>
          <ul>
            <li>
              <a href="/">Home</a> - what agentmarkup does and how to install it
            </li>
            <li>
              <a href="/learn/">Learning Center</a> - the documentation index
            </li>
            <li>
              <a href="/checker/">Website checker</a> - check any public site
              for llms.txt, JSON-LD, robots.txt and markdown mirrors
            </li>
            <li>
              <a href="/security-scan/">Security scan</a> - passive security
              header and DNS checks for a public site
            </li>
            <li>
              <a href="/blog/">Blog</a> - technical writing about
              machine-readable websites
            </li>
            <li>
              <a href="/support/">Support</a> and{' '}
              <a href="/contact/">Contact</a> - how to reach the maintainer
            </li>
          </ul>
        </section>

        <section>
          <h2>Think this is a broken link?</h2>
          <p>
            If you followed a link from somewhere on this site,{' '}
            <a
              href="https://github.com/agentmarkup/agentmarkup/issues"
              target="_blank"
              rel="noopener noreferrer"
            >
              open an issue
            </a>{' '}
            with the URL you came from. Broken internal links are treated as a
            bug here, not a nuisance.
          </p>
        </section>
      </article>
    </main>
  )
}

export default NotFound
