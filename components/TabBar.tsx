import React from 'react';
import { Home, FileText, Calendar, FlaskConical } from 'lucide-react';
import { PatioCarIcon } from './ui/PatioCarIcon';

export type TabId = 'home' | 'reception' | 'patio' | 'agenda' | 'laboratorio';

interface TabBarProps {
  currentTab: TabId;
  onTabChange: (tab: TabId) => void;
  /** Se definido, mostra apenas estas abas (ex.: modo técnico). Caso contrário mostra todas (admin). */
  allowedTabs?: TabId[];
}

const TAB_ITEMS: { id: TabId; label: string }[] = [
  { id: 'home', label: 'Início' },
  { id: 'reception', label: 'Recepção' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'patio', label: 'Pátio' },
  { id: 'laboratorio', label: 'Laboratório' },
];

export const TabBar: React.FC<TabBarProps> = ({ currentTab, onTabChange, allowedTabs }) => {
  const tabs = allowedTabs && allowedTabs.length > 0
    ? TAB_ITEMS.filter((t) => allowedTabs.includes(t.id))
    : TAB_ITEMS;

  const renderIcon = (id: TabId, selected: boolean) => {
    if (id === 'home') return <Home className={`w-6 h-6 ${selected ? 'fill-zinc-200 dark:fill-brand-yellow/20' : ''}`} />;
    if (id === 'reception') return <FileText className={`w-6 h-6 ${selected ? 'fill-zinc-200 dark:fill-brand-yellow/20' : ''}`} />;
    if (id === 'agenda') return <Calendar className={`w-6 h-6 ${selected ? 'fill-zinc-200 dark:fill-brand-yellow/20' : ''}`} />;
    if (id === 'patio') return <PatioCarIcon className="w-6 h-6" />;
    if (id === 'laboratorio') return <FlaskConical className="w-6 h-6" />;
    return null;
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <div className="absolute inset-0 bg-light-card/95 dark:bg-zinc-900/90 backdrop-blur-xl border-t border-light-border dark:border-white/10" />
      <div className="relative flex justify-around items-center h-20 px-2 pb-4 pt-2 max-w-2xl mx-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            className={`flex flex-col items-center gap-1 transition-colors duration-300 ${currentTab === t.id ? 'text-zinc-900 dark:text-brand-yellow' : 'text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
          >
            {renderIcon(t.id, currentTab === t.id)}
            <span className="text-[10px] font-medium tracking-wide">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};