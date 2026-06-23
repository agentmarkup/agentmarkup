import { defineConfig } from 'astro/config';
import { agentmarkup } from '@agentmarkup/astro';

export default defineConfig({
  integrations: [
    // Keep existing integrations here, then add agentmarkup once.
    agentmarkup({
      site: 'https://example.com',
      name: 'Example',
      description: 'Machine-readable metadata for this Astro site.',
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
    }),
  ],
});
