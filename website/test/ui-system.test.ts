// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { slugHeading } from '../src/ui/toc-model'
import { getOverallVerdict, statusLabels } from '../src/ui/status-model'
import { blogPosts } from '../src/data/editorial'
import { fortune500 } from '../src/data/company-audit'
import { getBlogFooterModel } from '../src/data/blog-footer'
import { homeFaqs } from '../src/data/page-faqs'

type ManifestEntry = { route: string; source: string; heading: string }

const websiteRoot = fileURLToPath(new URL('../', import.meta.url))
const manifest = JSON.parse(readFileSync(`${websiteRoot}/CONTENT_MANIFEST.json`, 'utf8')) as ManifestEntry[]

function htmlPath(route: string) {
  return route === '/' ? `${websiteRoot}/index.html` : `${websiteRoot}/${route.replace(/^\//, '')}index.html`
}

describe('semantic verdict mapping', () => {
  it('uses errors before warnings and never invents a score', () => {
    expect(getOverallVerdict({ error: 1, warning: 8, pass: 12 })).toBe('action')
    expect(getOverallVerdict({ error: 0, warning: 2, pass: 12 })).toBe('attention')
    expect(getOverallVerdict({ error: 0, warning: 0, pass: 12 })).toBe('good')
  })

  it('keeps plain-language labels stable', () => {
    expect(statusLabels.action).toBe('Action required')
    expect(statusLabels.attention).toBe('Needs attention')
    expect(statusLabels.good).toBe('Looks good')
  })
})

describe('TOC slugging', () => {
  it('creates stable ASCII heading ids', () => {
    expect(slugHeading('What is GEO?')).toBe('what-is-geo')
    expect(slugHeading('JSON-LD & AI crawlers')).toBe('json-ld-ai-crawlers')
  })
})

describe('route and content preservation manifest', () => {
  it('covers every one of the 27 public routes exactly once', () => {
    expect(manifest).toHaveLength(27)
    expect(new Set(manifest.map((entry) => entry.route)).size).toBe(27)
  })

  for (const entry of manifest) {
    it(`${entry.route} keeps its authored heading and canonical shell`, () => {
      const source = readFileSync(`${websiteRoot}/${entry.source}`, 'utf8')
      const headingInSource = entry.source.endsWith('AuthorProfile.tsx') ? 'author.name' : entry.heading
      expect(source).toContain(headingInSource)

      const html = readFileSync(htmlPath(entry.route), 'utf8')
      const canonicalPath = entry.route === '/' ? 'https://agentmarkup.dev/' : `https://agentmarkup.dev${entry.route}`
      expect(html).toContain(`rel="canonical" href="${canonicalPath}"`)
      expect(html).toMatch(/<title>[^<]+<\/title>/)
    })
  }
})

describe('editorial learning metadata', () => {
  it('classifies all 14 articles for audience-first navigation', () => {
    expect(blogPosts).toHaveLength(14)
    for (const post of blogPosts) {
      expect(['plain-language', 'technical', 'research']).toContain(post.audience)
      expect(['discoverability', 'structured-data', 'crawler-access', 'implementation', 'business']).toContain(post.topic)
      expect(['beginner', 'intermediate', 'advanced']).toContain(post.level)
    }
  })

  it('keeps the learning hub self-canonical with its required entry and schema source', () => {
    const html = readFileSync(`${websiteRoot}/learn/index.html`, 'utf8')
    const config = readFileSync(`${websiteRoot}/vite.config.ts`, 'utf8')
    expect(html).toContain('<link rel="canonical" href="https://agentmarkup.dev/learn/" />')
    expect(html).toContain('/src/entries/learn.tsx')
    expect(config).toContain("path: '/learn/'")
    expect(config).toContain("'@type': 'CollectionPage'")
  })
})

describe('homepage FAQ', () => {
  it('keeps the homepage checker and technical coverage crawlable', () => {
    const source = readFileSync(`${websiteRoot}/src/App.tsx`, 'utf8')

    expect(source).toContain('<form className="hero-checker-form" action="/checker/" method="get"')
    expect(source).toContain('normalizeWebsiteInput(checkerUrl)')
    expect(source).toContain('<section className="technical-coverage" aria-labelledby="technical-coverage-title">')
    expect(source.match(/<article><h3>/g)).toHaveLength(6)
    expect(source).toContain('/docs/llms-txt/')
    expect(source).toContain('/docs/json-ld/')
    expect(source).toContain('/docs/ai-crawlers/')
    expect(source).toContain('/docs/audit/')
  })

  it('keeps every answer inline and crawlable without a modal', () => {
    const source = readFileSync(`${websiteRoot}/src/App.tsx`, 'utf8')
    const config = readFileSync(`${websiteRoot}/vite.config.ts`, 'utf8')

    expect(source).toContain('<section className="faq-home" aria-labelledby="faq-title">')
    expect(source).toContain('<div className="faq faq-common">')
    expect(source).toContain('homeFaqs.map((item) => (')
    expect(homeFaqs).toHaveLength(10)
    expect(new Set(homeFaqs.map((item) => item.question)).size).toBe(10)
    expect(homeFaqs.every((item) => item.question.length > 0 && item.answer.length > 0)).toBe(true)
    expect(config).toContain("{ preset: 'faqPage' as const, url: `${siteUrl}/`, questions: homeFaqs }")
    expect(source).not.toContain('faqDialogRef')
    expect(source).not.toContain('<dialog')
    expect(source).not.toContain('Read the FAQ')
  })
})

describe('article footer navigation', () => {
  it('keeps chronological navigation correct at both ends and in the middle', () => {
    const first = getBlogFooterModel(blogPosts[0].slug)
    const middle = getBlogFooterModel(blogPosts[6].slug)
    const last = getBlogFooterModel(blogPosts.at(-1)!.slug)

    expect(first.previousPost).toBeUndefined()
    expect(first.nextPost?.slug).toBe(blogPosts[1].slug)
    expect(middle.previousPost?.slug).toBe(blogPosts[5].slug)
    expect(middle.nextPost?.slug).toBe(blogPosts[7].slug)
    expect(last.previousPost?.slug).toBe(blogPosts.at(-2)!.slug)
    expect(last.nextPost).toBeUndefined()
  })

  it('shows three unique recommendations that do not repeat adjacent or primary reading', () => {
    for (const post of blogPosts) {
      const model = getBlogFooterModel(post.slug)
      const orientationSlug = model.orientation.href.match(/^\/blog\/([^/]+)\/$/)?.[1]
      const excluded = new Set([post.slug, model.previousPost?.slug, model.nextPost?.slug, orientationSlug])
      const recommendationSlugs = model.recommendedPosts.map((recommended) => recommended.slug)

      expect(recommendationSlugs).toHaveLength(3)
      expect(new Set(recommendationSlugs).size).toBe(3)
      expect(recommendationSlugs.some((slug) => excluded.has(slug))).toBe(false)
      if (orientationSlug) {
        expect([model.previousPost?.slug, model.nextPost?.slug]).not.toContain(orientationSlug)
      }
    }
  })

  it('keeps the outro landmarks and crawlable links explicit', () => {
    const source = readFileSync(`${websiteRoot}/src/BlogFooter.tsx`, 'utf8')

    expect(source).toContain('<aside className="article-orientation" aria-label="Recommended next reading">')
    expect(source).toContain('<nav className="article-pagination" aria-label="Article order">')
    expect(source).toContain('← Previous article')
    expect(source).toContain('Next article →')
    expect(source).toContain('<a href="/blog/">View all articles →</a>')
    expect(source).not.toContain('Browse all other articles')
  })
})

describe('Fortune 500 audit data', () => {
  it('keeps all three matrices on the production 28-column geometry', () => {
    const report = readFileSync(`${websiteRoot}/src/pages/BlogPost14.tsx`, 'utf8')
    const styles = readFileSync(`${websiteRoot}/src/styles/pages.css`, 'utf8')

    expect(report).toContain('const GRID_COLUMNS = 28')
    expect(styles).toContain('grid-template-columns: repeat(28, 2.75rem)')
    expect(styles).toContain('grid-template-columns: repeat(28, var(--f500-cell))')
  })

  it('keeps the methodology list on the shared article body scale', () => {
    const styles = readFileSync(`${websiteRoot}/src/styles/pages.css`, 'utf8')

    expect(styles).toContain('.f500-hint { color: var(--text-tertiary); font-size: 0.82rem; }')
    expect(styles).toContain('.f500-method { color: var(--text-tertiary); font-size: 1rem; line-height: 1.65; }')
    expect(styles).toContain('.f500-report > section > p,\n.f500-report .f500-method li { font-size: 1rem; line-height: 1.65; }')
  })

  it('keeps every published total and percentage consistent with the dataset', () => {
    const count = (predicate: (row: (typeof fortune500)[number]) => boolean) => fortune500.filter(predicate).length

    expect(fortune500).toHaveLength(370)
    expect(new Set(fortune500.map((row) => row.d)).size).toBe(370)
    expect(Math.ceil(fortune500.length / 28)).toBe(14)
    expect(fortune500.length % 28).toBe(6)
    expect(count((row) => row.j === 2)).toBe(201)
    expect(count((row) => row.l === 2)).toBe(50)
    expect(count((row) => row.c === 1)).toBe(3)
    expect(count((row) => row.s === 0)).toBe(7)
    expect(count((row) => row.s === 1)).toBe(17)
    expect(count((row) => row.r === 1)).toBe(7)
    expect(count((row) => row.j === 1)).toBe(6)
    expect(count((row) => row.x === 1)).toBe(6)
    expect(count((row) => row.w === 'e')).toBe(27)
    expect(count((row) => row.w === 'w')).toBe(343)
  })
})

describe('table semantics', () => {
  it('gives every authored data-table row an explicit row header', () => {
    const tableSources = [
      'src/pages/Audit.tsx',
      'src/pages/AiCrawlers.tsx',
      'src/pages/JsonLd.tsx',
      'src/pages/BlogPost4.tsx',
      'src/pages/BlogPost7.tsx',
    ]

    for (const sourcePath of tableSources) {
      const source = readFileSync(`${websiteRoot}/${sourcePath}`, 'utf8')
      expect(source).not.toMatch(/<tr><td>/)
      expect(source).toContain('scope="row"')
    }
  })
})

describe('sitewide React Bits visual system', () => {
  it('keeps the glass surface on the one shared navigation shell', () => {
    const layout = readFileSync(`${websiteRoot}/src/Layout.tsx`, 'utf8')
    expect(layout).toContain("import { GlassSurface } from './ui/GlassSurface'")
    expect(layout).toContain('<GlassSurface className="site-header-glass"')
    expect(layout).toContain('<nav className="site-nav" aria-label="Main navigation">')
  })

  it('limits the secondary WebGL atmosphere to the Learning Center', () => {
    const learn = readFileSync(`${websiteRoot}/src/pages/Learn.tsx`, 'utf8')
    const layout = readFileSync(`${websiteRoot}/src/Layout.tsx`, 'utf8')
    expect(learn).toContain('<WebThreads className="learn-hero-threads" />')
    expect(layout).not.toContain('<WebThreads')
  })

  it('keeps the cobalt action ramp token-driven and removes the violet specular treatment', () => {
    const foundations = readFileSync(`${websiteRoot}/src/styles/foundations.css`, 'utf8')
    const components = readFileSync(`${websiteRoot}/src/styles/components.css`, 'utf8')
    const pages = readFileSync(`${websiteRoot}/src/styles/pages.css`, 'utf8')
    const threads = readFileSync(`${websiteRoot}/src/ui/WebThreads.tsx`, 'utf8')
    const layout = readFileSync(`${websiteRoot}/src/Layout.tsx`, 'utf8')

    expect(components).toContain('React Bits Border Glow')
    expect(foundations).toContain('--action-fill-start: #315fde')
    expect(foundations).toContain('--action-fill-start: #1d4ed8')
    expect(foundations).toContain('--action-rim: #8fb0ff')
    expect(foundations).toContain('--action-shadow: rgba(0, 0, 0, 0.28)')
    expect(foundations).toContain('--action-shadow: rgba(15, 23, 42, 0.18)')
    expect(foundations).toContain('--reading-shield: rgba(2, 2, 2, 0.92)')
    expect(foundations).toContain('--reading-shield: rgba(247, 248, 252, 0.94)')
    expect(foundations).toContain('var(--reading-shield) var(--page-gutter)')
    expect(pages).toContain('@media print')
    expect(pages).toContain('--text-primary: #111827')
    expect(pages).toContain('--reading-shield: #ffffff')
    expect(components).toContain('linear-gradient(135deg, var(--action-fill-start), var(--action-fill-end))')
    expect(layout).not.toContain('SpecularButtons')
    expect(components).toContain('@media (pointer: coarse)')
    expect(components).toContain('@media (prefers-reduced-motion: reduce)')
    expect(threads).toContain("window.matchMedia('(max-width: 47.99rem), (pointer: coarse)')")
    expect(threads).toContain('vec3(1.0) * sum')

    const paletteSources = [foundations, components, pages, threads, layout].join('\n')
    for (const retiredColor of [
      '#e2daff',
      'rgba(142, 119, 255',
      'rgba(87, 60, 190',
      'rgba(165, 145, 255',
      'rgba(102, 71, 213',
      'rgba(125, 96, 255',
      'rgba(128, 95, 255',
      'rgba(129, 94, 255',
      'rgba(100, 72, 196',
      'rgba(59, 42, 126',
      'rgba(118, 91, 224',
      'rgba(122, 98, 190',
      'rgba(150, 129, 218',
      'rgba(207, 116, 183',
      'rgba(196, 143, 183',
      'vec3(0.32, 0.15, 1.0)',
      'vec3(1.0, 0.32, 0.86)',
      'vec3(1.0, 0.96, 1.0)',
    ]) {
      expect(paletteSources).not.toContain(retiredColor)
    }
  })
})
