import { prerenderPage } from '../entry-render'
import JsonLd from '../pages/JsonLd'

export function prerender() {
  return prerenderPage(JsonLd)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(JsonLd)
  })
}
