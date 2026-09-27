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
- Suivre le **stock** en temps réel, uniquement à partir d'actions réelles (voir "Semaines
  réelles et modèle" ci-dessous).
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
- **Anti-cache** : `index.html` charge `app.js` et `style.css` avec un paramètre `?v=AAAAMMJJx`
  (ex. `?v=20260926a`). Safari mobile a tendance à garder une ancienne version de ces fichiers en
  cache même après un rechargement de la page. **À chaque modification de `app.js` ou
  `style.css`, changer ce numéro de version dans `index.html`** (les deux endroits), sinon Qassim
  peut continuer à voir l'ancienne version sans erreur ni message.

## Écrans (MVP, 4 écrans)

| Écran | Rôle |
|---|---|
| **Semaine** | Navigation entre semaines réelles (1 en arrière, 2 en avance), 7 jours en ordre fixe lundi → dimanche, 5 créneaux/jour, choix du plat + portions + préparation (cuisiné ici / reste) avec "juste ce jour" ou "à partir d'aujourd'hui", case "Cuisiné" directement sur la carte |
| **Courses** | Liste calculée en direct, groupée par rayon (blocs repliables, compteur visible replié), cocher "Acheté" ajoute au stock. "+ Ajouter un extra" et "✏️ Éditer les rayons" (masqué par défaut) — voir "Écran Catalogue" et "Rayons éditables" ci-dessous |
| **Plats & repas** | Filtre repas **Tous / ⭐ Favoris** + un bouton par repas (dynamique, Déjeuner et Dîner fusionnés), favori basculable sur la carte. "✏️ Éditer les repas" (masqué par défaut) pour renommer/supprimer/ajouter un repas — voir "Repas éditables" ci-dessous. 2e rangée de filtres **Étiquettes** (Sucré, Salé, Sain... — sélection multiple, logique ET) avec "✏️ Éditer les étiquettes" (masqué par défaut) — voir "Étiquettes éditables" ci-dessous. "+ Nouveau plat" (nom + repas) enchaîne sur l'éditeur complet : repas et étiquettes (chacun avec un "+ Nouveau..." pour en créer un sans quitter la recette), portions de référence, étapes (texte libre), ingrédients ajoutés via le Catalogue (quantité par portion), suppression refusée si utilisé dans le modèle ou l'historique |
| **Stock** | Filtres **Tous** (ce qui est réellement en stock : quantité > 0, ou essentiel même à 0 pour rappeler de racheter) / **Essentiels**. Quantité par ingrédient, état (⚪ vide · 🟠 bas · 🟢 ok), essentiel + minimum. "+ Ajouter un ingrédient" et "✏️ Éditer les rayons" (masqué par défaut) — voir "Écran Catalogue" et "Rayons éditables" ci-dessous |

Navigation : barre d'onglets fixe en bas (comme une appli native), 4 onglets. Le bouton "export /
import de sauvegarde" est dans un menu ⋯ en haut (pas un 5e onglet). Écran d'ouverture : Semaine,
sur le jour d'aujourd'hui. Mode sombre automatique selon le réglage du téléphone. Style sobre,
couleur d'accent verte.

## Semaines réelles et modèle (décision clé, remplace un système "Nouvelle semaine" à bouton)

**Historique de la décision** : on est passé par deux versions avant celle-ci. D'abord une
"semaine type sans dates, avec réinitialisation automatique" (les jours passés se remettaient à
zéro tout seuls) — abandonnée car elle empêchait Qassim de corriger un jour oublié une fois qu'il
était passé (ex. se rendre compte le mardi qu'on a oublié de cocher lundi). La version actuelle
règle ce problème en gardant un vrai historique par date, navigable.

**Deux couches de données** (voir `storage.js` et `calculs.js`) :
- **`modele`** : la "semaine type", une liste de **règles** { id, jour, créneau, plat, portions,
  préparation }. C'est la valeur par défaut, modifiable à tout moment.
- **`historique`** : par date RÉELLE ("AAAA-MM-JJ") puis par créneau, une **liste** de plats réels
  { id, plat, portions, préparation, cuisiné }, créée à la demande (la première fois qu'une date
  précise est consultée ou modifiée) en copiant les règles du modèle. C'est là que vit l'état
  "cuisiné", propre à chaque date, **jamais réinitialisé tout seul** : Qassim peut toujours revenir
  corriger un jour passé, aussi loin que la navigation le permet.

**Plusieurs plats par créneau** : une case (jour + créneau, ex. "lundi déjeuner") peut contenir
**plusieurs plats en même temps** (ex. "fruits" + "œufs" comme deux choix séparés), pas un seul.
Concrètement : plusieurs règles du modèle peuvent partager le même jour + créneau, et la liste
d'historique d'un jour + créneau peut contenir plusieurs éléments. Chaque plat a son propre état
"cuisiné" (on peut cocher les œufs sans cocher les fruits). Actions possibles sur une case :
**ajouter** un plat (juste ce jour, ou à partir d'aujourd'hui — ajoute une règle, ne remplace pas
les plats déjà prévus), **modifier** les portions/préparation d'un plat déjà présent (toujours
juste ce jour), **retirer** un plat (toujours juste ce jour — s'il venait d'une règle récurrente,
elle n'est pas touchée et le plat réapparaît les autres jours).

**Important pour le code** : quand un plat est encore un simple aperçu du modèle (pas encore
enregistré dans l'historique), son `id` affiché reprend celui de la règle d'origine — jamais un id
généré à la volée. Un id lu en aperçu doit rester valable si, juste après, une action (cocher,
retirer...) crée réellement l'enregistrement du jour, sinon l'action échoue silencieusement (bug
réel rencontré et corrigé à l'étape 4d).

**Affichage** : toujours les 7 jours dans l'ordre fixe lundi → dimanche (jamais réorganisé pour
mettre "aujourd'hui" en premier). Le jour réel du calendrier est seulement mis en évidence parmi
les 7 cases. **Navigation entre semaines** : 1 semaine en arrière, 2 semaines en avance par rapport
à la semaine réelle en cours (flèches précédente/suivante). Une semaine future pas encore visitée
démarre en reprenant le modèle (pas vide, pas une copie figée — voir "à partir d'aujourd'hui"
ci-dessous).

**Ajouter un plat à un jour précis** propose toujours deux options :
- **"Juste ce jour"** : n'ajoute qu'à cette date précise (`historique`), sans toucher au modèle.
- **"À partir d'aujourd'hui"** : ajoute AUSSI une règle au `modele` pour ce jour de la semaine +
  créneau → s'appliquera à tous les jours futurs pas encore consultés (en plus des plats déjà
  prévus ce jour-là, pas à leur place). **Attention, portée exacte** : ça ne change QUE ce jour de
  la semaine (ex. tous les jeudis futurs), pas tous les jours suivants sans distinction — vendredi,
  samedi, etc. gardent leurs propres plats par défaut. C'est un point qui peut prêter à confusion,
  à bien expliciter dans l'interface.

**Le stock ne bouge que sur deux actions réelles**, peu importe la date affichée ou le nombre de
jours écoulés :
- cocher **Cuisiné** sur une case → déduit le stock immédiatement ; décocher → le restitue (sert à
  corriger une erreur de saisie) ;
- cocher **Acheté** sur un article de la liste de courses → ajoute au stock immédiatement.

**Repas prévu à l'avance mais pas mangé** (ex. un batch cuisiné le dimanche pour toute la semaine,
finalement pas terminé, ou un jour où Qassim change d'avis et sort manger dehors) : rien à faire
dans l'app. Le stock ne suit que les ingrédients bruts, déduits au moment de la cuisson — pas les
repas ensuite mangés ou non. Une case "reste" ne touche jamais au stock, cochée ou non. Si Qassim
sait d'avance qu'il ne mangera rien à un créneau (ex. restaurant), il laisse simplement `platId`
vide : la case ne compte dans rien.

Un repas dont le jour est passé et qui n'a **pas** été coché cuisiné n'est **pas** signalé
automatiquement pour l'instant (contrairement à une version antérieure de cette section) : Qassim
navigue lui-même vers le jour concerné pour le corriger s'il le souhaite. *(Une relance automatique
reste une piste possible, voir Roadmap post-MVP.)*

**La liste de courses (besoin) porte sur la semaine réelle en cours uniquement** (celle qui
contient aujourd'hui), pas sur les semaines passées (de l'historique consultable, pas des achats à
faire) ni sur les semaines futures (à remplir au fur et à mesure).

Conséquence : il n'y a **pas** de bouton "Nouvelle semaine" ni de notion de "graver le stock" —
c'était une contrainte propre à l'ancien système Notion, qui ne s'applique plus ici.

## Modèle de données

- **Ingrédient** : id, nom, rayon, unité, quantité en stock, essentiel (oui/non), minimum à
  toujours avoir, extra ponctuel, équivalence cuillerée → unité de base (pour épices/liquides).
- **Plat** (MVP allégé) : id, nom, repas (id, un seul), étapes, portions de référence, favori
  (oui/non), étiquettes (liste d'ids, plusieurs à la fois), liste d'ingrédients avec quantité
  **par portion**. (Temps, matériel, protéine principale : reportés après le MVP.)
- **Règle du modèle** : id, jour (lundi-dimanche), créneau, plat choisi, portions, préparation
  (cuisiné ici / reste). Pas d'état "cuisiné" ici (voir "Semaines réelles et modèle"). Plusieurs
  règles peuvent partager le même jour + créneau.
- **Élément d'historique** : par date réelle ("AAAA-MM-JJ") puis par créneau, une LISTE d'éléments
  { id, plat choisi, portions, préparation, cuisiné } — la seule couche qui porte l'état "cuisiné".

Stocké en `localStorage` via `storage.js`, sous une seule clé, en JSON, avec un numéro de version
du format (actuellement 7 ; migrations en chaîne v1 → v2 → v3 → v4 → v5 → v6 → v7 dans
`storage.js` → `migrer`).

## Règles de calcul

- **Besoin** (par ingrédient) = somme, sur les créneaux des 7 jours de la semaine réelle en cours
  (cases effectives : historique si déjà consulté, sinon aperçu du modèle) avec un plat choisi, ni
  "reste" ni déjà cuisinés, de *portions × quantité par portion* (convertie en unité de base).
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
- Un plat utilisé dans le modèle (règles de la semaine type) ou dans l'historique (n'importe
  quelle date, passée ou future) ne peut pas être supprimé, même logique (suppression refusée,
  avec le détail des jours/dates concernés).

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

## Rayons et articles non-alimentaires

Les rayons suivent le parcours d'un vrai supermarché, alimentaire d'abord (ceux déjà utilisés par
les ingrédients importés de Notion), puis non-alimentaire — **"Hygiène"** (dentifrice,
déodorant...) et **"Entretien maison"** (produits ménagers...), jamais mélangés entre eux ni avec
l'alimentaire, comme dans un vrai magasin.

**Un ingrédient n'a pas besoin d'être utilisé dans un plat pour exister.** Le mécanisme
essentiel + minimum (déjà dans le modèle de données, voir "Règles de calcul") fonctionne pour
n'importe quel article, alimentaire ou non : marqué essentiel avec un minimum, il apparaît dans la
liste de courses dès que son stock passe sous ce minimum, **même si aucun plat ne le demande cette
semaine** (ex. dentifrice, ou huile d'olive même en semaine sans plat qui en a besoin). Ça permet à
l'app de servir à **toutes** les courses de Qassim, pas seulement à la nourriture liée au planning.

### Rayons éditables

Les rayons ne sont **pas** figés dans le code (contrairement à la version initiale du MVP) : ce
sont des objets `{ id, nom }` stockés dans l'état (`etat.rayons`), au même titre que les
ingrédients. Le `nom` est éditable par Qassim (renommer un rayon, ex. "Fruits et légumes" →
"Marché du dimanche" renomme la catégorie pour tous les ingrédients qui y sont rangés), l'`id` ne
change jamais — c'est lui que les ingrédients référencent (`ingredient.rayon`), pas le nom. Un
rayon peut aussi être supprimé, **sauf** s'il contient encore au moins un ingrédient (suppression
refusée, avec la liste des ingrédients concernés — même logique que la suppression d'un
ingrédient utilisé par un plat).

Accès à cette gestion (renommer/supprimer/ajouter un rayon) : dans l'écran **Catalogue** (voir
ci-dessous), où chaque rayon a toujours son ✏️. Aussi depuis **Stock** et **Courses**, via un
bouton discret "✏️ Éditer les rayons" — masqué par défaut (pas un geste du quotidien), il révèle
le même ✏️ sur chaque rayon une fois activé. Sur Stock, l'activer montre exceptionnellement TOUS
les rayons, même ceux vides sous le filtre courant (ex. Essentiels), sinon impossibles à
retrouver pour les renommer ; sur Courses, seuls les rayons qui contiennent quelque chose à
acheter apparaissent (le Catalogue reste le seul endroit qui montre systématiquement les 13
rayons).

### Écran Catalogue (accessible depuis "+ Ajouter un ingrédient" dans Stock, "+ Ajouter un extra"
dans Courses, et "➕ Ajouter un ingrédient" dans l'éditeur d'un plat)

Contrairement à l'écran Stock (qui ne montre que ce que Qassim a réellement — voir "Règles de
calcul" pour la logique vide/bas/ok), le Catalogue montre **tous** les ingrédients, y compris ceux
à 0 g et non essentiels, pour pouvoir retrouver n'importe lequel. Il propose : une recherche par
nom (insensible aux accents et à la ligature œ, ex. "oeufs" trouve "Œufs"), un parcours par rayon
(blocs repliables comme Courses/Stock), un bouton pour créer un tout nouvel ingrédient, et un
bouton pour gérer les rayons (renommer/supprimer/ajouter — voir "Rayons éditables" ci-dessus).

Le Catalogue s'adapte à l'endroit d'où il est ouvert (même écran, trois comportements) :
- depuis **Stock** ("+ Ajouter un ingrédient") : toucher un ingrédient ouvre son panneau d'édition
  habituel (stock, essentiel, minimum, suppression), pour lui redonner du stock (sinon un
  ingrédient à 0 g et pas essentiel deviendrait injoignable) ;
- depuis **Courses** ("+ Ajouter un extra") : toucher un ingrédient ouvre une étape quantité +
  "Ajouter cet extra", pour un ingrédient qu'on n'a pas à la maison mais qu'on sait exister dans le
  catalogue ;
- depuis l'éditeur d'un **plat** ("➕ Ajouter un ingrédient", écran Plats & repas) : toucher un
  ingrédient ouvre une étape "quantité par portion", puis ajoute la ligne à la recette.

Dans tous les cas, fermer ce panneau d'action revient au Catalogue (pas à l'écran de départ), pour
en enchaîner plusieurs à la suite ; fermer le Catalogue lui-même revient à l'écran de départ (ou,
depuis l'éditeur de plat, à l'éditeur lui-même — le Catalogue y est ouvert PAR-DESSUS un autre
panneau, pas directement depuis un écran).

## Repas éditables (écran Plats & repas)

Même principe que les rayons/étiquettes : les repas (Petit-déjeuner, Smoko, Snack... — voir
"Modèle de données") sont des objets `{ id, nom }` stockés dans l'état (`etat.repas`), pas figés
dans le code. **Déjeuner et Dîner sont fusionnés en une seule catégorie "Déjeuner/Dîner" dès le
départ** (décision de Qassim : ce sont pour lui les mêmes plats, interchangeables entre le lunch
et le dîner). Contrairement aux étiquettes, un plat n'a qu'**un seul** repas à la fois
(`plat.repas` est un id seul, pas une liste).

**Distinction importante avec les créneaux de la Semaine** : les 5 créneaux fixes de la journée
(petit-dejeuner/smoko/lunch/snack/diner — voir "Semaines réelles et modèle") restent des créneaux
horaires FIXES, jamais renommés ni fusionnés (ce sont des moments de la journée, pas des
catégories de plats). C'est le **repas associé à chaque créneau** (`CRENEAU_INFOS` dans `app.js`,
champ `repasId`) qui référence un repas éditable — `lunch` ET `diner` référencent tous les deux
`dejeuner-diner`, donc piochent dans la même liste de plats. Renommer un repas (ex. "Smoko" →
"Goûter", une histoire de vocabulaire personnel/familial) ne casse jamais ce lien : l'id ne change
jamais, seul le nom affiché change, partout où il apparaît (filtre de l'écran Plats, picker de
repas d'un plat).

Un repas peut être renommé ou supprimé, **sauf** si au moins un plat l'utilise encore (suppression
refusée, avec la liste de ces plats — même logique que rayon/étiquette). Accès à cette gestion :
un bouton discret "✏️ Éditer les repas" sur l'écran Plats & repas (masqué par défaut), qui révèle
un ✏️ sur chaque repas une fois activé, plus "+ Ajouter un repas". **Une catégorie de repas
inconnue héritée de Notion** (ex. "Plaisir occasionnel", "Préparation de base") n'est jamais
perdue : elle obtient sa propre entrée à la volée au moment de la migration, éditable comme les
autres.

Les boutons "+ Nouveau repas" / "+ Nouvelle étiquette" existent aussi **directement dans
l'éditeur d'un plat** (pas seulement sur l'écran Plats) : Qassim peut créer une catégorie
manquante sans interrompre la saisie d'une recette, avec retour automatique à l'éditeur en cours.

## Étiquettes éditables (écran Plats & repas)

Même principe que les rayons éditables ci-dessus, appliqué aux plats : les étiquettes (Sucré,
Salé, Sain, Sans porc, Végétarien, Dessert/Gâteau, Rapide à préparer au départ) sont des objets
`{ id, nom }` stockés dans l'état (`etat.etiquettes`), pas figées dans le code. **Un plat peut
porter plusieurs étiquettes à la fois** (contrairement au rayon d'un ingrédient, qui est unique) —
`plat.etiquettes` est une liste d'ids, pas un id seul.

**Décision clé sur les filtres** (validée avec Qassim, comme un système à la Deliveroo/Uber Eats) :
cocher plusieurs étiquettes en même temps applique une logique **ET**, pas OU — un plat doit
porter TOUTES les étiquettes cochées pour apparaître (ex. cocher "Sain" + "Sans porc" ne montre
que les plats qui sont les deux à la fois, pas l'un ou l'autre). Les étiquettes restent une liste
**plate, sans catégories** (pas de regroupement "Goût"/"Régime"...) — plus simple à gérer, quitte à
revoir si le nombre d'étiquettes grossit beaucoup.

Une étiquette peut être renommée (l'id ne change jamais, les plats restent liés) ou supprimée,
**sauf** si au moins un plat la porte encore (suppression refusée, avec la liste de ces plats —
même logique que pour un rayon ou un ingrédient). Accès à cette gestion : un bouton discret
"✏️ Éditer les étiquettes" sur l'écran Plats & repas (masqué par défaut, pas un geste du
quotidien), qui révèle un ✏️ sur chaque étiquette une fois activé, plus "+ Ajouter une étiquette".

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
