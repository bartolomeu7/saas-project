# MEGA PACK PRIME GES — FASE 0: Inventário e Proteção da Base

Realizado em 2026-09-20. Natureza: **somente leitura/classificação**. Nenhum código alterado.

## Nota antes de tudo

Esta é a única fase executada nesta rodada. As Fases 1–18 do Mega Pack não foram iniciadas, por três motivos concretos, não por relutância:

1. **As Fases 4–8 (Contas a Pagar, Contas a Receber, Plano de Contas, Fluxo de Caixa, Financeiro/DRE) colidem diretamente com o relatório `FASE_5A_AUDITORIA_FINANCEIRO.md`**, que esta mesma auditoria já entregou: existem **20 decisões de negócio ainda sem resposta** (regime de caixa vs. competência, se Pix conta como recebido no ato, se haverá centros de custo, como estornos serão tratados, etc. — seção 32 daquele relatório). Implementar schema financeiro antes dessas respostas repetiria exatamente o erro que a migration 019 documentou (regra decidida tarde demais, código já escrito em cima).
2. **A Fase 1 (Catálogo de Reuso) pede pesquisa e adoção de código de terceiros do GitHub** — isso tem implicação de licença e de superfície de ataque (dependência nova, código não auditado rodando num SaaS financeiro real, sem staging). É uma decisão que merece revisão humana antes de qualquer adoção, não só antes do merge — o próprio Mega Pack concorda com isso ("Nunca copiar apenas porque 'parece bom'").
3. **O toolchain "NEXORA" citado no `CLAUDE.md` global não está totalmente presente neste ambiente** — `gh` CLI está instalado e funcional; `graphify` (Python) **não está instalado** (`ModuleNotFoundError`), apesar do `CLAUDE.md` afirmar "já instalado". Não tentei instalá-lo nem alterar nenhuma configuração global — isso está fora do escopo de uma tarefa de código neste repositório, e instalar dependências não solicitadas é uma das regras que o próprio `CLAUDE.md` proíbe ("NEVER: Install unnecessary dependencies"). Esta auditoria foi feita com as ferramentas padrão (leitura de arquivos, busca), sem depender de Graphify/Serena.

Nada disso impede a Fase 0 — ela é puramente descritiva do que já existe, com base em leitura direta do código e das 21 migrations já aplicadas (confirmadas, com evidência empírica adicional, no relatório `FASE_5A1_VERIFICACAO_MIGRATIONS.md`).

---

## Classificação por módulo

### 🟢 GREEN — já funciona, deve permanecer intocado

| Módulo | Evidência |
|---|---|
| Autenticação | Supabase Auth (e-mail/senha + Google OAuth), `src/lib/auth/actions.ts`, sessão via cookies, `middleware.ts` |
| RBAC de plataforma | `profiles.role` (`user/admin/super_admin`), trigger `protect_profile_restricted_fields`, guard em `src/lib/admin/guard.ts` |
| Multi-tenant | `companies`/`company_members`, RLS por `company_id` em toda tabela de negócio, `getCurrentCompany()` |
| Onboarding | `create_company_with_owner` (RPC, advisory lock — migration 017, confirmada existente na 5A.1) |
| Clientes | CRUD completo, documentos (Storage), sorteio, ranking, campos de aniversário/preferências |
| Produtos / Categorias | CRUD, estoque básico como coluna (`stock_quantity`), ajuste manual auditado |
| Serviços / Categorias | CRUD completo |
| Vendas | Rascunho → itens → pagamento(s) (parcial e múltiplo) → conclusão/cancelamento, `complete_sale`/`cancel_sale` (RPC, `FOR UPDATE`), margem/custo snapshot |
| Fidelidade | Settings, níveis, multiplicadores, campanhas, ledger append-only (`loyalty_transactions`), resgate/reversão/ajuste (RPCs `SECURITY DEFINER`) |
| **Caixa** | Abertura/fechamento, movimentações automáticas (trigger em `sale_payments`) e manuais, concorrência validada com `Promise.all` real (Fases 4/4.1) — **aprovado, menu habilitado** |
| Billing/Assinatura da plataforma | EvoPay/Pix, `confirm_subscription_payment` (RPC, `FOR UPDATE`, confirmada existente na 5A.1), webhook dedicado, trial de 1 dia com trava por usuário |
| Auditoria | `audit_logs` genérica, usada por todos os módulos acima |

**Regra desta fase, herdada do Mega Pack:** nenhum destes foi tocado, e nenhum será tocado sem parar, explicar motivo/impacto/risco/alternativa/arquivos afetados, e aguardar aprovação — exatamente como pedido.

### 🟡 YELLOW — existe parcialmente

| Módulo | O que existe | O que falta |
|---|---|---|
| Painel `/admin` | Guard de acesso (`src/lib/admin/guard.ts`) validado e usado pelo middleware | **Zero páginas** — `src/app/admin/` não tem nenhum `page.tsx` (confirmado por busca nesta fase) |
| Estoque avançado | Coluna `stock_quantity`/`minimum_stock` em `products`, baixa/restauração atômica em `complete_sale`/`cancel_sale`, auditoria via `audit_logs` | Sem movimentações dedicadas, sem entrada por compra, sem histórico de variação de custo, sem página própria (`/app/estoque` é só um link desabilitado no menu) |
| Relatórios | Dashboard (`/app`) com indicadores reais; `/app/clientes/ranking` com ranking real de compras | Sem módulo formal de relatórios; `/app/relatorios` é só um link desabilitado, sem `page.tsx` |
| Equipe/Membros | `company_members` com `role` (`owner/admin/employee`), suficiente para autorização | **Nenhum fluxo de convite/aceitação/remoção/suspensão** — hoje só existe o próprio onboarding (sempre como owner de uma empresa nova); `additional_user_limit`/`max_additional_users` já são gravados nas tabelas de billing, mas **não há nenhum ponto de código que os aplique** (não há como violar um limite que não tem fluxo de adicionar gente) |
| Notificações | Componente de UI real (`notification-button.tsx`) — sino funcional, dropdown abre/fecha | **Sem nenhum dado real** — o próprio código documenta isso: "Sem sistema de notificações real ainda... honesto sobre não ter nada para mostrar, em vez de simular notificações falsas" |
| Entitlements/limites | `company_entitlements` existe, é consultado pelo guard de assinatura (`getActiveSubscription`) para bloquear `/app/*` por status/expiração | Só cobre "a empresa pode acessar o app?" — não cobre nenhum limite de uso granular (nº de vendas, nº de produtos, nº de usuários) porque nenhuma dessas contagens tem hoje um limite de negócio definido além do de usuários (que por sua vez não é aplicado, por não existir fluxo de convite) |

### 🔴 RED — não existe ou insuficiente

Confirmado por auditoria exaustiva na Fase 5A (varredura de código + agente de busca dedicado — zero resultado real em todo o repositório para estes termos, exceto um texto de exemplo isolado):

- Fornecedores (cadastro, compras, custo de compra, contas a pagar, documentos, histórico)
- Compras / Pedidos de compra / Recebimento de mercadoria
- Contas a Pagar (título, parcela, vencimento, juros, multa, baixa, recorrência)
- Contas a Receber formal (título com vencimento — hoje só existe "saldo pendente implícito" derivável de `sale_payments`, sem parcela/vencimento/juros)
- Plano de Contas / Categorias financeiras / Centros de custo
- Fluxo de Caixa financeiro consolidado (previsto vs. realizado, projeções) — distinto do Caixa operacional (turno de gaveta), que já existe e está aprovado
- Financeiro / DRE / indicadores de lucro líquido (hoje só existe margem bruta por venda, `estimated_margin`)
- Agenda (compromissos, profissionais, recorrência, conflitos, timezone)
- Abstração de Storage (`StorageProvider`) — hoje só existe uso pontual do Supabase Storage para `customer_documents`, sem camada de abstração nem avaliação de R2/S3
- Adapters de integração genéricos — hoje só existe EvoPay, isolado mas sem um padrão de "provider" reutilizável para as próximas integrações
- Testes automatizados de qualquer tipo (unitário, integração, E2E) — confirmado desde o início desta sessão: não existe framework de teste configurado no projeto (`package.json` sem jest/vitest/playwright); toda validação até hoje foi manual (fixtures SQL + navegador real)

---

## Dependências entre módulos (conforme o próprio Mega Pack, já respeitadas pela arquitetura atual)

```
CLIENTES → VENDAS → PAGAMENTOS → CAIXA         [🟢 cadeia completa, já existe]
PRODUTOS → ESTOQUE → COMPRAS → FORNECEDORES    [🟡🔴 só Produtos existe; resto é RED]
VENDAS → CONTAS A RECEBER                       [🔴 RED — Vendas (🟢) não tem para onde apontar ainda]
COMPRAS/FORNECEDORES → CONTAS A PAGAR           [🔴 RED — nenhuma ponta existe]
RECEITAS + DESPESAS + CUSTOS → FINANCEIRO → RELATÓRIOS  [🔴 RED, exceto Custos (🟢 parcial, snapshot em Vendas)]
ASSINATURA → ENTITLEMENTS → LIMITES             [🟢🟡 assinatura e entitlements existem; limites de uso não são aplicados por falta do fluxo que os violaria]
AGENDA → CLIENTES + SERVIÇOS + EQUIPE           [🔴 RED — as três dependências (Clientes 🟢, Serviços 🟢, Equipe 🟡) já existem o suficiente para suportar Agenda quando for decidido construí-la]
```

---

## Recomendação de sequenciamento (não é uma decisão, é uma proposta técnica)

Dado que Estoque/Compras/Fornecedores (Fase 3) **não** depende de nenhuma das 20 decisões de negócio pendentes do Financeiro (Fase 5A, seção 32) — é um domínio operacional, não contábil — essa é a fase do Mega Pack com **menor risco de retrabalho** se for a próxima a avançar, tecnicamente falando. Contas a Pagar (Fase 4) já nasceria natural depois dela (fornecedor → título a pagar). Contas a Receber, Plano de Contas e Financeiro/DRE (Fases 5, 6, 8) deveriam esperar a resposta às 20 perguntas da Fase 5A, sob risco de construir em cima de uma premissa errada sobre regime de caixa/competência.

Esta é só uma recomendação de ordem — a decisão de qual fase avançar, e se as 20 perguntas serão respondidas antes, é sua.

---

## Checklist desta execução

- Arquivos de código alterados: **0**
- Arquivos criados: **1** (`MEGA_PACK_BASELINE.md`)
- Migrations criadas/alteradas: **0**
- Dependências instaladas: **0**
- Commit / Push / Deploy: **0**

**FASE 0 DO MEGA PACK CONCLUÍDA — SOMENTE INVENTÁRIO. NENHUMA IMPLEMENTAÇÃO REALIZADA.**

Aguardando sua orientação sobre como prosseguir: (a) responder as 20 perguntas da Fase 5A para liberar o Financeiro, (b) avançar primeiro pela Fase 3 (Estoque/Compras/Fornecedores, sem essa dependência), (c) iniciar a Fase 1 (Catálogo de Reuso/GitHub) — que eu trataria só como pesquisa e recomendação, nunca como adoção automática de código de terceiros — ou (d) esclarecer o toolchain NEXORA antes de qualquer coisa, já que o Graphify citado não está de fato instalado neste ambiente.
