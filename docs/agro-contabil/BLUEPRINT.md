# AgroContábil — Blueprint do Produto

> Documento de arquitetura, produto e reaproveitamento open source.
> Revisão: 22/09/2026.
>
> Regra permanente: **REUSE FIRST — NÃO REINVENTAR**.
>
> Objetivo: transformar a fundação SaaS existente deste repositório em uma base
> capaz de receber um produto vertical para agronegócio, sem misturar regras
> rurais diretamente com os módulos genéricos do ERP.

---

## 1. Visão do produto

**AgroContábil** será uma plataforma SaaS brasileira de gestão agro, fiscal,
contábil e tributária para:

- produtor rural pessoa física;
- produtor rural pessoa jurídica;
- pequenas propriedades;
- médios produtores;
- grandes fazendas;
- grupos empresariais do agronegócio;
- agroindústrias;
- cooperativas;
- empresas compradoras de produção rural;
- escritórios contábeis especializados em agronegócio.

O produto não deve ser apresentado como ferramenta para evasão fiscal.

O posicionamento é:

> **gestão, conformidade e planejamento tributário lícito para o agronegócio.**

A plataforma deve calcular cenários, identificar oportunidades legais e
mostrar a fundamentação/assunções utilizadas, deixando decisões jurídicas
e contábeis sujeitas à validação profissional quando necessário.

---

## 2. Regra de reutilização das bases

Antes de desenvolver qualquer módulo:

1. pesquisar repositórios brasileiros;
2. identificar licença;
3. verificar atividade/manutenção;
4. avaliar arquitetura e dependências;
5. avaliar cobertura fiscal;
6. executar testes em ambiente isolado;
7. reutilizar apenas componentes compatíveis com nossa licença e arquitetura;
8. documentar origem, versão, licença e modificações.

**Nunca copiar código simplesmente porque o projeto parece bom.**

---

# 3. Bases encontradas no GitHub

## 3.1 EficazFramework.SPED — PRIORIDADE ALTA

Repositório:
https://github.com/Eficaz-Sistemas/EficazFramework.SPED

Licença:
MIT.

Tecnologia:
.NET.

Cobertura relevante declarada pelo projeto:

- NF-e / NFC-e;
- CT-e;
- NFS-e;
- ECD;
- ECF;
- EFD ICMS/IPI;
- EFD Contribuições;
- EFD-Reinf;
- eSocial;
- GNRE;
- LCDPR;
- schemas IBS/CBS da Reforma Tributária.

O projeto também informa uso em produção para vários desses componentes e
mantém o código compatível com versões recentes do .NET.

**Decisão:** candidato principal para nosso serviço fiscal/obrigações em .NET.

---

## 3.2 NFePHP / SPED-NFE — PRIORIDADE ALTA

Repositório:
https://github.com/nfephp-org/sped-nfe

Licença declarada pelo projeto:
LGPLv3 ou MIT.

Tecnologia:
PHP.

Cobertura relevante:

- geração de NF-e;
- comunicação com SEFAZ;
- assinatura;
- NFC-e;
- emissão com eCPF em diversos estados, observadas as restrições estaduais;
- documentação e schemas;
- alterações da Reforma Tributária;
- regras relacionadas a produtos de agricultura, pecuária e produção florestal.

**Decisão:** biblioteca de referência e candidata para um worker PHP fiscal
caso um módulo específico apresente cobertura superior ao stack .NET/TS.

Não criar uma segunda implementação da NF-e antes de comparar as APIs.

---

## 3.3 ERPBrasil.edoc — PRIORIDADE ALTA

Repositório:
https://github.com/erpbrasil/erpbrasil.edoc

Licença:
MIT.

Tecnologia:
Python.

Cobertura:

- NF-e;
- NFS-e;
- MDF-e;
- CT-e;
- GNRE;
- EFD-Reinf;
- eSocial;
- integração com diferentes provedores de NFS-e.

A arquitetura permite instalar dependências adicionais conforme o uso.

**Decisão:** usar como referência/worker especializado quando a cobertura
Python reduzir esforço ou oferecer integração que não exista nos serviços
principais.

---

## 3.4 Brasil Fiscal / NFe — PRIORIDADE ALTA PARA TYPESCRIPT

Repositório:
https://github.com/brasil-fiscal/nfe

Licença:
MIT.

Tecnologia:
TypeScript / Node.js.

Possui arquitetura modular com:

- certificado A1;
- XMLDSig;
- mTLS;
- NF-e;
- NFC-e;
- transmissão;
- consulta;
- cancelamento;
- manifestação do destinatário;
- distribuição DF-e;
- DANFE;
- providers substituíveis;
- schemas Zod;
- separação entre domínio, aplicação e infraestrutura.

O ecossistema também possui trabalhos para CT-e, MDF-e, SPED Fiscal,
SPED Contribuições e SINTEGRA.

**Decisão:** forte candidato para integração fiscal TypeScript/Node e para
componentes que precisem conversar diretamente com o ecossistema Next.js.

---

## 3.5 OCA/l10n-brazil — REFERÊNCIA ARQUITETURAL / USO COM ANÁLISE DE LICENÇA

Repositório:
https://github.com/OCA/l10n-brazil

É a localização brasileira do Odoo e possui uma quantidade muito grande de
módulos brasileiros, incluindo:

- contabilidade;
- plano de contas;
- fiscal;
- certificado;
- DF-e;
- NF-e;
- NFS-e;
- CT-e;
- MDF-e;
- compras;
- vendas;
- estoque;
- RH;
- relatórios;
- SPED.

O repositório informa AGPL-3.0 como licença do repositório e esclarece que
cada módulo pode possuir licença própria.

**Decisão:** excelente referência funcional e arquitetural.
Não incorporar código ao SaaS fechado sem analisar a licença individual do
módulo e o efeito jurídico da integração.

---

# 4. Bases rurais encontradas

## 4.1 MONPEC Gestão Rural — REFERÊNCIA FUNCIONAL

Repositório:
https://github.com/LMONCAO/Monpec_GestaoRural

O README descreve:

- gestão de propriedades;
- pecuária;
- inventário;
- projeções;
- planejamento;
- rastreabilidade bovina;
- receitas/despesas;
- DRE;
- fluxo de caixa;
- relatórios consolidados;
- múltiplas propriedades;
- compras;
- fornecedores;
- nutrição;
- operações;
- relatórios para empréstimos.

A própria documentação declara:

**Sistema proprietário — todos os direitos reservados.**

**Decisão:** não reutilizar código.
Usar somente como referência funcional/benchmark enquanto respeitarmos o
direito autoral.

---

## 4.2 Gestao-Rural — REFERÊNCIA DE MODELAGEM

Repositório:
https://github.com/faccin-eng/Gestao-Rural

O projeto contém planilhas e modelos de controle de:

- custos;
- produção;
- rentabilidade.

O README relata que as planilhas foram trabalhadas com produtores rurais em
Rondônia e adaptadas a diferentes cadeias produtivas.

Licença encontrada:
GPLv3.

**Decisão:** referência de domínio e experiência de usuário.
Não incorporar código/artefatos GPL ao núcleo de um SaaS proprietário sem
análise jurídica específica.

---

## 4.3 NFe_Rural — REFERÊNCIA TÉCNICA, NÃO REUTILIZAR SEM LICENÇA

Repositório:
https://github.com/marcogalvao2016/NFe_Rural

Possui aplicação PHP e integra:

- NFePHP SPED-NFE;
- SPED-DA;
- autenticação;
- persistência.

Não foi encontrado um arquivo LICENSE explícito no repositório consultado.

**Decisão:** não incorporar código enquanto a licença/permissão não estiver
formalmente esclarecida.

---

# 5. Conclusão do levantamento open source

A estratégia principal será:

\`\`\`
Nossa aplicação
      |
      +-- Next.js / React / TypeScript
      |
      +-- Supabase / PostgreSQL
      |
      +-- Agro Domain
      |
      +-- Fiscal Gateway
              |
              +-- EficazFramework.SPED
              +-- Brasil Fiscal
              +-- NFePHP
              +-- ERPBrasil
\`\`\`

Não significa instalar tudo.

A Fase de Integração deverá executar uma prova técnica e selecionar o
componente mais adequado para cada documento/obrigação.

---

# 6. Público e edição do produto

## 6.1 Agro Start — pequeno produtor

Foco em simplicidade.

Módulos:

- cadastro do produtor;
- propriedade;
- atividades;
- produção;
- estoque simples;
- compras;
- vendas;
- caixa;
- contas a pagar;
- contas a receber;
- documentos;
- nota fiscal;
- livro caixa;
- LCDPR;
- impostos;
- alertas;
- relatórios básicos.

Interface sem linguagem contábil desnecessária.

Exemplo de lançamento:

> "Comprei 100 sacos de fertilizante para a soja."

O sistema deve classificar o lançamento e permitir revisão antes do
fechamento fiscal.

---

## 6.2 Agro Pro — produtor médio

Adicionar:

- múltiplas propriedades;
- múltiplas safras;
- centros de custo;
- talhões;
- culturas;
- estoque por local;
- máquinas;
- manutenção;
- depreciação;
- contratos;
- funcionários/terceiros;
- contas bancárias;
- conciliação;
- orçamento;
- planejamento financeiro;
- custo por hectare;
- custo por saca/arroba/unidade;
- margem por atividade;
- planejamento tributário;
- dashboard contábil/fiscal.

---

## 6.3 Agro Enterprise — grande empresa

A prioridade muda de "lançar despesas" para "governar um grupo".

Adicionar:

- holding/grupo econômico;
- várias empresas;
- várias propriedades;
- várias UFs;
- unidades produtivas;
- centros de resultado;
- orçamento corporativo;
- aprovação multinível;
- compras corporativas;
- contratos;
- fornecedores;
- clientes;
- logística;
- frota;
- armazéns;
- integração bancária;
- APIs;
- EDI;
- DF-e;
- auditoria;
- consolidação contábil;
- consolidação financeira;
- compliance;
- segregação de funções;
- trilha de auditoria;
- BI;
- cenários tributários.

---

# 7. Modelo organizacional

Não limitar o sistema a uma "empresa".

Estrutura:

\`\`\`
Grupo Agro
|
+-- Empresa A
|   |
|   +-- Fazenda 01
|   +-- Fazenda 02
|   +-- Armazém
|
+-- Empresa B
|   |
|   +-- Fazenda 03
|
+-- Cooperativa / Unidade industrial
\`\`\`

Dentro de cada propriedade:

\`\`\`
Propriedade
|
+-- Área
+-- Talhões
+-- Safras
+-- Culturas
+-- Rebanhos
+-- Máquinas
+-- Estoque
+-- Custos
+-- Produção
+-- Vendas
\`\`\`

---

# 8. Painel principal

O dashboard deve ter dois modos.

## Modo Produtor

\`\`\`
┌─────────────────────────────────────────────────┐
│ AGROCONTÁBIL                         Fazenda ▼  │
├─────────────────────────────────────────────────┤
│ Receita       Custos       Resultado    Impostos │
│ R$ XXX        R$ XXX       R$ XXX       R$ XXX  │
├─────────────────────────────────────────────────┤
│ SAFRA ATUAL                                      │
│ Soja       820 ha       58 sc/ha                │
│ Milho      410 ha       112 sc/ha               │
├─────────────────────────────────────────────────┤
│ ATENÇÃO                                          │
│ 3 documentos pendentes                           │
│ 1 nota rejeitada                                 │
│ 2 lançamentos sem documento                      │
│ 1 obrigação próxima do vencimento                │
├─────────────────────────────────────────────────┤
│ FINANCEIRO                                       │
│ Entradas | Saídas | Contas | Bancos             │
├─────────────────────────────────────────────────┤
│ TRIBUTÁRIO                                       │
│ Situação atual | Alertas | Simulações            │
└─────────────────────────────────────────────────┘
\`\`\`

## Modo Contador

\`\`\`
Dashboard
Clientes
Pendências
Fiscal
Contábil
LCDPR
SPED
IRPF/IRPJ
IBS/CBS
Planejamento
Auditoria
Relatórios
\`\`\`

## Modo Enterprise

Adicionar:

- mapa do grupo;
- consolidação;
- indicadores por empresa;
- indicadores por fazenda;
- exposição tributária;
- fluxo de caixa consolidado;
- orçamento x realizado;
- margem por unidade;
- obrigações críticas;
- alertas de compliance.

---

# 9. Menu principal proposto

### Visão Geral
- Dashboard
- Central de alertas
- Agenda fiscal

### Agro
- Propriedades
- Talhões
- Safras
- Culturas
- Produção
- Rebanho
- Máquinas
- Insumos
- Estoques

### Comercial
- Clientes
- Fornecedores
- Produtos
- Compras
- Vendas
- Contratos
- Pedidos

### Fiscal
- NF-e
- NFC-e
- NFS-e
- CT-e
- MDF-e
- Documentos recebidos
- Distribuição DF-e
- Certificado digital
- SEFAZ
- SPED

### Financeiro
- Caixa
- Bancos
- Contas a pagar
- Contas a receber
- Fluxo de caixa
- Conciliação
- Orçamento

### Contábil
- Plano de contas
- Lançamentos
- Livro Caixa
- LCDPR
- DRE
- Balanço
- ECD
- ECF

### Tributário
- Situação fiscal
- Impostos
- Apurações
- Simulações
- Cenários
- Créditos
- Alertas

### Compliance
- Pendências
- Auditoria
- Documentos
- Trilha de alterações
- Obrigações

### Inteligência
- Copiloto
- Auditor IA
- Explicador fiscal
- Análise financeira
- Cenários

### Administração
- Empresas
- Usuários
- Perfis
- Permissões
- Integrações
- Logs
- Configurações
- Billing

---

# 10. Motor fiscal

O motor fiscal não deve ficar espalhado pelo frontend.

Arquitetura:

\`\`\`
FiscalCalculation
|
+-- TaxRule
+-- TaxRate
+-- FiscalOperation
+-- ProductClassification
+-- ProducerType
+-- TaxRegime
+-- State
+-- Municipality
+-- DocumentType
+-- EffectivePeriod
+-- LegalSource
\`\`\`

Cada regra deve guardar:

- identificador;
- tributo;
- tipo de operação;
- base legal;
- artigo/parágrafo quando aplicável;
- vigência inicial;
- vigência final;
- UF;
- município, quando aplicável;
- regime;
- tipo de contribuinte;
- exceções;
- fórmula;
- versão;
- fonte;
- data de atualização;
- responsável pela revisão.

**Nunca codificar legislação como centenas de if/else permanentes.**

---

# 11. Planejamento tributário

O módulo deve trabalhar com **simulação e conformidade**, não com evasão.

Exemplo:

\`\`\`
Cenário atual
      |
      +-- Receita
      +-- Custos
      +-- Investimentos
      +-- Regime
      +-- Estrutura societária
      +-- Operações fiscais
      |
      v
Cenário alternativo
      |
      +-- diferença estimada
      +-- premissas
      +-- impacto fiscal
      +-- impacto financeiro
      +-- fundamento legal
      +-- riscos
      +-- necessidade de revisão profissional
\`\`\`

O sistema deve apresentar o cálculo, não uma ordem jurídica do tipo
"faça X para pagar menos".

---

# 12. Reforma Tributária: requisito estrutural

A plataforma deve nascer preparada para a transição do IBS/CBS.

A Receita informa que 2026 é o início das novas obrigações e que os documentos
fiscais eletrônicos passam por cronograma próprio de implantação.

O cronograma oficial deve ser tratado como dado externo versionado e
atualizável:

- leiaute;
- data de publicação;
- início da obrigatoriedade;
- documento fiscal;
- operação;
- regra;
- status de implantação.

Para pessoas físicas contribuintes e para o produtor rural pessoa física
abrangido pela regulamentação da CBS, o Decreto nº 13.075/2026 prorrogou
para 01/01/2027 a obrigatoriedade de inscrição no CNPJ e de emissão dos
documentos fiscais previstos na regulamentação.

O produto precisa ter um **assistente de transição 2026 → 2027**.

---

# 13. Produtor rural e IBS/CBS

A legislação da reforma prevê tratamento específico para produtores rurais e
produtores rurais integrados.

O sistema deve guardar:

- tipo de produtor;
- receita anual;
- opção pelo regime aplicável;
- contribuinte/não contribuinte;
- comprador;
- documentação da operação;
- crédito presumido quando aplicável;
- vigência dos percentuais;
- pagamento relacionado à operação;
- memória de cálculo.

Para adquirentes sujeitos ao regime regular, a legislação prevê mecanismos de
crédito presumido sobre aquisições de produtor rural ou produtor rural
integrado não contribuinte, com regras próprias de documentação e cálculo.

Isso cria uma oportunidade importante para o produto:

**não atender apenas o produtor que vende; atender também a agroempresa que
compra a produção.**

---

# 14. Livro Caixa e LCDPR

O sistema deve distinguir:

**Livro Caixa da Atividade Rural**

de

**Livro Caixa Digital do Produtor Rural (LCDPR).**

O próprio material da Receita faz essa distinção.

Fluxo:

\`\`\`
Movimentação
   |
   +-- Receita
   +-- Despesa
   +-- Investimento
   +-- Patrimônio
   +-- Transferência
   |
   v
Classificação
   |
   v
Livro Caixa
   |
   +-- IRPF
   +-- LCDPR
   +-- relatórios
\`\`\`

---

# 15. Contabilidade por atividade

A unidade contábil do AgroContábil deve permitir:

- propriedade;
- unidade produtiva;
- atividade;
- cultura;
- safra;
- centro de custo;
- centro de resultado.

Exemplo:

\`\`\`
Fazenda Boa Esperança
|
+-- Soja 2026/27
|   +-- sementes
|   +-- fertilizantes
|   +-- defensivos
|   +-- combustível
|   +-- mão de obra
|   +-- máquinas
|
+-- Milho 2026/27
|
+-- Pecuária
\`\`\`

Isso permite chegar a:

- custo por hectare;
- custo por cultura;
- custo por unidade produzida;
- margem;
- resultado por safra.

---

# 16. Documentos e armazenamento

Todo documento relevante deve ser persistido com:

- tipo;
- número;
- série;
- chave;
- emitente;
- destinatário;
- data;
- valor;
- XML;
- PDF/DANFE quando aplicável;
- status;
- assinatura;
- origem;
- hash;
- tenant;
- propriedade;
- atividade;
- safra;
- usuário;
- data de importação.

Objetivo:

**um documento, uma fonte de verdade.**

---

# 17. Auditoria automática

O Auditor deve comparar:

\`\`\`
NF-e
|
+-- Caixa
+-- Banco
+-- Estoque
+-- Contabilidade
+-- Livro Caixa
+-- SPED
+-- Declarações
\`\`\`

Exemplo:

> Venda registrada: R$ 150.000  
> NF-e: R$ 150.000  
> Banco: R$ 150.000  
> Livro Caixa: R$ 120.000  
> Diferença: R$ 30.000

Alertas não devem afirmar fraude automaticamente.

Usar níveis:

- informação;
- atenção;
- inconsistência;
- bloqueio operacional;
- revisão profissional.

---

# 18. IA

A IA será **copiloto**, não fonte jurídica autônoma.

Ferramentas:

### Copiloto fiscal
Explica regras e cálculos.

### Copiloto contábil
Explica lançamentos e relatórios.

### Auditor IA
Procura anomalias e inconsistências.

### Analista agro
Analisa custo, produtividade e margem.

### Assistente de documentos
Lê XML/PDF autorizado e sugere classificação.

### Assistente de planejamento
Simula cenários com regras versionadas.

A IA deverá citar a regra/registro usado no cálculo sempre que a resposta for
tributária.

---

# 19. Enterprise: como atender uma grande empresa de agronegócio

O produto precisa sair do conceito de "cliente = empresa".

Modelo:

\`\`\`
Grupo Econômico
|
+-- Empresa 1
|   +-- Fazenda A
|   +-- Fazenda B
|
+-- Empresa 2
|   +-- Fazenda C
|
+-- Armazém
|
+-- Indústria
|
+-- Transportadora
\`\`\`

Cada camada pode ter:

- usuários;
- permissões;
- centros de custo;
- contas bancárias;
- documentos;
- estoque;
- contratos;
- fiscal;
- contábil.

A controladoria terá acesso consolidado, enquanto o gerente de uma fazenda
verá somente suas unidades.

---

# 20. Permissões

RBAC + escopo organizacional.

Papéis previstos:

- super_admin da plataforma;
- administrador do grupo;
- administrador da empresa;
- contador;
- fiscal;
- financeiro;
- gerente de fazenda;
- comprador;
- vendedor;
- operador;
- auditor;
- usuário somente leitura.

Além do papel:

**scope**.

Exemplo:

> João = gerente + Fazenda 03

Ele não deve acessar automaticamente Fazenda 04.

---

# 21. Segurança

Obrigatórios:

- RLS no PostgreSQL;
- tenant_id/company_id em módulos multi-tenant;
- trilha de auditoria;
- criptografia de segredos;
- certificado digital somente server-side;
- segregação de funções;
- logs sem credenciais;
- rotação de chaves;
- backup;
- recuperação de desastre;
- idempotência em webhooks;
- filas para emissão/consulta fiscal;
- rate limiting;
- validação de XML;
- antivirus/sandbox para arquivos;
- controle de acesso a documentos.

Certificado A1 nunca deve ficar exposto no navegador.

---

# 22. Arquitetura técnica proposta

A fundação atual do repositório usa Next.js, React, TypeScript, Supabase,
PostgreSQL, Storage e RLS.

Essa fundação pode ser reaproveitada para:

- autenticação;
- multi-tenant;
- dashboard;
- billing;
- usuários;
- permissões básicas;
- Storage;
- auditoria.

Para o fiscal pesado:

\`\`\`
Next.js
   |
   +-- API
   |
   +-- Supabase
   |
   +-- PostgreSQL
   |
   +-- Storage
   |
   +-- Queue
          |
          +-- Fiscal Worker .NET
          |     |
          |     +-- EficazFramework.SPED
          |
          +-- Fiscal Worker Node
          |     |
          |     +-- Brasil Fiscal
          |
          +-- Worker Python/PHP
                |
                +-- ERPBrasil / NFePHP
\`\`\`

A existência de vários workers não significa que todos serão usados.
Primeiro fazemos benchmark e escolhemos o menor conjunto que cubra os
requisitos.

---

# 23. Banco de dados — domínio agro

Entidades principais:

- organizations;
- companies;
- company_members;
- producers;
- properties;
- property_units;
- fields;
- crops;
- seasons;
- activities;
- livestock;
- herds;
- machinery;
- machinery_maintenance;
- products;
- product_lots;
- warehouses;
- suppliers;
- customers;
- contracts.

Financeiro:

- bank_accounts;
- cash_accounts;
- receivables;
- payables;
- cash_movements;
- bank_transactions;
- reconciliations;
- budgets;
- cost_centers;
- profit_centers.

Fiscal:

- fiscal_documents;
- fiscal_document_items;
- nfe;
- nfce;
- nfse;
- cte;
- mdfe;
- dfe_events;
- certificates;
- tax_rules;
- tax_rule_versions;
- tax_calculations;
- tax_scenarios;
- legal_sources.

Contábil:

- chart_of_accounts;
- accounting_entries;
- accounting_lines;
- lcdpr_entries;
- sped_entries;
- ecd_entries;
- ecf_entries.

Compliance:

- obligations;
- deadlines;
- alerts;
- audit_events;
- reconciliation_findings.

---

# 24. Fluxo de uma venda rural

\`\`\`
Produção
  ↓
Lote
  ↓
Pedido
  ↓
Cliente
  ↓
Operação fiscal
  ↓
Motor Tributário
  ↓
NF-e
  ↓
SEFAZ
  ↓
XML autorizado
  ↓
Estoque
  ↓
Financeiro
  ↓
Livro Caixa / Contabilidade
  ↓
SPED / Obrigações
\`\`\`

Nenhum valor deve ser digitado novamente sem necessidade.

---

# 25. Fluxo de uma compra

\`\`\`
Fornecedor
  ↓
NF recebida
  ↓
Distribuição DF-e
  ↓
Manifestação / entrada
  ↓
Produto
  ↓
Estoque
  ↓
Custo
  ↓
Contabilidade
  ↓
Financeiro
  ↓
Tributos / créditos
\`\`\`

---

# 26. Integrações futuras

Prioridades:

- SEFAZ;
- Receita Federal;
- DF-e;
- bancos;
- Pix;
- Open Finance, quando juridicamente/técnicamente adequado;
- ERP/contabilidade externa;
- cooperativas;
- armazéns;
- balanças;
- transportadoras;
- marketplaces/agtechs;
- GPS/telemetria;
- sensores agrícolas;
- APIs de clima;
- mapas/GIS;
- imagens de satélite.

Cada integração deve ser um adapter independente.

---

# 27. Ideias de diferenciação

## Cofre fiscal

Todos os XMLs, documentos e evidências em um único local.

## Radar tributário

Mostra:

- alterações legislativas;
- alterações de leiaute;
- novos prazos;
- mudanças de cálculo;
- operações afetadas.

## Simulador de safra

Simula:

- preço;
- produtividade;
- custo;
- resultado;
- imposto.

## "E se?"

Exemplo:

> "O que acontece se a soja cair 12%?"

O sistema calcula impacto financeiro e tributário conforme as regras
parametrizadas.

## Custo real da fazenda

Cruza:

- estoque;
- notas;
- combustível;
- máquinas;
- mão de obra;
- compras;
- produção.

## Auditoria contínua

Não espera o fechamento anual.

Analisa diariamente.

## Mapa financeiro do grupo

Grupo → empresa → propriedade → talhão → atividade.

## Centro de documentos

O produtor pode simplesmente enviar XML/PDF/arquivo e o sistema tenta
classificar, sempre permitindo revisão.

---

# 28. Roadmap de implementação

## FASE 0 — Due diligence

- mapear bases;
- testar licenças;
- montar laboratório;
- benchmark fiscal;
- decidir workers;
- documentar dependências.

## FASE 1 — Fundação Agro

- modelo organizacional;
- produtores;
- empresas;
- propriedades;
- usuários;
- permissões;
- safras;
- atividades;
- centros de custo;
- auditoria.

## FASE 2 — Financeiro Agro

- caixa;
- bancos;
- pagar;
- receber;
- conciliação;
- orçamento;
- custos;
- DRE.

## FASE 3 — Fiscal

- certificado;
- NF-e;
- DF-e;
- XML;
- SEFAZ;
- NFS-e;
- CT-e;
- MDF-e;
- documentos recebidos.

## FASE 4 — Livro Caixa e Contábil

- Livro Caixa;
- LCDPR;
- plano de contas;
- lançamentos;
- DRE;
- balanço;
- ECD;
- ECF;
- SPED.

## FASE 5 — Tributário

- IRPF rural;
- IRPJ;
- ICMS;
- PIS/COFINS durante a transição;
- IBS;
- CBS;
- regras estaduais;
- cenários.

## FASE 6 — Agro Enterprise

- grupo econômico;
- consolidação;
- compras;
- contratos;
- estoque avançado;
- logística;
- frota;
- armazéns;
- aprovação multinível;
- BI.

## FASE 7 — Inteligência

- auditor;
- copiloto;
- simulador;
- radar tributário;
- previsões;
- automações.

---

# 29. Critérios de aceite do produto

Uma funcionalidade fiscal só entra em produção quando houver:

- teste unitário;
- teste de integração;
- documento fiscal de exemplo;
- validação de schema;
- caso de sucesso;
- caso de rejeição;
- tratamento de contingência quando aplicável;
- versionamento;
- fonte oficial;
- log;
- idempotência;
- auditoria.

Uma regra tributária só entra quando houver:

- fonte legal;
- vigência;
- fórmula;
- exemplo;
- teste;
- revisão.

---

# 30. Fontes oficiais que devem alimentar o núcleo jurídico

Receita Federal:
https://www.gov.br/receitafederal/

LCDPR:
https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/lcdpr-livro-caixa-digital-do-produtor-rural

Documentação técnica LCDPR:
https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/lcdpr

Reforma Tributária:
https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo

Cronograma de documentos fiscais da Reforma:
https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo/orientacoes-da-reforma-tributaria

Lei nº 15.270/2025:
https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15270.htm

Lei Complementar nº 214/2025:
https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm

Decreto nº 13.075/2026:
https://www.gov.br/fazenda/pt-br/assuntos/noticias/2026/julho/emissao-do-cnpj-e-de-documentos-fiscais-por-pessoas-fisicas-contribuintes-da-cbs-comecara-em-1o-de-janeiro-de-2027

---

# 31. Regra de ouro do projeto

**Não construir um ERP genérico e colocar um tema de fazenda.**

Construir um **ERP nativo do agronegócio**, cujo núcleo fiscal/contábil seja
brasileiro e cuja estrutura entenda:

**produtor → propriedade → unidade → talhão → safra → atividade → produção →
documento → financeiro → contabilidade → tributação.**

O produtor enxerga a fazenda.

O contador enxerga a contabilidade.

O fiscal enxerga os documentos.

A controladoria enxerga o grupo.

Todos trabalham sobre a mesma base de dados.

---

## 32. Próxima implementação técnica

A primeira implementação não deve ser "mais telas".

Deve ser:

1. laboratório de bases open source;
2. matriz de licenças;
3. modelo de domínio agro;
4. migrations do núcleo agro;
5. Fiscal Gateway abstrato;
6. primeiro adapter fiscal;
7. teste real de NF-e;
8. Livro Caixa/LCDPR;
9. dashboard Agro;
10. auditoria cruzada.

Somente depois expandir para Enterprise.

**Status do blueprint:** aprovado para orientar o desenvolvimento; código
fiscal ainda deve passar por laboratório e testes antes de ser incorporado ao
núcleo de produção.
