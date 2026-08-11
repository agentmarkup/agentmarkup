import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Window } from 'happy-dom'

const websiteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distRoot = resolve(websiteRoot, 'dist')
const manifestPath = resolve(websiteRoot, 'CONTENT_MANIFEST.json')
const baselinePath = resolve(websiteRoot, 'SEO_STRUCTURE_BASELINE.json')
const siteUrl = 'https://agentmarkup.dev'

function outputPath(route) {
  return route === '/'
    ? resolve(distRoot, 'index.html')
    : resolve(distRoot, route.replace(/^\//, ''), 'index.html')
}

function normalizeText(value) {
  return value.replace(/\s+/g, ' ').trim()
}

function schemaTypes(value, types = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => schemaTypes(item, types))
    return types
  }
  if (!value || typeof value !== 'object') return types
  const type = value['@type']
  if (Array.isArray(type)) types.push(...type.filter((item) => typeof item === 'string'))
  else if (typeof type === 'string') types.push(type)
  Object.values(value).forEach((item) => schemaTypes(item, types))
  return types
}

function inspectRoute(route) {
  const file = outputPath(route)
  if (!existsSync(file)) throw new Error(`${route}: missing ${file}`)

  const html = readFileSync(file, 'utf8')
  const window = new Window({ url: `${siteUrl}${route}` })
  window.document.write(html)
  const { document } = window
  const page = document.querySelector('#page-content')
  const root = document.querySelector('#root')
  if (!page || !root) throw new Error(`${route}: missing page shell or root`)

  const schemas = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).flatMap((script) => {
    try {
      return schemaTypes(JSON.parse(script.textContent || ''))
    } catch {
      throw new Error(`${route}: invalid JSON-LD`)
    }
  })

  const internalLinks = Array.from(page.querySelectorAll('a[href]'))
    .map((link) => link.getAttribute('href') || '')
    .filter((href) => href.startsWith('/') && !href.startsWith('//'))

  return {
    route,
    title: normalizeText(document.title),
    description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
    robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') || '',
    h1: Array.from(page.querySelectorAll('h1')).map((heading) => normalizeText(heading.textContent || '')),
    h2: Array.from(page.querySelectorAll('h2')).map((heading) => normalizeText(heading.textContent || '')),
    sectionIds: Array.from(page.querySelectorAll('section[id]')).map((section) => section.id),
    schemaTypes: Array.from(new Set(schemas)).sort(),
    internalLinks: Array.from(new Set(internalLinks)).sort(),
    prerendered: normalizeText(root.textContent || '').length > 0,
    rawH1Count: (html.match(/<h1(?:\s|>)/gi) || []).length,
  }
}

function routeExists(href) {
  const path = href.split(/[?#]/, 1)[0]
  if (!path || path === '/') return existsSync(resolve(distRoot, 'index.html'))
  if (path.endsWith('/')) return existsSync(resolve(distRoot, path.replace(/^\//, ''), 'index.html'))
  return existsSync(resolve(distRoot, path.replace(/^\//, '')))
}

function mainParagraphs(route) {
  const window = new Window({ url: `${siteUrl}${route}` })
  window.document.write(readFileSync(outputPath(route), 'utf8'))
  return Array.from(window.document.querySelectorAll('main p'))
    .map((paragraph) => normalizeText(paragraph.textContent || ''))
    .filter((paragraph) => paragraph.split(/\s+/).length >= 8)
}

function verify() {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
  const current = manifest.map(({ route }) => inspectRoute(route))
  const currentByRoute = new Map(current.map((entry) => [entry.route, entry]))
  const baselineDescriptionCounts = new Map()
  for (const entry of baseline) {
    baselineDescriptionCounts.set(entry.description, (baselineDescriptionCounts.get(entry.description) || 0) + 1)
  }
  const errors = []

  for (const expected of baseline) {
    const actual = currentByRoute.get(expected.route)
    if (!actual) {
      errors.push(`${expected.route}: route removed`)
      continue
    }
    for (const key of ['title', 'description', 'canonical', 'robots']) {
      if (actual[key] !== expected[key]) errors.push(`${expected.route}: ${key} changed`)
    }
    for (const key of ['h1', 'h2', 'sectionIds', 'schemaTypes']) {
      if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) {
        errors.push(`${expected.route}: ${key} structure changed`)
      }
    }
    for (const href of expected.internalLinks) {
      if (!actual.internalLinks.includes(href)) errors.push(`${expected.route}: internal link removed: ${href}`)
    }
  }

  const titles = new Set()
  const descriptions = new Set()
  const canonicals = new Set()
  for (const entry of current) {
    if (entry.h1.length !== 1 || !entry.h1[0]) errors.push(`${entry.route}: expected one non-empty H1`)
    if (entry.rawH1Count !== 1) errors.push(`${entry.route}: expected one H1 in raw HTML`)
    if (!entry.title) errors.push(`${entry.route}: missing title`)
    if (!entry.description) errors.push(`${entry.route}: missing description`)
    if (!entry.canonical.startsWith(`${siteUrl}/`)) errors.push(`${entry.route}: canonical must be absolute`)
    if (/noindex/i.test(entry.robots)) errors.push(`${entry.route}: noindex is not allowed`)
    if (!entry.prerendered) errors.push(`${entry.route}: root is not prerendered`)
    if (titles.has(entry.title)) errors.push(`${entry.route}: duplicate title`)
    if (descriptions.has(entry.description) && !baselineDescriptionCounts.has(entry.description)) {
      errors.push(`${entry.route}: duplicate description`)
    }
    if (canonicals.has(entry.canonical)) errors.push(`${entry.route}: duplicate canonical`)
    titles.add(entry.title)
    descriptions.add(entry.description)
    canonicals.add(entry.canonical)
    for (const href of entry.internalLinks) {
      if (!routeExists(href)) errors.push(`${entry.route}: broken internal link: ${href}`)
    }
  }

  const learn = currentByRoute.get('/learn/')
  if (learn) {
    if (!learn.schemaTypes.includes('CollectionPage') || !learn.schemaTypes.includes('ItemList')) {
      errors.push('/learn/: missing CollectionPage or ItemList schema')
    }
    if (!existsSync(resolve(distRoot, 'learn.md'))) errors.push('/learn/: missing markdown mirror')
    if (!readFileSync(resolve(distRoot, 'llms.txt'), 'utf8').includes('/learn.md')) {
      errors.push('/learn/: missing from llms.txt')
    }
    const existingParagraphs = new Set(
      baseline
        .filter((entry) => entry.route !== '/learn/')
        .flatMap((entry) => mainParagraphs(entry.route)),
    )
    for (const paragraph of mainParagraphs('/learn/')) {
      if (existingParagraphs.has(paragraph)) errors.push(`/learn/: duplicated existing paragraph: ${paragraph}`)
    }
  }

  if (errors.length) {
    throw new Error(`SEO structure verification failed:\n- ${errors.join('\n- ')}`)
  }
  console.log(`SEO structure verified for ${current.length} routes; ${baseline.length} approved baseline routes matched.`)
}

const command = process.argv[2] || 'verify'
if (command === 'write-baseline') {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const baseline = manifest.map(({ route }) => inspectRoute(route))
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`)
  console.log(`Wrote SEO baseline for ${baseline.length} routes.`)
} else if (command === 'verify') {
  verify()
} else {
  throw new Error(`Unknown command: ${command}`)
}
