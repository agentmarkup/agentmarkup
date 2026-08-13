import { author, blogPosts } from './data/editorial'
import { formatEditorialDate } from './formatDate'
import { EditorialMeta } from './ui/EditorialMeta'

function Byline({ date, readingTime, slug }: { date: string; readingTime: string; slug: string }) {
  const formatted = formatEditorialDate(date)
  const post = blogPosts.find((entry) => entry.slug === slug)

  return (
    <div className="blog-meta-wrap">
      <p className="blog-meta">
        By <a href={author.profilePath}>{author.name}</a>
        {' '}&middot; {formatted} &middot; {readingTime}
      </p>
      {post ? <EditorialMeta post={post} /> : null}
    </div>
  )
}

export default Byline
