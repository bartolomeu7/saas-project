# Fase 6 — Administração, Configurações e Governança

## Entregue
- Configurações da empresa: fuso, localidade, moeda, início da semana e notificações.
- Preferências pessoais: tema, densidade, fuso e notificações.
- Centro de governança dentro de Configurações.
- Administração da plataforma em /admin, separado de company_members.role.
- Visão administrativa de usuários, empresas e assinaturas.
- Ativação/inativação de empresas com registro em audit_logs.
- RLS em company_settings e user_preferences.
- EXECUTE das funções administrativas novas restrito a authenticated.
- Nenhuma publicação/deploy no Vercel.

## Segurança desta iteração
O bootstrap das configurações da empresa não usa mais SECURITY DEFINER; a criação ocorre via upsert sujeito a RLS e a leitura usa defaults em código quando ainda não existe uma linha.

## Próxima etapa
Auditoria completa dos módulos existentes para identificar pendências funcionais e pontos que ainda precisam consumir governança/permissões.
