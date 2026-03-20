import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import Layout from '../Layout'
import AiCrawlers from '../pages/AiCrawlers'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Layout><AiCrawlers /></Layout>
  </StrictMode>,
)
