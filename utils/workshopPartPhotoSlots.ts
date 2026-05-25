import type { WorkshopPart, WorkshopPartPhoto } from '../services/apiService';
import type { PartPhotoSlot } from '../components/WorkshopPartRegistrationForm';

export const WORKSHOP_PART_LEGACY_COVER_ID = 'legacy-cover';

/** Ordena fotos da galeria e, se vazio, usa `photo_url` legado da peça como capa. */
export function workshopPartPhotosToSlots(
  photos: WorkshopPartPhoto[],
  legacyCoverUrl?: string | null
): PartPhotoSlot[] {
  const sorted = [...photos].sort((a, b) => a.sort_order - b.sort_order);
  if (sorted.length > 0) {
    return sorted.map((ph) => ({
      id: ph.id,
      previewUrl: ph.photo_url,
      remoteUrl: ph.photo_url,
    }));
  }
  const cover = legacyCoverUrl?.trim();
  if (cover) {
    return [
      {
        id: WORKSHOP_PART_LEGACY_COVER_ID,
        previewUrl: cover,
        remoteUrl: cover,
      },
    ];
  }
  return [];
}

export function workshopPartToPhotoSlots(part: WorkshopPart): PartPhotoSlot[] {
  return workshopPartPhotosToSlots(part.photos ?? [], part.photo_url);
}
