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
- Compare a imagem em uso com o último PR mesclado. O `publicar.ps1` guarda a anterior como `primeges-web:prev-<data>-<hora>` e volta sozinho se o teste de fumaça falhar.
- Se a publicação também alterou o banco, **não** volte o código sem antes conferir o plano de volta da migration em `supabase/rollback/`. Documentos legais não têm volta: publica-se uma versão nova.

## 5. Pagamento ou assinatura
- O Pix vem do prestador ativo (MisticPay; SyncPay como opção) pelo webhook. Se um cliente pagou e não liberou: `/admin` → Pagamentos → a ordem de pagamento → "Reverificar".
- Nunca marque pagamento como pago à mão sem conferir no prestador.

## 6. Login ou 2FA
- Login e senha são do Clerk. Problemas de acesso: painel do Clerk (Produção).
- A 2FA própria só vale depois que a chave `TWO_FACTOR_ENCRYPTION_KEY` existe no servidor. **Nunca troque nem remova essa chave** depois de colocada: todos os cadastros de 2FA deixariam de funcionar.

## Incidente com dados pessoais (LGPD)
Suspeita de vazamento, acesso indevido, perda ou alteração de dados. O relógio começa quando você **fica sabendo** que dados pessoais foram afetados.

1. **Conter** (na hora): desligar o acesso afetado (modo manutenção, trocar chaves e senhas, encerrar sessões). Não apagar registros: são a prova.
2. **Anotar:** quando soube, o que aconteceu, quais dados, quantas pessoas, quais empresas, o que já foi feito.
3. **Avaliar** se pode causar risco ou dano relevante (dados financeiros, de autenticação, de crianças, sensíveis ou em grande escala).
4. **Se sim, comunicar à ANPD e aos titulares em até 3 dias úteis** (Resolução CD/ANPD nº 15/2024; para agente de pequeno porte o prazo é contado em dobro: confirme o enquadramento antes de contar com isso). Formulário em gov.br/anpd. Informação incompleta é enviada mesmo assim e completada depois.
5. **Se os dados são de uma empresa cliente** (você é operador), avisar a empresa sem demora, com o que já se sabe.
6. **Registrar o incidente**, mesmo quando não for comunicado, com a justificativa, e guardar por pelo menos 5 anos.
7. Procurar um advogado.

## 7. Depois de resolver
- Registre: o que aconteceu, desde quando, causa, como resolveu e o que evita a repetição.
- Se faltou algum sinal para perceber mais cedo, abra uma ação no plano de estabilidade.

## Regras que valem sempre
- Não exponha segredos (chaves, tokens, senhas) em chat, issue ou PR.
- Não aplique migrations em Produção sem autorização explícita, uma por uma.
- Não use `force push` na `main`.
