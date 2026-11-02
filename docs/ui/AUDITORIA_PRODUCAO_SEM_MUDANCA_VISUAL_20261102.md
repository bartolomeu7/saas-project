# Auditoria: "por que a interface não mudou em produção?"

Data da checagem: 2026-11-02 (relógio do servidor, ~02:55 UTC). Somente leitura: nenhuma configuração, variável, domínio ou dado foi alterado. Imagens em `docs/ui/evidencias-producao-20261102/`.

## 1. Conclusão

**A premissa não se confirma para o código atual: a nova Home e o login corrigido ESTÃO em produção.** Duas coisas explicam a percepção de "nada mudou":

1. **As primeiras ondas não mudavam o corpo da Home.** Os PRs #42 (tokens), #43 (navegação/shell) e #44 (docs) foram publicados em 27/10 entre 11:52 e 12:28 UTC. Medi a Home de produção nessa fase contra a versão antiga: o corpo era **pixel a pixel idêntico** (0 a 0,003 %). Só o cabeçalho mudou. Quem comparou nessa fase viu "igual" — e estava certo.
2. **A mudança visual de verdade só chegou em produção depois**, no PR #46, publicado em **27/10 13:53 UTC** (commit `b969441`). A partir daí, a produção difere 7 a 29 % dos pixels da versão anterior e bate com o build local da nova versão (0,02 a 0,74 % de diferença).

Se você ainda vê a versão antiga em algum aparelho, o problema está **entre o aparelho e a produção** (cache, URL/aba antiga, outro endereço) — não no deploy. Não consegui provar isso porque não enxergo o seu aparelho; indico abaixo o teste que prova.

## 2. Linha do tempo real (API de deploys do GitHub, ambiente "Production")

| Quando (UTC, 27/10) | Commit | O que entregou visualmente |
|---|---|---|
| 11:52 | `7f7ba8c` — PR #42 (Onda 0) | só tokens de cor e fundo dos menus; **sem mudança visível na Home/login** |
| 12:23 | `15430ba` — PR #43 (Ondas 1+2) | cabeçalho fixo, indicador do menu, botão "Criar conta" no celular, menu mobile corrigido, breadcrumb/sidebar/`/conta` (logado) |
| 12:28 | `2e67185` — PR #44 | só documentação |
| **13:53** | **`b969441` — PR #46** | **Home recomposta, login, dashboard** (e PR #45: preços alinhados) |

Estado atual: `origin/main` = `b969441`; status Vercel do commit = `success`; o alias `primeges.com.br` está nesse deployment (`dpl_BrEX5VADVu9rTUhh3zM2X1AQ8reT`, ambiente Production, estado success).

## 3. Provas de que a produção serve a versão nova

| Prova | Resultado |
|---|---|
| CSS servido por `primeges.com.br` (`4e43a130bfdda04a.css`) | contém `home-v3-band` e a regra do hero em uma coluna — ambos só existem no PR #46 |
| CSS (`b912928817c918f1.css`) | contém `prime-dashboard-actions` (dashboard novo) e `prime-site-header{…sticky…}` |
| HTML da Home | tem as classes das duas colunas de Problema/FAQ e 10 ocorrências de `home-v3-band` |
| Navegador em produção (1366 px) | cabeçalho `sticky`; layout do hero em 1 coluna (1287 px); título do hero com 76 px (a regra anterior dava ~60 px nessa largura); 5 faixas `home-v3-band` |
| Pixel-diff, produção agora × produção antes do #46 | topo desktop **28,56 %**, topo mobile 20,55 %, recursos 7,24–12,64 %, FAQ 6,68 % |
| Pixel-diff, produção agora × build local da nova versão | 0,02–0,74 % (ruído de fonte/dados reais) |
| Service worker | **nenhum** registrado (não há cache de aplicativo persistente) |
| Cabeçalhos HTTP da Home | `Cache-Control: public, max-age=0, must-revalidate`; arquivos CSS/JS têm hash no nome (versão nova = nome novo) |
| DNS/TLS | `primeges.com.br` → `216.198.79.1` (Vercel); `www.primeges.com.br` aponta para o apex por DNS, mas **não está cadastrado no projeto Vercel** e recebe o certificado do apex (só cobre `primeges.com.br`): o navegador acusa erro de certificado em `www`. **Correção (02/11, nova checagem):** a frase anterior deste relatório, dizendo que o `www` estava resolvido, estava errada. |
| Login em produção | rótulo "Seu e-mail" **inteiro** (antes cortado); `overflow` do cardBox = visível; margem do card = 0 |

## 4. O que NÃO está resolvido (achados honestos)

1. **Login — anel de foco ainda pesado em produção.** A correção do corte funcionou, mas a regra que deveria suavizar o foco **não surtiu efeito**: a captura `prodnow_login_desktop_focus.png` mostra o anel azul espesso. Na emulação eu havia usado `!important`; no código real o Clerk vence a regra por especificidade. É uma falha minha de verificação (a emulação não era idêntica ao código).
2. **Dashboard e telas logadas: não consegui ver em produção** (sem sessão de teste autorizada). Sei que o código está publicado (marcadores no CSS e deploy do commit), mas não vi a tela renderizada com dados reais.
3. **O redesenho da Home foi parcial por escolha de escopo:** hero, Problema, FAQ, faixas, títulos, passos e destaque do plano popular mudaram; Funcionalidades, Segmentos, Diferenciais, CTA final e rodapé ficaram como estavam. Se a expectativa era transformação da página inteira, ainda falta.
4. **Falha de processo:** depois que o PR #46 foi mesclado, eu não conferi a produção até agora. O correto era ter validado logo após o deploy.

## 5. Causas descartadas (com evidência)

- Deploy errado/Preview em vez de Produção: descartado (API de deploys: ambiente Production, alias do domínio no deployment `b969441`).
- Domínio apontando para outro servidor ou projeto: descartado (DNS Vercel; resposta com `Server: Vercel` e conteúdo novo).
- Cache do edge (CDN) preso à versão antiga: descartado (ISR de 60 s por deployment; CSS novo no ar com nome novo).
- Service worker/PWA: descartado (nenhum registro).
- Build sem as mudanças: descartado (CSS e HTML contêm as classes novas).

## 6. Hipóteses que dependem do seu aparelho (não verificáveis por mim)

- Cache local do navegador/aba aberta antes de 27/10 13:53 UTC.
- URL errada: o link de **Preview** da Onda 0 (`saas-project-git-ui-onda-0-…vercel.app`) está **congelado** no commit da Onda 0 e nunca mostrará o que veio depois; o endereço certo é `https://primeges.com.br`.
- Olhar o app logado esperando ver outro tema: o dashboard mudou de organização (atalhos no topo, KPIs maiores, textos maiores), mas a sidebar e as demais telas internas ainda são as antigas — isso é escopo das Ondas 4/5.

**Teste decisivo (1 minuto):** abra `https://primeges.com.br/?v=2` em janela anônima. Se aparecer o título grande centralizado com o painel do produto largo logo abaixo, e no celular o botão azul "Criar conta" ao lado do menu, você está vendo a versão nova. Se o código-fonte da página (Ctrl+U) citar `4e43a130bfdda04a.css`, é a versão do PR #46.

## 7. Plano para resolver o que falta

| # | Ação | Resultado verificável | Dependência |
|---|---|---|---|
| 1 | Você faz o teste decisivo acima e me manda um print | confirma se é cache/URL do aparelho | você |
| 2 | Adicionar identificação de versão visível (commit curto no rodapé, a partir da variável de build do Vercel) | acabar com a dúvida "qual versão estou vendo?" em qualquer aparelho | PR pequeno |
| 3 | Corrigir o foco do login com mais especificidade (regra `!important` no `appearance` do Clerk) e **validar no navegador em produção** logo após o deploy | anel fino em `prodnow_login_*` | PR pequeno |
| 4 | Conta de teste somente leitura (ou sessão que você autorize) para validar dashboard, sidebar, breadcrumb e `/conta` em produção | capturas autenticadas antes×depois | você |
| 5 | Completar a Home: Funcionalidades (bento), Segmentos, Diferenciais, CTA final e rodapé | diferença medida nessas seções (hoje ≈ 0 %) | PR de Home (Onda 1, parte 2) |
| 6 | Rotina de pós-deploy: depois de cada merge de UI, capturar produção e comparar com a versão anterior | evita repetir a lacuna #4 | processo |
| 7 | Ondas 4 (módulos, piloto Clientes), 5 (admin) e 6 (regressão) | por lote, com capturas | missões separadas |

## 8. Resumo

`A nova Home e o login corrigido estão em produção desde 27/10 13:53 UTC (commit b969441, medido por CSS, HTML e pixels). O "nada mudou" é verdadeiro só para a fase dos PRs #42–#44, que não tocavam o corpo da Home. Pendentes: foco do login (falhou), validação logada (bloqueada) e o restante da Home (não feito).`
