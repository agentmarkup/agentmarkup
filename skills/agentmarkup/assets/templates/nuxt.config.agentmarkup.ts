// Pattern, not a drop-in replacement. Merge into the project's existing nuxt.config.ts.
//
// @agentmarkup/nuxt processes PRERENDERED output (`nuxt generate`, or routes with
// `prerender: true`). It runs after Nitro finishes and writes into `.output/public`.
// Fully dynamic SSR routes never emit build-time HTML and are not patched; use the
// re-exported @agentmarkup/core helpers in app code for those.

export default defineNuxtConfig({
  // Keep existing modules, then add agentmarkup once.
  modules: ['@agentmarkup/nuxt'],

  agentmarkup: {
    site: 'https://example.com',
    name: 'Example',
    description: 'Machine-readable metadata for this site.',
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
  },
});
