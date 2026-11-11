# Levantamento de projetos open source — Chat AI (só planejamento)

Objetivo: em vez de criar tudo do zero, listar o que dá para **aproveitar e integrar** na futura aba Chat AI (ver `PLANEJAMENTO_CHAT_AI_BOTS_2026-11-11.md`). **Nada foi implementado nem instalado.**

Como foi levantado: licença, estrelas e última atividade conferidas hoje (11/11/2026) na API do GitHub; capacidades conferidas nos diretórios/README dos próprios repositórios. A busca na web estava indisponível, então o que não deu para confirmar está marcado **"provar"** (verificar numa prova de conceito antes de decidir). Estrelas são só sinal de adoção, não de qualidade.

Critérios: (1) licença permissiva (MIT/Apache/BSD/ISC) para uso comercial; (2) funciona em **português do Brasil**; (3) roda no nosso ambiente (Next.js na Vercel, Supabase), sem servidor 24h; (4) mantido (atividade recente); (5) não cria caminho paralelo de gravação (as ações continuam nas RPCs atuais).

## 1. Entender datas, horas e valores em português (o coração do bot sem LLM)
| Projeto | Licença | Atividade | Português | Encaixe |
|---------|---------|-----------|-----------|---------|
| **chrono** (`wanasit/chrono`, chrono-node) | MIT | 03/11/2026, 5,3 mil ★ | Tem locale `pt` | **Forte candidato.** Biblioteca JS pura, roda no servidor Next. "amanhã às 14h", "sexta", "dia 15". Provar: "duas da tarde", "depois de amanhã", fuso São Paulo |
| **Microsoft Recognizers-Text** | MIT | 17/04/2026, 1,8 mil ★ | `portugueseDateTime` no pacote JS (`recognizers-date-time`) e pasta Portuguese nas especificações | **Candidato forte para números/moedas/datas** ("cento e cinquenta reais"). Pacotes JS separados (`recognizers-number`, `recognizers-number-with-unit`). Provar: cobertura de número por extenso e moeda em pt-BR |
| **Duckling** (`facebook/duckling`, hoje `meta/duckling`) | BSD | 15/03/2026, 4,3 mil ★ | Tem Tempo em PT (`Duckling/Time/PT`) e dimensões PT | Muito completo, mas é **servidor Haskell**: exigiria hospedar um serviço à parte (não cabe na Vercel). **Plano B** se chrono + Recognizers não bastarem |
| compromise (`spencermountain`) | MIT | 09/11/2026, 12 mil ★ | Foco em inglês | Não serve para pt-BR como base |
| wink-nlp, natural (`NaturalNode`) | MIT | 2026 | Suporte a português limitado/irregular | Só para utilitários (tokenização, stemming); **provar** se compensa |

**Recomendação:** chrono (datas) + Recognizers-Text (números e valores), ambos em TypeScript no servidor, com um corpus de frases nossas para medir acerto. Duckling só se os testes reprovarem.

## 2. Motor de intenção / diálogo (decidir "o que a pessoa quer" e "o que falta")
| Projeto | Licença | Situação | Encaixe |
|---------|---------|----------|---------|
| **Rasa Open Source** | Apache-2.0 | **Modo manutenção** (declarado no README); ecossistema empurra para o produto pago Rasa Pro | **Não recomendado**: Python, pesado, servidor próprio, em manutenção |
| Botpress (`botpress/botpress`) | MIT | Ativo | Plataforma completa e própria; para nós é grande demais e traz seu próprio banco/painel. Só como referência |
| snips-nlu | Apache-2.0 | Sem atualização desde 2023 | Descartado |
| nlp.js (`axa-group/nlp.js`) | MIT | Último push 01/2025 | Tem português e classificador de intenção em JS, mas está parado. **Provar** como motor de intenção leve; alternativa é regra própria |
| Microsoft Bot Framework SDK | MIT | Último push 12/2025 | Gestão de diálogo; pesado e voltado ao ecossistema Azure |
| **LangGraph.js** (`langchain-ai/langgraphjs`) | MIT | Ativo | Máquina de estados com pausa para aprovação humana; faz sentido **só se** entrarmos com LLM. Para regras, uma máquina de estados simples (XState) basta (XState: **não levantado aqui, provar**) |

**Recomendação:** **não adotar um framework de bot inteiro.** Escrever um motor pequeno nosso (registro de intenções + validador + máquina de estados) e **emprestar só as bibliotecas de extração** da seção 1. É pouco código, e dá controle total sobre as regras de negócio, permissões e a confirmação.

## 3. Voz (transcrição de áudio)
| Projeto | Licença | Atividade | Encaixe |
|---------|---------|-----------|---------|
| **Web Speech API** (do navegador, não é projeto OSS) | — | padrão do navegador | Custo zero, nada no servidor; qualidade e suporte variam (**provar** em Android e iPhone) |
| **Transformers.js** (`huggingface/transformers.js`) | Apache-2.0 | 11/11/2026, 16 mil ★ | Roda **Whisper no navegador** (WASM/WebGPU), privado, sem servidor. Provar: tamanho do download, velocidade em celular médio, qualidade em pt-BR |
| **whisper.cpp** (`ggml-org/whisper.cpp`) | MIT | 10/11/2026, 55 mil ★ | Tem exemplos `whisper.wasm`, `stream.wasm` e `server`. É a opção do PDF (servidor local); na Vercel só via WASM no navegador ou serviço externo |
| **faster-whisper** (`SYSTRAN`) | MIT | 10/11/2026, 26 mil ★ | Rápido, mas Python e CPU/GPU: exige **servidor próprio** |
| **sherpa-onnx** (`k2-fsa`) | Apache-2.0 | 11/11/2026, 15 mil ★ | Reconhecimento no dispositivo, inclui WASM; **provar** pt-BR e tamanho dos modelos |
| **Vosk** (`alphacep/vosk-api`) | Apache-2.0 | 15/10/2026, 15 mil ★ | Offline, tem português; modelos pequenos, mas qualidade inferior ao Whisper |
| openai/whisper | MIT | 112 mil ★ | O modelo original; usamos via variantes acima |
| @ricky0123/vad | ISC | 12/09/2026 | Detecta quando a pessoa começa/para de falar no navegador; bom complemento do microfone |
| react-speech-recognition | MIT | último push 06/2025 | Só um envoltório do Web Speech API; dá para chamar direto |
| DeepSpeech (Mozilla) | MPL-2.0 | **arquivado** | Descartado |

**Recomendação:** começar com Web Speech API (zero custo) e fazer uma prova de conceito de **Transformers.js com Whisper no navegador** como segunda etapa. Servidor próprio (whisper.cpp/faster-whisper) só se um dia houver infraestrutura para isso. A API hospedada (não OSS) continua sendo a rota de melhor qualidade, com aviso de privacidade.

## 4. Tela de conversa
| Projeto | Licença | Atividade | Encaixe |
|---------|---------|-----------|---------|
| **assistant-ui** | MIT | 11/11/2026, 13 mil ★ | Componentes React de chat (mensagens, entrada, anexos, **ações com aprovação**). Aceita fonte de dados própria — **provar** se encaixa no nosso estado de rascunho, sem depender de LLM |
| **CopilotKit** | MIT | 11/11/2026, 38 mil ★ | Copiloto dentro do app com ações; voltado a agentes com LLM, mais pesado |
| Vercel AI SDK (`vercel/ai`) | Apache-2.0 (arquivo LICENSE confere) | 11/11/2026, 28 mil ★ | Hooks de chat e ferramentas com aprovação; útil **se** usarmos LLM como fallback |
| Vercel Chatbot (`vercel/chatbot`) | Apache-2.0 | 03/11/2026, 21 mil ★ | Modelo de projeto Next.js com chat e histórico: serve de **referência de estrutura**, não para copiar |
| NextChat (`ChatGPTNextWeb`) | MIT | 20/10/2026, 89 mil ★ | App de chat pronto para LLMs; referência de UX, não de integração |
| Mastra (`mastra-ai/mastra`) | Mista (pastas `ee/` com licença própria) | 11/11/2026 | Framework de agentes; **licença mista pede cuidado**, e é voltado a LLM |

**Recomendação:** usar **componentes shadcn/Radix que já temos** para o MVP (a conversa é simples) e avaliar assistant-ui só se a tela crescer. Evita dependência nova para algo pequeno.

## 5. Busca por tags / nomes aproximados
| Opção | Licença | Encaixe |
|-------|---------|---------|
| **Postgres `pg_trgm` + `unaccent`** (extensões do próprio banco) | PostgreSQL | **Primeira escolha**: busca no banco, respeita a empresa (RLS), sem biblioteca nova. **Provar** que as extensões estão ativas em Production e TEST |
| **Fuse.js** (`krisk/Fuse`) | Apache-2.0 | 09/08/2026, 20 mil ★ | Busca aproximada no navegador/servidor sobre lista pequena já carregada (ótimo para escolher entre poucos candidatos) |
| FlexSearch, MiniSearch | Apache-2.0 / MIT | 06/2026 e 09/2025 | Índices em memória; só se a lista for grande. Não necessários agora |

## 6. Plano B com LLM (só se um dia fizer falta)
| Projeto | Licença | Observação |
|---------|---------|-----------|
| Ollama (`ollama/ollama`) | MIT | Roda modelos locais; exige servidor próprio (já descartado pelo PDF como principal) |
| llama.cpp (`ggml-org/llama.cpp`) | MIT | Base do anterior |
| Vercel AI SDK | Apache-2.0 | Camada para chamar qualquer modelo, local ou hospedado |

Fica fora do MVP, como no PDF.

## 7. Montagem sugerida (o que aproveitamos x o que escrevemos)
| Peça | Aproveitar | Escrever nosso |
|------|-----------|----------------|
| Datas e horas | chrono (pt) | Regras de fuso São Paulo e de "dia sem expediente" (usar `src/lib/timezone.ts`) |
| Valores e quantidades | Recognizers-Text (+ `parseMoneyInput` que já temos) | Mapeamento para forma de pagamento |
| Intenção e campos obrigatórios | — | Registro de intenções + validador + máquina de estados |
| Tags e nomes | `pg_trgm`/`unaccent`; Fuse.js para desambiguar | Coluna `aliases` e telas de cadastro |
| Voz | Web Speech API → Transformers.js (Whisper) | Botão de microfone e fluxo de correção |
| Tela | Componentes atuais (shadcn/Radix); assistant-ui a avaliar | Cartão de confirmação e links para perfis |
| Gravação | **RPCs que já existem** | Executores finos que chamam as RPCs |

## 8. Provas de conceito antes de decidir (cada uma é pequena e descartável)
1. **Corpus de 100 frases reais** (agendar, despesa, estoque) rodado em chrono e Recognizers-Text: medir % de acerto de data, hora, valor e número por extenso.
2. **Whisper no navegador** (Transformers.js): tamanho do download, tempo de resposta e acerto de pt-BR em dois celulares reais.
3. **Web Speech API** em Chrome/Android e Safari/iPhone.
4. **`pg_trgm`/`unaccent`** no TEST: acerto de "Lucio" = "Lúcio", "Felipe" entre vários clientes parecidos.
5. **assistant-ui** (só se formos usar): ligar a um estado de rascunho fixo, sem LLM.

## 9. Riscos de dependência
- Projetos sem atualização recente (nlp.js, snips-nlu, react-speech-recognition) ou arquivados (DeepSpeech): evitar como base.
- Rasa em manutenção: não construir sobre ele.
- Licença mista (Mastra) e `NOASSERTION` no GitHub: ler o arquivo LICENSE antes de adotar (conferi vercel/ai, vercel/chatbot, duckling e ricky0123/vad: Apache-2.0, Apache-2.0, BSD e ISC).
- Modelos de voz (Whisper) têm licença própria do modelo além da do código: conferir antes de distribuir.
- Cada dependência nova entra por PR, com `npm audit` e justificativa, seguindo a regra do projeto de não instalar o que não for necessário.
