# Forge 📊

Forge is a high-performance, real-time market visualization and AI-powered analysis dashboard specifically designed for Binance Spot trading. It combines modern technical indicators with advanced AI models to provide traders with deep market intelligence.

## ✨ Key Features

- **Real-time Visualization**: High-performance candlestick charts powered by `Lightweight Charts`.
- **Advanced Technical Indicators**: Built-in EMA (20/50), RSI (14), and MACD with customizable timeframes.
- **Pivot Point Analysis**: TradingView-standard pivot levels (Traditional, Fibonacci, Woodie, Classic, DM, Camarilla) from native Binance HTF klines.
- **AI Market Intelligence**: Deep analysis using OpenRouter integration for market structure, trend, and risk assessment.
- **Responsive Design**: A stunning "Liquid Glass" UI that adapts to all screen sizes with full Dark/Light mode support.
- **Live Data Streaming**: Seamless real-time price updates via Binance WebSockets.

## 🛠️ Tech Stack

### Production (live serving path)
- **Frontend**: React 18 + Vite (`frontend/`)
- **Backend**: Supabase Edge Functions (`supabase/functions/`)
  - `get-market-data` — chart candles
  - `calculate-pivots` — pivot levels (see [docs/pivots.md](docs/pivots.md))
  - `user-preferences`, `ai-analysis`
- **Pivot source of truth**: `supabase/functions/_shared/pivotPoints.ts`

### Legacy (not used by frontend)
- **Flask backend** (`backend/`) — deprecated for serving; kept for local experiments only. Do not use `/api/pivots` (removed).

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+) and npm
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for edge functions)
- OpenRouter API key (for AI analysis)

### 1. Frontend

```bash
cd frontend
npm install
npm run dev
```

App: `http://localhost:5173`

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `frontend/.env` (see `.env.example`).

### 2. Supabase Edge Functions (local)

```bash
supabase functions serve
```

Deploy: `supabase functions deploy calculate-pivots` (and other functions as needed).

### 3. Legacy Flask (optional, not required)

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Runs on `http://127.0.0.1:5050` — **not connected to the React app**.

---

## Pivot documentation

See [docs/pivots.md](docs/pivots.md) for timeframe rules, Binance HTF behavior, and API response contract.

## 📄 License

This project is for educational and personal use only. Use at your own risk in live trading.
