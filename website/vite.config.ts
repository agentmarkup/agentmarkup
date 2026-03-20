import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { agentmarkup } from '@agentmarkup/vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'docs-llms-txt': resolve(__dirname, 'docs/llms-txt/index.html'),
        'docs-json-ld': resolve(__dirname, 'docs/json-ld/index.html'),
        'docs-ai-crawlers': resolve(__dirname, 'docs/ai-crawlers/index.html'),
        'blog-index': resolve(__dirname, 'blog/index.html'),
        'blog-why-llms-txt': resolve(__dirname, 'blog/why-llms-txt-matters/index.html'),
        'blog-what-is-geo': resolve(__dirname, 'blog/what-is-geo/index.html'),
        'blog-json-ld-guide': resolve(__dirname, 'blog/json-ld-structured-data-guide/index.html'),
        'blog-ai-crawlers-2026': resolve(__dirname, 'blog/ai-crawlers-2026/index.html'),
        'blog-ecommerce': resolve(__dirname, 'blog/ecommerce-llm-optimization/index.html'),
        'blog-brand-awareness': resolve(__dirname, 'blog/brand-awareness-ai/index.html'),
        'author': resolve(__dirname, 'authors/sebastian-cochinescu/index.html'),
        'license': resolve(__dirname, 'license/index.html'),
      },
    },
  },
  plugins: [
    react(),
    agentmarkup({
      site: 'https://agentmarkup.dev',
      name: 'agentmarkup',
      description: 'Make your markup agent-ready. Build-time llms.txt, JSON-LD, AI crawler controls, and validation for modern websites.',

      llmsTxt: {
        instructions: 'agentmarkup is an open-source package family for Vite and Astro that makes websites machine-readable for LLMs and AI agents. It generates llms.txt, injects JSON-LD structured data, manages AI crawler robots.txt directives, and validates everything at build time.',
        sections: [
          {
            title: 'Documentation',
            entries: [
              { title: 'GitHub Repository', url: 'https://github.com/agentmarkup/agentmarkup', description: 'Source code, issues, and contributing guide' },
              { title: 'Vite Package', url: 'https://www.npmjs.com/package/@agentmarkup/vite', description: 'Install with pnpm add -D @agentmarkup/vite' },
              { title: 'Astro Package', url: 'https://www.npmjs.com/package/@agentmarkup/astro', description: 'Install with pnpm add -D @agentmarkup/astro' },
              { title: 'Core Package', url: 'https://www.npmjs.com/package/@agentmarkup/core', description: 'Reuse generators and validators in custom prerender pipelines' },
            ],
          },
          {
            title: 'Guides',
            entries: [
              { title: 'How to generate llms.txt', url: '/docs/llms-txt/', description: 'Generate a spec-compliant llms.txt file at build time for AI model discovery' },
              { title: 'How to add JSON-LD structured data', url: '/docs/json-ld/', description: 'Inject schema.org JSON-LD with type-safe presets and XSS-safe serialization' },
              { title: 'How to manage AI crawlers', url: '/docs/ai-crawlers/', description: 'Allow or block AI crawlers like GPTBot and ClaudeBot via robots.txt' },
            ],
          },
          {
            title: 'Blog',
            entries: [
              { title: 'Why llms.txt matters', url: '/blog/why-llms-txt-matters/', description: 'How llms.txt makes your website discoverable by AI systems like ChatGPT and Perplexity' },
              { title: 'What is GEO?', url: '/blog/what-is-geo/', description: 'Generative Engine Optimization explained for developers - what is real and what is hype' },
              { title: 'JSON-LD structured data guide', url: '/blog/json-ld-structured-data-guide/', description: 'Complete guide to JSON-LD for web developers - schema types, common mistakes, and validation' },
              { title: 'AI crawlers in 2026', url: '/blog/ai-crawlers-2026/', description: 'Every AI crawler indexing your website - GPTBot, ClaudeBot, PerplexityBot, and more' },
              { title: 'E-commerce LLM optimization', url: '/blog/ecommerce-llm-optimization/', description: 'How Product schema and llms.txt make your store visible in AI product recommendations' },
              { title: 'Brand awareness in AI', url: '/blog/brand-awareness-ai/', description: 'How to make your brand appear in ChatGPT, Claude, and Perplexity conversations' },
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
          logo: 'https://agentmarkup.dev/apple-touch-icon.png',
          description: 'Open-source tooling for machine-readable websites and agent-friendly markup.',
          sameAs: [
            'https://github.com/agentmarkup/agentmarkup',
            'https://www.npmjs.com/package/@agentmarkup/vite',
            'https://www.npmjs.com/package/@agentmarkup/astro',
            'https://www.npmjs.com/package/@agentmarkup/core',
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
              description: 'Build-time llms.txt, JSON-LD, AI crawler controls, and validation for Vite and Astro websites.',
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
