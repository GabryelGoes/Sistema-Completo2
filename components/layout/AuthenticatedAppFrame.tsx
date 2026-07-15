import React from 'react';
import type { TabId } from '../TabBar';
import { OverlayPageNavBar } from '../ui/OverlayPageNavBar';
import { DesktopShellProvider } from '../ui/DesktopShellContext';
import { DesktopAppShell } from './DesktopAppShell';
import type { NotificationCenterProps } from '../NotificationCenter';
import type { DesktopSidebarAccess, DesktopSidebarActionId } from '../../utils/desktopShellNav';
import type { DesktopShellSidebarModuleId } from '../../utils/desktopShellOverlayModules';
import type { DesktopShellOverlayTopbar } from '../../utils/desktopShellOverlayModules';

export type AuthenticatedAppFrameProps = {
  isDesktopShell: boolean;
  currentTab: TabId;
  onTabChange: (tab: TabId) => void;
  onBackFromOverlay: () => void;
  /** Label do botão Fechar nas páginas overlay (mobile). */
  overlayBackLabel?: string;
  allowedTabs?: TabId[];
  desktopSidebarAccess?: DesktopSidebarAccess;
  onDesktopSidebarAction?: (action: DesktopSidebarActionId) => void;
  displayName: string;
  photoUrl?: string | null;
  onOpenSettings?: () => void;
  onOpenProfileEditor?: () => void;
  onLogout?: () => void;
  orcamentosBadge?: number;
  notificationCenter?: Omit<NotificationCenterProps, 'placement'>;
  /** Título/cor da barra superior quando um módulo da sidebar está aberto (PC). */
  shellOverlayTopbar?: DesktopShellOverlayTopbar | null;
  activeSidebarAction?: DesktopShellSidebarModuleId | null;
  /** Contagem exibida ao lado do título na barra superior (ex.: veículos no Pátio). */
  topbarCountLabel?: string;
  theme?: 'dark' | 'light';
  onThemeChange?: (theme: 'dark' | 'light') => void;
  children: React.ReactNode;
};

export function AuthenticatedAppFrame({
  isDesktopShell,
  currentTab,
  onTabChange,
  onBackFromOverlay,
  overlayBackLabel = 'Fechar',
  allowedTabs,
  desktopSidebarAccess,
  onDesktopSidebarAction,
  displayName,
  photoUrl,
  onOpenSettings,
  onOpenProfileEditor,
  onLogout,
  orcamentosBadge,
  notificationCenter,
  shellOverlayTopbar = null,
  activeSidebarAction = null,
  topbarCountLabel,
  theme,
  onThemeChange,
  children,
}: AuthenticatedAppFrameProps) {
  if (isDesktopShell) {
    return (
      <div
        className="h-full min-h-0 flex flex-col overflow-hidden font-sans text-zinc-900 dark:text-zinc-100 transition-colors duration-300"
      >
        <DesktopShellProvider>
          <DesktopAppShell
            currentTab={currentTab}
            onTabChange={onTabChange}
            allowedTabs={allowedTabs}
            sidebarAccess={desktopSidebarAccess}
            onSidebarAction={onDesktopSidebarAction}
            displayName={displayName}
            photoUrl={photoUrl}
            onOpenSettings={onOpenSettings}
            onOpenProfileEditor={onOpenProfileEditor}
            onLogout={onLogout}
            orcamentosBadge={orcamentosBadge}
            notificationCenter={notificationCenter}
            shellOverlayTopbar={shellOverlayTopbar}
            activeSidebarAction={activeSidebarAction}
            topbarCountLabel={topbarCountLabel}
            theme={theme}
            onThemeChange={onThemeChange}
          >
            {children}
          </DesktopAppShell>
        </DesktopShellProvider>
      </div>
    );
  }

  return (
    <div
      className="h-full min-h-0 flex flex-col bg-light-page dark:bg-black relative overflow-hidden font-sans text-zinc-900 dark:text-white transition-colors duration-300"
    >
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[min(800px,100vw)] h-[420px] bg-brand-yellow/8 rounded-full pointer-events-none z-0" />
      <OverlayPageNavBar
        visible={currentTab !== 'home'}
        onBack={onBackFromOverlay}
        label={overlayBackLabel}
      />
      <main className="relative z-10 flex-1 min-h-0 flex flex-col overflow-hidden">{children}</main>
    </div>
  );
}
