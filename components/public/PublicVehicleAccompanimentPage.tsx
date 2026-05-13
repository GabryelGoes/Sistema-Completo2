import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Star, CheckCircle2 } from 'lucide-react';
import type { PublicVehicleAccompanimentPayload, VehicleAccompanimentMarker } from '../../services/apiService';
import {
  getPublicVehicleAccompaniment,
  submitPublicVehicleAccompanimentRatings,
} from '../../services/apiService';

const pubCard =
  'relative overflow-hidden rounded-[22px] border border-white/55 dark:border-white/[0.09] ' +
  'bg-gradient-to-br from-white/96 via-white/[0.9] to-zinc-50/94 dark:from-zinc-900/90 dark:via-zinc-900/75 dark:to-zinc-950/92 backdrop-blur-2xl ' +
  'shadow-[0_1px_0_rgba(255,255,255,0.65)_inset,0_8px_32px_-8px_rgba(15,23,42,0.1),0_20px_48px_-16px_rgba(0,122,255,0.12),0_12px_36px_-12px_rgba(245,208,11,0.08)] ' +
  'dark:shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_14px_44px_-12px_rgba(0,0,0,0.5),0_24px_56px_-20px_rgba(0,122,255,0.15)]';

const pubCardAccent =
  'pointer-events-none absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-[#007AFF] via-violet-500 to-brand-yellow opacity-90';

const pubSectionTitle =
  'text-[11px] font-bold uppercase tracking-[0.14em] bg-gradient-to-r from-[#007AFF] via-violet-500 to-amber-600 bg-clip-text text-transparent';

function StarRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200">{label}</span>
      <div className="flex items-center gap-1.5" role="group" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            className="p-1.5 rounded-xl transition-all duration-200 active:scale-95 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]/50 hover:bg-amber-400/10"
            aria-pressed={value === n}
            aria-label={`${n} estrelas`}
          >
            <Star
              className={`h-8 w-8 transition-all ${
                n <= value
                  ? 'fill-amber-400 text-amber-500 drop-shadow-[0_2px_8px_rgba(245,158,11,0.55)] scale-105'
                  : 'fill-transparent text-zinc-300 dark:text-zinc-600'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function hasApprovedItems(b: { services?: unknown; parts?: unknown }): boolean {
  const sv = Array.isArray(b.services) ? b.services : [];
  const pt = Array.isArray(b.parts) ? b.parts : [];
  return (
    sv.some((s: { approved?: unknown }) => s && s.approved === true) ||
    pt.some((p: { approved?: unknown }) => p && p.approved === true)
  );
}

function BudgetBlock({ budget }: { budget: PublicVehicleAccompanimentPayload['budgets'][0] }) {
  const services = Array.isArray(budget.services) ? budget.services : [];
  const parts = Array.isArray(budget.parts) ? budget.parts : [];
  const apServ = services.filter((s: { approved?: boolean }) => s && s.approved === true);
  const apParts = parts.filter((p: { approved?: boolean }) => p && p.approved === true);
  if (!hasApprovedItems(budget)) return null;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/95 via-white/80 to-sky-50/70 p-4 shadow-[0_8px_28px_-10px_rgba(16,185,129,0.2)] dark:border-emerald-500/20 dark:from-emerald-950/35 dark:via-zinc-900/60 dark:to-sky-950/25 dark:shadow-[0_12px_36px_-12px_rgba(52,211,153,0.08)] space-y-3">
      {budget.diagnosis ? (
        <div>
          <p className={`${pubSectionTitle} mb-1 block`}>Diagnóstico</p>
          <p className="text-[14px] text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
            {budget.diagnosis}
          </p>
        </div>
      ) : null}
      {apServ.length > 0 ? (
        <div>
          <p className={`${pubSectionTitle} mb-1 block`}>Serviços aprovados</p>
          <ul className="list-disc pl-4 space-y-1 text-[14px] text-zinc-800 dark:text-zinc-200">
            {apServ.map((s: { description?: string }, i: number) => (
              <li key={`s-${i}`}>{(s.description ?? '').trim() || '—'}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {apParts.length > 0 ? (
        <div>
          <p className={`${pubSectionTitle} mb-1 block`}>Peças aprovadas</p>
          <ul className="list-disc pl-4 space-y-1 text-[14px] text-zinc-800 dark:text-zinc-200">
            {apParts.map((p: { description?: string; quantity?: string }, i: number) => (
              <li key={`p-${i}`}>
                {(p.description ?? '').trim() || '—'}
                {p.quantity != null && String(p.quantity).trim() ? ` (${String(p.quantity).trim()})` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {budget.observations ? (
        <div>
          <p className={`${pubSectionTitle} mb-1 block`}>Observações do orçamento</p>
          <p className="text-[13px] text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{budget.observations}</p>
        </div>
      ) : null}
    </div>
  );
}

function PhotoWithMarkers({
  url,
  markers,
}: {
  url: string;
  markers: VehicleAccompanimentMarker[];
}) {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-white/70 bg-gradient-to-b from-zinc-50/80 to-zinc-100/90 shadow-[0_12px_40px_-14px_rgba(0,122,255,0.18),inset_0_1px_0_rgba(255,255,255,0.5)] ring-1 ring-sky-400/20 dark:border-white/[0.1] dark:from-zinc-900/80 dark:to-zinc-950 dark:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.05)] dark:ring-sky-500/15">
      {url ? (
        <img src={url} alt="Foto do veículo" className="w-full h-auto max-h-[420px] object-contain bg-black/[0.04] dark:bg-black/40" />
      ) : (
        <div className="aspect-video flex items-center justify-center text-zinc-500 text-sm">Sem imagem</div>
      )}
      {markers.map((m) => (
        <div
          key={m.id}
          className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-[#007AFF] to-sky-600 text-[10px] font-bold text-white shadow-[0_4px_14px_-2px_rgba(0,122,255,0.65)] dark:border-zinc-900"
          style={{ left: `${m.xPct}%`, top: `${m.yPct}%` }}
          title={m.note || 'Marcador'}
        >
          !
        </div>
      ))}
    </div>
  );
}

export interface PublicVehicleAccompanimentPageProps {
  token: string;
}

export const PublicVehicleAccompanimentPage: React.FC<PublicVehicleAccompanimentPageProps> = ({ token }) => {
  const [data, setData] = useState<PublicVehicleAccompanimentPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ratingA, setRatingA] = useState(0);
  const [ratingS, setRatingS] = useState(0);
  const [ratingR, setRatingR] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedLocal, setSubmittedLocal] = useState(false);

  useEffect(() => {
    try {
      const t = localStorage.getItem('app_theme');
      if (t === 'light' || t === 'dark') {
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(t);
      }
    } catch (_) {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const d = await getPublicVehicleAccompaniment(token);
      setData(d);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Erro ao carregar.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const alreadyRated = Boolean(data?.ratings.submittedAt) || submittedLocal;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (ratingA < 1 || ratingS < 1 || ratingR < 1) {
      setSubmitError('Toque nas estrelas para avaliar os três itens.');
      return;
    }
    setSubmitting(true);
    try {
      await submitPublicVehicleAccompanimentRatings(token, {
        client_rating_attendance: ratingA,
        client_rating_service: ratingS,
        client_rating_recommend: ratingR,
        client_rating_comment: comment.trim() || undefined,
      });
      setSubmittedLocal(true);
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Não foi possível enviar.');
    } finally {
      setSubmitting(false);
    }
  };

  const so = data?.serviceOrder;
  const progressBadge = useMemo(() => {
    if (!so) return null;
    const cls = so.finalized
      ? 'border-emerald-400/40 bg-gradient-to-r from-emerald-400/20 to-teal-400/15 text-emerald-900 shadow-[0_4px_16px_-4px_rgba(16,185,129,0.35)] dark:text-emerald-100 dark:from-emerald-500/25 dark:to-teal-500/15'
      : 'border-amber-400/45 bg-gradient-to-r from-amber-300/35 to-orange-300/25 text-amber-950 shadow-[0_4px_16px_-4px_rgba(245,158,11,0.35)] dark:text-amber-100 dark:from-amber-500/30 dark:to-orange-500/20';
    return (
      <span className={`inline-flex items-center rounded-full border px-3.5 py-1.5 text-[12px] font-bold uppercase tracking-wide ${cls}`}>
        {so.progressLabel}
      </span>
    );
  }, [so]);

  if (loading && !data) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-zinc-50 via-light-page to-zinc-100 px-6 text-zinc-900 dark:from-zinc-950 dark:via-[#060810] dark:to-black dark:text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_0%,rgba(0,122,255,0.12),transparent_55%)]" aria-hidden />
        <div className="pointer-events-none absolute top-1/4 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-brand-yellow/25 blur-[90px]" aria-hidden />
        <Loader2 className="relative h-11 w-11 animate-spin text-[#007AFF] drop-shadow-[0_0_12px_rgba(0,122,255,0.45)]" aria-hidden />
        <p className="relative mt-4 text-sm font-medium text-zinc-600 dark:text-zinc-400">A carregar o seu acompanhamento…</p>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-zinc-50 via-light-page to-zinc-100 px-6 text-zinc-900 dark:from-zinc-950 dark:via-[#060810] dark:to-black dark:text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_35%_at_50%_20%,rgba(239,68,68,0.08),transparent_55%)]" aria-hidden />
        <p className="relative max-w-md text-center text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          {loadError ?? 'Página indisponível.'}
        </p>
      </div>
    );
  }

  const cust = so?.customer;

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-zinc-50 via-light-page to-zinc-100 pb-safe text-zinc-900 dark:from-zinc-950 dark:via-[#060810] dark:to-black dark:text-white">
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        <div className="absolute -top-24 left-1/2 h-[min(480px,90vw)] w-[min(480px,90vw)] -translate-x-1/2 rounded-full bg-[#007AFF]/20 blur-[100px] dark:bg-[#007AFF]/14" />
        <div className="absolute top-1/3 -right-20 h-72 w-72 rounded-full bg-brand-yellow/30 blur-[95px] dark:bg-brand-yellow/16" />
        <div className="absolute bottom-0 left-0 h-64 w-64 translate-y-1/3 rounded-full bg-violet-400/20 blur-[88px] dark:bg-violet-500/12" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_85%_55%_at_50%_-10%,rgba(255,255,255,0.35),transparent_52%)] dark:bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(0,122,255,0.1),transparent_48%)]" />
      </div>
      <div className="relative mx-auto max-w-lg space-y-5 px-4 pb-12 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="space-y-3 pt-2 text-center">
          <p className={`${pubSectionTitle} tracking-[0.18em]`}>Acompanhamento</p>
          <h1 className="bg-gradient-to-br from-zinc-950 via-zinc-800 to-zinc-600 bg-clip-text text-2xl font-bold tracking-tight text-transparent dark:from-white dark:via-zinc-100 dark:to-zinc-400">
            {data.workshopName?.trim() || 'Oficina'}
          </h1>
          {progressBadge}
        </header>

        <section className={`relative space-y-3 pl-5 pr-5 py-5 ${pubCard}`}>
          <span className={pubCardAccent} aria-hidden />
          <h2 className={`${pubSectionTitle} relative mb-1 block`}>Veículo e OS</h2>
          <div className="space-y-1 text-[15px]">
            {so?.os_number != null ? (
              <p>
                <span className="text-zinc-500 dark:text-zinc-400">OS </span>
                <span className="font-semibold">#{so.os_number}</span>
              </p>
            ) : null}
            {so?.plate ? (
              <p>
                <span className="text-zinc-500 dark:text-zinc-400">Placa </span>
                <span className="font-mono font-semibold tracking-wide">{so.plate}</span>
              </p>
            ) : null}
            <p className="text-[14px] text-zinc-800 dark:text-zinc-200">
              {[so?.vehicle_brand, so?.vehicle_model].filter(Boolean).join(' ') || '—'}
              {so?.vehicle_year ? ` · ${so.vehicle_year}` : ''}
              {so?.vehicle_color ? ` · ${so.vehicle_color}` : ''}
            </p>
            {so?.mileage_km ? (
              <p className="text-[13px] text-zinc-600 dark:text-zinc-400">Quilometragem: {so.mileage_km}</p>
            ) : null}
          </div>
          {cust ? (
            <div className="pt-2 border-t border-zinc-200/70 dark:border-white/[0.08] text-[14px] space-y-0.5">
              <p className="font-medium">{cust.name?.trim() || 'Cliente'}</p>
              {cust.phone ? <p className="text-zinc-600 dark:text-zinc-400">{cust.phone}</p> : null}
              {cust.email ? <p className="text-zinc-600 dark:text-zinc-400 text-[13px] break-all">{cust.email}</p> : null}
            </div>
          ) : null}
          {so?.issue_description ? (
            <div className="border-t border-zinc-200/60 pt-3 dark:border-white/[0.08]">
              <p className={`${pubSectionTitle} relative mb-2 block`}>Queixa / pedido</p>
              <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
                {so.issue_description}
              </p>
            </div>
          ) : null}
        </section>

        {data.intake_observations?.trim() ? (
          <section className={`relative pl-5 pr-5 py-5 ${pubCard}`}>
            <span className={pubCardAccent} aria-hidden />
            <h2 className={`${pubSectionTitle} relative mb-3 block`}>Observações da entrada</h2>
            <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
              {data.intake_observations}
            </p>
          </section>
        ) : null}

        {data.intake_photos?.length ? (
          <section className={`relative space-y-4 pl-5 pr-5 py-5 ${pubCard}`}>
            <span className={pubCardAccent} aria-hidden />
            <h2 className={`${pubSectionTitle} relative block`}>Fotos da entrada</h2>
            {data.intake_photos.map((ph, idx) => (
              <div key={ph.id ?? ph.path ?? String(idx)} className="space-y-2">
                <PhotoWithMarkers url={ph.url} markers={ph.markers ?? []} />
                {(ph.markers ?? []).some((m) => m.note?.trim()) ? (
                  <ul className="text-[13px] text-zinc-700 dark:text-zinc-300 space-y-1 pl-1">
                    {(ph.markers ?? [])
                      .filter((m) => m.note?.trim())
                      .map((m) => (
                        <li key={m.id}>• {m.note}</li>
                      ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        {data.budgets?.length ? (
          <section className={`relative space-y-3 pl-5 pr-5 py-5 ${pubCard}`}>
            <span className={pubCardAccent} aria-hidden />
            <h2 className={`${pubSectionTitle} relative block`}>Orçamentos com itens aprovados</h2>
            <div className="space-y-3">
              {data.budgets.map((b) => (
                <BudgetBlock key={b.id} budget={b} />
              ))}
            </div>
          </section>
        ) : null}

        <section className={`relative space-y-4 pl-5 pr-5 py-5 ${pubCard}`}>
          <span className={pubCardAccent} aria-hidden />
          <h2 className={`${pubSectionTitle} relative block`}>Sua avaliação</h2>
          {alreadyRated ? (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/12 to-teal-500/8 p-4 shadow-[0_8px_28px_-10px_rgba(16,185,129,0.2)] dark:from-emerald-500/15 dark:to-teal-500/10">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-[14px] space-y-1">
                <p className="font-semibold text-emerald-800 dark:text-emerald-200">Obrigado pela sua avaliação.</p>
                {data.ratings.attendance != null ? (
                  <p className="text-zinc-700 dark:text-zinc-300">
                    Atendimento {data.ratings.attendance}/5 · Serviço {data.ratings.service}/5 · Indicaria{' '}
                    {data.ratings.recommend}/5
                  </p>
                ) : null}
                {data.ratings.comment?.trim() ? (
                  <p className="text-[13px] text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">{data.ratings.comment}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <StarRow label="Atendimento" value={ratingA} onChange={setRatingA} disabled={submitting} />
              <StarRow label="Serviço realizado" value={ratingS} onChange={setRatingS} disabled={submitting} />
              <StarRow label="Indicaria a um amigo" value={ratingR} onChange={setRatingR} disabled={submitting} />
              <div>
                <label htmlFor="vac-comment" className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200">
                  Comentário (opcional)
                </label>
                <textarea
                  id="vac-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={submitting}
                  rows={3}
                  maxLength={2000}
                  className="mt-2 w-full rounded-2xl border border-zinc-200/90 dark:border-white/[0.12] bg-white/90 dark:bg-zinc-950/60 px-3 py-2.5 text-[14px] text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40"
                  placeholder="Conte como foi a experiência…"
                />
              </div>
              {submitError ? <p className="text-[13px] text-red-600 dark:text-red-400">{submitError}</p> : null}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-2xl bg-gradient-to-br from-[#007AFF] via-sky-500 to-sky-600 py-3.5 text-[16px] font-semibold text-white shadow-[0_8px_28px_-6px_rgba(0,122,255,0.55),inset_0_1px_0_rgba(255,255,255,0.25)] transition active:scale-[0.99] hover:brightness-105 disabled:opacity-50"
              >
                {submitting ? 'A enviar…' : 'Enviar avaliação'}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
};
