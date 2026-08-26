import { prerenderPage } from '../entry-render'

import Studio from '../pages/Studio'

export function prerender() {
  return prerenderPage(Studio)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(Studio)
  })
}
