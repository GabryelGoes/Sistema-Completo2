import React from 'react';
import { Home } from 'lucide-react';
import { useModalLayer } from './ui/ModalLayerContext';
import { COLORFUL_TAB_ACCENTS, type NavigationTabId } from '../utils/appAppearance';

export type TabId = NavigationTabId;

interface TabBarProps {
  currentTab: TabId;
  onTabChange: (tab: TabId) => void;
  /** Se definido, mostra apenas estas abas (ex.: modo técnico). Caso contrário mostra todas (admin). */
  allowedTabs?: TabId[];
  /** Cada ícone com cor própria na barra + `--app-accent` alinhado à aba (Configurações → modo colorido). */
  colorfulNavigation?: boolean;
}

const TAB_ITEMS: { id: TabId; label: string }[] = [
  { id: 'reception', label: 'Recepção' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'home', label: 'Início' },
  { id: 'patio', label: 'Pátio' },
  { id: 'laboratorio', label: 'Laboratório' },
];

export const TabBar: React.FC<TabBarProps> = ({ currentTab, onTabChange, allowedTabs, colorfulNavigation = false }) => {
  const { openCount } = useModalLayer();
  const tabs = allowedTabs && allowedTabs.length > 0
    ? TAB_ITEMS.filter((t) => allowedTabs.includes(t.id))
    : TAB_ITEMS;

  const renderIcon = (id: TabId, selected: boolean) => {
    const monoTone = selected ? 'text-brand-yellow' : 'text-zinc-500';
    const colorfulStyle: React.CSSProperties | undefined = colorfulNavigation
      ? { color: COLORFUL_TAB_ACCENTS[id], opacity: selected ? 1 : 0.38 }
      : undefined;
    const cls = (base: string) => (colorfulNavigation ? base : `${base} ${monoTone}`);
    const sw = selected ? (id === 'patio' ? 2.5 : 2.35) : id === 'patio' ? 3 : 2;

    const pngTab = (src: string): React.ReactNode => (
      <span
        className={`relative block h-7 w-7 overflow-hidden rounded-full ${selected ? 'ring-2 ring-brand-yellow/65 ring-offset-2 ring-offset-white dark:ring-offset-zinc-950' : 'opacity-[0.48]'}`}
        style={colorfulNavigation ? colorfulStyle : undefined}
      >
        <img src={src} alt="" className="h-full w-full object-cover" />
      </span>
    );

    if (id === 'home') {
      return <Home className={cls('h-6 w-6')} style={colorfulStyle} strokeWidth={sw} />;
    }
    if (id === 'reception') {
      return pngTab('/icons/recepcao-ios.png');
    }
    if (id === 'agenda') {
      return pngTab('/icons/agenda-ios.png');
    }
    if (id === 'patio') {
      return pngTab('/icons/patio-ios.png');
    }
    if (id === 'laboratorio') {
      return pngTab('/icons/laboratorio-ios.png');
    }
    return null;
  };

  // Barra fixa inferior: z-40 fica abaixo dos modais do app (z-[100]+). Oculta quando há modal aberto.
  if (openCount > 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      {/* Vidro neutro (sem cor de destaque na barra — cor só no ícone ativo). */}
      <div className="absolute inset-0 border-t border-zinc-200/80 bg-white/72 backdrop-blur-2xl dark:border-white/[0.09] dark:bg-zinc-950/78" />
      <div className="relative mx-auto flex h-16 max-w-2xl items-center justify-around px-2 pb-3 pt-1">
        {tabs.map((t) => {
          const selected = currentTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              className="flex flex-col items-center gap-0.5 transition-colors duration-300"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
                  selected
                    ? 'bg-white/65 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.72)] ring-1 ring-black/[0.07] backdrop-blur-xl dark:bg-white/[0.12] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)] dark:ring-white/18'
                    : 'bg-transparent'
                }`}
                aria-hidden
              >
                {renderIcon(t.id, selected)}
              </span>
              <span
                className={`text-[10px] font-medium tracking-wide ${
                  selected ? 'text-zinc-700 dark:text-zinc-200' : 'text-zinc-500 dark:text-zinc-500'
                }`}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
