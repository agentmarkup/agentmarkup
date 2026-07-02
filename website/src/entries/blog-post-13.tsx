import { prerenderPage } from '../entry-render'
import AuditGuide from '../pages/BlogPost13'

export function prerender() {
  return prerenderPage(AuditGuide)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(AuditGuide)
  })
}
