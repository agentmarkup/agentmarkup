import { prerenderPage } from '../entry-render'
import Learn from '../pages/Learn'

export function prerender() {
  return prerenderPage(Learn)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(Learn)
  })
}
