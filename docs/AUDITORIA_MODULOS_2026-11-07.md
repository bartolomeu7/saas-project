# Auditoria dos módulos e ferramentas — Prime Ges (07/11/2026)

Feita por Claude (Claude Code) a pedido do dono. Nota de 0 a 10 por módulo, com o motivo e o que falta para subir.

## Como as notas foram dadas (leia primeiro)

**O que eu conferi de verdade:**
- Código de cada módulo (páginas, ações do servidor, consultas, funções do banco).
- `tsc` (tipos): 0 erros. `eslint`: 0 erros, 11 avisos antigos. Testes unitários: 449, 448 passam, 1 pulado de propósito.
- Banco de **Produção**, só leitura: 60 tabelas, **todas com RLS**; 0 funções usando `auth.uid()` (a troca para Clerk está completa); avisos do Supabase só de tipo informativo (índices ainda sem uso porque não há tráfego).
- Site no ar (`scripts/verify-production.mjs`): tudo OK, commit publicado = `04f1ea3`.
- Avisos de dependência (`npm audit`) e os 3 avisos do Next.js no GitHub.

**O que eu NÃO consegui conferir (por isso as notas têm teto):**
- Nenhum módulo foi usado logado de ponta a ponta nesta auditoria.
- **Produção tem 0 vendas, 1 cliente e 1 produto no total.** Ou seja, nenhum fluxo de negócio rodou com dado real em produção. As notas de Vendas, Caixa, Compras, Financeiro etc. vêm de código + testes de banco no TEST, não de uso real.
- Desempenho não foi medido (sem volume de dados). Acessibilidade só foi medida nas páginas públicas (axe).

Regra das notas: 9–10 pronto e provado em uso real · 7–8 sólido, falta prova real ou um recurso esperado · 5–6 funciona, mas básico · 3–4 incompleto · 0–2 não existe.

---

## 1. Módulos do cliente (`/app`)

| Módulo | Nota | O que tem | O que falta para subir |
|---|---|---|---|
| **Vendas** | 7,5 | Rascunho → itens → pagamentos → concluir. Conclusão e cancelamento são **transações no banco** (baixa e devolução de estoque, desconto, pontos de fidelidade). Mensagens de erro em português. | Nunca rodou com dado real (0 vendas em produção). Sem recibo/comprovante para imprimir ou enviar. Sem nota fiscal. |
| **Clientes** | 8 | Cadastro, ficha com abas (resumo, histórico, fidelidade, documentos com upload), ranking, sorteio, desativar em vez de apagar, exclusão de conta LGPD. | Importar planilha. Enviar mensagem (WhatsApp/e-mail). |
| **Produtos** | 7,5 | Código de barras e SKU, custo e preço, categorias, ajuste de estoque, histórico, dicas por tipo de negócio. | Importar em massa, variações (tamanho/cor), validade. |
| **Serviços** | 7,5 | Cadastro, categorias, desativar/reativar, histórico. | Igual a Produtos; ligação mais forte com a Agenda (duração/profissional já existe no banco). |
| **Caixa** | 7 | Abrir, fechar, sangria/suprimento, diferença de caixa, entrada automática quando um pagamento é pago. | **Só dono/admin opera o caixa**; num comércio real quem opera é o funcionário. Um caixa por empresa. |
| **Estoque** | 6 | Painel de alertas (sem estoque / baixo / normal), barra de nível, entrada via Compras. Movimentações já gravadas no banco. | A tela é só painel: sem tela própria de histórico de movimentações, sem inventário/contagem, só os 20 primeiros alertas. |
| **Compras** | 7,5 | Pedido, recebimento (dá entrada no estoque **e** gera conta a pagar), cancelar pedido, cancelar recebimento. Várias rodadas de reforço no banco. | Nunca usado de verdade; sem importar XML de nota do fornecedor. |
| **Fornecedores** | 6,5 | Cadastro, listar, desativar, estatísticas. | Simples; falta histórico de compras na ficha e contato rápido. |
| **Financeiro** | 7 | Categorias, centros de custo, contas a pagar e a receber, lançamentos, pagar/receber pelo banco. | Não vi DRE, fluxo de caixa projetado nem conciliação. Funcionário só vê. |
| **Relatórios** | 6 | 5 períodos, faturamento por dia, por forma de pagamento, itens que mais faturam, agenda, valores em aberto, exportar CSV. | Período livre, comparação com mês anterior, lucro por produto, PDF. |
| **Agenda** | 6 | Marcar, remarcar, mudar status, por profissional, visão do dia. | Só visão **do dia** (sem semana/mês em grade), sem lembrete ao cliente, sem agendamento online. |
| **Equipe** | 6,5 | Papéis (dono/admin/funcionário), perfil de profissional, serviços que atende, horários, bloqueios, limite de vagas por plano. | Só adiciona quem **já tem conta** (não há convite por e-mail). |
| **Fidelidade** | 7 | Pontos, níveis, multiplicadores, campanhas, resgate com limite, ajuste manual. Muito código de regra (1.164 linhas). | Poucos testes (2 arquivos). A tela é só de configuração; falta o cliente ver o próprio saldo. |
| **Assinatura (cobrança)** | 8 | Pix pela EvoPay, webhook que **confere de novo** no provedor antes de gravar, teste de concorrência, teste grátis com antifraude, limites por plano. | Webhook sem assinatura (limite da EvoPay). Cobrança não é automática (cliente paga cada período). Sem e-mail de recibo. |
| **Configurações / Conta** | 7,5 | Perfil, foto, e-mail, senha, aparelhos conectados, tema, editar empresa, 2FA própria. | **Ainda não está no ar** (PR #66). Falta a chave da 2FA na Vercel e teste com login real. |
| **Dashboard** | 7 | Indicadores reais, "o que merece ação", primeiros passos, gráfico do mês. | Com 0 vendas fica vazio; precisa ver com dado real. |

## 2. Painel da plataforma (`/admin`)

| Área | Nota | Observação |
|---|---|---|
| **Admin completo** (usuários, empresas, planos, assinaturas, pagamentos, auditoria, integrações, ferramentas, administradores) | **8,5** | O mais maduro do produto. Papéis (admin/super admin), trilha de auditoria, reconciliação de pagamento, planos editáveis, reset de 2FA. dezenas de testes cobrem o admin. |

## 3. Ferramentas e base da plataforma

| Item | Nota | Motivo |
|---|---|---|
| **Banco de dados** | 9 | 60 tabelas, 59 com RLS ativado no código e 0 sem RLS em produção, 74 migrações, 12 com rollback, 15 baterias de teste SQL (isolamento entre empresas incluído). Falta: provar que o backup **restaura**. |
| **Login e acesso (Clerk + regras)** | 8 | Login social, sessões limitadas, consentimento, bloqueio de conta inativa, 2FA própria pronta. Falta: ligar a chave da 2FA e testar os fluxos com login real. |
| **Segurança** | 7 | Pontos fortes: RLS em tudo, funções fechadas, cabeçalhos, auditoria. Pontos fracos: **Next.js com 3 avisos novos** (ver abaixo), sem CSP, **sem limite de tentativas/requisições** nas ações do app, webhook sem assinatura. |
| **Testes** | 6,5 | 448 unitários + baterias SQL. Falta: **nenhum teste de tela (E2E)**; o CI só roda unitários e build; as baterias SQL e o teste de concorrência são manuais. |
| **Monitoramento / erros** | **2** | Não há Sentry, alerta nem painel de erros. Hoje só descobrimos problema se alguém avisar. **É a maior lacuna para receber clientes.** |
| **Dependências** | 6 | `npm audit` em produção: 1 crítico + 2 altos + 1 moderado (detalhes abaixo). |
| **Comunicação com cliente** | 2 | Sem e-mail transacional (Resend desligado), sem WhatsApp, sem canal de suporte configurado (e-mail em branco nos textos legais). |
| **Jurídico / LGPD** | 6 | Termos, privacidade, reembolso, direitos do titular e exclusão de conta existem e funcionam no banco. Faltam: 11 campos da empresa em branco (CNPJ, endereço, DPO…), revisão de advogado, versão rc.4. |
| **Site público / SEO** | 8 | Home, planos, páginas legais, dados estruturados, mapa do site; 5 arquivos de teste de SEO. |
| **Documentação** | 6 | Há muita documentação boa, mas o `README.md` e o `docs/architecture.md` estão **desatualizados** (dizem que o admin e vários módulos não existem). |
| **Fiscal (nota fiscal)** | 0 | Não existe. Para muitos clientes (comércio) é exigência. Decidir se entra no plano ou se integra com serviço terceiro. |
| **App no celular (PWA)** | 2 | Não há manifesto nem ícone instalável. O layout responde ao celular, mas não instala como app. |

## 4. Avisos de segurança nas dependências (`npm audit`, só produção)

| Pacote | Gravidade | O que é | Afeta o Prime Ges? |
|---|---|---|---|
| `next` 16.3.8 (corrigido a partir da 16.4.1; última 16.4.5) | **Crítico** | Execução remota de código na otimização de imagem com SVG | Provavelmente baixo: o site roda na Vercel e usa `next/image` em 4 arquivos, sem SVG configurado. Mesmo assim, atualizar. |
| `next` | Crítico | Execução remota de código em `use cache` com arrays tipados | **Não usamos** `use cache`. |
| `next` | Alto | Negação de serviço com Server Actions (CPU) | **Sim, afeta**: o app usa Server Actions em todo lugar. Sem solução alternativa, só atualizar. |
| `zod` 3.x | Alto | Memória estoura ao validar listas enormes | Baixo (validamos entradas pequenas), mas a correção exige Zod 4 (mudança grande). |
| `source-map-js`, `postcss-selector-parser` | Alto / moderado | Só ferramentas de build | Não chega ao site no ar. |

**Recomendação:** atualizar o Next.js para 16.4.5 (mesma linha 16, deve ser troca simples), rodar tipos, testes e build, e só então publicar. Os avisos foram publicados em 22/10/2026, depois do último ajuste de segurança (PR #38).

## 5. Dados reais em produção hoje
5 empresas, 6 perfis, 4 assinaturas, **0 vendas**, 1 cliente, 1 produto. É um ambiente praticamente vazio: ótimo para testar com calma, mas significa que o produto ainda não foi validado por um negócio de verdade.

## 6. Resumo das notas

- Média dos módulos do cliente: **7,0**.
- Admin: **8,5**. Banco: **9**. Cobrança: **8**.
- Piores: Monitoramento **2**, Comunicação **2**, PWA **2**, Fiscal **0**.

## 7. Plano para preparar o ambiente para clientes (em ordem)

**Antes de qualquer cliente real (bloqueantes):**
1. Atualizar o Next.js (16.4.5) e publicar.
2. Colocar monitoramento de erros (Sentry ou equivalente) e um alerta de site fora do ar.
3. Mesclar o PR #66 e ligar a chave da 2FA na Vercel (a chave nunca mais pode ser trocada depois).
4. **Rodada de uso real**: uma pessoa de verdade cadastra produtos, faz venda com Pix e dinheiro, abre/fecha caixa, recebe uma compra, paga conta, marca agenda. Registrar cada falha. Hoje isso nunca foi feito em produção.
5. Preencher os dados da empresa nos textos legais (rc.4) e definir o e-mail de suporte.
6. Provar que o backup do banco restaura.

**Logo depois (para o cliente não reclamar):**
7. Funcionário poder operar o caixa.
8. Recibo da venda (imprimir/enviar) e e-mail transacional (recibo de assinatura, boas-vindas).
9. Limite de tentativas nas ações sensíveis (login já é do Clerk; falta nas demais).
10. Testes de tela (E2E) para o caminho principal: cadastro → venda → caixa.
11. Importar clientes/produtos por planilha (reduz muito o atrito de começar).
12. Agenda em visão semana/mês e lembrete ao cliente.

**Depois:**
13. Nota fiscal (decisão de produto), PWA instalável, relatórios com comparação e lucro, CSP, atualizar README/arquitetura, Zod 4.

## 8. Limites desta auditoria
- Notas são julgamento meu sobre código, testes e banco, não opinião de cliente nem prova de uso.
- Não executei nenhum fluxo logado nem mexi em nada em produção (só leitura de catálogo e contagens).
- Não medi desempenho nem acessibilidade das telas logadas.
- Os pacotes `sharp` e a infraestrutura de imagem da Vercel não foram inspecionados; a avaliação do risco do aviso de imagem é por raciocínio, não por teste.
