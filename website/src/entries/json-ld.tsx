import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import Layout from '../Layout'
import JsonLd from '../pages/JsonLd'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Layout><JsonLd /></Layout>
  </StrictMode>,
)
