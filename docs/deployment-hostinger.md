# Prime Ges — Deploy seguro na Hostinger

## Objetivo

Publicar o Prime Ges online a partir do GitHub, sem usar Vercel e sem transformar um deploy de código em uma alteração destrutiva do banco.

A Hostinger suporta aplicações Node.js/Next.js com integração GitHub e redeploy automático a partir do branch configurado.

## Cinco fases de subida

### Fase 1 — Fundação do deploy
- Fixar Node.js 20.
- Criar `GET /api/health` sem dependência do banco.
- Definir comandos de build/start.
- Documentar variáveis de ambiente.
- CI continua sendo a primeira barreira antes da publicação.

### Fase 2 — Staging e validação
- Conectar o repositório à Hostinger.
- Configurar ambiente e domínio temporário/staging.
- Publicar a versão candidata.
- Validar login, sessão, páginas públicas e `/api/health`.
- Conferir logs e consumo de CPU/RAM.

### Fase 3 — Banco e migrações seguras
- Aplicar migrations do Supabase separadamente do build.
- Somente migrations backward-compatible podem acompanhar o deploy.
- Primeiro adicionar estrutura nova; depois publicar código compatível; só depois remover estrutura antiga.
- Não executar migrations destrutivas no comando de build da Hostinger.
- Validar funções/RLS e smoke tests após cada mudança.

### Fase 4 — Produção
- Selecionar o branch de produção.
- Configurar o domínio principal e SSL.
- Publicar somente um commit aprovado pelo CI.
- Executar smoke test pós-deploy.
- Confirmar `/api/health`, autenticação e módulos críticos.

### Fase 5 — Atualização contínua e rollback
- Push/merge aprovado no branch de produção gera novo deploy.
- Cada deploy deve ser identificável por commit/versão.
- Falhas devem interromper a promoção da versão.
- O rollback deve voltar para a última implantação conhecida como saudável.
- Mudanças de banco continuam seguindo o ciclo de migrations compatíveis.

## Configuração esperada na Hostinger

- Fonte: GitHub
- Repositório: `bartolomeu7/saas-project`
- Branch inicial de produção: `main`
- Node.js: 20.x
- Instalação: `npm ci`
- Build: `npm run build`
- Start: `npm run start`
- Diretório do projeto: raiz do repositório

## Variáveis de ambiente

Configurar na Hostinger os valores reais de produção para:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_APP_ENV=production`
- `APP_VERSION` (opcional; recomendado para identificar o release)

Nenhum segredo deve ser commitado no GitHub.

## Health check

Endpoint:

`GET /api/health`

Resposta esperada:

`status: "ok"`

O endpoint não acessa o Supabase de propósito. Isso permite distinguir falha do processo Node/Next de falha de banco.

## Regra de segurança do deploy

Não usar:

`build -> migration destrutiva -> start`

Usar:

`migration compatível -> CI -> build -> deploy -> smoke test -> promoção`

Quando uma alteração exigir remoção de coluna, tabela, função ou comportamento legado, a remoção fica para uma migration posterior, depois que nenhuma versão ativa depender mais daquela estrutura.
