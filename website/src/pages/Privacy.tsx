const lastUpdated = 'August 8, 2026';

function Privacy() {
  return (
    <main>
      <article className="doc-page legal-page">
        <p className="license-kicker">Legal</p>
        <h1>Privacy Policy</h1>
        <p className="doc-intro">
          This Privacy Policy explains what data the agentmarkup website at
          agentmarkup.dev processes when you use it, why, and for how long. The
          data controller is Sebastian Cochinescu (agentmarkup), an individual
          established in Romania. You can contact the controller at{' '}
          <a href="mailto:hello@cochinescu.com">hello@cochinescu.com</a>. We have
          not appointed a Data Protection Officer or an Article 27 representative
          because we are not required to, given the limited scope of processing.
        </p>
        <p className="legal-updated">Last updated: {lastUpdated}</p>

        <section>
          <h2>1. Overview</h2>
          <p>
            We keep data collection to the minimum needed to run the site. We do
            not require accounts, and we do not ask for names, emails, or
            passwords to use the Services. We do not sell, rent, or share your
            data for advertising.
          </p>
        </section>

        <section>
          <h2>2. What we process, why, and on what basis</h2>
          <p>
            The following describes each processing activity, the data involved,
            our lawful basis under the EU General Data Protection Regulation
            (GDPR) where it applies, and the retention period:
          </p>
          <ul>
            <li>
              <strong>Running a scan or check.</strong> The URL you submit is used
              to perform the requested scan or check and to fetch public
              responses from the target and a public DNS resolver. Basis:
              legitimate interests (Article 6(1)(f)) in providing the Service you
              requested. Retention: results may be held in a short-term server
              cache for about three minutes; the address you typed is not stored
              in that cache.
            </li>
            <li>
              <strong>Rate limiting and abuse prevention.</strong> The edge worker
              stores a one-way SHA-256 hash of your IP address together with a
              timestamp so it can enforce a per-IP limit and detect abuse. We do
              not store your raw IP address. Basis: legitimate interests (Article
              6(1)(f)) in securing the Service. Retention: up to 24 hours.
            </li>
            <li>
              <strong>Checker history.</strong> The website checker stores a
              minimal record (the hashed IP, the normalized URL, and status
              codes) to operate and improve the checker. The passive security
              scan stores no scan history. Basis: legitimate interests (Article
              6(1)(f)). Retention: up to 30 days.
            </li>
            <li>
              <strong>Verification (Cloudflare Turnstile).</strong> After repeated
              requests from the same network, a Turnstile challenge may appear to
              confirm you are not an automated abuser. Completing it processes a
              challenge token. Basis: legitimate interests (Article 6(1)(f)) in
              preventing abuse.
            </li>
            <li>
              <strong>Analytics.</strong> If, and only if, you accept the cookie
              banner, we use Google Analytics (GA4) to understand aggregate usage.
              No analytics load if you decline. Basis: consent (Article 6(1)(a)),
              which you can withdraw at any time. Retention: as configured in
              Google Analytics.
            </li>
            <li>
              <strong>Consent record.</strong> Your cookie choice is stored
              locally in your browser so we can honor it. Basis: legitimate
              interests (Article 6(1)(f)) in respecting your choice.
            </li>
          </ul>
          <p>
            A hashed IP address is treated as pseudonymous rather than anonymous
            personal data: it does not directly identify you, but we still handle
            it carefully and retain it only briefly.
          </p>
        </section>

        <section>
          <h2>3. Data about scanned websites</h2>
          <p>
            When you run a scan or check, our server fetches publicly available
            responses from the target website and a public DNS resolver, and
            reports on them. We only request conventional public URLs and
            read-only DNS records. We do not retain the target's page content
            beyond the short-term cache described above. When scanning a
            third-party site, we never store the values of that site's cookies;
            the security scan extracts only redacted cookie metadata (the cookie
            name and the Secure, HttpOnly, and SameSite flags).
          </p>
        </section>

        <section>
          <h2>4. Cookies</h2>
          <p>
            The site sets no analytics cookies until you accept the cookie banner.
            If you accept, Google Analytics sets analytics cookies; if you decline,
            no analytics cookies are set. Your choice is remembered locally in your
            browser and can be changed. Cloudflare Turnstile, which appears only
            after repeated requests, may set a challenge-related token to complete
            verification.
          </p>
        </section>

        <section>
          <h2>5. Third-party processors and infrastructure</h2>
          <p>
            We use the following providers to run the site. Data necessary to
            deliver the Services is processed by them:
          </p>
          <ul>
            <li>
              <strong>Cloudflare</strong> hosts the site (Cloudflare Pages),
              provides the edge worker and its database, the Turnstile
              verification widget, and the DNS-over-HTTPS resolver used for the
              email-authentication checks. As part of hosting and network
              security, Cloudflare may process connection data, including IP
              addresses, at the edge under its own terms.
            </li>
            <li>
              <strong>Google</strong> provides Google Analytics, used only with
              your consent.
            </li>
          </ul>
          <p>
            These providers act as our processors or as independent controllers
            for their own infrastructure and security purposes, as applicable.
          </p>
        </section>

        <section>
          <h2>6. International transfers</h2>
          <p>
            Our providers may process data in countries outside the European
            Economic Area, including the United States. Where personal data is
            transferred outside the EEA, the transfer relies on appropriate
            safeguards, principally the European Commission's Standard
            Contractual Clauses maintained by the relevant provider. You may
            request more information about these safeguards using the contact
            details below.
          </p>
        </section>

        <section>
          <h2>7. Retention</h2>
          <p>
            Short-term cache entries expire after about three minutes. Hashed
            rate-limit records are retained for up to 24 hours. Checker history
            records are retained for up to 30 days. Analytics data retention is
            governed by Google Analytics settings. We do not keep personal data
            longer than needed for the purpose for which it was collected.
          </p>
        </section>

        <section>
          <h2>8. Your rights</h2>
          <p>
            Depending on your location, you may have the rights to access,
            rectify, erase, restrict, or object to the processing of your personal
            data, to data portability, and, where processing is based on consent,
            to withdraw that consent at any time without affecting prior
            processing. Because we store only a one-way hash of your IP address
            and no account information, we are usually unable to identify you or
            link data to you, which can limit our ability to action some requests.
            To make a request or ask a question, contact{' '}
            <a href="mailto:hello@cochinescu.com">hello@cochinescu.com</a>; we aim
            to respond within 30 days.
          </p>
          <p>
            If you are in the EU, you have the right to lodge a complaint with a
            supervisory authority, including the Romanian National Supervisory
            Authority for Personal Data Processing (ANSPDCP,{' '}
            <a href="https://www.dataprotection.ro/" target="_blank" rel="noopener noreferrer">
              dataprotection.ro
            </a>
            ) or the authority in your country of residence or work.
          </p>
        </section>

        <section>
          <h2>9. Children</h2>
          <p>
            The Services are not directed to children. You must be at least 16
            years old (or older where required by local law) to use the Services,
            and we do not knowingly process the personal data of children below
            that age. If you believe a child has provided us with personal data,
            contact us and we will delete it.
          </p>
        </section>

        <section>
          <h2>10. Changes</h2>
          <p>
            We may update this Policy from time to time. Material changes will be
            reflected by updating the date above. Please review this page
            periodically.
          </p>
        </section>

        <section>
          <h2>11. Contact</h2>
          <p>
            For any privacy question or to exercise your rights, contact the
            controller at{' '}
            <a href="mailto:hello@cochinescu.com">hello@cochinescu.com</a>. A
            postal address is available on request. See also our{' '}
            <a href="/terms/">Terms of Service</a>.
          </p>
        </section>
      </article>
    </main>
  );
}

export default Privacy;
