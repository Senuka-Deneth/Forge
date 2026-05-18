# Vision Chart Bot 📊

Vision Chart Bot is a high-performance, real-time market visualization and AI-powered analysis dashboard specifically designed for Binance Spot trading. It combines modern technical indicators with advanced AI models to provide traders with deep market intelligence.

## ✨ Key Features

- **Real-time Visualization**: High-performance candlestick charts powered by `Lightweight Charts`.
- **Advanced Technical Indicators**: Built-in EMA (20/50), RSI (14), and MACD with customizable timeframes.
- **Pivot Point Analysis**: Automatic calculation of Classic and Fibonacci Pivot Points to identify key support and resistance levels.
- **AI Market Intelligence**: Deep analysis using OpenRouter integration (Nvidia Nemotron model) for:
    - Market Structure analysis
    - Trend & Momentum evaluation
    - Trade Logic & Risk assessment
    - Anomaly detection
- **Responsive Design**: A stunning "Liquid Glass" UI that adapts to all screen sizes with full Dark/Light mode support.
- **Live Data Streaming**: Seamless real-time price updates via Binance WebSockets.

## 🛠️ Tech Stack

### Backend
- **Framework**: Python 3.10+ (Flask)
- **APIs**: Binance Public API, OpenRouter API
- **Key Libraries**: `flask-cors`, `requests`, `python-dotenv`

### Frontend
- **Framework**: React 18+ (Vite)
- **Charting**: `lightweight-charts`
- **Styling**: Modern CSS with "Liquid Glass" aesthetics

---

## 🚀 Getting Started

### Prerequisites
- Python 3.10 or higher
- Node.js (v18+) and npm
- [OpenRouter API Key](https://openrouter.ai/)

### 1. Backend Setup
Navigate to the backend directory:
```bash
cd backend
```

Create and activate a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`
```

Install dependencies:
```bash
pip install -r requirements.txt
```

Configure environment variables:
Copy `backend/.env.example` to `backend/.env` and set your key, or create a `.env` file in the `backend/` directory with the following:
```env
OPENROUTER_API_KEY=your_api_key_here
OPENROUTER_MODEL=nvidia/nemotron-3-super-120b-a12b:free
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

Run the server:
```bash
python app.py
```
The backend will run on `http://127.0.0.1:5000`.

### 2. Frontend Setup
Navigate to the frontend directory:
```bash
cd frontend
```

Install dependencies:
```bash
npm install
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