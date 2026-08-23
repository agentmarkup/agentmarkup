function Support() {
  return (
    <main>
      <article className="doc-page legal-page">
        <p className="license-kicker">Help and contact</p>
        <h1>Support</h1>
        <p className="doc-intro">
          agentmarkup is open source and MIT licensed, maintained by Sebastian
          Cochinescu at Anima Felix. Day-to-day maintenance and support are
          handled by one person, so help is provided on a best-effort basis.
        </p>

        <section>
          <h2>Start with the documentation</h2>
          <p>
            The <a href="/learn/">Learning Center</a> explains the standards and
            machine-readable website features that agentmarkup supports. For
            setup and configuration, see the guides for{' '}
            <a href="/docs/llms-txt/">llms.txt</a>,{' '}
            <a href="/docs/json-ld/">JSON-LD</a>,{' '}
            <a href="/docs/ai-crawlers/">AI crawlers</a> and{' '}
            <a href="/docs/audit/">auditing a live site</a>.
          </p>
        </section>
        <section>
          <h2>Claude Code plugin</h2>
          <p>
            The Claude Code plugin is installable from the{' '}
            <a href="https://github.com/agentmarkup/agentmarkup/tree/main/plugins/agentmarkup" target="_blank" rel="noopener noreferrer">
              repository marketplace
            </a>
            . Its repository page contains the plugin files and installation
            details.
          </p>
        </section>

        <section>
          <h2>Bugs and feature requests</h2>
          <p>
            Open an issue in the{' '}
            <a href="https://github.com/agentmarkup/agentmarkup/issues" target="_blank" rel="noopener noreferrer">
              agentmarkup GitHub repository
            </a>
            . This is the best route for bugs and feature requests, and the one
            that gets seen.
          </p>
        </section>

        <section>
          <h2>Security issues</h2>
          <p>
            Do not open a public issue for a security vulnerability. Email{' '}
            <a href="mailto:hello@cochinescu.com">hello@cochinescu.com</a> and
            follow the reporting guidance in the{' '}
            <a href="https://github.com/agentmarkup/agentmarkup/blob/main/SECURITY.md" target="_blank" rel="noopener noreferrer">
              security policy
            </a>
            .
          </p>
        </section>


        <section>
          <h2>General contact</h2>
          <p>
            For questions that do not belong in GitHub issues or the security
            reporting process, email{' '}
            <a href="mailto:hello@animafelix.com">hello@animafelix.com</a>.
          </p>
        </section>
      </article>
    </main>
  )
}

export default Support
