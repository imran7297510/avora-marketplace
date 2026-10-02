import * as React from 'react';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';
import { ArenaButton } from '../ArenaButton';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ArenaErrorBoundary extends (React.Component as any) {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ARENA ERROR] Uncaught Tactical Failure:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-[400px] flex items-center justify-center p-8 bg-stone-950 border border-rose-500/20 rounded-[2.5rem] text-center">
          <div className="max-w-md space-y-6">
            <div className="w-20 h-20 bg-rose-500/10 rounded-3xl flex items-center justify-center mx-auto">
              <AlertTriangle className="w-10 h-10 text-rose-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter">Combat System Failure</h2>
              <p className="text-stone-400 text-xs font-black uppercase tracking-widest leading-relaxed">
                A critical breach in the tactical data stream has occurred. The system must be recalibrated.
              </p>
              {this.state.error && (
                <p className="text-xs font-mono text-stone-700 mt-4 break-all">
                  ERROR_CODE: {this.state.error.message}
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <ArenaButton variant="primary" onClick={this.handleReset} className="w-full sm:w-auto gap-2">
                <RefreshCcw className="w-4 h-4" /> Re-Initialize
              </ArenaButton>
              <ArenaButton variant="outline" onClick={() => window.location.href = '/battle-bids'} className="w-full sm:w-auto gap-2">
                <Home className="w-4 h-4" /> Exit to Base
              </ArenaButton>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
