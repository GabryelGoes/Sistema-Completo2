import React from 'react';
import { getVehicleBrandLogoUrl } from '../../utils/vehicleBrandLogo';

export type VehicleBrandLogoSize = 'card' | 'modal';

const SIZE_CLASS: Record<VehicleBrandLogoSize, string> = {
  card: 'h-8 w-10',
  modal: 'h-9 w-11',
};

interface VehicleBrandLogoProps {
  brand?: string | null;
  size?: VehicleBrandLogoSize;
  className?: string;
  title?: string;
}

/** Logo da montadora — mesma proporção (caixa 5:4) em cards e modais. */
export const VehicleBrandLogo: React.FC<VehicleBrandLogoProps> = ({
  brand,
  size = 'card',
  className = '',
  title,
}) => {
  const src = getVehicleBrandLogoUrl(brand);
  if (!src) return null;

  const label = title ?? (brand?.trim() || 'Marca do veículo');

  return (
    <div
      className={`inline-flex shrink-0 items-center justify-center ${SIZE_CLASS[size]} ${className}`}
      title={label}
      aria-label={label}
    >
      <img
        src={src}
        alt=""
        className="max-h-full max-w-full object-contain object-center"
        draggable={false}
        loading="lazy"
      />
    </div>
  );
};
