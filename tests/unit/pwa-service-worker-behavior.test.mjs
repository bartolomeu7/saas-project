import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

/**
 * Executa o public/sw.js de verdade (num ambiente simulado de service worker) e confere o comportamento:
 * instala guardando SÓ a tela offline, ignora tudo que não é "abrir página", mostra a tela offline quando a rede cai
 * e nunca grava respostas da rede.
 */
const source = readFileSync(path.join(process.cwd(), "public/sw.js"), "utf8");

function createWorker({ networkOnline = true } = {}) {
  const handlers = {};
  const store = new Map(); // nome do cache -> Map(url -> Response)
  const puts = [];
  const fetched = [];

  const caches = {
    async open(name) {
      if (!store.has(name)) store.set(name, new Map());
      const entries = store.get(name);
      return {
        async add(request) {
          const response = await sandbox.fetch(request);
          const key = typeof request === "string" ? request : request.url;
          puts.push(key);
          entries.set(new URL(key, "https://app.test").pathname, response);
        },
        async put(request) {
          puts.push(String(request));
          throw new Error("o service worker não pode gravar respostas da rede");
        },
        async match(url) {
          return entries.get(new URL(url, "https://app.test").pathname);
        },
      };
    },
    async keys() {
      return [...store.keys()];
    },
    async delete(name) {
      return store.delete(name);
    },
  };

  // No navegador, endereços relativos (/offline.html) valem em relação ao site do service worker.
  class SwRequest extends Request {
    constructor(input, init) {
      super(typeof input === "string" ? new URL(input, "https://app.test").href : input, init);
    }
  }

  const sandbox = {
    Request: SwRequest,
    Response,
    URL,
    Promise,
    caches,
    self: {
      addEventListener(type, handler) {
        handlers[type] = handler;
      },
      skipWaiting: () => Promise.resolve(),
      clients: { claim: () => Promise.resolve() },
    },
    async fetch(request) {
      const url = typeof request === "string" ? request : request.url;
      fetched.push(new URL(url, "https://app.test").pathname);
      if (!networkOnline && !url.endsWith("/offline.html")) throw new TypeError("Failed to fetch");
      if (url.endsWith("/offline.html")) return new Response("<h1>Você está sem conexão</h1>", { status: 200 });
      return new Response("dados da conta", { status: 200 });
    },
  };
  vm.runInNewContext(source, sandbox);
  return { handlers, store, puts, fetched, sandbox, setOnline: (v) => (networkOnline = v) };
}

async function dispatch(worker, type, extra = {}) {
  let waited = Promise.resolve();
  let response = null;
  let responded = false;
  const event = {
    ...extra,
    waitUntil(promise) {
      waited = promise;
    },
    respondWith(promise) {
      responded = true;
      response = promise;
    },
  };
  worker.handlers[type](event);
  await waited;
  return { responded, response: responded ? await response : null };
}

test("instala guardando só a tela offline", async () => {
  const worker = createWorker();
  await dispatch(worker, "install");
  assert.equal(worker.puts.length, 1);
  assert.ok(worker.puts[0].endsWith("/offline.html"));
  const names = [...worker.store.keys()];
  assert.equal(names.length, 1);
  assert.equal([...worker.store.get(names[0]).keys()].join(","), "/offline.html");
});

test("tudo que não é abrir página passa direto para a rede (imagens, scripts, APIs, envio de formulário)", async () => {
  const worker = createWorker();
  await dispatch(worker, "install");
  const post = await dispatch(worker, "fetch", { request: new Request("https://app.test/api/x", { method: "POST", body: "a=1" }) });
  assert.equal(post.responded, false, "envio de formulário/API não pode ser interceptado");
  const script = await dispatch(worker, "fetch", { request: new Request("https://app.test/_next/static/chunk.js") });
  assert.equal(script.responded, false, "scripts e imagens não podem ser interceptados");
});

test("abrir página com internet: devolve a resposta da rede, sem guardar nada", async () => {
  const worker = createWorker();
  await dispatch(worker, "install");
  const request = new Request("https://app.test/app/clientes");
  Object.defineProperty(request, "mode", { value: "navigate" });
  const { responded, response } = await dispatch(worker, "fetch", { request });
  assert.equal(responded, true);
  assert.equal(await response.text(), "dados da conta");
  assert.equal(worker.puts.length, 1, "nada além da tela offline foi guardado");
});

test("abrir página SEM internet: mostra a tela offline (e nunca a página da conta)", async () => {
  const worker = createWorker();
  await dispatch(worker, "install");
  worker.setOnline(false);
  const request = new Request("https://app.test/app/clientes");
  Object.defineProperty(request, "mode", { value: "navigate" });
  const { responded, response } = await dispatch(worker, "fetch", { request });
  assert.equal(responded, true);
  assert.match(await response.text(), /sem conexão/);
});

test("ao ativar, apaga caches de versões antigas", async () => {
  const worker = createWorker();
  await dispatch(worker, "install");
  worker.store.set("prime-ges-offline-v0", new Map());
  await dispatch(worker, "activate");
  assert.deepEqual([...worker.store.keys()], ["prime-ges-offline-v1"]);
});
