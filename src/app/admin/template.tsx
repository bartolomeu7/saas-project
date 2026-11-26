import type { ReactNode } from "react";

/** Remonta a cada troca de aba do painel: é o que dá a entrada animada da página (ver admin.css). */
export default function AdminTemplate({ children }: { children: ReactNode }) {
  return <div className="prime-admin-enter">{children}</div>;
}
