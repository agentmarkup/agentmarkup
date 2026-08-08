import { StrictMode, type ComponentType } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'

import Layout from './Layout'

function renderPageElement(Page: ComponentType) {
  return (
    <StrictMode>
      <Layout>
        <Page />
      </Layout>
    </StrictMode>
  )
}

export function mountPage(Page: ComponentType) {
  const root = document.getElementById('root')
  if (!root) {
    throw new Error('Missing #root element for website entry.')
  }

  const page = renderPageElement(Page)
  if (!root.hasChildNodes()) {
    if (!import.meta.env.DEV) {
      throw new Error('Expected prerendered content in #root.')
    }

    createRoot(root).render(page)
    return
  }

  hydrateRoot(root, page)
}
