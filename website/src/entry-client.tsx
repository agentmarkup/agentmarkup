import { StrictMode, type ComponentType } from 'react'
import { hydrateRoot } from 'react-dom/client'

import './index.css'
import './App.css'
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

  hydrateRoot(root, renderPageElement(Page))
}
