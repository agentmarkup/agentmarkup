import { prerenderPage } from '../entry-render'
import AFixIsNotAVerification from '../pages/BlogPost16'

export function prerender() {
  return prerenderPage(AFixIsNotAVerification)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(AFixIsNotAVerification)
  })
}
