import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Loader2,
  Monitor,
  Trash2,
  Plus,
  Lock,
  ImagePlus,
  Sparkles,
  ChevronRight,
  Eye,
  ListVideo,
} from 'lucide-react';
import type { TvSlide, TvSlideType } from '../services/apiService';
import {
  getTvManage,
  putTvWeeklyGoal,
  createTvSlide,
  deleteTvSlide,
  updateTvSlide,
  uploadTvPatioMedia,
} from '../services/apiService';
import { TvPatioPreview } from './TvPatioPreview';

const SLIDE_TYPES: { value: TvSlideType; label: string; hint: string }[] = [
  { value: 'notice', label: 'Aviso', hint: 'Texto em destaque' },
  { value: 'alert', label: 'Alerta', hint: 'Urgente, vermelho' },
  { value: 'image', label: 'Imagem', hint: 'Arquivo ou URL' },
  { value: 'video', label: 'Vídeo', hint: 'Arquivo ou URL / YouTube' },
  { value: 'goal', label: 'Meta', hint: 'Barra no slide' },
];

interface TvPatioModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TvPatioModal: React.FC<TvPatioModalProps> = ({ isOpen, onClose }) => {
  const [adminPassword, setAdminPassword] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
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

  const [previewTab, setPreviewTab] = useState<'draft' | 'library'>('draft');
  const [libraryPreviewId, setLibraryPreviewId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      if (data.slides.length > 0) {
        setLibraryPreviewId(data.slides[0].id);
      }
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
      setPreviewTab('draft');
    }
  }, [isOpen]);

  const draftSlide = useMemo((): TvSlide | null => {
    if (newType === 'goal') {
      return {
        id: 'draft',
        slideType: 'goal',
        title: newTitle,
        body: newBody,
        mediaUrl: null,
        durationSeconds: newDuration,
        sortOrder: 0,
        goalCurrent: newGoalCurrent,
        goalTarget: newGoalTarget,
        goalLabel: newGoalLabel,
      };
    }
    if (newType === 'notice' || newType === 'alert') {
      if (!newTitle.trim() && !newBody.trim()) return null;
      return {
        id: 'draft',
        slideType: newType,
        title: newTitle,
        body: newBody,
        mediaUrl: null,
        durationSeconds: newDuration,
        sortOrder: 0,
        goalCurrent: null,
        goalTarget: null,
        goalLabel: null,
      };
    }
    if ((newType === 'image' || newType === 'video') && !newMediaUrl.trim()) return null;
    return {
      id: 'draft',
      slideType: newType,
      title: newTitle,
      body: newBody,
      mediaUrl: newMediaUrl.trim() || null,
      durationSeconds: newDuration,
      sortOrder: 0,
      goalCurrent: null,
      goalTarget: null,
      goalLabel: null,
    };
  }, [newType, newTitle, newBody, newMediaUrl, newDuration, newGoalCurrent, newGoalTarget, newGoalLabel]);

  const librarySlide = useMemo(() => {
    if (!libraryPreviewId) return null;
    return slides.find((s) => s.id === libraryPreviewId) ?? null;
  }, [slides, libraryPreviewId]);

  const previewSlide = previewTab === 'draft' ? draftSlide : librarySlide;

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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !unlocked) return;
    setUploading(true);
    setError(null);
    try {
      const { url } = await uploadTvPatioMedia(adminPassword, file);
      setNewMediaUrl(url);
      if (file.type.startsWith('video/')) setNewType('video');
      else if (file.type.startsWith('image/')) setNewType('image');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no upload');
    } finally {
      setUploading(false);
    }
  };

  const iosCard =
    'rounded-[22px] border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-zinc-900/40 backdrop-blur-2xl shadow-[0_2px_24px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)]';

  const iosInput =
    'w-full rounded-2xl border border-zinc-200/90 dark:border-white/[0.08] bg-white/90 dark:bg-zinc-950/50 px-4 py-3 text-[15px] text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 focus:border-[#007AFF]/50 transition-shadow';

  const iosLabel = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-2';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6 bg-black/45 backdrop-blur-[20px]">
      <div
        className={`relative w-full max-w-[1080px] max-h-[94vh] flex flex-col lg:flex-row overflow-hidden rounded-[2rem] sm:rounded-[2.25rem] ${iosCard}`}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/5 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-black/10 dark:hover:bg-white/15 transition-colors"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Coluna principal */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto overscroll-contain">
          <div className="px-6 sm:px-8 pt-8 pb-6 lg:pr-12">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/90 to-blue-600 shadow-lg shadow-cyan-500/20">
                <Monitor className="w-6 h-6 text-white" strokeWidth={2.2} />
              </div>
              <div>
                <h2 className="text-[22px] sm:text-[26px] font-semibold tracking-tight text-zinc-900 dark:text-white leading-tight">
                  TV do pátio
                </h2>
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500/90" />
                  Conteúdo exibido entre as páginas de veículos
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 sm:px-8 pb-8 lg:pr-12 space-y-6 flex-1">
            {!unlocked ? (
              <form onSubmit={handleUnlock} className={`${iosCard} p-6 sm:p-8 space-y-5`}>
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-white/10">
                    <Lock className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
                  </div>
                  <div>
                    <p className="text-[15px] font-medium text-zinc-900 dark:text-white">Acesso de gerência</p>
                    <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                      Use a senha do usuário <span className="font-semibold text-zinc-700 dark:text-zinc-300">Gerência</span> para
                      editar slides e meta na TV.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className={`${iosInput} flex-1`}
                    placeholder="Senha"
                    autoComplete="current-password"
                  />
                  <button
                    type="submit"
                    disabled={loading || !adminPassword.trim()}
                    className="shrink-0 rounded-2xl bg-[#007AFF] px-8 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-blue-500/25 disabled:opacity-45 active:scale-[0.98] transition-transform"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Continuar'}
                  </button>
                </div>
                {error && <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>}
              </form>
            ) : (
              <>
                {/* Meta semanal */}
                <section className={`${iosCard} p-5 sm:p-6`}>
                  <p className={iosLabel}>Meta semanal · barra superior na TV</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-[12px] text-zinc-500 dark:text-zinc-400 mb-1.5 block">Rótulo</label>
                      <input
                        value={weeklyLabel}
                        onChange={(e) => setWeeklyLabel(e.target.value)}
                        className={iosInput}
                      />
                    </div>
                    <div>
                      <label className="text-[12px] text-zinc-500 dark:text-zinc-400 mb-1.5 block">Atual (R$)</label>
                      <input
                        type="number"
                        value={weeklyCurrent}
                        onChange={(e) => setWeeklyCurrent(Number(e.target.value))}
                        className={iosInput}
                      />
                    </div>
                    <div>
                      <label className="text-[12px] text-zinc-500 dark:text-zinc-400 mb-1.5 block">Meta (R$)</label>
                      <input
                        type="number"
                        value={weeklyTarget}
                        onChange={(e) => setWeeklyTarget(Number(e.target.value))}
                        className={iosInput}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveWeekly()}
                    disabled={loading}
                    className="mt-4 text-[14px] font-semibold text-[#007AFF] hover:opacity-80"
                  >
                    Salvar meta
                  </button>
                </section>

                {/* Novo slide */}
                <section className={`${iosCard} p-5 sm:p-6`}>
                  <p className={iosLabel}>Novo slide</p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
                    {SLIDE_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setNewType(t.value)}
                        className={`rounded-2xl px-2 py-3 text-center transition-all ${
                          newType === t.value
                            ? 'bg-[#007AFF] text-white shadow-md shadow-blue-500/30'
                            : 'bg-zinc-100/90 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/80 dark:hover:bg-white/10'
                        }`}
                      >
                        <span className="block text-[12px] font-semibold leading-tight">{t.label}</span>
                        <span
                          className={`block text-[9px] mt-1 leading-tight ${
                            newType === t.value ? 'text-white/80' : 'text-zinc-500'
                          }`}
                        >
                          {t.hint}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className={iosLabel}>Título</label>
                      <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className={iosInput} placeholder="Ex.: Promoção do mês" />
                    </div>

                    {(newType === 'notice' || newType === 'alert') && (
                      <div>
                        <label className={iosLabel}>Texto</label>
                        <textarea
                          value={newBody}
                          onChange={(e) => setNewBody(e.target.value)}
                          rows={3}
                          className={`${iosInput} resize-none min-h-[100px]`}
                          placeholder="Mensagem exibida em tela cheia na TV..."
                        />
                      </div>
                    )}

                    {(newType === 'image' || newType === 'video') && (
                      <div className="space-y-3">
                        <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileChange} />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-300/90 dark:border-white/15 bg-zinc-50/80 dark:bg-white/[0.03] py-8 text-[15px] font-medium text-zinc-600 dark:text-zinc-300 hover:border-[#007AFF]/50 hover:bg-blue-50/50 dark:hover:bg-blue-500/10 transition-colors disabled:opacity-50"
                        >
                          {uploading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <ImagePlus className="w-5 h-5 text-[#007AFF]" />
                          )}
                          {uploading ? 'Enviando…' : 'Toque para escolher imagem ou vídeo'}
                        </button>
                        <div>
                          <label className={iosLabel}>Ou cole uma URL (YouTube, link direto)</label>
                          <input
                            value={newMediaUrl}
                            onChange={(e) => setNewMediaUrl(e.target.value)}
                            className={iosInput}
                            placeholder="https://..."
                          />
                        </div>
                      </div>
                    )}

                    {newType === 'goal' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className={iosLabel}>Rótulo</label>
                          <input value={newGoalLabel} onChange={(e) => setNewGoalLabel(e.target.value)} className={iosInput} />
                        </div>
                        <div>
                          <label className={iosLabel}>Atual</label>
                          <input type="number" value={newGoalCurrent} onChange={(e) => setNewGoalCurrent(Number(e.target.value))} className={iosInput} />
                        </div>
                        <div>
                          <label className={iosLabel}>Meta</label>
                          <input type="number" value={newGoalTarget} onChange={(e) => setNewGoalTarget(Number(e.target.value))} className={iosInput} />
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                      <div className="w-full sm:w-40">
                        <label className={iosLabel}>Duração (s)</label>
                        <input
                          type="number"
                          min={3}
                          max={300}
                          value={newDuration}
                          onChange={(e) => setNewDuration(Number(e.target.value))}
                          className={iosInput}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void addSlide()}
                        disabled={loading}
                        className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-zinc-900 dark:bg-white py-3.5 px-6 text-[15px] font-semibold text-white dark:text-zinc-900 shadow-lg active:scale-[0.99] transition-transform disabled:opacity-50"
                      >
                        <Plus className="w-5 h-5" />
                        Adicionar à rotação
                        <ChevronRight className="w-4 h-4 opacity-60" />
                      </button>
                    </div>
                  </div>
                </section>

                {/* Lista */}
                <section className={`${iosCard} p-5 sm:p-6`}>
                  <p className={iosLabel}>Slides na fila ({slides.length})</p>
                  <ul className="space-y-2">
                    {slides.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setLibraryPreviewId(s.id);
                            setPreviewTab('library');
                          }}
                          className={`flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${
                            libraryPreviewId === s.id && previewTab === 'library'
                              ? 'bg-[#007AFF]/12 ring-1 ring-[#007AFF]/30'
                              : 'bg-zinc-50/90 dark:bg-white/[0.04] hover:bg-zinc-100/90 dark:hover:bg-white/[0.07]'
                          }`}
                        >
                          <div className="min-w-0">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{s.slideType}</span>
                            <p className="font-medium text-zinc-900 dark:text-white truncate text-[15px]">{s.title || '(sem título)'}</p>
                            <p className="text-[11px] text-zinc-500">
                              {s.durationSeconds}s · {s.isActive === false ? 'pausado' : 'ativo'}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void toggleActive(s);
                              }}
                              className="rounded-xl bg-zinc-200/80 dark:bg-white/10 px-3 py-2 text-[11px] font-semibold text-zinc-800 dark:text-zinc-200"
                            >
                              {s.isActive === false ? 'Ativar' : 'Pausar'}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void removeSlide(s.id);
                              }}
                              className="rounded-xl p-2 text-red-600 hover:bg-red-500/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {slides.length === 0 && (
                    <p className="text-[13px] text-zinc-500 dark:text-zinc-400 py-4 text-center">Nenhum slide — a TV mostra só os veículos.</p>
                  )}
                </section>

                {error && <p className="text-[13px] text-red-600 dark:text-red-400 px-1">{error}</p>}
              </>
            )}
          </div>
        </div>

        {/* Preview — coluna fixa estilo iOS */}
        {unlocked && (
          <div className="lg:w-[min(420px,100%)] shrink-0 border-t lg:border-t-0 lg:border-l border-zinc-200/60 dark:border-white/[0.06] bg-gradient-to-b from-zinc-100/90 via-white/95 to-zinc-50/90 dark:from-zinc-950/95 dark:via-zinc-900/90 dark:to-black/80 px-5 py-8 lg:py-10 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <Eye className="w-4 h-4 text-[#007AFF]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Preview ao vivo</span>
            </div>

            <div className="flex rounded-2xl bg-zinc-200/60 dark:bg-white/[0.06] p-1 mb-5">
              <button
                type="button"
                onClick={() => setPreviewTab('draft')}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-semibold transition-all ${
                  previewTab === 'draft' ? 'bg-white dark:bg-zinc-800 shadow-md text-zinc-900 dark:text-white' : 'text-zinc-500'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Rascunho
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab('library')}
                disabled={slides.length === 0}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-semibold transition-all disabled:opacity-35 ${
                  previewTab === 'library' ? 'bg-white dark:bg-zinc-800 shadow-md text-zinc-900 dark:text-white' : 'text-zinc-500'
                }`}
              >
                <ListVideo className="w-3.5 h-3.5" />
                Na fila
              </button>
            </div>

            {previewTab === 'library' && slides.length > 0 && (
              <select
                value={libraryPreviewId ?? ''}
                onChange={(e) => setLibraryPreviewId(e.target.value || null)}
                className={`${iosInput} mb-4 text-[13px]`}
              >
                {slides.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title || s.slideType} ({s.isActive === false ? 'pausado' : 'ativo'})
                  </option>
                ))}
              </select>
            )}

            <div className="flex-1 flex flex-col justify-center min-h-[200px]">
              <TvPatioPreview
                weeklyLabel={weeklyLabel}
                weeklyCurrent={weeklyCurrent}
                weeklyTarget={weeklyTarget}
                slide={previewSlide}
                showVehiclesPlaceholder={previewTab === 'draft' && !draftSlide}
              />
            </div>

            <p className="mt-5 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400 text-center px-1">
              O preview simula o painel da TV. Imagens e vídeos enviados ficam no Storage da oficina.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
