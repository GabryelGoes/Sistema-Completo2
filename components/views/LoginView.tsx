import React, { useState } from 'react';
import { Lock, User, Loader2 } from 'lucide-react';
import { login, type AuthSession } from '../../services/apiService';

const AUTH_STORAGE_KEY = 'rei_do_abs_auth';

export function getStoredAuth(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.role === 'admin' || data?.role === 'user') return data as AuthSession;
    return null;
  } catch {
    return null;
  }
}

export function setStoredAuth(session: AuthSession): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredAuth(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

interface LoginViewProps {
  onLogin: (session: AuthSession) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim()) {
      setError('Informe o usuário.');
      return;
    }
    setLoading(true);
    try {
      const session = await login(username.trim(), password);
      setStoredAuth(session);
      onLogin(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Usuário ou senha incorretos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-black">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-black" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/3 w-[800px] h-[500px] bg-brand-yellow/10 rounded-full blur-[120px]" />
        <div className="absolute -bottom-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-brand-yellow/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-12 safe-area-pb">
        <div className="w-full max-w-[380px]">
          <div
            className="relative rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl overflow-hidden"
            style={{ boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1) inset' }}
          >
            <div className="p-8 sm:p-10">
              <div className="flex justify-center mb-8">
                <div className="w-16 h-16 rounded-full bg-zinc-900 border-2 border-white/90 flex items-center justify-center overflow-hidden shadow-lg shrink-0">
                  <img src="/logo.png" alt="Rei do ABS" className="w-full h-full object-cover" />
                </div>
              </div>

              <h1 className="text-center text-xl font-semibold text-white tracking-tight mb-1">
                Rei do ABS
              </h1>
              <p className="text-center text-sm text-white/60 mb-6">
                Entre com seu usuário e senha
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/50">
                    <User className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Usuário"
                    className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white/[0.08] border border-white/20 text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-yellow/50 focus:border-brand-yellow/50 text-[16px]"
                  />
                </div>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/50">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Senha"
                    className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white/[0.08] border border-white/20 text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-yellow/50 focus:border-brand-yellow/50 text-[16px]"
                  />
                </div>
                {error && (
                  <p className="text-[13px] text-red-400">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={loading || !username.trim()}
                  className="w-full py-3.5 rounded-xl bg-brand-yellow hover:bg-[#fcd61e] disabled:opacity-50 disabled:pointer-events-none text-black font-semibold text-[15px] uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-brand-yellow/20 hover:shadow-xl"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entrar'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
