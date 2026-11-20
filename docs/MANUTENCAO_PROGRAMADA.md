# Manutenção programada e publicação segura

Guia de uso (para o dono) do que foi entregue a partir do levantamento `LEVANTAMENTO_MANUTENCAO_PROGRAMADA_2026-11-20.md`.

## 1. Painel: `/admin/maintenance` (só super administrador)

| Ação | Quando usar | O que o cliente vê |
|---|---|---|
| **Agendar manutenção** | atualização combinada para uma hora | a faixa amarela no topo do app, a partir de "aviso antecipado" (padrão 48 h) |
| **Editar** / **Cancelar** | mudou o horário ou desistiu (só enquanto agendada) | a faixa muda ou some |
| **Iniciar agora** (numa agendada) | quer começar antes da hora | vale na hora, com a mesma duração prevista |
| **Iniciar agora (emergência)** | incidente, sem agendamento | vale na hora; bloqueio total exige digitar MANUTENÇÃO |
| **Estender previsão** | está demorando mais | novo horário de volta na tela de manutenção |
| **Encerrar manutenção** | terminou e o teste passou | o sistema volta para todos |

Níveis:
- **Só aviso**: o cliente continua trabalhando; vê uma faixa azul.
- **Somente leitura**: consulta liberada, gravações bloqueadas (faixa laranja o tempo todo).
- **Sistema indisponível**: tela de manutenção com a mensagem, a previsão de volta e a contagem regressiva; o app aberto recarrega sozinho para essa tela.

Regras: no máximo uma manutenção ativa por vez; duas manutenções não podem se sobrepor; cada uma dura no máximo 24 h (48 h com extensões); a entrada no horário é **automática**, a saída é **manual** (ninguém volta antes de você confirmar). Tudo vai para a Auditoria.

Durante o bloqueio o super administrador continua entrando em `/admin` e no app (vê uma barra vermelha "Manutenção ATIVA"). Admin comum e clientes ficam fora. Passam sempre: `/api/health`, `/api/maintenance/status`, a home, o login e os termos.

O webhook do EvoPay também fica bloqueado (resposta 503, o provedor tenta de novo) nos níveis somente leitura e indisponível, para nada gravar no banco durante a troca. Se um pagamento confirmar nesse intervalo, use "Reverificar" no painel de pagamentos.

## 2. Chave de emergência independente do banco

`MAINTENANCE_MODE=1` no container do site continua existindo: derruba o site inteiro com uma página simples, **sem consultar o banco**. Use só quando o próprio banco estiver sendo movido/restaurado. O recurso novo falha "aberto": se o banco não responder, o site não cai por causa dele (e uma manutenção ativa conhecida é mantida por até 5 minutos).

## 3. Roteiro de uma manutenção planejada

1. `/admin/maintenance` → **Agendar** (nível, mensagem, início, previsão, aviso 24–48 h).
2. Na hora marcada o sistema entra em manutenção sozinho. No PowerShell: `scripts\manutencao.ps1 iniciar "motivo"` (faz backup verificado e pausa o vigia de saúde para ele não religar o que você parar).
3. Faça a atualização: `scripts\publicar.ps1` (ver abaixo).
4. `scripts\manutencao.ps1 terminar` (remove a pausa e confere o servidor).
5. `/admin/maintenance` → **Encerrar manutenção**.

## 4. `scripts\publicar.ps1` — publicação com travas

`-DryRun` mostra o que faria sem alterar nada. Sem ele, na ordem:
1. pega a `main` do GitHub e exige **CI verde** (`-PularCI` só em caso excepcional);
2. lista as **migrations novas** (a partir de `20261121000000`): cada uma precisa de script de volta em `supabase\rollback\`;
3. **backup com restauração de teste**; aborta se falhar;
4. aplica cada migration em transação única, com `lock_timeout` 5 s e `statement_timeout` 120 s, e registra em `ops.applied_migrations` (nome, checksum, data, quem);
5. constrói a imagem nova **sem tocar na atual**; guarda a atual como `primeges-web:prev-AAAAMMDD-HHMM`;
6. troca e roda o **teste de fumaça** (saúde, login, estado da manutenção). Se falhar, **volta sozinho** para a imagem anterior.

Migrations anteriores a 21/11/2026 foram aplicadas à mão (não há registro delas); a partir daí o registro é automático.

## 5. O que ainda falta (ver o levantamento, seções 4 e 5)

Proteção da `main` no GitHub (exige permissão no repositório); publicação sem queda (subir a versão nova ao lado e só então trocar o tráfego); ensaio da migration em cópia do banco; recuperação até um minuto específico; cópia fora do PC, monitor externo e página amigável na Cloudflare; aviso de nova versão para abas abertas; interruptores de funcionalidade.
