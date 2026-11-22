# Plano: sair do Supabase e rodar no Docker Desktop local

Data do levantamento: 15/11/2026. Somente leitura: nada foi alterado no site, no Supabase, no Docker ou no Vercel.

## 1. Resposta curta (viabilidade)

**É viável**, e o projeto é pequeno para isso. Mas há dois pontos que decidem se vale a pena:

1. **Disponibilidade**: hoje o Supabase e o Vercel mantêm o site no ar 24h. Em casa, o site passa a depender de energia, internet, Windows Update e do Docker Desktop abrir sozinho. Para uso real de clientes pagantes, é o maior risco.
2. **Segurança**: o banco de clientes passa a ser responsabilidade sua (backup, atualização, firewall).

Tecnicamente não há bloqueio: o banco tem **22 MB**, **0 arquivos** no storage, **0 tabelas em tempo real**, **0 tarefas agendadas** e o login é do **Clerk** (o Supabase Auth não é usado; há 2 usuários lá, sem uso).

## 2. O que o site usa do Supabase (levantamento)

| Item | Situação em Production | Impacto na migração |
|---|---|---|
| Postgres | 75 tabelas, 182 funções, 113 políticas RLS, 22 MB | Migra com `pg_dump`/`pg_restore` + as 90 migrations |
| Extensões | pgcrypto, uuid-ossp, pg_trgm, unaccent (+ supabase_vault, pg_stat_statements, postgres_fdw sem uso nas migrations) | Imagem `postgres:17` oficial já traz as 4 que usamos |
| API de dados | supabase-js → PostgREST (65 arquivos usam o cliente) | Precisa rodar **PostgREST** (mesma API, sem mudar código) |
| Login | **Clerk** (token do Clerk vai ao PostgREST; RLS lê o `sub` via `current_profile_user_id()`) | PostgREST precisa validar o JWT do Clerk (ver risco R3) |
| Storage | 1 bucket (`customer-documents`), 0 objetos; 2 pontos no código | Subir o container **Supabase Storage** ou trocar por MinIO/S3 (pequeno ajuste de código) |
| Realtime / Edge Functions / cron | Não usados | Nada a fazer |
| Variáveis | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Só trocar a URL e as chaves: o código não muda |
| Papéis do banco | `anon`, `authenticated`, `service_role` (177 grants nas migrations) | Criar os 3 papéis no Postgres local antes de restaurar |

## 3. O que você já tem no Docker Desktop

- Projeto **stoat** (chat tipo Discord): 16 containers, **Caddy nas portas 80 e 443**, LiveKit nas 7881 e 50000-50100/udp.
- Docker 29.9.3, 16 CPUs e 15,5 GB de RAM liberados ao Docker (a máquina tem 31,7 GB). Imagens: 3,6 GB.
- Disco do Docker (`docker_data.vhdx`) fica no **C:, que tem só 22 GB livres**. O E: tem 317 GB livres.
- Rede do stoat: `stoat_default`. IP da máquina na rede: 192.168.1.49.

Dá para colocar outro projeto, **como um segundo projeto Compose separado** (não misturar com o stoat). O conflito real é a porta 443: o Caddy do stoat já a ocupa.

## 4. Arquitetura proposta (dois degraus)

**Degrau 1 (recomendado primeiro): só o banco local, o site continua no Vercel**
Vercel → Cloudflare Tunnel → Docker local: `Postgres 17` + `PostgREST` + `Storage` (+ gateway pequeno).
Menor mudança, reversível a qualquer momento voltando a URL para o Supabase.

**Degrau 2 (se o degrau 1 for estável): o site também em Docker**
Mais um container (`next start`, saída `standalone`) atrás do mesmo túnel. Sai do Vercel; perde deploy automático, previews e CDN, que passam a ser feitos por você.

**Entrada de internet:** usar **Cloudflare Tunnel** (container `cloudflared`). Não abre porta no roteador, não disputa 80/443 com o stoat e funciona com IP dinâmico/CGNAT. Alternativa: adicionar rotas ao Caddy do stoat (acopla os dois projetos: não recomendo).

Containers do novo projeto (`primeges`, rede própria `primeges_net`, nada exposto ao host exceto o túnel):

| Container | Imagem | Função | RAM aprox. |
|---|---|---|---|
| db | postgres:17 | banco | 512 MB-1 GB |
| rest | postgrest/postgrest | API usada pelo supabase-js | 100 MB |
| gateway | caddy ou kong | roteia `/rest/v1`, `/storage/v1`; aplica CORS e chave anon | 50 MB |
| storage | supabase/storage-api (+ imgproxy opcional) | bucket de documentos | 200 MB |
| backup | script + `pg_dump` | backup diário criptografado para outro disco/nuvem | mínimo |
| tunnel | cloudflare/cloudflared | entrada segura | 50 MB |
| (degrau 2) web | imagem do Next.js | o site | 300-500 MB |

Total: cerca de 1,5-2,5 GB de RAM. Cabe com folga ao lado do stoat.

## 5. Riscos e como tratar

- **R1 Disponibilidade**: nobreak, "reiniciar sempre" nos containers, Docker Desktop abrindo com o Windows, desativar reinício automático do Windows Update, monitor externo (UptimeRobot) avisando por e-mail/WhatsApp. Sem isso, o site cai junto com a máquina.
- **R2 Perda de dados**: hoje o Supabase faz backup. Local: backup diário + cópia **fora da máquina** + teste de restauração mensal. Mover o `docker_data.vhdx` para o E: (disco do C: está apertado).
- **R3 JWT do Clerk no PostgREST**: no Supabase a verificação é nativa (Third-Party Auth). No PostgREST local é preciso configurar o JWKS do Clerk; chaves rotacionam, então o gateway/PostgREST deve buscar o JWKS por URL (ou usar um verificador na frente). **Será a primeira coisa testada no piloto.**
- **R4 Latência**: Vercel (EUA/Brasil) → sua casa. Cada tela faz várias consultas; casa com upload baixo ou Wi-Fi deixa lento. Medir antes de decidir. No degrau 2 isso some (site e banco juntos).
- **R5 Segurança**: banco nunca exposto diretamente (só o túnel, só `/rest` e `/storage`); firewall do Windows; senhas e `service_role` em arquivo `.env` fora do Git; atualizações de imagem mensais.
- **R6 Contrato e suporte**: Clerk, EvoPay e webhooks continuam externos: só trocar as URLs dos webhooks se o site mudar de endereço (no degrau 1 não mudam).
- **R7 Integridade da migração**: restaurar com o site em manutenção (poucos minutos, banco de 22 MB) e conferir contagem de linhas de todas as tabelas antes de apontar o tráfego.

## 6. Etapas (nenhuma é feita sem o seu "Autorizo")

0. **Decisão** do dono: degrau 1 ou 2, onde ficam os backups, domínio do túnel (ex.: `db.primeges.com.br`).
1. **Preparação da máquina** (só Docker local): mover o disco do Docker para o E:, criar a pasta e o projeto Compose `primeges`, subir db + rest + gateway **sem tráfego**. Não mexe no stoat.
2. **Réplica de teste**: restaurar uma cópia do TEST (nunca começar pela Production) e rodar as baterias SQL (`tests/sql/*.sql`) e as suítes `npm run test:unit` apontando para o banco local.
3. **Piloto de login**: um Preview do Vercel apontando para o túnel; testar login Clerk, RLS (usuário A não vê empresa B), Chat AI, cobrança, documentos.
4. **Medir**: latência, consumo de RAM/CPU, comportamento ao reiniciar a máquina e ao cair a internet.
5. **Backup e monitor** funcionando e **restauração testada**.
6. **Ensaio de corte** com a cópia da Production (somente leitura): comparar contagens e checksums.
7. **Corte** (janela combinada, ~15 min): modo manutenção → dump final → restaurar → trocar 3 variáveis no Vercel → testes de fumaça → liberar. **Plano de volta**: reapontar as variáveis para o Supabase (que fica intocado e pausado por 30 dias).
8. Só depois de 30 dias estável: desligar o Supabase.

## 7. O que preciso de você (antes da etapa 1)

1. Aprovar o **degrau 1** como começo.
2. Conta **Cloudflare** com o domínio (ou autorizar usar outro caminho de entrada).
3. Disco para backup fora do C: (E: serve para o local; para a cópia externa, uma nuvem ou HD externo).
4. Confirmar que posso **mover o disco do Docker** para o E: (pede reiniciar o Docker Desktop e derruba o stoat por alguns minutos).

## 8. Fora de escopo deste levantamento

Custo comparativo (o plano atual do Supabase não foi consultado), estudo de energia/nobreak e a migração do Clerk (continua como está).

## 9. Resultado das fases 1 e 2 (15/11/2026, banco local em `E:\primeges-local`)

- **Fase 1:** projeto Compose `primeges` (Postgres 17.6 + PostgREST v12.2.12), rede própria, portas só em `127.0.0.1` (5433 banco, 3001 API). O stoat não foi tocado (16 containers seguem no ar).
- **Fase 2:** as **89 migrations** do repositório aplicam **sem erro**, em ordem, num banco vazio. O catálogo bate com a Production: 75 tabelas e **113 políticas** idênticas; as 40 políticas `*_require_access_*` a mais vêm da migration `20261014000300_data_layer_access_gate` (porta de acesso por assinatura), que a Production ainda não tem (igual ao TESTE).
- **Isolamento entre empresas:** `tenant_isolation.sql` — 53 tabelas testadas, **nenhum vazamento**.
- **Baterias SQL (31 arquivos) no banco local:** todas passam, exceto 2 por motivos que não são do banco local:
  - `legal_consent.sql`: bateria desatualizada (fixa a versão `rc.2` dos documentos; a versão vigente agora é `rc.3`). Precisa ser atualizada no repositório.
  - `admin_platform.sql`: 298 de 299; o caso "não altera trial de plano já utilizado" precisa de uma assinatura pré-existente no TESTE.
- **Diferenças do Supabase que precisaram de adaptação** (ficam em `initdb/` do projeto local): esquemas `auth` e `storage` mínimos (a migration cita `auth.users`, `auth.uid()`, `storage.objects`); permissões padrão do Supabase para `anon/authenticated/service_role`; extensão `postgres_fdw`; função `rls_auto_enable()`.
- **Ainda não testado:** login do Clerk no PostgREST (risco R3), armazenamento de arquivos, velocidade, backup. Nenhum dado real foi copiado.

## 10. Resultado da fase 3: login do Clerk no PostgREST local (15/11/2026)

- O token de sessão real do Clerk (RS256, `iss` = `https://clerk.primeges.com.br`, claim `role: authenticated`, sem `aud`) tem a **assinatura verificada com a mesma chave pública** que o PostgREST local carrega (`clerk-jwks.json`, baixada de `https://clerk.primeges.com.br/.well-known/jwks.json`). Nenhum segredo é compartilhado.
- Prova de ponta a ponta com uma chave de teste descartável (mesmo formato do Clerk), contra o banco local com as 89 migrations:

| Caso | Resultado |
|---|---|
| sem token | 401 (permissão negada) |
| assinatura de outra chave | 401 `JWSInvalidSignature` |
| token expirado | 401 `JWT expired` |
| token válido (`authenticated`) lê planos | 200 |
| token válido **sem** claim `role` | 401 (vira `anon`) |
| `current_profile_user_id()` do admin e do usuário comum | devolve o UUID de cada um |
| usuário desconhecido | `null` |
| usuário comum lê `profiles` | só o próprio (RLS) |
| usuário comum chama função de admin | 400 `not authorized` |
| admin chama `get_platform_dashboard` | 200 |

- **Limite conhecido:** o PostgREST lê a chave do arquivo, não da URL. Se o Clerk trocar a chave (raro, e avisado), é preciso rebaixar o arquivo e reiniciar o `rest` (`docker compose restart rest`). Na fase 5 entra uma rotina que confere a chave a cada hora e avisa.
- **Não testado ainda:** chamada vinda do Vercel pela internet (o navegador também bloqueia chamadas da página `https://primeges.com.br` para `127.0.0.1`, o que é esperado), armazenamento de arquivos, velocidade e backup.

## 11. Resultado da fase 4: medições (15/11/2026)

**Consumo (banco quase vazio, só a estrutura):** banco 71-141 MB de RAM, PostgREST 14-99 MB, CPU ~0%. O projeto `primeges` cabe com folga ao lado do stoat (que usa a maior parte dos 15,5 GB liberados ao Docker).

**Velocidade do banco local** (PostgREST com token válido, 200 chamadas em fila e 1000 com 20 simultâneas, 0 erros em todas):

| Operação | 1 por vez (p50 / p95) | 20 simultâneas |
|---|---|---|
| `current_profile_user_id()` (1 por tela) | 15,1 / 16,6 ms | 1976 req/s |
| `select profiles` com RLS | 15,4 / 16,4 ms | 3364 req/s |
| `get_platform_dashboard` (consulta mais pesada) | 15,1 / 16,7 ms | 2041 req/s |
| `search_products` (busca aproximada) | 15,4 / 16,6 ms | 2561 req/s |

Os ~15 ms "um por vez" são o custo fixo da rede interna Windows→Docker, não do banco. **Ressalva:** as tabelas estão praticamente vazias; mede o encanamento (token, RLS, PostgREST), não consultas sobre muitos dados. Com 22 MB de dados reais não deve mudar, mas será conferido na fase 6.

**Comparação:** de casa até o Supabase leva ~38 ms só para conectar (+ ~50 ms de TLS) e ~120 ms por requisição; o banco local responde em ~15 ms. Ou seja, quando o site também rodar na mesma máquina (degrau 2), as consultas ficam **cerca de 8x mais rápidas** que hoje.

**Internet de casa (Cloudflare):** download ~282 Mbps, **upload ~30 Mbps**, ping 22 ms, IP público 143.137.156.107 (provável dinâmico). Upload de 30 Mbps atende bem este uso (páginas e respostas pequenas). Cloudflare Tunnel contorna IP dinâmico e portas fechadas.

**Queda forçada (`kill -9` no banco):** dado gravado antes da queda **sobreviveu**; o banco se recuperou sozinho e voltou saudável em ~6 s; a API voltou a responder (200). Reinício normal dos dois containers: 6 s. Ambos com `restart: unless-stopped`.

**Pontos de atenção encontrados na máquina:**
1. **Docker Desktop NÃO inicia com o Windows** (`AutoStart: false`). Depois de um reinício ou queda de energia o site ficaria fora do ar até alguém abrir o Docker. **Precisa ser ligado** antes de qualquer cliente depender dele.
2. Plano de energia "Equilibrado" com suspensão em 0 (nunca suspende) na tomada: bom. Falta conferir no notebook/desktop se há bateria/nobreak.
3. **Os containers do stoat foram parados durante este levantamento** (saída normal, não causada pelo projeto `primeges`). Mostra que, na mesma máquina, qualquer ação manual derruba tudo que está em containers. Reforça separar o projeto e ter monitor externo.
4. Falta ainda medir a ida pela internet (Vercel → túnel → casa) e a latência de usuários reais; isso depende do túnel Cloudflare (conta/domínio) e só faz sentido na fase 5.

**Veredito parcial:** tecnicamente aprovado (velocidade, consumo e recuperação de queda). O que decide a migração não é desempenho, é **disponibilidade da máquina** (itens 1 a 3) e o **backup fora dela**.

## 12. Resultado da fase 5: backup e monitor (15/11/2026)

Tudo em `E:\primeges-local` (scripts em `scripts\`, guia de operação em `LEIA-ME.md`; as senhas ficam só no `.env` local, fora do Git).

- **Backup diário 03:00** (tarefa `PrimeGes-Backup`): `pg_dump` + papéis, **restauração de teste numa base temporária** comparando tabelas/políticas/funções/linhas (75/153/183/9/11 idênticas ao original), segundo exemplar em `D:\PrimegesBackup` (**disco físico diferente**; E: é o disco 1, D: o disco 2, o banco vive no C:) com SHA-256 conferido, retenção de 14 diários + 8 semanais. Primeiro backup de 1,0 MB gerado e restaurado com sucesso.
- **Monitor a cada 5 min** (`PrimeGes-Saude`): religa sozinho os containers do `primeges` (e só eles), confere a API, **atualiza a chave do Clerk se ela mudar** e reinicia o PostgREST, vigia espaço em disco (<5 GB) e idade do backup (>36 h), grava `status.json`, `ALERTA_saude.txt` e dá aviso na tela do Windows. Teste: banco e API parados à força voltaram em **10 s**, com o stoat intocado (16 containers seguiram no ar).
- **Docker junto com o Windows**: tarefa `PrimeGes-Docker-ao-entrar` abre o Docker Desktop 30 s depois de entrar na conta. Os containers têm `restart: unless-stopped`.
- **Ainda em aberto (precisa de você):**
  1. **Entrada automática no Windows** após queda de energia: o Docker Desktop só abre depois que alguém entra na conta. Para o site voltar sozinho é preciso ligar o login automático (troca de segurança: quem ligar o PC cai direto na sua conta) e/ou ter um nobreak.
  2. **Cópia de backup fora do computador** (HD externo ou nuvem com criptografia): hoje os dois exemplares estão na mesma máquina; um incêndio, roubo ou falha elétrica grave perde ambos.
  3. **Aviso externo** (UptimeRobot ou similar) para saber quando o PC inteiro ou a internet cair: o monitor local não consegue avisar se a máquina estiver desligada. Exige criar uma conta (feito por você).

### 12.1 Cópia secundária em `D:\PRIME GES BKP` (15/11/2026, pedido do dono)
- Destino escolhido pelo dono: pasta `PRIME GES BKP` no disco D: (**mesma máquina, outro disco físico**: protege contra falha do C:/E:, **não** contra roubo, incêndio ou queda elétrica grave).
- Os arquivos em D: ficam **criptografados** (AES-256 por arquivo; a chave do arquivo é cifrada com RSA-4096). O PC guarda só a chave **pública**; a **privada** foi gerada num arquivo no Desktop para o dono guardar fora do PC. Sem ela a cópia em D: não abre.
- Provado: o arquivo aberto com a chave tem o mesmo SHA-256 do original e o `pg_restore --list` o lê; uma chave errada é recusada; a pasta não contém texto legível do banco. A cópia antiga sem criptografia (`D:\PrimegesBackup`, só 1 backup de teste) **continua lá**: o sistema bloqueou a remoção automática, então o dono deve apagá-la.
- **Continua em aberto:** uma cópia realmente fora do PC (HD externo ou nuvem). Como os arquivos já saem criptografados, basta copiar a pasta para lá.

## 13. Fases 6 e 7: ensaio e corte — preparação e o que falta (15–16/11/2026)

### Situação real dos dados da Production (somente contagem, lida em 15/11)
52 tabelas com dados e 18 vazias, **1.893 linhas no total** (7 perfis, 6 empresas, 12 clientes, 25 agendamentos, 16 vendas, 780 mensagens do chat...). O Supabase Auth tem 2 usuários sem uso (o login é do Clerk) e o storage tem 0 arquivos. Ou seja: o dump de Production é pequeno e o corte leva minutos.

### Fase 6 (ensaio) — script pronto, falta a senha do banco
`E:\primeges-local\scripts\ensaio-producao.ps1`: baixa a Production **em modo somente leitura**, restaura num banco local separado (`ensaio`, o banco de trabalho não é tocado) e prova a igualdade: contagem e **impressão digital (md5) das linhas de cada tabela** + impressão digital da estrutura (`tests/sql/catalog-fingerprint.sql`). A senha é digitada pelo dono no próprio terminal (nunca passa por mim nem é gravada).

### Peças do site em Docker (degrau 2) — prontas para teste
- `gateway` (Caddy) imita o caminho `/rest/v1` do Supabase para o `supabase-js`; **só a rede interna enxerga**. O código do site não muda: o `supabase-js` só é usado no servidor (nenhum componente de navegador toca o banco), então **o banco nunca precisa ficar público**.
- O site precisa de uma chave de administrador (`SUPABASE_SERVICE_ROLE_KEY`, usada em 2 arquivos). No banco local ela é gerada por `scripts\build-jwks.mjs` (token HS256 assinado com uma chave que só existe nesta máquina, em `keys\`), gravada em `site.env`.
- Imagem `primeges-web:local` (Dockerfile em `E:\primeges-local\site\`, `next start`, usuário sem privilégio, segredos fora da imagem).

### O que BLOQUEIA o corte (fase 7) e só o dono resolve
1. **DNS está no `dns-parking.com` (Hostinger), não na Cloudflare.** Para usar o Túnel da Cloudflare (sem abrir portas) é preciso criar conta grátis na Cloudflare e **trocar os servidores de nome do domínio** para ela, recriando todos os registros (site, `clerk.`/`accounts.` do Clerk, e-mail/Resend, SPF/DKIM). Quem faz é o dono; é uma mudança sensível que, se errada, derruba site e e-mail.
2. **Segredos do site** (Clerk secret, EvoPay, Resend, `TWO_FACTOR_ENCRYPTION_KEY`, etc.) estão só no Vercel. O dono precisa copiá-los para `E:\primeges-local\site.env` (arquivo local). Eu não os leio nem os envio a lugar nenhum.
3. **Porta 443 ocupada:** o Caddy do stoat usa 80/443; o túnel evita isso (ele sai da máquina, não precisa de porta aberta).
4. **IP do cliente (anti-fraude do teste grátis):** `src/lib/security/client-ip.ts` só confia em cabeçalho se `VERCEL=1` ou `TRUSTED_PROXY_HOPS` estiver definido. Atrás do túnel será preciso definir `TRUSTED_PROXY_HOPS` (provavelmente 1) e **testar** com um acesso real; sem isso o antifraude passa a não identificar o IP.
5. **Webhooks do EvoPay:** a URL cadastrada lá aponta para o endereço atual do site; como o domínio é o mesmo, continua valendo, mas o pagamento real precisa ser **retestado** após o corte.

### Roteiro do corte (só com "Autorizo" explícito do dono, em janela combinada de ~15 min)
1. Antes: ensaio (fase 6) OK; backup recente; túnel e DNS na Cloudflare funcionando para um subdomínio de teste; segredos no `site.env`; `TRUSTED_PROXY_HOPS` definido.
2. Modo manutenção no site atual (Vercel).
3. Dump final da Production (somente leitura) → restaurar no banco local de trabalho; conferir contagens/md5.
4. Subir `web` (`docker compose --profile site up -d web`) e apontar o túnel `primeges.com.br` para ele.
5. Testes de fumaça: entrar, agenda, chat, financeiro, pagamento real de R$ 1, webhook, e-mail.
6. Sair do modo manutenção.
7. **Volta atrás (se algo falhar):** reapontar o DNS/túnel para o Vercel (o Supabase e o Vercel ficam intactos por 30 dias; qualquer dado criado no local desde o corte precisa ser exportado antes de voltar).

### 13.1 Andamento (17–18/11/2026)
- **DNS na Cloudflare: concluído.** Domínio ativo, 7 registros todos "Somente DNS" (sem proxy), site/login/Clerk seguem normais (Vercel).
- **Ensaio da Production: concluído e fiel.** Dados (75 tabelas, 1.893 linhas) idênticos por impressão digital; estrutura idêntica (diferenças explicadas e sem efeito: parênteses de uma regra do RH e privilégios padrão do papel `supabase_admin`); permissões nos objetos existentes idênticas (341). O script `ensaio-producao.ps1` (v2) corrige o encaminhamento de aspas do PowerShell.
- **Segredos:** o Vercel só entregou as variáveis não sensíveis. `CLERK_SECRET_KEY`, `EVOPAY_API_KEY`, `EVOPAY_API_BASE_URL` e `ANTIFRAUD_HASH_SECRET` são **Sensitive** (não revelados). O antifraude ganhou segredo novo (efeito: contadores por conexão recomeçam). Os 3 restantes precisam ser preenchidos pelo dono em `site.env`. `TWO_FACTOR_ENCRYPTION_KEY` não existe no Vercel de Production (pendência antiga, inalterada).
- **Túnel da Cloudflare:** criado (`primeges-local`), credenciais em `E:\primeges-local\cloudflared\` (só a conta do dono). **Sem rota de DNS e sem container rodando**: nenhum tráfego passa por ele. Perfil `tunnel` do Compose só sobe no corte.
- **Falta para o corte:** preencher os 3 segredos; subir o `web` e testar páginas públicas; combinar a janela; "Autorizo" explícito do dono.

### 13.2 Site em Docker (19–20/11/2026)
- Imagem `primeges-web:local` (Next.js `next start`) sobe **healthy**, apontando para o gateway/PostgREST locais. `/api/health` = `ok` (`database: ok`), `/`, `/login`, `/termos-de-uso` e `/politica-de-privacidade` = 200; `/app` e `/admin` redirecionam (307) como esperado sem sessão.
- **Aprendizado:** as variáveis `NEXT_PUBLIC_*` são gravadas no código na montagem da imagem. A chave anônima local precisa ir como `--build-arg` (um valor provisório fazia o `/api/health` dar 503: "JWSError… Expected 3 parts"). Trocar a chave local exige remontar a imagem.
- **Clerk:** a `CLERK_SECRET_KEY` de produção foi validada (API do Clerk: 200 com a chave, 401 com uma falsa). Login real só pode ser testado no próprio domínio `primeges.com.br` (instância de produção do Clerk).
- **EvoPay:** base correta = `https://api.evopay.cash/v1` (a doc mostra a chave no cabeçalho `API-Key`, igual ao cliente do site). Com a chave colada em `site.env`, o EvoPay responde **401 Unauthorized** em `/v1/pix` (igual a uma chave falsa). Hipóteses: token diferente do que o Vercel usa (rotação) ou restrição por IP no token. O IP de saída desta casa **muda** (143.137.156.107 → 186.225.179.80). **Bloqueia o corte** até esclarecer: se houver lista de IPs permitidos, o pagamento Pix quebraria depois do corte.

### 13.3 EvoPay: adiado por decisão do dono (19/11)
A EvoPay devolve 401 para a chave do `site.env` (hipóteses: token rotacionado ou lista de IPs permitidos). O dono mandou pular esta parte por agora.
Efeito no corte: os pagamentos Pix NÃO estarão validados no servidor local. Antes de mudar o domínio, ou se resolve isto, ou se aceita conscientemente que o Pix fica sem teste (rollback = voltar o DNS para a Vercel).

### 13.4 Corte feito (20/11) e ajustes pós-corte
Corte às ~11:22 UTC: banco `corte` (75 tabelas idênticas) virou `postgres`; antigo guardado como `postgres_pre_corte`; túnel + DNS apontando para o PC. Login Clerk e agenda validados pelo dono.
Teste de 10 rodadas (19 rotas, conta teste): achou 503/500 esporádicos. Causa: o PostgREST fecha conexão ociosa em ~30s e o Caddy reaproveitava conexão morta ("broken pipe"). Correções: Caddy `keepalive 10s` e `PGRST_DB_POOL=30`. Depois: 190/190 ok, inclusive após pausas de 40s (p50 ~0,9s, p95 ~1,5s com 19 requisições simultâneas).
Rollback: remover MAINTENANCE_MODE na Vercel + Redeploy, depois repontar o DNS para a Vercel.

### 13.5 Falha de escrita pós-corte (achada e corrigida em 20/11)
Após o corte, todas as GRAVAÇÕES falharam (~27 min) enquanto as leituras funcionavam: o papel `authenticated` não tinha USAGE no schema `extensions`, usado por funções disparadas nos INSERTs (erro "permission denied for schema extensions"). A comparação de estrutura (catalog-fingerprint) só cobre o schema `public`, por isso não pegou. Correção: `grant usage on schema extensions to anon, authenticated, service_role` (aplicado e gravado em `initdb/02-compat.sql`). Lição: o ensaio deveria ter incluído um teste de ESCRITA pelo site, não só leitura.
Auditoria posterior: as funções do app só citam os schemas `auth` e `extensions`; ambos liberados. Escrita (cliente, produto) e chat validados pela conta teste1; registros de teste removidos.
