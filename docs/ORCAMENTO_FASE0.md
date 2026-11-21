# Orçamento — Fase 0 (dados da empresa, logo e padrões)

Primeira entrega do plano `LEVANTAMENTO_ORCAMENTO_2026-11-21.md`. Um orçamento em PDF precisa mostrar quem emite; até aqui a empresa só tinha nome e segmento.

## O que mudou
Tela **Configurações → Empresa** (só proprietário e administradores), em quatro blocos:
1. **Dados da empresa** (nome e segmento, como antes).
2. **Dados cadastrais** (opcionais): razão social, CNPJ/CPF (dígitos conferidos), telefone, WhatsApp, e-mail, site, endereço completo e UF. Documento e CEP são gravados com a pontuação padrão, o site ganha `https://`.
3. **Logo**: PNG, JPG ou WEBP de até 512 KB (32 a 4.000 pixels). O tipo é conferido pelo **conteúdo** do arquivo (assinatura), no servidor e de novo no banco; SVG é recusado de propósito (pode carregar script).
4. **Padrões dos orçamentos**: validade padrão (1 a 365 dias, começa em 15), condições de pagamento (até 1.000 caracteres) e rodapé (até 300).

## Banco (migration `20261121100000_company_profile_logo_quote_defaults`, com volta)
- `companies`: 13 colunas novas, todas opcionais, com limites.
- `company_logos`: o logo em base64 (o servidor local não tem serviço de arquivos). Sem escrita direta; leitura por membros da empresa (RLS).
- Padrões do orçamento em `company_settings.operational_preferences.quote`.
- Funções `update_company_profile`, `set_company_logo`, `remove_company_logo`, `update_company_quote_defaults` (só dono/admin, com auditoria; a auditoria não guarda CNPJ nem endereço, só se foram preenchidos).
- Bateria `tests/sql/company_profile.sql`: 36 verificações em transação revertida.

## Logo no navegador
`/api/empresa/logo` entrega o logo **da empresa da sessão** (nunca por parâmetro da URL), com `nosniff`, `Content-Security-Policy: sandbox` e ETag. As próximas fases usam o mesmo caminho no PDF.

## Próximas fases
Fase 1: tabelas, lista, criar/editar, totais, numeração, situações e PDF com react-pdf. Fase 2: link público, WhatsApp, converter em venda.
