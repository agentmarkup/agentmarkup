import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import Layout from '../Layout'
import JsonLdGuide from '../pages/BlogPost3'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Layout><JsonLdGuide /></Layout>
  </StrictMode>,
)
