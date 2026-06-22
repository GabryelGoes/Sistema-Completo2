import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  Bell,
  Volume2,
  Clock,
  CloudUpload,
  Film,
} from 'lucide-react';
import type { TvMediaObjectFit, TvMediaItem, TvScope, TvSlide, TvSlideType } from '../services/apiService';
import {
  getTvManage,
  normalizeTvMediaObjectFit,
  putTvWeeklyGoal,
  putTvChimeSchedule,
  createTvSlide,
  deleteTvSlide,
  updateTvSlide,
  uploadTvPatioMedia,
  listTvMedia,
  deleteTvMedia,
  formatTvMediaSize,
  TV_SHORT_VIDEO_MAX_MB,
} from '../services/apiService';
import type { TvChimeAlert, TvChimeKind, TvChimeScheduleConfig } from '../utils/tvChimeSchedule';
import { defaultTvChimeSchedule, normalizeTimeHHmm } from '../utils/tvChimeSchedule';
import { playTvChimePreSound, playTvChimeSound } from '../utils/tvChimeAudio';
import { useTvChimeSchedule, type TvChimeFirePayload } from '../hooks/useTvChimeSchedule';
import { TvChimeBannerCard } from './TvChimeBannerCard';
import { TvPatioPreview } from './TvPatioPreview';
import { ModalPortal } from './ui/ModalPortal';
import { IosAccentIconSquircle } from './ui/IosAccentIconSquircle';
import { isTvImageFile, isTvVideoFile, TV_VIDEO_ACCEPT } from '../utils/tvMediaFile';

const SLIDE_TYPES: { value: TvSlideType; label: string; hint: string }[] = [
  { value: 'notice', label: 'Aviso', hint: 'Texto em destaque' },
  { value: 'alert', label: 'Alerta', hint: 'Urgente, vermelho' },
  { value: 'image', label: 'Imagem', hint: 'Arquivo ou URL' },
  { value: 'video', label: 'Vídeo', hint: 'Arquivo ou URL / YouTube' },
  { value: 'goal', label: 'Meta', hint: 'Barra no slide' },
];

const MEDIA_FIT_OPTIONS: { value: TvMediaObjectFit; label: string; hint: string }[] = [
  { value: 'cover', label: 'Preencher', hint: 'Corta bordas, sem distorcer' },
  { value: 'contain', label: 'Inteira', hint: 'Proporção original, faixas pretas' },
  { value: 'fill', label: 'Esticar', hint: 'Ocupa tudo (pode distorcer)' },
];

const CHIME_WEEKDAY_OPTS: { v: number; short: string }[] = [
  { v: 0, short: 'Dom' },
  { v: 1, short: 'Seg' },
  { v: 2, short: 'Ter' },
  { v: 3, short: 'Qua' },
  { v: 4, short: 'Qui' },
  { v: 5, short: 'Sex' },
  { v: 6, short: 'Sáb' },
];

const tvMediaLabel = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 mb-2';

function formatMediaDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
}

interface TvCloudVideoBlockProps {
  fileInputId: string;
  currentUrl: string;
  onSelectUrl: (url: string) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploading: boolean;
  uploadFeedback: { tone: 'error' | 'success'; text: string } | null;
  videos: TvMediaItem[];
  libraryLoading: boolean;
  onDeleteVideo: (item: TvMediaItem) => void;
  deletingId: string | null;
}

function TvCloudVideoBlock({
  fileInputId,
  currentUrl,
  onSelectUrl,
  onFileChange,
  uploading,
  uploadFeedback,
  videos,
  libraryLoading,
  onDeleteVideo,
  deletingId,
}: TvCloudVideoBlockProps) {
  return (
    <div className="space-y-3">
      <label
        htmlFor={fileInputId}
        className={`flex w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-[#007AFF]/45 bg-blue-50/60 py-8 text-[15px] font-semibold text-[#007AFF] hover:border-[#007AFF]/70 hover:bg-blue-50 transition-colors ${
          uploading ? 'pointer-events-none opacity-50' : 'cursor-pointer'
        }`}
      >
        <span className="inline-flex items-center gap-2">
          {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CloudUpload className="w-5 h-5" />}
          {uploading ? 'Enviando vídeo…' : 'Enviar vídeo curto (nuvem)'}
        </span>
        <span className="text-[11px] font-normal text-[#007AFF]/80">
          Até {TV_SHORT_VIDEO_MAX_MB} MB · salvo na nuvem, sem pasta no PC
        </span>
      </label>
      <input
        id={fileInputId}
        type="file"
        accept={TV_VIDEO_ACCEPT}
        className="sr-only"
        disabled={uploading}
        onChange={onFileChange}
      />

      {uploadFeedback && (
        <p
          className={`rounded-2xl px-3 py-2 text-[12px] font-medium ${
            uploadFeedback.tone === 'error'
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          }`}
        >
          {uploadFeedback.text}
        </p>
      )}

      <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-3">
        <p className={tvMediaLabel}>Biblioteca de vídeos enviados</p>
        {libraryLoading ? (
          <p className="flex items-center gap-2 text-[12px] text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </p>
        ) : videos.length > 0 ? (
          <ul className="max-h-44 space-y-2 overflow-y-auto">
            {videos.map((v) => {
              const selected = currentUrl.trim() === v.mediaUrl;
              return (
                <li
                  key={v.id}
                  className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${
                    selected ? 'border-[#007AFF]/50 bg-[#007AFF]/10' : 'border-zinc-200/80 bg-white/90'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectUrl(v.mediaUrl)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="flex items-center gap-1.5 text-[13px] font-medium text-zinc-900 truncate">
                      <Film className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                      {v.title || v.fileName}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {formatTvMediaSize(v.sizeBytes)} · {formatMediaDate(v.createdAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    title="Excluir da biblioteca"
                    disabled={deletingId === v.id}
                    onClick={() => onDeleteVideo(v)}
                    className="shrink-0 rounded-lg p-1.5 text-red-600 hover:bg-red-500/10 disabled:opacity-40"
                  >
                    {deletingId === v.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[12px] text-zinc-500">Nenhum vídeo na biblioteca ainda. Envie o primeiro acima.</p>
        )}
      </div>

      <div>
        <label className={tvMediaLabel}>Ou cole uma URL (YouTube, link direto)</label>
        <input
          value={currentUrl}
          onChange={(e) => onSelectUrl(e.target.value)}
          className="w-full rounded-2xl border border-zinc-200/90 bg-white/90 px-4 py-3 text-[15px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 focus:border-[#007AFF]/50 transition-shadow"
          placeholder="https://...  ou  local:meu-video.mp4"
        />
      </div>

      <details className="rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-3">
        <summary className="cursor-pointer text-[12px] font-semibold text-zinc-700">
          Alternativa: vídeo da pasta do PC da TV
        </summary>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
          Para arquivos muito grandes, digite{' '}
          <code className="rounded bg-zinc-200/80 px-1 font-mono text-[10px]">local:nome-do-arquivo.mp4</code>{' '}
          no campo acima. O vídeo é lido da pasta configurada no PC da TV (sem upload).
        </p>
      </details>
    </div>
  );
}

function newTvChimeAlertId(): string {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `chime-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface TvPatioModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TvPatioModal: React.FC<TvPatioModalProps> = ({ isOpen, onClose }) => {
  const [tvScope, setTvScope] = useState<TvScope>('patio');
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
  const [newMediaFullscreen, setNewMediaFullscreen] = useState(true);
  const [newMediaObjectFit, setNewMediaObjectFit] = useState<TvMediaObjectFit>('cover');

  const [previewTab, setPreviewTab] = useState<'draft' | 'library' | 'chimes'>('draft');
  const [libraryPreviewId, setLibraryPreviewId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const [mediaLibrary, setMediaLibrary] = useState<TvMediaItem[]>([]);
  const [mediaLibraryLoading, setMediaLibraryLoading] = useState(false);
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);
  const [uploadFeedback, setUploadFeedback] = useState<{ tone: 'error' | 'success'; text: string } | null>(
    null
  );

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
    mediaFullscreen: boolean;
    mediaObjectFit: TvMediaObjectFit;
  } | null>(null);

  const [chimeConfig, setChimeConfig] = useState<TvChimeScheduleConfig>(() => defaultTvChimeSchedule());
  const [chimeSaving, setChimeSaving] = useState(false);
  const [chimeBanner, setChimeBanner] = useState<{
    title: string;
    message: string;
    kind: TvChimeKind;
    phase: 'pre' | 'main';
  } | null>(null);
  /** Pré-visualização da faixa dentro do frame “TV” (aba Horários). */
  const [chimeFiringPreviewInTv, setChimeFiringPreviewInTv] = useState<{
    phase: 'pre' | 'main';
    kind: TvChimeKind;
    title: string;
    message: string;
  } | null>(null);
  const [chimePreviewPickId, setChimePreviewPickId] = useState<string | null>(null);
  /** Secção de avisos programados: minimizada por defeito. */
  const [chimeSectionExpanded, setChimeSectionExpanded] = useState(false);
  const chimeConfigRef = useRef(chimeConfig);
  chimeConfigRef.current = chimeConfig;
  const chimeBannerTimerRef = useRef<number | null>(null);

  const loadMediaLibrary = async () => {
    setMediaLibraryLoading(true);
    try {
      const items = await listTvMedia(tvScope);
      setMediaLibrary(items);
    } catch {
      setMediaLibrary([]);
    } finally {
      setMediaLibraryLoading(false);
    }
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTvManage(tvScope);
      setSlides(data.slides);
      setChimeConfig(data.chimeSchedule);
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
      setChimeBanner(null);
      setChimeFiringPreviewInTv(null);
      setChimePreviewPickId(null);
      setChimeSectionExpanded(false);
      setUploadFeedback(null);
      if (chimeBannerTimerRef.current) {
        window.clearTimeout(chimeBannerTimerRef.current);
        chimeBannerTimerRef.current = null;
      }
      return;
    }
    void load();
    void loadMediaLibrary();
  }, [isOpen, tvScope]);

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
        mediaFullscreen: false,
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
        mediaFullscreen: false,
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
        mediaFullscreen: newType === 'image' || newType === 'video' ? newMediaFullscreen : false,
        mediaObjectFit: newType === 'image' || newType === 'video' ? newMediaObjectFit : 'cover',
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
    newMediaFullscreen,
    newMediaObjectFit,
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
        mediaFullscreen: (editForm.slideType === 'image' || editForm.slideType === 'video') ? editForm.mediaFullscreen : false,
        mediaObjectFit:
          editForm.slideType === 'image' || editForm.slideType === 'video'
            ? editForm.mediaObjectFit
            : 'cover',
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

  const currentTypeMeta = useMemo(
    () => SLIDE_TYPES.find((t) => t.value === newType),
    [newType]
  );

  const onChimeFire = useCallback((payload: TvChimeFirePayload) => {
    const cfg = chimeConfigRef.current;
    const seconds =
      payload.phase === 'pre'
        ? Math.min(18, Math.max(8, cfg.bannerSeconds))
        : cfg.bannerSeconds;
    if (chimeBannerTimerRef.current) {
      window.clearTimeout(chimeBannerTimerRef.current);
    }
    if (payload.phase === 'pre' && cfg.preNotifyMinutes > 0) {
      setChimeBanner({
        title: `Em ${cfg.preNotifyMinutes} min`,
        message: `${payload.alert.label} · ${payload.alert.time}`,
        kind: 'info',
        phase: 'pre',
      });
    } else if (payload.phase === 'main') {
      setChimeBanner({
        title: payload.alert.label,
        message: payload.alert.message || '—',
        kind: payload.alert.kind,
        phase: 'main',
      });
    }
    chimeBannerTimerRef.current = window.setTimeout(() => {
      setChimeBanner(null);
      chimeBannerTimerRef.current = null;
    }, seconds * 1000);
  }, []);

  useTvChimeSchedule({
    enabled: isOpen && dataReady && chimeConfig.masterEnabled,
    config: chimeConfig,
    onFire: onChimeFire,
  });

  const enabledChimeAlerts = useMemo(
    () => chimeConfig.alerts.filter((a) => a.enabled),
    [chimeConfig.alerts]
  );

  const chimePreviewEffectiveAlertId = useMemo(() => {
    if (chimePreviewPickId && enabledChimeAlerts.some((a) => a.id === chimePreviewPickId)) {
      return chimePreviewPickId;
    }
    return enabledChimeAlerts[0]?.id ?? null;
  }, [chimePreviewPickId, enabledChimeAlerts]);

  const cloudVideos = useMemo(
    () => mediaLibrary.filter((m) => m.mediaType === 'video'),
    [mediaLibrary]
  );

  useEffect(() => {
    if (previewTab !== 'chimes') setChimeFiringPreviewInTv(null);
  }, [previewTab]);

  if (!isOpen) return null;

  const saveWeekly = async () => {
    setLoading(true);
    setError(null);
    try {
      await putTvWeeklyGoal(
        {
          label: weeklyLabel,
          currentAmount: weeklyCurrentNum,
          targetAmount: weeklyTargetNum,
          showWeeklyBar,
        },
        tvScope
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  };

  const saveChime = async () => {
    setChimeSaving(true);
    setError(null);
    try {
      const saved = await putTvChimeSchedule(chimeConfig, tvScope);
      setChimeConfig(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar horários da TV.');
    } finally {
      setChimeSaving(false);
    }
  };

  /** O interruptor “Ativar rotina” persiste na API na hora (não depende só do botão Salvar). */
  const toggleChimeMasterEnabled = async () => {
    const prev = chimeConfigRef.current;
    const next = { ...prev, masterEnabled: !prev.masterEnabled };
    setChimeConfig(next);
    setChimeSaving(true);
    setError(null);
    try {
      const saved = await putTvChimeSchedule(next, tvScope);
      setChimeConfig(saved);
    } catch (e) {
      setChimeConfig(prev);
      setError(
        e instanceof Error
          ? e.message
          : 'Erro ao salvar rotina. Verifique se a migração da TV foi aplicada no Supabase ou use “Salvar horários da TV”.'
      );
    } finally {
      setChimeSaving(false);
    }
  };

  const addSlide = async () => {
    setLoading(true);
    setError(null);
    try {
      await createTvSlide(
        {
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
          mediaFullscreen: (newType === 'image' || newType === 'video') ? newMediaFullscreen : false,
          mediaObjectFit: (newType === 'image' || newType === 'video') ? newMediaObjectFit : undefined,
        },
        tvScope
      );
      setNewTitle('');
      setNewBody('');
      setNewMediaUrl('');
      setNewMediaFullscreen(true);
      setNewMediaObjectFit('cover');
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

  const handleDeleteMedia = async (item: TvMediaItem) => {
    if (
      !confirm(
        `Excluir "${item.title || item.fileName}" da biblioteca?\n\nSlides que já usam este vídeo mantêm o link até você editá-los.`
      )
    ) {
      return;
    }
    setDeletingMediaId(item.id);
    setError(null);
    try {
      await deleteTvMedia(item.id);
      if (newMediaUrl.trim() === item.mediaUrl) setNewMediaUrl('');
      setEditForm((f) => (f?.mediaUrl.trim() === item.mediaUrl ? { ...f, mediaUrl: '' } : f));
      await loadMediaLibrary();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir vídeo');
    } finally {
      setDeletingMediaId(null);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError(null);
    setUploadFeedback(null);
    try {
      const { url } = await uploadTvPatioMedia(file, tvScope);
      setNewMediaUrl(url);
      if (isTvVideoFile(file)) setNewType('video');
      else if (isTvImageFile(file)) setNewType('image');
      await loadMediaLibrary();
      setUploadFeedback({ tone: 'success', text: `Arquivo enviado: ${file.name}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha no upload';
      setError(msg);
      setUploadFeedback({ tone: 'error', text: msg });
    } finally {
      setUploading(false);
    }
  };

  const handleVideoFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'new' | 'edit'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isTvVideoFile(file)) {
      const msg = 'Escolha um vídeo (MP4, MOV, WebM, etc.).';
      setError(msg);
      setUploadFeedback({ tone: 'error', text: msg });
      return;
    }
    if (file.size > TV_SHORT_VIDEO_MAX_MB * 1024 * 1024) {
      const msg = `Vídeo muito grande (${formatTvMediaSize(file.size)}). Máximo ${TV_SHORT_VIDEO_MAX_MB} MB.`;
      setError(msg);
      setUploadFeedback({ tone: 'error', text: msg });
      return;
    }
    setUploading(true);
    setError(null);
    setUploadFeedback(null);
    try {
      const { url } = await uploadTvPatioMedia(file, tvScope);
      if (target === 'new') {
        setNewMediaUrl(url);
        setNewType('video');
        setPreviewTab('draft');
      } else {
        setEditForm((prev) =>
          prev ? { ...prev, mediaUrl: url, slideType: 'video' as TvSlideType } : prev
        );
      }
      await loadMediaLibrary();
      setUploadFeedback({
        tone: 'success',
        text: `Vídeo enviado com sucesso (${formatTvMediaSize(file.size)}). Adicione à rotação ou salve o slide.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha no upload';
      setError(msg);
      setUploadFeedback({ tone: 'error', text: msg });
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
      mediaFullscreen: s.mediaFullscreen === true,
      mediaObjectFit: normalizeTvMediaObjectFit(s.mediaObjectFit),
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
        mediaFullscreen: (editForm.slideType === 'image' || editForm.slideType === 'video') ? editForm.mediaFullscreen : false,
      };
      if (editForm.slideType === 'image' || editForm.slideType === 'video') {
        patch.mediaObjectFit = editForm.mediaObjectFit;
      }
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
    if (!file) return;
    setUploading(true);
    setError(null);
    setUploadFeedback(null);
    try {
      const { url } = await uploadTvPatioMedia(file, tvScope);
      setEditForm((prev) => {
        if (!prev) return prev;
        const next = { ...prev, mediaUrl: url };
        if (isTvVideoFile(file)) return { ...next, slideType: 'video' as TvSlideType };
        if (isTvImageFile(file)) return { ...next, slideType: 'image' as TvSlideType };
        return next;
      });
      await loadMediaLibrary();
      setUploadFeedback({ tone: 'success', text: `Arquivo enviado: ${file.name}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha no upload';
      setError(msg);
      setUploadFeedback({ tone: 'error', text: msg });
    } finally {
      setUploading(false);
    }
  };

  const iosCard =
    'rounded-[22px] border border-zinc-200/80 bg-white/70 backdrop-blur-2xl shadow-[0_2px_24px_-4px_rgba(0,0,0,0.08)]';

  /** Fundo único claro (igual à área do preview) em todo o painel da TV do pátio */
  const tvPatioShellBg =
    'bg-gradient-to-b from-zinc-100/90 via-white/95 to-zinc-50/90';

  const iosInput =
    'w-full rounded-2xl border border-zinc-200/90 bg-white/90 px-4 py-3 text-[15px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 focus:border-[#007AFF]/50 transition-shadow';

  const iosLabel = 'text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 mb-2';

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[120] flex items-stretch justify-stretch bg-black/45 backdrop-blur-[20px]">
      {chimeBanner && (
        <div className="pointer-events-none fixed inset-0 z-[125] flex items-center justify-center bg-black/55 p-3 sm:p-6">
          <TvChimeBannerCard
            variant="display"
            phase={chimeBanner.phase}
            kind={chimeBanner.kind}
            title={chimeBanner.title}
            message={chimeBanner.message}
            className="pointer-events-auto w-full"
            onDismiss={() => {
              setChimeBanner(null);
              if (chimeBannerTimerRef.current) {
                window.clearTimeout(chimeBannerTimerRef.current);
                chimeBannerTimerRef.current = null;
              }
            }}
          />
        </div>
      )}
      <div
        className={`relative flex h-[100dvh] w-screen max-w-none min-h-0 flex-1 flex-col overflow-hidden text-zinc-900 max-lg:portrait:overflow-y-auto max-lg:portrait:overflow-x-hidden max-lg:landscape:flex-col lg:grid lg:min-h-0 ${
          dataReady ? 'lg:grid-cols-[minmax(0,1fr)_min(420px,100%)]' : 'lg:grid-cols-1'
        } lg:grid-rows-[auto_minmax(0,1fr)] ${tvPatioShellBg} rounded-none border-0 shadow-none`}
        style={{ colorScheme: 'light' }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/5 text-zinc-600 hover:bg-black/10 transition-colors"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Cabeçalho: em portrait fica no topo; em telas largas, canto superior esquerdo do grid */}
        <header className="shrink-0 px-6 pt-8 pb-6 sm:px-8 max-lg:landscape:order-2 lg:col-start-1 lg:row-start-1 lg:pr-12">
          <div className="flex items-center gap-3 mb-1">
            <IosAccentIconSquircle variant="modal" strokeWidth={2.2}>
              <img
                src={tvScope === 'laboratorio' ? '/icons/laboratorio-ios.png' : '/icons/tv-patio-ios.png'}
                alt={tvScope === 'laboratorio' ? 'TV Laboratório' : 'TV Pátio'}
                className="h-full w-full object-cover"
              />
            </IosAccentIconSquircle>
            <div>
              <h2 className="text-[22px] sm:text-[26px] font-semibold tracking-tight text-zinc-900 leading-tight">
                TVs da oficina
              </h2>
              <p className="text-[13px] text-zinc-500 mt-0.5 flex items-center gap-1.5">
                <Sparkles className={`w-3.5 h-3.5 ${tvScope === 'laboratorio' ? 'text-violet-500' : 'text-brand-yellow'}`} />
                {tvScope === 'laboratorio'
                  ? 'Conteúdo entre as páginas de módulos (Laboratório)'
                  : 'Conteúdo entre as páginas de veículos (Pátio)'}
              </p>
            </div>
          </div>
          <div className="mt-4 flex max-w-md gap-1 rounded-2xl bg-zinc-200/70 p-1">
            <button
              type="button"
              onClick={() => {
                setTvScope('patio');
                setPreviewTab('draft');
                setEditingSlideId(null);
                setEditForm(null);
              }}
              className={`flex-1 rounded-xl py-2.5 text-[12px] font-semibold transition-all ${
                tvScope === 'patio'
                  ? 'bg-white text-zinc-900 shadow-md'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              TV Pátio
            </button>
            <button
              type="button"
              onClick={() => {
                setTvScope('laboratorio');
                setPreviewTab('draft');
                setEditingSlideId(null);
                setEditForm(null);
              }}
              className={`flex-1 rounded-xl py-2.5 text-[12px] font-semibold transition-all ${
                tvScope === 'laboratorio'
                  ? 'bg-white text-violet-900 shadow-md ring-1 ring-violet-200'
                  : 'text-zinc-600 hover:text-violet-900'
              }`}
            >
              TV Laboratório
            </button>
          </div>
        </header>

        {/* Preview — em portrait: logo abaixo do cabeçalho; em lg: coluna direita */}
        {dataReady && (
          <div className="flex max-lg:landscape:order-1 shrink-0 flex-col border-b border-zinc-200/60 bg-transparent px-5 py-8 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-b-0 lg:border-l lg:border-t-0 lg:border-zinc-200/50 lg:py-10">
            <div className="portrait:order-2 lg:order-1 max-lg:portrait:mt-9">
              <div className="mb-4 flex items-center gap-2 max-lg:portrait:mb-5">
                <Eye className="h-4 w-4 text-[#007AFF]" />
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                  Preview ao vivo
                </span>
              </div>

              <div className="mb-5 grid grid-cols-3 gap-1 rounded-2xl bg-zinc-200/60 p-1">
                <button
                  type="button"
                  onClick={() => setPreviewTab('draft')}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-xl py-2.5 text-[11px] font-semibold transition-all sm:text-[12px] ${
                    previewTab === 'draft'
                      ? 'bg-white text-zinc-900 shadow-md'
                      : 'text-zinc-500'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Rascunho</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab('library')}
                  disabled={slides.length === 0}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-xl py-2.5 text-[11px] font-semibold transition-all disabled:opacity-35 sm:text-[12px] ${
                    previewTab === 'library'
                      ? 'bg-white text-zinc-900 shadow-md'
                      : 'text-zinc-500'
                  }`}
                >
                  <ListVideo className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Na fila</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab('chimes')}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-xl py-2.5 text-[11px] font-semibold transition-all sm:text-[12px] ${
                    previewTab === 'chimes'
                      ? 'bg-white text-zinc-900 shadow-md'
                      : 'text-zinc-500'
                  }`}
                >
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Horários</span>
                </button>
              </div>

              {previewTab === 'chimes' && (
                <div className="mb-4 space-y-3 rounded-2xl border border-amber-200/80 bg-amber-50/40 px-3 py-3">
                  <p className={`${iosLabel} mb-0 text-amber-900/90`}>Pré-visualizar faixa no painel</p>
                  <p className="text-[12px] leading-snug text-zinc-600">
                    Mesma aparência da faixa quando o horário disparar (pré-aviso ou no horário). Opcional: toca o som conforme a configuração.
                  </p>
                  {enabledChimeAlerts.length === 0 ? (
                    <p className="text-[12px] text-zinc-500">
                      Ative pelo menos um aviso na lista desta secção para simular.
                    </p>
                  ) : (
                    <>
                      <label className={`${iosLabel} text-zinc-600`}>Aviso</label>
                      <select
                        value={chimePreviewEffectiveAlertId ?? ''}
                        onChange={(e) => setChimePreviewPickId(e.target.value || null)}
                        className={`${iosInput} text-[13px]`}
                      >
                        {enabledChimeAlerts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.label || 'Sem nome'} ({a.time})
                          </option>
                        ))}
                      </select>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          disabled={chimeConfig.preNotifyMinutes <= 0}
                          onClick={() => {
                            const id = chimePreviewEffectiveAlertId;
                            if (!id || chimeConfig.preNotifyMinutes <= 0) return;
                            const alert = enabledChimeAlerts.find((x) => x.id === id);
                            if (!alert) return;
                            setChimeFiringPreviewInTv({
                              phase: 'pre',
                              kind: 'info',
                              title: `Em ${chimeConfig.preNotifyMinutes} min`,
                              message: `${alert.label} · ${alert.time}`,
                            });
                            if (chimeConfig.preNotifyPlaySound) {
                              void playTvChimePreSound(chimeConfig.soundVolume);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/90 bg-white px-3 py-2 text-[12px] font-semibold text-zinc-800 shadow-sm hover:border-[#007AFF]/40 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Pré-aviso
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const id = chimePreviewEffectiveAlertId;
                            if (!id) return;
                            const alert = enabledChimeAlerts.find((x) => x.id === id);
                            if (!alert) return;
                            setChimeFiringPreviewInTv({
                              phase: 'main',
                              kind: alert.kind,
                              title: alert.label,
                              message: alert.message?.trim() || '—',
                            });
                            if (alert.playSound) {
                              void playTvChimeSound(chimeConfig.soundPreset, chimeConfig.soundVolume);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[#007AFF]/35 bg-[#007AFF] px-3 py-2 text-[12px] font-semibold text-white shadow-sm shadow-blue-500/20 hover:opacity-95"
                        >
                          No horário
                        </button>
                        <button
                          type="button"
                          disabled={!chimeFiringPreviewInTv}
                          onClick={() => setChimeFiringPreviewInTv(null)}
                          className="rounded-xl border border-zinc-200/90 bg-zinc-100/90 px-3 py-2 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-200/80 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          Ocultar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

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
            </div>

            <div className="portrait:order-1 flex min-h-[200px] flex-1 flex-col justify-center max-lg:portrait:flex-none portrait:w-[80%] portrait:self-center lg:order-2">
              <TvPatioPreview
                weeklyLabel={weeklyLabel}
                weeklyCurrent={weeklyCurrentNum}
                weeklyTarget={weeklyTargetNum}
                showWeeklyStrip={previewShowsWeeklyStrip}
                slide={previewTab === 'chimes' ? null : previewSlide}
                showVehiclesPlaceholder={previewTab === 'draft' && !draftSlide}
                chimeSchedulePreview={previewTab === 'chimes' ? chimeConfig : null}
                chimeFiringPreview={previewTab === 'chimes' ? chimeFiringPreviewInTv : null}
                onChimeFiringPreviewDismiss={
                  previewTab === 'chimes' ? () => setChimeFiringPreviewInTv(null) : undefined
                }
              />
            </div>

            <p className="portrait:order-3 mt-5 px-1 text-center text-[11px] leading-relaxed text-zinc-500 lg:order-3">
              {previewTab === 'chimes'
                ? 'Lista de horários + botões acima para ver a faixa como no disparo. Salve na secção abaixo para enviar ao painel.'
                : 'O preview simula o painel da TV. Imagens e vídeos enviados ficam no Storage da oficina.'}
            </p>
          </div>
        )}

        {/* Coluna principal (cards) — em portrait fica após o preview */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6 pb-8 sm:px-8 max-lg:portrait:flex-none max-lg:portrait:overflow-visible max-lg:landscape:order-3 lg:col-start-1 lg:row-start-2 lg:pr-12">
          <div className="space-y-6">
            {!dataReady &&
              (error ? (
                <div className={`${iosCard} p-6 sm:p-8 space-y-4 text-center`}>
                  <p className="text-[14px] text-red-600">{error}</p>
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
                  <p className="text-[14px] text-zinc-500">Carregando configurações da TV…</p>
                </div>
              ))}
            {dataReady && (
              <>
                {/* Meta semanal */}
                <section className={`${iosCard} p-5 sm:p-6`}>
                  <p className={iosLabel}>Meta semanal · barra superior na TV</p>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 p-3 rounded-2xl bg-zinc-100/80">
                    <div>
                      <p className="text-[13px] font-semibold text-zinc-900">Exibir barra na TV</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">Liga/desliga a faixa de meta (apenas nas páginas de veículos).</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showWeeklyBar}
                      onClick={() => setShowWeeklyBar((v) => !v)}
                      className={`relative h-8 w-[51px] shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40 ${
                        showWeeklyBar ? 'bg-[#34C759]' : 'bg-zinc-300'
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
                      <label className="text-[12px] text-zinc-500 mb-1.5 block">Rótulo</label>
                      <input
                        value={weeklyLabel}
                        onChange={(e) => setWeeklyLabel(e.target.value)}
                        className={iosInput}
                      />
                    </div>
                    <div>
                      <label className="text-[12px] text-zinc-500 mb-1.5 block">Atual (R$)</label>
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
                      <label className="text-[12px] text-zinc-500 mb-1.5 block">Meta (R$)</label>
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

                {/* Avisos por horário (rotina da oficina) — detalhe minimizado por defeito */}
                <section className={`${iosCard} p-5 sm:p-6`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-between sm:gap-4">
                    <button
                      type="button"
                      onClick={() => setChimeSectionExpanded((v) => !v)}
                      className="flex min-w-0 flex-1 items-start gap-3 rounded-2xl border border-transparent p-1 text-left transition-colors hover:border-zinc-200/80 hover:bg-zinc-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]/35 sm:items-center sm:py-0.5"
                      aria-expanded={chimeSectionExpanded}
                      aria-controls="tv-chime-settings-panel"
                      id="tv-chime-settings-summary"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#007AFF]/25 bg-[#007AFF]/10">
                        <Clock className="h-5 w-5 text-[#007AFF]" strokeWidth={2.2} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={iosLabel}>Rotina inteligente · horários</p>
                        <h3 className="text-[16px] font-semibold text-zinc-900">Avisos programados na TV</h3>
                        <p className="mt-1 text-[12px] leading-snug text-zinc-500">
                          {chimeSectionExpanded
                            ? 'Toque de novo para minimizar as opções abaixo.'
                            : `${enabledChimeAlerts.length} aviso(s) ativo(s) · rotina ${
                                chimeConfig.masterEnabled ? 'ligada' : 'desligada'
                              } · toque para expandir`}
                        </p>
                      </div>
                      <ChevronDown
                        className={`mt-1 h-5 w-5 shrink-0 text-zinc-400 transition-transform duration-200 sm:mt-0 ${
                          chimeSectionExpanded ? 'rotate-180' : ''
                        }`}
                        aria-hidden
                      />
                    </button>
                    <div className="flex shrink-0 flex-row items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-zinc-50/90 px-3 py-2.5 sm:min-w-[9.5rem] sm:flex-col sm:items-end sm:justify-center sm:py-3">
                      <span className="text-[12px] font-semibold text-zinc-700">Ativar rotina</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={chimeConfig.masterEnabled}
                        disabled={chimeSaving}
                        onClick={() => void toggleChimeMasterEnabled()}
                        className={`relative h-8 w-[51px] shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40 disabled:opacity-50 ${
                          chimeConfig.masterEnabled ? 'bg-[#34C759]' : 'bg-zinc-300'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 block h-7 w-7 rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${
                            chimeConfig.masterEnabled ? 'translate-x-[22px]' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {chimeSectionExpanded ? (
                    <div
                      id="tv-chime-settings-panel"
                      role="region"
                      aria-labelledby="tv-chime-settings-summary"
                      className="mt-4 border-t border-zinc-200/70 pt-4"
                    >
                      <p className="mb-5 max-w-prose text-[12px] leading-relaxed text-zinc-500">
                        Almoço, saída ou eventos personalizados: faixa no painel + som opcional. Os horários seguem o{' '}
                        <span className="font-semibold text-zinc-700">relógio local do aparelho</span> que exibe a TV.
                        A configuração é salva na oficina e enviada na playlist pública (
                        <span className="font-mono text-[11px]">chimeSchedule</span>) para o painel Patio-View.
                      </p>

                  <div className="mb-5 grid gap-4 rounded-2xl border border-zinc-200/70 bg-zinc-50/60 p-4 sm:grid-cols-2">
                    <div>
                      <label className={`${iosLabel} flex items-center gap-1.5`}>
                        <Volume2 className="h-3.5 w-3.5" aria-hidden />
                        Volume do alerta
                      </label>
                      <input
                        type="range"
                        min={0.05}
                        max={1}
                        step={0.05}
                        value={chimeConfig.soundVolume}
                        onChange={(e) =>
                          setChimeConfig((c) => ({ ...c, soundVolume: Number(e.target.value) }))
                        }
                        className="mt-2 w-full accent-[#007AFF]"
                      />
                      <p className="mt-1 text-[11px] text-zinc-500">{Math.round(chimeConfig.soundVolume * 100)}%</p>
                    </div>
                    <div>
                      <label className={iosLabel}>Tom do bip</label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(
                          [
                            { id: 'chime' as const, label: 'Sino suave' },
                            { id: 'bell' as const, label: 'Campainha' },
                            { id: 'digital' as const, label: 'Digital' },
                          ] as const
                        ).map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setChimeConfig((c) => ({ ...c, soundPreset: p.id }))}
                            className={`rounded-xl px-3 py-2 text-[12px] font-semibold shadow-sm transition-all ${
                              chimeConfig.soundPreset === p.id
                                ? 'bg-[#007AFF] text-white shadow-blue-500/25'
                                : 'border border-zinc-200/90 bg-white text-zinc-700 hover:border-[#007AFF]/35'
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className={iosLabel}>Duração da faixa (s)</label>
                      <input
                        type="number"
                        min={8}
                        max={120}
                        value={chimeConfig.bannerSeconds}
                        onChange={(e) =>
                          setChimeConfig((c) => ({
                            ...c,
                            bannerSeconds: Math.min(120, Math.max(8, Number(e.target.value) || 8)),
                          }))
                        }
                        className={iosInput}
                      />
                    </div>
                    <div>
                      <label className={iosLabel}>Antecedência (min)</label>
                      <input
                        type="number"
                        min={0}
                        max={60}
                        value={chimeConfig.preNotifyMinutes}
                        onChange={(e) =>
                          setChimeConfig((c) => ({
                            ...c,
                            preNotifyMinutes: Math.min(60, Math.max(0, Number(e.target.value) || 0)),
                          }))
                        }
                        className={iosInput}
                      />
                      <label className="mt-2 flex cursor-pointer items-center gap-2 text-[12px] text-zinc-600">
                        <input
                          type="checkbox"
                          checked={chimeConfig.preNotifyPlaySound}
                          onChange={(e) =>
                            setChimeConfig((c) => ({ ...c, preNotifyPlaySound: e.target.checked }))
                          }
                          className="h-4 w-4 rounded border-zinc-300 text-[#007AFF] focus:ring-[#007AFF]/40"
                        />
                        Bip discreto no aviso antecipado
                      </label>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-200/80 bg-white/80 px-3 py-2.5 text-[13px] text-zinc-700 shadow-sm">
                        <input
                          type="checkbox"
                          checked={chimeConfig.weekendsQuiet}
                          onChange={(e) =>
                            setChimeConfig((c) => ({ ...c, weekendsQuiet: e.target.checked }))
                          }
                          className="h-4 w-4 rounded border-zinc-300 text-[#007AFF] focus:ring-[#007AFF]/40"
                        />
                        Silenciar sábados e domingos (expediente apenas em dias úteis)
                      </label>
                    </div>
                  </div>

                  <div className="mb-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void playTvChimeSound(chimeConfig.soundPreset, chimeConfig.soundVolume)}
                      className="inline-flex items-center gap-2 rounded-xl border border-zinc-200/90 bg-white px-3 py-2 text-[12px] font-semibold text-zinc-800 shadow-sm hover:border-[#007AFF]/40"
                    >
                      <Bell className="h-4 w-4 text-[#007AFF]" />
                      Testar som agora
                    </button>
                    <button
                      type="button"
                      onClick={() => setChimeConfig(defaultTvChimeSchedule())}
                      className="rounded-xl border border-zinc-200/90 bg-zinc-100/90 px-3 py-2 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-200/80"
                    >
                      Restaurar modelo (almoço + saída)
                    </button>
                  </div>

                  <div className="space-y-3">
                    {chimeConfig.alerts.map((a, idx) => (
                      <div
                        key={a.id}
                        className="rounded-2xl border border-zinc-200/80 bg-white/90 p-4 shadow-[0_4px_18px_-8px_rgba(0,0,0,0.08)]"
                      >
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400">
                            Aviso {idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setChimeConfig((c) => ({
                                ...c,
                                alerts: c.alerts.filter((x) => x.id !== a.id),
                              }))
                            }
                            className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                            aria-label="Remover aviso"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className={iosLabel}>Nome</label>
                            <input
                              value={a.label}
                              onChange={(e) => {
                                const v = e.target.value;
                                setChimeConfig((c) => ({
                                  ...c,
                                  alerts: c.alerts.map((x) => (x.id === a.id ? { ...x, label: v } : x)),
                                }));
                              }}
                              className={iosInput}
                              placeholder="Ex.: Almoço"
                            />
                          </div>
                          <div>
                            <label className={iosLabel}>Horário</label>
                            <input
                              type="time"
                              value={a.time}
                              onChange={(e) => {
                                const v = normalizeTimeHHmm(e.target.value);
                                setChimeConfig((c) => ({
                                  ...c,
                                  alerts: c.alerts.map((x) => (x.id === a.id ? { ...x, time: v } : x)),
                                }));
                              }}
                              className={iosInput}
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className={iosLabel}>Mensagem na faixa</label>
                            <textarea
                              value={a.message}
                              onChange={(e) => {
                                const v = e.target.value.slice(0, 280);
                                setChimeConfig((c) => ({
                                  ...c,
                                  alerts: c.alerts.map((x) => (x.id === a.id ? { ...x, message: v } : x)),
                                }));
                              }}
                              rows={2}
                              className={`${iosInput} resize-none min-h-[72px]`}
                            />
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-3">
                          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-zinc-600">
                            <input
                              type="checkbox"
                              checked={a.enabled}
                              onChange={(e) =>
                                setChimeConfig((c) => ({
                                  ...c,
                                  alerts: c.alerts.map((x) =>
                                    x.id === a.id ? { ...x, enabled: e.target.checked } : x
                                  ),
                                }))
                              }
                              className="h-4 w-4 rounded border-zinc-300 text-[#007AFF]"
                            />
                            Ativo
                          </label>
                          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-zinc-600">
                            <input
                              type="checkbox"
                              checked={a.playSound}
                              onChange={(e) =>
                                setChimeConfig((c) => ({
                                  ...c,
                                  alerts: c.alerts.map((x) =>
                                    x.id === a.id ? { ...x, playSound: e.target.checked } : x
                                  ),
                                }))
                              }
                              className="h-4 w-4 rounded border-zinc-300 text-[#007AFF]"
                            />
                            Som no horário
                          </label>
                        </div>
                        <div className="mt-3">
                          <p className={`${iosLabel} mb-2`}>Dias da semana</p>
                          <div className="flex flex-wrap gap-1.5">
                            {CHIME_WEEKDAY_OPTS.map((d) => {
                              const allDays = a.weekdays.length === 0;
                              const active = allDays || a.weekdays.includes(d.v);
                              return (
                                <button
                                  key={d.v}
                                  type="button"
                                  onClick={() =>
                                    setChimeConfig((c) => ({
                                      ...c,
                                      alerts: c.alerts.map((x) => {
                                        if (x.id !== a.id) return x;
                                        let next = [...x.weekdays];
                                        if (next.length === 0) next = [0, 1, 2, 3, 4, 5, 6];
                                        if (next.includes(d.v)) next = next.filter((n) => n !== d.v);
                                        else next = [...next, d.v].sort((p, q) => p - q);
                                        return { ...x, weekdays: next };
                                      }),
                                    }))
                                  }
                                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all ${
                                    active
                                      ? 'bg-[#007AFF] text-white shadow-sm'
                                      : 'border border-zinc-200/90 bg-zinc-50 text-zinc-500 hover:bg-zinc-100'
                                  }`}
                                >
                                  {d.short}
                                </button>
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            className="mt-2 text-[11px] font-semibold text-[#007AFF] hover:underline"
                            onClick={() =>
                              setChimeConfig((c) => ({
                                ...c,
                                alerts: c.alerts.map((x) =>
                                  x.id === a.id ? { ...x, weekdays: [1, 2, 3, 4, 5] } : x
                                ),
                              }))
                            }
                          >
                            Só seg–sex
                          </button>
                          <button
                            type="button"
                            className="mt-2 ml-3 text-[11px] font-semibold text-[#007AFF] hover:underline"
                            onClick={() =>
                              setChimeConfig((c) => ({
                                ...c,
                                alerts: c.alerts.map((x) =>
                                  x.id === a.id ? { ...x, weekdays: [] } : x
                                ),
                              }))
                            }
                          >
                            Todos os dias
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setChimeConfig((c) => ({
                        ...c,
                        alerts: [
                          ...c.alerts,
                          {
                            id: newTvChimeAlertId(),
                            label: 'Novo aviso',
                            time: '09:00',
                            enabled: true,
                            playSound: true,
                            weekdays: [1, 2, 3, 4, 5],
                            kind: 'custom',
                            message: 'Mensagem para a equipe.',
                          } satisfies TvChimeAlert,
                        ],
                      }))
                    }
                    className="mt-3 inline-flex items-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 px-4 py-3 text-[13px] font-semibold text-zinc-700 hover:border-[#007AFF]/45 hover:bg-blue-50/40"
                  >
                    <Plus className="h-4 w-4 text-[#007AFF]" />
                    Adicionar horário
                  </button>

                  <button
                    type="button"
                    onClick={() => void saveChime()}
                    disabled={chimeSaving || loading}
                    className="mt-5 w-full rounded-2xl bg-[#007AFF] py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-blue-500/25 transition-opacity hover:opacity-95 disabled:opacity-45 sm:w-auto sm:px-10"
                  >
                    {chimeSaving ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Salvando…
                      </span>
                    ) : (
                      'Salvar horários da TV'
                    )}
                  </button>
                    </div>
                  ) : null}
                </section>

                {/* Novo slide */}
                <section className={`${iosCard} p-5 sm:p-6`}>
                  <p className={iosLabel}>Novo slide</p>
                  <div className="mb-4 rounded-2xl border border-zinc-200/80 bg-zinc-50/90 px-3 py-2.5 text-[12px] text-zinc-600">
                    <span className="font-semibold text-zinc-800">Fluxo rápido:</span> escolha o tipo, preencha apenas o que aparecer e toque em <span className="font-semibold">Adicionar à rotação</span>.
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
                    {SLIDE_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => {
                          setNewType(t.value);
                          if (t.value === 'image' || t.value === 'video') setNewMediaFullscreen(true);
                        }}
                        className={`rounded-2xl px-2 py-3 text-center transition-all ${
                          newType === t.value
                            ? 'bg-[#007AFF] text-white shadow-md shadow-blue-500/30'
                            : 'bg-zinc-100/90 text-zinc-700 hover:bg-zinc-200/80'
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
                  <div className="mb-4 rounded-2xl bg-zinc-100/80 px-3 py-2 text-[12px] text-zinc-600">
                    <span className="font-semibold text-zinc-800">Tipo selecionado:</span>{' '}
                    {currentTypeMeta?.label} · {currentTypeMeta?.hint}
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
                        {newType === 'video' ? (
                          <TvCloudVideoBlock
                            fileInputId="tv-new-video-upload"
                            currentUrl={newMediaUrl}
                            onSelectUrl={setNewMediaUrl}
                            onFileChange={(e) => void handleVideoFileChange(e, 'new')}
                            uploading={uploading}
                            uploadFeedback={uploadFeedback}
                            videos={cloudVideos}
                            libraryLoading={mediaLibraryLoading}
                            onDeleteVideo={(item) => void handleDeleteMedia(item)}
                            deletingId={deletingMediaId}
                          />
                        ) : (
                          <>
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={handleFileChange}
                            />
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={uploading}
                              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-300/90 bg-zinc-50/80 py-8 text-[15px] font-medium text-zinc-600 hover:border-[#007AFF]/50 hover:bg-blue-50/50 transition-colors disabled:opacity-50"
                            >
                              {uploading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                              ) : (
                                <ImagePlus className="w-5 h-5 text-[#007AFF]" />
                              )}
                              {uploading ? 'Enviando…' : 'Toque para escolher imagem'}
                            </button>
                            <div>
                              <label className={iosLabel}>Ou cole uma URL</label>
                              <input
                                value={newMediaUrl}
                                onChange={(e) => setNewMediaUrl(e.target.value)}
                                className={iosInput}
                                placeholder="https://..."
                              />
                            </div>
                          </>
                        )}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-2xl bg-zinc-100/80">
                          <div>
                            <p className="text-[13px] font-semibold text-zinc-900">Mídia em tela cheia</p>
                            <p className="text-[11px] text-zinc-500 mt-0.5">
                              Preenche toda a área da TV (sem bordas). Ideal para imagens de fundo.
                            </p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={newMediaFullscreen}
                            onClick={() => setNewMediaFullscreen((v) => !v)}
                            className={`relative h-8 w-[51px] shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40 ${
                              newMediaFullscreen ? 'bg-[#34C759]' : 'bg-zinc-300'
                            }`}
                          >
                            <span
                              className={`absolute top-0.5 left-0.5 block h-7 w-7 rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${
                                newMediaFullscreen ? 'translate-x-[22px]' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                        <div>
                          <p className={iosLabel}>Encaixe na TV</p>
                          <p className="mb-2 text-[11px] text-zinc-500">
                            Evita imagem esticada: use <span className="font-semibold text-zinc-700">Inteira</span> para ver tudo com
                            proporção correta.
                          </p>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            {MEDIA_FIT_OPTIONS.map((o) => (
                              <button
                                key={o.value}
                                type="button"
                                onClick={() => setNewMediaObjectFit(o.value)}
                                className={`rounded-2xl px-2 py-3 text-center transition-all ${
                                  newMediaObjectFit === o.value
                                    ? 'bg-[#007AFF] text-white shadow-md shadow-blue-500/30'
                                    : 'bg-zinc-100/90 text-zinc-700'
                                }`}
                              >
                                <span className="block text-[12px] font-semibold leading-tight">{o.label}</span>
                                <span
                                  className={`mt-1 block text-[9px] leading-tight ${
                                    newMediaObjectFit === o.value ? 'text-white/85' : 'text-zinc-500'
                                  }`}
                                >
                                  {o.hint}
                                </span>
                              </button>
                            ))}
                          </div>
                          <p className="mt-2 text-[10px] text-zinc-500">
                            Vídeo do YouTube: o player usa a proporção padrão do serviço.
                          </p>
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

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-2xl bg-zinc-100/80">
                      <div>
                        <p className="text-[13px] font-semibold text-zinc-900">Som ao exibir este slide</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          Bip ao entrar neste slide na TV. Na TV o som do canto também precisa estar ligado.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={newPlaySound}
                        onClick={() => setNewPlaySound((v) => !v)}
                        className={`relative h-8 w-[51px] shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40 ${
                          newPlaySound ? 'bg-[#34C759]' : 'bg-zinc-300'
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
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-2xl bg-zinc-100/80">
                        <div>
                          <p className="text-[13px] font-semibold text-zinc-900">Este slide meta: valores em R$</p>
                          <p className="text-[11px] text-zinc-500 mt-0.5">
                            Ligado mostra atual e meta em reais; desligado mostra só a porcentagem na TV.
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={newGoalShowValues}
                          onClick={() => setNewGoalShowValues((v) => !v)}
                          className={`relative h-8 w-[51px] shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40 ${
                            newGoalShowValues ? 'bg-[#34C759]' : 'bg-zinc-300'
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
                        className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-zinc-900 py-3.5 px-6 text-[15px] font-semibold text-white shadow-lg active:scale-[0.99] transition-transform disabled:opacity-50"
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
                  <p className="text-[12px] text-zinc-500 mb-3">
                    Toque em <span className="font-semibold text-zinc-600">Editar</span> para abrir os campos, use ↑ ↓ para ordenar e{' '}
                    <span className="font-semibold text-zinc-600">Exibir imediatamente</span> para fixar 1 slide na TV.
                  </p>
                  <ul className="space-y-3">
                    {slides.map((s, idx) => (
                      <li key={s.id} className="space-y-2">
                        <div
                          className={`flex w-full flex-wrap items-stretch gap-2 rounded-2xl border px-3 py-2 transition-colors sm:flex-nowrap ${
                            s.pinImmediate
                              ? 'border-amber-400/50 bg-amber-50/50 ring-1 ring-amber-400/35'
                              : libraryPreviewId === s.id && previewTab === 'library'
                                ? 'border-transparent bg-[#007AFF]/12 ring-1 ring-[#007AFF]/30'
                                : 'border-transparent bg-zinc-50/90'
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
                            <p className="font-medium text-zinc-900 truncate text-[15px]">{s.title || '(sem título)'}</p>
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
                                  s.pinImmediate ? 'bg-amber-500' : 'bg-zinc-300'
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
                              className="rounded-xl bg-zinc-200/80 p-2 text-zinc-700 disabled:opacity-35"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              title="Descer"
                              disabled={idx >= slides.length - 1 || loading}
                              onClick={() => void moveSlide(idx, 1)}
                              className="rounded-xl bg-zinc-200/80 p-2 text-zinc-700 disabled:opacity-35"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              title="Editar"
                              onClick={() => startEdit(s)}
                              className={`rounded-xl px-3 py-2 text-[11px] font-semibold text-zinc-800 ${
                                editingSlideId === s.id ? 'bg-[#007AFF] text-white' : 'bg-zinc-200/80'
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
                              className="rounded-xl bg-zinc-200/80 px-3 py-2 text-[11px] font-semibold text-zinc-800"
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
                                      : 'bg-zinc-100/90 text-zinc-700 hover:bg-zinc-200/80'
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
                                {editForm.slideType === 'video' ? (
                                  <TvCloudVideoBlock
                                    fileInputId={`tv-edit-video-upload-${editingSlideId}`}
                                    currentUrl={editForm.mediaUrl}
                                    onSelectUrl={(url) =>
                                      setEditForm((f) => (f ? { ...f, mediaUrl: url } : f))
                                    }
                                    onFileChange={(e) => void handleVideoFileChange(e, 'edit')}
                                    uploading={uploading}
                                    uploadFeedback={uploadFeedback}
                                    videos={cloudVideos}
                                    libraryLoading={mediaLibraryLoading}
                                    onDeleteVideo={(item) => void handleDeleteMedia(item)}
                                    deletingId={deletingMediaId}
                                  />
                                ) : (
                                  <>
                                    <input
                                      ref={editFileInputRef}
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={handleEditFileChange}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => editFileInputRef.current?.click()}
                                      disabled={uploading}
                                      className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-300/90 bg-zinc-50/80 py-6 text-[14px] font-medium text-zinc-600 hover:border-[#007AFF]/50 disabled:opacity-50"
                                    >
                                      {uploading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                      ) : (
                                        <ImagePlus className="w-5 h-5 text-[#007AFF]" />
                                      )}
                                      {uploading ? 'Enviando…' : 'Substituir imagem'}
                                    </button>
                                    <div>
                                      <label className={iosLabel}>URL</label>
                                      <input
                                        value={editForm.mediaUrl}
                                        onChange={(e) =>
                                          setEditForm((f) => (f ? { ...f, mediaUrl: e.target.value } : f))
                                        }
                                        className={iosInput}
                                        placeholder="https://..."
                                      />
                                    </div>
                                  </>
                                )}
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-2xl bg-zinc-100/80">
                                  <div>
                                    <p className="text-[13px] font-semibold text-zinc-900">Mídia em tela cheia</p>
                                    <p className="text-[11px] text-zinc-500 mt-0.5">
                                      Ligado: imagem/vídeo ocupa toda a área da TV.
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={editForm.mediaFullscreen}
                                    onClick={() =>
                                      setEditForm((f) => (f ? { ...f, mediaFullscreen: !f.mediaFullscreen } : f))
                                    }
                                    className={`relative h-8 w-[51px] shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40 ${
                                      editForm.mediaFullscreen ? 'bg-[#34C759]' : 'bg-zinc-300'
                                    }`}
                                  >
                                    <span
                                      className={`absolute top-0.5 left-0.5 block h-7 w-7 rounded-full bg-white shadow-md transition-transform duration-200 ease-out ${
                                        editForm.mediaFullscreen ? 'translate-x-[22px]' : 'translate-x-0'
                                      }`}
                                    />
                                  </button>
                                </div>
                                <div>
                                  <p className={iosLabel}>Encaixe na TV</p>
                                  <p className="mb-2 text-[11px] text-zinc-500">
                                    <span className="font-semibold text-zinc-700">Inteira</span> mostra a imagem inteira sem cortar nem
                                    esticar (faixas pretas se precisar).
                                  </p>
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                    {MEDIA_FIT_OPTIONS.map((o) => (
                                      <button
                                        key={o.value}
                                        type="button"
                                        onClick={() =>
                                          setEditForm((f) => (f ? { ...f, mediaObjectFit: o.value } : f))
                                        }
                                        className={`rounded-2xl px-2 py-3 text-center transition-all ${
                                          editForm.mediaObjectFit === o.value
                                            ? 'bg-[#007AFF] text-white shadow-md shadow-blue-500/30'
                                            : 'bg-zinc-100/90 text-zinc-700'
                                        }`}
                                      >
                                        <span className="block text-[12px] font-semibold leading-tight">{o.label}</span>
                                        <span
                                          className={`mt-1 block text-[9px] leading-tight ${
                                            editForm.mediaObjectFit === o.value ? 'text-white/85' : 'text-zinc-500'
                                          }`}
                                        >
                                          {o.hint}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
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
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-2xl bg-zinc-100/80">
                              <div>
                                <p className="text-[13px] font-semibold text-zinc-900">Som ao exibir este slide</p>
                                <p className="text-[11px] text-zinc-500 mt-0.5">
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
                                  editForm.playSound ? 'bg-[#34C759]' : 'bg-zinc-300'
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
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-2xl bg-zinc-100/80">
                                <div>
                                  <p className="text-[13px] font-semibold text-zinc-900">Este slide meta: valores em R$</p>
                                  <p className="text-[11px] text-zinc-500 mt-0.5">
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
                                    editForm.goalShowValues ? 'bg-[#34C759]' : 'bg-zinc-300'
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
                                  className="rounded-2xl border border-zinc-300/90 px-5 py-3 text-[14px] font-semibold text-zinc-700"
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
                    <p className="text-[13px] text-zinc-500 py-4 text-center">Nenhum slide — a TV mostra só os veículos.</p>
                  )}
                </section>

                {error && <p className="text-[13px] text-red-600 px-1">{error}</p>}
              </>
            )}
          </div>
        </div>
      </div>
      </div>
    </ModalPortal>
  );
};
