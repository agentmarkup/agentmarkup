import { prerenderPage } from '../entry-render'
import FortuneReport from '../pages/BlogPost14'

export function prerender() {
  return prerenderPage(FortuneReport)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(FortuneReport)
  })
}
