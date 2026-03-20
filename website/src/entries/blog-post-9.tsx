import { prerenderPage } from '../entry-render'
import WhenMarkdownMirrorsHelp from '../pages/BlogPost9'

export function prerender() {
  return prerenderPage(WhenMarkdownMirrorsHelp)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(WhenMarkdownMirrorsHelp)
  })
}
