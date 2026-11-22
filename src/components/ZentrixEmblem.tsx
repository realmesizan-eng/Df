import { useState } from 'react';
import { Shield } from 'lucide-react';

interface ZentrixEmblemProps {
  size?: number;
  className?: string;
}

export const ZENTRIX_EMBLEM_SRC = '/src/assets/images/zentrix_emblem_1795378919761.jpg';
export const ZENTRIX_SURFACE_SRC = '/src/assets/images/zentrix_hardware_surface_1795378917907.jpg';

export function ZentrixEmblem({ size = 36, className = '' }: ZentrixEmblemProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex items-center justify-center rounded-lg border border-[#2A3340] bg-[#101419] text-[#39FF14] shrink-0 ${className}`}
        aria-label="ZENTRIX Emblem"
      >
        <Shield className="w-1/2 h-1/2" />
      </div>
    );
  }

  return (
    <img
      src={ZENTRIX_EMBLEM_SRC}
      alt="ZENTRIX Shield Emblem"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className={`rounded-lg object-cover border border-[#222A35] shrink-0 ${className}`}
    />
  );
}
