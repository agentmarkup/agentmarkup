import { prerenderPage } from '../entry-render'
import WebMcpAgentMarkupStudio from '../pages/BlogPost18'

export function prerender() {
  return prerenderPage(WebMcpAgentMarkupStudio)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(WebMcpAgentMarkupStudio)
  })
}
