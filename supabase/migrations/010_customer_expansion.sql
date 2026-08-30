-- =============================================================================
-- Migration: 010_customer_expansion.sql
-- Descrição: Etapa 1A — expande public.customers com dois campos opcionais
--            (aniversário e preferências). Migration puramente aditiva:
--            nenhuma tabela nova, nenhuma coluna removida, nenhuma migration
--            anterior alterada.
--
-- Reaproveita integralmente a estrutura existente de public.customers:
-- RLS, triggers (customers_set_updated_at / customers_protect_company_id)
-- e policies já cobrem qualquer coluna da tabela, então nenhuma alteração
-- de RLS é necessária aqui — é o mesmo padrão de segurança por linha,
-- não por coluna.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. customers.birth_date — opcional, nunca inferido/inventado para
--    clientes já cadastrados (fica null até o usuário informar).
-- -----------------------------------------------------------------------------
alter table public.customers
  add column if not exists birth_date date;

comment on column public.customers.birth_date is
  'Data de nascimento do cliente, opcional. Nunca preenchida automaticamente — só quando informada pelo usuário.';

-- -----------------------------------------------------------------------------
-- 2. customers.preferences — jsonb genérico para preferências livres
--    (chave/valor), evitando criar uma coluna por preferência ou por
--    segmento de negócio.
-- -----------------------------------------------------------------------------
alter table public.customers
  add column if not exists preferences jsonb not null default '{}'::jsonb;

comment on column public.customers.preferences is
  'Preferências livres do cliente (chave/valor), ex.: forma de pagamento preferida, produto favorito. Objeto plano, sem estrutura fixa — evita criar coluna por preferência ou por segmento.';

-- Garante que o valor seja sempre um objeto JSON (nunca array/string/número),
-- para a aplicação poder tratar como Record<string, string> com segurança.
alter table public.customers
  add constraint customers_preferences_is_object
  check (jsonb_typeof(preferences) = 'object');
