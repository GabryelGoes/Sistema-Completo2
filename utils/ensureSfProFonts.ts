/**
 * Garante SF Pro no Chrome/Windows via FontFace API (além do @font-face CSS).
 * URLs com hash do Vite — não dependem de /fonts/... no public.
 */
import sfProTextRegular from '../assets/fonts/sf-pro/sf-pro-text_regular.woff2?url';
import sfProTextSemibold from '../assets/fonts/sf-pro/sf-pro-text_semibold.woff2?url';
import sfProDisplayRegular from '../assets/fonts/sf-pro/sf-pro-display_regular.woff2?url';
import sfProDisplayMedium from '../assets/fonts/sf-pro/sf-pro-display_medium.woff2?url';
import sfProDisplaySemibold from '../assets/fonts/sf-pro/sf-pro-display_semibold.woff2?url';
import sfProDisplayBold from '../assets/fonts/sf-pro/sf-pro-display_bold.woff2?url';

type FaceSpec = {
  family: string;
  url: string;
  weight: string;
};

const FACES: FaceSpec[] = [
  { family: 'SFProText', url: sfProTextRegular, weight: '400' },
  { family: 'SFProText', url: sfProTextSemibold, weight: '500' },
  { family: 'SFProText', url: sfProTextSemibold, weight: '600' },
  { family: 'SFProText', url: sfProTextSemibold, weight: '700' },
  { family: 'SF Pro Text', url: sfProTextRegular, weight: '400' },
  { family: 'SF Pro Text', url: sfProTextSemibold, weight: '600' },
  { family: 'SF Pro Text', url: sfProTextSemibold, weight: '700' },
  { family: 'SFProDisplay', url: sfProDisplayRegular, weight: '400' },
  { family: 'SFProDisplay', url: sfProDisplayMedium, weight: '500' },
  { family: 'SFProDisplay', url: sfProDisplaySemibold, weight: '600' },
  { family: 'SFProDisplay', url: sfProDisplayBold, weight: '700' },
  { family: 'SF Pro Display', url: sfProDisplayRegular, weight: '400' },
  { family: 'SF Pro Display', url: sfProDisplaySemibold, weight: '600' },
  { family: 'SF Pro Display', url: sfProDisplayBold, weight: '700' },
];

let ensurePromise: Promise<void> | null = null;

export function ensureSfProFonts(): Promise<void> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') {
    return Promise.resolve();
  }
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    const loads = FACES.map(async ({ family, url, weight }) => {
      try {
        const face = new FontFace(family, `url(${url})`, {
          weight,
          style: 'normal',
          display: 'swap',
        });
        const loaded = await face.load();
        document.fonts.add(loaded);
      } catch {
        /* fallback CSS @font-face / sistema */
      }
    });
    await Promise.all(loads);
    document.documentElement.classList.add('sf-pro-ready');
  })();

  return ensurePromise;
}
