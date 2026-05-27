/**
 * PWA — evita servir versão antiga do app:
 * - NÃO usar cache-first em HTML / navegação (era a causa de "às vezes abre versão velha").
 * - HTML: rede primeiro; cache só como fallback offline.
 * - Nome do cache versionado para limpar caches antigos após deploy.
 */
const CACHE_VERSION = 'rei-do-abs-v5';
const CACHE_NAME = `static-${CACHE_VERSION}`;

/** Só pré-cache de assets que não mudam o shell do app; evita travar index.html antigo. */
const ASSETS_TO_CACHE = ['/manifest.json', '/logo.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[SW] Falha ao pré-cachear:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) return caches.delete(name);
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

function isSameOriginApi(url) {
  try {
    const u = new URL(url, self.location.origin);
    return u.origin === self.location.origin && u.pathname.startsWith('/api');
  } catch {
    return false;
  }
}

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  if (url.includes('api.trello.com') || url.includes('generativelanguage.googleapis.com')) {
    return;
  }

  // APIs do próprio app: sempre rede direta (evita cache / comportamento estranho em POST multipart no tablet)
  if (isSameOriginApi(url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Só navegação top-level (evita tratar outros GET como HTML)
  const isNavigation = event.request.mode === 'navigate';

  // Documentos / SPA: rede primeiro → evita versão antiga do bundle
  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((r) => r || caches.match('/index.html')))
    );
    return;
  }

  // Demais recursos (JS/CSS com hash, imagens): cache primeiro, depois rede
  event.respondWith(
    caches.match(event.request).then((response) => {
      return (
        response ||
        fetch(event.request).catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        })
      );
    })
  );
});
