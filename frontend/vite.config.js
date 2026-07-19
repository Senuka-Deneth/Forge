import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@forge/pivot': path.resolve(__dirname, '../supabase/functions/_shared/pivotPoints.ts'),
    },
  },
  server: {
    port: 5173
  },
  test: {
    environment: 'node',
  },
})
