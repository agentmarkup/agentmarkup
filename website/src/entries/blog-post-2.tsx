import { prerenderPage } from '../entry-render'
import WhatIsGeo from '../pages/BlogPost2'

export function prerender() {
  return prerenderPage(WhatIsGeo)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(WhatIsGeo)
  })
}
