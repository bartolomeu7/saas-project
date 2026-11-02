# Sincronização GitHub × Vercel × Supabase — 2026-11-02

Somente leitura. Nada foi alterado em código, banco, variáveis ou domínio.

## Resultado

| Par | Estado | Prova |
|---|---|---|
| GitHub × Vercel (Production) | **SINCRONIZADO** | `origin/main` = `b969441`; deploy Production de `b969441` em 27/10 13:53 UTC = `success`; checks `Vercel` e `verify` = success; `primeges.com.br` responde 200 |
| GitHub × Supabase Production | **SINCRONIZADO, com 1 exceção intencional** | todos os arquivos de `supabase/migrations` têm migration de mesmo nome no histórico de Production, exceto `20261014000300_data_layer_access_gate` (substituída, decisão do dono: nunca aplicar). Production: 81 migrations, 0 gates `a0_commercial_write_gate`, 1 empresa, 2 perfis |
| Supabase TEST | **NÃO VERIFICADO** | a API devolveu `password authentication failed for user "postgres"` ao listar migrations. É o banco de testes, não afeta produção |

Limite: a comparação do banco é por nome de migration, não byte a byte. A última comparação byte a byte foi em 21/10 (000200).

## PRs abertos
#24, #18, #17, #15, #10, #3 — todos de setembro, rascunhos ou superados. Nenhum é Go Live pendente.
Todos os PRs de #32 a #46 estão mesclados.

## Pendências reais para "Go Live completo"

| # | Pendência | Tipo | Quem resolve |
|---|---|---|---|
| 1 | **Dados da empresa nas páginas legais.** Em produção, `/termos-de-uso`, `/politica-de-privacidade`, `/politica-de-reembolso` e `/direitos-do-titular` ainda exibem marcadores "[BLOCKED — DADO EMPRESARIAL NECESSÁRIO]" (razão social, CNPJ, e-mail do encarregado etc.) | dado que só o dono tem | dono informa; eu publico via PR |
| 2 | **`www.primeges.com.br` com erro de certificado.** O domínio não está cadastrado no projeto Vercel. Correção: adicionar `www.primeges.com.br` com redirecionamento 308 para `primeges.com.br`. Tentei e o ambiente **negou** (mudança de domínio/certificado). Não contornei | config de domínio | dono, no painel da Vercel (Settings → Domains → Add → `www.primeges.com.br` → redirect para o apex), ou me autoriza explicitamente |
| 3 | Foco do login ainda pesado em produção | código | PR pequeno meu |
| 4 | Home redesenhada só em parte (Funcionalidades, Segmentos, Diferenciais, CTA final, rodapé) | código | PR meu |
| 5 | Validação logada (dashboard, sidebar, `/conta`) e M1–M7 do #33 | precisa de sessão do dono | dono |
| 6 | Gate de escrita comercial: instalado só no TEST. Production **sem** gate; depende de decisões do dono (empresa com trial vencido) | banco | dono decide; aplicar em Production exige autorização explícita |
| 7 | Backup de dados Production: lógico existe, restauração não provada | operação | dono |

## Atualização — item 2 resolvido (autorizado pelo dono no chat)
`www.primeges.com.br` foi adicionado ao projeto Vercel com redirecionamento 308 para `primeges.com.br`. Verificado: certificado do `www` agora inclui o próprio `www`; `https://www.primeges.com.br/login?x=1` responde 308 para `https://primeges.com.br/login?x=1`; o apex continua 200. Reversão: remover o domínio no painel da Vercel.

## O que eu não fiz e por quê
- Não apliquei migration alguma: não há migration pendente (a única fora é a 000300, que não deve ser aplicada).
- Não mesclei nada: não há PR de Go Live aberto.
- Domínio: só o `www` (item 2), depois da sua autorização. Nenhuma outra mudança de domínio, variável ou banco.
