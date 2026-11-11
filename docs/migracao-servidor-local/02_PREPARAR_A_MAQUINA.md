# Preparar a máquina nova (tutorial rápido)

> Objetivo de hoje: **deixar a máquina pronta e segura**, sem ligar o site nela. O site continua no Supabase atual até a virada ensaiada e autorizada por você. Siga na ordem; cada bloco tem o que verificar no fim.
> Sistema recomendado: **Ubuntu Server 24.04 LTS** (sem interface gráfica).

## 0. Quanto de máquina precisa (resposta honesta)

O banco do Prime Ges hoje tem **22 MB**. A máquina **não precisa** de muita memória para ele. O que consome é a pilha do Supabase (vários contêineres).

| Item | Mínimo que funciona | Recomendado (folgado) |
|---|---|---|
| CPU | 2 vCPU | 4 vCPU |
| Memória | 4 GB | **8 GB** (16 GB se também for hospedar o site nela) |
| Disco | 60 GB SSD | **200 GB SSD/NVMe** (dados + backups locais + logs) |
| Rede | 20 Mbps com IP estável | 100 Mbps; **IP fixo** ou domínio com atualização automática |
| Energia | — | **Nobreak (UPS)** para desligar com segurança |
| Backup | — | **Disco/serviço FORA da máquina** (obrigatório) |

Se a máquina ficar em casa/escritório, confirme: (a) seu provedor não usa **CGNAT** (se o IP "público" do roteador for diferente do que sites mostram, está em CGNAT e as portas não abrem — nesse caso use Cloudflare Tunnel), (b) portas **80 e 443** liberadas pelo provedor.

## 1. O que eu preciso que você me passe depois (sem senha no chat)

- Onde a máquina fica: **casa/escritório** ou **data center**.
- Domínio que apontará para ela. Sugestão: **`api.primeges.com.br`** (a API do banco) e, se um dia o site também for para lá, `primeges.com.br`.
- Se tem **IP fixo** ou usa DDNS.
- **Quem vai fazer o backup externo** e para onde (Backblaze B2, Google Drive, outro disco).
- Marca/modelo, RAM, disco (só para eu dimensionar).
- **Nunca** cole senhas, chaves ou `.env` no chat. Elas ficam só na máquina; eu trabalho com nomes das variáveis.

## 2. Instalar o sistema e acessar com segurança

1. Instale o Ubuntu Server 24.04 LTS. Crie um usuário **que não seja `root`** (ex.: `deploy`).
2. Atualize e ative atualizações de segurança automáticas:
   ```bash
   sudo apt update && sudo apt -y upgrade
   sudo apt -y install unattended-upgrades fail2ban ufw chrony curl git ca-certificates
   sudo dpkg-reconfigure -plow unattended-upgrades
   ```
3. **SSH só por chave** (desligue senha). No seu computador, gere e copie a chave:
   ```bash
   ssh-keygen -t ed25519 -C "primeges-servidor"
   ssh-copy-id deploy@IP_DA_MAQUINA
   ```
   Na máquina, em `/etc/ssh/sshd_config`: `PasswordAuthentication no` e `PermitRootLogin no`, depois `sudo systemctl restart ssh`.
4. **Firewall** — só o necessário (nada de banco exposto):
   ```bash
   sudo ufw default deny incoming && sudo ufw default allow outgoing
   sudo ufw allow 22/tcp      # SSH (depois restrinja ao seu IP ou use Tailscale)
   sudo ufw allow 80/tcp      # emissão de certificado
   sudo ufw allow 443/tcp     # API
   sudo ufw enable
   ```
   **Nunca** libere a porta `5432` (Postgres) para a internet.
5. **Acesso privado para mim e para você** (recomendado): instale **Tailscale** (`curl -fsSL https://tailscale.com/install.sh | sh` e `sudo tailscale up`). É por esse túnel privado que eu aplicaria migrations e consultas, sem abrir portas. Depois restrinja o SSH (porta 22) à rede Tailscale.
6. Horário certo (`chrony` já cuida) e fuso do sistema em UTC ou `America/Sao_Paulo` (o banco trabalha em UTC).

**Conferir:** `ssh deploy@IP` entra por chave; `sudo ufw status` mostra só 22/80/443; `timedatectl` mostra relógio sincronizado.

## 3. Instalar o Docker

Use o repositório oficial da Docker (instruções em docs.docker.com/engine/install/ubuntu), depois:
```bash
sudo usermod -aG docker deploy && newgrp docker
docker --version && docker compose version
sudo systemctl enable docker
```
**Conferir:** `docker run --rm hello-world` funciona.

## 4. Subir o Supabase (software livre) no servidor — só para ENSAIO

> Fonte oficial: supabase.com/docs/guides/self-hosting/docker. Use a **versão marcada** (tag) do repositório, não a `master`. Na data deste documento a documentação cita a tag `self-hosted/v0.8.3`; confira a mais recente na página antes de baixar.

```bash
mkdir -p ~/primeges && cd ~/primeges
git clone --depth 1 --branch self-hosted/v0.8.3 https://github.com/supabase/supabase
mkdir supabase-project && cp -rf supabase/docker/. supabase-project
cd supabase-project && cp .env.example .env
```

1. **Gere as chaves e senhas** com o script oficial (`utils/generate-keys.sh` do próprio pacote, ou o "quick start" da documentação). Isso preenche `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, senha do Postgres, etc. **Guarde o `.env` num cofre (gerenciador de senhas) e faça cópia fora da máquina.** Sem ele, não se restaura nada.
2. No `.env`, ajuste: `POSTGRES_PASSWORD` (forte), `SITE_URL`/`API_EXTERNAL_URL`/`SUPABASE_PUBLIC_URL` para `https://api.primeges.com.br`, senha do painel (`DASHBOARD_PASSWORD`).
3. Suba:
   ```bash
   docker compose pull
   docker compose up -d
   docker compose ps
   ```
4. **Serviços:** o pacote traz vários (banco, gateway/Kong, API REST/PostgREST, Auth, Storage, Studio, Meta, Realtime, Functions, Analytics/Vector). **O Prime Ges usa:** banco, gateway, REST e **Storage**. Realtime, Functions e Analytics **não são usados** e podem ser desligados depois, no ensaio, para economizar memória. Não desligue nada antes do ensaio funcionar inteiro.
5. **Sem expor** a porta do banco: no `docker-compose.yml` mantenha `5432` só na rede interna/local.

**Conferir:** `docker compose ps` com tudo "healthy"; `curl http://localhost:8000/rest/v1/` responde (pede chave: é normal).

## 5. HTTPS e domínio

1. No DNS do domínio, crie o registro **A** `api.primeges.com.br` → IP da máquina (ou CNAME do túnel).
2. Instale **Caddy** (certificado automático Let's Encrypt) na própria máquina:
   ```bash
   sudo apt -y install caddy
   ```
   `/etc/caddy/Caddyfile`:
   ```
   api.primeges.com.br {
       reverse_proxy localhost:8000
   }
   ```
   `sudo systemctl reload caddy`.
3. Se a máquina estiver atrás de roteador: **encaminhe 80 e 443** para ela.

**Conferir:** `https://api.primeges.com.br/rest/v1/` abre com cadeado válido.

## 6. Backup (o que muda quando você sai do Supabase)

Hoje o Supabase faz backup. No servidor, **você** faz. Regra mínima:

- **Diário** (madrugada): `pg_dump` completo comprimido, mantendo 30 dias.
- **Fora da máquina**: copiar para Backblaze B2 / Google Drive / outro disco com `rclone`.
- **Teste de restauração todo mês** (backup que nunca foi restaurado não é backup).
- Guardar junto: o `.env` do Supabase, o `Caddyfile` e a lista de variáveis do site.

Exemplo (agendar com `crontab -e`, 03:00):
```bash
0 3 * * * docker exec supabase-db pg_dump -U postgres -Fc postgres > /backups/primeges-$(date +\%F).dump && find /backups -name 'primeges-*.dump' -mtime +30 -delete
```
(O nome do contêiner `supabase-db` vem do compose; confira com `docker ps`.)

## 7. Vigilância

- Monitor externo gratuito (UptimeRobot/Better Stack) chamando `https://primeges.com.br/api/health` (já falha se o banco cair) e `https://api.primeges.com.br/rest/v1/`.
- Alerta de **disco > 80%**, **memória** e **reinício inesperado**.
- `docker compose logs -f --tail=100` para investigar.
- **Nobreak** e `systemctl enable docker` (os contêineres sobem sozinhos após queda de energia).

## 8. O que NÃO fazer hoje

- Não apontar `NEXT_PUBLIC_SUPABASE_URL` da Produção para a máquina.
- Não importar dados reais de clientes antes de definir backup, criptografia do disco e quem tem acesso.
- Não expor `5432`, `3000` (Studio) nem o Docker socket na internet.
- Não desligar o projeto Supabase atual. Ele fica como **plano de volta** por 30 dias depois da virada.

## 9. Depois que a máquina estiver pronta, o plano (eu conduzo, você autoriza)

1. **Ensaio (sem tocar na Produção):** você gera o dump da Produção (ver `03_PACOTE_DO_SITE.md`), eu restauro na máquina, aplico os ajustes (papéis, `auth.jwt()`, JWKS do Clerk, bucket) e rodo as **30 baterias SQL + 951 testes**.
2. **Preview apontando para a máquina:** uma branch do site com as 3 variáveis do servidor novo, testada logada por você.
3. **Ensaio de virada** com cronômetro e teste de volta.
4. **Virada real**, em horário de pouco uso e **só com o seu "Autorizo"**: congelar escritas, dump final, restaurar, trocar as 3 variáveis na Vercel, conferir, monitorar.
5. **30 dias** com o Supabase antigo intacto como retorno; depois, desligar e remover a integração Vercel↔Supabase.

## 10. Se o site também for para a máquina (fase 2, opcional)

Hoje o site roda na **Vercel**. Hospedar o Next.js na mesma máquina é possível (Node 22 LTS, `npm run build` + `next start` em contêiner/serviço, Caddy na frente), mas passa a ser **sua** a responsabilidade por deploy, escala e segurança, e a Vercel deixa de dar HTTPS global, prévias de branch e reversão em um clique. **Recomendo adiar:** migre o banco primeiro, estabilize, e só então avalie.
