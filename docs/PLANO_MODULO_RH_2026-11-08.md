# Plano do módulo RH — Prime Ges (08/11/2026)

Status: **planejamento** (nada implementado). Local no menu: grupo **Gestão**, ao lado de Clientes, Produtos, Serviços, Vendas e Fidelidade.

## 1. Objetivo

Gestão de funcionários simples para pequenas empresas, em **dois modos** por funcionário:

| | **Informal** (controle básico) | **CLT** (completo) |
|---|---|---|
| Para quem | Quem paga diária, semana ou quinzena sem carteira assinada | Quem tem carteira assinada |
| Foco | Cadastro, quanto e quando pagar, vales, descontos, recibo | Tudo do Informal + contrato, folha estimada, férias, 13º, FGTS, INSS, IRRF, VT, exames, rescisão, documentos |
| Cálculo de impostos | Nenhum | Estimativa com tabelas oficiais versionadas |

Posicionamento (obrigatório na tela e nos recibos): **o Prime Ges organiza e estima; não substitui contador nem transmite eSocial/FGTS Digital**. A folha oficial continua com o contador (ou sistema próprio de folha); o Prime Ges entrega a **exportação para o contador** e o controle do que sai do caixa.

## 2. O que o dono pediu (resumo fiel)

- Nome completo, data de nascimento, de forma simples.
- Despesas, pagamentos e **dias de pagamento**.
- Informal: diária, semanal, a cada 15 dias.
- CLT: mais completo, "tudo que um RH faz".

## 3. Regras verificadas em fonte oficial (conferido em 08/11/2026)

| Item | Valor 2026 | Fonte |
|---|---|---|
| Salário mínimo | R$ 1.621,00 | gov.br/INSS (Portaria MPS/MF nº 13, 09/01/2026) |
| INSS empregado (progressivo por faixa) | até 1.621,00: 7,5% · até 2.902,84: 9% · até 4.354,27: 12% · até 8.475,55 (teto): 14% | gov.br/INSS |
| IRRF mensal (base = salário − INSS − dependentes − desconto) | até 2.428,80: isento · até 2.826,65: 7,5% (ded. 182,16) · até 3.751,05: 15% (394,16) · até 4.664,68: 22,5% (675,49) · acima: 27,5% (908,73) | gov.br/Receita Federal |
| Dedução por dependente | R$ 189,59 | Receita Federal |
| Desconto simplificado (limite) | R$ 607,20 | Receita Federal |
| Redução (Lei 15.270/2025) | até R$ 5.000 de rendimento: zera o imposto (redução até 312,89); de 5.000,01 a 7.350: redução = 978,62 − 0,133145 × rendimento; acima de 7.350: sem redução. Vale também para o 13º. | gov.br/Receita Federal |
| FGTS Digital | FGTS é recolhido por guia gerada no FGTS Digital (paga por Pix) a partir do que o empregador informa no eSocial | gov.br/fgts.gov.br |
| MEI com empregado | no máximo 1; salário de até 1 mínimo ou piso da categoria; MEI paga 3% (INSS patronal) + 8% (FGTS) sobre o salário | gov.br/INSS e Portal do Empreendedor |

Regras estáveis da CLT usadas no plano (conferir com contador antes de virar texto da tela): FGTS 8% (aprendiz 2%); multa de 40% do FGTS na dispensa sem justa causa; férias de 30 dias + 1/3; 13º em duas parcelas (até 30/11 e até 20/12); vale-transporte com desconto de até 6% do salário base; hora extra no mínimo 50% (dias úteis); adicional noturno de 20%; DSR.

**Como evitar regra velha no código:** as tabelas (INSS, IRRF, redução, mínimo, dependente) ficam numa **tabela do banco versionada por vigência** (`hr_tax_tables`), não dentro do código. Mudou a tabela em 2027 → insere-se uma linha nova, sem publicar versão do app. Cada folha estimada grava a versão da tabela usada.

## 4. Telas

### Para os dois modos
1. **RH (painel)**: funcionários ativos, **a pagar hoje / esta semana / atrasados**, total do mês, aniversariantes, vencimentos (CLT).
2. **Funcionários (lista)**: busca, filtro Informal/CLT/Ativo/Inativo.
3. **Ficha do funcionário**: abas Dados · Pagamentos · Vales e descontos · Presença · (CLT) Contrato · Férias e 13º · Documentos.
4. **Novo funcionário**: passo curto (nome completo, nascimento, modo, forma e valor de pagamento, dia de pagamento). O resto pode ser preenchido depois.
5. **Calendário de pagamentos**: quem recebe em cada dia; botão "pagar".
6. **Recibo de pagamento** (imprimir/PDF) com campo de assinatura.

### Só Informal
- **Presença/diárias**: marcar dias trabalhados (1 dia, meio dia, falta) em calendário ou lista da semana; a diária × dias gera o valor do período.
- **Fechamento do período** (semana, quinzena ou mês): soma dias, subtrai vales/descontos, mostra o líquido, gera o pagamento.

### Só CLT
- **Contrato e salário** (cargo, admissão, jornada, salário, dependentes, VT, experiência 45+45/90).
- **Folha estimada do mês**: salário + horas extras + adicionais − INSS − IRRF − VT − faltas = líquido; FGTS e INSS patronal (se aplicável) mostrados como custo da empresa. Rótulo fixo: "Estimativa".
- **Horas extras e faltas** do mês.
- **Férias**: período aquisitivo, vencimento, programação, valor estimado (+1/3).
- **13º salário**: 1ª e 2ª parcela estimadas.
- **Documentos**: ASO e exames com vencimento (aviso), contrato, documentos pessoais.
- **Rescisão estimada**: simulação por tipo de saída (pedido de demissão, sem justa causa, acordo, fim de experiência).
- **Exportação para o contador** (CSV): funcionários, eventos do mês, pagamentos.

## 5. Dados (todas as tabelas com `company_id`, RLS, só owner/admin)

- `hr_employees`: nome completo, nascimento, CPF (restrito), telefone, e-mail, cargo, **modo** (informal/clt), situação (ativo/inativo), admissão/saída, **forma de pagamento** (diária, semanal, quinzenal, mensal), **valor base** (diária ou salário), **regra do dia de pagamento** (dia da semana ou dia do mês), chave Pix, observações, vínculo opcional com membro da equipe (`company_member_id`) e com profissional da agenda (`professional_id`).
- `hr_employee_clt` (1:1, só CLT): salário, jornada, tipo de contrato, experiência, dependentes, VT, banco/agência para holerite, data base de férias.
- `hr_time_entries`: presença por dia (valor 1, 0,5 ou 0; origem manual).
- `hr_adjustments`: vales, adiantamentos, descontos, bônus, reembolsos (tipo, valor, data, em qual pagamento foi acertado).
- `hr_payments`: funcionário, tipo (diária/salário/adiantamento/férias/13º/rescisão/bônus), período, bruto, descontos, líquido, vencimento, pago em, forma, status (pendente/pago/cancelado), `financial_entry_id`.
- `hr_documents` (CLT): tipo, validade, arquivo em storage **privado**.
- `hr_vacations` (CLT): período aquisitivo, gozo, pago.
- `hr_tax_tables`: tabelas oficiais versionadas por vigência.
- `hr_audit_log`: quem viu/alterou dado sensível, quando.

RPCs `SECURITY DEFINER` com validação de papel (padrão do projeto): `hr_register_payment`, `hr_close_period`, `hr_estimate_payroll`. Pagar um funcionário chama a RPC já existente do Financeiro (`create_financial_entry`), categoria **Pessoal**, e **abate do caixa quando o método é dinheiro** (exige caixa aberto, como hoje).

## 6. Integrações com o que já existe

- **Financeiro/Caixa**: cada pagamento vira despesa (categoria "Pessoal") e entra no DRE como despesa operacional. Estorno/cancelamento cancela o lançamento.
- **Equipe**: ligação opcional (um funcionário que também usa o sistema).
- **Agenda/Comissão (futuro, fase 3 do plano da agenda)**: comissão vira "evento" a pagar no RH.
- **Dashboard**: card "Folha do mês" e "A pagar hoje" (só para quem tem permissão).
- **Planos**: limite de funcionários por plano (decisão do dono).

## 7. Permissões e LGPD

- Novas permissões: `hr.view` e `hr.manage`, **somente owner/admin**; `employee` não vê nem a rota. Entrada em `MODULE_PERMISSIONS` para `/app/rh`; a barreira real é a RLS do banco, não a tela.
- Dado sensível: CPF, salário e **ASO (saúde)**. CPF mascarado na lista; documentos em bucket privado com URL assinada curta; log de acesso a ficha e documentos.
- Base legal: execução de contrato / obrigação legal; o dono é o controlador. Texto na política de privacidade e termo para o funcionário no cadastro (a revisar pelo jurídico).
- Funcionário **informal**: aviso fixo de que a falta de registro pode caracterizar vínculo empregatício; o sistema não orienta como evitar obrigações.

## 8. Fases (cada fase = 1 PR, primeiro TEST, Produção só com "Autorizo")

| Fase | Entrega | Banco |
|---|---|---|
| **RH-1** | Menu, permissões, cadastro, lista, ficha, **modo Informal completo** (presença, vales, fechamento, pagamento → Financeiro/Caixa, recibo, painel "a pagar") | tabelas `hr_employees`, `hr_time_entries`, `hr_adjustments`, `hr_payments`, RPCs, RLS, bateria SQL + rollback |
| **RH-2** | **CLT base**: contrato, folha estimada (INSS/IRRF/FGTS/VT/horas extras), holerite estimado, `hr_tax_tables` | `hr_employee_clt`, `hr_tax_tables`, `hr_estimate_payroll` |
| **RH-3** | Férias, 13º, documentos e alertas de vencimento (ASO, férias), rescisão estimada | `hr_vacations`, `hr_documents` + storage privado |
| **RH-4** | Exportação para o contador, aniversariantes, integração com comissão da agenda, limites por plano | pequenas |

Em cada fase: testes unitários + bateria SQL + rollback provado + teste no site com funcionário fictício na empresa de teste (teste1), sem tocar em dado real.

## 9. Riscos e como tratamos

1. **Exatidão trabalhista**: tabelas oficiais versionadas, rótulo "Estimativa", testes com exemplos da própria Receita (os exemplos de R$ 4.500 e R$ 6.000 acima viram casos de teste), validação de números por contador antes de liberar o CLT.
2. **Responsabilidade do informal**: aviso fixo; não é produto de "fugir de CLT".
3. **Dado sensível/LGPD**: seção 7.
4. **Escopo**: RH completo é grande; por isso 4 fases e o CLT só depois do Informal estar em uso.
5. **Mudança de lei**: tabela no banco, não no código.
6. **Dinheiro**: pagamento só pelo caminho único (RPC), idempotente, sem pagar duas vezes o mesmo período.

## 10. Decisões que preciso do dono

1. **Quem acessa o RH?** Só dono e administrador (recomendado) ou o gerente também?
2. **Informal paga como?** Aceita o fechamento por período (dias × diária − vales) como padrão? Pagamento de dia avulso também?
3. **Limite por plano?** RH em todos os planos ou só nos pagos? Quantos funcionários em cada um?
4. **CLT**: o objetivo é só **estimar e controlar** (recomendado) ou você quer, no futuro, emitir folha oficial / transmitir eSocial? (muda muito o tamanho do projeto)
5. **Contador**: podemos ter um formato de exportação (CSV) e, se quiser, um convite de acesso só leitura para o contador?
6. **Aniversário e avisos**: avisos pelo painel apenas, ou também por e-mail/WhatsApp (depende das decisões de Resend/WhatsApp pendentes)?
7. **Ponto eletrônico (marcar entrada/saída)** fica fora da primeira versão?

## 11. Arquivos que serão mexidos (referência)

- `src/components/app/nav-items.ts` (grupo "Gestão", ícone novo) · `src/components/app/route-labels.ts` e teste `app-breadcrumbs.test.mjs` (rotas novas) · `src/lib/permissions/matrix.ts` e `tests/unit/permissions-matrix.test.mjs`.
- `src/app/(app)/app/rh/**` (páginas) · `src/lib/hr/**` (queries, actions, cálculo puro testável) · `src/types/supabase.ts`.
- `supabase/migrations/*_hr_*.sql` + `supabase/rollback/*` + `tests/sql/hr_*.sql`.
- Documentos: política de privacidade (item de dados de funcionários).

## 12. Status (atualizado em 08/11/2026)

- **RH-1 (Informal):** pronta, em Produção (PR #82 e #83).
- **RH-2 (CLT base):** pronta no PR #84 — cadastro CLT (salário, jornada, contrato, dependentes, VT), tabelas de INSS/IRRF/parâmetros 2026 versionadas no banco, folha mensal estimada (INSS progressivo, IRRF com desconto simplificado x legal e redução da Lei 15.270, FGTS, VT, horas extras, faltas, bônus, vales), holerite estimado, custo da empresa (regime Simples, MEI ou outro) e configurações do RH. O DSR sobre horas extras/faltas, adicional noturno, insalubridade e periculosidade **não** entram (avisado na tela).
- **Próximas:** RH-3 (férias, 13º, documentos e vencimentos de ASO, rescisão estimada) e RH-4 (exportação para o contador, comissão da agenda, limites por plano).
