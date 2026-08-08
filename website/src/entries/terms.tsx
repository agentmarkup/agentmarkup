import { prerenderPage } from '../entry-render'
import Terms from '../pages/Terms'

export function prerender() {
  return prerenderPage(Terms)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(Terms)
  })
}
