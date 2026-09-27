/* global self, caches, fetch, Response, URL */
// Service worker Mbolo Santé (hors ligne, économie de données). Source unique : copiée à
// l'identique dans public/ de chaque application (un test vérifie qu'elles sont identiques).
// - fichiers de l'application (/assets/, noms uniques par version) : téléphone d'abord ;
// - pages : réseau d'abord, téléphone si pas de réseau ;
// - API et connexion (Keycloak) : jamais mises en cache (données personnelles, jetons).
const VERSION = 'mbolo-v1';
const COQUILLE = ['/', '/manifest.webmanifest', '/icone.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(COQUILLE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const requete = e.request;
  const url = new URL(requete.url);
  if (requete.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(requete).then(
        (trouve) =>
          trouve ??
          fetch(requete).then((r) => {
            if (r.ok) {
              const copie = r.clone();
              void caches.open(VERSION).then((c) => c.put(requete, copie));
            }
            return r;
          }),
      ),
    );
    return;
  }

  if (requete.mode === 'navigate') {
    // La page est toujours servie sans paramètres (code de connexion jamais mis en cache).
    e.respondWith(
      fetch(requete)
        .then((r) => {
          if (r.ok && url.search === '') {
            const copie = r.clone();
            void caches.open(VERSION).then((c) => c.put('/', copie));
          }
          return r;
        })
        .catch(() => caches.match('/').then((r) => r ?? Response.error())),
    );
    return;
  }

  if (COQUILLE.includes(url.pathname)) {
    e.respondWith(caches.match(requete).then((r) => r ?? fetch(requete)));
  }
});
