import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { agentmarkup } from '@agentmarkup/vite'

import { MARKDOWN_EXCLUDED_PAGES, websitePrerender } from './prerender-plugin'
import { author, blogPosts } from './src/data/editorial'
import { aiCrawlersFaqs, auditFaqs, checkerFaqs, homeFaqs, jsonLdFaqs, llmsTxtFaqs, securityScanFaqs } from './src/data/page-faqs'

const siteUrl = 'https://agentmarkup.dev'
const authorSchema = {
  name: author.name,
  url: `${siteUrl}${author.profilePath}`,
}

// Preset shape: `@type` is added by the organization preset in @agentmarkup/core.
const organizationAddress = {
  streetAddress: 'Ion Mihalache 166',
  addressLocality: 'Bucharest',
  addressCountry: 'RO',
}

const organizationContactPoints = [
  {
    contactType: 'technical support',
    email: 'hello@animafelix.com',
    url: `${siteUrl}/contact/`,
    availableLanguage: ['English'],
  },
  {
    contactType: 'security',
    email: 'hello@cochinescu.com',
    url: `${siteUrl}/contact/`,
    availableLanguage: ['English'],
  },
]

// The /contact/ page uses a hand-written schema, so it needs the explicit types.
const contactPointsJsonLd = organizationContactPoints.map((point) => ({
  '@type': 'ContactPoint',
  ...point,
}))
const addressJsonLd = { '@type': 'PostalAddress', ...organizationAddress }

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
      image:
        post.slug === 'ai-crawler-audit-500-companies'
          ? `${siteUrl}/og-500-companies.png`
          : `${siteUrl}/og-image.png`,
    },
  ],
}))

const informationalPages = [
  {
    path: '/learn/',
    schemas: [
      {
        '@type': 'CollectionPage',
        name: 'Learn how AI sees your website',
        url: `${siteUrl}/learn/`,
        description: 'Plain-language guides to help you see whether AI can find, understand, and access your website, plus clear next steps for improving it.',
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Website checker', url: `${siteUrl}/checker/` },
            { '@type': 'ListItem', position: 2, name: 'llms.txt guide', url: `${siteUrl}/docs/llms-txt/` },
            { '@type': 'ListItem', position: 3, name: 'JSON-LD guide', url: `${siteUrl}/docs/json-ld/` },
            { '@type': 'ListItem', position: 4, name: 'AI crawlers guide', url: `${siteUrl}/docs/ai-crawlers/` },
            { '@type': 'ListItem', position: 5, name: 'Security scan', url: `${siteUrl}/security-scan/` },
          ],
        },
      },
    ],
  },
  {
    path: '/docs/llms-txt/',
    schemas: [
      {
        '@type': 'WebPage',
        name: 'How to generate llms.txt for your website',
        url: `${siteUrl}/docs/llms-txt/`,
        description: 'Learn how to auto-generate a spec-compliant llms.txt file at build time using agentmarkup with Vite, Astro, Next.js, or Nuxt.',
      },
      { preset: 'faqPage' as const, url: `${siteUrl}/docs/llms-txt/`, questions: llmsTxtFaqs },
    ],
  },
  {
    path: '/docs/json-ld/',
    schemas: [
      {
        '@type': 'WebPage',
        name: 'How to add JSON-LD structured data to your website',
        url: `${siteUrl}/docs/json-ld/`,
        description: 'Learn how to inject schema.org JSON-LD structured data at build time using agentmarkup for Vite, Astro, Next.js, or Nuxt.',
      },
      { preset: 'faqPage' as const, url: `${siteUrl}/docs/json-ld/`, questions: jsonLdFaqs },
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
      { preset: 'faqPage' as const, url: `${siteUrl}/docs/ai-crawlers/`, questions: aiCrawlersFaqs },
    ],
  },
  {
    path: '/docs/audit/',
    schemas: [
      {
        '@type': 'WebPage',
        name: 'How to audit your site the way AI crawlers see it',
        url: `${siteUrl}/docs/audit/`,
        description: 'Use @agentmarkup/audit to fetch any live URL as each major AI crawler, diff against a browser, and report machine-readability findings in CI.',
      },
      { preset: 'faqPage' as const, url: `${siteUrl}/docs/audit/`, questions: auditFaqs },
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
          sameAs: [author.externalUrl, author.githubUrl],
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
  {
    path: '/terms/',
    schemas: [
      {
        '@type': 'WebPage',
        name: 'Terms of Service - agentmarkup',
        url: `${siteUrl}/terms/`,
        description: 'Terms of Service for agentmarkup.dev, including authorized-use, no-warranty, and limitation-of-liability terms for the website checker and passive security scan.',
      },
    ],
  },
  {
    path: '/support/',
    schemas: [
      {
        '@type': 'WebPage',
        name: 'Support - agentmarkup',
        url: `${siteUrl}/support/`,
        description: 'Support for agentmarkup: start with the documentation, report bugs and feature requests as GitHub issues, and find the right address for security reports.',
      },
    ],
  },
  {
    path: '/about/',
    schemas: [
      {
        '@type': 'AboutPage',
        name: 'About agentmarkup',
        url: `${siteUrl}/about/`,
        description: 'What agentmarkup is, why it exists, what it deliberately does not do, and who maintains it.',
        mainEntity: {
          '@type': 'Organization',
          name: 'agentmarkup',
          url: siteUrl,
          // authorSchema is the bare { name, url } shape the article preset wraps
          // in a Person; a hand-written schema has to supply the type itself.
          founder: { '@type': 'Person', ...authorSchema },
        },
      },
    ],
  },
  {
    path: '/contact/',
    schemas: [
      {
        '@type': 'ContactPage',
        name: 'Contact agentmarkup',
        url: `${siteUrl}/contact/`,
        description: 'How to reach the agentmarkup maintainer for bugs and feature requests, security reports, and general or business questions.',
        mainEntity: {
          '@type': 'Organization',
          name: 'agentmarkup',
          url: siteUrl,
          contactPoint: contactPointsJsonLd,
          address: addressJsonLd,
        },
      },
    ],
  },
  {
    path: '/privacy/',
    schemas: [
      {
        '@type': 'WebPage',
        name: 'Privacy Policy - agentmarkup',
        url: `${siteUrl}/privacy/`,
        description: 'Privacy Policy for agentmarkup.dev: what data the website checker and passive security scan process, the legal basis, retention, and third-party processors.',
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
        'security-scan': resolve(__dirname, 'security-scan/index.html'),
        'docs-llms-txt': resolve(__dirname, 'docs/llms-txt/index.html'),
        'docs-json-ld': resolve(__dirname, 'docs/json-ld/index.html'),
        'docs-ai-crawlers': resolve(__dirname, 'docs/ai-crawlers/index.html'),
        'docs-audit': resolve(__dirname, 'docs/audit/index.html'),
        learn: resolve(__dirname, 'learn/index.html'),
        'blog-index': resolve(__dirname, 'blog/index.html'),
        'blog-ai-crawler-audit-500-companies': resolve(__dirname, 'blog/ai-crawler-audit-500-companies/index.html'),
        'blog-audit-ai-crawler-access': resolve(__dirname, 'blog/audit-ai-crawler-access/index.html'),
        'blog-nextjs-llms-txt-json-ld': resolve(__dirname, 'blog/nextjs-llms-txt-json-ld/index.html'),
        'blog-nuxt-llms-txt-json-ld': resolve(__dirname, 'blog/nuxt-llms-txt-json-ld/index.html'),
        'blog-agentmarkup-cli-any-static-site': resolve(__dirname, 'blog/agentmarkup-cli-any-static-site/index.html'),
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
        'terms': resolve(__dirname, 'terms/index.html'),
        'support': resolve(__dirname, 'support/index.html'),
        'about': resolve(__dirname, 'about/index.html'),
        'contact': resolve(__dirname, 'contact/index.html'),
        'privacy': resolve(__dirname, 'privacy/index.html'),
        'not-found': resolve(__dirname, '404.html'),
        'prerender-main': resolve(__dirname, 'src/main.tsx'),
        'prerender-checker': resolve(__dirname, 'src/entries/checker.tsx'),
        'prerender-security-scan': resolve(__dirname, 'src/entries/security-scan.tsx'),
        'prerender-docs-llms-txt': resolve(__dirname, 'src/entries/llms-txt.tsx'),
        'prerender-docs-json-ld': resolve(__dirname, 'src/entries/json-ld.tsx'),
        'prerender-docs-ai-crawlers': resolve(__dirname, 'src/entries/ai-crawlers.tsx'),
        'prerender-docs-audit': resolve(__dirname, 'src/entries/audit.tsx'),
        'prerender-learn': resolve(__dirname, 'src/entries/learn.tsx'),
        'prerender-blog-index': resolve(__dirname, 'src/entries/blog-index.tsx'),
        'prerender-blog-ai-crawler-audit-500-companies': resolve(__dirname, 'src/entries/blog-post-14.tsx'),
        'prerender-blog-audit-ai-crawler-access': resolve(__dirname, 'src/entries/blog-post-13.tsx'),
        'prerender-blog-nextjs-llms-txt-json-ld': resolve(__dirname, 'src/entries/blog-post-10.tsx'),
        'prerender-blog-nuxt-llms-txt-json-ld': resolve(__dirname, 'src/entries/blog-post-11.tsx'),
        'prerender-blog-agentmarkup-cli-any-static-site': resolve(__dirname, 'src/entries/blog-post-12.tsx'),
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
        'prerender-terms': resolve(__dirname, 'src/entries/terms.tsx'),
        'prerender-support': resolve(__dirname, 'src/entries/support.tsx'),
        'prerender-about': resolve(__dirname, 'src/entries/about.tsx'),
        'prerender-contact': resolve(__dirname, 'src/entries/contact.tsx'),
        'prerender-privacy': resolve(__dirname, 'src/entries/privacy.tsx'),
        'prerender-not-found': resolve(__dirname, 'src/entries/not-found.tsx'),
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
        instructions: 'agentmarkup is an open-source package family for Vite, Astro, Next.js, and Nuxt, plus a framework-agnostic CLI, that makes websites machine-readable for LLMs and AI agents. It generates llms.txt, optional llms-full.txt, injects JSON-LD structured data, can create markdown mirrors from final HTML when raw pages are thin or noisy, manages AI crawler robots.txt directives, and validates everything at build time.',
        whenToUse: [
          'Someone asks whether a specific public website is readable by AI crawlers and agents. Use the website checker at /checker/, or run `npx @agentmarkup/audit <url>` to fetch that URL as each major AI crawler and diff the result against a browser fetch.',
          'Someone needs llms.txt, llms-full.txt, JSON-LD, markdown mirrors, AI crawler robots.txt rules, or Content-Signal headers generated for their own site. Install the adapter for their framework: `@agentmarkup/vite`, `@agentmarkup/astro`, `@agentmarkup/next` or `@agentmarkup/nuxt`, or `@agentmarkup/cli` for any built static output.',
          'Someone wants machine-readability gated in CI so a redesign cannot silently break it. `agentmarkup check ./dist` from `@agentmarkup/cli` and `npx @agentmarkup/audit <url>` both exit non-zero on error-level findings.',
          'Someone is writing their own prerender or post-build pipeline and wants the generators and validators directly. Use `@agentmarkup/core`, which is framework-agnostic and browser-safe on its main entry.',
          'Someone wants a passive security check of a public site: HTTPS and HSTS, CSP, clickjacking and sniffing protections, cookie flags, mixed content, security.txt, and SPF, DMARC and DNSSEC records. Use the security scan at /security-scan/.',
          'Do not use agentmarkup for a readiness score, a letter grade, or a ranking guarantee. Validation here is deterministic: missing required fields are errors, missing recommended fields are warnings, and no score is produced. Do not point the checker or the scan at a site the user does not own or is not authorized to test.',
        ],
        sections: [
          {
            title: 'Documentation',
            entries: [
              { title: 'About agentmarkup', url: `${siteUrl}/about/`, description: 'What agentmarkup is, why it exists, what it deliberately does not do, and who maintains it' },
              { title: 'Contact', url: `${siteUrl}/contact/`, description: 'Bugs and feature requests via GitHub issues, a dedicated address for security reports, and email for general and business questions' },
              { title: 'Support', url: `${siteUrl}/support/`, description: 'Documentation first, then GitHub issues for bugs and feature requests, and where to send security reports' },
              { title: 'GitHub Repository', url: 'https://github.com/agentmarkup/agentmarkup', description: 'Source code, issues, and contributing guide' },
              { title: 'AgentMarkup Agent Skill', url: 'https://github.com/agentmarkup/agentmarkup/tree/main/skills/agentmarkup', description: 'Public agent skill for installing AgentMarkup, configuring preferences, auditing output, and implementing fixes' },
              { title: 'Vite Package', url: 'https://www.npmjs.com/package/@agentmarkup/vite', description: 'Install with pnpm add -D @agentmarkup/vite' },
              { title: 'Astro Package', url: 'https://www.npmjs.com/package/@agentmarkup/astro', description: 'Install with pnpm add -D @agentmarkup/astro' },
              { title: 'Next.js Package', url: 'https://www.npmjs.com/package/@agentmarkup/next', description: 'Install with pnpm add -D @agentmarkup/next' },
              { title: 'Nuxt Package', url: 'https://www.npmjs.com/package/@agentmarkup/nuxt', description: 'Install with pnpm add -D @agentmarkup/nuxt for prerendered / nuxt generate output' },
              { title: 'CLI Package', url: 'https://www.npmjs.com/package/@agentmarkup/cli', description: 'Install with pnpm add -D @agentmarkup/cli to run agentmarkup over any built static output, or as a CI check' },
              { title: 'Audit Package', url: 'https://www.npmjs.com/package/@agentmarkup/audit', description: 'Run npx @agentmarkup/audit <url> to fetch a live URL as each major AI crawler, diff against a browser, and report machine-readability findings in CI' },
              { title: 'Core Package', url: 'https://www.npmjs.com/package/@agentmarkup/core', description: 'Reuse generators and validators in custom prerender pipelines' },
            ],
          },
          {
            title: 'Guides',
            entries: [
              { title: 'Learning center', url: '/learn/', description: 'Plain-language paths for understanding whether AI can find, understand, and access your website' },
              { title: 'Website checker', url: '/checker/', description: 'Check any public site for llms.txt, JSON-LD, robots.txt, sitemap discovery, markdown mirrors, and machine-readable basics' },
              { title: 'Security scan', url: '/security-scan/', description: 'Passive security scan for public sites: HTTPS/HSTS, CSP, clickjacking and sniffing protections, cookies, mixed content, security.txt, and SPF/DMARC/DNSSEC' },
              { title: 'How to audit AI crawler access', url: '/docs/audit/', description: 'Fetch any live URL as each major AI crawler with @agentmarkup/audit, diff against a browser, and gate machine-readability in CI' },
              { title: 'How to generate llms.txt', url: '/docs/llms-txt/', description: 'Generate a spec-compliant llms.txt file at build time for AI model discovery' },
              { title: 'How to add JSON-LD structured data', url: '/docs/json-ld/', description: 'Inject schema.org JSON-LD with type-safe presets and XSS-safe serialization' },
              { title: 'How to manage AI crawlers', url: '/docs/ai-crawlers/', description: 'Allow or block AI crawlers like GPTBot and ClaudeBot via robots.txt' },
            ],
          },
          {
            title: 'Blog',
            entries: [
              { title: "We audited 500 of America's biggest companies for AI readiness", url: '/blog/ai-crawler-audit-500-companies/', description: 'We ran 500 of the largest US public companies through @agentmarkup/audit: most serve readable HTML, but 46% have no usable structured data, 86% have no llms.txt, and seven serve crawlers a blank page' },
              { title: 'See your site like AI crawlers do', url: '/blog/audit-ai-crawler-access/', description: 'Fetch any live URL as each major AI crawler with @agentmarkup/audit, diff against a browser, and catch machine-readability issues in CI' },
              { title: 'Next.js guide', url: '/blog/nextjs-llms-txt-json-ld/', description: 'How to add llms.txt, JSON-LD, AI crawler controls, and validation to Next.js with @agentmarkup/next' },
              { title: 'Nuxt guide', url: '/blog/nuxt-llms-txt-json-ld/', description: 'How to add llms.txt, JSON-LD, markdown mirrors, and AI crawler controls to Nuxt with @agentmarkup/nuxt' },
              { title: 'CLI for any static site', url: '/blog/agentmarkup-cli-any-static-site/', description: 'Run agentmarkup over any built static output and gate machine-readability in CI with @agentmarkup/cli' },
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
        exclude: MARKDOWN_EXCLUDED_PAGES,
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
          contactPoint: organizationContactPoints,
          address: organizationAddress,
          sameAs: [
            'https://github.com/agentmarkup/agentmarkup',
            'https://www.npmjs.com/package/@agentmarkup/vite',
            'https://www.npmjs.com/package/@agentmarkup/astro',
            'https://www.npmjs.com/package/@agentmarkup/next',
            'https://www.npmjs.com/package/@agentmarkup/nuxt',
            'https://www.npmjs.com/package/@agentmarkup/cli',
            'https://www.npmjs.com/package/@agentmarkup/audit',
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
              description: 'Build-time llms.txt, optional llms-full.txt, JSON-LD, optional markdown mirrors, AI crawler controls, Content-Signal headers, and validation for Vite, Astro, Next.js, and Nuxt websites, plus a framework-agnostic CLI.',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
              },
            },
            { preset: 'faqPage' as const, url: `${siteUrl}/`, questions: homeFaqs },
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
            { preset: 'faqPage' as const, url: `${siteUrl}/checker/`, questions: checkerFaqs },
          ],
        },
        {
          path: '/security-scan/',
          schemas: [
            {
              '@type': 'WebPage',
              name: 'agentmarkup passive security scan',
              url: `${siteUrl}/security-scan/`,
              description: 'Passive security scan for public websites: HTTPS and HSTS, Content-Security-Policy, clickjacking and sniffing protections, cookie flags, mixed content, and security.txt.',
            },
            { preset: 'faqPage' as const, url: `${siteUrl}/security-scan/`, questions: securityScanFaqs },
          ],
        },
        ...informationalPages,
        ...articlePages,
      ],

      aiCrawlers: {
        // Model-training crawlers
        GPTBot: 'allow',
        ClaudeBot: 'allow',
        'Google-Extended': 'allow',
        CCBot: 'allow',
        'Applebot-Extended': 'allow',
        Amazonbot: 'allow',
        // AI search / retrieval crawlers (kept allowed to stay citable in AI answers)
        'OAI-SearchBot': 'allow',
        PerplexityBot: 'allow',
        'Claude-SearchBot': 'allow',
        DuckAssistBot: 'allow',
        // User-triggered / agent fetchers
        'ChatGPT-User': 'allow',
        'Claude-User': 'allow',
        'Perplexity-User': 'allow',
      },

      validation: {
        warnOnMissingSchema: true,
      },
    }),
    websitePrerender(),
  ],
})
