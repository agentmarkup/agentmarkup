import { prerenderPage } from '../entry-render'
import License from '../pages/License'

export function prerender() {
  return prerenderPage(License)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(License)
  })
}
