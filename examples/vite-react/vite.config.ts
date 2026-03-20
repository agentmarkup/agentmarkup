import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { agentmarkup } from '@agentmarkup/vite'

export default defineConfig({
  plugins: [
    react(),
    agentmarkup({
      site: 'https://example.com',
      name: 'Example Shop',
      description: 'Minimal Vite React example showing @agentmarkup/vite in a local workspace.',
      llmsTxt: {
        sections: [
          {
            title: 'Pages',
            entries: [
              {
                title: 'Home',
                url: '/',
                description: 'Example landing page',
              },
            ],
          },
        ],
      },
      globalSchemas: [
        {
          preset: 'webSite',
          name: 'Example Shop',
          url: 'https://example.com',
          description: 'Minimal Vite React example for @agentmarkup/vite.',
        },
        {
          preset: 'organization',
          name: 'Example Shop',
          url: 'https://example.com',
          logo: 'https://example.com/logo.png',
        },
      ],
      pages: [
        {
          path: '/',
          schemas: [
            {
              preset: 'product',
              name: 'Classic Wallet',
              url: 'https://example.com',
              description: 'A demo product schema for the example app.',
              sku: 'wallet-demo-001',
              offers: {
                price: 49,
                priceCurrency: 'USD',
                availability: 'InStock',
              },
            },
          ],
        },
      ],
      aiCrawlers: {
        GPTBot: 'allow',
        ClaudeBot: 'allow',
      },
    }),
  ],
})
