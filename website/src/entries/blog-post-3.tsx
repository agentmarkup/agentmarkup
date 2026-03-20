import { prerenderPage } from '../entry-render'
import JsonLdGuide from '../pages/BlogPost3'

export function prerender() {
  return prerenderPage(JsonLdGuide)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(JsonLdGuide)
  })
}
