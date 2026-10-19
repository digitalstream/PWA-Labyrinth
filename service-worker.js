const CACHE = 'labyrinth-marble-v11';
const ASSETS = [
  './', './index.html', './style.css', './app.js', './manifest.json',
  './modules/Game.js', './modules/MazeGenerator.js', './modules/Physics.js',
  './modules/BoardRenderer.js', './modules/HazardPlanner.js', './icons/marble.svg', './icons/marble192.png', './icons/marble512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  // An update waits until old game tabs close, preserving an in-progress journey.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('labyrinth-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try { return await fetch(request); }
    catch (error) {
      if (request.mode === 'navigate') return cache.match('./index.html');
      throw error;
    }
  })());
});
