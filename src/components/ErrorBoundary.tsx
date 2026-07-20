import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
          <div className="h-12 w-12 rounded-xl bg-red-500/10 flex items-center justify-center text-2xl">
            ⚠️
          </div>
          <h2 className="text-lg font-semibold text-zinc-100">Une erreur est survenue</h2>
          <p className="text-sm text-zinc-400 text-center max-w-md">
            {this.state.error?.message || 'Erreur inconnue'}
          </p>
          <button
            onClick={this.handleReset}
            className="rounded-lg bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors"
          >
            Réessayer
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
