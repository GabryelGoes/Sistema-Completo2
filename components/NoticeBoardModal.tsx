import React, { useEffect, useMemo, useState } from "react";
import { Plus, X, Edit3, Trash2, Monitor, Sparkles } from "lucide-react";
import {
  type WorkshopNotice,
  type WeeklyGoal,
  getNotices,
  createNotice,
  updateNotice,
  deleteNotice,
  getWeeklyGoal,
  updateWeeklyGoal,
} from "../services/apiService";

interface NoticeBoardModalProps {
  open: boolean;
  onClose: () => void;
}

type EditingState =
  | { mode: "idle" }
  | { mode: "create"; draft: Partial<WorkshopNotice> }
  | { mode: "edit"; id: string; draft: Partial<WorkshopNotice> };

const emptyDraft: Partial<WorkshopNotice> = {
  title: "",
  body: "",
  highlight: false,
  active: true,
};

export const NoticeBoardModal: React.FC<NoticeBoardModalProps> = ({ open, onClose }) => {
  const [notices, setNotices] = useState<WorkshopNotice[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingState>({ mode: "idle" });

  const [weeklyGoal, setWeeklyGoal] = useState<WeeklyGoal | null>(null);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklySaving, setWeeklySaving] = useState(false);
  const [targetInput, setTargetInput] = useState<string>("");
  const [addInput, setAddInput] = useState<string>("");

  const orderedNotices = useMemo(
    () => [...notices].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.createdAt.localeCompare(b.createdAt)),
    [notices]
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setWeeklyError(null);

    setLoading(true);
    setWeeklyLoading(true);

    getNotices()
      .then((data) => setNotices(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao carregar avisos"))
      .finally(() => setLoading(false));

    getWeeklyGoal()
      .then((goal) => {
        setWeeklyGoal(goal);
        if (goal) {
          setTargetInput(goal.targetAmount.toString());
        } else {
          setTargetInput("");
        }
      })
      .catch((err) => setWeeklyError(err instanceof Error ? err.message : "Falha ao carregar meta semanal"))
      .finally(() => setWeeklyLoading(false));
  }, [open]);

  const handleStartCreate = () => {
    setEditing({ mode: "create", draft: { ...emptyDraft, sortOrder: (notices[notices.length - 1]?.sortOrder ?? 0) + 1 } });
  };

  const handleStartEdit = (notice: WorkshopNotice) => {
    setEditing({
      mode: "edit",
      id: notice.id,
      draft: {
        title: notice.title,
        body: notice.body,
        highlight: notice.highlight,
        active: notice.active,
        sortOrder: notice.sortOrder,
      },
    });
  };

  const handleCancelEdit = () => setEditing({ mode: "idle" });

  const handleChangeDraft = (field: keyof WorkshopNotice, value: unknown) => {
    if (editing.mode === "idle") return;
    setEditing({ ...editing, draft: { ...editing.draft, [field]: value } });
  };

  const handleSave = async () => {
    if (editing.mode === "idle") return;
    const { draft } = editing;
    const title = (draft.title ?? "").toString().trim();
    const body = (draft.body ?? "").toString().trim();
    if (!title) {
      setError("Informe um título para o aviso.");
      return;
    }
    if (!body) {
      setError("Informe o texto do aviso.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing.mode === "create") {
        const created = await createNotice({
          title,
          body,
          highlight: !!draft.highlight,
          active: draft.active !== false,
          sortOrder: draft.sortOrder ?? (notices[notices.length - 1]?.sortOrder ?? 0) + 1,
        });
        setNotices((prev) => [...prev, created]);
      } else {
        const updated = await updateNotice(editing.id, {
          title,
          body,
          highlight: !!draft.highlight,
          active: draft.active !== false,
          sortOrder: draft.sortOrder,
        });
        setNotices((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      }
      setEditing({ mode: "idle" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o aviso.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Remover este aviso do quadro de avisos da TV?")) return;
    try {
      await deleteNotice(id);
      setNotices((prev) => prev.filter((n) => n.id !== id));
      if (editing.mode === "edit" && editing.id === id) {
        setEditing({ mode: "idle" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir o aviso.");
    }
  };

  const currency = useMemo(
    () =>
      new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 2,
      }),
    []
  );

  const progressPercent = useMemo(() => {
    if (!weeklyGoal || !weeklyGoal.targetAmount || weeklyGoal.targetAmount <= 0) return 0;
    const pct = (weeklyGoal.currentAmount / weeklyGoal.targetAmount) * 100;
    if (!Number.isFinite(pct)) return 0;
    return Math.max(0, Math.min(130, pct)); // permite passar um pouco da meta
  }, [weeklyGoal]);

  const handleSaveTarget = async () => {
    const value = parseFloat(targetInput.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      setWeeklyError("Informe um valor de meta semanal maior que zero.");
      return;
    }
    setWeeklySaving(true);
    setWeeklyError(null);
    try {
      const updated = await updateWeeklyGoal({ targetAmount: value });
      setWeeklyGoal(updated);
      setTargetInput(updated.targetAmount.toString());
    } catch (err) {
      setWeeklyError(err instanceof Error ? err.message : "Não foi possível salvar a meta semanal.");
    } finally {
      setWeeklySaving(false);
    }
  };

  const handleAddAmount = async () => {
    const value = parseFloat(addInput.replace(",", "."));
    if (!Number.isFinite(value) || value === 0) {
      setWeeklyError("Informe um valor recebido diferente de zero.");
      return;
    }
    setWeeklySaving(true);
    setWeeklyError(null);
    try {
      const updated = await updateWeeklyGoal({ addAmount: value });
      setWeeklyGoal(updated);
      setAddInput("");
      if (!targetInput && updated.targetAmount > 0) {
        setTargetInput(updated.targetAmount.toString());
      }
    } catch (err) {
      setWeeklyError(err instanceof Error ? err.message : "Não foi possível atualizar o faturamento da semana.");
    } finally {
      setWeeklySaving(false);
    }
  };

  if (!open) return null;

  const hasEditing = editing.mode !== "idle";

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/70 backdrop-blur-2xl p-4 overflow-y-auto">
      <div className="w-full max-w-5xl my-6 rounded-3xl bg-zinc-950/90 border border-white/10 shadow-[0_40px_120px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 sm:px-8 pt-5 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-[0_8px_30px_rgba(251,191,36,0.75)] flex items-center justify-center">
              <Monitor className="w-5 h-5 text-black" strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight flex items-center gap-2">
                Quadro de avisos
                <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                  <Sparkles className="w-3 h-3" />
                  TV do pátio
                </span>
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                Crie avisos que serão exibidos no painel do Pátio (TV), em uma página exclusiva da paginação.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 text-zinc-300 hover:text-white flex items-center justify-center border border-white/10 transition-colors"
            aria-label="Fechar quadro de avisos"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="px-6 sm:px-8 py-2 text-xs sm:text-sm text-red-300 bg-red-900/30 border-b border-red-500/30">
            {error}
          </div>
        )}

        <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-white/10">
          <div className="w-full md:w-7/12 p-5 sm:p-6 md:p-7 space-y-4 md:space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">AVISOS ATIVOS</p>
                <p className="text-[13px] text-zinc-400 mt-0.5">
                  Estes avisos irão rodar no painel da TV junto com os veículos.
                </p>
              </div>
              <button
                type="button"
                onClick={handleStartCreate}
                className="inline-flex items-center gap-2 rounded-full bg-white text-zinc-950 px-4 py-2 text-xs sm:text-sm font-semibold shadow-[0_10px_30px_rgba(0,0,0,0.6)] hover:bg-amber-100 active:scale-[0.98] transition-all"
              >
                <Plus className="w-4 h-4" />
                Novo aviso
              </button>
            </div>

            <div className="mt-1 space-y-2 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
              {loading && notices.length === 0 && (
                <div className="py-10 text-center text-sm text-zinc-500">Carregando avisos…</div>
              )}
              {!loading && notices.length === 0 && (
                <div className="py-10 text-center text-sm text-zinc-500">
                  Nenhum aviso criado ainda. Clique em <span className="font-semibold text-amber-300">Novo aviso</span> para começar.
                </div>
              )}
              {orderedNotices.map((notice) => {
                const isInactive = !notice.active;
                const isEditing = editing.mode === "edit" && editing.id === notice.id;
                return (
                  <button
                    key={notice.id}
                    type="button"
                    onClick={() => handleStartEdit(notice)}
                    className={`group w-full text-left rounded-2xl px-4 py-3.5 mb-1.5 border ${
                      isInactive
                        ? "border-zinc-700/60 bg-zinc-900/60"
                        : notice.highlight
                        ? "border-amber-400/70 bg-gradient-to-r from-amber-500/15 via-amber-400/10 to-amber-300/5"
                        : "border-zinc-700/70 bg-zinc-900/70"
                    } hover:border-amber-300/80 hover:bg-zinc-900 transition-all flex items-start gap-3`}
                  >
                    <div className="mt-0.5 flex flex-col items-center gap-1 text-[10px] text-zinc-500">
                      <span className="w-1 h-6 rounded-full bg-gradient-to-b from-amber-400 to-emerald-400 opacity-70 group-hover:opacity-100" />
                      <span className="px-1.5 py-0.5 rounded-full bg-zinc-900/80 border border-zinc-700/70">
                        TV
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-zinc-50 truncate">{notice.title}</p>
                        {notice.highlight && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/60 text-amber-200 font-medium">
                            Destaque
                          </span>
                        )}
                        {isInactive && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800/80 border border-zinc-600 text-zinc-300 font-medium">
                            Pausado
                          </span>
                        )}
                        {isEditing && (
                          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400 text-emerald-200 font-medium">
                            Editando
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{notice.body}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2 ml-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(notice.id);
                        }}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-red-300 hover:bg-red-900/40 transition-colors"
                        aria-label="Excluir aviso"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="w-full md:w-5/12 p-5 sm:p-6 md:p-7 bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900/95">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">PREVIEW</p>
                <p className="text-[13px] text-zinc-400 mt-0.5">
                  Como o aviso será visto na TV.
                </p>
              </div>
              {hasEditing && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200 underline-offset-2 hover:underline"
                >
                  Cancelar edição
                </button>
              )}
            </div>

            <div className="aspect-video w-full rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-950 to-black border border-white/10 shadow-[0_25px_80px_rgba(0,0,0,0.9)] overflow-hidden flex items-center justify-center px-6">
              <div className="w-full text-center space-y-3">
                <p className="text-[11px] tracking-[0.22em] text-zinc-500 uppercase">
                  Quadro de avisos · Pátio
                </p>
                <h3 className="text-xl sm:text-2xl font-semibold text-zinc-50 tracking-tight">
                  {editing.mode !== "idle" && editing.draft.title
                    ? editing.draft.title
                    : "Sem aviso selecionado"}
                </h3>
                <p className="text-[13px] text-zinc-300 max-w-md mx-auto leading-relaxed line-clamp-4">
                  {editing.mode !== "idle" && editing.draft.body
                    ? editing.draft.body
                    : "Selecione um aviso existente ou clique em “Novo aviso” para criar um conteúdo que será exibido no painel da TV."}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-zinc-400">Configurações do aviso</p>
                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Sincronizado com TV
                </div>
              </div>

              <div className="space-y-3 rounded-2xl bg-white/3 border border-white/10 p-4">
                <input
                  type="text"
                  value={(editing.mode !== "idle" && editing.draft.title) || ""}
                  onChange={(e) => handleChangeDraft("title", e.target.value)}
                  placeholder="Título do aviso (ex.: Atenção aos horários)"
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60 focus:border-amber-400/60"
                />
                <textarea
                  value={(editing.mode !== "idle" && editing.draft.body) || ""}
                  onChange={(e) => handleChangeDraft("body", e.target.value)}
                  placeholder="Texto do aviso que será exibido na TV. Seja direto e objetivo."
                  className="w-full min-h-[90px] rounded-xl bg-black/40 border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60 focus:border-amber-400/60 resize-none"
                />
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-[13px] text-zinc-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editing.mode !== "idle" ? editing.draft.highlight ?? false : false}
                      onChange={(e) => handleChangeDraft("highlight", e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-600 bg-black text-amber-400 focus:ring-amber-400"
                    />
                    <span>Destaque visual na TV</span>
                  </label>
                  <label className="flex items-center gap-2 text-[13px] text-zinc-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editing.mode !== "idle" ? editing.draft.active !== false : true}
                      onChange={(e) => handleChangeDraft("active", e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-600 bg-black text-emerald-400 focus:ring-emerald-400"
                    />
                    <span>Exibir na TV</span>
                  </label>
                </div>
              </div>

              <button
                type="button"
                disabled={!hasEditing || saving}
                onClick={handleSave}
                className="mt-1 inline-flex items-center justify-center w-full rounded-2xl bg-amber-400 text-zinc-950 text-sm font-semibold py-2.5 shadow-[0_12px_40px_rgba(245,158,11,0.55)] hover:bg-amber-300 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none transition-all gap-2"
              >
                <Edit3 className="w-4 h-4" />
                {saving ? "Salvando..." : editing.mode === "edit" ? "Salvar alterações" : "Criar aviso"}
              </button>

              {/* Meta semanal - barra de progresso */}
              <div className="mt-6 rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                      META SEMANAL
                    </p>
                    <p className="text-[13px] text-zinc-400 mt-0.5">
                      Acompanhe o faturamento da semana exibido no quadro de avisos.
                    </p>
                  </div>
                  {weeklyLoading && (
                    <span className="text-[11px] text-zinc-500">Carregando…</span>
                  )}
                </div>

                {weeklyError && (
                  <p className="text-[11px] text-red-300">
                    {weeklyError}
                  </p>
                )}

                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] text-zinc-300">
                      {weeklyGoal && weeklyGoal.targetAmount > 0
                        ? `${currency.format(weeklyGoal.currentAmount)} / ${currency.format(weeklyGoal.targetAmount)}`
                        : "Defina uma meta para começar."}
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      {progressPercent.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-amber-500 transition-all"
                      style={{ width: `${Math.min(progressPercent, 130)}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-zinc-400 block">
                      Meta da semana (R$)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={targetInput}
                        onChange={(e) => setTargetInput(e.target.value)}
                        className="flex-1 rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-400/60 focus:border-amber-400/60"
                        placeholder="Ex.: 15000"
                      />
                      <button
                        type="button"
                        onClick={handleSaveTarget}
                        disabled={weeklySaving}
                        className="px-3 py-2 rounded-xl bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-400 active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                      >
                        Definir
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] text-zinc-400 block">
                      Registrar recebimento (R$)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={addInput}
                        onChange={(e) => setAddInput(e.target.value)}
                        className="flex-1 rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-400/60 focus:border-emerald-400/60"
                        placeholder="Ex.: 750"
                      />
                      <button
                        type="button"
                        onClick={handleAddAmount}
                        disabled={weeklySaving}
                        className="px-3 py-2 rounded-xl bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-400 active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                      >
                        Somar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

