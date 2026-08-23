import { prerenderPage } from '../entry-render'
import Support from '../pages/Support'

export function prerender() {
  return prerenderPage(Support)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(Support)
  })
}
