import test from "node:test";
import assert from "node:assert/strict";
import { resolveAppOrigin } from "../../src/lib/auth/app-origin.ts";

const CANONICAL = "https://primeges.com.br";
const r = (o) => resolveAppOrigin({ canonical: CANONICAL, ...o });

test("produção usa sempre o domínio canônico, mesmo com host diferente", () => {
  assert.equal(r({ vercelEnv: "production", host: "primeges.com.br" }), CANONICAL);
  assert.equal(r({ vercelEnv: "production", host: "saas-project-eta-eight.vercel.app" }), CANONICAL);
  assert.equal(r({ vercelEnv: "production", host: "evil.example.com", forwardedHost: "evil.example.com" }), CANONICAL);
});

test("local resolve para a própria origem (com porta)", () => {
  assert.equal(r({ vercelEnv: undefined, host: "localhost:3000" }), "http://localhost:3000");
  assert.equal(r({ vercelEnv: undefined, host: "127.0.0.1:3000" }), "http://127.0.0.1:3000");
  assert.equal(r({ vercelEnv: "development", host: "localhost:3001" }), "http://localhost:3001");
});

test("preview resolve para a URL do Preview (https)", () => {
  const h = "saas-project-3n76qbruo-juninhormatos-9956s-projects.vercel.app";
  assert.equal(r({ vercelEnv: "preview", host: h }), `https://${h}`);
  const alias = "saas-project-git-feat-ui-re-916697-juninhormatos-9956s-projects.vercel.app";
  assert.equal(r({ vercelEnv: "preview", forwardedHost: alias, host: "internal" }), `https://${alias}`);
});

test("hosts desconhecidos ou forjados caem no canônico (anti host-header poisoning)", () => {
  assert.equal(r({ vercelEnv: "preview", host: "evil.example.com" }), CANONICAL);
  assert.equal(r({ vercelEnv: "preview", host: "other-project.vercel.app" }), CANONICAL);
  assert.equal(r({ vercelEnv: "preview", host: "saas-project.vercel.app.evil.com" }), CANONICAL);
  assert.equal(r({ vercelEnv: "preview", host: "localhost.evil.com" }), CANONICAL);
  assert.equal(r({ vercelEnv: undefined, host: "" }), CANONICAL);
  assert.equal(r({ vercelEnv: undefined }), CANONICAL);
});

test("x-forwarded-host com lista usa o primeiro valor", () => {
  assert.equal(
    r({ vercelEnv: "preview", forwardedHost: "saas-project-abc-team.vercel.app, other.com" }),
    "https://saas-project-abc-team.vercel.app"
  );
});
