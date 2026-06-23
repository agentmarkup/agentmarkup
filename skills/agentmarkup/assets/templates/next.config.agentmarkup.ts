import type { NextConfig } from 'next';
import { withAgentmarkup } from '@agentmarkup/next';

const nextConfig: NextConfig = {
  // Keep existing Next.js settings here.
  // Static export gets the full file-emission flow. Remove this if the app uses a server deployment.
  output: 'export',
};

export default withAgentmarkup(
  {
    site: 'https://example.com',
    name: 'Example',
    description: 'Machine-readable metadata for this Next.js site.',
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
  },
  nextConfig
);
