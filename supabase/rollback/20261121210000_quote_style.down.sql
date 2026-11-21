-- Reverte 20261121210000_quote_style.sql.
-- ATENÇÃO: apaga o modelo, a cor da marca, o texto de apresentação e a chave Pix já salvos (os PDFs voltam ao padrão).
begin;

drop function if exists public.update_company_quote_style(text, text, text, text, text, boolean);

update public.company_settings set operational_preferences = operational_preferences - 'quote_style' where operational_preferences ? 'quote_style';

notify pgrst, 'reload schema';

commit;
