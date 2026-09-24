# AGENTS.md — Prime Ges

## Antes de trabalhar

Leia nesta ordem:

1. `AGENTS.md`;
2. `docs/github-governance.md`;
3. `docs/release-phases-online.md`;
4. `README.md`;
5. documentação específica do módulo alterado.

## Workflow obrigatório

Toda correção, melhoria, feature ou alteração de infraestrutura relevante exige:

1. GitHub Issue;
2. branch;
3. implementação;
4. CI;
5. Preview;
6. Pull Request;
7. referência explícita ao Issue;
8. review;
9. merge em `main`;
10. produção;
11. health check.

Não alterar `main` diretamente para mudanças normais.

## Releases por fase

O Prime Ges será publicado por fases. Não juntar módulos de fases diferentes em uma única promoção sem uma decisão explícita de release.

A próxima fase só começa depois do gate da fase anterior.

## Vercel

A Vercel é o provedor online atual.

Cada branch/PR funcional deve ser validado em Preview antes da promoção para `main`.

As variáveis de ambiente são configuradas fora do GitHub. Nunca commitar valores reais.

## Banco

Toda alteração de schema Supabase usa migration versionada em `supabase/migrations/` e deve acompanhar a PR que altera o código dependente.

Mudanças destrutivas devem usar estratégia expand/contract.

## Segurança

Nunca versionar secrets, tokens, senhas ou `.env` reais.

Mudanças de Auth, RLS, RPC, `SECURITY DEFINER`, pagamentos, webhooks, Storage ou dados pessoais precisam de validação de segurança registrada.

## REUSE FIRST — NÃO REINVENTAR

Antes de criar uma solução relevante:

- definir o problema;
- pesquisar GitHub/open source;
- avaliar licença, segurança, qualidade, manutenção, maturidade, arquitetura, dependências e compatibilidade;
- reutilizar/adaptar quando existir base adequada;
- baixar somente os componentes necessários.
