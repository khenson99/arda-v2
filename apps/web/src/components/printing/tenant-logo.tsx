// ─── Tenant Logo (Print) ─────────────────────────────────────────────
// Renders the tenant logo or a text fallback for print output.

import { cn } from '@/lib/utils';

const SIZE_MAP = {
  card: { width: 120, height: 28 },
  business_card: { width: 80, height: 20 },
} as const;

interface TenantLogoProps {
  logoUrl?: string;
  tenantName: string;
  variant?: keyof typeof SIZE_MAP;
  className?: string;
}

export function TenantLogo({
  logoUrl,
  tenantName,
  variant = 'card',
  className,
}: TenantLogoProps) {
  const size = SIZE_MAP[variant];

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${tenantName} logo`}
        width={size.width}
        height={size.height}
        className={cn('object-contain', className)}
        style={{ maxWidth: size.width, maxHeight: size.height }}
      />
    );
  }

  return (
    <span
      className={cn('text-[10px] font-semibold text-muted-foreground truncate', className)}
      style={{ maxWidth: size.width }}
    >
      {tenantName}
    </span>
  );
}
