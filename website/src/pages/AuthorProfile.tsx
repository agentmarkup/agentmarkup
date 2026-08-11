import { author, blogPosts } from '../data/editorial'
import { formatEditorialDate } from '../formatDate'
import { EditorialMeta } from '../ui/EditorialMeta'

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
            <li><a href={author.externalUrl} target="_blank" rel="noopener noreferrer">cochinescu.com</a></li>
            <li><a href={author.githubUrl} target="_blank" rel="noopener noreferrer">GitHub</a></li>
          </ul>
        </section>

        <section>
          <h2>Articles</h2>
          {([
            ['Guides', 'plain-language'],
            ['Research', 'research'],
            ['Implementation', 'technical'],
          ] as const).map(([label, audience]) => (
            <div className="author-article-group" key={label}>
              <h3>{label}</h3>
              <div className="blog-list">
                {blogPosts.map(post => post.audience === audience ? (
                  <a key={post.slug} href={`/blog/${post.slug}/`} className="blog-card">
                    <h4>{post.title}</h4>
                    <p>{post.description}</p>
                    <EditorialMeta post={post} compact />
                    <span className="blog-date">
                      {formatEditorialDate(post.date)}
                      {' '}&middot; {post.readingTime}
                    </span>
                  </a>
                ) : null)}
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}

export default AuthorProfile
