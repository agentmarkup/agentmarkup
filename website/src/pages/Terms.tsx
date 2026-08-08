const lastUpdated = 'August 8, 2026';

function Terms() {
  return (
    <main>
      <article className="doc-page legal-page">
        <p className="license-kicker">Legal</p>
        <h1>Terms of Service</h1>
        <p className="doc-intro">
          These Terms of Service ("Terms") govern your use of the agentmarkup
          website at agentmarkup.dev, including the website checker and the
          passive security scan (the "Services"). The Services are operated by
          Sebastian Cochinescu, an individual doing business as agentmarkup ("we",
          "us", "our", or the "operator"). By using the Services you agree to
          these Terms. If you do not agree, do not use the Services.
        </p>
        <p className="legal-updated">Last updated: {lastUpdated}</p>

        <section>
          <h2>1. What the Services do</h2>
          <p>
            The Services fetch publicly available information about a website you
            submit and report automated, point-in-time findings for
            informational purposes. The security scan performs a passive read of
            publicly served responses: it sends ordinary GET requests to
            conventional public URLs and a few read-only DNS lookups, comparable
            to those a browser or mail resolver makes. It does not enumerate
            paths, scan ports, send payloads, fuzz inputs, probe TLS internals,
            authenticate, or run a headless browser. Findings describe
            configuration hygiene, such as the presence of defensive headers,
            and are not a discovery of exploitable vulnerabilities. Results may
            vary over time and between requests. The Services are provided free
            of charge for informational and educational use only.
          </p>
        </section>

        <section>
          <h2>2. Authorized use only</h2>
          <p>
            You may use the Services only to assess websites that you own or that
            you are explicitly authorized to assess. You are solely responsible
            for ensuring you have all necessary rights and permissions before
            submitting any URL. You must comply with all applicable laws,
            including computer-misuse and unauthorized-access laws such as the
            United States Computer Fraud and Abuse Act (CFAA), the UK Computer
            Misuse Act, and equivalent laws in your jurisdiction and the
            jurisdiction of the target website.
          </p>
          <p>
            You agree to respect the wishes of website operators who do not want
            their systems assessed, and to stop assessing any site on request.
            We are not a party to, and accept no responsibility for, your
            relationship with, or your authorization to assess, any third-party
            website. We are not your agent and enter into no partnership or joint
            venture with you or with any target website by providing the
            Services.
          </p>
        </section>

        <section>
          <h2>3. Acceptable use</h2>
          <p>You agree that you will not, and will not attempt to:</p>
          <ul>
            <li>
              use the Services, or any report or data produced by them, for any
              unlawful, harmful, or malicious purpose, including to attack,
              exploit, gain unauthorized access to, or disrupt any system;
            </li>
            <li>
              assess any website without the rights or permissions described in
              Section 2;
            </li>
            <li>
              circumvent, disable, or interfere with rate limiting, verification
              challenges, caching, the authorization confirmation, or any other
              protection or security feature of the Services;
            </li>
            <li>
              use the Services to build a competing dataset through automated
              bulk or high-volume querying, or to place an unreasonable load on
              the Services or on any target website;
            </li>
            <li>
              alter, forge, or misrepresent a report, present a report as a
              certification or as proof that a website is secure, insecure, or
              compliant, or use a report to harass, extort, defame, or infringe
              the rights of others;
            </li>
            <li>
              misrepresent the source of your requests.
            </li>
          </ul>
        </section>

        <section>
          <h2>4. Enforcement, abuse reporting, and cooperation</h2>
          <p>
            We may, at any time and without notice, suspend, restrict, block, or
            terminate access to the Services, including to protect the Services,
            a target website, or any third party. We may investigate suspected
            misuse or unlawful activity, block specific users, networks, or
            domains, and preserve relevant records. To the extent permitted by
            law, we may disclose information and report suspected unlawful or
            abusive activity to hosting providers, affected website operators,
            regulators, or law-enforcement authorities. Website operators who do
            not want their site assessed, and anyone wishing to report abuse, may
            contact us at{' '}
            <a href="mailto:hello@cochinescu.com">hello@cochinescu.com</a> or
            through <a href="/.well-known/security.txt">security.txt</a>, and we
            will act on reasonable requests, including blocking a domain on
            verification of ownership.
          </p>
        </section>

        <section>
          <h2>5. No warranty</h2>
          <p>
            THE SERVICES AND ALL REPORTS, FINDINGS, AND DATA THEY PRODUCE ARE
            PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTY OF ANY KIND,
            EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE IMPLIED
            WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
            NONINFRINGEMENT.
          </p>
          <p>
            We do not warrant that the Services will be uninterrupted, timely,
            secure, or error-free, or that any finding is accurate, complete, or
            current. The Services are not a penetration test, a vulnerability
            assessment, a security audit, or a certification. A passing result
            does not mean a website is secure, and a warning or error does not
            prove a website is exploitable. The findings are not security advice
            and are not legal advice. You are responsible for independently
            verifying any finding before relying on it.
          </p>
        </section>

        <section>
          <h2>6. Assumption of risk</h2>
          <p>
            You use the Services and any report at your own risk. You are solely
            responsible for any decision or action taken based on a report,
            including any consequence of relying on a false positive, a false
            negative, a stale or point-in-time result, a service interruption, or
            a change made in response to a finding, and for any consequence of
            sharing or publishing a report.
          </p>
        </section>

        <section>
          <h2>7. Limitation of liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL THE OPERATOR
            OR ITS CONTRIBUTORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
            CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS,
            REVENUE, DATA, GOODWILL, OR BUSINESS OPPORTUNITY, ARISING OUT OF OR IN
            CONNECTION WITH YOUR USE OF, OR INABILITY TO USE, THE SERVICES OR ANY
            REPORT OR DATA THEY PRODUCE, WHETHER BASED ON WARRANTY, CONTRACT, TORT
            (INCLUDING NEGLIGENCE), OR ANY OTHER LEGAL THEORY, AND WHETHER OR NOT
            WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
          </p>
          <p>
            To the maximum extent permitted by law, our total aggregate liability
            for all claims relating to the Services is limited to the greater of
            the amount you paid to use the Services (which is zero, as the
            Services are free) or one hundred United States dollars (USD 100).
          </p>
          <p>
            Nothing in these Terms excludes or limits our liability for fraud or
            fraudulent misrepresentation, for death or personal injury caused by
            our negligence, or for any other liability that cannot be excluded or
            limited under applicable law, including any non-waivable rights you
            may have as a consumer. Where any exclusion or limitation in these
            Terms is not permitted, it applies only to the smallest extent the
            law allows.
          </p>
        </section>

        <section>
          <h2>8. Indemnification</h2>
          <p>
            To the extent permitted by applicable law, you agree to defend,
            indemnify, and hold harmless the operator and its contributors from
            and against any third-party claims, liabilities, damages, losses, and
            expenses, including reasonable legal fees, arising out of or connected
            with your unauthorized assessment of any website, your unlawful or
            prohibited use of the Services, or your breach of these Terms. This
            Section does not apply to the extent such indemnity is not
            enforceable against you as a consumer under applicable law.
          </p>
        </section>

        <section>
          <h2>9. Third-party websites and services</h2>
          <p>
            Reports concern third-party websites that we do not control and do
            not endorse. The Services rely on third-party infrastructure,
            including Cloudflare and Google, and may be affected by their
            availability. Your use of any third-party website or service is
            governed by that party's own terms.
          </p>
        </section>

        <section>
          <h2>10. Intellectual property and open source</h2>
          <p>
            The agentmarkup software is open source and released under the MIT
            License. See the <a href="/license/">license page</a>. These Terms
            govern your use of the hosted Services at agentmarkup.dev and are
            separate from, and in addition to, the software license. The MIT
            License applies to the source code; it does not grant any warranty
            for, or transfer any liability relating to, the hosted Services.
          </p>
        </section>

        <section>
          <h2>11. Eligibility and capacity</h2>
          <p>
            You must be at least 18 years of age, or the age of legal majority in
            your jurisdiction if higher, to use the Services. By using the
            Services you represent and warrant that you meet this requirement and
            have the legal capacity to accept these Terms, and, if you use the
            Services on behalf of an organization, that you are authorized to bind
            that organization to these Terms.
          </p>
        </section>

        <section>
          <h2>12. Privacy</h2>
          <p>
            Our handling of data is described in the{' '}
            <a href="/privacy/">Privacy Policy</a>. The Privacy Policy is a
            notice about how we process data; it is provided for transparency and
            does not, by itself, constitute your consent to any processing.
            Consent, where we rely on it (for example, for analytics cookies), is
            requested and managed separately.
          </p>
        </section>

        <section>
          <h2>13. Changes to the Services and these Terms</h2>
          <p>
            We may modify or discontinue the Services, in whole or in part, at any
            time and without liability. We may update these Terms from time to
            time; the date above shows when they last changed. For material
            changes, we will provide reasonable notice, such as a notice on the
            site, and your continued use of the Services after the change takes
            effect constitutes acceptance of the updated Terms.
          </p>
        </section>

        <section>
          <h2>14. Governing law and disputes</h2>
          <p>
            These Terms are governed by the laws of Romania, without regard to its
            conflict-of-laws rules. For any dispute, the courts of Romania have
            jurisdiction, except that if you are a consumer, you may also bring
            proceedings in, and any mandatory protections and venue rules of, your
            country of residence continue to apply. Nothing in these Terms limits
            any non-waivable statutory rights you may have.
          </p>
        </section>

        <section>
          <h2>15. General</h2>
          <p>
            <strong>Entire agreement.</strong> These Terms, together with the
            Privacy Policy, are the entire agreement between you and us regarding
            the Services and supersede any prior agreements or understandings.
          </p>
          <p>
            <strong>Severability.</strong> If any provision of these Terms is held
            to be invalid or unenforceable, that provision will be limited or
            removed to the minimum extent necessary, and the remaining provisions
            will remain in full force and effect.
          </p>
          <p>
            <strong>No waiver.</strong> Our failure to enforce any provision is
            not a waiver of our right to do so later.
          </p>
          <p>
            <strong>Assignment.</strong> You may not assign these Terms without
            our consent; we may assign them in connection with a transfer of the
            Services.
          </p>
          <p>
            <strong>Survival.</strong> Sections 5 through 8, and any other
            provision that by its nature should survive, survive termination of
            your use of the Services.
          </p>
          <p>
            <strong>Force majeure.</strong> We are not liable for any failure or
            delay caused by events beyond our reasonable control.
          </p>
        </section>

        <section>
          <h2>16. Contact</h2>
          <p>
            The operator is Sebastian Cochinescu (agentmarkup), Romania.
            Questions about these Terms, and legal or abuse notices, can be sent
            to <a href="mailto:hello@cochinescu.com">hello@cochinescu.com</a>.
            Security issues can be reported through{' '}
            <a href="/.well-known/security.txt">security.txt</a>. A postal address
            is available on request.
          </p>
        </section>
      </article>
    </main>
  );
}

export default Terms;
