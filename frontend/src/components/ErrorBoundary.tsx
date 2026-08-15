import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportClientError } from "../monitoring";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError(new Error(`${error.message} · ${info.componentStack || "component tree unavailable"}`), "react-boundary");
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main id="main-content" className="state-page" role="alert">
        <span className="brand-mark" aria-hidden="true">S</span>
        <h1>Something went wrong</h1>
        <p>Your information is still safe. Reload the app, or return home and try again.</p>
        <div className="card-actions">
          <button className="button button-primary" onClick={() => window.location.reload()}>Reload app</button>
          <a className="button button-secondary" href="/">Return home</a>
        </div>
      </main>
    );
  }
}
