import { prerenderPage } from '../entry-render'
import WhyLlmsTxtMatters from '../pages/BlogPost1'

export function prerender() {
  return prerenderPage(WhyLlmsTxtMatters)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(WhyLlmsTxtMatters)
  })
}
