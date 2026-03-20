import { prerenderPage } from '../entry-render'
import BrandAwarenessLlm from '../pages/BlogPost6'

export function prerender() {
  return prerenderPage(BrandAwarenessLlm)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(BrandAwarenessLlm)
  })
}
