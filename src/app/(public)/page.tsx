import { StatusBadge } from "@/components/shared/status-badge";
import { siteConfig } from "@/config/site";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Fundação do projeto
        </span>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {siteConfig.name}
        </h1>
        <p className="max-w-md text-balance text-muted-foreground">
          Micro SaaS
        </p>
      </div>

      <StatusBadge label="Aplicação Online" online />

      <p className="font-mono text-xs text-muted-foreground">
        env: {siteConfig.env}
      </p>
    </main>
  );
}
