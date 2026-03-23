import { prerenderPage } from '../entry-render'
import NextJsGuide from '../pages/BlogPost10'

export function prerender() {
  return prerenderPage(NextJsGuide)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(NextJsGuide)
  })
}
