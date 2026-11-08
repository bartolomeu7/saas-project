/*
 * Service worker do Prime Ges (aplicativo instalável).
 *
 * Faz UMA coisa: quando o aparelho está sem internet e a pessoa abre uma página, mostra a página "Sem conexão"
 * (/offline.html) em vez do erro do navegador.
 *
 * O que ele NUNCA faz (de propósito, por privacidade e segurança):
 *  - não guarda páginas, respostas, dados de clientes, vendas ou qualquer informação da conta;
 *  - não mexe em nada que não seja a abertura de uma página (imagens, scripts, APIs e envios de formulário
 *    vão direto para a rede, sem passar por aqui).
 * Assim, nada de uma pessoa fica gravado no aparelho depois de ela sair.
 */
const CACHE = "prime-ges-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // Só a abertura de páginas. Todo o resto segue direto para a rede.
  if (request.mode !== "navigate") return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match(OFFLINE_URL)) || Response.error();
    })
  );
});
