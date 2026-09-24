// Service worker do Scriptorium Bíblico: funciona offline.
const VERSION = "scriptorium-v3";
const SHELL = [
  "./", "./index.html", "./config.js", "./manifest.webmanifest", "./privacidade.html", "./manual.html",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/favicon-32.png", "./icons/apple-touch-icon.png",
  "./data/intro.json", "./data/enc.json", "./data/adv.json", "./data/bib_TB.json"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !fonts) return;
  // Página e configuração: rede primeiro (para receber atualizações), cache se offline.
  if (req.mode === "navigate" || url.pathname.endsWith("/config.js") || url.pathname.endsWith("/index.html")) {
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match("./index.html"))));
    return;
  }
  // Dados, bibliotecas e fontes: cache primeiro.
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  })));
});
