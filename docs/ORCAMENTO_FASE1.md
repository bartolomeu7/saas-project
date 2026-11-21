# Orçamento — Fase 1 (MVP)

Data: 21/11/2026. Base: `docs/LEVANTAMENTO_ORCAMENTO_2026-11-21.md` (decisões) e `docs/ORCAMENTO_FASE0.md` (dados da empresa, logo e padrões).

## O que a Fase 1 entrega

- Menu **Gestão → Orçamentos** (qualquer membro da empresa usa, como em Vendas).
- **Lista** `/app/orcamentos`: cartões (rascunhos, aguardando resposta, aprovados, vencidos), busca por número/cliente/assunto/documento/telefone e filtro por situação.
- **Criar e editar** (`/novo`, `/[id]/editar`): cliente cadastrado (dados copiados) ou digitado; itens de produto, de serviço ou **livres**; quantidade com até 3 casas; preço e desconto por item; desconto geral; validade (padrão da empresa, 15 dias); condições de pagamento, prazo, observações e rodapé. O total aparece ao vivo, mas **o banco recalcula tudo** ao salvar.
- **Detalhe** `/[id]`: dados, itens, totais, histórico e botões (editar, baixar PDF, marcar como enviado, cliente aprovou/recusou com motivo, voltar para rascunho, duplicar, excluir rascunho).
- **PDF** `/api/orcamentos/[id]/pdf` (react-pdf, A4): logo (PNG/JPG), dados da empresa, cliente, tabela de itens, totais, condições, rodapé e "Página X de Y".
- Numeração por empresa e ano: `ORC-2026-0001`; número de rascunho excluído **não** é reaproveitado.

## Situações

`Rascunho → Enviado → Aprovado | Recusado`; `Enviado`/`Recusado → Rascunho` (reabrir). **Vencido** não é gravado: é "enviado com a validade já passada" (calculado na tela e nos filtros). Vencido não pode ser aprovado nem enviado. Só rascunho edita ou exclui. `Convertido` fica reservado para a Fase 2 (converter em venda).

## Segurança e integridade

- Tabelas `quotes`, `quote_items`, `quote_events`, `quote_counters` com RLS (membros leem); **sem** INSERT/UPDATE/DELETE para o app — toda escrita passa por funções `SECURITY DEFINER` (`create_quote`, `update_quote`, `set_quote_status`, `delete_quote`, `duplicate_quote`) com auditoria em `audit_logs` e evento em `quote_events`.
- Empresa sempre vem da sessão; produto/serviço/cliente de outra empresa são recusados; restrições do banco como última barreira (`total = subtotal − desconto`, quantidade > 0, número único por empresa).
- Mensagens de regra de negócio (código `P0001`) vão à tela; qualquer outro erro vira mensagem genérica e é logado.
- A rota do PDF busca o orçamento **com** o filtro da empresa (id de outra empresa = 404) e responde `no-store` + `nosniff`.

## Testes

| Camada | Arquivo | Resultado |
|---|---|---|
| Banco (transação revertida) | `tests/sql/quotes.sql` | 119/119 |
| Regras puras (totais em centavos, situações, datas, texto do PDF) | `tests/unit/orcamento-fase1-regras.test.mjs` | 12 |
| Formulário, modelo do PDF, PDF real e fiação | `tests/unit/orcamento-fase1-pdf-e-formulario.test.mjs` | 16 |
| Suíte inteira | `npm run test:unit` | 1.134 testes, 0 falhas, 1 ignorado |
| Tipos / lint / build | `tsc`, `eslint`, `npm run build` | sem erros |
| Migration + reversão | aplicadas e revertidas na mesma transação | ok |

Descoberta dos testes: o react-pdf falha com "unsupported number" ao usar o texto dinâmico "Página X de Y" a partir de ~11 páginas. O gerador tenta com a numeração e, se falhar, gera de novo sem ela (orçamento com mais de 10 páginas é raro: 100 itens com 300 caracteres).

## Limites conhecidos (viram Fase 2)

- Logo **WEBP** é aceito no cadastro, mas o react-pdf só desenha PNG/JPG: no PDF aparece só o nome da empresa.
- Fonte padrão do PDF (Helvetica): emoji e alfabetos não latinos são removidos do texto do PDF (acentos e "R$" ficam).
- Um modelo de PDF. Link público para o cliente aprovar/recusar, envio por WhatsApp/e-mail, converter em venda, 2–3 modelos e marcar vencidos automaticamente ficam para a Fase 2.

## Publicação e reversão

1. Mesclar o PR.
2. `E:\primeges-local\scripts\publicar.ps1` (backup, aplica `20261121200000_quotes.sql`, registra no ledger, troca imagem, teste de fumaça, volta automática se falhar). Depois da migration: `NOTIFY pgrst, 'reload schema'` (já está no final do arquivo).
3. Reverter: `supabase/rollback/20261121200000_quotes.down.sql` (apaga os orçamentos criados — faça backup antes se já houver uso) e voltar a imagem anterior.
