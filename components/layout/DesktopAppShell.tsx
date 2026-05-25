import React, { useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight, Headphones, Settings } from 'lucide-react';
import { NotificationCenter, type NotificationCenterProps } from '../NotificationCenter';
import { DesktopShellAccountMenu } from './DesktopShellAccountMenu';
import type { TabId } from '../TabBar';
import { moduleAccentColor, moduleTopbarTextTone } from '../../utils/appAppearance';
import {
  DESKTOP_NAV_ITEMS,
  desktopNavLabel,
  filterDesktopNav,
  filterDesktopSidebarActions,
  type DesktopNavItem,
  type DesktopSidebarAccess,
  type DesktopSidebarActionId,
  type DesktopSidebarActionItem,
} from '../../utils/desktopShellNav';

const SIDEBAR_COLLAPSED_KEY = 'rda_desktop_sidebar_collapsed_v1';

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export type DesktopAppShellProps = {
  currentTab: TabId;
  onTabChange: (tab: TabId) => void;
  allowedTabs?: TabId[];
  sidebarAccess?: DesktopSidebarAccess;
  onSidebarAction?: (action: DesktopSidebarActionId) => void;
  displayName: string;
  photoUrl?: string | null;
  onOpenSettings?: () => void;
  onOpenProfileEditor?: () => void;
  onLogout?: () => void;
  orcamentosBadge?: number;
  notificationCenter?: Omit<NotificationCenterProps, 'placement'>;
  children: React.ReactNode;
};

function NavIconImg({ iconSrc }: { iconSrc: string }) {
  return (
    <span className="desktop-shell-nav-icon" aria-hidden>
      <img src={iconSrc} alt="" className="h-full w-full object-cover" />
    </span>
  );
}

function NavIcon({ item }: { item: DesktopNavItem }) {
  if (item.iconSrc) {
    return <NavIconImg iconSrc={item.iconSrc} />;
  }
  if (item.id === 'home') {
    return (
      <span className="desktop-shell-nav-icon flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold text-zinc-600 dark:text-zinc-300">
        IN
      </span>
    );
  }
  return (
    <span className="desktop-shell-nav-icon flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
      •
    </span>
  );
}

function ActionNavIcon({ item }: { item: DesktopSidebarActionItem }) {
  return <NavIconImg iconSrc={item.iconSrc} />;
}

export function DesktopAppShell({
  currentTab,
  onTabChange,
  allowedTabs,
  sidebarAccess,
  onSidebarAction,
  displayName,
  photoUrl,
  onOpenSettings,
  onOpenProfileEditor,
  onLogout,
  orcamentosBadge = 0,
  notificationCenter,
  children,
}: DesktopAppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const nav = filterDesktopNav(DESKTOP_NAV_ITEMS, allowedTabs);
  const sidebarItems = nav.filter((i) => i.sidebar !== false);
  const sidebarActions = sidebarAccess ? filterDesktopSidebarActions(sidebarAccess) : [];
  const pageTitle = desktopNavLabel(currentTab, nav);
  const topbarAccent = moduleAccentColor(currentTab);
  const topbarStyle = { '--desktop-topbar-accent': topbarAccent } as React.CSSProperties;

  return (
    <div className="desktop-shell-root font-sans">
      <aside
        className={`desktop-shell-sidebar${sidebarCollapsed ? ' desktop-shell-sidebar--collapsed' : ''}`}
        aria-label="Menu principal"
      >
        <div className="desktop-shell-sidebar-head">
          {!sidebarCollapsed ? (
            <div className="desktop-shell-sidebar-logo">
              <img src="/logo.png" alt="Rei do ABS" className="h-10 w-10 object-contain" />
            </div>
          ) : null}
          <button
            type="button"
            className="desktop-shell-sidebar-toggle"
            onClick={toggleSidebar}
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            ) : (
              <ChevronLeft className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            )}
          </button>
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
                title={sidebarCollapsed ? item.label : undefined}
              >
                <NavIcon item={item} />
                <span className="desktop-shell-nav-label min-w-0 truncate">{item.label}</span>
                {item.id === 'orcamentos' && orcamentosBadge > 0 ? (
                  <span className="desktop-shell-nav-badge ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white tabular-nums">
                    {orcamentosBadge > 99 ? '99+' : orcamentosBadge}
                  </span>
                ) : null}
              </button>
            );
          })}
          {sidebarActions.length > 0 && sidebarItems.length > 0 ? (
            <div className="mx-3 my-2 h-px bg-zinc-200/90 dark:bg-white/[0.08]" role="presentation" />
          ) : null}
          {sidebarActions.map((item) => (
            <button
              key={item.id}
              type="button"
              className="desktop-shell-nav-item desktop-shell-nav-item--action"
              onClick={() => onSidebarAction?.(item.id)}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <ActionNavIcon item={item} />
              <span className="desktop-shell-nav-label min-w-0 truncate">{item.label}</span>
            </button>
          ))}
        </nav>

        <a
          href="https://wa.me/"
          target="_blank"
          rel="noopener noreferrer"
          className="desktop-shell-support"
          title="Suporte"
        >
          <Headphones className="desktop-shell-support-icon h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
          <span className="desktop-shell-support-label">Suporte</span>
        </a>
      </aside>

      <div className="desktop-shell-main">
        <header
          className="desktop-shell-topbar"
          style={topbarStyle}
          data-accent-tone={moduleTopbarTextTone(currentTab)}
          aria-label="Página atual"
        >
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
            {notificationCenter ? (
              <NotificationCenter placement="desktopTopbar" {...notificationCenter} />
            ) : null}
            <DesktopShellAccountMenu
              displayName={displayName}
              photoUrl={photoUrl}
              onOpenProfileEditor={onOpenProfileEditor}
              onLogout={onLogout}
            />
          </div>
        </header>

        <div className="desktop-shell-content custom-scrollbar">
          <div className="desktop-shell-content-inner">{children}</div>
        </div>
      </div>
    </div>
  );
}
