import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import Layout from '../Layout'
import AiCrawlers2026 from '../pages/BlogPost4'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Layout><AiCrawlers2026 /></Layout>
  </StrictMode>,
)
