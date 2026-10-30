import React from 'react';
import { MaterialCategory } from '../../types';

interface MaterialSpecimenThumbProps {
  category: MaterialCategory;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const MaterialSpecimenThumb: React.FC<MaterialSpecimenThumbProps> = ({
  category,
  size = 'md',
  className = '',
}) => {
  const dimensions =
    size === 'sm'
      ? 'w-10 h-10'
      : size === 'lg'
      ? 'w-full h-44'
      : 'w-14 h-14';

  return (
    <div
      className={`relative overflow-hidden bg-[#EFEEE8] border border-[#E7E4DC] flex items-center justify-center shrink-0 select-none ${dimensions} ${className}`}
      aria-hidden="true"
    >
      {category === 'Cement' && (
        <svg viewBox="0 0 120 90" className="w-full h-full">
          <rect width="120" height="90" fill="#EAE7DF" />
          <ellipse cx="60" cy="74" rx="38" ry="7" fill="#D5D1C5" />
          {/* Bottom Cement Bag */}
          <path d="M26 54 L60 44 L94 54 L94 66 L60 76 L26 66 Z" fill="#C8B9A6" stroke="#9B8B78" strokeWidth="1.2" />
          <path d="M26 54 L60 64 L94 54" fill="none" stroke="#B09F8B" strokeWidth="1.2" />
          {/* Top Cement Bag */}
          <path d="M30 36 L60 26 L90 36 L90 48 L60 58 L30 48 Z" fill="#D9CCB9" stroke="#9B8B78" strokeWidth="1.2" />
          <path d="M42 36 L60 42 L78 36 L60 30 Z" fill="#315744" opacity="0.88" />
          <line x1="28" y1="42" x2="58" y2="51" stroke="#BD704F" strokeWidth="2" />
        </svg>
      )}

      {category === 'Bricks' && (
        <svg viewBox="0 0 120 90" className="w-full h-full">
          <rect width="120" height="90" fill="#EFEBE4" />
          <ellipse cx="60" cy="74" rx="38" ry="7" fill="#D8D2C7" />
          {/* Brick 1 */}
          <path d="M24 52 L58 40 L92 52 L58 64 Z" fill="#C87A5B" stroke="#8F4F36" strokeWidth="1.2" />
          <path d="M24 52 L24 65 L58 77 L58 64 Z" fill="#B56547" stroke="#8F4F36" strokeWidth="1.2" />
          <path d="M58 64 L58 77 L92 65 L92 52 Z" fill="#9E5337" stroke="#8F4F36" strokeWidth="1.2" />
          <circle cx="46" cy="52" r="3.2" fill="#6E3621" />
          <circle cx="58" cy="52" r="3.2" fill="#6E3621" />
          <circle cx="70" cy="52" r="3.2" fill="#6E3621" />
          {/* Brick 2 */}
          <path d="M32 34 L64 23 L88 32 L56 43 Z" fill="#D18466" stroke="#8F4F36" strokeWidth="1.2" />
          <path d="M32 34 L32 45 L56 54 L56 43 Z" fill="#BD704F" stroke="#8F4F36" strokeWidth="1.2" />
          <path d="M56 43 L56 54 L88 43 L88 32 Z" fill="#A65B3E" stroke="#8F4F36" strokeWidth="1.2" />
          <circle cx="52" cy="33" r="2.8" fill="#6E3621" />
          <circle cx="62" cy="33" r="2.8" fill="#6E3621" />
          <circle cx="72" cy="33" r="2.8" fill="#6E3621" />
        </svg>
      )}

      {category === 'Steel' && (
        <svg viewBox="0 0 120 90" className="w-full h-full">
          <rect width="120" height="90" fill="#EAE9E4" />
          <ellipse cx="60" cy="72" rx="40" ry="6" fill="#D2D0C8" />
          {/* Rebar bundle */}
          <line x1="22" y1="62" x2="96" y2="28" stroke="#4A524D" strokeWidth="7" strokeLinecap="round" />
          <line x1="26" y1="68" x2="100" y2="34" stroke="#363C38" strokeWidth="7" strokeLinecap="round" />
          <line x1="18" y1="55" x2="92" y2="21" stroke="#5E6661" strokeWidth="7" strokeLinecap="round" />
          {/* Rib markings */}
          <line x1="45" y1="44" x2="51" y2="56" stroke="#BD704F" strokeWidth="2.2" />
          <line x1="72" y1="31" x2="78" y2="43" stroke="#BD704F" strokeWidth="2.2" />
          <circle cx="26" cy="68" r="3.5" fill="#8C948E" />
          <circle cx="22" cy="62" r="3.5" fill="#9BA39D" />
          <circle cx="18" cy="55" r="3.5" fill="#ACB4AE" />
        </svg>
      )}

      {category === 'Pipes' && (
        <svg viewBox="0 0 120 90" className="w-full h-full">
          <rect width="120" height="90" fill="#ECEAE3" />
          <ellipse cx="60" cy="73" rx="38" ry="6" fill="#D5D2C8" />
          {/* PVC Pipes */}
          <path d="M24 54 L84 28 C90 28 94 34 92 40 L32 66 Z" fill="#7D8782" stroke="#525B56" strokeWidth="1.2" />
          <ellipse cx="28" cy="60" rx="6" ry="8" fill="#3D4440" stroke="#9AA39E" strokeWidth="2" />
          <path d="M36 62 L94 36 C99 36 102 42 100 48 L42 74 Z" fill="#929C97" stroke="#525B56" strokeWidth="1.2" />
          <ellipse cx="39" cy="68" rx="6" ry="8" fill="#2E3431" stroke="#B5BEB9" strokeWidth="2" />
        </svg>
      )}

      {category === 'Timber' && (
        <svg viewBox="0 0 120 90" className="w-full h-full">
          <rect width="120" height="90" fill="#EFECE4" />
          <ellipse cx="60" cy="73" rx="38" ry="6" fill="#D7D2C6" />
          {/* Planks */}
          <path d="M20 56 L78 30 L98 38 L40 64 Z" fill="#C99E67" stroke="#8C673A" strokeWidth="1.2" />
          <path d="M20 56 L20 65 L40 73 L40 64 Z" fill="#A87D4B" stroke="#8C673A" strokeWidth="1.2" />
          <path d="M40 64 L40 73 L98 47 L98 38 Z" fill="#B68B57" stroke="#8C673A" strokeWidth="1.2" />
          <path d="M26 42 L82 18 L98 25 L42 49 Z" fill="#D6AD79" stroke="#8C673A" strokeWidth="1.2" />
          <path d="M26 42 L26 50 L42 57 L42 49 Z" fill="#B58955" stroke="#8C673A" strokeWidth="1.2" />
          <path d="M42 49 L42 57 L98 33 L98 25 Z" fill="#C29662" stroke="#8C673A" strokeWidth="1.2" />
        </svg>
      )}

      {category === 'Aggregates' && (
        <svg viewBox="0 0 120 90" className="w-full h-full">
          <rect width="120" height="90" fill="#EAE8E1" />
          <ellipse cx="60" cy="74" rx="38" ry="6" fill="#D2CFC6" />
          {/* Concrete CMU Block */}
          <path d="M28 40 L60 26 L92 40 L60 54 Z" fill="#B8B6AE" stroke="#7A7872" strokeWidth="1.2" />
          <path d="M28 40 L28 64 L60 78 L60 54 Z" fill="#9E9C95" stroke="#7A7872" strokeWidth="1.2" />
          <path d="M60 54 L60 78 L92 64 L92 40 Z" fill="#87857E" stroke="#7A7872" strokeWidth="1.2" />
          {/* Twin Hollow Cores */}
          <polygon points="43,40 53,35 61,39 51,44" fill="#595853" />
          <polygon points="59,46 69,41 77,45 67,50" fill="#595853" />
        </svg>
      )}
    </div>
  );
};
