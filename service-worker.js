// Ma Semaine — service worker : rend l'appli utilisable hors connexion
// (chantier, zone sans réseau...) une fois qu'elle a été ouverte au moins
// une fois avec du réseau.
//
// Stratégie "réseau d'abord, secours sur le cache" : à chaque requête, on
// essaie toujours le réseau en premier (pour avoir la version la plus
// fraîche — cohérent avec le paramètre anti-cache ?v= de index.html), et on
// ne sert le cache que si le réseau échoue. Pas de liste de fichiers à
// maintenir à la main : tout ce qui est chargé avec succès est mis en cache
// au passage, pour servir de secours la prochaine fois.

const CACHE_NAME = "ma-semaine-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (evenement) => {
  evenement.waitUntil(
    caches.keys().then((cles) =>
      Promise.all(cles.filter((cle) => cle !== CACHE_NAME).map((cle) => caches.delete(cle)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (evenement) => {
  // Seules les requêtes GET sont mises en cache (les autres — il n'y en a
  // pas dans cette appli 100% locale — ne le seraient de toute façon pas).
  if (evenement.request.method !== "GET") return;

  evenement.respondWith(
    fetch(evenement.request)
      .then((reponse) => {
        const copie = reponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(evenement.request, copie));
        return reponse;
      })
      .catch(() => caches.match(evenement.request))
  );
});
