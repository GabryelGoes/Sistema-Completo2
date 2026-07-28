import React from 'react';
import {
  getVehicleBrandLogoBoxScale,
  getVehicleBrandLogoScale,
  getVehicleBrandLogoUrl,
} from '../../utils/vehicleBrandLogo';

export type VehicleBrandLogoSize = 'card' | 'cardPc' | 'modal' | 'modalTablet' | 'modalPc';

/** Caixa base 5:4 em pixels (antes da escala por marca). */
const BASE_PX: Record<VehicleBrandLogoSize, { h: number; w: number }> = {
  card: { h: 32, w: 40 },
  cardPc: { h: 38.4, w: 48 },
  modal: { h: 36, w: 44 },
  modalTablet: { h: 27, w: 33 },
  modalPc: { h: 57.6, w: 70.4 },
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
  const scale = getVehicleBrandLogoScale(brand);
  const boxScale = getVehicleBrandLogoBoxScale(brand);
  const base = BASE_PX[size];

  return (
    <div
      className={`inline-flex shrink-0 items-center justify-center overflow-visible ${className}`}
      style={{
        width: base.w * scale * boxScale.w,
        height: base.h * scale * boxScale.h,
      }}
      title={label}
      aria-label={label}
    >
      <img
        src={src}
        alt=""
        className="h-full w-full object-contain object-center"
        draggable={false}
        loading="lazy"
      />
    </div>
  );
};
