import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  KeyRound,
  LogOut,
  MonitorSmartphone,
  Package,
  Smartphone,
  Tag,
  User,
  Users,
  Wrench,
} from 'lucide-react';
import { IosAccentIconSquircle } from '../ui/IosAccentIconSquircle';
import { SYSTEM_NOTIFICATIONS_ICON } from '../../constants/systemNotificationsIcon';
import {
  AJUSTES_CATEGORIES,
  ajustesItemsForCategory,
  type AjustesCategoryId,
  type AjustesItemId,
  type AjustesItemMeta,
} from '../../utils/ajustesCatalog';

export type AjustesVisibility = {
  perfil: boolean;
  usuarios: boolean;
  sair: boolean;
  senhas: boolean;
  servicos_oficina: boolean;
  checklists_patio: boolean;
  painel_tv: boolean;
  lab_tipos: boolean;
  lab_rapidos: boolean;
  orcamentos_prefs: boolean;
  notificacoes_sistema: boolean;
  tema: boolean;
  dispositivos_conectados: boolean;
  dispositivo: boolean;
  etiquetas: boolean;
};

export type AjustesHubPanelProps = {
  desktopShell?: boolean;
  /** Título dinâmico do item Perfil (admin / técnico / usuário). */
  perfilTitle: string;
  perfilSubtitle: string;
  perfilIconSrc?: string | null;
  visibility: AjustesVisibility;
  onOpenItem: (id: AjustesItemId) => void;
};

function itemIcon(item: AjustesItemMeta, perfilIconSrc?: string | null) {
  if (item.id === 'perfil') {
    if (perfilIconSrc) {
      return (
        <IosAccentIconSquircle variant="row" strokeWidth={2.2}>
          <img src={perfilIconSrc} alt="" className="h-full w-full object-cover" />
        </IosAccentIconSquircle>
      );
    }
    if (item.iconSrc) {
      return (
        <IosAccentIconSquircle variant="row" strokeWidth={2.2}>
          <img src={item.iconSrc} alt="" className="h-full w-full object-cover" />
        </IosAccentIconSquircle>
      );
    }
    return (
      <IosAccentIconSquircle variant="row" strokeWidth={2.2}>
        <User />
      </IosAccentIconSquircle>
    );
  }
  if (item.id === 'notificacoes_sistema') {
    return (
      <IosAccentIconSquircle variant="row" strokeWidth={2.2}>
        <img src={SYSTEM_NOTIFICATIONS_ICON} alt="" className="h-full w-full object-cover" />
      </IosAccentIconSquircle>
    );
  }
  if (item.iconSrc) {
    return (
      <IosAccentIconSquircle variant="row" strokeWidth={2.2}>
        <img src={item.iconSrc} alt="" className="h-full w-full object-cover" />
      </IosAccentIconSquircle>
    );
  }
  const fallback = item.iconFallback;
  const node =
    fallback === 'logout' ? (
      <LogOut className="text-red-500 dark:text-red-400" />
    ) : fallback === 'users' ? (
      <Users />
    ) : fallback === 'key' ? (
      <KeyRound />
    ) : fallback === 'wrench' ? (
      <Wrench />
    ) : fallback === 'package' ? (
      <Package />
    ) : fallback === 'monitor' ? (
      <MonitorSmartphone />
    ) : fallback === 'devices' ? (
      <Smartphone />
    ) : fallback === 'tag' ? (
      <Tag />
    ) : fallback === 'external' ? (
      <ExternalLink />
    ) : (
      <User />
    );
  return (
    <IosAccentIconSquircle variant="row" strokeWidth={2.2}>
      {node}
    </IosAccentIconSquircle>
  );
}

function AjustesRow({
  item,
  title,
  subtitle,
  perfilIconSrc,
  onActivate,
}: {
  item: AjustesItemMeta;
  title: string;
  subtitle: string;
  perfilIconSrc?: string | null;
  onActivate: () => void;
}) {
  const content = (
    <>
      {itemIcon(item, perfilIconSrc)}
      <span className="min-w-0 flex-1">
        <span
          className={`block text-[14px] font-medium leading-snug ${
            item.danger ? 'text-red-600 dark:text-red-400' : 'text-zinc-900 dark:text-zinc-100'
          }`}
        >
          {title}
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">
          {subtitle}
        </span>
      </span>
      {item.kind === 'external' ? (
        <ExternalLink className="h-4 w-4 shrink-0 text-zinc-400" />
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
      )}
    </>
  );

  const className = `group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
    item.danger
      ? 'hover:bg-red-500/10'
      : 'hover:bg-zinc-100/90 dark:hover:bg-white/[0.05]'
  } active:scale-[0.99]`;

  if (item.kind === 'external' && item.externalHref) {
    return (
      <a
        href={item.externalHref}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {content}
      </a>
    );
  }

  return (
    <button type="button" onClick={onActivate} className={className}>
      {content}
    </button>
  );
}

export function AjustesHubPanel({
  desktopShell = false,
  perfilTitle,
  perfilSubtitle,
  perfilIconSrc,
  visibility,
  onOpenItem,
}: AjustesHubPanelProps) {
  const visibleCategories = useMemo(() => {
    return AJUSTES_CATEGORIES.filter((cat) =>
      ajustesItemsForCategory(cat.id).some((item) => visibility[item.id])
    );
  }, [visibility]);

  const [activeCategoryId, setActiveCategoryId] = useState<AjustesCategoryId | null>(null);
  /** Mobile: lista de categorias vs. detalhe da categoria. */
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  useEffect(() => {
    if (visibleCategories.length === 0) {
      setActiveCategoryId(null);
      return;
    }
    setActiveCategoryId((prev) => {
      if (prev && visibleCategories.some((c) => c.id === prev)) return prev;
      return visibleCategories[0].id;
    });
  }, [visibleCategories]);

  const activeCategory =
    visibleCategories.find((c) => c.id === activeCategoryId) ?? visibleCategories[0] ?? null;

  const activeItems = useMemo(() => {
    if (!activeCategory) return [];
    return ajustesItemsForCategory(activeCategory.id).filter((item) => visibility[item.id]);
  }, [activeCategory, visibility]);

  const resolveTitle = (item: AjustesItemMeta) =>
    item.id === 'perfil' ? perfilTitle : item.title;
  const resolveSubtitle = (item: AjustesItemMeta) =>
    item.id === 'perfil' ? perfilSubtitle : item.subtitle;

  const useSplitLayout = desktopShell;

  const categoryNav = (
    <nav
      className={
        useSplitLayout
          ? 'flex w-[220px] shrink-0 flex-col gap-0.5 border-r border-zinc-200/80 bg-zinc-50/90 p-2 dark:border-white/[0.08] dark:bg-zinc-950/80'
          : 'flex flex-col gap-0.5 p-2'
      }
      aria-label="Categorias de ajustes"
    >
      {visibleCategories.map((cat) => {
        const selected = activeCategory?.id === cat.id;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => {
              setActiveCategoryId(cat.id);
              if (!useSplitLayout) setMobileShowDetail(true);
            }}
            className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
              selected && useSplitLayout
                ? 'bg-zinc-200/90 text-zinc-900 dark:bg-white/[0.1] dark:text-white'
                : 'text-zinc-700 hover:bg-zinc-200/60 dark:text-zinc-300 dark:hover:bg-white/[0.06]'
            }`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-zinc-200/80 bg-white dark:border-white/[0.1] dark:bg-zinc-900">
              <img src={cat.iconSrc} alt="" className="h-full w-full object-cover" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold leading-snug">{cat.label}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                {cat.hint}
              </span>
            </span>
            {!useSplitLayout ? (
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
            ) : null}
          </button>
        );
      })}
    </nav>
  );

  const detailPane = activeCategory ? (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {!useSplitLayout ? (
        <div className="flex items-center gap-2 border-b border-zinc-200/80 px-3 py-2 dark:border-white/[0.08]">
          <button
            type="button"
            onClick={() => setMobileShowDetail(false)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.06]"
            aria-label="Voltar às categorias"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-zinc-200/80 bg-white dark:border-white/[0.1] dark:bg-zinc-900">
            <img src={activeCategory.iconSrc} alt="" className="h-full w-full object-cover" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-zinc-900 dark:text-white">
              {activeCategory.label}
            </p>
            <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
              {activeCategory.hint}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 border-b border-zinc-200/80 px-5 py-3 dark:border-white/[0.08]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[11px] border border-zinc-200/80 bg-white dark:border-white/[0.1] dark:bg-zinc-900">
            <img src={activeCategory.iconSrc} alt="" className="h-full w-full object-cover" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-zinc-900 dark:text-white">
              {activeCategory.label}
            </p>
            <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">{activeCategory.hint}</p>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
        <div className="divide-y divide-zinc-200/70 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white dark:divide-white/[0.06] dark:border-white/[0.08] dark:bg-zinc-900/60">
          {activeItems.map((item) => (
            <AjustesRow
              key={item.id}
              item={item}
              title={resolveTitle(item)}
              subtitle={resolveSubtitle(item)}
              perfilIconSrc={perfilIconSrc}
              onActivate={() => onOpenItem(item.id)}
            />
          ))}
        </div>
      </div>
    </div>
  ) : (
    <div className="flex flex-1 items-center justify-center p-8 text-[13px] text-zinc-500">
      Nenhuma categoria disponível para o seu perfil.
    </div>
  );

  if (useSplitLayout) {
    return (
      <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm dark:border-white/[0.08] dark:bg-zinc-950">
        {categoryNav}
        {detailPane}
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white dark:border-white/[0.08] dark:bg-zinc-950">
      {!mobileShowDetail ? categoryNav : detailPane}
    </div>
  );
}
