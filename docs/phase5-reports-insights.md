# Prime Ges — Fase 5: Relatórios e Inteligência Operacional

## Objetivo

Transformar os módulos já existentes em uma camada de leitura gerencial sem criar uma segunda fonte de verdade.

A Fase 5 é uma camada de consulta e apresentação sobre os dados transacionais existentes de Vendas, Financeiro, Estoque, Clientes e Agenda.

## Arquitetura

- Fonte única: os relatórios leem as tabelas existentes.
- Multi-tenant: companyId é resolvido server-side por getCurrentCompany().
- Server-side first: agregações ficam em src/lib/reports/queries.ts.
- Sem nova dependência de gráficos: a primeira versão usa HTML/CSS e o design system existente.
- Sem nova migration: o módulo usa o schema atual.
- Exportação: o mesmo workspace pode ser exportado em CSV.

## Entrega

- faturamento e vendas concluídas por período;
- ticket médio;
- resultado operacional simples;
- recebimentos por método;
- itens com maior faturamento;
- agenda por status;
- estoque crítico;
- contas a receber e a pagar em aberto;
- títulos a pagar vencidos;
- recebíveis em aberto há mais de 1 dia, como indicador de idade do saldo;
- exportação CSV.

## Períodos

- Hoje
- Últimos 7 dias
- Últimos 30 dias
- Este mês
- Este ano

## Integridade

1. Nenhuma métrica fictícia é criada para preencher o painel.
2. Faturamento usa somente vendas concluídas.
3. Recebimentos por método usam somente pagamentos confirmados.
4. Compra de estoque não é contada novamente como despesa operacional quando já representa custo de estoque.
5. A receber e a pagar são saldos em aberto atuais e aparecem explicitamente como tal.
6. Como a tabela de vendas não possui due_date, o indicador de recebíveis não é chamado de "vencido": ele mede vendas concluídas ainda não pagas e com mais de um dia de idade.
7. Todas as consultas são filtradas pela empresa atual.
8. O CSV reutiliza o mesmo workspace do painel.

## Reuso

A decomposição funcional foi validada contra padrões de relatórios do ERPNext e do OCA Financial Reports: filtros por período, análises de vendas, estoque, resultado financeiro e exportação. Nenhum código desses projetos foi copiado. A implementação permanece nativa do stack Next.js + Supabase do Prime Ges.

## Fora do escopo

- BI externo;
- Metabase/Superset;
- metas e forecast;
- IA generativa;
- alteração de dados transacionais;
- execução de migrations no Supabase;
- qualquer deployment no Vercel durante o desenvolvimento da Fase 5.