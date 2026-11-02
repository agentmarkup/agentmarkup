import { prerenderPage } from '../entry-render'

import ScoreMethodology from '../pages/ScoreMethodology'

export function prerender() {
  return prerenderPage(ScoreMethodology)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(ScoreMethodology)
  })
}
