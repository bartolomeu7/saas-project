# Prova de conceito: datas, horas e valores em português (11/11/2026)

Objetivo: decidir se aproveitamos uma biblioteca open source ou escrevemos o interpretador (planejamento `docs/chat-ai`, fase 0).
Método: 11 frases de data/hora e 5 de valores, com relógio fixo (quarta-feira 11/11/2026, 12:00, São Paulo), rodadas em pacotes instalados numa pasta descartável (nada entrou no projeto).

| Biblioteca | Resultado |
|------------|-----------|
| **chrono-node 2.10.3** (locale `pt`, MIT) | Acerta o dia ("amanhã", "sexta") mas **ignora a hora em "amanhã às 14h"** (devolveu 12:00); não entende "dia 15 às 9h" nem "14h30 do dia 20"; erra "daqui a 2 horas" e "às 2 da tarde". **Reprovada** |
| **Microsoft Recognizers-Text** (suite 1.3.1, pt, MIT) | Reconhece a hora ("às 14h", "14:30") mas **não devolve a data** de "amanhã"/"depois de amanhã" nem "meio-dia". Números por extenso e valores **bons** ("cento e cinquenta" = 150, "mil e duzentos" = 1200, "R$ 1.234,56"). **Reprovada para datas** |

**Decisão:** interpretador próprio, **sem dependência nova**, em `src/lib/chat/` (`datetime-pt.ts`, `numbers-pt.ts`, `text.ts`), com testes frase a frase em `tests/unit/chat-core.test.mjs` (inclui os casos que a prova mostrou errados nas bibliotecas). A gramática de agendamento é pequena e fechada; o interpretador devolve **candidatos** quando há ambiguidade ("às 2", "quarta" dita numa quarta) em vez de escolher.
