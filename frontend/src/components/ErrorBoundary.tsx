import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Wraps the whole app (see main.tsx). Without this, an uncaught render
 * error anywhere in the tree unmounts everything React was managing,
 * leaving a blank page with no on-screen indication anything went
 * wrong -- exactly what happened on product detail pages when
 * crypto.randomUUID() threw on a non-secure-context (plain HTTP)
 * origin (see lib/id.ts). This doesn't fix that class of bug, it just
 * means the *next* one fails visibly instead of silently.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Unhandled error in component tree:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-ink-900 px-6">
          <div className="max-w-md text-center">
            <h1 className="font-display text-xl font-medium text-white">Something went wrong</h1>
            <p className="mt-2 text-sm text-white/50">
              This page hit an unexpected error and couldn't render. Reloading usually fixes it; if it keeps
              happening, let an admin know what you were doing.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              Reload page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
