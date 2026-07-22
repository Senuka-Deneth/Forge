import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Single source of truth: the chart renders the same math the edge functions reason over.
      // Only pure modules are aliased here — anything touching Deno globals or the network
      // (liquidation.ts, binance.ts, http.ts) must stay server-side.
      '@forge/pivot': path.resolve(__dirname, '../supabase/functions/_shared/pivotPoints.ts'),
      '@forge/market-structure': path.resolve(__dirname, '../supabase/functions/_shared/marketStructure.ts'),
      '@forge/volatility': path.resolve(__dirname, '../supabase/functions/_shared/volatility.ts'),
      '@forge/vwap': path.resolve(__dirname, '../supabase/functions/_shared/vwap.ts'),
      '@forge/liquidity-map': path.resolve(__dirname, '../supabase/functions/_shared/liquidityMap.ts'),
      '@forge/volume-profile': path.resolve(__dirname, '../supabase/functions/_shared/volumeProfile.ts'),
      '@forge/confluence': path.resolve(__dirname, '../supabase/functions/_shared/confluence.ts'),
      '@forge/position-sizing': path.resolve(__dirname, '../supabase/functions/_shared/positionSizing.ts'),
      '@forge/expected-move': path.resolve(__dirname, '../supabase/functions/_shared/expectedMove.ts'),
      '@forge/risk-of-ruin': path.resolve(__dirname, '../supabase/functions/_shared/riskOfRuin.ts'),
      '@forge/trade-efficiency': path.resolve(__dirname, '../supabase/functions/_shared/tradeEfficiency.ts'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        welcome: path.resolve(__dirname, 'welcome.html'),
      },
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          'lightweight-charts': ['lightweight-charts'],
          three: ['three'],
          'framer-motion': ['framer-motion'],
        },
      },
    },
  },
  server: {
    port: 5173
  },
  test: {
    environment: 'node',
  },
})
