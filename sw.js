// Service worker : réseau d'abord (3 s max si une copie existe), copie locale en secours.
// Il ne met en cache que les fichiers de l'application (même origine), jamais l'API ni tes fichiers.
const CACHE = "mes-fichiers-v3";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./css/app.css",
  "./js/main.js", "./js/actions.js", "./js/shareActions.js", "./js/api.js", "./js/config.js", "./js/filetypes.js", "./js/session.js", "./js/state.js", "./js/utils.js",
  "./js/services/files.js", "./js/services/upload.js", "./js/services/shares.js",
  "./js/ui/dialog.js", "./js/ui/gauge.js", "./js/ui/menu.js", "./js/ui/preview.js", "./js/ui/render.js", "./js/ui/role.js", "./js/ui/shares.js", "./js/ui/thumbs.js", "./js/ui/toast.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const net = fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    });
    if (!cached) return net.catch(() => caches.match("./index.html").then((r) => r || Response.error()));
    // copie dispo : on laisse 3 s au réseau, sinon on sert la copie (connexion lente / hors ligne)
    return Promise.race([net, new Promise((r) => setTimeout(() => r(cached), 3000))]).catch(() => cached);
  })());
});
