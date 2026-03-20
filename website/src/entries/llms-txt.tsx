import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import Layout from '../Layout'
import LlmsTxt from '../pages/LlmsTxt'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Layout><LlmsTxt /></Layout>
  </StrictMode>,
)
