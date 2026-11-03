'use client'
import { Component, type ReactNode } from 'react'

// Keeps one failing part of the TV (unexpected settings or data) from taking down the whole
// screen. The fallback is quiet (an empty panel, no error details). The part is rendered again
// after RETRY_MS, and immediately when its content changes (resetKey), so a fix in the admin
// reaches the TV without a reload. One retry per minute at most: never a tight loop.
const RETRY_MS = 60_000

type Props = { name: string; resetKey?: string; fallback?: ReactNode; children: ReactNode }
type State = { failed: boolean }

export default class PanelBoundary extends Component<Props, State> {
  state: State = { failed: false }
  private timer: number | undefined

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(`[tv] ${this.props.name} failed to render`, error)
  }

  // The retry is scheduled from the lifecycle (not componentDidCatch) so a remount, e.g. React
  // StrictMode in development, schedules it again instead of losing it.
  componentDidMount() {
    this.scheduleRetry()
  }

  componentDidUpdate(prevProps: Props, prevState: State) {
    if (this.state.failed && prevProps.resetKey !== this.props.resetKey) {
      window.clearTimeout(this.timer)
      this.setState({ failed: false })
    } else if (this.state.failed && !prevState.failed) {
      this.scheduleRetry()
    }
  }

  componentWillUnmount() {
    window.clearTimeout(this.timer)
  }

  private scheduleRetry() {
    if (!this.state.failed) return
    window.clearTimeout(this.timer)
    this.timer = window.setTimeout(() => this.setState({ failed: false }), RETRY_MS)
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? <div className="w-full h-full" style={{ background: 'var(--tv-panel, #172c48)' }} />
    return this.props.children
  }
}
