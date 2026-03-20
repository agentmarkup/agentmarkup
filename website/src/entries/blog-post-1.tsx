import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import Layout from '../Layout'
import WhyLlmsTxtMatters from '../pages/BlogPost1'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Layout><WhyLlmsTxtMatters /></Layout>
  </StrictMode>,
)
