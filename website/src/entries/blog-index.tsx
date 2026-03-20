import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import Layout from '../Layout'
import Blog from '../pages/Blog'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Layout><Blog /></Layout>
  </StrictMode>,
)
