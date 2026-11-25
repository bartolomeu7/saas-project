# Site público

## Páginas

| Endereço | Conteúdo |
|---|---|
| `/` | Apresentação: topo com a venda em tempo real, problema, caminho da venda, módulos, segmentos, passos, diferenciais, planos e perguntas |
| `/recursos` | Os 16 módulos, agrupados pela rotina, com o que cada um faz |
| `/produto` | Caminho da venda, outros fluxos ligados e acesso pelo celular |
| `/para-quem-e` | A rotina de cada segmento |
| `/precos` | Planos do catálogo e como funciona o pagamento (ordem de pagamento e ajuda) |
| `/duvidas` | Dúvidas mais buscadas (uma página por pergunta, ver [SEO.md](SEO.md)) e perguntas frequentes |

## Onde mexer

- **Textos:** `src/config/marketing.ts`. Só entra o que o produto faz hoje; sem depoimentos, clientes ou números inventados.
- **Planos e preços:** vêm do banco (`/admin/plans`). Salvar um plano revalida `/`, `/precos` e `/duvidas`.
- **Telas ilustrativas:** `src/components/marketing/screens.tsx`, com dados demonstrativos.
- **Fotos:** `src/config/marketing-photos.ts` (ver [FOTOS_MODELO_IA.md](FOTOS_MODELO_IA.md)).
- **Tema e animações:** `src/app/site.css`. Toda animação nova precisa da regra para "reduzir movimento".

## Módulos divulgados

Em 25/11/2026 o dono autorizou divulgar também Agenda, Orçamentos, Assistente de agenda, Compras, Fornecedores, Relatórios, Equipe e RH.
