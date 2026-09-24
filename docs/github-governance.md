# Governança GitHub — Prime Ges

Este é o padrão obrigatório de trabalho para qualquer pessoa ou agente de IA que altere o Prime Ges.

## 1. Regra central

**Nenhuma mudança de produto deve entrar diretamente em `main`.**

Toda alteração deve ser rastreável por um GitHub Issue e promovida por Pull Request.

Isso vale para:

- correções de bugs;
- melhorias técnicas ou de UX;
- novas funções/features;
- correções de segurança;
- alterações de autenticação;
- alterações de banco de dados/migrations;
- mudanças de infraestrutura ou configuração que afetem o projeto;
- manutenção que possa alterar comportamento, dependências ou deploy.

## 2. Fluxo obrigatório

```
Issue
  ↓
branch de trabalho
  ↓
implementação
  ↓
CI / validação
  ↓
Pull Request
  ↓
review / correções
  ↓
merge em main
  ↓
deploy de produção
  ↓
health check / validação pós-deploy
```

O Issue deve existir antes da implementação, salvo incidente operacional urgente. Mesmo em incidente, o Issue deve ser criado para registrar o trabalho.

## 3. Tipos de Issue

Use o template correspondente:

- **Bug / Correção** — comportamento incorreto, regressão, erro, falha de segurança ou integridade.
- **Melhoria** — aperfeiçoamento de comportamento, desempenho, UX, arquitetura ou manutenção sem introduzir uma função principal nova.
- **Feature / Nova função** — capacidade nova para o produto.

Não use PR como substituto de Issue.

## 4. Branches

Toda implementação deve ocorrer fora de `main`.

Padrões recomendados:

- `fix/...` para correções;
- `feat/...` para novas funções;
- `improve/...` ou `refactor/...` para melhorias/refatorações;
- `chore/...` para manutenção de infraestrutura/documentação.

O nome da branch deve facilitar a identificação do Issue quando possível.

## 5. Pull Requests

Toda PR deve:

1. indicar o objetivo da mudança;
2. listar o Issue relacionado;
3. explicar o que foi alterado;
4. registrar validações executadas;
5. informar impactos de banco, autenticação, segurança e deploy quando aplicável;
6. informar riscos conhecidos e rollback quando aplicável;
7. passar pelo CI antes do merge;
8. ser direcionada para `main` quando a intenção for promoção para produção.

### Referência obrigatória ao Issue

Use uma referência que o GitHub consiga fechar automaticamente quando apropriado:

- `Closes #123`
- `Fixes #123`

Para Issues que devem permanecer abertos:

- `Refs #123`

Uma PR sem referência aos Issues relacionados não está completa.

## 6. Deploy de produção

O deploy de produção é uma consequência da promoção de código para `main`, não uma atividade separada feita manualmente em cima de código não rastreado.

Regra:

```
Issue → Branch → CI → PR → Merge main → Deploy → Health check
```

Não fazer:

- commit direto em `main` para mudanças normais;
- alteração manual de código em produção sem Issue/PR;
- deploy de código que não esteja associado a uma PR;
- migration destrutiva sem estratégia de compatibilidade/rollback;
- juntar mudança de aplicação e alteração destrutiva de banco sem avaliar compatibilidade.

## 7. Banco de dados

Mudanças no Supabase devem ser representadas por migrations versionadas em `supabase/migrations/`.

A migration deve acompanhar a PR que altera o código dependente dela.

Preferir o padrão expand/contract:

1. adicionar estrutura nova de forma compatível;
2. publicar código compatível com o estado antigo e novo;
3. validar;
4. migrar/ativar o novo caminho;
5. remover o legado somente em mudança posterior, quando seguro.

Nunca considerar o dashboard do Supabase como substituto do histórico versionado do repositório.

## 8. CI e validação

Antes do merge, executar o máximo possível das validações aplicáveis:

- `npm run lint`;
- `npm run typecheck`;
- `npm run build`;
- testes automatizados disponíveis;
- validações específicas de Supabase/migrations;
- revisão de segurança quando houver alteração de auth, RLS, RPC, secrets ou dados.

Falha de CI deve ser tratada antes da promoção, salvo exceção explicitamente registrada no PR.

## 9. Segurança

Nunca colocar secrets, tokens, senhas ou arquivos `.env` reais no Git.

Alterações em:

- autenticação;
- autorização/RLS;
- `SECURITY DEFINER`;
- RPCs;
- webhooks;
- pagamentos;
- Storage;
- dados pessoais;

devem ter validação de segurança explícita na PR.

## 10. REUSE FIRST — NÃO REINVENTAR

Antes de criar uma solução relevante:

1. definir o problema;
2. pesquisar bases reutilizáveis, principalmente GitHub/open source;
3. avaliar licença, segurança, qualidade, manutenção, maturidade, arquitetura, dependências e compatibilidade;
4. reutilizar/adaptar uma base adequada quando existir;
5. baixar somente os arquivos/componentes necessários.

Não reinventar uma solução já adequada sem registrar o motivo.

## 11. Agentes de IA

Qualquer agente, independentemente do modelo, deve tratar este documento como regra operacional do projeto.

Antes de implementar:

- procurar o Issue;
- entender o escopo;
- verificar PRs/branches relacionados;
- respeitar as regras arquiteturais;
- não alterar `main` diretamente;
- não fazer deploy fora do fluxo;
- registrar no PR o Issue, as validações e os impactos.

O agente não deve assumir que uma solicitação informal substitui o Issue/PR.

## 12. Escopo e histórico

Documentos antigos podem descrever fases anteriores. Em caso de conflito, considerar como fonte operacional prioritária as migrations existentes, o código atual, este documento e as decisões registradas em Issues/PRs mais recentes.

Qualquer agente que identificar documentação obsoleta deve abrir um Issue e corrigir a documentação por PR.

## 13. Regra de ouro

**Issue explica o que precisa ser feito.  
Branch contém o trabalho.  
PR explica o que será promovido.  
CI valida.  
Merge em `main` promove.  
Deploy publica.  
Health check confirma.**
