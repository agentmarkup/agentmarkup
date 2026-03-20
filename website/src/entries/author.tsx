import { prerenderPage } from '../entry-render'
import AuthorProfile from '../pages/AuthorProfile'

export function prerender() {
  return prerenderPage(AuthorProfile)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(AuthorProfile)
  })
}
