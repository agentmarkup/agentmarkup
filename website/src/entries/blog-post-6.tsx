import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import Layout from '../Layout'
import BrandAwarenessLlm from '../pages/BlogPost6'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Layout><BrandAwarenessLlm /></Layout>
  </StrictMode>,
)
