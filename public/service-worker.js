const CACHE_NAME = 'rei-do-abs-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.png',
  'https://cdn.tailwindcss.com'
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Tenta cachear arquivos estáticos cruciais
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
         console.warn('Falha ao cachear alguns recursos estáticos:', err);
      });
    })
  );
});

// Ativação e limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Interceptação de requisições
self.addEventListener('fetch', (event) => {
  // Ignora requisições de API (Trello/Gemini) para garantir dados frescos,
  // mas poderia implementar estratégias de fallback se necessário.
  if (event.request.url.includes('api.trello.com') || event.request.url.includes('generativelanguage.googleapis.com')) {
      return; 
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Cache First strategy para assets estáticos
      return response || fetch(event.request).catch(() => {
          // Fallback para offline (opcional: retornar uma página offline.html)
          if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
          }
      });
    })
  );
});