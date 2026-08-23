function Contact() {
  return (
    <main>
      <article className="doc-page legal-page">
        <p className="license-kicker">Contact</p>
        <h1>Contact agentmarkup</h1>
        <p className="doc-intro">
          agentmarkup is maintained by Sebastian Cochinescu at Anima Felix.
          There is one maintainer, so every channel below is answered on a
          best-effort basis and there is no support SLA. Pick the channel that
          matches what you need and you will get a faster answer.
        </p>

        <section>
          <h2>Bugs, feature requests and questions about the packages</h2>
          <p>
            Open an issue in the{' '}
            <a
              href="https://github.com/agentmarkup/agentmarkup/issues"
              target="_blank"
              rel="noopener noreferrer"
            >
              agentmarkup GitHub repository
            </a>
            . This is the right channel for anything reproducible, and it is
            the one that gets seen first. Include the package and version, the
            framework and version, and the relevant part of your config.
          </p>
        </section>

        <section>
          <h2>Security reports</h2>
          <p>
            Do not open a public issue for a security vulnerability. Email{' '}
            <a href="mailto:hello@cochinescu.com">hello@cochinescu.com</a> and
            follow the disclosure guidance in the{' '}
            <a
              href="https://github.com/agentmarkup/agentmarkup/blob/main/SECURITY.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              security policy
            </a>
            . This address is monitored for security reports specifically.
          </p>
        </section>

        <section>
          <h2>General and business contact</h2>
          <p>
            For anything that does not belong in a GitHub issue or a security
            report, including partnerships, press, licensing questions and
            production-use questions, email{' '}
            <a href="mailto:hello@animafelix.com">hello@animafelix.com</a>.
          </p>
          <p>
            Postal address, for correspondence that genuinely needs one:
          </p>
          <address className="contact-address">
            Anima Felix
            <br />
            Ion Mihalache 166
            <br />
            Bucharest, Romania
          </address>
          <p>
            Email is faster for anything technical. Post is not monitored daily.
          </p>
        </section>

        <section>
          <h2>The website checker and security scan</h2>
          <p>
            The <a href="/checker/">website checker</a> and the{' '}
            <a href="/security-scan/">security scan</a> run against public URLs
            from this site. If a check reports something you believe is wrong,
            send the exact URL you submitted along with what you expected, and
            it can be traced against the checks that produced it. Requests are rate
            limited per IP; see the <a href="/terms/">Terms of Service</a> for
            authorized-use limits and the <a href="/privacy/">Privacy Policy</a>{' '}
            for what those tools store.
          </p>
        </section>

        <section>
          <h2>What this is not</h2>
          <p>
            There is no phone line, no ticketing portal and no paid support
            tier. agentmarkup is free, MIT-licensed software with no hosted
            service behind it, so there is no account to recover and no billing
            to dispute. If you are looking for how to get started rather than
            how to reach someone, <a href="/support/">Support</a> routes you to
            the documentation first.
          </p>
        </section>
      </article>
    </main>
  )
}

export default Contact
