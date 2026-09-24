# Governança GitHub — Prime Ges

Este é o padrão obrigatório de trabalho para qualquer pessoa ou agente de IA que altere o Prime Ges.

## Regra central

**Nenhuma mudança normal de produto deve entrar diretamente em `main`.**

Toda alteração deve ser rastreável por um GitHub Issue e promovida por Pull Request.

Isso vale para:

- correções de bugs;
- melhorias técnicas ou de UX;
- novas funções/features;
- segurança;
- autenticação/autorização;
- banco de dados/migrations;
- infraestrutura/deploy;
- manutenção que altere comportamento, dependências ou configuração.

## Fluxo obrigatório

```
Issue
  ↓
branch
  ↓
implementação
  ↓
CI / validação
  ↓
Preview
  ↓
Pull Request
  ↓
review / correções
  ↓
merge em main
  ↓
produção
  ↓
health check + logs
```

Preview é obrigatório antes da promoção de qualquer fase para produção.

## PRs e Issues

Toda PR deve:

1. indicar o objetivo;
2. referenciar o Issue com `Closes #N`, `Fixes #N` ou `Refs #N`;
3. descrever o escopo;
4. registrar validações;
5. informar impactos em banco/auth/segurança/deploy;
6. registrar riscos e rollback quando aplicável;
7. passar no CI.

PR draft não é candidata à produção.

## Banco

Mudanças do Supabase devem usar migrations versionadas em `supabase/migrations/`.

Preferir expand/contract:

1. adicionar estrutura compatível;
2. publicar código compatível;
3. validar;
4. ativar/migrar;
5. remover legado em mudança posterior.

Não fazer alteração destrutiva acoplada a um deploy sem plano de compatibilidade/rollback.

## Deploy

O provedor online atual do Prime Ges é a **Vercel**.

O deploy de produção é consequência da promoção de código para `main`. Preview é usado para validar cada fase antes dessa promoção.

```
Issue → Branch → CI → Preview → PR → Merge main → Production → Health check
```

Não fazer:

- commit direto em `main` para mudanças normais;
- deploy manual de código fora do fluxo de Issue/PR;
- secrets no GitHub;
- migration destrutiva sem compatibilidade.

## Segurança

Nunca versionar secrets, tokens, senhas ou arquivos `.env` reais.

Mudanças em Auth, RLS, RPC, `SECURITY DEFINER`, pagamentos, webhooks, Storage ou dados pessoais exigem validação explícita na PR.

## REUSE FIRST — NÃO REINVENTAR

Antes de implementar uma solução relevante:

1. definir o problema;
2. pesquisar GitHub/open source;
3. avaliar licença, segurança, qualidade, manutenção, maturidade, arquitetura, dependências e compatibilidade;
4. reutilizar/adaptar uma base adequada quando existir;
5. baixar somente os componentes necessários.

## Agentes de IA

Todo agente deve ler este documento, `AGENTS.md` e a documentação do módulo antes de alterar o projeto.

O agente deve verificar:

- Issue relacionado;
- branches/PRs existentes;
- migrations e estado atual do banco;
- impacto em Auth/RLS/RPC;
- impacto no deploy;
- validações necessárias.

## Regra de ouro

**Issue explica. Branch contém. CI valida. Preview testa. PR promove. Merge publica. Health check confirma.**
