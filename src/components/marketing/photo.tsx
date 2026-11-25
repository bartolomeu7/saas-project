import type { ReactNode } from "react";
import Image from "next/image";
import { MARKETING_PHOTOS, type PhotoSlot } from "@/config/marketing-photos";
import { cn } from "@/lib/utils";

/** Foto do espaço `slot`; sem o arquivo ainda, mostra `fallback` (uma tela do sistema). */
export function MarketingPhoto({
  slot,
  fallback = null,
  className,
  sizes = "(min-width: 1024px) 50vw, 100vw",
  priority = false,
}: {
  slot: PhotoSlot;
  fallback?: ReactNode;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const photo = MARKETING_PHOTOS[slot];
  if (!photo) return <>{fallback}</>;
  return (
    <div className={cn("site-photo", className)}>
      <Image src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} sizes={sizes} priority={priority} className="h-full w-full object-cover" />
    </div>
  );
}
