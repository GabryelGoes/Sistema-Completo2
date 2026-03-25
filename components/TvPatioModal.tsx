import React, { useState, useEffect } from 'react';
import { X, Loader2, Monitor, Trash2, Plus, Lock } from 'lucide-react';
import type { TvSlide, TvSlideType } from '../services/apiService';
import {
  getTvManage,
  putTvWeeklyGoal,
  createTvSlide,
  deleteTvSlide,
  updateTvSlide,
} from '../services/apiService';

const SLIDE_TYPES: { value: TvSlideType; label: string }[] = [
  { value: 'notice', label: 'Aviso / texto' },
  { value: 'alert', label: 'Alerta' },
  { value: 'image', label: 'Imagem (URL)' },
  { value: 'video', label: 'Vídeo (URL)' },
  { value: 'goal', label: 'Meta (valores)' },
];

interface TvPatioModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TvPatioModal: React.FC<TvPatioModalProps> = ({ isOpen, onClose }) => {
  const [adminPassword, setAdminPassword] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slides, setSlides] = useState<TvSlide[]>([]);
  const [weeklyLabel, setWeeklyLabel] = useState('Meta semanal');
  const [weeklyCurrent, setWeeklyCurrent] = useState(0);
  const [weeklyTarget, setWeeklyTarget] = useState(0);

  const [newType, setNewType] = useState<TvSlideType>('notice');
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newMediaUrl, setNewMediaUrl] = useState('');
  const [newDuration, setNewDuration] = useState(10);
  const [newGoalCurrent, setNewGoalCurrent] = useState(0);
  const [newGoalTarget, setNewGoalTarget] = useState(100000);
  const [newGoalLabel, setNewGoalLabel] = useState('Meta');

  const load = async (pwd: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTvManage(pwd);
      setSlides(data.slides);
      if (data.weeklyGoal) {
        setWeeklyLabel(data.weeklyGoal.label);
        setWeeklyCurrent(data.weeklyGoal.currentAmount);
        setWeeklyTarget(data.weeklyGoal.targetAmount);
      }
      setUnlocked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar.');
      setUnlocked(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setUnlocked(false);
      setAdminPassword('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    void load(adminPassword);
  };

  const saveWeekly = async () => {
    setLoading(true);
    setError(null);
    try {
      await putTvWeeklyGoal(adminPassword, {
        label: weeklyLabel,
        currentAmount: weeklyCurrent,
        targetAmount: weeklyTarget,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  };

  const addSlide = async () => {
    setLoading(true);
    setError(null);
    try {
      await createTvSlide(adminPassword, {
        slideType: newType,
        title: newTitle,
        body: newBody,
        mediaUrl: newMediaUrl.trim() || null,
        durationSeconds: Math.min(300, Math.max(3, newDuration)),
        sortOrder: slides.length,
        isActive: true,
        goalCurrent: newType === 'goal' ? newGoalCurrent : null,
        goalTarget: newType === 'goal' ? newGoalTarget : null,
        goalLabel: newType === 'goal' ? newGoalLabel : null,
      });
      setNewTitle('');
      setNewBody('');
      setNewMediaUrl('');
      await load(adminPassword);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  };

  const removeSlide = async (id: string) => {
    if (!confirm('Excluir este slide da TV?')) return;
    setLoading(true);
    try {
      await deleteTvSlide(adminPassword, id);
      await load(adminPassword);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (s: TvSlide) => {
    try {
      await updateTvSlide(adminPassword, s.id, { isActive: !s.isActive });
      await load(adminPassword);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4">
      <div className="bg-light-elevated/98 dark:bg-[#1C1C1E]/95 border border-light-border dark:border-white/[0.08] rounded-[1.5rem] w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-light-border dark:border-white/[0.08] shrink-0">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <Monitor className="w-5 h-5 text-brand-yellow" />
            Conteúdo da TV do pátio
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-zinc-200/80 dark:bg-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {!unlocked ? (
            <form onSubmit={handleUnlock} className="space-y-4">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Informe a senha de administrador (Gerência) para gerenciar slides e meta exibidos na TV.
              </p>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
                    placeholder="Senha"
                    autoComplete="current-password"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !adminPassword.trim()}
                  className="px-5 py-3 rounded-xl bg-brand-yellow text-black font-semibold disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entrar'}
                </button>
              </div>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </form>
          ) : (
            <>
              <section className="rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4 space-y-3">
                <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wide">
                  Meta semanal (barra no topo da TV)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="block">
                    <span className="text-xs text-zinc-500">Rótulo</span>
                    <input
                      value={weeklyLabel}
                      onChange={(e) => setWeeklyLabel(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-zinc-500">Atual (R$)</span>
                    <input
                      type="number"
                      value={weeklyCurrent}
                      onChange={(e) => setWeeklyCurrent(Number(e.target.value))}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-zinc-500">Meta (R$)</span>
                    <input
                      type="number"
                      value={weeklyTarget}
                      onChange={(e) => setWeeklyTarget(Number(e.target.value))}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => void saveWeekly()}
                  disabled={loading}
                  className="text-sm font-semibold text-brand-yellow hover:underline"
                >
                  Salvar meta
                </button>
              </section>

              <section className="rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4 space-y-3">
                <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wide">
                  Novo slide na rotação
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <label className="col-span-2">
                    <span className="text-xs text-zinc-500">Tipo</span>
                    <select
                      value={newType}
                      onChange={(e) => setNewType(e.target.value as TvSlideType)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm"
                    >
                      {SLIDE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="col-span-2">
                    <span className="text-xs text-zinc-500">Título</span>
                    <input
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm"
                    />
                  </label>
                  {(newType === 'notice' || newType === 'alert') && (
                    <label className="col-span-2">
                      <span className="text-xs text-zinc-500">Texto</span>
                      <textarea
                        value={newBody}
                        onChange={(e) => setNewBody(e.target.value)}
                        rows={3}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm"
                      />
                    </label>
                  )}
                  {(newType === 'image' || newType === 'video') && (
                    <label className="col-span-2">
                      <span className="text-xs text-zinc-500">URL da mídia (https://...)</span>
                      <input
                        value={newMediaUrl}
                        onChange={(e) => setNewMediaUrl(e.target.value)}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm"
                      />
                    </label>
                  )}
                  {newType === 'goal' && (
                    <>
                      <label>
                        <span className="text-xs text-zinc-500">Rótulo</span>
                        <input
                          value={newGoalLabel}
                          onChange={(e) => setNewGoalLabel(e.target.value)}
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm"
                        />
                      </label>
                      <label>
                        <span className="text-xs text-zinc-500">Atual</span>
                        <input
                          type="number"
                          value={newGoalCurrent}
                          onChange={(e) => setNewGoalCurrent(Number(e.target.value))}
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm"
                        />
                      </label>
                      <label className="col-span-2">
                        <span className="text-xs text-zinc-500">Meta</span>
                        <input
                          type="number"
                          value={newGoalTarget}
                          onChange={(e) => setNewGoalTarget(Number(e.target.value))}
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm"
                        />
                      </label>
                    </>
                  )}
                  <label>
                    <span className="text-xs text-zinc-500">Duração na TV (s)</span>
                    <input
                      type="number"
                      min={3}
                      max={300}
                      value={newDuration}
                      onChange={(e) => setNewDuration(Number(e.target.value))}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => void addSlide()}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-yellow text-black font-semibold text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar slide
                </button>
              </section>

              <section>
                <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wide mb-2">
                  Slides ({slides.length})
                </h3>
                <ul className="space-y-2">
                  {slides.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-start justify-between gap-2 p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700"
                    >
                      <div className="min-w-0">
                        <span className="text-xs font-mono text-zinc-500">{s.slideType}</span>
                        <p className="font-medium text-zinc-900 dark:text-white truncate">{s.title || '(sem título)'}</p>
                        <p className="text-xs text-zinc-500">
                          {s.durationSeconds}s · {s.isActive === false ? 'inativo' : 'ativo'}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => void toggleActive(s)}
                          className="text-xs px-2 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-700"
                        >
                          {s.isActive === false ? 'Ativar' : 'Desativar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeSlide(s.id)}
                          className="p-2 rounded-lg text-red-600 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                {slides.length === 0 && (
                  <p className="text-sm text-zinc-500">Nenhum slide. A TV mostrará só os veículos.</p>
                )}
              </section>

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
