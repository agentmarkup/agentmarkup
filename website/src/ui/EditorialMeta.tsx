import { editorialLabels, type BlogPostMeta } from '../data/editorial'

export function EditorialMeta({ post, compact = false }: { post: BlogPostMeta; compact?: boolean }) {
  return (
    <span className={`editorial-meta${compact ? ' is-compact' : ''}`} aria-label="Article details">
      <span>{editorialLabels.level[post.level]}</span>
      <span>{editorialLabels.audience[post.audience]}</span>
      <span>{editorialLabels.topic[post.topic]}</span>
    </span>
  )
}
