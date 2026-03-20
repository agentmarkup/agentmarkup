import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { agentmarkup } from '@agentmarkup/vite'

export default defineConfig({
  plugins: [
    react(),
    agentmarkup({
      site: 'https://agentmarkup.dev',
      name: 'agentmarkup',
      description: 'Make your markup agent-ready. Build-time llms.txt, JSON-LD, AI crawler controls, and validation for modern websites.',

      llmsTxt: {
        instructions: 'agentmarkup is an open-source Vite plugin that makes websites machine-readable for LLMs and AI agents. It generates llms.txt, injects JSON-LD structured data, manages AI crawler robots.txt directives, and validates everything at build time.',
        sections: [
          {
            title: 'Documentation',
            entries: [
              { title: 'GitHub Repository', url: 'https://github.com/agentmarkup/agentmarkup', description: 'Source code, issues, and contributing guide' },
              { title: 'npm Package', url: 'https://www.npmjs.com/package/@agentmarkup/vite', description: 'Install with npm install @agentmarkup/vite' },
            ],
          },
          {
            title: 'Features',
            entries: [
              { title: 'llms.txt Generation', url: '/llms.txt', description: 'Auto-generates /llms.txt at build time following the llmstxt.org spec' },
              { title: 'JSON-LD Injection', url: '/', description: 'Injects structured data into HTML with XSS-safe serialization and type-safe presets' },
              { title: 'AI Crawler Management', url: '/robots.txt', description: 'Generates or patches robots.txt with directives for GPTBot, ClaudeBot, and others' },
              { title: 'Build-Time Validation', url: '/', description: 'Catches missing JSON-LD fields, crawler conflicts, and malformed llms.txt during build' },
            ],
          },
        ],
      },

      globalSchemas: [
        {
          preset: 'webSite',
          name: 'agentmarkup',
          url: 'https://agentmarkup.dev',
          description: 'Build-time llms.txt, JSON-LD, and AI crawler controls for websites',
        },
        {
          preset: 'organization',
          name: 'agentmarkup',
          url: 'https://agentmarkup.dev',
          logo: 'https://agentmarkup.dev/favicon.svg',
          description: 'Open-source tooling for machine-readable websites and agent-friendly markup.',
          sameAs: [
            'https://github.com/agentmarkup/agentmarkup',
            'https://www.npmjs.com/package/@agentmarkup/vite',
          ],
        },
      ],

      pages: [
        {
          path: '/',
          schemas: [
            {
              '@type': 'SoftwareApplication',
              name: 'agentmarkup',
              applicationCategory: 'DeveloperApplication',
              operatingSystem: 'Any',
              url: 'https://agentmarkup.dev',
              description: 'Build-time llms.txt, JSON-LD, AI crawler controls, and validation for Vite websites.',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
              },
            },
          ],
        },
      ],

      aiCrawlers: {
        GPTBot: 'allow',
        ClaudeBot: 'allow',
        PerplexityBot: 'allow',
        'Google-Extended': 'allow',
        CCBot: 'allow',
      },

      validation: {
        warnOnMissingSchema: true,
      },
    }),
  ],
})
