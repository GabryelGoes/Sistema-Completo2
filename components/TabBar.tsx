import React from 'react';
import { Home, FileText, Calendar, FlaskConical } from 'lucide-react';
import { useModalLayer } from './ui/ModalLayerContext';
import { PatioCarIcon } from './ui/PatioCarIcon';
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

    if (id === 'home') {
      return <Home className={cls('h-6 w-6')} style={colorfulStyle} strokeWidth={sw} />;
    }
    if (id === 'reception') {
      return <FileText className={cls('h-6 w-6')} style={colorfulStyle} strokeWidth={sw} />;
    }
    if (id === 'agenda') {
      return <Calendar className={cls('h-6 w-6')} style={colorfulStyle} strokeWidth={sw} />;
    }
    if (id === 'patio') {
      return <PatioCarIcon className={cls('h-6 w-6')} style={colorfulStyle} />;
    }
    if (id === 'laboratorio') {
      return <FlaskConical className={cls('h-6 w-6')} style={colorfulStyle} strokeWidth={sw} />;
    }
    return null;
  };

  // Barra fixa inferior: z-40 fica abaixo dos modais do app (z-[100]+). Oculta quando há modal aberto.
  if (openCount > 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      {/* Vidro neutro (sem cor de destaque na barra — cor só no ícone ativo). */}
      <div className="absolute inset-0 border-t border-zinc-200/80 bg-white/72 backdrop-blur-2xl dark:border-white/[0.09] dark:bg-zinc-950/78" />
      <div className="relative mx-auto flex h-20 max-w-2xl items-center justify-around px-2 pb-4 pt-2">
        {tabs.map((t) => {
          const selected = currentTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              className="flex flex-col items-center gap-1 transition-colors duration-300"
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
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
