/**
 * ErrorBoundary
 *
 * React class-based error boundary that catches rendering errors
 * in subtrees and shows a graceful fallback UI with retry.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomeComponent />
 *   </ErrorBoundary>
 *
 *   // With custom fallback:
 *   <ErrorBoundary fallback={<CustomError />}>
 *
 *   // Page-level boundary with context label:
 *   <ErrorBoundary context="Deals List">
 */

'use client';

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { observe } from '@/lib/observability';

interface Props {
  children: ReactNode;
  /** Custom fallback UI — overrides the default error card */
  fallback?: ReactNode;
  /** Label for observability context (e.g. "Deals Kanban") */
  context?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    observe.error(error, {
      context:        this.props.context ?? 'Unknown',
      componentStack: info.componentStack ?? '',
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] p-8 rounded-xl border border-rose-200 bg-rose-50 text-center gap-4">
        <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center">
          <AlertTriangle size={22} className="text-rose-600" />
        </div>

        <div>
          <p className="text-[15px] font-semibold text-rose-900 mb-1">
            {this.props.context ? `${this.props.context} failed to load` : 'Something went wrong'}
          </p>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <p className="text-xs text-rose-600 font-mono max-w-sm">
              {this.state.error.message}
            </p>
          )}
        </div>

        <button
          onClick={this.handleRetry}
          className="inline-flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors"
        >
          <RefreshCw size={14} />
          Try again
        </button>
      </div>
    );
  }
}
