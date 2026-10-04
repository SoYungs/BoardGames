import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <main className="app-main" style={{ maxWidth: 560 }}>
          <h1 className="page-title">页面加载出错</h1>
          <p className="page-sub">加载时遇到了一点问题，请重新加载后再试。</p>
          <pre
            style={{
              padding: 16,
              borderRadius: 12,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--stroke)',
              overflow: 'auto',
              fontSize: 13,
            }}
          >
            {this.state.error.message}
          </pre>
          <button
            type="button"
            className="back-link"
            style={{ marginTop: 16 }}
            onClick={() => window.location.reload()}
          >
            重新加载
          </button>
        </main>
      )
    }
    return this.props.children
  }
}
