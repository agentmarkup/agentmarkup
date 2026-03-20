const permissions = [
  'Commercial use',
  'Modification',
  'Distribution',
  'Private use',
]

const conditions = ['Include the copyright notice', 'Include the permission notice']

const limitations = ['No warranty', 'No liability']

const copyrightLine = 'Copyright (c) 2026 Sebastian Cochinescu and Anima Felix'

function License() {
  return (
    <main>
      <article className="doc-page license-page">
        <p className="license-kicker">Open Source License</p>
        <h1>MIT License</h1>
        <p className="doc-intro">
          agentmarkup is released under the MIT License. It is a short,
          permissive license that allows use, modification, and distribution,
          including commercial use, as long as the copyright notice and this
          permission notice stay with the software.
        </p>

        <section className="license-intro-card">
          <div className="license-meta-grid">
            <div className="license-meta-card">
              <p className="license-meta-label">Project</p>
              <p className="license-meta-value">agentmarkup</p>
            </div>
            <div className="license-meta-card">
              <p className="license-meta-label">License</p>
              <p className="license-meta-value">MIT</p>
            </div>
            <div className="license-meta-card">
              <p className="license-meta-label">Copyright</p>
              <p className="license-meta-value">2026</p>
            </div>
          </div>
        </section>

        <section className="license-grid">
          <div className="license-panel">
            <h2>Allowed</h2>
            <div className="license-chip-row">
              {permissions.map((item) => (
                <span key={item} className="license-chip">
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="license-panel">
            <h2>Required</h2>
            <div className="license-chip-row">
              {conditions.map((item) => (
                <span key={item} className="license-chip">
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="license-panel">
            <h2>Not Covered</h2>
            <div className="license-chip-row">
              {limitations.map((item) => (
                <span key={item} className="license-chip">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section>
          <h2>Full Text</h2>
          <div className="license-document">
            <p className="license-document-heading">{copyrightLine}</p>
            <p>
              Permission is hereby granted, free of charge, to any person
              obtaining a copy of this software and associated documentation
              files (the &quot;Software&quot;), to deal in the Software without
              restriction, including without limitation the rights to use, copy,
              modify, merge, publish, distribute, sublicense, and/or sell copies
              of the Software, and to permit persons to whom the Software is
              furnished to do so, subject to the following conditions:
            </p>
            <p>
              The above copyright notice and this permission notice shall be
              included in all copies or substantial portions of the Software.
            </p>
            <p className="license-disclaimer">
              THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF
              ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
              WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
              NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
              HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
              WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
              OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
              DEALINGS IN THE SOFTWARE.
            </p>
          </div>
        </section>
      </article>
    </main>
  )
}

export default License
