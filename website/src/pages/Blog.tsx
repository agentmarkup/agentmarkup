import { useState } from 'react'
import { author, blogPosts } from '../data/editorial'
import { formatEditorialDate } from '../formatDate'
import { EditorialMeta } from '../ui/EditorialMeta'

type BlogFilter = 'all' | 'plain-language' | 'technical' | 'research'

function Blog() {
  const [filter, setFilter] = useState<BlogFilter>('all')
  const featured = blogPosts[0]
  const groups = [
    { label: 'AI visibility and research', posts: blogPosts.filter((post) => ['ai-crawler-audit-500-companies', 'audit-ai-crawler-access', 'website-checker', 'brand-awareness-ai', 'ecommerce-llm-optimization', 'what-is-geo'].includes(post.slug)) },
    { label: 'Implementation guides', posts: blogPosts.filter((post) => ['a-fix-is-not-a-verification', 'soft-404-ai-discoverability-tools', 'nuxt-llms-txt-json-ld', 'agentmarkup-cli-any-static-site', 'nextjs-llms-txt-json-ld', 'markdown-mirrors', 'when-markdown-mirrors-help'].includes(post.slug)) },
    { label: 'Machine-readable foundations', posts: blogPosts.filter((post) => ['ai-crawlers-2026', 'json-ld-structured-data-guide', 'why-llms-txt-matters'].includes(post.slug)) },
  ]
  const matchesFilter = (audience: string) => filter === 'all' || audience === filter
  const visibleCount = blogPosts.filter((post) => matchesFilter(post.audience)).length

  return (
    <main>
      <div className="doc-page blog-index">
        <div className="blog-index-header">
          <p className="section-kicker">AgentMarkup journal</p>
          <h1>Blog</h1>
          <p className="doc-intro">
            Technical writing about machine-readable websites, AI discoverability, and structured data.
            Written by <a href={author.profilePath}>{author.name}</a>, {author.role}.
          </p>
        </div>

        <div className="topic-filter" aria-label="Filter articles by audience">
          <span>Show articles for</span>
          {([
            ['all', 'Everyone'],
            ['plain-language', 'I own a website'],
            ['technical', 'I build websites'],
            ['research', 'Research'],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
          ))}
          <span className="sr-only" aria-live="polite">{visibleCount} articles shown</span>
        </div>

        {featured && matchesFilter(featured.audience) ? (
          <a href={`/blog/${featured.slug}/`} className="blog-featured">
            <div className="blog-featured-heading">
              <span className="section-kicker">Featured research</span>
              <h2>{featured.title}</h2>
            </div>
            <div className="blog-featured-summary">
              <p>{featured.description}</p>
              <EditorialMeta post={featured} />
              <span className="blog-date">{formatEditorialDate(featured.date)} &middot; {featured.readingTime}</span>
              <strong>Read featured article</strong>
            </div>
          </a>
        ) : null}

        {groups.map((group) => (
          <section className="blog-topic" key={group.label}>
            <header className="blog-topic-heading">
              <h2>{group.label}</h2>
              <span>{group.posts.filter((post) => matchesFilter(post.audience)).length} articles</span>
            </header>
            <div className="blog-list">
              {group.posts.map(post => matchesFilter(post.audience) ? (
                <a key={post.slug} href={`/blog/${post.slug}/`} className="blog-card">
                  <h3>{post.title}</h3>
                  <p>{post.description}</p>
                  <EditorialMeta post={post} compact />
                  <span className="blog-date">{formatEditorialDate(post.date)} &middot; {post.readingTime}</span>
                </a>
              ) : null)}
              {group.posts.some((post) => matchesFilter(post.audience)) ? null : <p className="blog-filter-empty">No articles for this audience in this topic.</p>}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}

export default Blog
