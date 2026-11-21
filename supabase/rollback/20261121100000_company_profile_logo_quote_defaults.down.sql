-- Reverte 20261121100000_company_profile_logo_quote_defaults.sql.
-- ATENÇÃO: apaga os dados cadastrais, o logo e os padrões de orçamento já preenchidos (as colunas e a tabela deixam de existir).
-- Faça um backup antes se algum cliente já preencheu esses dados.
begin;

drop function if exists public.update_company_quote_defaults(integer, text, text);
drop function if exists public.remove_company_logo();
drop function if exists public.set_company_logo(text, text);
drop function if exists public.update_company_profile(text, text, text, text, text, text, text, text, text, text, text, text, text);
drop function if exists public._company_editor();
drop table if exists public.company_logos;

alter table public.companies drop constraint if exists companies_profile_lengths;
alter table public.companies
  drop column if exists legal_name, drop column if exists document, drop column if exists phone, drop column if exists whatsapp,
  drop column if exists email, drop column if exists website, drop column if exists postal_code, drop column if exists address,
  drop column if exists address_number, drop column if exists complement, drop column if exists neighborhood,
  drop column if exists city, drop column if exists state;

update public.company_settings set operational_preferences = operational_preferences - 'quote' where operational_preferences ? 'quote';

notify pgrst, 'reload schema';

commit;
