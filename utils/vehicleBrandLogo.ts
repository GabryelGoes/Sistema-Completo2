/** Marcas com arquivo em /public/brands/{slug}.png */
export const VEHICLE_BRAND_LOGO_SLUGS = [
  'amg', 'audi', 'bmw', 'byd', 'chery', 'chevrolet', 'citroen', 'dodge', 'ferrari', 'fiat',
  'ford', 'geely', 'gm', 'gwm', 'honda', 'hummer', 'hyundai', 'iveco',   'jeep', 'kia', 'lamborghini', 'land-rover', 'lifan', 'mercedes-benz', 'mini', 'mitsubishi', 'nissan', 'peugeot',
  'porsche', 'ram', 'renault', 'subaru', 'suzuki', 'tesla', 'toyota', 'volkswagen', 'volvo', 'yamaha',
] as const;

export type VehicleBrandLogoSlug = (typeof VEHICLE_BRAND_LOGO_SLUGS)[number];

const BRAND_ALIASES: Record<string, VehicleBrandLogoSlug> = {
  amg: 'amg',
  'mercedes amg': 'amg',
  'mercedes-amg': 'amg',
  audi: 'audi',
  bmw: 'bmw',
  byd: 'byd',
  chery: 'chery',
  'caoa chery': 'chery',
  chevrolet: 'chevrolet',
  chevy: 'chevrolet',
  gm: 'gm',
  'general motors': 'gm',
  citroen: 'citroen',
  citroën: 'citroen',
  dodge: 'dodge',
  ram: 'ram',
  ferrari: 'ferrari',
  fiat: 'fiat',
  ford: 'ford',
  geely: 'geely',
  gwm: 'gwm',
  'great wall': 'gwm',
  'great wall motor': 'gwm',
  honda: 'honda',
  hummer: 'hummer',
  hyundai: 'hyundai',
  iveco: 'iveco',
  jeep: 'jeep',
  kia: 'kia',
  lifan: 'lifan',
  lamborghini: 'lamborghini',
  'land rover': 'land-rover',
  'land-rover': 'land-rover',
  range: 'land-rover',
  'range rover': 'land-rover',
  mercedes: 'mercedes-benz',
  'mercedes benz': 'mercedes-benz',
  'mercedes-benz': 'mercedes-benz',
  benz: 'mercedes-benz',
  mini: 'mini',
  mitsubishi: 'mitsubishi',
  nissan: 'nissan',
  peugeot: 'peugeot',
  porsche: 'porsche',
  renault: 'renault',
  subaru: 'subaru',
  suzuki: 'suzuki',
  tesla: 'tesla',
  toyota: 'toyota',
  volkswagen: 'volkswagen',
  vw: 'volkswagen',
  volvo: 'volvo',
  yamaha: 'yamaha',
};

function normalizeBrandKey(brand: string): string {
  return brand
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Resolve o slug do arquivo de logo a partir do nome da marca (vehicle_brand). */
export function resolveVehicleBrandLogoSlug(brand?: string | null): VehicleBrandLogoSlug | null {
  const key = normalizeBrandKey(brand ?? '');
  if (!key) return null;
  if (key in BRAND_ALIASES) return BRAND_ALIASES[key];
  const slug = key.replace(/\s+/g, '-');
  if ((VEHICLE_BRAND_LOGO_SLUGS as readonly string[]).includes(slug)) {
    return slug as VehicleBrandLogoSlug;
  }
  return null;
}

export function getVehicleBrandLogoUrl(brand?: string | null): string | null {
  const slug = resolveVehicleBrandLogoSlug(brand);
  return slug ? `/brands/${slug}.png` : null;
}

/** Escala extra por marca (1 = padrão). */
export const BRAND_LOGO_SIZE_SCALE: Partial<Record<VehicleBrandLogoSlug, number>> = {
  gm: 1.25,
  chevrolet: 1.6,
  'land-rover': 1.2,
  ford: 1.1,
};

export function getVehicleBrandLogoScale(brand?: string | null): number {
  const slug = resolveVehicleBrandLogoSlug(brand);
  if (!slug) return 1;
  return BRAND_LOGO_SIZE_SCALE[slug] ?? 1;
}
