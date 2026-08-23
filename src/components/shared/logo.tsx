import Image from "next/image";
import { siteConfig } from "@/config/site";

/**
 * Logo + nome do produto. Não inclui o <Link> em volta — quem usa decide
 * o destino (`/` na landing, `/app` dentro do painel).
 */
export function Logo({ iconSize = 24 }: { iconSize?: number }) {
  return (
    <>
      <Image
        src="/logo.png"
        alt=""
        width={iconSize}
        height={iconSize}
        priority
        style={{ width: iconSize, height: iconSize }}
      />
      <span>{siteConfig.name}</span>
    </>
  );
}
