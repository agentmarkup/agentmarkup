import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import Layout from '../Layout'
import WhatIsGeo from '../pages/BlogPost2'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Layout><WhatIsGeo /></Layout>
  </StrictMode>,
)
