import CodeBlock from '../CodeBlock'
import { ResultPreview } from './ResultPreview'
import { SpotlightCard } from './SpotlightCard'
import { StatusLabel } from './Status'
import { statusLabels } from './status-model'
import type { SemanticStatus } from './status-model'

const statuses: SemanticStatus[] = ['good', 'attention', 'action', 'info', 'neutral']

export default function DevShowcase() {
  return (
    <main className="showcase-page">
      <header className="showcase-header">
        <p className="section-kicker">Development only</p>
        <h1>AgentMarkup interface primitives</h1>
        <p>This route exercises the shared system before it is composed into product screens.</p>
      </header>

      <section className="showcase-section" aria-labelledby="showcase-statuses">
        <h2 id="showcase-statuses">Semantic status</h2>
        <div className="showcase-row">
          {statuses.map((status) => <StatusLabel status={status} count={status === 'neutral' ? undefined : 3} key={status} />)}
        </div>
      </section>

      <section className="showcase-section" aria-labelledby="showcase-buttons">
        <h2 id="showcase-buttons">Actions and fields</h2>
        <div className="showcase-row">
          <button className="button button-primary" type="button">Primary action</button>
          <button className="button button-secondary" type="button">Secondary action</button>
          <button className="button button-quiet" type="button">Quiet action</button>
          <button className="button button-primary" type="button" disabled>Disabled</button>
        </div>
        <label className="checker-label" htmlFor="showcase-url">Website URL</label>
        <input className="checker-input" id="showcase-url" type="url" defaultValue="https://example.com" />
      </section>

      <section className="showcase-section" aria-labelledby="showcase-surfaces">
        <h2 id="showcase-surfaces">Spotlight surfaces</h2>
        <div className="showcase-grid">
          {(['brand', 'info', 'neutral'] as const).map((tone) => (
            <SpotlightCard tone={tone} key={tone}>
              <h3>{tone[0].toUpperCase() + tone.slice(1)}</h3>
              <p>Pointer depth is decorative. The content stays a normal semantic surface.</p>
            </SpotlightCard>
          ))}
        </div>
      </section>

      <section className="showcase-section" aria-labelledby="showcase-code">
        <h2 id="showcase-code">Code</h2>
        <CodeBlock code={`const verdict = ${JSON.stringify(statusLabels.attention)}\nconsole.log(verdict)`} />
      </section>

      <section className="showcase-section showcase-result" aria-labelledby="showcase-result">
        <h2 id="showcase-result">Plain-language result preview</h2>
        <ResultPreview />
      </section>
    </main>
  )
}
