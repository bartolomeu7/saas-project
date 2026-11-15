# Chat AI — avaliação de projetos open source (SEM IA, SEM WhatsApp) — 14/11/2026

**Regras definidas pelo dono:** o chat é um **agente automatizado (regras)**, **sem inteligência artificial** e **sem WhatsApp**. Só entra o que for útil para o SaaS: **agendamento, estoque, produtos e financeiro**. Preferência por projetos **com muitas estrelas e boa avaliação**.

**Resultado:** retirei da lista tudo que depende de modelo de IA (LLM, embeddings, Whisper, classificadores) e tudo de WhatsApp. O que sobrou foi **avaliado de 0 a 10** e as candidatas principais foram **testadas de verdade** numa pasta temporária fora do projeto (**nada foi instalado no site**).

## Como a nota é calculada

| Critério | Peso | O que mede |
|---|---|---|
| **Utilidade** para nosso SaaS | 40% | Resolve algo real em agenda, estoque, produtos ou financeiro? Ou duplica o que já temos? |
| **Maturidade** | 20% | Estrelas, atividade recente, uso na comunidade, estabilidade |
| **Encaixe técnico** | 15% | Funciona em Next.js/Vercel e no servidor novo, TypeScript, peso do pacote |
| **Licença e risco** | 10% | Licença permissiva para uso comercial; risco de abandono |
| **Prova em português** | 15% | Resultado do **teste que fiz** com frases/dados reais nossos |

Nota final = média ponderada. Dados do GitHub/npm conferidos hoje (14/11/2026).

---

## 1. Classificação final (as que vale usar)

| # | Projeto | Para quê (módulo) | Estrelas | Licença | **Nota** | Decisão |
|---|---|---|---|---|---|---|
| 1 | **fast-check** | Testes que **inventam milhares de casos** para datas, valores e quantidades (qualidade de tudo) | 5,3 mil | MIT | **8,7** | **Usar já** (só desenvolvimento) |
| 2 | **Recognizers-Text** (só números, dinheiro e unidades) | Valor por extenso ("cento e cinquenta reais"), quantidade de estoque ("duas caixas", "meio quilo", "3 kg") | 1,8 mil + Microsoft | MIT | **8,3** | **Usar** (só os pacotes de número/unidade) |
| 3 | **pg_trgm + unaccent** (extensões do próprio PostgreSQL) | Buscar produto/cliente/serviço por nome aproximado, no banco, com a segurança por empresa | — (parte do Postgres) | PostgreSQL | **8,2** | **Usar** (migration pequena, precisa do seu "Autorizo") |
| 4 | **rrule** | Agendamento que se repete ("toda terça"), **contas fixas do financeiro** ("todo dia 5") | 3,8 mil | BSD-3 | **7,7** | **Usar** (quando fizermos recorrência) |
| 5 | **zxing-js/library** | **Estoque e produtos**: ler código de barras pela câmera do celular (entrada, baixa, achar produto) | 2,9 mil | Apache-2.0 | **7,7** | **Usar** (precisa liberar câmera, ver §4) |
| 6 | **libphonenumber-js** | Telefone do cliente em qualquer formato; buscar cliente pelo telefone | 3 mil, muito baixado | MIT | **7,6** | **Usar** (versão `min`) |
| 7 | **@faker-js/faker** (pt_BR) | Dados fictícios para testes e para o ambiente de ensaio (clientes, produtos) | 15,6 mil | MIT | **7,6** | **Usar** (só desenvolvimento) |
| 8 | **XState** | Organizar os diálogos (agendar, estoque, financeiro) como máquina de estados | 30,5 mil | MIT | **7,5** | **Depois** (quando entrar cancelar/reagendar) |
| 9 | **json-rules-engine** | **Regras por empresa como dado**: antecedência mínima, limite por cliente/dia, estoque mínimo, desconto máximo | 3,1 mil | ISC | **7,4** | **Avaliar** junto das "regras por empresa" |
| 10 | **date-fns** | Dias úteis e vencimentos do financeiro, formatação pt-BR | 36,7 mil | MIT | **7,0** | Só para o financeiro (já temos regras de data próprias) |
| 11 | **ts-pattern** | Código do motor mais seguro (verificação exaustiva de casos) | 15,2 mil | MIT | **7,0** | Opcional, melhora manutenção |
| 12 | **date-holidays** | Avisar feriado na agenda; vencimento que cai em feriado | 1,1 mil | ISC (código) + CC BY-SA (dados) | **6,4** | **Preferir tabela própria** (ver nota) |
| 13 | **brazilian-utils** | CPF/CNPJ/CEP | 1,7 mil | MIT | **6,5** | Só se quisermos trocar nossos validadores (já temos) |
| 14 | **currency.js / decimal.js** | Contas em reais sem erro de centavo no JavaScript | 3,4 mil / 7,3 mil | MIT | **6,7** | Só se surgir conta de dinheiro feita no JS (hoje o banco calcula) |
| 15 | **Fuse.js** | Busca aproximada de nomes e **apelidos** ("bia" → Beatriz) | 20,5 mil | Apache-2.0 | **6,6** | **Opcional**: nosso código já acerta 8 de 9; o Fuse acerta o apelido, mas com risco de falso positivo |
| 16 | **natural** (radical de palavras) | "escovas" = "escova", plural/singular | 10,9 mil | MIT | **5,7** | Não: 14 MB para ganhar pouco |
| 17 | **assistant-ui** | Tela de chat | 13,2 mil | MIT | **5,0** | Não agora: é feito para chat de IA; nossa tela já está pronta |

### Fora por regra do dono (IA ou WhatsApp) — **não pontuados**
Vercel AI SDK, promptfoo, BAML, Langfuse, LiteLLM, Ollama, vLLM, llama.cpp, DSPy, pgvector (usa embeddings de IA), Speaches/faster-whisper/whisper.cpp/Transformers.js/sherpa-onnx (modelos de voz), Evolution API, WAHA, Baileys, whatsapp-web.js. *A voz continua pelo microfone do navegador (Web Speech), como está hoje.*

### Fora por serem fracos para o nosso caso (mesmo sendo regras)
| Projeto | Nota | Motivo |
|---|---|---|
| chrono-node (datas) | 3,5 | Já testado antes: nosso analisador em português acerta mais |
| Recognizers-Text **para datas** | 2,0 | Teste de hoje: em português **não devolveu nenhuma data+hora completa** nas 16 frases (ver §3); o nosso acertou 15 das 16 |
| nlp.js, compromise, wink-nlp | 2,5 / 2,0 / 2,0 | Parado desde 01/2025 / inglês / inglês; trazem classificadores de IA |
| Rasa, Botpress | 1,0 | Frameworks de IA, pesados |
| chatscope/chat-ui-kit-react | 4,5 | Sem atualização desde 05/2025 |

---

## 2. Justificativa de cada nota (as 11 principais)

### 1) fast-check — **8,7**
- **Utilidade 8:** nosso risco maior é o parser errar em silêncio (hora, dia, valor, quantidade de estoque). Em vez de 20 exemplos, ele gera milhares e acha o caso que ninguém pensou. Serve para **todos** os módulos.
- **Maturidade 8:** 5,3 mil estrelas, ativo (push de 14/11/2026), padrão de mercado para testes por propriedade.
- **Encaixe 9:** só desenvolvimento, 1,5 MB, TypeScript, roda no `node:test` que já usamos.
- **Licença 10:** MIT.
- **Prova 10:** rodei 3 propriedades × 500 casos contra o **nosso** analisador ("amanhã às H:MM", "dia D às Hh", "N para as H"): **0 falhas**. Mostra que o motor está sólido e que a ferramenta funciona com nosso código.

### 2) Recognizers-Text (números, dinheiro, unidades) — **8,3**
- **Utilidade 9:** hoje o chat **não entende valor por extenso** ("cento e cinquenta reais") nem quantidade de estoque falada ("duas caixas", "meio quilo", "dois litros e meio"). É exatamente o que falta para **entrada de estoque, preço de produto e financeiro por voz/texto**.
- **Maturidade 7:** da Microsoft, usada em bots corporativos; pacote `@microsoft/recognizers-text-suite` 1.3.1 (07/2026).
- **Encaixe 6:** o pacote completo tem 11 MB; usaríamos só os módulos de **número** e **número com unidade**, no servidor.
- **Licença 10:** MIT.
- **Prova 9:** testei 11 frases: acertou **150 BRL**, **1500 BRL**, **25000**, **0,5 kg**, **3 kg**, "R$ 1.234,56", "R$ 35,50"; **nosso** `parseExtras` só pegou os valores digitados ("valor 80 reais"), não os por extenso. Pequena falha: "dois litros e meio" voltou como "2" e "0,5" separados (a gente trata).
- **Não é IA:** funciona por expressões regulares e regras (lexicon em português).

### 3) pg_trgm + unaccent — **8,2**
- **Utilidade 7:** com 500 a milhares de produtos/clientes, a busca aproximada **no banco** é mais rápida e já respeita a empresa (segurança por linha). Hoje carregamos até 500 clientes e filtramos no código.
- **Maturidade 10:** vem com o PostgreSQL há anos.
- **Encaixe 9:** o Supabase self-hosted já inclui as extensões.
- **Licença 10:** licença PostgreSQL.
- **Prova 7:** **não estão instaladas hoje** na Produção (conferi a lista de extensões); precisa de migration. Dá para validar no ensaio da migração para o servidor novo.

### 4) rrule — **7,7**
- **Utilidade 8:** recorrência é o pedido natural da agenda ("toda terça às 10h") e das **contas a pagar fixas**.
- **Maturidade 6:** 3,8 mil estrelas; última versão de 11/2023 (estável, sem atualização frequente).
- **Encaixe 8:** 0,9 MB, JavaScript puro, roda no servidor.
- **Licença 10:** BSD-3.
- **Prova 7:** gerou "toda terça (6×)" e "todo dia 5 (4×)" corretamente. O texto em linguagem natural sai em inglês, então a frase em português é nossa.

### 5) zxing-js/library — **7,7**
- **Utilidade 8:** leitor de **código de barras** pela câmera acelera **entrada/baixa de estoque** e a busca de produto.
- **Maturidade 7:** 2,9 mil estrelas, push de 17/10/2026. Alternativa: html5-qrcode (6,2 mil, push 12/2025).
- **Encaixe 7:** roda no navegador; exige **liberar a câmera** (hoje o site bloqueia, ver §4).
- **Licença 10:** Apache-2.0.
- **Prova 7:** não testei com celular; a biblioteca é padrão para EAN-13. Provar em dois aparelhos.

### 6) libphonenumber-js — **7,6**
- **Utilidade 6:** cadastrar cliente e achar por telefone, em qualquer formato.
- **Maturidade 9:** 3 mil estrelas, ativo (10/11/2026), versão `1.13.16`, uma das mais baixadas do npm nesse tema.
- **Encaixe 7:** a versão `/min` é pequena; a completa tem 10 MB de dados.
- **Licença 10:** MIT.
- **Prova 9:** "11 99999-0000", "(11)99999-0000", "011 99999 0000" e "+55 11 99999-0000" viram **+5511999990000 (válido)**. "final 7777" não é número: mantemos nossa regra.

### 7) @faker-js/faker (pt_BR) — **7,6**
- **Utilidade 6:** nomes, telefones e produtos fictícios para testes e para o **ambiente de ensaio** sem usar dados de clientes reais.
- **Maturidade 9:** 15,6 mil estrelas, ativo (13/11/2026).
- **Encaixe 9:** só desenvolvimento.
- **Licença 10:** MIT.
- **Prova 7:** gerou nomes e telefones brasileiros plausíveis (nomes de produto saem engraçados).

### 8) XState — **7,5**
- **Utilidade 6:** o fluxo (`coletando → aguardando_confirmacao → executando → concluído`) já é uma máquina. Formalizar ajuda a testar e a **somar estoque e financeiro** sem virar emaranhado.
- **Maturidade 10:** 30,5 mil estrelas, ativo (14/11/2026).
- **Encaixe 8:** 2,5 MB, TypeScript; refatoração média.
- **Licença 10:** MIT.
- **Prova 7:** modelei o fluxo em 12 linhas: aceitou a sequência correta e **ignorou o evento inválido** (confirmar antes de completar).

### 9) json-rules-engine — **7,4**
- **Utilidade 7:** deixa o dono definir **regras da própria empresa** como dado (antecedência mínima, limite por cliente/dia, estoque mínimo, desconto máximo) sem nós fazermos deploy.
- **Maturidade 6:** 3,1 mil estrelas; última versão 02/2025 (estável).
- **Encaixe 9:** 160 KB, sem dependência pesada.
- **Licença 10:** ISC.
- **Prova 7:** 3 regras de exemplo disparam os avisos certos (bloquear por antecedência; avisar 2º agendamento no dia; avisar feriado).

### 10) date-fns — **7,0**
- **Utilidade 4:** já temos cálculo de datas próprio e fuso (`timezone.ts`). Só ajuda no **financeiro** (dias úteis, vencimentos).
- **Maturidade 10:** 36,7 mil estrelas, versão 4.4.0.
- **Encaixe 9:** leve, só o que importar.
- **Licença 10:** MIT.
- **Prova 9:** locale `ptBR` pronto.

### 11) ts-pattern — **7,0**
Melhora a **manutenção** do motor (o compilador avisa se esquecemos um tipo de mensagem). 15,2 mil estrelas, 0,5 MB, MIT, ativo. Utilidade indireta (5).

---

## 3. O que as provas mostraram (resumo)

| Prova | Resultado |
|---|---|
| **Datas e horas em português** (16 frases): Recognizers × nosso | Recognizers **não devolveu nenhuma data+hora completa** (só horas soltas, em segundos); o **nosso acertou 15 das 16** (errou "quinze para as onze" **sem o "às"**: corrigível). **Manter o nosso analisador de datas.** |
| **Valores, dinheiro, unidades** (11 frases) | Recognizers acertou todas as principais, **inclusive por extenso**; nosso só pega valores digitados. **Aproveitar o Recognizers aqui.** |
| **Nomes com erro de digitação** (9 consultas): Fuse.js × nosso | Fuse acertou **9 de 9** (inclusive o apelido "bia" → Beatriz, com pontuação fraca); o **nosso 8 de 9** (não pega o apelido). Quase empate: o Fuse só vale se quisermos apelidos |
| **Feriados** (date-holidays, Brasil 2026) | Trouxe 12 nacionais (inclui as eleições de 04/10 e 25/10) e 1 estadual (SP: 09/07); **sem feriados municipais**; pacote de 13 MB; dados sob CC BY-SA |
| **Recorrência** (rrule) | Datas corretas; texto em inglês |
| **Telefone** (libphonenumber-js) | 6 de 7 formatos normalizados |
| **Propriedades** (fast-check) | 1.500 casos no nosso analisador, **0 falhas** |
| **Máquina de estados** (XState) | Fluxo correto; transição inválida ignorada |
| **Regras em JSON** (json-rules-engine) | Regras da empresa disparam como esperado |

**Nota sobre feriados:** os feriados nacionais são poucos e fixos (mais a Páscoa, que tem fórmula conhecida). **Recomendo uma tabela própria** com os nacionais e um campo para o dono cadastrar os **feriados da cidade dele** (a biblioteca não traz municipais). Fica sem 13 MB e sem a exigência de compartilhamento da licença CC BY-SA dos dados.

## 4. Pontos de atenção
- **Câmera (código de barras):** o site hoje **bloqueia a câmera** no cabeçalho de segurança (`camera=()`, por padrão). Para usar o leitor teremos de mudar para `camera=(self)` (como já fizemos com o microfone).
- **pg_trgm/unaccent** precisam de **migration** e do seu "Autorizo". Combina com o **ensaio** da migração para o servidor novo.
- **Recognizers** tem pacotes grandes: instalaríamos só os módulos de número e unidade e carregaríamos só no servidor.
- **Nada de IA entra:** todos os escolhidos funcionam por **regras, expressões regulares, matemática e dados**.

## 5. Como cada projeto se encaixa por módulo
| Módulo | O que melhora | Projetos |
|---|---|---|
| **Agendamento** | Recorrência, feriados, regras da empresa, diálogo organizado | rrule, tabela de feriados própria, json-rules-engine, XState, libphonenumber-js |
| **Estoque** | Entrada por frase ("entrada de 10 caixas do produto X"), leitura de código de barras, busca por nome | Recognizers (unidades), zxing, pg_trgm |
| **Produtos** | Preço por extenso, busca aproximada | Recognizers (dinheiro), pg_trgm |
| **Financeiro** | Valor por extenso, contas fixas recorrentes, dias úteis/vencimento | Recognizers (dinheiro), rrule, date-fns, currency.js (se necessário) |
| **Qualidade** | Testes de propriedades, dados fictícios | fast-check, faker |

## 6. Plano proposto (aguardando o seu "pode seguir")
1. **PR 1 (sem risco, só desenvolvimento):** instalar **fast-check** e **faker**; transformar as 3 propriedades da prova em testes permanentes; ampliar para valor, quantidade e estoque.
2. **PR 2:** **Recognizers (número e unidade)** dentro do motor: valor por extenso e quantidades ("duas caixas", "meio quilo"), com testes das 11 frases.
3. **PR 3:** **libphonenumber-js `/min`** no lugar da extração caseira de telefone.
4. **PR 4 (migration, "Autorizo"):** **pg_trgm + unaccent** e busca de produto.
5. **PR 5:** **rrule** para recorrência (agenda e contas fixas) e tabela de feriados (com cadastro do dono).
6. **Depois:** zxing (câmera), XState e json-rules-engine quando entrarem cancelar/reagendar e as regras por empresa.

> **Observação:** no dia 12/11 você avisou que **não mudaria mais nada no site** durante a migração do banco. Por isso **não instalei nada**. Quando você liberar, eu começo pelo PR 1.
