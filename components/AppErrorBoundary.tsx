import React from 'react';

const AUTH_STORAGE_KEY = 'rei_do_abs_auth';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Captura erros não tratados (ex.: após login ou logout) e mostra uma tela
 * de recuperação em vez de tela preta.
 */
export class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[AppErrorBoundary]', error, errorInfo);
  }

  handleBackToLogin = () => {
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (_) {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white p-6">
          <div className="max-w-sm w-full text-center space-y-6">
            <p className="text-zinc-400 text-sm">
              Algo deu errado ao carregar o app.
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <pre className="text-left text-xs text-red-400 bg-zinc-900 p-3 rounded-lg overflow-auto max-h-32">
                {this.state.error.message}
              </pre>
            )}
            <button
              type="button"
              onClick={this.handleBackToLogin}
              className="w-full py-3.5 rounded-xl bg-[#F5D00B] text-black font-semibold text-[15px] uppercase tracking-wider"
            >
              Voltar ao login
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
