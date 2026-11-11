# Chat AI — bateria REAL em produção (empresa teste1, 11/11/2026)

**Como foi:** 6 rodadas × 20 conversas contra o **site de produção**, logado como o dono na empresa de teste **teste1** (dados fictícios): mesma rota, mesma sessão, mesmo banco (RLS) que um usuário usa. Rodadas 1–5 pelo `POST /app/chat/turn` (texto como digitado) e confirmações pelo `POST /app/chat/confirm`; rodada 6 foi ataque/robustez da API. Catálogo real da teste1: 6 serviços de nome longo, 1 profissional (Rafael), 10 clientes (2 com "Beatriz", 3 com "Cliente/Teste", 1 inativo), expediente seg–sex 9–18, 1 bloqueio e agendamentos já existentes.

**O que isto NÃO cobre:** microfone e digitação na tela do celular (o dono já validou no PR #101/#102); outra empresa/segmento (HAT GROUP não tem serviços ativos); carga.

## Por que valeu a pena

A bateria anterior (120/120 no motor com dados falsos) **não pegou o maior problema**: os testes usavam nomes de serviço curtos ("Lavagem Simples"); os reais são longos ("Polimento Técnico Completo", "Hidratação Profunda com Cronograma (Teste Completo)"). Dizer só **"polimento"** ou **"hidratação"** não achava o serviço e a Cláudia respondia "Não encontrei o serviço polimento", mesmo ele existindo. Isso afetaria quase todo cliente real.

## Resultado por rodada (comportamento observado em produção, antes das correções)

| Rodada | Tema | Bom | Com problema |
|---|---|---|---|
| R1 | Frases naturais | 7/20 | 13: serviço por uma palavra (8), "agendar a Fulano para serviço" (1), nome sem "para" (1), sem verbo "polimento Beatriz…" (1), "horário de polimento" (1), mensagem de fim de expediente confusa (1) |
| R2 | Datas e horas (expediente, bloqueio, conflito real) | 20/20 | — (mensagem "não atende" poderia ser mais clara: 1) |
| R3 | Clientes | 16/20 | cliente inativo oferecia cadastro duplicado; "Juliana e Marcos" oferecia cadastrar um cliente chamado "Juliana e Marcos"; "A" (nome de 1 letra) não aceito; "cadastrar cliente" ainda não existe |
| R4 | Serviços/profissionais | 14/20 | "progressiva", "tratamento", "cronograma" não achavam; "teste" escolhia "Teste Duracao" sozinho em vez de perguntar |
| R5 | Conversa, correções e voz | 18/20 | "na verdade é para o Marcos" não trocava o cliente; "sim" digitado só repetia o resumo; "daqui a duas horas" dava 14:37 |
| R6 | Robustez/segurança da API | 20/20 | recusa text/plain não existia (hardening) |

### Confirmações reais (escrevem na teste1)
- Confirmar normal: criou o agendamento ✔
- Clique duplo (2 confirmações do mesmo resumo): 1 criado + "já foi criado" ✔ (idempotência)
- **5 confirmações simultâneas:** exatamente 1 agendamento no banco ✔
- Confirmar versão antiga do resumo: **409** "Este resumo foi atualizado" ✔
- Rascunho inexistente: 404 ✔
- O histórico do chat agora **grava** (468 mensagens no período) ✔ — a correção do PR #101 funcionou.

### Robustez/segurança da API (todas OK)
Texto vazio/sem texto/JSON inválido/>3000 caracteres → 400; GET → 405; sessão inválida → 400; sessão desconhecida → cria nova; campo extra `companyId` ignorado (empresa vem da sessão); XSS e SQL no texto → tratados como texto (nada executou; nada foi cadastrado); injeção de prompt → "só agendo"; deslogado → redirecionamento (nunca dados); `inputMode` inválido → 400.

## Correções feitas neste PR

1. **Serviço por palavra distintiva:** uma palavra que só existe em UM serviço ("polimento", "escova", "hidratação", "progressiva", "tratamento", "cronograma") agora o identifica.
2. **Palavra comum a vários** ("teste", "lavagem") **pergunta qual**, listando todos os que a têm, em vez de escolher um.
3. "Agendar **a** Marcos Vinícius **para** polimento": cliente antes do "para", serviço depois.
4. Nome do cliente **sem "para"** ("polimento Marcos Vinícius Albuquerque 18/11"): reconhecido pelas maiúsculas (nunca confunde com nome de profissional ou serviço).
5. Frase **sem verbo** ("polimento Beatriz amanhã 10h") e "**horário de** polimento" entendidas como pedido de agendamento.
6. **Cliente inativo:** avisa "o cliente X está inativo, reative em Clientes" (não oferece cadastro duplicado).
7. "**Juliana e Marcos**": recusa (um cliente por vez) em vez de oferecer cadastrar um nome com "e".
8. **Fim de expediente claro:** "Polimento dura 3h30: começando às 15:00 terminaria às 18:30, depois do fim do expediente."
9. **Mudar o cliente** depois do resumo ("na verdade é para o Marcos") troca e refaz o resumo.
10. **"sim" digitado:** "Para gravar, toque em Confirmar… por texto eu não gravo nada."
11. "daqui a N horas" arredonda para múltiplo de 5 minutos.
12. Rotas aceitam **somente JSON** (415 para text/plain): fecha a possibilidade de formulário de outro site disparar turno/confirmação.

12 novos testes automatizados (`tests/unit/chat-real-teste1.test.mjs`) reproduzem os casos reais com o catálogo da teste1.

## Resíduos criados nos testes (teste1, fictícios, mantidos)
4 agendamentos futuros de teste: 13/11 09:00 (Juliana), 16/11 09:00 (Marcos), 17/11 10:00 e 18/11 09:00 (Beatriz). Posso removê-los se você quiser.

## Decisões / recomendações (além das da bateria anterior)
1. **Autorizar a migration do log de auditoria do Chat AI** (ainda pendente). *Recomendo.*
2. **Apelidos de serviço** ("escova" → "Escova Progressiva com Tratamento"): a regra de palavra distintiva resolveu 90% sem migration; apelidos só se ainda houver reclamação. *Recomendo esperar o piloto.*
3. **Limite diário de 200 mensagens/empresa:** a bateria consumiu ~170 em uma tarde. Para uso real de uma empresa é folgado; para testes pesados, subir o limite exige alterar variável na Vercel (precisa do seu "Autorizo"). *Recomendo manter 200.*
4. **Cadastrar cliente por voz/texto** ("cadastrar o cliente Pedro Alves") é o pedido natural que hoje responde "por enquanto só agendo". Próxima função recomendada, junto com **reagendar** e **cancelar**.
5. **Piloto com 2–3 empresas reais** antes de ampliar funções (continua recomendado).
6. **Nome de 1 letra** ("A") não é aceito como nome de cliente (regra anti-lixo): não recomendo mudar.
