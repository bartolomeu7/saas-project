# Levantamento e planejamento — função Orçamento (PDF) (21/11/2026)

Pedido: uma função em que a empresa monta um **orçamento para um cliente** e entrega em **PDF**, feita dentro do Prime Ges. Este documento é só
**levantamento e planejamento**: nada foi criado, instalado ou alterado no sistema. Também procurei projetos open source que possam servir de
base, e dou **nota de 0 a 10** a cada um.

> **Como a pesquisa foi feita.** A busca na web da ferramenta estava indisponível nesta sessão. Os dados dos projetos (licença, estrelas, último
> commit, se está arquivado, README, dependências) foram lidos **direto do GitHub e do registro do npm**, em 21/11/2026. Não instalei nem rodei nenhum
> projeto: as notas são de leitura técnica (licença, stack, atividade, funcionalidades descritas), não de teste na prática.

## 1. Resumo e recomendação

1. **Não existe um projeto "pronto para baixar e usar" que sirva como está.** Os sistemas completos de orçamento/fatura open source são em PHP ou Python
   (outra stack, outro banco, outro login) e boa parte tem licença que atrapalha um SaaS (AGPL, Elastic, BSL). Trazer um deles seria **manter um segundo sistema**
   ao lado do Prime Ges, sem usar nossos clientes, produtos, serviços e vendas.
2. **O que dá para aproveitar de verdade é a parte do PDF e dos modelos visuais**, em licença livre (MIT/Apache) e na nossa stack (Next.js + TypeScript + React 18):
   - **Invoify** (MIT, Next.js 15 + TypeScript + React 18 + zod + shadcn/ui, 13 modelos de documento, **português do Brasil**, PDF real): é o mais próximo de
     "chegar, baixar, instalar e modelar a nosso gosto". É gerador de **fatura sem banco de dados**, então serve de base de **modelos e tela**, não do sistema inteiro.
   - **@react-pdf/renderer** (MIT, aceita React 18 e 19, 16,8 mil estrelas, ativo em nov/2026): gera o PDF no servidor Node **sem navegador**. É o motor que o **Midday**
     (Next.js + Supabase, mesmo tipo de stack nossa) usa para as faturas dele.
   - **Gotenberg** (MIT, contêiner Docker): transforma HTML em PDF com qualidade de navegador, num serviço separado. Combina com os modelos HTML do Invoify.
3. **Recomendação:** construir o Orçamento **dentro do Prime Ges** (reaproveitando clientes, produtos, serviços, vendas, permissões e auditoria), com **@react-pdf/renderer**
   no MVP, usando o **Invoify como referência de modelos e do formulário**. Guardar o **Gotenberg** como plano B se quisermos liberdade total de layout em HTML/CSS.
4. **Pré-requisito que aparece no levantamento:** a tela Empresa só tem nome e segmento. Um orçamento profissional precisa de **logo, CNPJ/CPF, telefone, e-mail e endereço** da empresa.
   Isso vira a **Fase 0** do plano.

## 2. O que o sistema já tem e o orçamento reaproveita

| Peça | Situação hoje | Uso no orçamento |
|---|---|---|
| Clientes | nome, documento, telefone, WhatsApp, e-mail, endereço completo | destinatário do orçamento (com cópia dos dados no momento da emissão) |
| Produtos e serviços | preço de venda, custo, unidade, duração (serviço), categorias, busca sem acento | itens do orçamento (com preço editável por linha) |
| Vendas | `sales` e `sale_items` (rascunho/concluída/cancelada, descontos, margem) | **converter orçamento aprovado em venda** sem redigitar |
| Agenda | agendamento a partir de serviço | (fase futura) orçamento de serviço que já gera o agendamento |
| Empresa | **só nome e segmento**; tabela `company_settings` existe sem tela | precisa de **dados cadastrais e logo**; `company_settings` pode guardar validade e condições padrão |
| Permissões | matriz de papéis (`src/lib/permissions/matrix.ts`) | novas permissões de orçamento (ver, criar, aprovar desconto) |
| Auditoria | `audit_logs` e `write_platform_audit_log` | registrar emissão, envio, aprovação, recusa |
| Numeração | padrão já usado em compras (`PC-AAAAMMDD-XXXXXX`) | número sequencial legível por empresa (`ORC-2026-0001`) |
| Planos e limites | entitlements por assinatura | (opcional) limite de orçamentos por mês por plano |
| Impressão | telas de impressão em HTML (`window.print`) na Agenda e no RH | **não serve** como PDF de orçamento: depende do navegador e não é anexável |
| PDF no servidor | nenhum (não há biblioteca de PDF nas dependências) | escolher o motor (seção 5) |
| Armazenamento de arquivos | o servidor local **não tem serviço de arquivos** (só banco, API, gateway, site e túnel) | logo da empresa: guardar pequeno no banco (até ~500 KB) no MVP; PDF gerado na hora e cacheado |
| Envio | WhatsApp por link `wa.me` é viável; **e-mail ainda não foi testado/configurado** | WhatsApp primeiro; e-mail depois de resolver o envio |
| Chat AI | agenda por conversa | (fase futura) "faça um orçamento de corte e barba para o João" |

## 3. Escopo funcional proposto

**MVP (Fase 1)**
- Lista de orçamentos com busca, filtro por situação e cliente; cartões de resumo (abertos, aprovados, valor em aberto).
- Criar/editar: cliente (existente ou avulso), data, **validade** (padrão 15 dias), itens (produto, serviço ou linha livre) com quantidade, preço, desconto por linha e desconto geral,
  **condições de pagamento**, observações, prazo de entrega/execução. Total e subtotal calculados no servidor.
- Situações: **Rascunho → Enviado → Aprovado / Recusado / Expirado**, e **Convertido em venda**. Orçamento enviado fica **congelado** (editar cria uma nova revisão), para o PDF
  entregue ao cliente nunca mudar.
- **PDF** com logo, dados da empresa, dados do cliente, tabela de itens, totais, validade, condições, assinatura/aceite em branco e número do orçamento. Baixar e visualizar.
- **Duplicar** orçamento, número sequencial por empresa e por ano, auditoria, permissões.

**Fase 2 (o que dá "up" no sistema)**
- **Link público** do orçamento (endereço com código impossível de adivinhar, com validade): o cliente vê o orçamento no celular e toca em **Aprovar** ou **Recusar** (com motivo).
- **Enviar por WhatsApp** (mensagem pronta com o link e o PDF) e por e-mail.
- **Converter em venda** em um clique (itens, preços, desconto e cliente), com a venda ligada ao orçamento.
- 2 a 3 **modelos de PDF** (clássico, moderno, compacto) e cor/logo da empresa; textos padrão de condições por empresa.
- Expiração automática pela validade e lembrete de orçamentos parados ("enviado há 3 dias, sem resposta").

**Fase 3 (diferenciais)**
- Aceite com **assinatura digital** (ver Documenso na seção 6), orçamento de serviço que **gera o agendamento**, intenção no **Chat AI**, relatório de **taxa de conversão** e ticket médio
  de orçamentos, modelos de orçamento reaproveitáveis (pacotes de serviços), anexos e fotos.

## 4. Modelo de dados proposto (migrations novas, com script de volta)

- `quotes`: `id`, `company_id`, `number` (único por empresa e ano), `revision`, `status`, `customer_id` (opcional) + **cópia dos dados do cliente** (nome, documento, contato, endereço) para o PDF não mudar
  se o cadastro mudar, `issued_on`, `valid_until`, `subtotal`, `discount_amount`, `total_amount`, `payment_terms`, `delivery_terms`, `notes`, `sale_id` (ao converter), `public_token_hash`,
  `sent_at`, `approved_at`, `rejected_at`, `rejection_reason`, `created_by`.
- `quote_items`: `quote_id`, `position`, `item_type` (produto/serviço/livre), `product_id`/`service_id` opcionais, `description`, `unit`, `quantity`, `unit_price`, `discount_amount`, `total_amount`.
- `quote_events` (histórico): criado, enviado, visualizado, aprovado, recusado, convertido, com data e origem.
- Empresa: colunas de cadastro (razão social, CNPJ/CPF, telefone, e-mail, endereço, logo pequeno) e padrões do orçamento em `company_settings` (validade, condições, rodapé).
- Segurança: RLS por empresa em todas as tabelas, escrita só por funções `SECURITY DEFINER` (padrão do projeto), numeração com trava para não repetir número em duas telas ao mesmo tempo,
  leitura pública **só** pela função do link (retorna apenas o conteúdo do orçamento, nunca dados de outras empresas), código do link guardado como hash.

## 5. Como gerar o PDF (opções comparadas)

| Opção | Como funciona | Vantagens | Cuidados |
|---|---|---|---|
| **@react-pdf/renderer** (recomendada para o MVP) | componentes React viram PDF no servidor | sem navegador, leve, roda no nosso Node, mesmo caminho do Midday, texto selecionável, React 18 ok | layout próprio (flex), não é HTML/CSS completo; precisa registrar a fonte para acentos e símbolos |
| **Gotenberg** (plano B) | contêiner que recebe HTML e devolve PDF | qualidade de navegador, aproveita modelos HTML (inclusive os do Invoify), serviço isolado | mais um contêiner para manter, memória quando em uso |
| **Puppeteer** (navegador dentro do site) | o site abre Chromium e imprime a página | fidelidade total ao HTML/CSS | Chromium engorda a imagem em centenas de MB, mais memória, mais frágil no contêiner |
| **pdfmake** | PDF por definição em JSON | bom para tabelas, sem navegador | sem React; modelos menos agradáveis de manter |
| **Typst** | linguagem de composição de texto | tipografia excelente | outra ferramenta e outra linguagem de modelo para a equipe |
| PDFKit / pdf-lib / jsPDF | desenho de baixo nível | controle total | muito trabalho manual; pdf-lib sem manutenção desde 2024 |

Cuidados de qualquer opção: guardar o PDF (ou o resumo dele) por **revisão** e reaproveitar quando nada mudou; limite de geração por empresa; fonte com acento; teste que gera o PDF e confere
número, total e nome do cliente no texto extraído.

## 6. Projetos open source avaliados (nota de 0 a 10)

**Como a nota foi calculada** (ponto de partida para o *nosso* orçamento): Licença para usar num SaaS fechado 25% · Encaixe técnico (Next.js/TypeScript/React 18/Postgres/Docker) 25% ·
Esforço para "baixar e modelar" 20% · Manutenção (atividade em 2026) 15% · Qualidade do orçamento/PDF 10% · Brasil (português, real) 5%. Dados do GitHub em 21/11/2026.

### 6.1 Bibliotecas e serviços de PDF
| Projeto | Licença | Estrelas | Último commit | Nota | Comentário |
|---|---|---:|---|:--:|---|
| **Gotenberg** | MIT | 13,6 mil | 20/11/2026 | **8,7** | HTML→PDF em contêiner isolado; plano B ideal |
| **@react-pdf/renderer** | MIT | 16,9 mil | 16/11/2026 | **8,7** | motor recomendado; React 16.8 a 19; v4.9.0 |
| **Puppeteer** | Apache-2.0 | 95,9 mil | 20/11/2026 | 8,2 | melhor fidelidade, mas Chromium dentro do site pesa |
| **pdfmake** | MIT | 12,4 mil | 20/11/2026 | 7,9 | sólido para tabelas; sem React |
| **Typst** | Apache-2.0 | 57,3 mil | 20/11/2026 | 7,3 | tipografia excelente; ferramenta e linguagem novas |
| PDFKit | MIT | 10,7 mil | 20/11/2026 | 6,9 | baixo nível |
| jsPDF | MIT | 31,3 mil | 14/11/2026 | 6,8 | feito para o navegador, layout limitado |
| pdf-lib | MIT | 8,7 mil | **17/07/2024** | 5,9 | sem manutenção há mais de 2 anos |

### 6.2 Projetos com orçamento/fatura (base ou referência)
| Projeto | Licença | Stack | Estrelas | Último commit | Nota | Veredito |
|---|---|---|---:|---|:--:|---|
| **Invoify** | **MIT** | Next.js 15, TypeScript, React 18, zod, shadcn/ui, Puppeteer | 6,4 mil | 24/08/2026 | **8,4** | **melhor base de modelos e formulário**; 13 modelos, português do Brasil, e-mail, exporta JSON/CSV/XML. É de fatura e **sem banco**: aproveitar modelos e tela, não o sistema |
| Documenso | AGPL-3.0 | TypeScript | 15,8 mil | 20/11/2026 | 6,3 | **assinatura digital** (não é orçamento); como serviço separado serve para a Fase 3; não copiar código (AGPL) |
| MapOS | Apache-2.0 | PHP | 1,1 mil | 16/11/2026 | 6,1 | sistema **brasileiro** de ordens de serviço, orçamentos e vendas; ótima **referência de funcionalidades** para o mercado BR, mas outra stack |
| SolidInvoice | MIT | PHP (Symfony) | 1,0 mil | 20/11/2026 | 5,8 | orçamentos e faturas com portal do cliente; licença boa, stack errada |
| Midday | AGPL-3.0 | Next.js, TypeScript, Supabase, **@react-pdf/renderer** | 15,1 mil | 13/06/2026 | 5,8 | stack parecida com a nossa e faturas bem feitas; **AGPL** impede copiar código para um SaaS fechado; só referência de interface (parado há 5 meses) |
| Odoo Community | LGPL-3.0 | Python | 56 mil | 21/11/2026 | 5,3 | cotações muito completas, mas é um ERP gigante (outro sistema) |
| Dolibarr | GPL-3.0 | PHP | 7,9 mil | 20/11/2026 | 5,2 | "propostas comerciais" com modelos PDF e uso no Brasil; sistema à parte |
| Bigcapital | AGPL-3.0 | TypeScript | 4,2 mil | 20/11/2026 | 5,0 | contabilidade com estimativas; AGPL e foco diferente |
| InvoicePlane | MIT com marca registrada | PHP | 3,3 mil | 18/11/2026 | 4,9 | orçamentos e faturas, base antiga |
| ERPNext | GPL-3.0 | Python (Frappe) | 41,5 mil | 21/11/2026 | 4,9 | "Quotation" completo, mas é ERP inteiro |
| InvoiceShelf | AGPL-3.0 | PHP (Laravel) + Vue | 2,1 mil | 15/11/2026 | 4,8 | estimativas e faturas com PDF; a versão 3.x é **alfa**; AGPL |
| Invoice Ninja | Elastic License 2.0 | PHP + Flutter | 10,6 mil | 20/11/2026 | 4,8 | o mais completo (orçamento, portal, recorrência), mas a licença **proíbe oferecer como serviço**; stack errada |
| Akaunting | Business Source License | PHP | 10,3 mil | 20/11/2026 | 4,0 | código "disponível" com restrições e módulos pagos |

Observações sobre as licenças: **MIT e Apache-2.0** podem entrar no nosso código sem obrigação de abrir o Prime Ges. **AGPL** obriga a abrir o código de quem oferece o programa pela internet:
só deve ser **usada como serviço separado e sem modificar**, nunca misturada ao nosso código. **Elastic 2.0** e **BSL** restringem uso comercial como serviço. **GPL/LGPL** servem para sistemas separados, não para copiar trechos.
Crater (bytefury) foi descartado: não recebe commit desde 10/08/2024.

## 7. Arquitetura recomendada

```
Tela de orçamento (Next.js, formulário com cálculo ao vivo)
   └─ Server Action → função SECURITY DEFINER no banco (valida empresa, papel, itens, totais, número)
Rota /app/orcamentos/[id]/pdf  (Node, permissão orçamentos.ver)
   └─ lê orçamento + empresa → @react-pdf/renderer → PDF (cache por revisão)
Link público /o/[código]  (sem login, código aleatório com validade, limite de acessos por IP)
   └─ função pública devolve só o orçamento → página + botão Aprovar/Recusar → evento + aviso ao dono
Converter em venda → RPC única cria venda e itens e liga ao orçamento
```
Caminho alternativo (plano B): trocar só o passo do PDF por HTML + Gotenberg, mantendo todo o resto.

## 8. Plano de execução

| Fase | Entrega | Esforço estimado* | Banco |
|---|---|---|---|
| 0 | Dados da empresa (razão social, CNPJ, telefone, e-mail, endereço, **logo**), padrões do orçamento em `company_settings` | 1 a 1,5 dia | sim |
| 1 | MVP: tabelas, lista, criar/editar, totais, números, situações, **PDF** com 1 modelo, duplicar, permissões, auditoria, testes | 4 a 6 dias | sim |
| 2 | Link público + aprovar/recusar, WhatsApp e e-mail, converter em venda, 2–3 modelos, expiração e lembretes | 3 a 4 dias | sim |
| 3 | Assinatura digital (Documenso como serviço), orçamento que gera agendamento, Chat AI, relatórios de conversão | 3 a 5 dias | pouco |

\*Dias de trabalho de desenvolvimento, estimativa aproximada que muda com as decisões da seção 10.

**Testes previstos em cada fase**: unitários (totais, arredondamento em centavos, situações permitidas, numeração), bateria SQL em transação revertida (RLS entre empresas, número sem repetir
em acessos simultâneos, link público não vaza nada), teste do PDF (gera e confere número, total e cliente no texto), e **35 rodadas reais por módulo** como nas séries anteriores.
**Publicação**: com `scripts\publicar.ps1` (backup antes das migrations, teste de fumaça e volta automática). **Manutenção**: nenhuma das fases exige bloqueio total do sistema.

## 9. Riscos e cuidados

- **Preço mudou depois do envio**: o orçamento guarda os preços na emissão; editar um enviado cria revisão nova.
- **Link vazado**: código de 32 bytes aleatórios, só o hash no banco, validade, limite de tentativas e opção de **revogar** o link.
- **LGPD**: o link mostra só dados do orçamento e do próprio cliente; registro de visualização; exclusão do cliente não apaga o histórico financeiro, só anonimiza o que for pessoal.
- **Licença**: não copiar código de projeto AGPL/Elastic/BSL para dentro do Prime Ges (Midday, InvoiceShelf, Invoice Ninja, Akaunting, Documenso). Invoify, react-pdf, Gotenberg, Puppeteer, pdfmake são livres.
- **Peso e custo**: react-pdf não precisa de navegador; Puppeteer dentro do site aumenta a imagem e a memória; Gotenberg adiciona um contêiner.
- **E-mail**: o envio de e-mail do sistema ainda não foi testado; WhatsApp por link funciona sem isso.
- **Fonte e acentos**: registrar a fonte no PDF e testar com nomes acentuados, "R$" e símbolos.

## 10. Decisões que preciso de você

1. **Motor de PDF**: começamos com **react-pdf** (leve, recomendado) ou já com **HTML + Gotenberg** (mais liberdade visual, um contêiner a mais)?
2. O orçamento é só de **produtos e serviços do cadastro**, ou também com **linhas livres** (ex.: "mão de obra")? (recomendo permitir as duas)
3. **Validade padrão** (15 dias?) e **condições de pagamento** padrão que você quer no PDF.
4. O cliente pode **aprovar pelo link** já na primeira versão (Fase 2) ou o MVP é só PDF para baixar e enviar?
5. **Envio**: WhatsApp primeiro (link pronto) e e-mail depois, certo?
6. O orçamento aprovado deve **virar venda sozinho** ou só quando o dono clicar em "converter"?
7. Quer **limite de orçamentos por plano** (um diferencial comercial) ou liberado para todos?
8. **Identidade do PDF**: você tem logo, cores e um exemplo de orçamento que usa hoje? Posso desenhar os modelos a partir dele.
9. Fase 3: faz sentido **assinatura digital** (aceite com validade jurídica) ou o aprovar pelo link já basta?
