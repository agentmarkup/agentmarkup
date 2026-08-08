import { prerenderPage } from '../entry-render'
import Privacy from '../pages/Privacy'

export function prerender() {
  return prerenderPage(Privacy)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(Privacy)
  })
}
