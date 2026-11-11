# Chat AI do Prime Ges — Especificação detalhada (só planejamento)

Data: 11/11/2026. **Nada disto está implementado.** Complementa `PLANEJAMENTO_CHAT_AI_BOTS_2026-11-11.md` (decisões do dono: agente **Cláudia**, **subagentes por módulo**, **confirmação obrigatória**) e `LEVANTAMENTO_OPEN_SOURCE_CHAT_AI_2026-11-11.md`.

| Arquivo | Conteúdo |
|---------|----------|
| `00-INDICE.md` | Este índice, princípios, glossário, decisões em aberto |
| `01-ARQUITETURA-E-CONVERSA.md` | Cláudia (orquestradora), máquina de estados, protocolo de conversa, contrato do subagente, modelo de dados, segurança, observabilidade |
| `02-SUBAGENTES-E-FICHAS.md` | Cada subagente: intenções, fichas campo a campo (obrigatório/recomendado/padrão), validações, cartão de confirmação, executor, diálogos, bordas |
| `03-INTERFACE-E-RECURSOS.md` | Todas as telas, componentes, estados, voz, gráficos, acessibilidade, ativos visuais, textos, dependências e infraestrutura |
| `04-TESTES-E-QUALIDADE.md` | Estratégia de testes, matriz por camada, corpus de frases, portões de liberação, **análise preventiva de falhas (pre-mortem)** |

## Princípios (valem para tudo)
1. **A Cláudia nunca grava sozinha.** Toda mudança passa por um cartão de confirmação e um clique em **Confirmar**.
2. **O modelo de linguagem (se usado) só lê e preenche um formulário.** Não recebe IDs, não tem ferramentas de gravação, não vê dados da empresa além do que o usuário digitou.
3. **Quem grava é o nosso código**, com a sessão do próprio usuário, chamando as **mesmas funções do banco que as telas usam**. Permissões, limites de plano e isolamento entre empresas continuam valendo sem exceção.
4. **O servidor guarda o rascunho.** O botão Confirmar envia só o identificador e a versão; o cliente não manda dados para gravar.
5. **Perguntar pouco:** obrigatório pergunta; recomendado oferece uma vez; padrão não pergunta.
6. **Na dúvida, perguntar, nunca adivinhar** (módulo, cliente, produto, data).
7. **Cada módulo liberável e desligável separadamente** (flag por módulo e por empresa) e um interruptor global.
8. **Primeiro consultas e criações; alterações depois; ações destrutivas/irreversíveis só em fase posterior**, com confirmação reforçada.

## Níveis de risco das intenções
| Nível | O que é | Exemplos | Confirmação |
|-------|---------|----------|-------------|
| R0 | Só leitura | "o que tenho amanhã?", "saldo do caixa", "o que está acabando?" | Sem confirmação (não altera nada) |
| R1 | Cria registro novo | agendar, cadastrar produto/cliente, lançar despesa | Cartão + Confirmar |
| R2 | Altera registro existente ou movimenta dinheiro/estoque | reagendar, confirmar atendimento, concluir atendimento, baixa e entrada de estoque, registrar venda, vale de funcionário | Cartão + Confirmar (mostra antes e depois) |
| R3 | Difícil ou impossível de desfazer | fechar caixa, cancelar venda, estornar, cancelar compra, pagar folha | Cartão reforçado: digitar uma palavra ("CONFIRMAR") ou segundo clique. **Fora da v1** |

## Glossário
- **Intenção:** o que o usuário quer fazer (ex.: `agenda.agendar`).
- **Ficha:** lista de campos de uma intenção, com tipo, nível (obrigatório/recomendado/padrão), regra e pergunta.
- **Rascunho (draft):** estado salvo no servidor com o que já foi entendido; tem versão e validade.
- **Resolver:** transformar o que a pessoa disse ("o João") em um cadastro real, ou devolver candidatos.
- **Subagente:** pacote de código de um módulo que cumpre o contrato da seção 3 do arquivo 01.
- **Executor:** parte do subagente que grava (só roda após Confirmar).

## Decisões em aberto (precisam do dono; recomendação entre parênteses)
| # | Decisão | Recomendação |
|---|---------|--------------|
| D1 | Entender a frase com **modelo de linguagem hospedado** (híbrido) ou só regras | Híbrido; texto enviado a provedor externo, aviso na Política de Privacidade, áudio não guardado |
| D2 | Voz na v1 | Texto primeiro; voz do navegador na fase 5 |
| D3 | Veículo/placa | Cadastro opcional só para segmentos automotivos; fora da v1 |
| D4 | Entrada de estoque: ajuste de saldo ou compra | Ajuste de saldo com motivo na v1 |
| D5 | Venda pelo chat exige função nova no banco (tudo-ou-nada) | Aprovar a migration (seção 2.5 do arquivo 02) |
| D6 | Ajuste de estoque por **diferença** exige função nova no banco (evita erro de concorrência) | Aprovar (seção 2.2) |
| D7 | Chat AI em todos os planos ou plano superior; cota de mensagens por plano | Plano superior, com cota |
| D8 | Teto de valor para segunda confirmação | R$ 1.000 por ordem (configurável) |
| D9 | Quem pode usar cada módulo pelo chat | Igual à matriz de permissões das telas |
| D10 | Piloto: só teste1 ou também 1–2 clientes reais | teste1, depois 1–2 clientes |

## Ordem de leitura sugerida
00 → 01 → 02 (módulo Agenda primeiro) → 03 → 04. A análise preventiva de falhas (04, seção 7) é o que mais reduz retrabalho.
