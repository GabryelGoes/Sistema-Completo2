import React, { useState, useEffect, useRef } from 'react';
import { Shield, ChevronLeft, Loader2, Lock, User, ChevronDown } from 'lucide-react';
import { PatioCarIcon } from '../ui/PatioCarIcon';
import {
  loginAdmin,
  loginPatio,
  getWorkshopTechnicians,
  getWorkshopSettings,
  type WorkshopTechnician,
  type AuthSession,
} from '../../services/apiService';

const AUTH_STORAGE_KEY = 'rei_do_abs_auth';

export function getStoredAuth(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.role === 'admin' || data?.role === 'patio') return data as AuthSession;
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

type Step = 'choose' | 'admin' | 'patio';

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [step, setStep] = useState<Step>('choose');
  const [adminPassword, setAdminPassword] = useState('');
  const [patioSlug, setPatioSlug] = useState('');
  const [patioPin, setPatioPin] = useState('');
  const [technicians, setTechnicians] = useState<WorkshopTechnician[]>([]);
  const [technicianDropdownOpen, setTechnicianDropdownOpen] = useState(false);
  const technicianDropdownRef = useRef<HTMLDivElement>(null);
  const [patioEnabled, setPatioEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWorkshopTechnicians().then(setTechnicians).catch(() => setTechnicians([]));
    getWorkshopSettings().then((s) => setPatioEnabled(s.patioLoginEnabled)).catch(() => setPatioEnabled(true));
  }, []);

  useEffect(() => {
    if (!technicianDropdownOpen) return;
    const close = (e: MouseEvent | TouchEvent) => {
      const el = technicianDropdownRef.current;
      if (el && !el.contains(e.target as Node)) setTechnicianDropdownOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close, { passive: true });
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [technicianDropdownOpen]);

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginAdmin(adminPassword);
      setStoredAuth({ role: 'admin' });
      onLogin({ role: 'admin' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Senha incorreta.');
    } finally {
      setLoading(false);
    }
  };

  const handlePatioSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!patioSlug.trim()) {
      setError('Selecione o mecânico.');
      return;
    }
    setLoading(true);
    try {
      const res = await loginPatio(patioSlug.trim(), patioPin);
      setStoredAuth({
        role: 'patio',
        technicianId: res.technician.id,
        technicianSlug: res.technician.slug,
        technicianName: res.technician.name,
      });
      onLogin({
        role: 'patio',
        technicianId: res.technician.id,
        technicianSlug: res.technician.slug,
        technicianName: res.technician.name,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login.');
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    setStep('choose');
    setError(null);
    setAdminPassword('');
    setPatioPin('');
  };

  return (
    <div className="min-h-screen flex flex-col bg-black">
      {/* Background — preto com leve brilho amarelo (tema do app) */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-black" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/3 w-[800px] h-[500px] bg-brand-yellow/10 rounded-full blur-[120px]" />
        <div className="absolute -bottom-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-brand-yellow/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center px-6 py-12 safe-area-pb">
        <div className="w-full max-w-[380px]">
          {/* Card glassmorphism — vidro fosco flutuante */}
          <div
            className="relative rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl overflow-hidden"
            style={{ boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1) inset' }}
          >
            <div className="p-8 sm:p-10">
              {/* Ícone/logo acima do formulário — círculo com borda */}
              <div className="flex justify-center mb-8">
                <div className="w-16 h-16 rounded-full bg-zinc-900 border-2 border-white/90 flex items-center justify-center overflow-hidden shadow-lg shrink-0">
                  {step === 'choose' ? (
                    <img
                      src="/logo.png"
                      alt="Rei do ABS"
                      className="w-full h-full object-cover"
                    />
                  ) : step === 'admin' ? (
                    <Shield className="w-8 h-8 text-white shrink-0" strokeWidth={2} />
                  ) : (
                    <User className="w-8 h-8 text-white shrink-0" strokeWidth={2} />
                  )}
                </div>
              </div>

              {step === 'choose' && (
                <div className="space-y-3">
                  <h1 className="text-center text-xl font-semibold text-white tracking-tight">
                    Rei do ABS
                  </h1>
                  <p className="text-center text-sm text-white/60 mt-1.5 mb-6">
                    Escolha uma opção abaixo para entrar
                  </p>
                  <button
                    type="button"
                    onClick={() => setStep('admin')}
                    className="w-full flex items-center gap-4 px-4 py-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/20 hover:border-brand-yellow/40 active:scale-[0.99] transition-all text-left"
                  >
                    <div className="w-10 h-10 rounded-lg bg-brand-yellow/20 flex items-center justify-center shrink-0">
                      <Shield className="w-5 h-5 text-brand-yellow" />
                    </div>
                    <span className="text-[16px] font-semibold text-white">Gerência</span>
                    <ChevronLeft className="w-5 h-5 text-white/50 ml-auto -scale-x-100 shrink-0" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep('patio')}
                    disabled={!patioEnabled}
                    className={`w-full flex items-center gap-4 px-4 py-4 rounded-xl border text-left transition-all ${
                      patioEnabled
                        ? 'bg-white/[0.08] hover:bg-white/[0.14] text-white border-white/20 hover:border-brand-yellow/40 active:scale-[0.99]'
                        : 'bg-white/[0.04] border-white/10 text-zinc-500 cursor-not-allowed opacity-70'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      patioEnabled ? 'bg-brand-yellow/20' : 'bg-zinc-500/20'
                    }`}>
                      <PatioCarIcon className={`w-5 h-5 ${patioEnabled ? 'text-brand-yellow' : 'text-zinc-500'}`} strokeWidth={2} />
                    </div>
                    <span className="text-[16px] font-semibold">Técnicos</span>
                    {patioEnabled && <ChevronLeft className="w-5 h-5 text-white/50 ml-auto -scale-x-100 shrink-0" />}
                  </button>
                </div>
              )}

              {step === 'admin' && (
                <>
                  <button
                    type="button"
                    onClick={goBack}
                    className="absolute top-6 left-6 flex items-center gap-1.5 text-[14px] text-white/70 hover:text-white transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                    Voltar
                  </button>
                  <h2 className="text-center text-lg font-semibold text-white mb-6">Gerência</h2>
                  <form onSubmit={handleAdminSubmit} className="space-y-4">
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/50">
                        <Lock className="w-5 h-5" />
                      </div>
                      <input
                        type="password"
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="Senha"
                        autoFocus
                        className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white/[0.08] border border-white/20 text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-yellow/50 focus:border-brand-yellow/50 text-[16px]"
                      />
                    </div>
                    {error && (
                      <p className="text-[13px] text-red-400">{error}</p>
                    )}
                    <button
                      type="submit"
                      disabled={loading || !adminPassword.trim()}
                      className="w-full py-3.5 rounded-xl bg-brand-yellow hover:bg-[#fcd61e] disabled:opacity-50 disabled:pointer-events-none text-black font-semibold text-[15px] uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-brand-yellow/20 hover:shadow-xl"
                    >
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entrar'}
                    </button>
                  </form>
                </>
              )}

              {step === 'patio' && (
                <>
                  <button
                    type="button"
                    onClick={goBack}
                    className="absolute top-6 left-6 flex items-center gap-1.5 text-[14px] text-white/70 hover:text-white transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                    Voltar
                  </button>
                  <h2 className="text-center text-lg font-semibold text-white mb-6">Técnicos</h2>
                  <form onSubmit={handlePatioSubmit} className="space-y-4">
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/50 z-10">
                        <User className="w-5 h-5" />
                      </div>
                      {technicians.length === 0 ? (
                        <div className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white/[0.08] border border-white/20 text-white/70 text-[15px]">
                          Nenhum técnico cadastrado. Entre como Gerência e cadastre em Configurações → Técnicos.
                        </div>
                      ) : (
                        <div ref={technicianDropdownRef} className="relative">
                          <button
                            type="button"
                            onClick={() => setTechnicianDropdownOpen((o) => !o)}
                            className="w-full pl-12 pr-12 py-3.5 rounded-xl bg-white/[0.08] border border-white/20 text-left text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-brand-yellow/50 focus:border-brand-yellow/50 text-[16px] flex items-center justify-between"
                          >
                            <span className={patioSlug ? '' : 'text-white/50'}>
                              {patioSlug ? technicians.find((t) => t.slug === patioSlug)?.name ?? 'Selecione o mecânico' : 'Selecione o mecânico'}
                            </span>
                            <ChevronDown className={`w-5 h-5 text-white/50 shrink-0 transition-transform ${technicianDropdownOpen ? 'rotate-180' : ''}`} />
                          </button>
                          {technicianDropdownOpen && (
                            <div className="absolute left-0 right-0 top-full mt-1 rounded-xl bg-zinc-900 border border-white/20 shadow-xl z-20 max-h-48 overflow-y-auto">
                              {technicians.map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => {
                                    setPatioSlug(t.slug);
                                    setTechnicianDropdownOpen(false);
                                  }}
                                  className={`w-full px-4 py-3.5 text-left text-[16px] transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-white/10 ${t.slug === patioSlug ? 'bg-brand-yellow/20 text-brand-yellow' : 'text-white'}`}
                                >
                                  {t.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/50">
                        <Lock className="w-5 h-5" />
                      </div>
                      <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="off"
                        value={patioPin}
                        onChange={(e) => setPatioPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                        placeholder="PIN"
                        className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white/[0.08] border border-white/20 text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-yellow/50 focus:border-brand-yellow/50 text-[16px]"
                      />
                    </div>
                    {error && (
                      <p className="text-[13px] text-red-400">{error}</p>
                    )}
                    <button
                      type="submit"
                      disabled={loading || !patioSlug.trim()}
                      className="w-full py-3.5 rounded-xl bg-brand-yellow hover:bg-[#fcd61e] disabled:opacity-50 disabled:pointer-events-none text-black font-semibold text-[15px] uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-brand-yellow/20 hover:shadow-xl"
                    >
                      {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entrar'}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
