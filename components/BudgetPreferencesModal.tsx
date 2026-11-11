import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { iosModalShell, iosModalClose, iosModalInsetCard, resolveIosModalOverlayClass } from './ui/iosModalStyles';
import { ModalPortal } from './ui/ModalPortal';
import { IosModalHeader } from './ui/IosModalHeader';
import { useRegisterModalOpen } from './ui/ModalLayerContext';
import { useDesktopShellLayout } from './ui/DesktopShellContext';
import { IosSwitch } from './ui/IosSwitch';
import { getWorkshopSettings, updateWorkshopSettings } from '../services/apiService';
import {
  AI_IMPROVE_TEXT_LEVELS,
  DEFAULT_AI_IMPROVE_TEXT_LEVEL,
  normalizeAiImproveTextLevel,
  type AiImproveTextLevel,
} from '../utils/aiImproveTextLevel';

interface BudgetPreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  blurUnverifiedBudgets: boolean;
  onBlurUnverifiedBudgetsChange: (enabled: boolean) => void;
}

export const BudgetPreferencesModal: React.FC<BudgetPreferencesModalProps> = ({
  isOpen,
  onClose,
  blurUnverifiedBudgets,
  onBlurUnverifiedBudgetsChange,
}) => {
  useRegisterModalOpen(isOpen);
  const isDesktopShell = useDesktopShellLayout();
  const [aiLevel, setAiLevel] = useState<AiImproveTextLevel>(DEFAULT_AI_IMPROVE_TEXT_LEVEL);
  const [aiLevelLoading, setAiLevelLoading] = useState(false);
  const [aiLevelSaving, setAiLevelSaving] = useState(false);
  const [aiLevelError, setAiLevelError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setAiLevelLoading(true);
    setAiLevelError(null);
    getWorkshopSettings()
      .then((s) => {
        if (cancelled) return;
        setAiLevel(normalizeAiImproveTextLevel(s.aiImproveTextLevel));
      })
      .catch(() => {
        if (!cancelled) setAiLevel(DEFAULT_AI_IMPROVE_TEXT_LEVEL);
      })
      .finally(() => {
        if (!cancelled) setAiLevelLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleAiLevelChange = async (next: AiImproveTextLevel) => {
    if (next === aiLevel || aiLevelSaving) return;
    const previous = aiLevel;
    setAiLevel(next);
    setAiLevelSaving(true);
    setAiLevelError(null);
    try {
      const saved = await updateWorkshopSettings({ aiImproveTextLevel: next });
      setAiLevel(normalizeAiImproveTextLevel(saved.aiImproveTextLevel ?? next));
    } catch (err: unknown) {
      setAiLevel(previous);
      setAiLevelError(
        err instanceof Error ? err.message : 'Não foi possível salvar o nível de correção.'
      );
    } finally {
      setAiLevelSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div className={resolveIosModalOverlayClass(isDesktopShell)}>
        <div className={`${iosModalShell} max-h-[94vh] max-w-xl`}>
          <button
            type="button"
            onClick={onClose}
            className={`${iosModalClose} z-50 shadow-sm ring-1 ring-zinc-200/80 dark:ring-white/10`}
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
            <div className="px-6 sm:px-8 pt-8 pb-4 shrink-0 pr-14">
              <IosModalHeader
                icon={
                  <img
                    src="/icons/orcamentos-ios.png"
                    alt=""
                    className="h-full w-full min-h-0 object-cover"
                  />
                }
                title="Ajustes de orçamentos"
                subtitle="Preferências do hub e da melhoria de textos"
              />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 sm:px-8 pb-8 space-y-4">
              <div className={`${iosModalInsetCard} p-4 sm:p-5`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="text-[15px] font-medium text-zinc-900 dark:text-white block">
                      Embaçar orçamentos sem verificação
                    </label>
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      No hub de Orçamentos, itens ainda não verificados ficam embassados com
                      “Aguardando aprovação” (não vale para admin / acesso total)
                    </p>
                  </div>
                  <IosSwitch
                    id="budget-prefs-blur-unverified"
                    checked={blurUnverifiedBudgets}
                    onChange={() => onBlurUnverifiedBudgetsChange(!blurUnverifiedBudgets)}
                    ariaLabel="Embaçar orçamentos sem verificação"
                  />
                </div>
              </div>

              <div className={`${iosModalInsetCard} p-4 sm:p-5`}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#007AFF]/10 text-[#007AFF]">
                    <Sparkles className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[15px] font-medium text-zinc-900 dark:text-white">
                        Melhoria de texto (IA)
                      </p>
                      {aiLevelLoading || aiLevelSaving ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zinc-400" aria-hidden />
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">
                      Define o quanto o botão Melhorar reescreve o diagnóstico do orçamento —
                      organizar ideias e explicar melhor.
                    </p>

                    <div
                      className="mt-3 grid grid-cols-3 gap-1.5 rounded-2xl bg-zinc-100/90 p-1 dark:bg-zinc-950/60"
                      role="radiogroup"
                      aria-label="Nível de correção da IA"
                    >
                      {AI_IMPROVE_TEXT_LEVELS.map((opt) => {
                        const selected = aiLevel === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={aiLevelLoading || aiLevelSaving}
                            onClick={() => void handleAiLevelChange(opt.id)}
                            className={`rounded-xl px-2 py-2.5 text-center transition ${
                              selected
                                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white'
                                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100'
                            } disabled:opacity-60`}
                          >
                            <span className="block text-[13px] font-semibold">{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    <p className="mt-2.5 text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">
                      {AI_IMPROVE_TEXT_LEVELS.find((o) => o.id === aiLevel)?.hint}
                    </p>
                    {aiLevelError ? (
                      <p className="mt-2 text-[12px] font-medium text-red-600 dark:text-red-400">
                        {aiLevelError}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
