import { author, blogPosts, type BlogPostMeta } from './data/editorial'
import { formatEditorialDate } from './formatDate'

function BlogFooter({ currentSlug }: { currentSlug: string }) {
  const otherPosts = blogPosts.filter(p => p.slug !== currentSlug)

  return (
    <div className="blog-footer">
      <section className="blog-cta">
        <h2>Make your website machine-readable</h2>
        <p>
          agentmarkup is an open-source build-time toolkit for Vite and Astro
          that generates llms.txt, injects JSON-LD structured data, creates
          markdown mirrors from final HTML, manages AI crawler robots.txt rules,
          patches optional Content-Signal and canonical mirror headers, and
          validates everything at build time. Zero runtime cost.
        </p>
        <div className="blog-cta-actions">
          <a href="/" className="blog-cta-link">Learn more</a>
          <a href="https://github.com/agentmarkup/agentmarkup" target="_blank" rel="noopener noreferrer" className="blog-cta-link">GitHub</a>
          <pre className="blog-cta-install"><code>pnpm add -D @agentmarkup/vite  # or @agentmarkup/astro</code></pre>
        </div>
      </section>

      <section className="blog-author-card">
        <p className="blog-author-label">Written by</p>
        <p className="blog-author-name">
          <a href={author.profilePath}>{author.name}</a>
          <span className="blog-author-role"> &middot; {author.role}</span>
        </p>
        <p className="blog-author-bio">{author.bio}</p>
      </section>

      <section className="blog-related">
        <h2>More from the blog</h2>
        <div className="blog-list">
          {otherPosts.map((post: BlogPostMeta) => (
            <a key={post.slug} href={`/blog/${post.slug}/`} className="blog-card">
              <h3>{post.title}</h3>
              <p>{post.description}</p>
              <span className="blog-date">{formatDate(post.date)} &middot; {post.readingTime}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  )
}

function formatDate(dateStr: string) {
  return formatEditorialDate(dateStr)
}

export default BlogFooter
