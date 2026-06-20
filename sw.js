// Minimaler Service Worker, nur damit Chrome die App als installierbare PWA erkennt
// (Voraussetzung für persistente Dateizugriffsrechte). Kein Offline-Caching,
// da die App auf CDN-Skripte und die lokale Datendatei angewiesen ist.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
