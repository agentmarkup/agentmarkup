import { prerenderPage } from '../entry-render'
import Contact from '../pages/Contact'

export function prerender() {
  return prerenderPage(Contact)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(Contact)
  })
}
