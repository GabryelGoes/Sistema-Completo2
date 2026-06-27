import React from 'react';
import { getVehicleBrandLogoUrl } from '../../utils/vehicleBrandLogo';

export type VehicleBrandLogoSize = 'card' | 'cardPc' | 'modal' | 'modalPc';

const SIZE_CLASS: Record<VehicleBrandLogoSize, string> = {
  card: 'h-8 w-10',
  /** Card no Pátio (modo PC): +20% em relação ao card padrão */
  cardPc: 'h-[2.4rem] w-[3rem]',
  modal: 'h-9 w-11',
  /** Modal de veículo (modo PC): +60% em relação ao modal padrão */
  modalPc: 'h-[3.6rem] w-[4.4rem]',
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
