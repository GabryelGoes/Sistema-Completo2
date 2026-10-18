import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Lock, User, Loader2 } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="relative h-full min-h-0 overflow-hidden bg-[#0e0e0f]">
      {/* Fundo split: painel escuro + carro (igual ao layout anexado) */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <img
          src="/login-bg.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        {/* Mobile: escurece o herói para o card legível */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/70 md:hidden" />
      </div>

      {/* Frase à esquerda (desktop) */}
      <div className="pointer-events-none absolute left-[4.5%] top-[42%] z-10 hidden max-w-[260px] -translate-y-1/2 lg:block xl:left-[6%] xl:max-w-[300px]">
        <p className="font-display text-[22px] font-semibold leading-[1.25] tracking-tight text-white xl:text-[26px]">
          Qualidade, tecnologia e confiança em um só lugar.
        </p>
        <div className="mt-5 h-[3px] w-14 rounded-full bg-[#F5C518]" />
      </div>

      <div className="relative z-20 flex h-full min-h-0 flex-col items-center justify-center overflow-y-auto overscroll-none px-5 py-10 safe-area-pb sm:px-6">
        <div className="w-full max-w-[400px]">
          <div
            className="overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#161616]/[0.94] shadow-[0_28px_80px_-20px_rgba(0,0,0,0.75)] backdrop-blur-md"
          >
            <div className="px-8 pb-8 pt-9 sm:px-10 sm:pb-9 sm:pt-10">
              <div className="mb-5 flex flex-col items-center">
                <img
                  src="/logo.png"
                  alt="Rei do ABS"
                  className="h-[88px] w-[88px] object-contain sm:h-[96px] sm:w-[96px]"
                />
                <h1 className="mt-3 font-display text-[28px] font-bold leading-none tracking-tight text-white sm:text-[30px]">
                  Rei do ABS
                </h1>
                <p className="mt-2 text-center text-[14px] font-medium text-zinc-400">
                  Sistema de gestão da oficina
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div className="relative">
                  <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
                    <User className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  </div>
                  <input
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Usuário"
                    className="h-12 w-full rounded-xl border border-white/[0.1] bg-[#0c0c0c] py-0 pl-11 pr-4 text-[15px] text-white placeholder:text-zinc-500 outline-none transition-[border-color,box-shadow] focus:border-[#F5C518]/55 focus:ring-2 focus:ring-[#F5C518]/20"
                  />
                </div>

                <div className="relative">
                  <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
                    <Lock className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Senha"
                    className="h-12 w-full rounded-xl border border-white/[0.1] bg-[#0c0c0c] py-0 pl-11 pr-12 text-[15px] text-white placeholder:text-zinc-500 outline-none transition-[border-color,box-shadow] focus:border-[#F5C518]/55 focus:ring-2 focus:ring-[#F5C518]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:text-zinc-300"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    ) : (
                      <Eye className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    )}
                  </button>
                </div>

                {error && <p className="text-[13px] text-red-400">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="relative mt-1 flex h-12 w-full items-center justify-center rounded-2xl bg-[#F5C518] text-[15px] font-bold uppercase tracking-[0.08em] text-black shadow-[0_12px_32px_-10px_rgba(245,197,24,0.75)] transition-[filter,transform] hover:brightness-[1.03] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-70"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <span>Entrar</span>
                      <ArrowRight
                        className="absolute right-4 h-[18px] w-[18px]"
                        strokeWidth={2.25}
                        aria-hidden
                      />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 flex items-center gap-3" aria-hidden>
                <div className="h-px flex-1 bg-white/[0.1]" />
                <span className="text-[12px] font-medium lowercase text-zinc-500">ou</span>
                <div className="h-px flex-1 bg-white/[0.1]" />
              </div>
            </div>
          </div>

          {/* Frase mobile (abaixo do card) */}
          <p className="mt-8 px-2 text-center text-[15px] font-medium leading-snug text-white/85 lg:hidden">
            Qualidade, tecnologia e confiança em um só lugar.
          </p>
          <div className="mx-auto mt-3 h-[3px] w-12 rounded-full bg-[#F5C518] lg:hidden" />
        </div>
      </div>
    </div>
  );
};
