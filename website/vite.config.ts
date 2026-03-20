import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { agentmarkup } from '@agentmarkup/vite'

import { websitePrerender } from './prerender-plugin'
import { author, blogPosts } from './src/data/editorial'

const siteUrl = 'https://agentmarkup.dev'
const authorSchema = {
  name: author.name,
  url: `${siteUrl}${author.profilePath}`,
}

const articlePages = blogPosts.map((post) => ({
  path: `/blog/${post.slug}/`,
  schemas: [
    {
      preset: 'article' as const,
      headline: post.title,
      url: `${siteUrl}/blog/${post.slug}/`,
      datePublished: post.date,
      dateModified: post.date,
      author: authorSchema,
      description: post.description,
      image: `${siteUrl}/og-image.png`,
    },
  ],
}))

const informationalPages = [
  {
    path: '/docs/llms-txt/',
    schemas: [
      {
        '@type': 'WebPage',
        name: 'How to generate llms.txt for your website',
        url: `${siteUrl}/docs/llms-txt/`,
        description: 'Learn how to auto-generate a spec-compliant llms.txt file at build time using agentmarkup with Vite or Astro.',
      },
    ],
  },
  {
    path: '/docs/json-ld/',
    schemas: [
      {
        '@type': 'WebPage',
        name: 'How to add JSON-LD structured data to your website',
        url: `${siteUrl}/docs/json-ld/`,
        description: 'Learn how to inject schema.org JSON-LD structured data at build time using agentmarkup for Vite or Astro.',
      },
    ],
  },
  {
    path: '/docs/ai-crawlers/',
    schemas: [
      {
        '@type': 'WebPage',
        name: 'How to manage AI crawlers in your robots.txt',
        url: `${siteUrl}/docs/ai-crawlers/`,
        description: 'Allow or block AI crawlers like GPTBot, ClaudeBot, and PerplexityBot in robots.txt without breaking existing rules.',
      },
    ],
  },
  {
    path: '/blog/',
    schemas: [
      {
        '@type': 'CollectionPage',
        name: 'agentmarkup blog',
        url: `${siteUrl}/blog/`,
        description: 'Technical writing about machine-readable websites, AI discoverability, and structured data.',
      },
    ],
  },
  {
    path: author.profilePath,
    schemas: [
      {
        '@type': 'ProfilePage',
        name: author.name,
        url: `${siteUrl}${author.profilePath}`,
        description: author.bio,
        mainEntity: {
          '@type': 'Person',
          name: author.name,
          url: `${siteUrl}${author.profilePath}`,
          sameAs: [author.externalUrl, 'https://github.com/nichochar'],
        },
      },
    ],
  },
  {
    path: '/license/',
    schemas: [
      {
        '@type': 'WebPage',
        name: 'MIT License - agentmarkup',
        url: `${siteUrl}/license/`,
        description: 'agentmarkup is released under the MIT License. Free to use, modify, and distribute.',
      },
    ],
  },
]

export default defineConfig({
  resolve: {
    alias: {
      '@agentmarkup/core': resolve(__dirname, '../packages/core/dist/index.js'),
      '@agentmarkup/vite': resolve(__dirname, '../packages/vite/dist/index.js'),
    },
  },
  build: {
    modulePreload: false,
    rollupOptions: {
      preserveEntrySignatures: 'exports-only',
      input: {
        main: resolve(__dirname, 'index.html'),
        checker: resolve(__dirname, 'checker/index.html'),
        'docs-llms-txt': resolve(__dirname, 'docs/llms-txt/index.html'),
        'docs-json-ld': resolve(__dirname, 'docs/json-ld/index.html'),
        'docs-ai-crawlers': resolve(__dirname, 'docs/ai-crawlers/index.html'),
        'blog-index': resolve(__dirname, 'blog/index.html'),
        'blog-when-markdown-mirrors-help': resolve(__dirname, 'blog/when-markdown-mirrors-help/index.html'),
        'blog-why-llms-txt': resolve(__dirname, 'blog/why-llms-txt-matters/index.html'),
        'blog-what-is-geo': resolve(__dirname, 'blog/what-is-geo/index.html'),
        'blog-json-ld-guide': resolve(__dirname, 'blog/json-ld-structured-data-guide/index.html'),
        'blog-ai-crawlers-2026': resolve(__dirname, 'blog/ai-crawlers-2026/index.html'),
        'blog-ecommerce': resolve(__dirname, 'blog/ecommerce-llm-optimization/index.html'),
        'blog-brand-awareness': resolve(__dirname, 'blog/brand-awareness-ai/index.html'),
        'blog-markdown-mirrors': resolve(__dirname, 'blog/markdown-mirrors/index.html'),
        'blog-website-checker': resolve(__dirname, 'blog/website-checker/index.html'),
        'author': resolve(__dirname, 'authors/sebastian-cochinescu/index.html'),
        'license': resolve(__dirname, 'license/index.html'),
        'prerender-main': resolve(__dirname, 'src/main.tsx'),
        'prerender-checker': resolve(__dirname, 'src/entries/checker.tsx'),
        'prerender-docs-llms-txt': resolve(__dirname, 'src/entries/llms-txt.tsx'),
        'prerender-docs-json-ld': resolve(__dirname, 'src/entries/json-ld.tsx'),
        'prerender-docs-ai-crawlers': resolve(__dirname, 'src/entries/ai-crawlers.tsx'),
        'prerender-blog-index': resolve(__dirname, 'src/entries/blog-index.tsx'),
        'prerender-blog-when-markdown-mirrors-help': resolve(__dirname, 'src/entries/blog-post-9.tsx'),
        'prerender-blog-why-llms-txt': resolve(__dirname, 'src/entries/blog-post-1.tsx'),
        'prerender-blog-what-is-geo': resolve(__dirname, 'src/entries/blog-post-2.tsx'),
        'prerender-blog-json-ld-guide': resolve(__dirname, 'src/entries/blog-post-3.tsx'),
        'prerender-blog-ai-crawlers-2026': resolve(__dirname, 'src/entries/blog-post-4.tsx'),
        'prerender-blog-ecommerce': resolve(__dirname, 'src/entries/blog-post-5.tsx'),
        'prerender-blog-brand-awareness': resolve(__dirname, 'src/entries/blog-post-6.tsx'),
        'prerender-blog-markdown-mirrors': resolve(__dirname, 'src/entries/blog-post-7.tsx'),
        'prerender-blog-website-checker': resolve(__dirname, 'src/entries/blog-post-8.tsx'),
        'prerender-author': resolve(__dirname, 'src/entries/author.tsx'),
        'prerender-license': resolve(__dirname, 'src/entries/license.tsx'),
      },
    },
  },
  plugins: [
    react(),
    agentmarkup({
      site: siteUrl,
      name: 'agentmarkup',
      description: 'Make your markup agent-ready. Build-time llms.txt, optional llms-full.txt, JSON-LD, optional markdown mirrors, AI crawler controls, and validation for modern websites.',

      llmsTxt: {
        instructions: 'agentmarkup is an open-source package family for Vite and Astro that makes websites machine-readable for LLMs and AI agents. It generates llms.txt, optional llms-full.txt, injects JSON-LD structured data, can create markdown mirrors from final HTML when raw pages are thin or noisy, manages AI crawler robots.txt directives, and validates everything at build time.',
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
              { title: 'Website checker', url: '/checker/', description: 'Check any public site for llms.txt, JSON-LD, robots.txt, sitemap discovery, markdown mirrors, and machine-readable basics' },
              { title: 'How to generate llms.txt', url: '/docs/llms-txt/', description: 'Generate a spec-compliant llms.txt file at build time for AI model discovery' },
              { title: 'How to add JSON-LD structured data', url: '/docs/json-ld/', description: 'Inject schema.org JSON-LD with type-safe presets and XSS-safe serialization' },
              { title: 'How to manage AI crawlers', url: '/docs/ai-crawlers/', description: 'Allow or block AI crawlers like GPTBot and ClaudeBot via robots.txt' },
            ],
          },
          {
            title: 'Blog',
            entries: [
              { title: 'When markdown mirrors help', url: '/blog/when-markdown-mirrors-help/', description: 'Practical guide to when generated markdown mirrors help and when HTML is already enough' },
              { title: 'Why llms.txt matters', url: '/blog/why-llms-txt-matters/', description: 'How llms.txt makes your website discoverable by AI systems like ChatGPT and Perplexity' },
              { title: 'What is GEO?', url: '/blog/what-is-geo/', description: 'Generative Engine Optimization explained for developers - what is real and what is hype' },
              { title: 'JSON-LD structured data guide', url: '/blog/json-ld-structured-data-guide/', description: 'Complete guide to JSON-LD for web developers - schema types, common mistakes, and validation' },
              { title: 'AI crawlers in 2026', url: '/blog/ai-crawlers-2026/', description: 'Every AI crawler indexing your website - GPTBot, ClaudeBot, PerplexityBot, and more' },
              { title: 'E-commerce LLM optimization', url: '/blog/ecommerce-llm-optimization/', description: 'How Product schema and llms.txt make your store visible in AI product recommendations' },
              { title: 'Brand awareness in AI', url: '/blog/brand-awareness-ai/', description: 'How to make your brand appear in ChatGPT, Claude, and Perplexity conversations' },
              { title: 'Markdown mirrors', url: '/blog/markdown-mirrors/', description: 'Build-time markdown generation for AI - comparison with Cloudflare readability extraction' },
              { title: 'Website checker', url: '/blog/website-checker/', description: 'Free tool to audit your website for AI discoverability - llms.txt, JSON-LD, robots.txt, and more' },
            ],
          },
          {
            title: 'Features',
            entries: [
              { title: 'llms.txt Generation', url: '/llms.txt', description: 'Auto-generates /llms.txt at build time following the llmstxt.org spec' },
              { title: 'JSON-LD Injection', url: '/docs/json-ld/', description: 'Injects structured data into HTML with XSS-safe serialization and type-safe presets' },
              { title: 'AI Crawler Management', url: '/robots.txt', description: 'Generates or patches robots.txt with directives for GPTBot, ClaudeBot, and others' },
              { title: 'Build-Time Validation', url: '/checker/', description: 'Catches missing JSON-LD fields, crawler conflicts, malformed llms.txt, and thin HTML during build' },
            ],
          },
        ],
      },

      llmsFullTxt: {
        enabled: true,
      },

      markdownPages: {
        enabled: true,
      },

      contentSignalHeaders: {
        enabled: true,
      },

      globalSchemas: [
        {
          preset: 'webSite',
          name: 'agentmarkup',
          url: siteUrl,
          description: 'Build-time llms.txt, optional llms-full.txt, JSON-LD, optional markdown mirrors, AI crawler controls, Content-Signal headers, and validation for machine-readable websites.',
        },
        {
          preset: 'organization',
          name: 'agentmarkup',
          url: siteUrl,
          logo: `${siteUrl}/apple-touch-icon.png`,
          description: 'Open-source tooling for machine-readable websites, agent-friendly markup, llms manifests, optional markdown mirrors, and build-time validation.',
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
              url: siteUrl,
              description: 'Build-time llms.txt, optional llms-full.txt, JSON-LD, optional markdown mirrors, AI crawler controls, Content-Signal headers, and validation for Vite and Astro websites.',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
              },
            },
          ],
        },
        {
          path: '/checker/',
          schemas: [
            {
              '@type': 'WebPage',
              name: 'agentmarkup website checker',
              url: `${siteUrl}/checker/`,
              description: 'Check any public website for llms.txt, JSON-LD structured data, markdown mirrors, robots.txt AI crawler rules, sitemap discovery, and thin client-rendered HTML.',
            },
          ],
        },
        ...informationalPages,
        ...articlePages,
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
    websitePrerender(),
  ],
})
