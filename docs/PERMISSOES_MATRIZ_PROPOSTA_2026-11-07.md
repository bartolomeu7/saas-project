# Matriz de permissões — proposta para aprovação (PER-1)

Data: 07/11/2026. Parte do plano `docs/PLANO_ACAO_NOTA_9_2026-11-07.md`.

> **ATUALIZAÇÃO (08/11/2026) — decisão do dono: "use o padrão" (caixa próprio sim; custo não; desconto 10%; Admin não remove Admin; relatórios só das próprias vendas).**
> Implementado na etapa 1 (PR `feat/permissoes-matriz`, banco **só no TEST**; Produção depende de autorização por migration):
> - Caixa: qualquer membro abre; funcionário fecha só o que abriu; sangria/suprimento só dono/admin.
> - Preço e custo: funcionário não altera (trigger no banco + tela); no cadastro novo ele define só o preço de venda; custo e margem escondidos.
> - Financeiro, fornecedores e compras: leitura só dono/admin (banco + menu + telas).
> - Equipe: admin só adiciona/remove/troca papel de funcionário; admin e owner são do dono.
>
> **Ainda NÃO feito (próximas etapas):** limite de desconto de 10% para funcionário; relatórios "só das próprias vendas" (por enquanto o funcionário **não vê** Relatórios — é o mais seguro até existir a visão filtrada); funcionário ver só o próprio caixa na listagem; assinatura só do dono.

**Nada aqui foi aplicado.** A coluna "Hoje" foi conferida no banco de **Produção** (somente leitura: funções e políticas de acesso). A coluna "Proposto" é minha sugestão; só vira código depois da sua aprovação.

Papéis da empresa: **Dono** (quem criou), **Admin** (gerente de confiança), **Funcionário** (balcão/atendimento).

## Matriz

| Área | Ação | Hoje (conferido) | Proposto |
|---|---|---|---|
| **Vendas** | Criar, editar rascunho, concluir | Qualquer membro | Dono, Admin, Funcionário |
| | Dar desconto | Qualquer membro, sem limite | Funcionário até um limite (ex.: 10%); acima disso precisa de Dono/Admin |
| | Cancelar venda | Dono/Admin qualquer; funcionário só as próprias | Igual (já está certo) |
| **Clientes** | Ver, criar, editar, documentos | Qualquer membro | Igual |
| | Desativar cliente | Qualquer membro | Dono/Admin |
| **Produtos e Serviços** | Ver, criar | Qualquer membro | Igual |
| | **Editar preço e custo** | Qualquer membro | **Só Dono/Admin** |
| | Ver o **custo** e a margem | Qualquer membro | Só Dono/Admin (funcionário vê só o preço de venda) |
| | Desativar | Qualquer membro | Dono/Admin |
| **Fornecedores** | Ver | Qualquer membro | Dono/Admin |
| | Criar, editar | Qualquer membro | Dono/Admin |
| **Estoque** | Ver saldo e alertas | Qualquer membro | Igual |
| | Ajustar quantidade | Dono/Admin | Igual (funcionário pode pedir; fica para depois) |
| **Compras** | Ver | Qualquer membro | Dono/Admin |
| | Criar, receber, cancelar | Dono/Admin | Igual |
| **Caixa** | Ver saldo e movimentos | Qualquer membro | Funcionário vê só o próprio caixa; Dono/Admin veem todos |
| | Abrir e fechar | **Só Dono/Admin** | **Funcionário abre e fecha o próprio caixa** |
| | Sangria, suprimento, despesa avulsa | Dono/Admin | Igual (funcionário não) |
| **Financeiro** | Ver lançamentos, contas a pagar e receber | **Qualquer membro** | **Só Dono/Admin** (funcionário não vê) |
| | Criar, pagar, receber | Dono/Admin | Igual |
| **Relatórios** | Ver faturamento e lucro | Qualquer membro | Funcionário vê só as próprias vendas; Dono/Admin veem tudo |
| **Agenda** | Ver, marcar, remarcar, mudar status | Qualquer membro | Igual |
| | Bloqueios e horários do profissional | Dono/Admin | Igual |
| **Equipe** | Ver a lista | Qualquer membro | Igual |
| | Adicionar, trocar papel, remover | Dono/Admin | Dono pode tudo; **Admin não mexe no Dono nem em outro Admin** (a conferir no código) |
| **Fidelidade** | Configurar níveis, campanhas, multiplicadores | Dono/Admin | Igual |
| | Resgatar pontos na venda | Qualquer membro | Igual |
| | Ajustar pontos à mão | Dono/Admin | Igual |
| **Empresa** | Editar nome e tipo | Dono/Admin | Igual |
| **Assinatura** | Pagar, trocar plano | A conferir | **Só Dono** |
| **Minha conta** | Perfil, senha, aparelhos, 2FA | Cada pessoa a sua | Igual |
| | Excluir a própria conta | Regras do PR #39 | Igual |

## O que esta matriz muda de verdade

1. **Funcionário opera o caixa** (hoje não consegue; num comércio real é quem atende).
2. **Funcionário deixa de mexer em preço e custo** (hoje qualquer membro altera).
3. **Funcionário deixa de ver o Financeiro e o lucro** (hoje vê tudo).
4. **Menu e botões escondem o que a pessoa não pode** (hoje ela clica e recebe erro).
5. Desconto com limite para funcionário (opcional).

## Como ficará a implementação (depois de aprovada)
- Banco: ajustar as políticas e funções afetadas (preço/custo, caixa por operador, leitura do financeiro) em migrations novas, **primeiro no TEST** com bateria SQL e rollback; Produção só com sua autorização por migration.
- Aplicativo: menu e telas leem a mesma matriz (uma tabela única no código), então cada tela mostra ou esconde conforme o papel.
- Testes: um teste automático percorre papel × ação e falha se a tela e o banco discordarem.

## Perguntas para você decidir
1. Funcionário abre e fecha o **próprio** caixa (e só ele)? Ou prefere que só o Dono/Admin abram, e o funcionário apenas opere?
2. Funcionário **pode ver o custo** dos produtos? (Proposta: não.)
3. Limite de desconto do funcionário: **10%**, outro valor, ou sem limite?
4. O **Admin** pode remover outro Admin? (Proposta: não, só o Dono.)
5. Funcionário vê relatórios? (Proposta: só das próprias vendas.)
