# Chat AI — projetos open source que podem melhorar o agente (levantamento atualizado, 14/11/2026)

**O que mudou desde o primeiro levantamento (11/11):** naquele dia o Chat AI era só planejamento. Hoje ele está no ar, passou por 3 baterias (120 + 200 conversas + testes reais em produção) e sabemos **onde ele falha de verdade**. Este documento escolhe projetos para **essas lacunas**, não para o que já resolvemos. Só pesquisa: **nada foi instalado nem alterado no site.**

**Método:** licença, estrelas, última atividade e arquivamento conferidos hoje na API do GitHub; licença lida no próprio arquivo `LICENSE` quando o GitHub não identificou (`NOASSERTION`). Afirmações sobre qualidade em português ou desempenho que não pude confirmar estão marcadas **"provar"**: são hipóteses a testar com as nossas 320 conversas antes de adotar.

---

## 1. Onde o agente falha hoje (o que precisamos resolver)

| # | Lacuna observada | Evidência |
|---|---|---|
| L1 | **Frase fora do que previmos** (cauda longa, jeito próprio de falar) cai em "não entendi" | Bateria de 200 conversas: cada rodada achou formas novas; sempre haverá mais |
| L2 | **Qualidade invisível**: só sabemos o que falha quando alguém reclama | `chat_feedback` existe, mas ninguém lê; sem painel de "não entendi" |
| L3 | **Voz**: só Chrome/Edge/Safari recente (iPhone e Firefox ficam sem), e o áudio vai para o Google | Decisão pendente de voz no servidor |
| L4 | **Sinônimos de serviço** ("limpeza interna" → "Higienização") | Hoje só por palavra parcial |
| L5 | **Telefone, apelidos e nomes parecidos** | "final 7777" já fizemos à mão; formatos variados são frágeis |
| L6 | **Canal**: o cliente final está no WhatsApp | Pedido natural, ainda não existe |
| L7 | **Manutenção do motor de diálogo** cresce (regras entrelaçadas) | `agenda-turn.ts` ~600 linhas |

---

## 2. Recomendações em ordem de valor (resumo)

| Prioridade | Projeto | Resolve | Licença | Esforço | Risco |
|---|---|---|---|---|---|
| **1** | **Vercel AI SDK** (`vercel/ai`) | L1 (reserva com LLM só para interpretar) | Apache-2.0 | Médio | Baixo se o LLM **só devolver campos** e nossas validações continuarem mandando |
| **2** | **promptfoo** (`promptfoo/promptfoo`) | L1/L2 (medir se o LLM ajuda de verdade) | MIT (agora parte da OpenAI; segue MIT) | Baixo | Baixo |
| **3** | **Speaches + faster-whisper** (voz no **seu** servidor) | L3 (iPhone/Firefox, privacidade) | MIT + MIT | Médio | Médio (depende do hardware) |
| **4** | **Transformers.js (Whisper no navegador)** | L3 sem servidor | Apache-2.0 | Médio | Médio (download pesado no celular) |
| **5** | **pgvector + modelo de embeddings multilíngue** | L4 (sinônimos por significado) | PostgreSQL + modelo (provar licença) | Médio | Baixo |
| **6** | **libphonenumber-js** + **brazilian-utils** | L5 (telefone/CPF em qualquer formato) | MIT + MIT | Baixo | Baixo |
| **7** | **LiteLLM** (porta de entrada dos modelos) | Limite e custo **por empresa**, trocar de modelo sem mexer no código | MIT (pasta `enterprise/` à parte) | Médio | Médio (mais uma peça no ar) |
| **8** | **XState** | L7 (organizar o diálogo como máquina de estados) | MIT | Médio-alto | Médio (refatoração) |
| 9 | Langfuse (rastreamento) | L2 em escala | MIT no núcleo; `ee/` à parte | Alto | Pesado de hospedar |
| 10 | assistant-ui | Polimento da tela | MIT | Baixo | Baixo |
| **Cuidado** | Evolution API, WAHA, Baileys, whatsapp-web.js | L6 (WhatsApp) | Variadas | — | **Risco de bloqueio do número** (não oficiais) |

---

## 3. Detalhe por tema

### 3.1 Entender frases novas: um LLM só como "tradutor de frase para campos" (L1)

**Ideia:** manter as regras como hoje (rápidas, grátis, previsíveis). **Só quando as regras não entenderem**, mandar a frase a um modelo de linguagem e pedir **somente um objeto com campos** (cliente, serviço, profissional, dia, hora, valor…). O objeto passa **pelas mesmas validações, pelo mesmo resumo e pelo mesmo Confirmar**. O modelo nunca grava, nunca decide e nunca vê outra empresa.

| Projeto | Licença | Atividade | Por que / por que não |
|---|---|---|---|
| **Vercel AI SDK** (`vercel/ai`) | Apache-2.0 (LICENSE conferida) | 14/11/2026, 28 mil ★ | **Melhor encaixe**: TypeScript, funciona em Next.js, saída estruturada com **zod** (já usamos), troca de modelo/fornecedor com uma linha |
| BAML (`BoundaryML/baml`) | Apache-2.0 | 15/11/2026, 9,5 mil ★ | Linguagem própria para prompts tipados. Bom, mas **adiciona uma linguagem e um passo de build** ao projeto. Só se o AI SDK não bastar |
| Instructor-js (`instructor-ai/instructor-js`) | MIT | **27/01/2025** | **Parado** há quase 2 anos: evitar |
| Outlines (`dottxt-ai/outlines`) | Apache-2.0 | 21/09/2026 | Garante saída válida em modelos locais, mas é **Python**: só se rodarmos modelo no servidor |
| DSPy (`stanfordnlp/dspy`) | MIT | 13/11/2026, 39 mil ★ | Otimiza prompts a partir de exemplos. **Python**; só depois que o fallback existir e tivermos muitas conversas rotuladas |

**Regras de segurança que eu impor (independente do projeto):**
1. O modelo recebe **só o texto da pessoa + nomes do catálogo** (serviços, profissionais), **nunca telefone, CPF, documento nem observações de clientes**.
2. Saída **só por schema zod**; o que não validar é descartado e vale o "não entendi".
3. **Observações e nomes vindos do banco nunca entram no prompt como instrução** (proteção contra injeção).
4. Limite por empresa e por dia (já existe `chat_usage.llm_calls/llm_tokens`, previsto desde o desenho).
5. **Modo sombra** primeiro: o LLM roda, mas só registramos o que ele teria entendido; comparamos com o que as regras fizeram.
6. **Decisão sua (privacidade):** modelo hospedado por terceiros (a frase sai da Prime Ges) **ou** modelo no seu servidor (nada sai, mas depende de hardware).

**Modelo no próprio servidor (opcional):** `ollama/ollama` (MIT), `ggml-org/llama.cpp` (MIT), `vllm-project/vllm` (Apache-2.0, pede GPU). Para extrair um objeto pequeno, modelos de 3 a 8 bilhões de parâmetros costumam bastar, mas **a velocidade em CPU sem GPU pode passar de vários segundos por mensagem: provar no hardware real**. Conferir a licença do **modelo** escolhido (famílias como Qwen e gpt-oss são distribuídas sob Apache-2.0; Gemma e Llama têm licenças próprias com restrições).

**Evitar:** frameworks de agente inteiros (Mastra, LangGraph.js, OpenAI Agents JS, LangChain.js, Haystack, Botpress, Rasa). Nosso fluxo é um **formulário conversacional com confirmação**, não um agente autônomo; esses frameworks trazem peso, mudanças frequentes e (no caso do Mastra) pastas `ee/` de licença à parte. **LlamaIndexTS está arquivado.**

### 3.2 Medir a qualidade (L2)

| Projeto | Licença | Observação |
|---|---|---|
| **promptfoo** | MIT | CLI que roda um conjunto de casos contra um modelo e compara. **Aproveitamos as 320 conversas que já temos** (120 + 200) para decidir com número se o LLM de reserva melhora e se piora algo. Atenção: **foi comprada pela OpenAI** (segue MIT); sem risco de uso, só acompanhar |
| DeepEval (`confident-ai/deepeval`) | Apache-2.0 | Python; mais métricas de LLM. Só se o promptfoo não bastar |
| **Langfuse** | MIT no núcleo (pastas `ee/` com outra licença) | Rastreamento de conversas com painel, hospedável por você. **Pesado** (traz vários serviços) e hoje seria exagero |
| Phoenix (`Arize-ai/phoenix`) | **Elastic License 2.0** (não é open source "de verdade") | Uso interno é permitido, mas há restrições: evitar |

**O que eu faria sem nenhum projeto novo (grátis e imediato):** um **painel simples no Admin** lendo `chat_messages`/`chat_feedback`: frases que terminaram em "não entendi", perguntas repetidas, taxa de resumo→Confirmar. É a lista de melhorias do mês.

### 3.3 Voz no seu servidor, sem Google (L3)

| Projeto | Licença | Atividade | Encaixe |
|---|---|---|---|
| **Speaches** (`speaches-ai/speaches`) | MIT | 14/11/2026 | Servidor **compatível com a API da OpenAI** para transcrição, usando faster-whisper; roda em Docker (CPU ou GPU); carrega e descarrega o modelo sozinho. **É o caminho mais curto**: o navegador grava, envia o áudio, recebe o texto |
| faster-whisper (`SYSTRAN/faster-whisper`) | MIT | 12/11/2026, 27 mil ★ | O motor por baixo do Speaches |
| whisper.cpp (`ggml-org/whisper.cpp`) | MIT | 13/11/2026, 55 mil ★ | Alternativa em C++, leve em CPU; tem servidor HTTP próprio |
| Silero VAD (`snakers4/silero-vad`) / `ricky0123/vad` (navegador, ISC) | MIT / ISC | 2026 | Detecta fala x silêncio: corta o silêncio antes de enviar e dá o "parou de falar" certo |
| sherpa-onnx (`k2-fsa/sherpa-onnx`) | Apache-2.0 | 13/11/2026 | Reconhecimento no dispositivo, inclusive no navegador (WASM). Provar pt-BR |

**Mudança de regra com o servidor novo:** a regra atual é "**nunca guardar o áudio**". Com Whisper no seu servidor o áudio **passa** pela sua máquina para ser transcrito. Mantemos a regra: **processar em memória, transcrever e descartar**, sem gravar em disco, e dizer isso na tela. **Vantagem de privacidade:** hoje o áudio vai ao Google; no seu servidor ele não sai da Prime Ges.

**Como medir (prova de 1 dia):** gravar 30 frases reais em pt-BR (celular Android, iPhone, ruído de oficina/salão), rodar no Web Speech (hoje) x Whisper `small`/`medium` no seu servidor, medir erro e tempo. **Só então** decidir.

**Alternativa sem servidor:** `huggingface/transformers.js` (Apache-2.0) roda Whisper **no navegador do cliente** (WASM/WebGPU): nada passa por nós. Custo: baixar dezenas a centenas de MB no primeiro uso e consumo de bateria. **Provar em celular médio.**

### 3.4 Sinônimos e significado (L4)

- **Rápido e sem dependência:** coluna `aliases` no serviço (apelidos que o dono cadastra: "limpeza", "faxina interna"). O próprio dono ensina; é o que eu recomendei antes.
- **Por significado (depois):** `pgvector` (licença PostgreSQL) guarda representações numéricas dos nomes de serviço/cliente e permite buscar o mais parecido **em significado**. Modelos de embeddings multilíngues (por exemplo da família e5) rodam no navegador via Transformers.js ou em servidor via `huggingface/text-embeddings-inference` (Apache-2.0). **Provar:** acerto em pt-BR e **licença do modelo escolhido**. O Supabase self-hosted já traz a extensão.
- **Fuse.js** (Apache-2.0) e **fuzzball.js** (MIT) servem para aproximar nomes; **já temos distância de edição própria** (`fuzzyEq`), então só valem se quisermos ranking mais fino. **double-metaphone** (MIT) é para som em inglês: não serve para português.

### 3.5 Telefone e documentos (L5)
- **`catamphetamine/libphonenumber-js`** (MIT, 10/11/2026, 3 mil ★): lê "11 99999-0000", "(11)99999-0000", "+55 11…" e normaliza. Substitui nosso `extractPhoneRef` caseiro.
- **`brazilian-utils/javascript`** (MIT, 04/11/2026): CPF, CNPJ, CEP e telefone com regras brasileiras. Útil quando o chat for cadastrar cliente.

### 3.6 WhatsApp (L6): atenção
| Projeto | Licença | Observação |
|---|---|---|
| **API oficial do WhatsApp Business (Cloud API, da Meta)** | não é open source | **O caminho seguro**: número verificado, modelos de mensagem, consentimento, custo por conversa |
| Evolution API (`evolution-foundation/evolution-api`) | **Apache-2.0 com condições adicionais** (ler antes: há condições para uso comercial) | Muito usada no Brasil; conecta por WhatsApp Web (**não oficial**) |
| WAHA (`devlikeapro/waha`) | Apache-2.0 | Idem, não oficial |
| Baileys (`WhiskeySockets/Baileys`) e whatsapp-web.js (`wwebjs/whatsapp-web.js`) | MIT / Apache-2.0 | Bibliotecas **não oficiais**; o número pode ser **banido** e viola os termos do WhatsApp |

**Minha recomendação:** quando chegar a hora, usar a **API oficial**. Os projetos não oficiais ficam como referência de funcionalidades, **não** para clientes pagantes.

### 3.7 Organizar o motor de diálogo (L7)
- **XState** (`statelyai/xstate`, MIT, 30 mil ★, ativo): máquinas de estado com **visualizador**. Nosso fluxo (`coletando → aguardando_confirmacao → …`) já é uma máquina; formalizar ajuda a testar e a explicar. **Refatoração grande:** só depois de cancelar/reagendar/cadastrar, porque aí o número de estados explode.
- **Antes disso** (sem dependência): dividir `agenda-turn.ts` em módulos por responsabilidade (cliente, serviço, profissional, hora, extras, consultas). Já está na ordem natural.

### 3.8 Porta de entrada para modelos (opcional)
**LiteLLM** (`BerriAI/litellm`, MIT; pasta `enterprise/` com licença própria): um proxy que fala a mesma língua com vários fornecedores/modelos, com **limite e orçamento por chave**, registro e *fallback*. Útil se um dia houver mais de um modelo ou quisermos **limite de gasto por empresa** sem código nosso. **Só entra junto com o LLM de reserva.**

---

## 4. O que eu **não** adotaria
| Projeto | Motivo |
|---|---|
| Rasa, Botpress, Mastra, LangChain.js, Haystack | Frameworks inteiros; nosso fluxo é pequeno e já funciona; trazem peso e mudanças |
| LLM Guard (`protectai/llm-guard`) e Rebuff (`protectai/rebuff`) | **Arquivados** |
| LlamaIndexTS | **Arquivado** |
| Instructor-js | Parado desde 01/2025 |
| Phoenix | Licença Elastic (não OSI) |
| NeMo Guardrails, Guardrails AI | Python e pesados; nossas **validações próprias + schema + níveis de risco (R0–R3)** já cumprem o papel |
| chrono-node | Já testamos na prova de conceito: nosso analisador de datas em português acerta mais |
| nlp.js | Parado desde 01/2025 |
| Projetos de WhatsApp não oficiais para clientes pagantes | Risco de banimento e de violar termos |

---

## 5. Plano sugerido (sem mudar nada hoje)

1. **Semana 1 (sem dependência nova):** painel no Admin de "frases que não entendi" + corte de `agenda-turn.ts` em módulos + `aliases` no serviço (migration pequena, com o seu "Autorizo").
2. **Semana 2 (prova):** **promptfoo** com as 320 conversas, comparando **regras sozinhas × regras + LLM** (modelo hospedado, em modo sombra). Resultado em número.
3. **Semana 3 (prova de voz):** 30 frases reais: Web Speech × Whisper no **seu** servidor (Speaches). Decisão sobre iPhone/Firefox.
4. **Depois:** se o LLM de reserva ganhar, **Vercel AI SDK** em produção, com limite por empresa; avaliar LiteLLM e modelo local conforme o hardware que você montar.
5. **Telefone:** trocar a extração caseira por `libphonenumber-js` junto com a função "cadastrar cliente".

## 6. Decisões que dependem de você
1. **Privacidade do LLM de reserva:** aceita enviar a frase (sem telefone/CPF) a um fornecedor, ou só modelo no seu servidor?
2. **Hardware do servidor novo:** tem GPU? Isso decide se vale modelo local e Whisper `medium`.
3. **Voz:** topa a regra "áudio passa pelo seu servidor, só em memória, sem gravar"?
4. **WhatsApp:** só pela API oficial?
5. **Orçamento mensal** para o LLM de reserva (para eu configurar o limite).
