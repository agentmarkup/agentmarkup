function App() {
  return (
    <main style={{ fontFamily: 'sans-serif', margin: '3rem auto', maxWidth: 720 }}>
      <h1>agentmarkup Example</h1>
      <p>
        This is a minimal Vite React app that exercises <code>@agentmarkup/vite</code>
        {' '}inside the workspace.
      </p>
      <ul>
        <li>Build to generate <code>llms.txt</code>.</li>
        <li>Check the output HTML for injected JSON-LD.</li>
        <li>Inspect <code>robots.txt</code> for AI crawler directives.</li>
      </ul>
    </main>
  )
}

export default App
