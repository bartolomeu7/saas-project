import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const APP_DIR = path.join(process.cwd(), "src", "app", "(app)", "app");

const modules = readdirSync(APP_DIR).filter((name) => statSync(path.join(APP_DIR, name)).isDirectory());

test("existem módulos em /app para checar", () => {
  assert.ok(modules.length >= 10);
});

for (const name of modules) {
  test(`módulo ${name}: tem tela de erro própria e aponta para si mesmo`, () => {
    const file = path.join(APP_DIR, name, "error.tsx");
    assert.ok(existsSync(file), `falta ${name}/error.tsx`);
    const src = readFileSync(file, "utf8");
    assert.match(src, /^"use client";/);
    assert.ok(src.includes(`moduleHref="/app/${name}"`), `${name}/error.tsx deve apontar para /app/${name}`);
  });
}
