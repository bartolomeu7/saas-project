# Prime Ges — Plano de Release por Fases

Este documento define como os módulos serão organizados e publicados online sem promover mudanças de várias áreas ao mesmo tempo.

## Fluxo obrigatório

```
Issue
  ↓
branch
  ↓
implementação
  ↓
CI
  ↓
Preview
  ↓
testes/smoke
  ↓
PR
  ↓
merge em main
  ↓
produção
  ↓
health check + logs
```

Nenhum PR draft é candidato à produção.

## Ordem de publicação

| Fase | Escopo | Dependências principais | Gate |
|---|---|---|---|
| 0 | Reconciliação, governança, ambiente e limpeza de PRs | GitHub/Supabase/Vercel | CI + Preview funcional |
| 1 | Fundação: Auth, sessão, empresa, navegação, Configurações básicas, health | Fase 0 | login/registro/sessão/rotas |
| 2 | Núcleo operacional: Produtos, Estoque, Fornecedores, Compras, Recebimento, Vendas, Pagamentos | Fase 1 | integridade transacional |
| 3 | Financeiro: AP/AR, Caixa, lançamentos, categorias/centros de custo, estornos | Fase 2 | reconciliação financeira |
| 4 | Pessoas/relacionamento: Equipe, Agenda, Clientes, Fidelidade | Fase 1; usa dados das fases 2/3 quando aplicável | RBAC + auditoria |
| 5 | Gestão: Relatórios, Dashboard, Documentos/Storage, Admin, Billing | Fases 1–4 | permissões + performance + idempotência |
| 6 | Segurança final e go-live | Todas as anteriores | zero blocker crítico + smoke de produção |

## Fase 0 — Reconciliação e preparação

Antes de publicar qualquer módulo:

- reconciliar histórico de migrations e tipos;
- separar mudanças antigas, sobrepostas ou fora de escopo;
- alinhar os documentos de governança ao provedor online vigente;
- garantir Preview com variáveis Supabase funcionais;
- definir/validar `/api/health`;
- congelar novas features durante a janela de release;
- confirmar que não existem secrets no Git;
- manter banco com migrations backward-compatible.

### Situação conhecida

- PR #18 contém as correções de reconciliação/integridade, mas ainda reúne mudanças demais para uma promoção direta.
- PR #21 estabelece a governança de Issues/PRs, porém ainda contém referência histórica à proibição de Vercel.
- PR #19 é específico da antiga preparação para Hostinger e não deve ser misturado à linha de release atual.
- PR #17 é planejamento de segurança final, não release funcional.

## Fase 1 — Fundação

Publicar primeiro somente o que permite ao sistema entrar, identificar a empresa e navegar com segurança:

- autenticação/sessão;
- membership/company context;
- layout e navegação;
- Configurações básicas;
- endpoint de health;
- observabilidade mínima.

**Não incluir:** módulos financeiros/operacionais ainda.

### Gate
- `/`, `/login`, `/register`;
- sessão persistente;
- isolamento por empresa;
- Configurações básicas;
- Preview sem erro de middleware/Supabase;
- CI verde.

## Fase 2 — Núcleo operacional

Separar o fluxo operacional em uma única unidade coerente:

1. Produtos;
2. Estoque;
3. Fornecedores;
4. Compras/Pedidos;
5. Recebimento;
6. Vendas;
7. Pagamentos.

### Gate
- ajustes de estoque somente por operação confiável;
- venda concluída/cancelada com locks determinísticos;
- recebimento/cancelamento com locks determinísticos;
- pagamento sem overpayment;
- auditoria;
- isolamento por company_id;
- testes de concorrência.

### Blockers conhecidos antes da promoção
- venda paga + cancelamento precisa tratar estorno/refund, financeiro, caixa e pagamento;
- recebimento parcialmente pago + cancelamento precisa preservar AP/financeiro;
- pagamento em dinheiro precisa exigir caixa aberto ou falhar atomicamente.

## Fase 3 — Financeiro

Publicar depois que o núcleo operacional estiver estável:

- contas a pagar/receber;
- Caixa;
- lançamentos financeiros;
- categorias;
- centros de custo;
- estornos/cancelamentos;
- reconciliação com pagamentos e recebimentos.

### Gate
- referências de categoria/centro de custo validadas na mesma empresa;
- lançamentos auditáveis;
- reversões consistentes;
- concorrência testada;
- nenhuma alteração cruza empresas.

## Fase 4 — Pessoas e relacionamento

- Equipe/Colaboradores;
- Agenda;
- Clientes;
- Fidelidade.

### Gate
- RBAC granular;
- owner/admin protegidos;
- auditoria das ações sensíveis;
- concorrência nas operações que alteram estado;
- contexto de empresa explícito.

## Fase 5 — Gestão e administração

- Relatórios;
- Dashboard/Inteligência Operacional;
- Documentos/Storage;
- Administração/Configurações;
- Billing/assinaturas.

### Gate
- paginação e filtros básicos;
- Storage privado e URLs controladas;
- permissões administrativas revisadas;
- operações de billing idempotentes;
- reconciliação de webhook/pagamento;
- métricas/logs mínimos.

## Fase 6 — Segurança final e go-live

Checklist final:

- revisão RPC por RPC;
- SECURITY DEFINER;
- RLS e políticas;
- Security Advisor;
- leaked password protection;
- MFA/sessões;
- headers/browser security;
- webhooks/API;
- dependências e supply chain;
- backup/restore;
- testes de regressão;
- testes de concorrência;
- smoke test em produção;
- rollback documentado.

### Gate final

Só promover quando:

- CI verde;
- Preview validado;
- nenhum blocker crítico conhecido;
- migrations reproduzíveis;
- health check respondendo;
- logs sem erro crítico;
- rollback definido.

## Regra de promoção

Uma fase só entra em `main` depois de passar seu próprio gate. A fase seguinte começa em uma branch nova a partir do `main` já aprovado.

Isso evita um PR gigante contendo módulos heterogêneos e torna possível descobrir exatamente qual conjunto de mudanças entrou na produção.

## Regra para agentes

Antes de qualquer implementação:

1. verificar o Issue e o escopo da fase;
2. aplicar **REUSE FIRST — NÃO REINVENTAR**;
3. revisar dependências e compatibilidade;
4. trabalhar em branch;
5. executar CI;
6. validar Preview;
7. abrir/atualizar PR com referência ao Issue;
8. somente então promover.

## Próximo passo operacional

A primeira janela de trabalho é a **Fase 0**. Depois de concluída, a publicação deve começar pela **Fase 1 — Fundação**, seguindo para o núcleo operacional somente após o gate da Fase 1.
