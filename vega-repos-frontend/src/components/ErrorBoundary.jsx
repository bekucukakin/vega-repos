import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('VEGA UI Error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          fontFamily: 'system-ui, sans-serif',
          background: '#050608',
          color: '#f0f2f5',
        }}>
          <h1 style={{ marginBottom: '1rem', color: '#ef4444' }}>Something went wrong</h1>
          <p style={{ marginBottom: '1.5rem', color: '#8b92a0', maxWidth: '500px' }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1rem',
              background: '#0ea5e9',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Reload Page
          </button>
          <p style={{ marginTop: '2rem', fontSize: '0.85rem', color: '#5c6370' }}>
            Check the browser console (F12) for details.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
