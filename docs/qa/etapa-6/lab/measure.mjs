// Medição de laboratório reproduzível (Etapa 6): Chrome headless + CDP, sem dependências instaladas.
// Uso: node measure.mjs <rótulo> <saida.json> [execuções-home] [execuções-outras]
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [label = "run", out = "measure.json", homeRunsArg = "5", otherRunsArg = "3"] = process.argv.slice(2);
const BASE = process.env.MEASURE_BASE ?? "http://localhost:3100";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;
const HOME_RUNS = Number(homeRunsArg);
const OTHER_RUNS = Number(otherRunsArg);

const PROFILES = {
  desktop: { width: 1350, height: 940, dpr: 1, mobile: false, cpu: 1, net: null },
  // Perfil móvel de laboratório: 390x844 @3x, CPU 4x mais lenta, rede ~"Slow 4G" (1,6 Mbps, RTT 150 ms).
  mobile: { width: 390, height: 844, dpr: 3, mobile: true, cpu: 4, net: { latency: 150, down: (1.6 * 1024 * 1024) / 8, up: (750 * 1024) / 8 } },
};
const PAGES = process.env.ONLY_PAGES ? process.env.ONLY_PAGES.split(",") : ["/", "/login", "/register", "/termos-de-uso", "/politica-de-privacidade", "/politica-de-reembolso", "/direitos-do-titular"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profileDir = mkdtempSync(join(tmpdir(), "chrome-measure-"));
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`, "--headless=new", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--mute-audio", "about:blank"], { stdio: "ignore" });

async function waitForChrome() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return await r.json();
    } catch {}
    await sleep(250);
  }
  throw new Error("Chrome não iniciou");
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = [];
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) this.handlers.forEach((h) => h(msg));
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(h) {
    this.handlers.push(h);
  }
}

const OBSERVER = `
(() => {
  const m = (window.__m = { lcp: null, lcpAll: [], cls: 0, clsEntries: [], longtasks: [], fcp: null, fp: null });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { m.lcpAll.push({ t: Math.round(e.startTime), tag: e.element ? e.element.tagName : null, size: e.size }); m.lcp = { time: e.startTime, size: e.size, url: e.url, tag: e.element ? e.element.tagName : null, id: e.element ? e.element.id : null, cls: e.element ? String(e.element.className).slice(0, 80) : null, text: e.element ? (e.element.textContent || '').slice(0, 60) : null }; } }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (!e.hadRecentInput) { m.cls += e.value; m.clsEntries.push({ t: e.startTime, v: e.value }); } } }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) m.longtasks.push({ s: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (e.name === 'first-contentful-paint') m.fcp = e.startTime; if (e.name === 'first-paint') m.fp = e.startTime; } }).observe({ type: 'paint', buffered: true }); } catch (e) {}
})();`;

const COLLECT = `(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const res = performance.getEntriesByType('resource').map((r) => ({ name: r.name, type: r.initiatorType, transfer: r.transferSize, enc: r.encodedBodySize, dec: r.decodedBodySize, dur: r.duration, start: r.startTime, rb: r.renderBlockingStatus }));
  const html = document.documentElement.outerHTML.length;
  return JSON.stringify({ m: window.__m, nav: nav ? { ttfb: nav.responseStart, dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, htmlEnc: nav.encodedBodySize, htmlDec: nav.decodedBodySize } : null, res, domNodes: document.getElementsByTagName('*').length, domHtmlLen: html, imgs: [...document.images].map((i) => ({ src: i.currentSrc, w: i.naturalWidth, h: i.naturalHeight, rw: Math.round(i.getBoundingClientRect().width), rh: Math.round(i.getBoundingClientRect().height), loading: i.loading, prio: i.fetchPriority })) });
})()`;

async function runOnce(version, profileName, path) {
  const p = PROFILES[profileName];
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  const c = new Cdp(ws);
  const net = new Map();
  c.on((msg) => {
    const q = msg.params;
    if (msg.method === 'Network.requestWillBeSent') net.set(q.requestId, { url: q.request.url, type: q.type, t: q.timestamp, bytes: 0, status: 0 });
    else if (msg.method === 'Network.responseReceived') { const r = net.get(q.requestId); if (r) { r.status = q.response.status; r.type = q.type; r.mime = q.response.mimeType; } }
    else if (msg.method === 'Network.loadingFinished') { const r = net.get(q.requestId); if (r) r.bytes = q.encodedDataLength; }
  });
  const loaded = new Promise((resolve) => c.on((msg) => msg.method === "Page.loadEventFired" && resolve()));
  await c.send("Page.enable");
  await c.send("Network.enable");
  await c.send("Network.setCacheDisabled", { cacheDisabled: true });
  await c.send("Emulation.setDeviceMetricsOverride", { width: p.width, height: p.height, deviceScaleFactor: p.dpr, mobile: p.mobile });
  if (p.cpu > 1) await c.send("Emulation.setCPUThrottlingRate", { rate: p.cpu });
  if (p.net) await c.send("Network.emulateNetworkConditions", { offline: false, latency: p.net.latency, downloadThroughput: p.net.down, uploadThroughput: p.net.up });
  if (process.env.REDUCED_MOTION) await c.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await c.send("Page.addScriptToEvaluateOnNewDocument", { source: OBSERVER });
  await c.send("Page.navigate", { url: BASE + path });
  await Promise.race([loaded, sleep(60000)]);
  await sleep(4000); // janela pós-load para LCP/CLS/long tasks tardios (hidratação, Clerk)
  const r = await c.send("Runtime.evaluate", { expression: COLLECT, returnByValue: true });
  const data = JSON.parse(r.result.value);
  ws.close();
  await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`).catch(() => {});
  const out = summarize(data, p);
  const origin = new URL(BASE).origin;
  const tally = {};
  for (const r of net.values()) {
    const third = r.url.startsWith('data:') ? null : new URL(r.url).origin !== origin;
    if (third === null) continue;
    for (const key of [r.type, third ? 'THIRD' : 'FIRST', 'ALL']) { tally[key] ??= { n: 0, bytes: 0 }; tally[key].n++; tally[key].bytes += r.bytes; }
  }
  out.net = tally;
  out.lcpAll = data.m.lcpAll;
  out.netThird = [...net.values()].filter((r) => !r.url.startsWith('data:') && new URL(r.url).origin !== origin).map((r) => ({ u: r.url.replace(/https:[/][/][^/]+/, ''), type: r.type, b: r.bytes, s: r.status }));
  return out;
}

function summarize(d, p) {
  const origin = new URL(BASE).origin;
  const kind = (r) => {
    const u = r.name.split("?")[0];
    if (/[.]css$/.test(u)) return "css";
    if (/[.]js$/.test(u) || r.type === "script") return "js";
    if (/[.](woff2?|ttf|otf)$/.test(u)) return "font";
    if (/[.](png|jpe?g|webp|avif|gif|svg|ico)$/.test(u) || r.type === "img" || u.includes("/_next/image")) return "img";
    return "other";
  };
  const by = {};
  for (const r of d.res) {
    const k = kind(r);
    const third = new URL(r.name).origin !== origin;
    for (const key of [k, third ? "third" : "first"]) {
      by[key] ??= { n: 0, transfer: 0, enc: 0, dec: 0 };
      by[key].n++;
      by[key].transfer += r.transfer;
      by[key].enc += r.enc;
      by[key].dec += r.dec;
    }
  }
  const fcp = d.m.fcp;
  // TBT de laboratório: soma de (duração - 50 ms) das tarefas longas depois do FCP, até o fim da janela observada (load + 4 s).
  const tbt = fcp == null ? null : d.m.longtasks.filter((t) => t.s >= fcp).reduce((a, t) => a + Math.max(0, t.d - 50), 0);
  return {
    ttfb: d.nav?.ttfb,
    fcp,
    lcp: d.m.lcp?.time ?? null,
    lcpEl: d.m.lcp ? `${d.m.lcp.tag}${d.m.lcp.id ? "#" + d.m.lcp.id : ""} ${d.m.lcp.url ? "[" + d.m.lcp.url.split("/").slice(-2).join("/") + "]" : ""} "${(d.m.lcp.text ?? "").trim().slice(0, 40)}"` : null,
    cls: Number(d.m.cls.toFixed(4)),
    tbt,
    longtasks: d.m.longtasks.length,
    dcl: d.nav?.dcl,
    load: d.nav?.load,
    htmlEnc: d.nav?.htmlEnc,
    htmlDec: d.nav?.htmlDec,
    domNodes: d.domNodes,
    totals: by,
    requests: d.res.length,
    renderBlocking: d.res.filter((r) => r.rb === "blocking").map((r) => r.name.replace(BASE, "")),
    thirdParty: [...new Set(d.res.filter((r) => new URL(r.name).origin !== origin).map((r) => new URL(r.name).origin))],
    jsFiles: d.res.filter((r) => kind(r) === "js").map((r) => ({ f: r.name.replace(BASE, "").slice(0, 90), enc: r.enc, dec: r.dec, transfer: r.transfer })),
    imgs: d.imgs,
  };
}

const version = await waitForChrome();
const results = { label, base: BASE, chrome: version.Browser, userAgent: version["User-Agent"], date: new Date().toISOString(), profiles: PROFILES, runs: {} };
for (const profileName of Object.keys(PROFILES)) {
  for (const path of PAGES) {
    const n = path === "/" ? HOME_RUNS : OTHER_RUNS;
    results.runs[`${profileName} ${path}`] = [];
    for (let i = 0; i < n; i++) {
      try {
        results.runs[`${profileName} ${path}`].push(await runOnce(label, profileName, path));
      } catch (e) {
        results.runs[`${profileName} ${path}`].push({ error: String(e) });
      }
    }
    console.log(`ok ${profileName} ${path} x${n}`);
    writeFileSync(out, JSON.stringify(results, null, 1));
  }
}
chrome.kill();
console.log("fim");
process.exit(0);
