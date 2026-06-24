import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { WorkshopPart, WorkshopPartCategory, WorkshopPartPurchase } from '../../services/apiService';
import {
  getWorkshopPartCategories,
  getWorkshopPartLabContext,
  getWorkshopPartPhotos,
  getWorkshopPartPurchases,
  type WorkshopPartLabContext,
} from '../../services/apiService';
import { WorkshopPartDetailView } from '../WorkshopPartDetailView';
import { IosModalHeader } from '../ui/IosModalHeader';
import { ModalPortal } from '../ui/ModalPortal';
import { iosModalClose, iosModalShell } from '../ui/iosModalStyles';
import type { PartPhotoSlot } from '../WorkshopPartRegistrationForm';
import { workshopPartPhotosToSlots, workshopPartToPhotoSlots } from '../../utils/workshopPartPhotoSlots';

export type WorkshopPartQuickViewModalProps = {
  part: WorkshopPart | null;
  catalogNumber?: number;
  onClose: () => void;
  /** Botão opcional para aplicar a peça na linha do orçamento em edição. */
  onUseInBudget?: (part: WorkshopPart) => void;
};

export const WorkshopPartQuickViewModal: React.FC<WorkshopPartQuickViewModalProps> = ({
  part,
  catalogNumber,
  onClose,
  onUseInBudget,
}) => {
  const [photos, setPhotos] = useState<PartPhotoSlot[]>([]);
  const [purchases, setPurchases] = useState<WorkshopPartPurchase[]>([]);
  const [categories, setCategories] = useState<WorkshopPartCategory[]>([]);
  const [labContext, setLabContext] = useState<WorkshopPartLabContext | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!part) {
      setPhotos([]);
      setPurchases([]);
      setLabContext(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void Promise.all([
      getWorkshopPartPhotos(part.id).catch(() => []),
      getWorkshopPartPurchases(part.id).catch(() => []),
      getWorkshopPartCategories().catch(() => []),
      getWorkshopPartLabContext(part.id).catch(() => ({ context: null })),
    ])
      .then(([photoRows, purchaseRows, categoryRows, labRes]) => {
        if (cancelled) return;
        setPhotos(workshopPartPhotosToSlots(photoRows, part.photo_url));
        setPurchases(purchaseRows);
        setCategories(categoryRows);
        setLabContext(labRes.context ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setPhotos(workshopPartToPhotoSlots(part));
        setPurchases([]);
        setCategories([]);
        setLabContext(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [part?.id]);

  if (!part) return null;

  const subtitle = [
    catalogNumber != null ? `#${catalogNumber}` : null,
    part.brand?.trim() || null,
    part.name,
    part.location?.trim() || null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[235] flex items-center justify-center bg-black/50 p-2 sm:p-4"
        onClick={onClose}
        role="presentation"
      >
        <div
          className={`${iosModalShell} relative flex max-h-[min(94dvh,calc(100dvh-2rem))] w-full max-w-[min(98vw,1280px)] flex-col overflow-hidden`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="workshop-part-quick-view-title"
        >
          <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>

          <div className="shrink-0 border-b border-zinc-200/70 bg-white px-6 pb-4 pt-8 pr-28 dark:border-white/[0.06] dark:bg-transparent">
            <IosModalHeader
              icon={<img src="/icons/estoque-ios.png" alt="" className="h-full w-full min-h-0 object-cover" />}
              title="Produto do estoque"
              subtitle={subtitle || part.name}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-auto bg-white px-6 py-6 sm:px-8 custom-scrollbar dark:bg-transparent">
            <WorkshopPartDetailView
              part={part}
              catalogNumber={catalogNumber}
              photos={photos}
              purchases={purchases}
              categories={categories}
              labContext={labContext}
              loading={loading}
              readOnly
              onEdit={() => {}}
              onDelete={() => {}}
              footerExtra={
                onUseInBudget ? (
                  <button
                    type="button"
                    onClick={() => onUseInBudget(part)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-[15px] font-semibold text-white hover:bg-sky-500"
                  >
                    Usar neste orçamento
                  </button>
                ) : null
              }
            />
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
