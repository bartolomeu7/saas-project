# AGENTS.md — Prime Ges

## Regra obrigatória

Antes de trabalhar neste repositório, qualquer agente de IA deve ler:
1. este arquivo;
2. `docs/github-governance.md`;
3. `README.md`;
4. a documentação específica do módulo que será alterado.

## GitHub workflow obrigatório

Toda **correção**, **melhoria** ou **nova função** exige:
1. GitHub Issue;
2. branch de trabalho;
3. implementação;
4. CI/validação;
5. Pull Request;
6. referência explícita ao Issue na PR (`Closes #N`, `Fixes #N` ou `Refs #N`);
7. merge em `main`;
8. deploy;
9. health check pós-deploy.

Não fazer mudanças normais diretamente em `main`.

## Deploy

Deploy de produção deve ser consequência de uma PR aprovada/mergeada em `main`.
Não executar deploy manual de código não rastreado por Issue/PR.
Vercel está fora de escopo e proibida neste projeto.

## Banco

Toda alteração de schema do Supabase deve usar migration versionada em `supabase/migrations/` e ser enviada pela mesma PR que altera o código dependente.

## Segurança

Nunca versionar secrets, tokens, senhas ou `.env` reais.
Mudanças de Auth, RLS, RPC, `SECURITY DEFINER`, pagamentos, webhooks ou dados pessoais exigem validação de segurança registrada na PR.

## REUSE FIRST — NÃO REINVENTAR

Antes de implementar uma solução relevante:
- definir o problema;
- pesquisar GitHub/open source;
- avaliar licença, segurança, qualidade, manutenção, maturidade, arquitetura, dependências e compatibilidade;
- reutilizar/adaptar uma base adequada quando existir;
- baixar somente os componentes necessários.

## Documentação

Se uma alteração tornar documentação existente incorreta, abrir Issue e corrigir a documentação por PR.
Em caso de conflito entre documentação antiga e estado atual, verificar código, migrations e decisões registradas em Issues/PRs recentes antes de implementar.