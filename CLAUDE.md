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
| **Courses** | Liste calculée en direct, groupée par rayon (blocs repliables, compteur visible replié), cocher "Acheté" ajoute au stock |
| **Plats & repas** | Bibliothèque de plats, filtrable par repas, ajout/modification par Qassim |
| **Stock** | Quantité par ingrédient, état (⚪ vide · 🟠 bas · 🟢 ok), essentiel + minimum, extra ponctuel |

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
- **Plat** (MVP allégé) : id, nom, repas, étapes, liste d'ingrédients avec quantité **par
  portion**. (Temps, matériel, protéine principale : reportés après le MVP.)
- **Règle du modèle** : id, jour (lundi-dimanche), créneau, plat choisi, portions, préparation
  (cuisiné ici / reste). Pas d'état "cuisiné" ici (voir "Semaines réelles et modèle"). Plusieurs
  règles peuvent partager le même jour + créneau.
- **Élément d'historique** : par date réelle ("AAAA-MM-JJ") puis par créneau, une LISTE d'éléments
  { id, plat choisi, portions, préparation, cuisiné } — la seule couche qui porte l'état "cuisiné".

Stocké en `localStorage` via `storage.js`, sous une seule clé, en JSON, avec un numéro de version
du format (actuellement 3 ; migrations en chaîne v1 → v2 → v3 dans `storage.js` → `migrer`).

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

Les rayons (`constantes.js` → `RAYONS`) suivent le parcours d'un vrai supermarché, alimentaire
d'abord (ceux déjà utilisés par les ingrédients importés de Notion), puis non-alimentaire —
**"Hygiène"** (dentifrice, déodorant...) et **"Entretien maison"** (produits ménagers...), jamais
mélangés entre eux ni avec l'alimentaire, comme dans un vrai magasin.

**Un ingrédient n'a pas besoin d'être utilisé dans un plat pour exister.** Le mécanisme
essentiel + minimum (déjà dans le modèle de données, voir "Règles de calcul") fonctionne pour
n'importe quel article, alimentaire ou non : marqué essentiel avec un minimum, il apparaît dans la
liste de courses dès que son stock passe sous ce minimum, **même si aucun plat ne le demande cette
semaine** (ex. dentifrice, ou huile d'olive même en semaine sans plat qui en a besoin). Ça permet à
l'app de servir à **toutes** les courses de Qassim, pas seulement à la nourriture liée au planning.
L'écran Stock (à construire) est l'endroit prévu pour cocher essentiel/minimum et ajouter un tout
nouvel ingrédient (y compris non-alimentaire, sans l'associer à aucun plat).

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
