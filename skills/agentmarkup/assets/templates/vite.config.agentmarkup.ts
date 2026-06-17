import { defineConfig } from 'vite';
import { agentmarkup } from '@agentmarkup/vite';

export default defineConfig({
  plugins: [
    // Keep existing framework plugins here, then add agentmarkup once.
    agentmarkup({
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
      markdownPages: {
        enabled: true,
      },
      contentSignalHeaders: {
        enabled: true,
        aiTrain: 'yes',
        search: 'yes',
        aiInput: 'yes',
      },
      globalSchemas: [
        {
          preset: 'webSite',
          name: 'Example',
          url: 'https://example.com',
        },
      ],
      aiCrawlers: {
        GPTBot: 'allow',
        ClaudeBot: 'allow',
        PerplexityBot: 'allow',
        'Google-Extended': 'allow',
      },
      validation: {
        warnOnMissingSchema: true,
      },
    }),
  ],
});
