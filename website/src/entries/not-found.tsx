import { prerenderPage } from '../entry-render'
import NotFound from '../pages/NotFound'

export function prerender() {
  return prerenderPage(NotFound)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(NotFound)
  })
}
