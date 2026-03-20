import { prerenderPage } from '../entry-render'
import AiCrawlers2026 from '../pages/BlogPost4'

export function prerender() {
  return prerenderPage(AiCrawlers2026)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(AiCrawlers2026)
  })
}
