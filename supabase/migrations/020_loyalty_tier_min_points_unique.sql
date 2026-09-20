-- Corrige corrida (TOCTOU) que permite dois níveis de fidelidade com o
-- mesmo min_lifetime_points na mesma empresa.
--
-- Auditoria confirmada por leitura do código: createLoyaltyTierThresholdAction
-- e updateLoyaltyTierThresholdAction (src/lib/loyalty/actions.ts) checam
-- duplicidade de min_lifetime_points em código (SELECT tudo -> comparar em
-- JS -> INSERT/UPDATE), sem transação nem lock. loyalty_tier_thresholds já
-- tem UNIQUE(company_id, name) mas NÃO tem UNIQUE(company_id,
-- min_lifetime_points) — diferente de Multiplicadores de fidelidade, que
-- têm as duas camadas de proteção (checagem em código + constraint no
-- banco), Níveis só tem a primeira.
--
-- Diferente do caso de "uma empresa por usuário" (migration 017, resolvido
-- com advisory lock por não poder virar constraint permanente sem fechar
-- a porta para convites futuros), aqui uma constraint única É a solução
-- certa e sem nenhuma ambiguidade de regra de negócio: dois níveis com a
-- mesma pontuação mínima na mesma empresa não tem nenhum significado de
-- produto válido (calculateLoyaltyTier escolhe um único nível por faixa de
-- pontos — um empate é sempre um erro de cadastro, nunca um caso de uso
-- legítimo).
--
-- *** MIGRATION CRIADA, MAS NÃO APLICADA EM PRODUÇÃO NESTA SESSÃO ***

alter table public.loyalty_tier_thresholds
  add constraint loyalty_tier_thresholds_company_min_points_unique
  unique (company_id, min_lifetime_points);

-- Complementa o tratamento de erro: createLoyaltyTierThresholdAction e
-- updateLoyaltyTierThresholdAction (código da aplicação, não desta
-- migration) devem passar a tratar o código 23505 desta nova constraint
-- com a mesma mensagem amigável que já existe para o nome duplicado —
-- ver relatório final para o diff de código correspondente.
