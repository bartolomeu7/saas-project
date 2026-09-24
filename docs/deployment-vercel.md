# Deploy — Prime Ges na Vercel

## Objetivo

Publicar o Prime Ges por GitHub + CI + Preview + promoção para `main`, evitando deploy de código não validado.

## Fluxo

```
feature/fix branch
  ↓
CI
  ↓
Vercel Preview
  ↓
smoke tests
  ↓
PR
  ↓
merge main
  ↓
Vercel Production
  ↓
health check + logs
```

## Ambientes

### Preview

Usado para validar cada branch/PR antes de produção.

Variáveis mínimas:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` quando o código server-side exigir
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_APP_ENV`

Os valores reais ficam configurados na Vercel e nunca entram no Git.

### Production

O branch de produção é `main`.

Após merge:

1. aguardar deploy;
2. validar `/api/health`;
3. validar `/`, `/login` e `/register`;
4. validar middleware/sessão;
5. consultar runtime logs;
6. somente então considerar a fase publicada.

## Banco

Deploy de aplicação e migration são tratados separadamente.

Migrations devem ser:

- versionadas;
- backward-compatible;
- aplicadas antes de código que dependa exclusivamente do novo schema;
- sem remoção destrutiva no mesmo passo da primeira adoção.

## Health check

`GET /api/health` não acessa o Supabase.

Isso permite separar:

- falha do processo Next.js/Vercel;
- falha de configuração de banco/auth;
- falha de módulo de negócio.

Resposta esperada: HTTP 200 com `status: "ok"`.

## Rollback

O rollback de aplicação deve retornar à última implantação saudável.

Se a alteração também envolver banco, usar o procedimento compatível definido na migration; não depender de rollback cego do schema.
