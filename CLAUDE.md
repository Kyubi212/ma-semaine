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
| **Semaine** | Section "🍱 Repas prêts" en haut (stock de repas consommables sans passer par le planning — voir "Repas prêts" ci-dessous), puis navigation entre semaines réelles (1 en arrière, 2 en avance), 7 jours en ordre fixe lundi → dimanche, 5 créneaux/jour. Choisir un plat propose les mêmes filtres que l'écran Plats & repas (repas à choix unique + Favoris indépendant + étiquettes à choix multiple ET), par défaut sur le repas du créneau mais changeable. Portions **par personne**, avertissement non bloquant si le stock est insuffisant, case "🍽️ Mangé" (déduit le stock) directement sur la carte — voir "Mangé (déduit le stock)" ci-dessous |
| **Courses** | Liste calculée en direct, groupée par rayon (blocs repliables, compteur visible replié), cocher "Acheté" ajoute au stock. "+ Ajouter un extra" et "✏️ Éditer les rayons" (masqué par défaut) — voir "Écran Catalogue" et "Rayons éditables" ci-dessous |
| **Plats & repas** | Recherche par nom + bouton **"🔧 Filtres"** (compteur si actifs) ouvrant un panneau à part avec Favoris (case indépendante), Repas (choix unique, dynamique, Déjeuner/Dîner et Snack/Goûter fusionnés) et Étiquettes (choix multiple, logique ET) — voir "Panneau Filtres" ci-dessous. Chaque carte affiche repas · ingrédients · temps total · matériel · étiquettes. "+ Nouveau plat" (nom + repas) enchaîne sur l'éditeur complet : repas, étiquettes et matériel (chacun avec un "+ Nouveau..." pour en créer un sans quitter la recette), portions de référence, matériel requis, temps de préparation/cuisson, étapes (texte libre), ingrédients ajoutés via le Catalogue avec la quantité **telle que donnée par la recette d'origine** (voir "Portions de référence et saisie des quantités" plus bas), suppression refusée si utilisé dans le modèle ou l'historique |
| **Stock** | Filtres **Tous** (ce qui est réellement en stock : quantité > 0, ou essentiel même à 0 pour rappeler de racheter) / **Essentiels**. Quantité par ingrédient, état (⚪ vide · 🟠 bas · 🟢 ok), essentiel + minimum. "+ Ajouter un ingrédient" et "✏️ Éditer les rayons" (masqué par défaut) — voir "Écran Catalogue" et "Rayons éditables" ci-dessous |

Navigation : barre d'onglets fixe en bas (comme une appli native), 4 onglets. Un menu ⋯ en haut
propose pour l'instant "🗑️ Réinitialiser avec les données de base" (efface `localStorage` via
`effacerStockage()` dans `storage.js`, confirmation requise, irréversible — recharge l'app avec
le catalogue de base de `data.js`) ; l'export/import de sauvegarde y sera ajouté plus tard (pas
encore fait, voir Roadmap). **Important** : modifier `data.js` (rayons, ingrédients, plats) ne
change RIEN à ce que Qassim a déjà sur son téléphone tant qu'il n'utilise pas ce bouton — les
migrations (`storage.js` → `migrer`) ne touchent que la STRUCTURE des données, jamais leur
contenu. Écran d'ouverture : Semaine, sur le jour d'aujourd'hui. Mode sombre automatique selon le
réglage du téléphone. Style sobre, couleur d'accent verte.

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

**Choisir un plat pour un créneau** propose les mêmes filtres que l'écran Plats & repas (repas à
choix unique, ⭐ Favoris indépendant, étiquettes à choix multiple ET — voir "Étiquettes
éditables"), par défaut sur le repas du créneau ouvert mais entièrement changeable : Qassim peut
ex. mettre un plat "Petit-déjeuner" au déjeuner (brunch), ou ne voir que ses plats favoris. Chaque
état de filtre est propre à ce panneau (pas partagé avec l'écran Plats & repas). Les portions sont
toujours **par personne**, précisé explicitement dans l'interface.

### Mangé (déduit le stock) — anciennement "Cuisiner / manger, sans cuisiner"

**Historique de la décision** : une première version distinguait "👨‍🍳 Cuisiner" (préparé sur
place) et "🍽️ Manger, sans cuisiner" (reste, plat tout prêt), avec une case à cocher séparée pour
le premier. Qassim a trouvé ça confus (trop de cases, deux mots proches — "cuisiné"/"cuisiner") et
a demandé un système plus simple, à l'occasion d'un cas d'usage concret : un plat offert par son
voisin, qu'il mettra au frigo et mangera plus tard sans le renseigner dans le planning du tout
(voir "Repas prêts" ci-dessous, qui répond à ce cas). Conséquence sur le planning jour par jour :
la distinction cuisiner/reste a disparu, chaque plat prévu à un créneau est désormais implicitement
"à cuisiner", avec une seule case.

Chaque élément prévu à un créneau porte une case unique **"🍽️ Mangé (déduit le stock)"** : à cocher
une fois préparé et mangé — jusque-là, aucun effet sur le stock. Décocher restitue le stock (sert
à corriger une erreur de saisie). Un avertissement non bloquant (voir "Avertissement stock
insuffisant" ci-dessous) prévient si le stock actuel ne suffit pas pour les portions choisies, sans
jamais empêcher d'ajouter le plat ou de cocher la case.

**Pas de 3e état "ne pas manger"** : ça correspond simplement à ne choisir aucun plat pour ce
créneau, ou à retirer avec ✕ celui déjà présent (déjà couvert par "Aucun plat choisi dans un
créneau" dans les Cas limites) — pas besoin d'un champ de plus pour ça.

**Le stock ne bouge que sur deux actions réelles**, peu importe la date affichée ou le nombre de
jours écoulés :
- cocher **🍽️ Mangé** sur un élément prévu → déduit le stock immédiatement ; décocher → le
  restitue (sert à corriger une erreur de saisie) ;
- cocher **Acheté** sur un article de la liste de courses → ajoute au stock immédiatement.

**Repas prévu à l'avance mais pas mangé** (ex. un jour où Qassim change d'avis et sort manger
dehors) : rien à faire dans l'app. Le stock ne suit que les ingrédients bruts, déduits au moment
de la case cochée — pas les repas ensuite mangés ou non. Si Qassim sait d'avance qu'il ne mangera
rien à un créneau (ex. restaurant), il laisse simplement le créneau vide (aucun plat choisi, ou
retiré avec ✕) : la case ne compte dans rien.

Un repas dont le jour est passé et qui n'a **pas** été coché "🍽️ Mangé" n'est **pas** signalé
automatiquement pour l'instant : Qassim navigue lui-même vers le jour concerné pour le corriger
s'il le souhaite. *(Une relance automatique reste une piste possible, voir Roadmap post-MVP.)*

### Avertissement stock insuffisant

Dès qu'un plat est prévu (déjà dans l'historique/modèle) ou en train d'être ajouté à un créneau
(avant même de valider), l'appli calcule si le stock actuel d'ingrédients suffit pour le nombre de
portions choisi (`ingredientsManquantsPourPlat` dans `calculs.js`) et affiche, si besoin, une
ligne rouge non bloquante listant chaque ingrédient manquant avec la quantité qui ferait défaut
(ex. "⚠️ Il manque : Banane (1 pièce), Miel (7 g)"). **Décision clé (choisie par Qassim parmi deux
options proposées)** : ça prévient sans jamais bloquer — Qassim peut toujours ajouter le plat ou
cocher "🍽️ Mangé" même si le stock est insuffisant (le stock devient alors négatif en interne, voir
"Règles de calcul"). Cet avertissement disparaît une fois l'élément coché "🍽️ Mangé" (plus besoin
d'avertir sur un repas déjà comptabilisé).

### Repas prêts (section dédiée sur l'écran Semaine, indépendante du planning jour par jour)

**Cas d'usage à l'origine** : un voisin offre un plat à Qassim (recette inconnue), qui le mettra au
frigo et le mangera un autre jour, sans vouloir le caser dans un jour + créneau précis du planning.
Ou l'inverse : Qassim cuisine un batch un dimanche et veut simplement noter "j'ai ça de prêt", sans
détailler quel jour il le mangera.

`etat.repasPrets` est une liste indépendante du `modele` et de l'`historique`, chaque entrée
`{ id, nom, platId, portions }` :
- **`nom`** : libre, tapé par Qassim (ex. "Plat mongol du voisin") — pas besoin d'un vrai plat du
  catalogue pour exister ;
- **`platId`** : optionnel. Si Qassim lie l'entrée à un plat déjà connu du catalogue (ex. un batch
  qu'il vient de cuisiner), le stock des ingrédients de ce plat est déduit **immédiatement** à la
  création de l'entrée (`ajouterRepasPret` dans `calculs.js`), comme si "🍽️ Mangé" avait été coché
  sur-le-champ — cohérent avec la réalité : la cuisson a déjà eu lieu. Si `platId` est vide
  (recette inconnue, offerte...), aucun ingrédient n'est touché : seul le compteur de portions de
  l'entrée existe ;
- **`portions`** : nombre de portions restantes de ce repas prêt.

Deux actions par entrée, volontairement minimales (Qassim ne voulait "pas trop de cases à
cocher") :
- **"🍽️ Manger"** : décrémente `portions` de 1 ; l'entrée disparaît automatiquement de la liste
  quand `portions` atteint 0 (pas de case "terminé" à cocher en plus) ;
- **"✕"** : retire l'entrée entièrement, quel que soit le nombre de portions restantes (correction,
  gâchis...).

Cette liste ne fait **jamais** partie du calcul des besoins de la semaine (elle est hors
planning) ; elle sert uniquement de pense-bête + suivi de portions pour des repas déjà là,
consommables au fur et à mesure.

**La liste de courses (besoin) porte sur les 7 PROCHAINS jours à partir d'aujourd'hui** (aujourd'hui
inclus), pas sur "la semaine réelle lundi → dimanche" affichée sur l'écran Semaine. **Historique de
la décision** : une première version comptait toute la semaine réelle en cours (lundi → dimanche),
y compris les jours déjà passés tant qu'un plat n'était pas coché "🍽️ Mangé" — Qassim a testé ce
cas concret et trouvé ça illogique : *"si un jour est passé, ça veut dire que c'est fini, t'as plus
besoin de l'acheter, de le manger, de le cuisiner."* Décision : un jour strictement avant aujourd'hui
ne compte **plus jamais** dans les courses, même si rien n'a été coché dessus (ni "🍽️ Mangé", ni
retiré) — seul aujourd'hui et les 6 jours suivants comptent (`datesProchainsJours` dans
`calculs.js`). Ça ne touche ni le **stock** (toujours déduit uniquement par une case "🍽️ Mangé"
cochée ou un achat, quelle que soit la date) ni l'**affichage** de l'écran Semaine (qui reste
toujours lundi → dimanche, y compris pour naviguer et corriger un jour passé) — seul le calcul
"combien acheter" change de fenêtre.

Conséquence : il n'y a **pas** de bouton "Nouvelle semaine" ni de notion de "graver le stock" —
c'était une contrainte propre à l'ancien système Notion, qui ne s'applique plus ici.

## Modèle de données

- **Ingrédient** : id, nom, rayon, unité, quantité en stock, essentiel (oui/non), minimum à
  toujours avoir, extra ponctuel, équivalence cuillerée → unité de base (`parCuillereACafe`,
  éditable dans le panneau Stock pour les unités g/ml — voir "Cuillères dans les recettes" plus
  bas).
- **Plat** : id, nom, repas (id, un seul), étapes, portions de référence, favori (oui/non),
  étiquettes (liste d'ids, plusieurs à la fois), matériel (liste d'ids, plusieurs à la fois — voir
  "Matériel requis et temps de préparation/cuisson"), tempsPreparation, tempsCuisson (minutes),
  liste d'ingrédients avec quantité **par portion**. (Protéine principale : reportée après le MVP.)
- **Règle du modèle** : id, jour (lundi-dimanche), créneau, plat choisi, portions. Pas d'état
  "cuisiné"/"mangé" ici (voir "Semaines réelles et modèle"). Plusieurs règles peuvent partager le
  même jour + créneau.
- **Élément d'historique** : par date réelle ("AAAA-MM-JJ") puis par créneau, une LISTE d'éléments
  { id, plat choisi, portions, cuisiné } — la seule couche qui porte l'état "mangé" (champ interne
  toujours nommé `cuisine` dans le code, affiché "🍽️ Mangé (déduit le stock)" — voir "Mangé
  (déduit le stock)").
- **Repas prêt** : { id, nom, platId (optionnel), portions } — voir "Repas prêts", liste
  indépendante du modèle/historique (`etat.repasPrets`).

Stocké en `localStorage` via `storage.js`, sous une seule clé, en JSON, avec un numéro de version
du format (actuellement 10 ; migrations en chaîne v1 → v2 → v3 → v4 → v5 → v6 → v7 → v8 → v9 → v10
dans `storage.js` → `migrer`).

### Portions de référence et saisie des quantités

**Décision clé (demandée par Qassim)** : les quantités d'ingrédients d'un plat se saisissent
**comme la recette d'origine te les donne**, pas déjà ramenées à 1 portion — ex. la recette de sa
mère est donnée pour 4 personnes : il règle d'abord "Portions de référence" à 4, puis entre les
quantités telles quelles (400 g de riz), sans calcul mental. `plat.ingredients[].quantitePortion`
reste la seule valeur **stockée** (toujours ramenée à 1 portion, en divisant par
`portionsReference`) — c'est la seule chose que lisent tous les calculs ailleurs dans l'app
(besoins de la semaine, liste de courses...). L'affichage et l'édition d'une ligne déjà présente
suivent la même logique dans les deux sens : on voit et on modifie toujours "pour N portions",
jamais la valeur par-portion brute — donc changer `portionsReference` après coup ne perd aucune
donnée, ça change juste le nombre affiché (mathématiquement cohérent).

### Cuillères dans les recettes, grammes/ml dans le Stock et les Courses

**Décision clé (demandée par Qassim)** : les recettes donnent souvent une quantité en cuillères
("3 c. à café", "1 c. à soupe") plutôt qu'en grammes — c'est comme ça qu'on cuisine au quotidien.
Mais le **Stock** et les **Courses** doivent rester en grammes/ml/pièce, parce que c'est ce qui est
vendu et pesé dans le commerce (pas de "cuillères" en rayon). L'app permet donc de **saisir une
ligne de recette en cuillères tout en gardant le Stock/Courses en unité de stock**, sans que Qassim
ait à faire la conversion lui-même.

Mécanisme (voir `ingredient.parCuillereACafe` dans "Modèle de données", et
`convertirVersUniteStock` dans `calculs.js`) :
- chaque ingrédient dosé en g ou en ml peut avoir une **équivalence "1 c. à café = combien de
  g/ml"** réglée une fois pour toutes (ex. miel : 1 c. à café = 7 g) — champ optionnel, visible
  seulement pour les unités g/ml (une "pièce" ne se dose pas en cuillères). Réglable dans le
  panneau d'édition de l'ingrédient (écran Stock), MAIS AUSSI directement pendant l'ajout d'un
  ingrédient à une recette (bouton "🥄 La recette parle en cuillères ? Régler l'équivalence" si
  elle manque encore) — pas besoin d'interrompre la saisie de la recette pour aller sur Stock ;
- une fois cette équivalence réglée, l'ajout d'un ingrédient à une recette (écran Plats & repas)
  propose un choix d'unité — l'unité de stock de l'ingrédient, ou "c. à café"/"c. à soupe" (1 c. à
  soupe = 3 c. à café, constante du cahier des charges) — et Qassim saisit la quantité TELLE QUE
  DONNÉE par la recette, dans l'unité qu'il préfère pour CETTE ligne précise (une recette peut très
  bien avoir une ligne "400 g de riz" et une autre "2 c. à café de miel" pour le même plat) ;
- la conversion vers l'unité de stock n'a lieu qu'au moment des calculs (besoin, déduction du
  stock...), jamais stockée en dur : `plat.ingredients[].quantitePortion` reste dans l'unité
  ORIGINALE de la ligne (`unite`), pas forcément l'unité de stock — voir "Portions de référence"
  ci-dessus pour la logique "par portion" qui s'applique de la même façon.

Un ingrédient dont l'équivalence cuillère est utilisée par au moins une recette ne peut pas se la
faire retirer (suppression refusée, avec la liste des plats concernés — même logique que
supprimer un rayon/une étiquette/un ingrédient utilisé) : sinon cette recette deviendrait
impossible à calculer.

## Règles de calcul

- **Besoin** (par ingrédient) = somme, sur les créneaux des 7 PROCHAINS jours à partir d'aujourd'hui
  inclus (jamais les jours déjà passés — voir "Semaines réelles et modèle" § liste de courses ;
  cases effectives : historique si déjà consulté, sinon aperçu du modèle) avec un plat choisi et
  pas déjà mangés, de *portions × quantité par portion* (convertie en unité de base).
- **À acheter** = maximum(0, besoin + minimum essentiel + extra − stock actuel). Arrondi au
  supérieur pour les unités "pièce", inchangé pour les grammes/ml.
- Cocher **🍽️ Mangé** sur une case : déduit immédiatement le stock des ingrédients du plat
  (portions × quantité par portion). Décocher : restitue (correction d'erreur uniquement). Même
  logique immédiate à la création d'un **repas prêt** lié à un plat (voir "Repas prêts").
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

Les rayons suivent le parcours d'un vrai supermarché, alimentaire d'abord, puis non-alimentaire —
**"Hygiène"** (dentifrice, déodorant...), **"Entretien maison"** (produits ménagers...) et
**"Emballage"** (film alimentaire, sacs congélation...), jamais mélangés entre eux ni avec
l'alimentaire, comme dans un vrai magasin. **Décision clé (revue avec Qassim, en repartant d'une
liste propre pour que l'app serve à n'importe qui, pas seulement à lui)** : la liste de départ
(`RAYONS` dans `constantes.js`) reproduit les rayons d'un grand supermarché, avec des produits
**génériques, jamais de marque** (ex. "Fromage de chèvre", pas une marque précise) — actuellement,
dans l'ordre :
Fruits et légumes, Boucherie, Poissonnerie, Crèmerie, Boulangerie, Épicerie salée, Épicerie
sucrée, Épices et condiments, Surgelés, Boissons, Compléments alimentaires, Hygiène, Entretien
maison, Emballage. "Épicerie" a été éclaté en salée/sucrée (miel et pâtes n'ont rien à voir), et
"Conserves" fusionné dans "Épicerie salée" (une conserve de haricots, c'est de l'épicerie salée) —
cette liste reste éditable comme n'importe quel rayon (voir "Rayons éditables" ci-dessous), ce
n'est qu'un point de départ.

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
acheter apparaissent (le Catalogue reste le seul endroit qui montre systématiquement les 14
rayons, même ceux encore vides comme "Hygiène" au départ — utile pour y ajouter un premier
ingrédient ou pour le renommer).

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

Même principe que les rayons/étiquettes : les repas (Petit-déjeuner, Snack/Goûter, Déjeuner/Dîner
au départ — voir "Modèle de données") sont des objets `{ id, nom }` stockés dans l'état
(`etat.repas`), pas figés dans le code. **Vocabulaire 100% en français** ("Smoko" a disparu, y
compris comme libellé de créneau sur l'écran Semaine — voir ci-dessous). **Déjeuner/Dîner ET
Snack/Goûter sont fusionnés en une seule catégorie chacun dès le départ** (décision de Qassim :
pour lui, un snack et un goûter sont la même chose, tout comme le lunch et le dîner). Contrairement
aux étiquettes, un plat n'a qu'**un seul** repas à la fois (`plat.repas` est un id seul, pas une
liste).

**Distinction importante avec les créneaux de la Semaine** : les 5 créneaux fixes de la journée
(petit-dejeuner/smoko/lunch/snack/diner — voir "Semaines réelles et modèle", noms internes
inchangés dans le code) restent des créneaux horaires FIXES, jamais renommés ni fusionnés (ce sont
des moments de la journée, pas des catégories de plats) — leurs libellés affichés sur l'écran
Semaine sont désormais en français (Petit-déjeuner, **Goûter**, **Déjeuner**, Snack, Dîner). C'est
le **repas associé à chaque créneau** (`CRENEAU_INFOS` dans `app.js`, champ `repasId`) qui
référence un repas éditable — `lunch` ET `diner` référencent tous les deux `dejeuner-diner` ;
`smoko` ET `snack` référencent tous les deux `snack-gouter`. Renommer un repas ensuite (ex. si
Qassim préfère un autre mot) ne casse jamais ce lien : l'id ne change jamais, seul le nom affiché
change, partout où il apparaît (filtre de l'écran Plats, picker de repas d'un plat).

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

## Panneau Filtres (écran Plats & repas)

**Historique de la décision** : Favoris + Repas + Étiquettes (et leurs boutons d'édition)
empilaient trop de lignes directement sur l'écran, avant même d'arriver aux résultats — retour de
Qassim en testant l'app ("ça prend trop de place, je préfère ouvrir un truc à côté"). Regroupés
dans un panneau à part ("🔧 Filtres", ouvert/fermé comme les autres panneaux de l'app) : l'écran
principal reste compact (recherche, bouton Filtres avec un compteur si des filtres sont actifs
— ex. "Filtres (2)" —, "+ Nouveau plat", puis la grille). Éditer un repas/une étiquette/un matériel
depuis ce panneau y ramène à la fermeture (pas à l'écran principal), pour pouvoir enchaîner
plusieurs réglages sans perdre le fil.

**Boutons côte à côte plutôt qu'empilés** : plus généralement, `.panneau-actions` (utilisé par
tous les panneaux à un ou deux boutons d'action — confirmer/annuler, enregistrer/supprimer,
candidat "Ajouter juste ce jour"/"...et en faire le défaut"...) met ses boutons en ligne avec
retour à la ligne automatique si ça ne tient pas, au lieu de toujours les empiler — même retour de
Qassim, appliqué à tout l'app d'un coup.

## Matériel requis et temps de préparation/cuisson (écran Plats & repas)

**Décision clé (demandée par Qassim, "quelle est la meilleure méthode pour expliquer une
recette")** : il manquait le matériel nécessaire (poêle, air fryer...) pour reproduire une
recette. Même principe que les étiquettes éditables ci-dessus, appliqué au matériel : objets
`{ id, nom }` stockés dans l'état (`etat.materiel`, liste de départ éditable — Poêle, Casserole,
Four, Air fryer, Mixeur, Cuiseur à riz, Bol), pas figés dans le code. **Un plat peut demander
plusieurs matériels à la fois** — `plat.materiel` est une liste d'ids. Même logique de filtre ET
que les étiquettes (voir "Panneau Filtres" ci-dessus), même protection à la suppression (refusée
si un plat le demande encore, avec la liste de ces plats).

En plus du matériel, chaque plat porte `tempsPreparation` et `tempsCuisson` (en minutes, 0 =
valeur par défaut / pas de cuisson pour `tempsCuisson`), réglables par steppers dans l'éditeur de
plat, juste après "Portions de référence" et avant "Étapes / recette" — comme sur une vraie fiche
recette (ingrédients/matériel d'abord, méthode ensuite). Le total (`tempsPreparation +
tempsCuisson`) s'affiche sur chaque carte plat, avec le matériel requis.

Remplace l'ancien champ `assemblage` (booléen "sans cuisson") qui existait dans les données
importées de Notion mais n'était **jamais affiché nulle part** dans l'app — retiré (migration
v9 → v10) au profit de `tempsCuisson` (0 minute exprime la même idée, sans champ redondant).

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
