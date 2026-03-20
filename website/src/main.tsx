import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Layout from './Layout'
import Home from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Layout><Home /></Layout>
  </StrictMode>,
)
