"use client";

import { useEffect } from "react";

/**
 * Só é usado se o próprio root layout (src/app/layout.tsx) lançar uma
 * exceção — nesse caso error.tsx não é suficiente porque ele também vive
 * dentro do layout. Por isso precisa das próprias tags <html>/<body> e não
 * pode depender de nenhum provider (ClerkProvider, tema, etc.) do layout
 * que acabou de falhar.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.5rem",
          padding: "1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div>
          <p style={{ fontSize: "0.875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: "#dc2626" }}>
            Algo deu errado
          </p>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0.5rem 0" }}>
            Não foi possível carregar o Prime Ges
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#6b7280", maxWidth: "24rem" }}>
            Tente novamente em instantes.
          </p>
        </div>
        <button
          onClick={reset}
          style={{
            padding: "0.5rem 1.25rem",
            borderRadius: "0.375rem",
            border: "1px solid #d1d5db",
            background: "#111827",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Tentar novamente
        </button>
      </body>
    </html>
  );
}
