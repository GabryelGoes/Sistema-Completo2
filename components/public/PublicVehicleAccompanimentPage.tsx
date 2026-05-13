import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Star, CheckCircle2 } from 'lucide-react';
import type { PublicVehicleAccompanimentPayload, VehicleAccompanimentMarker } from '../../services/apiService';
import {
  getPublicVehicleAccompaniment,
  submitPublicVehicleAccompanimentRatings,
} from '../../services/apiService';

const iosCard =
  'rounded-[22px] border border-zinc-200/80 dark:border-white/[0.07] bg-white/85 dark:bg-zinc-900/55 backdrop-blur-2xl ' +
  'shadow-[0_10px_36px_-8px_rgba(63,63,70,0.18),0_4px_20px_-6px_rgba(82,82,91,0.12)] ' +
  'dark:shadow-[0_14px_40px_-10px_rgba(0,0,0,0.4),0_6px_28px_-8px_rgba(0,0,0,0.28)]';

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
            className="p-1 rounded-lg transition-transform active:scale-95 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]/50"
            aria-pressed={value === n}
            aria-label={`${n} estrelas`}
          >
            <Star
              className={`h-8 w-8 ${
                n <= value ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-zinc-300 dark:text-zinc-600'
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
    <div className="rounded-2xl border border-zinc-200/70 dark:border-white/[0.08] bg-zinc-50/90 dark:bg-zinc-950/40 p-4 space-y-3">
      {budget.diagnosis ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-1">
            Diagnóstico
          </p>
          <p className="text-[14px] text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
            {budget.diagnosis}
          </p>
        </div>
      ) : null}
      {apServ.length > 0 ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-1">
            Serviços aprovados
          </p>
          <ul className="list-disc pl-4 space-y-1 text-[14px] text-zinc-800 dark:text-zinc-200">
            {apServ.map((s: { description?: string }, i: number) => (
              <li key={`s-${i}`}>{(s.description ?? '').trim() || '—'}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {apParts.length > 0 ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-1">
            Peças aprovadas
          </p>
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-1">
            Observações do orçamento
          </p>
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
    <div className="relative w-full overflow-hidden rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] bg-zinc-100 dark:bg-zinc-950">
      {url ? (
        <img src={url} alt="Foto do veículo" className="w-full h-auto max-h-[420px] object-contain bg-black/5 dark:bg-black/30" />
      ) : (
        <div className="aspect-video flex items-center justify-center text-zinc-500 text-sm">Sem imagem</div>
      )}
      {markers.map((m) => (
        <div
          key={m.id}
          className="absolute w-7 h-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#007AFF] text-white text-[10px] font-bold flex items-center justify-center shadow-lg border-2 border-white dark:border-zinc-900"
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
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
      : 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/25';
    return (
      <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-semibold ${cls}`}>
        {so.progressLabel}
      </span>
    );
  }, [so]);

  if (loading && !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-light-page dark:bg-black text-zinc-900 dark:text-white px-6">
        <Loader2 className="h-10 w-10 animate-spin text-brand-yellow" aria-hidden />
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">A carregar…</p>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-light-page dark:bg-black text-zinc-900 dark:text-white px-6">
        <p className="text-center text-[15px] text-zinc-700 dark:text-zinc-300 max-w-md">{loadError ?? 'Página indisponível.'}</p>
      </div>
    );
  }

  const cust = so?.customer;

  return (
    <div className="min-h-screen bg-light-page dark:bg-black text-zinc-900 dark:text-white pb-safe">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[420px] bg-brand-yellow/8 rounded-full blur-[100px] pointer-events-none" />
      <div className="relative max-w-lg mx-auto px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-12 space-y-4">
        <header className="text-center space-y-2 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
            Acompanhamento
          </p>
          <h1 className="text-[22px] font-semibold tracking-tight text-zinc-950 dark:text-white">
            {data.workshopName?.trim() || 'Oficina'}
          </h1>
          {progressBadge}
        </header>

        <section className={`p-5 ${iosCard} space-y-3`}>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
            Veículo e OS
          </h2>
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
            <div className="pt-2 border-t border-zinc-200/70 dark:border-white/[0.08]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-1">
                Queixa / pedido
              </p>
              <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
                {so.issue_description}
              </p>
            </div>
          ) : null}
        </section>

        {data.intake_observations?.trim() ? (
          <section className={`p-5 ${iosCard}`}>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400 mb-2">
              Observações da entrada
            </h2>
            <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
              {data.intake_observations}
            </p>
          </section>
        ) : null}

        {data.intake_photos?.length ? (
          <section className={`p-5 ${iosCard} space-y-4`}>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Fotos da entrada
            </h2>
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
          <section className={`p-5 ${iosCard} space-y-3`}>
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
              Orçamentos com itens aprovados
            </h2>
            <div className="space-y-3">
              {data.budgets.map((b) => (
                <BudgetBlock key={b.id} budget={b} />
              ))}
            </div>
          </section>
        ) : null}

        <section className={`p-5 ${iosCard} space-y-4`}>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
            Sua avaliação
          </h2>
          {alreadyRated ? (
            <div className="flex items-start gap-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4">
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
                className="w-full rounded-2xl bg-[#007AFF] text-white font-semibold text-[16px] py-3.5 shadow-md active:scale-[0.99] transition-transform disabled:opacity-50"
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
