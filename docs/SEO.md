# SEO e presença em buscas com IA

## Situação encontrada em 25/11/2026

- A busca `site:primeges.com.br` no Google não retornou nenhuma página.
- O `robots.txt` no ar recebe um bloco do **Cloudflare** que proíbe os "agentes de IA" (ChatGPT-User, Perplexity-User, Claude-User, Google-Agent, NotebookLM, MistralAI-User e outros): são os que abrem o site quando alguém pergunta a um assistente.
- `http://` e `www.` respondiam sem redirecionar.

## O que o código faz

- `/duvidas` e uma página por pergunta (`src/content/duvidas.ts`): resposta direta, orientação útil, como o Prime Ges resolve e, quando muda a escolha, o que ele não faz.
- `/perguntas` redireciona para `/duvidas`.
- `www` e `http` redirecionam para `https://primeges.com.br`.
- Títulos com os termos buscados, descrição única por página, canonical, sitemap com data real e dados estruturados (trilha e artigo).

## O que só o dono da conta faz

1. **Google Search Console** (search.google.com/search-console): propriedade *Prefixo do URL* `https://primeges.com.br/`, verificada por *Arquivo HTML* (já está no site). Depois, enviar `sitemap.xml` em *Sitemaps* e pedir a indexação da home e de `/duvidas` em *Inspeção de URL*.
2. **Cloudflare**: domínio → *Security* → *Settings* → filtro *Bot traffic* → *AI Crawler and Agent access policies* → deixar **Agent** e **Search** como *Allow* e salvar. Depois, conferir que o `robots.txt` não tem mais o bloco "AI Agents". *Training* é escolha do dono (usar ou não o conteúdo para treinar modelos).
3. **Bing Webmaster Tools** (bing.com/webmasters): importar do Search Console. O Bing também alimenta buscas de assistentes de IA.

A verificação usa o arquivo `public/google73ccdd603c590fb0.html` (propriedade "Prefixo do URL" `https://primeges.com.br/`). Ele precisa continuar no site.

## O que esperar

Indexação e posição não são garantidas e costumam levar de dias a semanas (posição competitiva, meses). A [orientação do Google sobre recursos de IA](https://developers.google.com/search/docs/appearance/ai-features?hl=pt-br) diz que não há arquivo nem marcação especial: a página precisa estar indexada, com conteúdo útil em texto e links internos. Por isso não há `llms.txt` nem marcação de FAQ.

## Pesquisa que originou as perguntas (Google, 25/11/2026)

| Busca | Perguntas exibidas |
|---|---|
| sistema para pequenas empresas | Qual o melhor sistema ERP para pequenas empresas? · Quanto custa um ERP? · Qual o melhor ERP gratuito? · Tiny ou Bling? |
| qual o melhor sistema para pequenas empresas | Qual o sistema mais usado? · SAP ou TOTVS? |
| saas o que é | São exemplos de SaaS? · A Netflix é um SaaS? · O Spotify é um SaaS? |
| saas para pequenas empresas vale a pena | Qual o melhor software de gestão? · Margem de lucro de um SaaS? |
| sistema de gestão para mei | Qual o melhor sistema para MEI? · Qual ERP gratuito é bom para MEIs? |
| como controlar estoque | Como fazer um controle de estoque simples? |
| como controlar o fluxo de caixa | Como fazer um fluxo de caixa simples? · Quatro itens principais? |
| como fazer controle de vendas | Como fazer controle financeiro de uma pequena empresa? |

Sugestões de busca também usadas: sistema para pequenas empresas gratuito, sistema financeiro, o que é SaaS, controle de vendas no caderno/Excel, sistema para lava-rápido, sistema para mercadinho.

Ficaram de fora comparações com marcas (Tiny × Bling, SAP × TOTVS) e perguntas de quem quer criar um SaaS (margem, preço de venda).

## Ao criar uma dúvida nova

Adicionar em `src/content/duvidas.ts` (o teste `tests/unit/duvidas.test.mjs` confere tamanho de título e descrição, ligações e promessas indevidas) e atualizar `DOUBTS_UPDATED_AT`. Poucas páginas boas valem mais que muitas repetidas: o Google trata produção em massa sem valor como spam.
