# Forge 📊

Forge is a high-performance, real-time market visualization and AI-powered analysis dashboard specifically designed for Binance Spot trading. It combines modern technical indicators with advanced AI models to provide traders with deep market intelligence.

## ✨ Key Features

- **Real-time Visualization**: High-performance candlestick charts powered by `Lightweight Charts`.
- **Advanced Technical Indicators**: Built-in EMA (20/50), RSI (14), and MACD with customizable timeframes.
- **Pivot Point Analysis**: Automatic calculation of Classic, Fibonacci, and Traditional Pivot Points to identify key support and resistance levels.
- **AI Market Intelligence**: Deep analysis using OpenRouter integration for:
    - Market Structure analysis
    - Trend & Momentum evaluation
    - Trade Logic & Risk assessment
    - Anomaly detection
- **Responsive Design**: A stunning "Liquid Glass" UI that adapts to all screen sizes with full Dark/Light mode support.
- **Live Data Streaming**: Seamless real-time price updates via Binance WebSockets, with automatic reconnection.

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 18+ (Vite)
- **Charting**: `lightweight-charts`
- **Auth & Data**: Supabase (Auth, Postgres, Edge Functions)
- **Styling**: Modern CSS with "Liquid Glass" aesthetics

### Backend
- **Runtime**: Supabase Edge Functions (Deno/TypeScript)
- **APIs**: Binance Public API, OpenRouter API
- **Database**: Postgres via Supabase (user preferences, market data cache, AI analysis logs)

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+) and npm
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- A Supabase project (or the local dev stack via `supabase start`)
- [OpenRouter API Key](https://openrouter.ai/)

### 1. Supabase Setup
Navigate to the `supabase/` directory:
```bash
cd supabase
```

Copy `supabase/.env.example` to `supabase/.env` and fill in your values (used by `supabase functions serve` for local development):
```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
MARKET_CACHE_TTL_SECONDS=300
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
OPENROUTER_API_KEY=
OPENROUTER_HTTP_REFERER=
```

Run the database migrations and serve the edge functions locally:
```bash
supabase start
supabase db reset
supabase functions serve --env-file .env
```

In production, set the same secrets via **Project Settings → Edge Functions → Secrets**, and deploy with `supabase functions deploy`.

### 2. Frontend Setup
Navigate to the frontend directory:
```bash
cd frontend
```

Install dependencies:
```bash
npm install
```

Copy `frontend/.env.example` to `frontend/.env` and set your Supabase project URL and anon key:
```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Start the development server:
```bash
npm run dev
```
The application will be available at `http://localhost:5173`.

---

## 📸 Dashboard Overview
The dashboard features an integrated sidebar for navigation, header controls for symbol and timeframe selection, and real-time status monitoring. Use the **AI Analysis** tab to trigger a deep-dive market evaluation based on current live data.

## 📄 License
This project is for educational and personal use only. Use at your own risk in live trading.
