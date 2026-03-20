import { prerenderPage } from '../entry-render'
import EcommerceLlmOptimization from '../pages/BlogPost5'

export function prerender() {
  return prerenderPage(EcommerceLlmOptimization)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(EcommerceLlmOptimization)
  })
}
