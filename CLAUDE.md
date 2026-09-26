# Ma Semaine

Application web personnelle de planning de repas, liste de courses et suivi de stock.

## Utilisateur

Qassim, mobile uniquement (pas d'ordinateur), pas développeur expérimenté. Accompagnement
pédagogique étape par étape attendu — voir "Méthode de travail" plus bas.

## Objectif

- Planifier une **semaine type** (lundi → dimanche, sans dates fixes, réutilisable), 5 créneaux
  par jour : petit-déjeuner, smoko, lunch, snack, dîner.
- Générer automatiquement la **liste de courses** à partir du planning restant, moins le stock
  actuel, plus les essentiels et les envies ponctuelles (extra).
- Suivre le **stock** en temps réel, uniquement à partir d'actions réelles (voir "Semaine
  glissante" ci-dessous).
- Permettre à Qassim d'**ajouter/modifier lui-même** des plats et des ingrédients, sans dépendre
  de l'IA au quotidien.

## Stack technique

- **HTML + CSS + JavaScript**, sans framework, sans étape de build.
- Modules ES (`import`/`export`) : nécessite un serveur local pour tester
  (`python3 -m http.server`, ou équivalent) — un double-clic sur `index.html` ne suffit pas.
- **Stockage** : `localStorage` du navigateur, isolé dans un seul fichier `storage.js` (permet de
  remplacer plus tard par un vrai backend sans toucher au reste, si le multi-appareil devient
  nécessaire).
- Pas de backend, pas de base de données serveur, pas d'authentification.
- **Hébergement** : GitHub Pages (dépôt public — voir "Sécurité et vie privée").
- **Tests** : `node --test` (outil intégré à Node.js, aucune dépendance à installer), pour la
  logique de calcul uniquement (fonctions pures dans `calculs.js`, séparées de l'affichage).

## Écrans (MVP, 4 écrans)

| Écran | Rôle |
|---|---|
| **Semaine** | Semaine type, 5 créneaux/jour, un jour affiché à la fois avec pastilles des 7 jours en haut, choix du plat + portions + préparation (cuisiné ici / reste), case "Cuisiné" directement sur la carte |
| **Courses** | Liste calculée en direct, groupée par rayon, cocher "Acheté" ajoute au stock |
| **Plats & repas** | Bibliothèque de plats, filtrable par repas, ajout/modification par Qassim |
| **Stock** | Quantité par ingrédient, état (⚪ vide · 🟠 bas · 🟢 ok), essentiel + minimum, extra ponctuel |

Navigation : barre d'onglets fixe en bas (comme une appli native), 4 onglets. Le bouton "export /
import de sauvegarde" est dans un menu ⋯ en haut (pas un 5e onglet). Écran d'ouverture : Semaine,
sur le jour d'aujourd'hui. Mode sombre automatique selon le réglage du téléphone. Style sobre,
couleur d'accent verte.

## Semaine glissante (décision clé, remplace un système "Nouvelle semaine" à bouton)

Le planning affiche **toujours les 7 jours dans l'ordre fixe lundi → dimanche** : l'affichage
n'est **jamais réorganisé** pour mettre "aujourd'hui" en premier. Le jour réel du calendrier est
seulement mis en évidence (ex. pastille marquée "aujourd'hui") parmi les 7 cases toujours dans le
même ordre.

Ce qui change avec le temps, ce n'est pas l'ordre affiché, mais l'état "cuisiné" de chaque case :

- **Quand un jour réel commence** (le vrai lundi matin, le vrai mardi matin, etc.), la case
  correspondante (ex. "lundi") se réinitialise automatiquement : **le plat choisi est conservé**
  (c'est une semaine type, réutilisable), mais l'état "cuisiné" repart à "pas cuisiné" — cette case
  représente maintenant l'occurrence à venir de ce jour, pas celle de la semaine passée.
  Concrètement : si on est jeudi, les cases lundi/mardi/mercredi (à gauche, dans l'ordre fixe) ont
  déjà été réinitialisées ce matin-là et représentent donc déjà le lundi/mardi/mercredi
  **prochain**, prêtes à replanifier — pas un vieux jour non coché de cette semaine.
- **Le stock ne bouge pas à cette réinitialisation.** Il ne bouge que sur deux actions réelles :
  - cocher **Cuisiné** sur une case → déduit le stock immédiatement ; décocher → le restitue
    (sert à corriger une erreur de saisie, pas à "avancer d'un jour") ;
  - cocher **Acheté** sur un article de la liste de courses → ajoute au stock immédiatement.
- Si l'app n'est pas ouverte pendant plusieurs jours (ex. le week-end), au prochain lancement,
  **tous** les jours réels passés entre-temps sont réinitialisés d'un coup (pas seulement le
  dernier) — voir `calculs.js` → `appliquerPassageDesJours`.
- Un repas dont le jour est passé et qui n'a **pas** été coché cuisiné doit être signalé à Qassim
  à l'ouverture de l'app (ex. "As-tu mangé X ?"), pour que le stock ne devienne pas faux
  silencieusement. *(Pas encore implémenté à ce stade du projet — prévu avec l'écran Semaine.)*
- La liste de courses porte sur les 7 cases du planning (toujours les mêmes 7, dans l'ordre fixe).

Conséquence : il n'y a **pas** de bouton "Nouvelle semaine" ni de notion de "graver le stock" —
c'était une contrainte propre à l'ancien système Notion, qui ne s'applique plus ici.

## Modèle de données

- **Ingrédient** : id, nom, rayon, unité, quantité en stock, essentiel (oui/non), minimum à
  toujours avoir, extra ponctuel, équivalence cuillerée → unité de base (pour épices/liquides).
- **Plat** (MVP allégé) : id, nom, repas, étapes, liste d'ingrédients avec quantité **par
  portion**. (Temps, matériel, protéine principale : reportés après le MVP.)
- **Case de planning** : jour (lundi-dimanche), créneau, plat choisi, portions, préparation
  (cuisiné ici / reste), cuisiné (oui/non).

Stocké en `localStorage` via `storage.js`, sous une seule clé, en JSON, avec un numéro de version
du format (pour migrer les données existantes si la structure change).

## Règles de calcul

- **Besoin** (par ingrédient) = somme, sur les créneaux des 7 jours affichés avec un plat choisi,
  ni "reste" ni déjà cuisinés, de *portions × quantité par portion* (convertie en unité de base).
- **À acheter** = maximum(0, besoin + minimum essentiel + extra − stock actuel). Arrondi au
  supérieur pour les unités "pièce", inchangé pour les grammes/ml.
- Cocher **Cuisiné** sur une case : déduit immédiatement le stock des ingrédients du plat (portions
  × quantité par portion). Décocher : restitue (correction d'erreur uniquement).
- Cocher un article de la liste comme **acheté** : ajoute la quantité "à acheter" (modifiable avant
  validation) au stock, immédiatement.
- Le stock peut être négatif en interne (si le stock de départ était sous-estimé) ; affiché comme
  0 avec un avertissement, jamais bloqué.
- Un ingrédient utilisé par au moins un plat ne peut pas être supprimé (la suppression est
  refusée, avec la liste des plats concernés affichée).

## Cas limites à gérer

| Cas | Comportement attendu |
|---|---|
| Aucun plat choisi dans un créneau | Rien n'est compté dans les courses ni le stock |
| Ingrédient supprimé alors qu'il est utilisé | Suppression refusée (voir ci-dessus) |
| Quantité saisie négative ou texte au lieu d'un nombre | Refusée ou ramenée à 0, jamais de plantage |
| Portions à 0 sur un créneau cuisiné | Ne déduit rien du stock (équivalent à un créneau vide) |
| Stockage plein ou navigateur en mode privé | L'app prévient plutôt que de perdre les données silencieusement |

## Données existantes à reprendre

25 plats et ~59 ingrédients déjà définis dans le Notion de Qassim (bases "🧺 Ingrédients" et
"📖 Mes plats & repas"). À reprendre tel quel via l'API Notion connectée à cette session, pas à
recréer de zéro. Les unités en cuillères sont converties vers l'unité de stock au moment de
l'import (champ "Par c. à café" dans Notion) ; les cuillères ne sont pas une unité de stock dans
l'app.

## Sécurité et vie privée

- **Dépôt public** (contrainte de GitHub Pages gratuit) : ce fichier et tout le code sont visibles
  de tous. **Ne jamais** y mettre de données personnelles de Qassim (santé, poids, programme
  nutrition, localisation, etc.) — uniquement des informations techniques sur le projet.
- Aucun secret, clé API ou mot de passe dans ce projet : pas de service externe appelé au
  runtime, donc rien à cacher dans un `.env`.
- Aucune donnée d'usage (planning, stock) ne quitte le téléphone de Qassim : tout reste dans le
  navigateur (`localStorage`).
- Signaler toute faille repérée.

## Roadmap post-MVP (hors périmètre actuel)

- Copier un jour du planning sur un autre.
- Temps de préparation, matériel, protéine principale sur les plats.
- Suivi des macros (protéines, glucides, lipides).
- Suggestions de plats selon le stock disponible.
- Dates de péremption et alertes.
- Historique des repas mangés et plats préférés.
- Accès multi-appareil → migrer `storage.js` vers un vrai backend.
- Mode hors-ligne, application installable sur l'écran d'accueil (PWA).

## Méthode de travail (impérative)

- Vérifier la compréhension avant de coder ; poser des questions si flou.
- Découper chaque fonctionnalité en étapes testables, une à la fois.
- Avant chaque étape : annoncer quoi, quels fichiers, pourquoi.
- Code complet des fichiers modifiés, jamais de "..." à deviner, avec le chemin exact.
- Après chaque étape : indiquer précisément comment tester.
- À chaque étape qui fonctionne : rappeler de faire un commit Git et proposer le message.
- Si erreur : analyser la cause avant de corriger ; modifier seulement le nécessaire.
- Ne jamais modifier du code qui fonctionne sans le signaler.
- Dire clairement en cas d'incertitude (librairie, fonction) plutôt que d'inventer.
- Proposer des tests automatiques quand c'est pertinent.
- **Communication** : en français, direct et structuré, concepts expliqués brièvement à leur
  première apparition.
- Sur demande "RÉSUMÉ" : donner ce qui est fait, en cours, les prochaines étapes, les décisions
  techniques prises.
