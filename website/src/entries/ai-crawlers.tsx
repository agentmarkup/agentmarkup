import { prerenderPage } from '../entry-render'
import AiCrawlers from '../pages/AiCrawlers'

export function prerender() {
  return prerenderPage(AiCrawlers)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(AiCrawlers)
  })
}
