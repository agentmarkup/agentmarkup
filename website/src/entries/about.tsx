import { prerenderPage } from '../entry-render'
import About from '../pages/About'

export function prerender() {
  return prerenderPage(About)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(About)
  })
}
