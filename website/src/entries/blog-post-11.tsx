import { prerenderPage } from '../entry-render'
import NuxtGuide from '../pages/BlogPost11'

export function prerender() {
  return prerenderPage(NuxtGuide)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(NuxtGuide)
  })
}
