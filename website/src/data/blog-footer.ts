import { blogPosts, type BlogPostMeta } from './editorial'

const readingGuides = {
  'structured-data': {
    href: '/docs/json-ld/',
    title: 'JSON-LD structured data guide',
  },
  'crawler-access': {
    href: '/docs/ai-crawlers/',
    title: 'AI crawlers guide',
  },
  implementation: {
    href: '/docs/audit/',
    title: 'Website audit guide',
  },
  discoverability: {
    href: '/docs/llms-txt/',
    title: 'llms.txt guide',
  },
  business: {
    href: '/blog/website-checker/',
    title: 'Is your website ready for AI?',
  },
} as const

export function getBlogFooterModel(currentSlug: string) {
  const currentPost = blogPosts.find((post) => post.slug === currentSlug)
  const currentIndex = blogPosts.findIndex((post) => post.slug === currentSlug)
  const previousPost = currentIndex > 0 ? blogPosts[currentIndex - 1] : undefined
  const nextPost = currentIndex >= 0 ? blogPosts[currentIndex + 1] : undefined
  const websiteCheckerIsAdjacent = previousPost?.slug === 'website-checker' || nextPost?.slug === 'website-checker'
  const orientation = currentPost?.audience === 'technical' && !websiteCheckerIsAdjacent
    ? {
        href: '/blog/website-checker/',
        title: 'Is your website ready for AI?',
        description: 'Prefer a plain-language introduction? Start with the website-checker guide.',
      }
    : {
        ...(readingGuides[currentPost?.topic ?? 'business']),
        description: 'Ready for the implementation details? Continue with the related guide.',
      }
  const orientationSlug = orientation.href.match(/^\/blog\/([^/]+)\/$/)?.[1]
  const excludedSlugs = new Set([
    currentSlug,
    previousPost?.slug,
    nextPost?.slug,
    orientationSlug,
  ])
  const rankedPosts = blogPosts.filter((post) => !excludedSlugs.has(post.slug)).sort((a, b) => {
    const score = (post: BlogPostMeta) =>
      (post.topic === currentPost?.topic ? 2 : 0) +
      (post.audience === currentPost?.audience ? 1 : 0) +
      (post.level === currentPost?.level ? 0.5 : 0)
    return score(b) - score(a) || blogPosts.indexOf(a) - blogPosts.indexOf(b)
  })

  return { previousPost, nextPost, orientation, recommendedPosts: rankedPosts.slice(0, 3) }
}
