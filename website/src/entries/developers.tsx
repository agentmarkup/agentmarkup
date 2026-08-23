import { prerenderPage } from '../entry-render'
import Developers from '../pages/Developers'

export function prerender() {
  return prerenderPage(Developers)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(Developers)
  })
}
