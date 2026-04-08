import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unknown runtime error',
    }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Root render error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#070b14',
          color: '#e5e7eb',
          padding: '24px',
          fontFamily: 'DM Sans, system-ui, sans-serif',
        }}>
          <div style={{ maxWidth: '840px', width: '100%', background: '#0f172a', border: '1px solid #1f2937', borderRadius: '14px', padding: '20px' }}>
            <h2 style={{ margin: 0, marginBottom: '8px', fontSize: '20px' }}>Application Error</h2>
            <p style={{ margin: 0, marginBottom: '10px', opacity: 0.9 }}>A runtime error prevented the dashboard from rendering.</p>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', opacity: 0.95 }}>{this.state.errorMessage}</pre>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
)