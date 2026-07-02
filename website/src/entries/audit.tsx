import { prerenderPage } from '../entry-render'
import Audit from '../pages/Audit'

export function prerender() {
  return prerenderPage(Audit)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(Audit)
  })
}
