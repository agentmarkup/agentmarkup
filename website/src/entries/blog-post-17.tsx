import { prerenderPage } from '../entry-render'
import AgentmarkupPluginLaunch from '../pages/BlogPost17'

export function prerender() {
  return prerenderPage(AgentmarkupPluginLaunch)
}

if (typeof document !== 'undefined') {
  void import('../entry-client').then(({ mountPage }) => {
    mountPage(AgentmarkupPluginLaunch)
  })
}
