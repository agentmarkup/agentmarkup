export const author = {
  name: 'Sebastian Cochinescu',
  role: 'Developer of agentmarkup',
  profilePath: '/authors/sebastian-cochinescu/',
  externalUrl: 'https://www.cochinescu.com',
  githubUrl: 'https://github.com/cochinescu',
  bio: 'Builder of developer tools for machine-readable websites. Developer of agentmarkup. Founder of Anima Felix.',
}

export interface BlogPostMeta {
  slug: string
  title: string
  description: string
  date: string
  readingTime: string
  audience: EditorialAudience
  topic: EditorialTopic
  level: EditorialLevel
}

export type EditorialAudience = 'plain-language' | 'technical' | 'research'
export type EditorialTopic = 'discoverability' | 'structured-data' | 'crawler-access' | 'implementation' | 'business'
export type EditorialLevel = 'beginner' | 'intermediate' | 'advanced'

export const editorialLabels = {
  audience: {
    'plain-language': 'Website owners',
    technical: 'People who build websites',
    research: 'Research',
  },
  topic: {
    discoverability: 'AI discoverability',
    'structured-data': 'Structured information',
    'crawler-access': 'AI access',
    implementation: 'Implementation',
    business: 'Business visibility',
  },
  level: {
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
  },
} as const

export const blogPosts: BlogPostMeta[] = [
  {
    slug: 'agentmarkup-plugin-chatgpt-codex-claude-code',
    title: 'agentmarkup is now a plugin for ChatGPT, Codex and Claude Code',
    description: 'The agentmarkup plugin is now published for ChatGPT and Codex, with a guided workflow for installing, building and validating machine-readable website output.',
    date: '2026-08-23',
    readingTime: '8 min read',
    audience: 'technical',
    topic: 'implementation',
    level: 'beginner',
  },
  {
    slug: 'soft-404-ai-discoverability-tools',
    title: 'agentmarkup.dev served a soft-404. Our own tooling missed it.',
    description: 'A snapshot of two Claude plugin catalogs found 23 entries near AI discoverability, almost all auditing or scoring. agentmarkup instead emits the artifacts at build time and can gate CI.',
    date: '2026-08-23',
    readingTime: '5 min read',
    audience: 'technical',
    topic: 'implementation',
    level: 'intermediate',
  },
  {
    slug: 'ai-crawler-audit-500-companies',
    title: "We ran 500 of America's biggest companies through an AI-crawler audit",
    description: 'We fetched 500 corporate homepages the way ChatGPT, Claude, and Perplexity do. Most serve readable HTML, but 46% have no usable structured data, 86% have no llms.txt, and seven serve crawlers a blank page. Built for Google, not yet for AI agents.',
    date: '2026-07-02',
    readingTime: '4 min read',
    audience: 'research',
    topic: 'crawler-access',
    level: 'intermediate',
  },
  {
    slug: 'audit-ai-crawler-access',
    title: 'See your website the way AI crawlers do',
    description: 'Use @agentmarkup/audit to fetch any live URL as GPTBot, ClaudeBot, PerplexityBot, and other AI crawlers, diff each response against a browser, and catch machine-readability issues in CI.',
    date: '2026-07-02',
    readingTime: '6 min read',
    audience: 'technical',
    topic: 'crawler-access',
    level: 'advanced',
  },
  {
    slug: 'nuxt-llms-txt-json-ld',
    title: 'How to add llms.txt, JSON-LD, and AI crawler controls to Nuxt',
    description: 'Use @agentmarkup/nuxt to generate llms.txt, inject JSON-LD, create markdown mirrors, and manage AI crawler rules from prerendered Nuxt output.',
    date: '2026-06-21',
    readingTime: '7 min read',
    audience: 'technical',
    topic: 'implementation',
    level: 'intermediate',
  },
  {
    slug: 'agentmarkup-cli-any-static-site',
    title: 'Run agentmarkup on any static site with the CLI',
    description: 'Use @agentmarkup/cli to run llms.txt, JSON-LD, markdown mirrors, and AI crawler controls over any built static output, with a CI check command.',
    date: '2026-06-21',
    readingTime: '6 min read',
    audience: 'technical',
    topic: 'implementation',
    level: 'intermediate',
  },
  {
    slug: 'nextjs-llms-txt-json-ld',
    title: 'How to add llms.txt, JSON-LD, and AI crawler controls to Next.js',
    description: 'Use @agentmarkup/next to generate llms.txt, inject JSON-LD, manage AI crawler rules, and understand the dynamic SSR boundary in Next.js.',
    date: '2026-03-23',
    readingTime: '8 min read',
    audience: 'technical',
    topic: 'implementation',
    level: 'intermediate',
  },
  {
    slug: 'when-markdown-mirrors-help',
    title: 'When markdown mirrors help, and when they do not',
    description: 'A practical guide to when generated markdown mirrors add signal, when HTML is already enough, and how to avoid unnecessary downsides.',
    date: '2026-03-20',
    readingTime: '7 min read',
    audience: 'technical',
    topic: 'discoverability',
    level: 'intermediate',
  },
  {
    slug: 'website-checker',
    title: 'Is your website ready for AI? Free LLM discoverability checker',
    description: 'Audit your website for llms.txt, JSON-LD, robots.txt, markdown mirrors, and sitemap. Free tool for e-commerce and brand websites.',
    date: '2026-03-20',
    readingTime: '8 min read',
    audience: 'plain-language',
    topic: 'discoverability',
    level: 'beginner',
  },
  {
    slug: 'markdown-mirrors',
    title: 'Build-time markdown mirrors for agent readability: Cloudflare comparison',
    description: 'Build-time markdown generation for AI readability, including when it helps and how it compares to Cloudflare runtime extraction.',
    date: '2026-03-20',
    readingTime: '7 min read',
    audience: 'technical',
    topic: 'implementation',
    level: 'advanced',
  },
  {
    slug: 'brand-awareness-ai',
    title: 'How to make your brand appear in AI conversations',
    description: 'Organization schema, llms.txt, and FAQ markup make your brand visible in ChatGPT, Claude, and Perplexity answers.',
    date: '2026-03-20',
    readingTime: '7 min read',
    audience: 'plain-language',
    topic: 'business',
    level: 'beginner',
  },
  {
    slug: 'ecommerce-llm-optimization',
    title: 'Why LLM-optimized e-commerce websites sell more',
    description: 'Product JSON-LD, llms.txt, and AI crawler access make your store visible in AI product recommendations.',
    date: '2026-03-20',
    readingTime: '8 min read',
    audience: 'plain-language',
    topic: 'business',
    level: 'beginner',
  },
  {
    slug: 'ai-crawlers-2026',
    title: 'Every AI crawler indexing your website in 2026',
    description: 'Complete list: GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, and more. What each does and how to control access.',
    date: '2026-03-20',
    readingTime: '8 min read',
    audience: 'technical',
    topic: 'crawler-access',
    level: 'intermediate',
  },
  {
    slug: 'json-ld-structured-data-guide',
    title: 'JSON-LD structured data: the complete guide for web developers',
    description: 'Schema types, JSON-LD vs microdata, common mistakes, and build-time validation.',
    date: '2026-03-20',
    readingTime: '10 min read',
    audience: 'technical',
    topic: 'structured-data',
    level: 'intermediate',
  },
  {
    slug: 'what-is-geo',
    title: 'What is GEO? Generative Engine Optimization explained for developers',
    description: 'What is real, what is hype, and what you can do today to make your site citeable by AI.',
    date: '2026-03-20',
    readingTime: '7 min read',
    audience: 'plain-language',
    topic: 'discoverability',
    level: 'beginner',
  },
  {
    slug: 'why-llms-txt-matters',
    title: 'Why llms.txt matters: making your website discoverable by AI',
    description: 'LLMs answer questions by synthesizing web content. llms.txt gives them a structured overview of your site.',
    date: '2026-03-20',
    readingTime: '6 min read',
    audience: 'plain-language',
    topic: 'discoverability',
    level: 'beginner',
  },
]
