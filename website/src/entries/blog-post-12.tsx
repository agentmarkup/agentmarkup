import { prerenderPage } from '../entry-render'
import CliGuide from '../pages/BlogPost12'

export function prerender() {
  return prerenderPage(CliGuide)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(CliGuide)
  })
}
