import { author } from './data/editorial'
import { getBlogFooterModel } from './data/blog-footer'
import { formatEditorialDate } from './formatDate'
import { EditorialMeta } from './ui/EditorialMeta'
import PreferredSourceCta from './ui/PreferredSourceCta'

function BlogFooter({ currentSlug }: { currentSlug: string }) {
  const { previousPost, nextPost, orientation, recommendedPosts } = getBlogFooterModel(currentSlug)

  return (
    <div className="blog-footer">
      <PreferredSourceCta variant="article" />
      <div className="blog-outro-card">
        <section className="blog-author-card">
          <p className="blog-author-label">Written by</p>
          <p className="blog-author-name">
            <a href={author.profilePath}>{author.name}</a>
            <span className="blog-author-role"> &middot; {author.role}</span>
          </p>
          <p className="blog-author-bio">{author.bio}</p>
        </section>
        <aside className="article-orientation" aria-label="Recommended next reading">
          <p className="article-orientation-label">Continue reading</p>
          <a href={orientation.href}>
            <strong>{orientation.title}</strong>
            <span aria-hidden="true">→</span>
          </a>
          <p>{orientation.description}</p>
        </aside>
      </div>

      {previousPost || nextPost ? (
        <nav className="article-pagination" aria-label="Article order">
          {previousPost ? (
            <a href={`/blog/${previousPost.slug}/`} className="article-pagination-previous">
              <span>← Previous article</span>
              <strong>{previousPost.title}</strong>
            </a>
          ) : null}
          {nextPost ? (
            <a href={`/blog/${nextPost.slug}/`} className="article-pagination-next">
              <span>Next article →</span>
              <strong>{nextPost.title}</strong>
            </a>
          ) : null}
        </nav>
      ) : null}

      <section className="blog-related">
        <div className="blog-related-heading">
          <h2>More from the blog</h2>
          <a href="/blog/">View all articles →</a>
        </div>
        <div className="blog-list">
          {recommendedPosts.map((post) => (
            <a key={post.slug} href={`/blog/${post.slug}/`} className="blog-card">
              <h3>{post.title}</h3>
              <p>{post.description}</p>
              <EditorialMeta post={post} compact />
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
