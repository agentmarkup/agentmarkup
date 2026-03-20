import { author } from './data/editorial'
import { formatEditorialDate } from './formatDate'

function Byline({ date, readingTime }: { date: string; readingTime: string }) {
  const formatted = formatEditorialDate(date)

  return (
    <p className="blog-meta">
      By <a href={author.profilePath}>{author.name}</a>
      {' '}&middot; {formatted} &middot; {readingTime}
    </p>
  )
}

export default Byline
