import React from 'react';
import { Bell, LogOut, Settings, User } from 'lucide-react';
import type { TabId } from '../TabBar';
import {
  DESKTOP_NAV_ITEMS,
  desktopNavLabel,
  filterDesktopNav,
  type DesktopNavItem,
} from '../../utils/desktopShellNav';

export type DesktopAppShellProps = {
  currentTab: TabId;
  onTabChange: (tab: TabId) => void;
  allowedTabs?: TabId[];
  displayName: string;
  photoUrl?: string | null;
  onOpenSettings?: () => void;
  onLogout?: () => void;
  orcamentosBadge?: number;
  children: React.ReactNode;
};

function NavIcon({ item }: { item: DesktopNavItem }) {
  if (item.iconSrc) {
    return (
      <span className="desktop-shell-nav-icon" aria-hidden>
        <img src={item.iconSrc} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }
  if (item.id === 'home') {
    return (
      <span className="desktop-shell-nav-icon flex items-center justify-center bg-zinc-100 text-[10px] font-bold text-zinc-600">
        IN
      </span>
    );
  }
  return (
    <span className="desktop-shell-nav-icon flex items-center justify-center bg-zinc-100 text-[10px] font-bold text-zinc-500">
      •
    </span>
  );
}

export function DesktopAppShell({
  currentTab,
  onTabChange,
  allowedTabs,
  displayName,
  photoUrl,
  onOpenSettings,
  onLogout,
  orcamentosBadge = 0,
  children,
}: DesktopAppShellProps) {
  const nav = filterDesktopNav(DESKTOP_NAV_ITEMS, allowedTabs);
  const sidebarItems = nav.filter((i) => i.sidebar !== false);
  const pageTitle = desktopNavLabel(currentTab, nav);

  return (
    <div className="desktop-shell-root font-sans">
      <aside className="desktop-shell-sidebar" aria-label="Menu principal">
        <div className="desktop-shell-sidebar-logo">
          <img src="/logo.png" alt="Rei do ABS" className="h-10 w-10 object-contain" />
        </div>
        <nav className="desktop-shell-sidebar-nav">
          {sidebarItems.map((item) => {
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`desktop-shell-nav-item${active ? ' desktop-shell-nav-item--active' : ''}`}
                onClick={() => onTabChange(item.id)}
                aria-current={active ? 'page' : undefined}
              >
                <NavIcon item={item} />
                <span className="min-w-0 truncate">{item.label}</span>
                {item.id === 'orcamentos' && orcamentosBadge > 0 ? (
                  <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white tabular-nums">
                    {orcamentosBadge > 99 ? '99+' : orcamentosBadge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
        <a
          href="https://wa.me/"
          target="_blank"
          rel="noopener noreferrer"
          className="desktop-shell-support"
        >
          Suporte
        </a>
      </aside>

      <div className="desktop-shell-main">
        <header className="desktop-shell-topbar" aria-label="Página atual">
          <h1 className="desktop-shell-topbar-title">{pageTitle}</h1>
          <div className="desktop-shell-topbar-actions">
            <span className="hidden max-w-[10rem] truncate text-[11px] font-medium text-white/85 xl:inline">
              {displayName}
            </span>
            {onOpenSettings ? (
              <button
                type="button"
                className="desktop-shell-topbar-btn"
                onClick={onOpenSettings}
                aria-label="Configurações"
                title="Configurações"
              >
                <Settings className="h-4 w-4" strokeWidth={2} />
              </button>
            ) : null}
            <button type="button" className="desktop-shell-topbar-btn" aria-label="Notificações" title="Notificações">
              <Bell className="h-4 w-4" strokeWidth={2} />
            </button>
            <button type="button" className="desktop-shell-topbar-btn" aria-label="Conta" title={displayName}>
              {photoUrl ? (
                <img src={photoUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
              ) : (
                <User className="h-4 w-4" strokeWidth={2} />
              )}
            </button>
            {onLogout ? (
              <button
                type="button"
                className="desktop-shell-topbar-btn"
                onClick={onLogout}
                aria-label="Sair"
                title="Sair"
              >
                <LogOut className="h-4 w-4" strokeWidth={2} />
              </button>
            ) : null}
          </div>
        </header>

        <div className="desktop-shell-content custom-scrollbar">
          <div className="desktop-shell-content-inner">{children}</div>
        </div>
      </div>
    </div>
  );
}
