import { author } from './data/editorial'

function Byline({ date, readingTime }: { date: string; readingTime: string }) {
  const formatted = new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <p className="blog-meta">
      By <a href={author.profilePath}>{author.name}</a>
      {' '}&middot; {formatted} &middot; {readingTime}
    </p>
  )
}

export default Byline
