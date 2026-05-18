import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Search,
  Settings2,
} from 'lucide-react';
import { ErrorBulletinEditorModal } from '../ErrorBulletinEditorModal';
import {
  getErrorBulletins,
  type ErrorBulletin,
  type ErrorBulletinStatus,
} from '../../services/apiService';
import type { AuthSession } from '../../services/apiService';
import { ERROR_BULLETIN_ICON } from '../../constants/errorBulletinIcon';

const SETTINGS_KEY = 'app_error_bulletin_settings_v1';

type BulletinSettings = {
  viewMode: 'grid' | 'list';
  statusFilter: 'all' | ErrorBulletinStatus;
  showArchived: boolean;
};

const DEFAULT_SETTINGS: BulletinSettings = {
  viewMode: 'grid',
  statusFilter: 'all',
  showArchived: false,
};

function loadSettings(): BulletinSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw) as Partial<BulletinSettings>;
    return {
      viewMode: p.viewMode === 'list' ? 'list' : 'grid',
      statusFilter:
        p.statusFilter === 'draft' || p.statusFilter === 'published' || p.statusFilter === 'archived'
          ? p.statusFilter
          : 'all',
      showArchived: !!p.showArchived,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: BulletinSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch (_) {}
}

function parseDtcPreview(dtc: string): string[] {
  return dtc
    .split(/[\n,;]+/)
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 6);
}

const STATUS_LABEL: Record<ErrorBulletinStatus, string> = {
  draft: 'Rascunho',
  published: 'Publicado',
  archived: 'Arquivado',
};

const STATUS_SOLID: Record<ErrorBulletinStatus, string> = {
  draft: 'bg-zinc-500 text-white',
  published: 'bg-emerald-500 text-white',
  archived: 'bg-violet-500 text-white',
};

const shell =
  'rounded-[22px] border border-zinc-200/80 dark:border-white/[0.08] bg-white/75 dark:bg-zinc-900/45 backdrop-blur-2xl ' +
  'shadow-[0_12px_40px_-12px_rgba(0,0,0,0.12)] dark:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.45)]';

export const ErrorBulletinView: React.FC<{ authSession?: AuthSession | null }> = ({ authSession }) => {
  const [settings, setSettings] = useState<BulletinSettings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [items, setItems] = useState<ErrorBulletin[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editorId, setEditorId] = useState<string | null | undefined>(undefined);
  const [editorOpen, setEditorOpen] = useState(false);

  const authorName =
    authSession?.displayName ?? authSession?.username ?? (authSession?.role === 'admin' ? 'Administrador' : '');
  const authorUserId = authSession?.userId ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status =
        settings.statusFilter === 'all'
          ? settings.showArchived
            ? 'all'
            : undefined
          : settings.statusFilter;
      const data = await getErrorBulletins({
        status: status === 'all' ? 'all' : status,
        q: search.trim() || undefined,
      });
      let list = data;
      if (!settings.showArchived && settings.statusFilter === 'all') {
        list = list.filter((b) => b.status !== 'archived');
      }
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar os boletins.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [search, settings.showArchived, settings.statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const list = items ?? [];
    return {
      total: list.length,
      published: list.filter((b) => b.status === 'published').length,
      draft: list.filter((b) => b.status === 'draft').length,
      withDtc: list.filter((b) => parseDtcPreview(b.dtcCodes).length > 0).length,
    };
  }, [items]);

  const persistSettings = (next: BulletinSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  const openCreate = () => {
    setEditorId(null);
    setEditorOpen(true);
  };

  const openEdit = (id: string) => {
    setEditorId(id);
    setEditorOpen(true);
  };

  return (
    <div className="relative flex min-h-full flex-col gap-4 px-4 pb-28 pt-[max(0.5rem,env(safe-area-inset-top))] md:px-8 md:pb-10 md:pt-8">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-30 dark:opacity-20" aria-hidden>
        <div className="absolute -left-16 top-0 h-72 w-72 rounded-full bg-amber-400/35 blur-[100px]" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-orange-500/20 blur-[110px]" />
      </div>

      <header className={`relative overflow-hidden ${shell} p-5 md:p-6`}>
        <div className="absolute inset-0 bg-amber-500 pointer-events-none" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100">
              Base técnica da oficina
            </p>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-[1.75rem]">
              <img src={ERROR_BULLETIN_ICON} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover" />
              Boletim de Erros
            </h1>
            <p className="max-w-xl text-[14px] leading-relaxed text-amber-50">
              Registre DTC do scanner, sintomas, soluções e anexos para consulta rápida da equipe.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-2xl bg-white/20 px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-white/30 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-[13px] font-semibold transition ${
                settingsOpen ? 'bg-white text-amber-700' : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              <Settings2 className="h-4 w-4" />
              Configurações
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-4 py-2 text-[13px] font-semibold text-white shadow-lg transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900"
            >
              <Plus className="h-4 w-4" />
              Novo boletim
            </button>
          </div>
        </div>

        {settingsOpen ? (
          <div className="relative mt-5 border-t border-white/25 pt-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/15 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase text-amber-100">Visualização</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => persistSettings({ ...settings, viewMode: 'grid' })}
                    className={`flex-1 rounded-xl py-2 text-[12px] font-semibold ${
                      settings.viewMode === 'grid' ? 'bg-white text-amber-800' : 'bg-white/20 text-white'
                    }`}
                  >
                    <LayoutGrid className="mx-auto h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => persistSettings({ ...settings, viewMode: 'list' })}
                    className={`flex-1 rounded-xl py-2 text-[12px] font-semibold ${
                      settings.viewMode === 'list' ? 'bg-white text-amber-800' : 'bg-white/20 text-white'
                    }`}
                  >
                    <List className="mx-auto h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="rounded-2xl bg-white/15 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase text-amber-100">Filtro padrão</p>
                <select
                  value={settings.statusFilter}
                  onChange={(e) =>
                    persistSettings({
                      ...settings,
                      statusFilter: e.target.value as BulletinSettings['statusFilter'],
                    })
                  }
                  className="w-full rounded-xl border-0 bg-white/90 px-3 py-2 text-[13px] font-medium text-zinc-900"
                >
                  <option value="all">Todos (exc. arquivados)</option>
                  <option value="published">Publicados</option>
                  <option value="draft">Rascunhos</option>
                  <option value="archived">Arquivados</option>
                </select>
              </div>
              <div className="rounded-2xl bg-white/15 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase text-amber-100">Arquivados</p>
                <button
                  type="button"
                  onClick={() => persistSettings({ ...settings, showArchived: !settings.showArchived })}
                  className={`w-full rounded-xl py-2 text-[13px] font-semibold ${
                    settings.showArchived ? 'bg-white text-amber-800' : 'bg-white/20 text-white'
                  }`}
                >
                  {settings.showArchived ? 'Incluídos na lista' : 'Ocultos por padrão'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Registros', value: stats.total, card: 'border-amber-600 bg-amber-500' },
          { label: 'Publicados', value: stats.published, card: 'border-emerald-600 bg-emerald-500' },
          { label: 'Rascunhos', value: stats.draft, card: 'border-zinc-600 bg-zinc-500' },
          { label: 'Com DTC', value: stats.withDtc, card: 'border-orange-600 bg-orange-500' },
        ].map((k) => (
          <div
            key={k.label}
            className={`rounded-2xl border p-4 text-white shadow-md ${k.card}`}
          >
            <p className="text-[12px] font-semibold text-white/90">{k.label}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{loading ? '—' : k.value}</p>
          </div>
        ))}
      </div>

      <div className={`${shell} p-4`}>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar DTC, veículo, sintoma, solução, tag…"
            className="w-full rounded-2xl border border-zinc-200/90 bg-white py-2.5 pl-10 pr-4 text-[14px] outline-none focus:ring-2 focus:ring-amber-500/30 dark:border-white/[0.1] dark:bg-zinc-950 dark:text-white"
          />
        </div>

        {error ? (
          <p className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-300">{error}</p>
        ) : null}

        {loading && !items ? (
          <div className="flex flex-col items-center gap-3 py-16 text-zinc-500">
            <RefreshCw className="h-10 w-10 animate-spin text-amber-500" />
            <p>Carregando boletins…</p>
          </div>
        ) : items && items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500" />
            <p className="text-[15px] font-medium text-zinc-700 dark:text-zinc-300">Nenhum registro encontrado.</p>
            <button
              type="button"
              onClick={openCreate}
              className="rounded-xl bg-amber-500 px-4 py-2 text-[14px] font-semibold text-white"
            >
              Criar primeiro boletim
            </button>
          </div>
        ) : (
          <div
            className={
              settings.viewMode === 'grid'
                ? 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3'
                : 'flex flex-col gap-2'
            }
          >
            {(items ?? []).map((b) => {
              const dtcs = parseDtcPreview(b.dtcCodes);
              const vehicle = [b.vehicleBrand, b.vehicleModel, b.vehicleYear].filter(Boolean).join(' ');
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => openEdit(b.id)}
                  className={`group w-full rounded-2xl border border-zinc-200/80 bg-white p-4 text-left transition hover:border-amber-400/60 hover:shadow-md dark:border-white/[0.08] dark:bg-zinc-950/50 dark:hover:border-amber-500/40 ${
                    settings.viewMode === 'list' ? 'flex flex-wrap items-start gap-3' : ''
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${STATUS_SOLID[b.status]}`}>
                      {STATUS_LABEL[b.status]}
                    </span>
                    {b.plate ? (
                      <span className="rounded-lg bg-zinc-800 px-2 py-0.5 font-mono text-[11px] font-semibold text-white">
                        {b.plate}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="text-[15px] font-bold text-zinc-900 dark:text-white">
                    {b.title || vehicle || 'Sem título'}
                  </h3>
                  {vehicle ? <p className="mt-0.5 text-[13px] text-zinc-600 dark:text-zinc-400">{vehicle}</p> : null}
                  {dtcs.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {dtcs.map((c) => (
                        <span
                          key={c}
                          className="rounded-md bg-amber-500 px-1.5 py-0.5 font-mono text-[11px] font-bold text-white"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {b.symptoms ? (
                    <p className="mt-2 line-clamp-2 text-[13px] text-zinc-600 dark:text-zinc-400">{b.symptoms}</p>
                  ) : null}
                  {b.solution ? (
                    <p className="mt-1 line-clamp-2 text-[13px] text-emerald-700 dark:text-emerald-400">
                      <strong>Solução:</strong> {b.solution}
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <ErrorBulletinEditorModal
        open={editorOpen}
        bulletinId={editorId ?? null}
        authorName={authorName}
        authorUserId={authorUserId}
        onClose={() => {
          setEditorOpen(false);
          setEditorId(undefined);
        }}
        onSaved={() => void load()}
      />
    </div>
  );
};
