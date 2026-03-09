import React from 'react';

const AUTH_STORAGE_KEY = 'rei_do_abs_auth';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  appKey: number;
}

/**
 * Captura erros não tratados e mostra tela de recuperação.
 * "Voltar ao login" limpa a sessão e remonta o app (sem reload).
 */
export class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, appKey: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[AppErrorBoundary]', error, errorInfo);
  }

  handleBackToLogin = () => {
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (_) {}
    this.setState((s) => ({ ...s, hasError: false, error: null, appKey: s.appKey + 1 }));
  };

  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message ?? '';
      const shortMsg = msg.length > 200 ? msg.slice(0, 200) + '…' : msg;
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white p-6">
          <div className="max-w-sm w-full text-center space-y-6">
            <p className="text-zinc-400 text-sm">
              Algo deu errado ao carregar o app.
            </p>
            {shortMsg && (
              <pre className="text-left text-xs text-red-400 bg-zinc-900 p-3 rounded-lg overflow-auto max-h-24 w-full">
                {shortMsg}
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
    return <React.Fragment key={this.state.appKey}>{this.props.children}</React.Fragment>;
  }
}
