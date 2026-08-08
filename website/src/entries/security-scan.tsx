import { prerenderPage } from '../entry-render'

import SecurityScan from '../pages/SecurityScan'

export function prerender() {
  return prerenderPage(SecurityScan)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(SecurityScan)
  })
}
