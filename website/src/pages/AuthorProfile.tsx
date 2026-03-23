import { author, blogPosts } from '../data/editorial'
import { formatEditorialDate } from '../formatDate'

function AuthorProfile() {
  return (
    <main>
      <div className="doc-page author-page">
        <h1>{author.name}</h1>
        <p className="author-role">{author.role}</p>
        <p className="doc-intro">{author.bio}</p>

        <section>
          <h2>About</h2>
          <p>
            Sebastian is a product builder and developer with over 25 years in
            technology. He created agentmarkup to solve a problem he encountered
            on his own projects: making websites machine-readable for LLMs and
            AI agents required juggling separate tools for llms.txt, JSON-LD,
            robots.txt, markdown mirrors, headers, and validation. agentmarkup
            combines that build-time surface into one toolkit for Vite, Astro,
            and Next.js.
          </p>
          <p>
            He is also the founder of <a href="https://animafelix.com" target="_blank" rel="noopener noreferrer">Anima Felix</a>, an anxiety support app that uses agentmarkup in production.
          </p>
          <ul>
            <li><a href="https://www.cochinescu.com" target="_blank" rel="noopener noreferrer">cochinescu.com</a></li>
            <li><a href="https://github.com/nichochar" target="_blank" rel="noopener noreferrer">GitHub</a></li>
          </ul>
        </section>

        <section>
          <h2>Articles</h2>
          <div className="blog-list">
            {blogPosts.map(post => (
              <a key={post.slug} href={`/blog/${post.slug}/`} className="blog-card">
                <h3>{post.title}</h3>
                <p>{post.description}</p>
                <span className="blog-date">
                  {formatEditorialDate(post.date)}
                  {' '}&middot; {post.readingTime}
                </span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}

export default AuthorProfile
