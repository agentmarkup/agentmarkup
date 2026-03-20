import { prerenderPage } from '../entry-render'
import Blog from '../pages/Blog'

export function prerender() {
  return prerenderPage(Blog)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(Blog)
  })
}
