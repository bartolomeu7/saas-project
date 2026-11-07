# Roteiro de incidente — Prime Ges

Uma página para quando algo der errado em produção. Leia de cima para baixo e pare quando resolver.

## 1. O site está no ar?
- Abra `https://primeges.com.br/api/health`.
  - `200` e `"status":"ok"`: o site e o banco respondem. O problema é de uma tela ou de um cliente específico (vá ao passo 3).
  - `503` e `"status":"degraded"`: o site responde, mas o banco não. Vá ao passo 2.
  - Não abre: o problema é na hospedagem (Vercel) ou no domínio. Vá ao passo 4.
- O campo `version` mostra o commit publicado (7 caracteres). Compare com o rodapé do site.

## 2. Banco não responde
- Painel do Supabase (projeto de Produção): veja se o projeto está pausado, sem espaço ou em manutenção.
- Não rode migrations nem altere dados para "consertar". Produção só muda com autorização de cada alteração.
- Se o Supabase estiver fora do ar, aguarde e acompanhe o status oficial; avise os clientes se passar de alguns minutos.

## 3. Uma tela dá erro
- A tela mostra "Não foi possível carregar …" e um **Código do erro**. Anote esse código.
- No painel da Vercel, em Logs do projeto, procure pelo código (digest) para achar o erro real.
- Peça ao cliente: empresa, horário, o que ele estava fazendo.
- Só aquele módulo é afetado; o menu e os outros módulos continuam funcionando.

## 4. Foi depois de uma publicação?
- Compare a `version` de `/api/health` com o último PR mesclado.
- Se o problema começou logo após o deploy, volte a versão anterior na Vercel (Deployments → versão anterior → Promote / Rollback). Isso não mexe no banco.
- Se o deploy também alterou o banco, **não** volte o código sem antes conferir o plano de volta (rollback) da migration em `supabase/rollback/`.

## 5. Pagamento ou assinatura
- Pagamentos vêm do EvoPay pelo webhook. Se um cliente pagou e não liberou: abra `/admin` → Pagamentos → o pagamento → "Reverificar".
- Nunca marque pagamento como pago à mão sem conferir no EvoPay.

## 6. Login ou 2FA
- Login e senha são do Clerk. Problemas de acesso: painel do Clerk (Produção).
- A 2FA própria só vale depois que a chave `TWO_FACTOR_ENCRYPTION_KEY` existe na Vercel. **Nunca troque nem remova essa chave** depois de colocada: todos os cadastros de 2FA deixariam de funcionar.

## 7. Depois de resolver
- Registre: o que aconteceu, desde quando, causa, como resolveu e o que evita a repetição.
- Se faltou algum sinal para perceber mais cedo, abra uma ação no plano de estabilidade.

## Regras que valem sempre
- Não exponha segredos (chaves, tokens, senhas) em chat, issue ou PR.
- Não aplique migrations em Produção sem autorização explícita, uma por uma.
- Não use `force push` na `main`.
