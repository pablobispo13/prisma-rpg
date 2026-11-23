// Service worker do PWA (Prisma RPG).
//
// Regra principal: NADA de /api é cacheado. Combate, fichas e rolagens são
// estado vivo — mostrar um HP ou turno velho do cache seria pior do que
// mostrar "sem conexão". O SW só acelera o shell (JS/CSS/ícones) e dá uma
// página de offline amigável quando a navegação falha.
//
// Ao mudar a estratégia de cache, incremente VERSION — o activate apaga os
// caches das versões anteriores.
const VERSION = "v3";
const STATIC_CACHE = `prisma-static-${VERSION}`;
const PAGES_CACHE = `prisma-pages-${VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  OFFLINE_URL,
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("prisma-") && k !== STATIC_CACHE && k !== PAGES_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Só mesma origem — Pusher, Cloudinary e afins passam direto pela rede
  if (url.origin !== self.location.origin) return;
  // Estado vivo: nunca intercepta a API
  if (url.pathname.startsWith("/api/")) return;
  // Telas de senha: nunca guardar no cache (links de recuperação são de uso único)
  if (url.pathname === "/redefinir-senha" || url.pathname === "/esqueci-senha") return;

  // Navegação (abrir/recarregar página): rede primeiro; se cair, usa a
  // última versão salva da página ou a tela de offline
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(PAGES_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match(OFFLINE_URL)))
    );
    return;
  }

  // Bundles do Next têm hash no nome → imutáveis → cache primeiro
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Demais arquivos estáticos (ícones, imagens locais de personagem):
  // responde do cache se tiver e atualiza em segundo plano
  if (/\.(png|jpe?g|svg|webp|gif|ico|woff2?)$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
