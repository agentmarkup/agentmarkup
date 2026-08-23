import { prerenderPage } from '../entry-render'
import Soft404DiscoverabilityTools from '../pages/BlogPost15'

export function prerender() {
  return prerenderPage(Soft404DiscoverabilityTools)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(Soft404DiscoverabilityTools)
  })
}
