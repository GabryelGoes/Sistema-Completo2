import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Loader2,
  Trash2,
  Plus,
  ImagePlus,
  Sparkles,
  ChevronRight,
  Eye,
  ListVideo,
  Pencil,
  ChevronUp,
  ChevronDown,
  Save,
  Pin,
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
import { ModalPortal } from './ui/ModalPortal';
import { IosAccentIconSquircle } from './ui/IosAccentIconSquircle';

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
  const [dataReady, setDataReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slides, setSlides] = useState<TvSlide[]>([]);
  const [weeklyLabel, setWeeklyLabel] = useState('Meta semanal');
  /** Texto livre evita "0" colado ao digitar em input type=number. */
  const [weeklyCurrentStr, setWeeklyCurrentStr] = useState('');
  const [weeklyTargetStr, setWeeklyTargetStr] = useState('');
  const [showWeeklyBar, setShowWeeklyBar] = useState(true);

  const [newType, setNewType] = useState<TvSlideType>('notice');
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newMediaUrl, setNewMediaUrl] = useState('');
  const [newDuration, setNewDuration] = useState(10);
  const [newGoalCurrent, setNewGoalCurrent] = useState(0);
  const [newGoalTarget, setNewGoalTarget] = useState(100000);
  const [newGoalLabel, setNewGoalLabel] = useState('Meta');
  const [newPlaySound, setNewPlaySound] = useState(false);
  const [newGoalShowValues, setNewGoalShowValues] = useState(false);

  const [previewTab, setPreviewTab] = useState<'draft' | 'library'>('draft');
  const [libraryPreviewId, setLibraryPreviewId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const [editingSlideId, setEditingSlideId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    slideType: TvSlideType;
    title: string;
    body: string;
    mediaUrl: string;
    durationSeconds: number;
    goalLabel: string;
    goalCurrent: number;
    goalTarget: number;
    playSound: boolean;
    goalShowValues: boolean;
  } | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTvManage();
      setSlides(data.slides);
      if (data.weeklyGoal) {
        setWeeklyLabel(data.weeklyGoal.label);
        setWeeklyCurrentStr(String(data.weeklyGoal.currentAmount ?? 0));
        setWeeklyTargetStr(String(data.weeklyGoal.targetAmount ?? 0));
        setShowWeeklyBar(data.weeklyGoal.showWeeklyBar !== false);
      }
      setDataReady(true);
      if (data.slides.length > 0) {
        setLibraryPreviewId(data.slides[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar.');
      setDataReady(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setDataReady(false);
      setError(null);
      setPreviewTab('draft');
      setEditingSlideId(null);
      setEditForm(null);
      return;
    }
    void load();
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
        playSound: newPlaySound,
        goalShowValues: newGoalShowValues,
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
        playSound: newPlaySound,
        goalShowValues: false,
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
      playSound: newPlaySound,
      goalShowValues: false,
    };
  }, [
    newType,
    newTitle,
    newBody,
    newMediaUrl,
    newDuration,
    newGoalCurrent,
    newGoalTarget,
    newGoalLabel,
    newPlaySound,
    newGoalShowValues,
  ]);

  const librarySlide = useMemo(() => {
    if (!libraryPreviewId) return null;
    return slides.find((s) => s.id === libraryPreviewId) ?? null;
  }, [slides, libraryPreviewId]);

  /** Preview “Na fila” reflete rascunho da edição enquanto o formulário está aberto. */
  const previewSlide = useMemo((): TvSlide | null => {
    if (previewTab === 'draft') return draftSlide;
    if (
      libraryPreviewId &&
      editingSlideId === libraryPreviewId &&
      editForm
    ) {
      const isGoal = editForm.slideType === 'goal';
      return {
        id: libraryPreviewId,
        slideType: editForm.slideType,
        title: editForm.title,
        body: editForm.body,
        mediaUrl: editForm.mediaUrl.trim() || null,
        durationSeconds: Math.min(300, Math.max(3, Number(editForm.durationSeconds) || 10)),
        sortOrder: 0,
        goalCurrent: isGoal ? editForm.goalCurrent : null,
        goalTarget: isGoal ? editForm.goalTarget : null,
        goalLabel: isGoal ? editForm.goalLabel : null,
        playSound: editForm.playSound,
        goalShowValues: isGoal ? editForm.goalShowValues : false,
      };
    }
    return librarySlide;
  }, [previewTab, draftSlide, librarySlide, libraryPreviewId, editingSlideId, editForm]);

  const weeklyCurrentNum = useMemo(() => {
    const d = weeklyCurrentStr.replace(/\D/g, '');
    if (d === '') return 0;
    return Number(d) || 0;
  }, [weeklyCurrentStr]);

  const weeklyTargetNum = useMemo(() => {
    const d = weeklyTargetStr.replace(/\D/g, '');
    if (d === '') return 0;
    return Number(d) || 0;
  }, [weeklyTargetStr]);

  /** No preview: barra só quando simula lista de veículos (não quando há slide em tela cheia). */
  const previewShowsWeeklyStrip = useMemo(
    () =>
      showWeeklyBar &&
      weeklyTargetNum > 0 &&
      !(
        (previewTab === 'draft' && draftSlide !== null) ||
        (previewTab === 'library' && librarySlide !== null)
      ),
    [showWeeklyBar, weeklyTargetNum, previewTab, draftSlide, librarySlide]
  );

  if (!isOpen) return null;

  const saveWeekly = async () => {
    setLoading(true);
    setError(null);
    try {
      await putTvWeeklyGoal({
        label: weeklyLabel,
        currentAmount: weeklyCurrentNum,
        targetAmount: weeklyTargetNum,
        showWeeklyBar,
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
      await createTvSlide({
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
        playSound: newPlaySound,
        goalShowValues: newType === 'goal' ? newGoalShowValues : false,
      });
      setNewTitle('');
      setNewBody('');
      setNewMediaUrl('');
      await load();
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
      await deleteTvSlide(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (s: TvSlide) => {
    try {
      await updateTvSlide(s.id, { isActive: !s.isActive });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    }
  };

  /** Fixa o slide na TV (sem rotação); só um por vez. Slide pausado não pode. */
  const togglePinImmediate = async (s: TvSlide) => {
    const currentlyPinned = s.pinImmediate === true;
    if (s.isActive === false && !currentlyPinned) return;
    setLoading(true);
    setError(null);
    try {
      await updateTvSlide(s.id, { pinImmediate: !currentlyPinned });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !dataReady) return;
    setUploading(true);
    setError(null);
    try {
      const { url } = await uploadTvPatioMedia(file);
      setNewMediaUrl(url);
      if (file.type.startsWith('video/')) setNewType('video');
      else if (file.type.startsWith('image/')) setNewType('image');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no upload');
    } finally {
      setUploading(false);
    }
  };

  const startEdit = (s: TvSlide) => {
    setEditingSlideId(s.id);
    setEditForm({
      slideType: s.slideType,
      title: s.title,
      body: s.body,
      mediaUrl: s.mediaUrl ?? '',
      durationSeconds: s.durationSeconds,
      goalLabel: s.goalLabel ?? '',
      goalCurrent: s.goalCurrent ?? 0,
      goalTarget: s.goalTarget ?? 0,
      playSound: s.playSound === true,
      goalShowValues: s.goalShowValues === true,
    });
    setLibraryPreviewId(s.id);
    setPreviewTab('library');
  };

  const cancelEdit = () => {
    setEditingSlideId(null);
    setEditForm(null);
  };

  const saveEdit = async () => {
    if (!editingSlideId || !editForm) return;
    setLoading(true);
    setError(null);
    try {
      const isGoal = editForm.slideType === 'goal';
      const patch: Partial<Omit<TvSlide, 'id'>> = {
        slideType: editForm.slideType,
        title: editForm.title,
        body: editForm.body,
        mediaUrl: editForm.mediaUrl.trim() ? editForm.mediaUrl.trim() : null,
        durationSeconds: Math.min(300, Math.max(3, Number(editForm.durationSeconds) || 10)),
      };
      if (isGoal) {
        patch.goalLabel = editForm.goalLabel.trim() || null;
        patch.goalCurrent = Number(editForm.goalCurrent) || 0;
        patch.goalTarget = Number(editForm.goalTarget) || 0;
        patch.goalShowValues = editForm.goalShowValues === true;
      } else {
        patch.goalCurrent = null;
        patch.goalTarget = null;
        patch.goalLabel = null;
        patch.goalShowValues = false;
      }
      patch.playSound = editForm.playSound === true;
      await updateTvSlide(editingSlideId, patch);
      setEditingSlideId(null);
      setEditForm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  };

  const moveSlide = async (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= slides.length) return;
    const a = slides[index];
    const b = slides[next];
    const orderA = a.sortOrder ?? index;
    const orderB = b.sortOrder ?? next;
    setLoading(true);
    setError(null);
    try {
      await updateTvSlide(a.id, { sortOrder: orderB });
      await updateTvSlide(b.id, { sortOrder: orderA });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  };

  const handleEditFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !dataReady) return;
    setUploading(true);
    setError(null);
    try {
      const { url } = await uploadTvPatioMedia(file);
      setEditForm((prev) => {
        if (!prev) return prev;
        const next = { ...prev, mediaUrl: url };
        if (file.type.startsWith('video/')) return { ...next, slideType: 'video' as TvSlideType };
        if (file.type.startsWith('image/')) return { ...next, slideType: 'image' as TvSlideType };
        return next;
      });
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
    <ModalPortal>
      <div className="fixed inset-0 z-[120] flex items-stretch justify-stretch bg-black/45 backdrop-blur-[20px]">
      <div
        className={`relative h-[100dvh] w-screen max-w-none flex flex-col lg:flex-row overflow-hidden ${iosCard} rounded-none border-0 shadow-none dark:shadow-none`}
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
              <IosAccentIconSquircle variant="modal" strokeWidth={2.2}>
                <img src="/icons/tv-patio-ios.png" alt="TV do Pátio" className="h-full w-full object-cover" />
              </IosAccentIconSquircle>
              <div>
                <h2 className="text-[22px] sm:text-[26px] font-semibold tracking-tight text-zinc-900 dark:text-white leading-tight">
                  TV do pátio
                </h2>
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-brand-yellow" />
                  Conteúdo exibido entre as páginas de veículos
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 sm:px-8 pb-8 lg:pr-12 space-y-6 flex-1">
            {!dataReady &&
              (error ? (
                <div className={`${iosCard} p-6 sm:p-8 space-y-4 text-center`}>
                  <p className="text-[14px] text-red-600 dark:text-red-400">{error}</p>
                  <button
                    type="button"
                    onClick={() => void load()}
                    className="rounded-2xl bg-[#007AFF] px-6 py-3 text-[15px] font-semibold text-white shadow-lg shadow-blue-500/25"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="w-10 h-10 animate-spin text-cyan-500" />
                  <p className="text-[14px] text-zinc-500 dark:text-zinc-400">Carregando configurações da TV…</p>
                </div>
              ))}
            {dataReady && (
              <>
                {/* Meta semanal */}
                <section className={`${iosCard} p-5 sm:p-6`}>
                  <p className={iosLabel}>Meta semanal · barra superior na TV</p>
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mb-3">
                    Na TV do pátio só aparece o <span className="font-semibold text-zinc-600 dark:text-zinc-300">rótulo</span> e a{' '}
                    <span className="font-semibold text-zinc-600 dark:text-zinc-300">porcentagem</span> do progresso (valores em R$ ficam só aqui). A barra{' '}
                    <span className="font-semibold text-zinc-600 dark:text-zinc-300">não aparece</span> durante os slides da playlist — só nas páginas de veículos.
                  </p>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 p-3 rounded-2xl bg-zinc-100/80 dark:bg-white/[0.04]">
                    <div>
                      <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">Exibir barra na TV</p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">Liga/desliga a faixa de meta (apenas nas páginas de veículos).</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showWeeklyBar}
                      onClick={() => setShowWeeklyBar((v) => !v)}
                      className={`relative h-8 w-[51px] shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40 ${
                        showWeeklyBar ? 'bg-[#34C759]' : 'bg-zinc-300 dark:bg-zinc-600'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 block h-7 w-7 rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${
                          showWeeklyBar ? 'translate-x-[22px]' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
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
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={weeklyCurrentStr}
                        onChange={(e) => {
                          const d = e.target.value.replace(/\D/g, '');
                          setWeeklyCurrentStr(d === '' ? '' : String(Number(d)));
                        }}
                        className={iosInput}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-[12px] text-zinc-500 dark:text-zinc-400 mb-1.5 block">Meta (R$)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={weeklyTargetStr}
                        onChange={(e) => {
                          const d = e.target.value.replace(/\D/g, '');
                          setWeeklyTargetStr(d === '' ? '' : String(Number(d)));
                        }}
                        className={iosInput}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveWeekly()}
                    disabled={loading}
                    className="mt-4 text-[14px] font-semibold text-[#007AFF] hover:opacity-80"
                  >
                    Salvar meta semanal
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

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-2xl bg-zinc-100/80 dark:bg-white/[0.04]">
                      <div>
                        <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">Som ao exibir este slide</p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                          Bip ao entrar neste slide na TV. Na TV o som do canto também precisa estar ligado.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={newPlaySound}
                        onClick={() => setNewPlaySound((v) => !v)}
                        className={`relative h-8 w-[51px] shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40 ${
                          newPlaySound ? 'bg-[#34C759]' : 'bg-zinc-300 dark:bg-zinc-600'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 block h-7 w-7 rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${
                            newPlaySound ? 'translate-x-[22px]' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                    {newType === 'goal' && (
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-2xl bg-zinc-100/80 dark:bg-white/[0.04]">
                        <div>
                          <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">Este slide meta: valores em R$</p>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                            Ligado mostra atual e meta em reais; desligado mostra só a porcentagem na TV.
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={newGoalShowValues}
                          onClick={() => setNewGoalShowValues((v) => !v)}
                          className={`relative h-8 w-[51px] shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40 ${
                            newGoalShowValues ? 'bg-[#34C759]' : 'bg-zinc-300 dark:bg-zinc-600'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 block h-7 w-7 rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${
                              newGoalShowValues ? 'translate-x-[22px]' : 'translate-x-0'
                            }`}
                          />
                        </button>
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
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mb-3">
                    Edite tipo, textos, mídia, duração e ordem. A chave{' '}
                    <span className="font-semibold text-zinc-600 dark:text-zinc-300">Exibir imediatamente</span> fixa o slide na TV
                    na hora, sem contagem de tempo da rotação, até você desligar (só um slide fixo por vez). Cada slide meta pode mostrar só % ou valores em R$.
                  </p>
                  <ul className="space-y-3">
                    {slides.map((s, idx) => (
                      <li key={s.id} className="space-y-2">
                        <div
                          className={`flex w-full flex-wrap items-stretch gap-2 rounded-2xl border px-3 py-2 transition-colors sm:flex-nowrap ${
                            s.pinImmediate
                              ? 'border-amber-400/50 bg-amber-50/50 dark:bg-amber-500/10 ring-1 ring-amber-400/35'
                              : libraryPreviewId === s.id && previewTab === 'library'
                                ? 'border-transparent bg-[#007AFF]/12 ring-1 ring-[#007AFF]/30'
                                : 'border-transparent bg-zinc-50/90 dark:bg-white/[0.04]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setLibraryPreviewId(s.id);
                              setPreviewTab('library');
                            }}
                            className="min-w-0 flex-1 text-left py-1"
                          >
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{s.slideType}</span>
                            <p className="font-medium text-zinc-900 dark:text-white truncate text-[15px]">{s.title || '(sem título)'}</p>
                            <p className="text-[11px] text-zinc-500">
                              {s.durationSeconds}s · ordem {s.sortOrder ?? idx} · {s.isActive === false ? 'pausado' : 'ativo'}
                            </p>
                          </button>
                          <div className="flex shrink-0 flex-wrap items-center gap-1.5 justify-end">
                            <div
                              className="flex flex-col items-center gap-0.5 mr-1 max-w-[76px]"
                              title={
                                s.isActive === false
                                  ? 'Reative o slide para usar Exibir imediatamente'
                                  : 'Ligado: a TV mostra só este slide, sem tempo da rotação, até desligar'
                              }
                            >
                              <Pin
                                className={`w-3.5 h-3.5 shrink-0 ${s.pinImmediate ? 'text-amber-500' : 'text-zinc-400'}`}
                                strokeWidth={2.2}
                              />
                              <button
                                type="button"
                                role="switch"
                                aria-label={
                                  s.pinImmediate
                                    ? 'Desligar exibir imediatamente na TV'
                                    : 'Exibir imediatamente na TV (fixar até desligar)'
                                }
                                aria-checked={s.pinImmediate === true}
                                disabled={loading || s.isActive === false}
                                onClick={() => void togglePinImmediate(s)}
                                className={`relative h-7 w-[44px] shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/40 disabled:opacity-35 ${
                                  s.pinImmediate ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-600'
                                }`}
                              >
                                <span
                                  className={`absolute top-0.5 left-0.5 block h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${
                                    s.pinImmediate ? 'translate-x-[18px]' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                              <span className="text-[7px] font-bold uppercase tracking-tight text-zinc-500 text-center leading-tight">
                                Exibir imediatamente
                              </span>
                            </div>
                            <button
                              type="button"
                              title="Subir"
                              disabled={idx === 0 || loading}
                              onClick={() => void moveSlide(idx, -1)}
                              className="rounded-xl bg-zinc-200/80 dark:bg-white/10 p-2 text-zinc-700 dark:text-zinc-200 disabled:opacity-35"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              title="Descer"
                              disabled={idx >= slides.length - 1 || loading}
                              onClick={() => void moveSlide(idx, 1)}
                              className="rounded-xl bg-zinc-200/80 dark:bg-white/10 p-2 text-zinc-700 dark:text-zinc-200 disabled:opacity-35"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              title="Editar"
                              onClick={() => startEdit(s)}
                              className={`rounded-xl px-3 py-2 text-[11px] font-semibold text-zinc-800 dark:text-zinc-200 ${
                                editingSlideId === s.id ? 'bg-[#007AFF] text-white' : 'bg-zinc-200/80 dark:bg-white/10'
                              }`}
                            >
                              <span className="inline-flex items-center gap-1">
                                <Pencil className="w-3.5 h-3.5" />
                                Editar
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleActive(s)}
                              disabled={loading}
                              className="rounded-xl bg-zinc-200/80 dark:bg-white/10 px-3 py-2 text-[11px] font-semibold text-zinc-800 dark:text-zinc-200"
                            >
                              {s.isActive === false ? 'Ativar' : 'Pausar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeSlide(s.id)}
                              className="rounded-xl p-2 text-red-600 hover:bg-red-500/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {editingSlideId === s.id && editForm && (
                          <div className={`${iosCard} p-4 sm:p-5 space-y-4 border border-[#007AFF]/25`}>
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#007AFF]">Editar slide</p>
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                              {SLIDE_TYPES.map((t) => (
                                <button
                                  key={t.value}
                                  type="button"
                                  onClick={() =>
                                    setEditForm((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            slideType: t.value,
                                            goalShowValues: t.value === 'goal' ? prev.goalShowValues : false,
                                          }
                                        : prev
                                    )
                                  }
                                  className={`rounded-2xl px-2 py-2.5 text-center transition-all ${
                                    editForm.slideType === t.value
                                      ? 'bg-[#007AFF] text-white shadow-md shadow-blue-500/30'
                                      : 'bg-zinc-100/90 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/80 dark:hover:bg-white/10'
                                  }`}
                                >
                                  <span className="block text-[11px] font-semibold leading-tight">{t.label}</span>
                                </button>
                              ))}
                            </div>
                            <div>
                              <label className={iosLabel}>Título</label>
                              <input
                                value={editForm.title}
                                onChange={(e) => setEditForm((f) => (f ? { ...f, title: e.target.value } : f))}
                                className={iosInput}
                              />
                            </div>
                            {(editForm.slideType === 'notice' || editForm.slideType === 'alert') && (
                              <div>
                                <label className={iosLabel}>Texto</label>
                                <textarea
                                  value={editForm.body}
                                  onChange={(e) => setEditForm((f) => (f ? { ...f, body: e.target.value } : f))}
                                  rows={3}
                                  className={`${iosInput} resize-none min-h-[100px]`}
                                />
                              </div>
                            )}
                            {(editForm.slideType === 'image' || editForm.slideType === 'video') && (
                              <div className="space-y-3">
                                <input
                                  ref={editFileInputRef}
                                  type="file"
                                  accept="image/*,video/*"
                                  className="hidden"
                                  onChange={handleEditFileChange}
                                />
                                <button
                                  type="button"
                                  onClick={() => editFileInputRef.current?.click()}
                                  disabled={uploading}
                                  className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-300/90 dark:border-white/15 bg-zinc-50/80 dark:bg-white/[0.03] py-6 text-[14px] font-medium text-zinc-600 dark:text-zinc-300 hover:border-[#007AFF]/50 disabled:opacity-50"
                                >
                                  {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5 text-[#007AFF]" />}
                                  {uploading ? 'Enviando…' : 'Substituir arquivo (imagem ou vídeo)'}
                                </button>
                                <div>
                                  <label className={iosLabel}>URL (YouTube ou link direto)</label>
                                  <input
                                    value={editForm.mediaUrl}
                                    onChange={(e) => setEditForm((f) => (f ? { ...f, mediaUrl: e.target.value } : f))}
                                    className={iosInput}
                                    placeholder="https://..."
                                  />
                                </div>
                              </div>
                            )}
                            {editForm.slideType === 'goal' && (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div>
                                  <label className={iosLabel}>Rótulo</label>
                                  <input
                                    value={editForm.goalLabel}
                                    onChange={(e) => setEditForm((f) => (f ? { ...f, goalLabel: e.target.value } : f))}
                                    className={iosInput}
                                  />
                                </div>
                                <div>
                                  <label className={iosLabel}>Atual (cálculo interno)</label>
                                  <input
                                    type="number"
                                    value={editForm.goalCurrent}
                                    onChange={(e) => setEditForm((f) => (f ? { ...f, goalCurrent: Number(e.target.value) } : f))}
                                    className={iosInput}
                                  />
                                </div>
                                <div>
                                  <label className={iosLabel}>Meta (cálculo interno)</label>
                                  <input
                                    type="number"
                                    value={editForm.goalTarget}
                                    onChange={(e) => setEditForm((f) => (f ? { ...f, goalTarget: Number(e.target.value) } : f))}
                                    className={iosInput}
                                  />
                                </div>
                                <p className="sm:col-span-3 text-[11px] text-zinc-500">
                                  Na TV: rótulo e barra; porcentagem ou valores em R$ conforme a opção abaixo.
                                </p>
                              </div>
                            )}
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-2xl bg-zinc-100/80 dark:bg-white/[0.04]">
                              <div>
                                <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">Som ao exibir este slide</p>
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                                  Bip ao entrar neste slide na TV (som do canto ligado).
                                </p>
                              </div>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={editForm.playSound}
                                onClick={() =>
                                  setEditForm((f) => (f ? { ...f, playSound: !f.playSound } : f))
                                }
                                className={`relative h-8 w-[51px] shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40 ${
                                  editForm.playSound ? 'bg-[#34C759]' : 'bg-zinc-300 dark:bg-zinc-600'
                                }`}
                              >
                                <span
                                  className={`absolute top-0.5 left-0.5 block h-7 w-7 rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${
                                    editForm.playSound ? 'translate-x-[22px]' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                            </div>
                            {editForm.slideType === 'goal' && (
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-2xl bg-zinc-100/80 dark:bg-white/[0.04]">
                                <div>
                                  <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">Este slide meta: valores em R$</p>
                                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                                    Ligado mostra atual e meta em reais; desligado mostra só a porcentagem.
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={editForm.goalShowValues}
                                  onClick={() =>
                                    setEditForm((f) => (f ? { ...f, goalShowValues: !f.goalShowValues } : f))
                                  }
                                  className={`relative h-8 w-[51px] shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40 ${
                                    editForm.goalShowValues ? 'bg-[#34C759]' : 'bg-zinc-300 dark:bg-zinc-600'
                                  }`}
                                >
                                  <span
                                    className={`absolute top-0.5 left-0.5 block h-7 w-7 rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${
                                      editForm.goalShowValues ? 'translate-x-[22px]' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                              </div>
                            )}
                            {(editForm.slideType === 'image' ||
                              editForm.slideType === 'video' ||
                              editForm.slideType === 'goal') && (
                              <div>
                                <label className={iosLabel}>Texto complementar (opcional)</label>
                                <textarea
                                  value={editForm.body}
                                  onChange={(e) => setEditForm((f) => (f ? { ...f, body: e.target.value } : f))}
                                  rows={2}
                                  className={`${iosInput} resize-none`}
                                  placeholder="Legenda ou observação"
                                />
                              </div>
                            )}
                            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                              <div className="w-full sm:w-40">
                                <label className={iosLabel}>Duração (s)</label>
                                <input
                                  type="number"
                                  min={3}
                                  max={300}
                                  value={editForm.durationSeconds}
                                  onChange={(e) =>
                                    setEditForm((f) => (f ? { ...f, durationSeconds: Number(e.target.value) } : f))
                                  }
                                  className={iosInput}
                                />
                              </div>
                              <div className="flex flex-1 flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => void saveEdit()}
                                  disabled={loading}
                                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#007AFF] px-5 py-3 text-[14px] font-semibold text-white shadow-lg shadow-blue-500/25 disabled:opacity-50 min-w-[140px]"
                                >
                                  <Save className="w-4 h-4" />
                                  Salvar alterações
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  disabled={loading}
                                  className="rounded-2xl border border-zinc-300/90 dark:border-white/15 px-5 py-3 text-[14px] font-semibold text-zinc-700 dark:text-zinc-200"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
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
        {dataReady && (
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
                weeklyCurrent={weeklyCurrentNum}
                weeklyTarget={weeklyTargetNum}
                showWeeklyStrip={previewShowsWeeklyStrip}
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
    </ModalPortal>
  );
};
