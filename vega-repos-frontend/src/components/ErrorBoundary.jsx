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
        <div style={pageStyle}>
          <div style={cardStyle}>
            <div style={iconWrap}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f85149" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h1 style={titleStyle}>Something went wrong</h1>
            <p style={msgStyle}>
              {this.state.error?.message || 'An unexpected error occurred in the UI.'}
            </p>
            <div style={actionsStyle}>
              <button onClick={() => this.setState({ hasError: false, error: null })} style={btnPrimaryStyle}>
                Try again
              </button>
              <button onClick={() => window.location.reload()} style={btnSecondaryStyle}>
                Reload page
              </button>
            </div>
            <p style={hintStyle}>Open the browser console (F12) for details.</p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const pageStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#0a0c10',
  padding: '2rem',
}

const cardStyle = {
  background: '#1c2128',
  border: '1px solid rgba(248,81,73,0.2)',
  borderRadius: '16px',
  padding: '40px',
  maxWidth: '480px',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '16px',
  textAlign: 'center',
  boxShadow: '0 0 40px rgba(248,81,73,0.06)',
}

const iconWrap = {
  width: 64, height: 64,
  background: 'rgba(248,81,73,0.1)',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const titleStyle = {
  fontSize: '1.35rem',
  fontWeight: 700,
  color: '#e6edf3',
  margin: 0,
  letterSpacing: '-0.02em',
}

const msgStyle = {
  fontSize: '0.875rem',
  color: '#8b949e',
  lineHeight: 1.65,
  margin: 0,
  maxWidth: 360,
}

const actionsStyle = {
  display: 'flex',
  gap: 12,
  flexWrap: 'wrap',
  justifyContent: 'center',
  marginTop: 8,
}

const btnPrimaryStyle = {
  padding: '9px 22px',
  background: 'linear-gradient(135deg, #58a6ff, #818cf8)',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '0.875rem',
}

const btnSecondaryStyle = {
  padding: '9px 22px',
  background: 'transparent',
  color: '#8b949e',
  border: '1px solid rgba(255,255,255,0.16)',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: 500,
  fontSize: '0.875rem',
}

const hintStyle = {
  fontSize: '0.78rem',
  color: '#6e7681',
  margin: 0,
}
