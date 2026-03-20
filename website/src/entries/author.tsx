import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import Layout from '../Layout'
import AuthorProfile from '../pages/AuthorProfile'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Layout><AuthorProfile /></Layout>
  </StrictMode>,
)
