import { author, blogPosts } from '../data/editorial'
import { formatEditorialDate } from '../formatDate'

function Blog() {
  return (
    <main>
      <div className="doc-page">
        <h1>Blog</h1>
        <p className="doc-intro">
          Technical writing about machine-readable websites, AI discoverability, and structured data.
          Written by <a href={author.profilePath}>{author.name}</a>, {author.role}.
        </p>

        <div className="blog-list">
          {blogPosts.map(post => (
            <a key={post.slug} href={`/blog/${post.slug}/`} className="blog-card">
              <h2>{post.title}</h2>
              <p>{post.description}</p>
              <span className="blog-date">
                {formatEditorialDate(post.date)}
                {' '}&middot; {post.readingTime}
              </span>
            </a>
          ))}
        </div>
      </div>
    </main>
  )
}

export default Blog
