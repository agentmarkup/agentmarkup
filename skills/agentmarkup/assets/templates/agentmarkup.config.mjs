// Pattern, not a drop-in replacement. Place at the project root as agentmarkup.config.mjs.
//
// Used by @agentmarkup/cli, which runs over any already-built static directory:
//   agentmarkup generate ./dist     write llms.txt, mirrors, JSON-LD, robots.txt, _headers
//   agentmarkup check    ./dist     validate what is on disk; CI gate, never writes
//   agentmarkup generate ./dist --dry-run
//
// Run it AFTER the site's own build. Output directory resolution is:
// explicit argument -> `outDir` below -> dist / build / out / _site.
// `public/` is never auto-guessed; pass it explicitly if that is really the build output.

export default {
  site: 'https://example.com',
  name: 'Example',
  description: 'Machine-readable metadata for this site.',

  // Optional. Omit it and pass the directory as an argument instead.
  outDir: 'dist',

  llmsTxt: {
    sections: [
      {
        title: 'Pages',
        entries: [
          {
            title: 'Home',
            url: '/',
            description: 'Homepage and primary site overview.',
          },
        ],
      },
    ],
  },
  // Enable when the built HTML is thin, noisy, or client-rendered. Optional when it is already substantial.
  markdownPages: {
    enabled: true,
  },
  // Enable Content-Signal only after the user chooses this policy.
  // contentSignalHeaders: {
  //   enabled: true,
  //   aiTrain: 'yes',
  //   search: 'yes',
  //   aiInput: 'yes',
  // },
  globalSchemas: [
    {
      preset: 'webSite',
      name: 'Example',
      url: 'https://example.com',
    },
  ],
  // Add crawler directives only after the user chooses allow/disallow policy.
  // aiCrawlers: {
  //   GPTBot: 'allow',
  //   ClaudeBot: 'allow',
  //   PerplexityBot: 'allow',
  //   'Google-Extended': 'allow',
  // },
  validation: {
    warnOnMissingSchema: true,
  },
};
