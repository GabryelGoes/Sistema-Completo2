import React from 'react';

export type PatioOsModalPcTab = 'dados' | 'arquivos' | 'conserto_externo' | 'laboratorio';

const ALL_TABS: { id: PatioOsModalPcTab; label: string }[] = [
  { id: 'dados', label: 'Dados' },
  { id: 'arquivos', label: 'Arquivos' },
  { id: 'conserto_externo', label: 'Conserto externo' },
  { id: 'laboratorio', label: 'Serviços no laboratório' },
];

export type PatioOsModalPcTabBarProps = {
  active: PatioOsModalPcTab;
  onChange: (tab: PatioOsModalPcTab) => void;
  /** Omitir abas (ex.: laboratório no modo módulo). */
  hiddenTabs?: PatioOsModalPcTab[];
};

export const PatioOsModalPcTabBar: React.FC<PatioOsModalPcTabBarProps> = ({
  active,
  onChange,
  hiddenTabs = [],
}) => {
  const tabs = ALL_TABS.filter((tab) => !hiddenTabs.includes(tab.id));
  return (
  <div
    className="patio-vm-tabs shrink-0 border-b border-zinc-300/80 bg-white/95 dark:border-white/[0.08] dark:bg-zinc-900/95"
    role="tablist"
    aria-label="Seções da ordem de serviço"
  >
    <div className="mx-auto flex w-full max-w-[1680px] gap-0 px-6 xl:px-8">
      {tabs.map((tab) => {
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={`relative px-4 py-3.5 text-[12px] font-bold uppercase tracking-[0.14em] transition-colors ${
              selected
                ? 'text-[#007AFF] dark:text-[#7ab8ff]'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {tab.label}
            {selected ? (
              <span
                className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-[#007AFF] dark:bg-[#7ab8ff]"
                aria-hidden
              />
            ) : null}
          </button>
        );
      })}
    </div>
  </div>
  );
};
