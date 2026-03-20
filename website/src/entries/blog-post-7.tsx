import { prerenderPage } from '../entry-render'
import MarkdownPages from '../pages/BlogPost7'

export function prerender() {
  return prerenderPage(MarkdownPages)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(MarkdownPages)
  })
}
