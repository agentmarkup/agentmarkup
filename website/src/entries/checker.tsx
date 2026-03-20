import { prerenderPage } from '../entry-render'

import Checker from '../pages/Checker'

export function prerender() {
  return prerenderPage(Checker)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(Checker)
  })
}
