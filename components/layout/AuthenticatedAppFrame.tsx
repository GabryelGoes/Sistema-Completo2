import React from 'react';
import type { TabId } from '../TabBar';
import { OverlayPageNavBar } from '../ui/OverlayPageNavBar';
import { DesktopShellProvider } from '../ui/DesktopShellContext';
import { DesktopAppShell } from './DesktopAppShell';
import type { NotificationCenterProps } from '../NotificationCenter';

export type AuthenticatedAppFrameProps = {
  isDesktopShell: boolean;
  currentTab: TabId;
  onTabChange: (tab: TabId) => void;
  onBackFromOverlay: () => void;
  allowedTabs?: TabId[];
  displayName: string;
  photoUrl?: string | null;
  onOpenSettings?: () => void;
  onOpenProfileEditor?: () => void;
  onLogout?: () => void;
  orcamentosBadge?: number;
  effectsEnabled: boolean;
  notificationCenter?: Omit<NotificationCenterProps, 'placement'>;
  children: React.ReactNode;
};

export function AuthenticatedAppFrame({
  isDesktopShell,
  currentTab,
  onTabChange,
  onBackFromOverlay,
  allowedTabs,
  displayName,
  photoUrl,
  onOpenSettings,
  onOpenProfileEditor,
  onLogout,
  orcamentosBadge,
  effectsEnabled,
  notificationCenter,
  children,
}: AuthenticatedAppFrameProps) {
  if (isDesktopShell) {
    return (
      <div
        className="h-full min-h-0 flex flex-col overflow-hidden font-sans text-zinc-900 dark:text-zinc-100 transition-colors duration-300"
        data-effects={effectsEnabled ? 'on' : 'off'}
      >
        <DesktopShellProvider>
          <DesktopAppShell
            currentTab={currentTab}
            onTabChange={onTabChange}
            allowedTabs={allowedTabs}
            displayName={displayName}
            photoUrl={photoUrl}
            onOpenSettings={onOpenSettings}
            onOpenProfileEditor={onOpenProfileEditor}
            onLogout={onLogout}
            orcamentosBadge={orcamentosBadge}
            notificationCenter={notificationCenter}
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
      data-effects={effectsEnabled ? 'on' : 'off'}
    >
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-brand-yellow/5 rounded-full blur-[120px] pointer-events-none z-0" />
      <OverlayPageNavBar visible={currentTab !== 'home'} onBack={onBackFromOverlay} />
      <main className="relative z-10 flex-1 min-h-0 flex flex-col overflow-hidden">{children}</main>
    </div>
  );
}
