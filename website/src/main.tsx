import { prerenderPage } from './entry-render'
import Home from './App'

export function prerender() {
  return prerenderPage(Home)
}

if (typeof document !== 'undefined') {
  void import('./entry-client').then(({ mountPage }) => {
    mountPage(Home)
  })
}
