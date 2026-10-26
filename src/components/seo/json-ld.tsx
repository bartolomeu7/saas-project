import { serializeJsonLd } from "@/lib/seo/structured-data";

/**
 * Bloco JSON-LD (schema.org). Componente de servidor, sem JavaScript no navegador. O conteúdo vem SEMPRE de constantes do
 * código (nunca de entrada do usuário) e é serializado com escape de `<`, `>` e `&` (ver serializeJsonLd).
 * Usar só em páginas públicas indexáveis (hoje: a página inicial); nunca em áreas privadas ou administrativas.
 */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
