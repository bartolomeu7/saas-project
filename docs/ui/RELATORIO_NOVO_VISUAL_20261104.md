# Relatório do novo visual do Prime Ges

Data: 2026-11-04. Plano de origem: `PLANO_IMPLANTACAO_NOVO_VISUAL_20261102.md`. Referências (todas MIT, avisos em `THIRD_PARTY_NOTICES.md`): shadcn/ui blocks, ShadcnStore, Kiranism, satnaing/shadcn-admin. Nenhum arquivo de terceiros foi copiado: os padrões foram reescritos na base do projeto (React 18, Tailwind 3, Zod 3, Radix).

## O que foi entregue (todos em produção, conferidos pelo commit do rodapé)

| Onda | PR | O que mudou |
|---|---|---|
| Login/versão | #47 | Foco do login e versão (commit) visível no rodapé |
| A | #48 | Avisos MIT, script `scripts/verify-production.mjs`, testes que travam a base técnica, capturas de baseline |
| B1 | #49 | Home: Funcionalidades e Segmentos |
| B2 | #50 | Home: Diferenciais, chamada final e rodapé |
| C | #51 | Login e cadastro: moldura em duas colunas, etapas, selos |
| D1 | #52 | Casca da área logada: barra lateral, cabeçalho, fundo |
| D2 | #53 | Dashboard: gráfico de faturamento por dia, vendas recentes, cartões maiores |
| (teste) | #54 | Corrigido teste antigo instável (assinatura adulterada) |
| E piloto | #55, #56 | Clientes (barra de lista, tabela, esqueleto) e correção do celular |
| E lote 2 | #57 | Produtos, Serviços, Vendas |
| E lote 3 | #58 | Estoque, Compras, Fornecedores |
| E lote 4 | #59 | Caixa, Financeiro (situação das contas em português) |
| E lote 5 | #60 | Agenda, Equipe, Fidelidade |
| E lote 6 | #61 | Relatórios, Assinatura, Planos, Histórico |
| F1 | #62 | Casca do painel admin no mesmo visual |

Componentes compartilhados criados: `ListToolbar`, `ListSummary`, `ListAvatar` (`src/components/app/list-toolbar.tsx`) e `ListLoading` (`src/components/app/list-loading.tsx`). Todas as listagens têm esqueleto de carregamento.

## Regras que valeram em todas as ondas
Só apresentação: nenhuma mudança em banco, RLS, middleware, guardas, Server Actions, rotas, billing, variáveis ou domínio. Sem dependência nova (gráficos em CSS). Sem dado inventado. Os testes `tests/unit/ui-waves-guardrails.test.mjs` e `sales-daily-series.test.mjs` travam guardas, consultas, regras de permissão e a ausência de bibliotecas novas.

## Validação
- Cada PR: typecheck, lint (0 erros), testes unitários, `test:seo` 37/37, build e `git diff --check`.
- Pós-deploy: commit do rodapé conferido em produção a cada merge.
- Telas logadas: conferidas em produção com o usuário de teste (empresa "teste1"), em 1366 e 390 px; passada final em 390 px sem rolagem lateral em 10 telas medidas.
- **Não conferido logado (BLOCKED):** o painel `/admin` (o usuário de teste não é administrador e não foi concedido privilégio a ele) e a tabela de Vendas com dados (nenhuma venda foi registrada). Compras e Agenda também só foram vistas vazias.

## Pendências
1. **Configurações:** o item do menu está desligado e `/app/configuracoes` dá 404. Precisa da decisão do dono sobre o conteúdo (dados da empresa, preferências etc.).
2. **Botões Google, GitHub e Discord no login:** aparecem no Clerk de desenvolvimento, mas não em `primeges.com.br`. A causa provável é configuração (credenciais próprias de cada provedor na instância de produção). Investigar sem alterar o Clerk de produção sem autorização. Ver memória `login-social-buttons-pending`.
3. **Admin logado:** conferir `/admin` quando o dono entrar com a conta de administrador (somente leitura).
4. **Dados da empresa nas páginas legais** (razão social, CNPJ, e-mail do encarregado): continuam marcados como pendentes.
5. **Seções de prova social** (depoimentos, logos, números): omitidas de propósito, só entram com conteúdo real.
6. **Tema claro/escuro:** adiado (decisão D3 do plano); o app segue escuro.
7. **Compatibilidade de tabelas do Financeiro no celular:** mantêm rolagem lateral dentro do cartão, por terem formulários de pagamento nas células.
8. **Limpeza de CSS legado** (`globals.css`, `home-v2.css`): fica para uma etapa própria, com medição visual, para não correr risco de regressão.
9. **PRs antigos abertos** (#3, #10, #15, #17, #18, #24): parecem obsoletos (anteriores à migração para o Clerk); revisar com o dono antes de fechar.
10. **Plano de teste grátis do usuário de teste:** a validade mudou de 03/12/2026 para 02/01/2027 entre as conferências (alteração feita fora desta sessão).

## Dados de teste criados na empresa teste1 (produção)
Cliente "Cliente Teste Onda D", produto "Produto Teste Onda E", serviço "Serviço Teste Onda E" e fornecedor "Fornecedor Teste Onda E". São fictícios e podem ser excluídos pelo painel.
