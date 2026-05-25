import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, User } from 'lucide-react';

export type DesktopShellAccountMenuProps = {
  displayName: string;
  photoUrl?: string | null;
  onOpenProfileEditor?: () => void;
  onLogout?: () => void;
};

export function DesktopShellAccountMenu({
  displayName,
  photoUrl,
  onOpenProfileEditor,
  onLogout,
}: DesktopShellAccountMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const updatePosition = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn || typeof window === 'undefined') return;
    const rect = btn.getBoundingClientRect();
    const menuWidth = 248;
    let left = rect.right - menuWidth;
    left = Math.max(12, Math.min(left, window.innerWidth - menuWidth - 12));
    setMenuStyle({
      position: 'fixed',
      top: rect.bottom + 8,
      left,
      width: menuWidth,
      zIndex: 99999,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
    };
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('click', onDoc, true);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('click', onDoc, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, updatePosition]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="desktop-shell-topbar-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Menu da conta"
        title={displayName}
      >
        {photoUrl ? (
          <img src={photoUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
        ) : (
          <User className="h-4 w-4" strokeWidth={2} />
        )}
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={menuStyle}
              className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white py-1.5 text-zinc-900 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.25)] dark:border-white/[0.12] dark:bg-zinc-900 dark:text-zinc-100"
            >
              {onOpenProfileEditor ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[14px] font-medium transition-colors hover:bg-zinc-100 dark:hover:bg-white/[0.08]"
                  onClick={() => {
                    setOpen(false);
                    onOpenProfileEditor();
                  }}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-50 dark:border-white/[0.1] dark:bg-white/[0.06]">
                    <User className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold leading-snug">Configurações de perfil</span>
                    <span className="mt-0.5 block text-[11px] font-normal text-zinc-500 dark:text-zinc-400">
                      Nome e foto
                    </span>
                  </span>
                </button>
              ) : null}
              {onLogout ? (
                <>
                  {onOpenProfileEditor ? (
                    <div className="mx-3 my-1 h-px bg-zinc-100 dark:bg-white/[0.08]" />
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[14px] font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                    onClick={() => {
                      setOpen(false);
                      onLogout();
                    }}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-200/80 bg-red-50 dark:border-red-500/25 dark:bg-red-500/15">
                      <LogOut className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden />
                    </span>
                    <span>Sair</span>
                  </button>
                </>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
