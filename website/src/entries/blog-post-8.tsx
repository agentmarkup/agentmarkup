import { prerenderPage } from '../entry-render'
import WebsiteCheckerGuide from '../pages/BlogPost8'

export function prerender() {
  return prerenderPage(WebsiteCheckerGuide)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(WebsiteCheckerGuide)
  })
}
