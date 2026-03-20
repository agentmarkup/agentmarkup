export const author = {
  name: 'Sebastian Cochinescu',
  role: 'Developer of agentmarkup',
  profilePath: '/authors/sebastian-cochinescu/',
  externalUrl: 'https://www.cochinescu.com',
  bio: 'Builder of developer tools for machine-readable websites. Developer of agentmarkup. Founder of Anima Felix.',
}

export interface BlogPostMeta {
  slug: string
  title: string
  description: string
  date: string
  readingTime: string
}

export const blogPosts: BlogPostMeta[] = [
  {
    slug: 'when-markdown-mirrors-help',
    title: 'When markdown mirrors help, and when they do not',
    description: 'A practical guide to when generated markdown mirrors add signal, when HTML is already enough, and how to avoid unnecessary downsides.',
    date: '2026-03-20',
    readingTime: '7 min read',
  },
  {
    slug: 'website-checker',
    title: 'Is your website ready for AI? Free LLM discoverability checker',
    description: 'Audit your website for llms.txt, JSON-LD, robots.txt, markdown mirrors, and sitemap. Free tool for e-commerce and brand websites.',
    date: '2026-03-20',
    readingTime: '8 min read',
  },
  {
    slug: 'markdown-mirrors',
    title: 'Build-time markdown mirrors for agent readability: Cloudflare comparison',
    description: 'Build-time markdown generation for AI readability, including when it helps and how it compares to Cloudflare runtime extraction.',
    date: '2026-03-20',
    readingTime: '7 min read',
  },
  {
    slug: 'brand-awareness-ai',
    title: 'How to make your brand appear in AI conversations',
    description: 'Organization schema, llms.txt, and FAQ markup make your brand visible in ChatGPT, Claude, and Perplexity answers.',
    date: '2026-03-20',
    readingTime: '7 min read',
  },
  {
    slug: 'ecommerce-llm-optimization',
    title: 'Why LLM-optimized e-commerce websites sell more',
    description: 'Product JSON-LD, llms.txt, and AI crawler access make your store visible in AI product recommendations.',
    date: '2026-03-20',
    readingTime: '8 min read',
  },
  {
    slug: 'ai-crawlers-2026',
    title: 'Every AI crawler indexing your website in 2026',
    description: 'Complete list: GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, and more. What each does and how to control access.',
    date: '2026-03-20',
    readingTime: '8 min read',
  },
  {
    slug: 'json-ld-structured-data-guide',
    title: 'JSON-LD structured data: the complete guide for web developers',
    description: 'Schema types, JSON-LD vs microdata, common mistakes, and build-time validation.',
    date: '2026-03-20',
    readingTime: '10 min read',
  },
  {
    slug: 'what-is-geo',
    title: 'What is GEO? Generative Engine Optimization explained for developers',
    description: 'What is real, what is hype, and what you can do today to make your site citeable by AI.',
    date: '2026-03-20',
    readingTime: '7 min read',
  },
  {
    slug: 'why-llms-txt-matters',
    title: 'Why llms.txt matters: making your website discoverable by AI',
    description: 'LLMs answer questions by synthesizing web content. llms.txt gives them a structured overview of your site.',
    date: '2026-03-20',
    readingTime: '6 min read',
  },
]
