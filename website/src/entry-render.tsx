import { StrictMode, type ComponentType } from 'react'
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

export async function prerenderPage(Page: ComponentType) {
  const { renderToString } = await import('react-dom/server')
  return renderToString(renderPageElement(Page))
}
