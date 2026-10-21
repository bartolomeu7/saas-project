# Go Live jurídico/LGPD — pendências conhecidas

Publicado em 2026-10-21 por decisão do dono, **com pendências anotadas abaixo**. Nada aqui bloqueia o uso do produto; são ajustes finais.

## Dados da empresa (textos legais com `[BLOCKED — DADO EMPRESARIAL NECESSÁRIO]`)
Os Termos e a Política de Privacidade (versão `1.0.0-rc.3`) estão no ar com 11 campos em branco, que não podem ser inventados:
- razão social, CNPJ e endereço;
- e-mail de contato / canal de atendimento e suporte (é também o canal para pedir **reembolso** e **direitos do titular**);
- encarregado de dados (DPO);
- comarca do foro (para quem não é consumidor).

Para resolver: preencher os dados, gerar a versão `rc.4` (texto novo → novo hash → migration que registra a versão → deploy junto) e pedir novo aceite. O teste `LEGAL_REQUIRE_PUBLISHABLE=1 npm run test:unit` passa a ficar verde quando não restar marcador.

## Revisão jurídica
Os textos são proposta técnica, não parecer jurídico. Recomenda-se revisão por advogado (LGPD, CDC art. 49, Marco Civil).

## Compromissos operacionais assumidos nos textos (precisam ser cumpridos)
- Responder pedidos de titulares em até 15 dias.
- Reembolso em 10 a 15 dias úteis (arrependimento de 7 dias, CDC art. 49). **Não existe fluxo automático de pedido de reembolso**: depende do e-mail de atendimento acima.
- Cópia dos dados (exportação) é manual, pelo canal de atendimento.
- Confirmar os acordos de proteção de dados com Supabase, Vercel, Clerk e EvoPay (transferência internacional, LGPD art. 33).
- Expurgo de `retained_billing_records` após `retain_until` (5 anos): ainda sem rotina automática.

## Exclusão de conta (`/conta`)
- E-mail de confirmação **não está ativo** (decisão: pular o Resend por ora). A tela final avisa que nenhum e-mail foi enviado. Para ativar: `RESEND_API_KEY` + `EMAIL_FROM` na Vercel (domínio verificado).
- O fluxo logado completo (clique em excluir → banco → Storage → Clerk) foi validado no banco (TEST, 37/37) e na compilação, mas **não** com uma conta real. Fazer um teste com conta descartável.

## Segurança — itens abertos
- Sem CSP (precisa teste dedicado; sugerido começar em modo "só relatório").
- Sem `security.txt` (precisa do e-mail de contato).
- Bloqueio comercial no banco (gate) instalado só no TEST.
- Cadastro real em Production para confirmar a concessão do teste grátis.
- 3 avisos de dependência apenas de ferramentas de build.
- Navegação 100% por teclado ainda não testada de ponta a ponta.
