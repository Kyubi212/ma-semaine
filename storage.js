// Ma Semaine — storage.js
//
// Seul fichier du projet qui touche à `localStorage`. `localStorage` est le
// petit espace de stockage que le navigateur réserve à ce site : tout ce
// qu'on y écrit reste sur le téléphone, entre deux visites, tant que le
// navigateur ne l'efface pas (voir la fonction sauvegarderEtat plus bas
// pour le cas où l'écriture échoue).
//
// Isoler l'accès ici (au lieu de faire des localStorage.setItem un peu
// partout dans app.js) permet, si un jour un vrai serveur remplace le
// stockage du téléphone, de ne changer QUE ce fichier.

import { ingredients as ingredientsParDefaut, plats as platsParDefaut } from "./data.js";
import { RAYONS, genererSlug } from "./constantes.js";

// Une seule clé, un seul objet JSON dedans : plus simple à inspecter
// (Outils de développement → Application → Local Storage) et à sauvegarder
// entièrement d'un coup (export/import, étape 8).
const CLE_STOCKAGE = "ma-semaine";

// Numéro de version du FORMAT des données (pas de l'application). À monter
// uniquement le jour où la forme de l'état change (ex. un champ renommé) ET
// qu'on ajoute une conversion dans migrer() ci-dessous pour ne pas perdre
// les données déjà sauvegardées chez Qassim.
const VERSION_FORMAT = 10;

// Étiquettes par défaut (écran Plats & repas — voir CLAUDE.md § Étiquettes
// éditables) : une liste de départ, modifiable ensuite comme les rayons.
const ETIQUETTES_PAR_DEFAUT = [
  "Sucré", "Salé", "Sain", "Sans porc", "Végétarien", "Gâteau", "Rapide à préparer",
];

function etiquettesParDefaut() {
  const idsExistants = new Set();
  return ETIQUETTES_PAR_DEFAUT.map((nom) => {
    const id = genererSlug(nom, idsExistants);
    idsExistants.add(id);
    return { id, nom };
  });
}

// Matériel par défaut (écran Plats & repas — même principe que les
// étiquettes) : une liste de départ, éditable ensuite (renommer/supprimer/
// ajouter). Un plat peut demander plusieurs matériels à la fois.
const MATERIEL_PAR_DEFAUT = [
  "Poêle", "Casserole", "Four", "Air fryer", "Mixeur", "Cuiseur à riz", "Bol",
];

function materielParDefaut() {
  const idsExistants = new Set();
  return MATERIEL_PAR_DEFAUT.map((nom) => {
    const id = genererSlug(nom, idsExistants);
    idsExistants.add(id);
    return { id, nom };
  });
}

// Construit la liste de rayons par défaut { id, nom } à partir des noms
// écrits dans constantes.js. Utilisé au tout premier lancement ET par la
// migration v3 → v4 (les rayons n'existaient pas encore comme donnée
// éditable avant cette version — voir CLAUDE.md § Rayons éditables).
function rayonsParDefaut() {
  const idsExistants = new Set();
  return RAYONS.map((nom) => {
    const id = genererSlug(nom, idsExistants);
    idsExistants.add(id);
    return { id, nom };
  });
}

// Repas par défaut (écran Plats & repas — voir CLAUDE.md § Repas éditables),
// en français : Déjeuner/Dîner fusionnés, ET Snack/Goûter fusionnés (pour
// Qassim, ce sont à chaque fois les mêmes plats), contrairement aux 5
// créneaux fixes de la journée (Semaine) qui restent distincts (lunch ET
// diner utilisent le même repas, smoko ET snack aussi — voir CRENEAU_INFOS
// dans app.js).
const REPAS_PAR_DEFAUT = ["Petit-déjeuner", "Snack/Goûter", "Déjeuner/Dîner", "Dessert"];

function repasParDefaut() {
  const idsExistants = new Set();
  return REPAS_PAR_DEFAUT.map((nom) => {
    const id = genererSlug(nom, idsExistants);
    idsExistants.add(id);
    return { id, nom };
  });
}

// Trouve (ou crée à la volée) l'id du repas correspondant à l'ancienne
// valeur texte d'un plat (ex. "Déjeuner", "Dîner", mais aussi d'anciennes
// catégories Notion comme "Plaisir occasionnel" qui ne sont pas dans la
// liste par défaut — rien n'est perdu, une catégorie est créée pour elles).
function idRepasPourAncienneValeur(listeRepas, idsExistants, ancienneValeur) {
  let nomCible = ancienneValeur;
  if (ancienneValeur === "Déjeuner" || ancienneValeur === "Dîner") nomCible = "Déjeuner/Dîner";
  if (ancienneValeur === "Smoko" || ancienneValeur === "Snack") nomCible = "Snack/Goûter";
  let repas = listeRepas.find((r) => r.nom === nomCible);
  if (!repas) {
    repas = { id: genererSlug(nomCible, idsExistants), nom: nomCible };
    idsExistants.add(repas.id);
    listeRepas.push(repas);
  }
  return repas.id;
}

// Construit un état de départ propre, à partir du catalogue de data.js.
// Utilisé au tout premier lancement de l'app, et chaque fois que les
// données sauvegardées sont absentes ou illisibles.
//
// Deux couches de planning (voir CLAUDE.md § Semaine glissante) :
// - `modele` : la "semaine type", une liste de "règles" (jour, créneau, plat,
//   portions, préparation). PLUSIEURS règles peuvent partager le même jour +
//   créneau (ex. "fruits" ET "œufs" au petit-déjeuner du lundi) — voir
//   CLAUDE.md § Plusieurs plats par créneau. Vide au départ (aucune règle).
// - `historique` : par date réelle ("AAAA-MM-JJ") puis par créneau, une
//   LISTE d'éléments réels { id, platId, portions, preparation, cuisine },
//   créée à la demande (voir calculs.js → obtenirOuCreerJourHistorique) la
//   première fois qu'un jour précis est consulté ou modifié. C'est là que
//   vit l'état "cuisiné", propre à chaque date, jamais réinitialisé tout
//   seul : Qassim peut toujours revenir corriger un jour passé.
export function creerEtatInitial() {
  const rayons = rayonsParDefaut();
  const idRayonParNom = new Map(rayons.map((r) => [r.nom, r.id]));

  const repas = repasParDefaut();
  const idsRepasExistants = new Set(repas.map((r) => r.id));

  const materiel = materielParDefaut();
  const idMaterielParNom = new Map(materiel.map((m) => [m.nom, m.id]));

  return {
    version: VERSION_FORMAT,
    rayons,
    etiquettes: etiquettesParDefaut(),
    repas,
    materiel,
    ingredients: ingredientsParDefaut.map((ingredient) => ({
      ...ingredient,
      rayon: idRayonParNom.get(ingredient.rayon) ?? ingredient.rayon,
    })),
    plats: platsParDefaut.map(({ assemblage, ...plat }) => ({
      ...plat,
      favori: plat.favori ?? false,
      etiquettes: plat.etiquettes ?? [],
      repas: idRepasPourAncienneValeur(repas, idsRepasExistants, plat.repas),
      ingredients: plat.ingredients.map((ligne) => ({ ...ligne })),
      materiel: (plat.materiel ?? []).map((nom) => idMaterielParNom.get(nom) ?? nom),
      tempsPreparation: plat.tempsPreparation ?? 0,
      tempsCuisson: plat.tempsCuisson ?? 0,
    })),
    modele: [],
    historique: {},
    repasPrets: [],
  };
}

// Fait passer un état sauvegardé dans une ANCIENNE version du format à la
// version actuelle. Les migrations s'enchaînent (v1 → v2 → v3) pour ne
// jamais perdre les données déjà sauvegardées, quelle que soit l'ancienneté.
function migrer(etat) {
  if (etat.version === 1) {
    // v1 → v2 : le "planning" unique (35 cases, sans dates) devient le
    // "modele" (même contenu, sans le champ "cuisine" qui n'a plus sa place
    // ici) + un "historique" vide. L'état "cuisiné" de la v1 n'était pas
    // daté, donc rien de fiable à reprendre dans l'historique : on part
    // simplement d'un historique propre à partir de maintenant.
    etat = {
      ...etat,
      modele: (etat.planning ?? []).map(({ jour, creneau, platId, portions, preparation }) => ({
        jour, creneau, platId, portions, preparation,
      })),
      historique: {},
      version: 2,
    };
    delete etat.planning;
    delete etat.dernierePassageDate;
  }

  if (etat.version === 2) {
    // v2 → v3 : une case ne contient plus UN plat mais une LISTE de plats
    // (voir CLAUDE.md § Plusieurs plats par créneau). Une case vide
    // (platId: null) devient une liste vide ; une case avec un plat devient
    // une liste à un seul élément.
    let prochainId = 1;
    const genererId = () => `migre-${prochainId++}`;

    etat = {
      ...etat,
      modele: (etat.modele ?? [])
        .filter((c) => c.platId)
        .map((c) => ({
          id: genererId(),
          jour: c.jour,
          creneau: c.creneau,
          platId: c.platId,
          portions: c.portions,
          preparation: c.preparation,
        })),
      historique: Object.fromEntries(
        Object.entries(etat.historique ?? {}).map(([dateISO, jourEntree]) => [
          dateISO,
          Object.fromEntries(
            Object.entries(jourEntree).map(([creneau, ancienneCase]) => [
              creneau,
              ancienneCase.platId
                ? [{
                    id: genererId(),
                    platId: ancienneCase.platId,
                    portions: ancienneCase.portions,
                    preparation: ancienneCase.preparation,
                    cuisine: ancienneCase.cuisine,
                  }]
                : [],
            ])
          ),
        ])
      ),
      version: 3,
    };
  }

  if (etat.version === 3) {
    // v3 → v4 : les rayons deviennent une donnée éditable par Qassim
    // (renommer, supprimer — voir CLAUDE.md § Rayons éditables), au lieu
    // d'une liste figée dans constantes.js. Chaque rayon obtient un id
    // stable ; les ingrédients, qui stockaient jusqu'ici le NOM du rayon
    // directement, référencent maintenant cet id (le nom reste éditable
    // sans casser le lien).
    const rayons = rayonsParDefaut();
    const idRayonParNom = new Map(rayons.map((r) => [r.nom, r.id]));

    etat = {
      ...etat,
      rayons,
      ingredients: (etat.ingredients ?? []).map((ingredient) => ({
        ...ingredient,
        rayon: idRayonParNom.get(ingredient.rayon) ?? ingredient.rayon,
      })),
      version: 4,
    };
  }

  if (etat.version === 4) {
    // v4 → v5 : les plats peuvent être marqués favoris (écran Plats & repas).
    etat = {
      ...etat,
      plats: (etat.plats ?? []).map((plat) => ({ ...plat, favori: plat.favori ?? false })),
      version: 5,
    };
  }

  if (etat.version === 5) {
    // v5 → v6 : les plats peuvent porter plusieurs étiquettes (Sucré, Salé,
    // Sain, Sans porc... — voir CLAUDE.md § Étiquettes éditables). Comme les
    // rayons : une liste éditable { id, nom }, référencée par id.
    etat = {
      ...etat,
      etiquettes: etat.etiquettes ?? etiquettesParDefaut(),
      plats: (etat.plats ?? []).map((plat) => ({ ...plat, etiquettes: plat.etiquettes ?? [] })),
      version: 6,
    };
  }

  if (etat.version === 6) {
    // v6 → v7 : les repas deviennent une donnée éditable (renommable), comme
    // les rayons — voir CLAUDE.md § Repas éditables. Déjeuner et Dîner sont
    // fusionnés en une seule catégorie "Déjeuner/Dîner" (Qassim les considère
    // comme les mêmes plats). Les plats, qui stockaient jusqu'ici le NOM du
    // repas directement, référencent maintenant un id.
    const repas = repasParDefaut();
    const idsRepasExistants = new Set(repas.map((r) => r.id));

    etat = {
      ...etat,
      repas,
      plats: (etat.plats ?? []).map((plat) => ({
        ...plat,
        repas: idRepasPourAncienneValeur(repas, idsRepasExistants, plat.repas),
      })),
      version: 7,
    };
  }

  if (etat.version === 7) {
    // v7 → v8 : vocabulaire en français partout ("Smoko" n'était pas
    // français), ET Snack et Goûter fusionnés en une seule catégorie
    // "Snack/Goûter" (même logique que Déjeuner/Dîner : pour Qassim, ce sont
    // les mêmes plats). Les repas Smoko et Snack existaient déjà comme deux
    // entrées séparées depuis la v7 : on les fusionne en gardant un seul id
    // (celui de "Snack"), et on reroute les plats qui pointaient vers
    // "Smoko" vers cet id survivant.
    let repas = etat.repas ?? [];
    const repasSmoko = repas.find((r) => r.nom === "Smoko");
    const repasSnack = repas.find((r) => r.nom === "Snack");
    let plats = etat.plats ?? [];

    let idSurvivant = repasSnack?.id ?? repasSmoko?.id;

    if (repasSmoko && repasSnack && repasSmoko.id !== repasSnack.id) {
      repas = repas.filter((r) => r.id !== repasSmoko.id);
      plats = plats.map((plat) => (plat.repas === repasSmoko.id ? { ...plat, repas: idSurvivant } : plat));
    }

    if (idSurvivant) {
      repas = repas.map((r) => (r.id === idSurvivant ? { ...r, nom: "Snack/Goûter" } : r));
    } else {
      // Cas improbable : ni Smoko ni Snack n'existaient déjà.
      const idsExistants = new Set(repas.map((r) => r.id));
      repas = [...repas, { id: genererSlug("Snack/Goûter", idsExistants), nom: "Snack/Goûter" }];
    }

    etat = { ...etat, repas, plats, version: 8 };
  }

  if (etat.version === 8) {
    // v8 → v9 : les "repas prêts" (portions déjà prêtes à manger, sans lien
    // avec un jour précis — un plat offert, un batch-cook à l'avance...) —
    // voir CLAUDE.md § Repas prêts. Le champ "preparation" (cuisine-ici/
    // reste) des règles/éléments existants n'est plus utilisé (le choix
    // cuisiner/manger sans cuisiner disparaît, remplacé par ce nouveau
    // concept) ; on le laisse tel quel dans les données déjà sauvegardées,
    // simplement ignoré par le code désormais.
    etat = { ...etat, repasPrets: etat.repasPrets ?? [], version: 9 };
  }

  if (etat.version === 9) {
    // v9 → v10 : matériel requis (écran Plats & repas — même principe que
    // les étiquettes, un plat peut en demander plusieurs à la fois), temps
    // de préparation et de cuisson (en minutes). Retire au passage le champ
    // "assemblage" (sans cuisson) : orphelin, jamais affiché nulle part,
    // désormais remplacé par tempsCuisson (0 = pas de cuisson).
    const materiel = etat.materiel ?? materielParDefaut();
    const plats = etat.plats.map(({ assemblage, ...plat }) => ({
      ...plat,
      materiel: plat.materiel ?? [],
      tempsPreparation: plat.tempsPreparation ?? 0,
      tempsCuisson: plat.tempsCuisson ?? 0,
    }));
    etat = { ...etat, materiel, plats, version: 10 };
  }

  return etat;
}

// Lit l'état sauvegardé. Ne lève jamais d'erreur : en cas de problème
// (stockage inaccessible, données corrompues), elle rend un état de départ
// propre et signale le souci via `erreurLecture`, pour qu'app.js puisse
// prévenir Qassim au lieu de planter en silence (voir CLAUDE.md § Cas limites).
export function chargerEtat() {
  let brut;
  try {
    brut = localStorage.getItem(CLE_STOCKAGE);
  } catch {
    // Mode privé, stockage désactivé par le navigateur...
    return { etat: creerEtatInitial(), erreurLecture: true };
  }

  if (!brut) {
    // Premier lancement : rien à charger, ce n'est pas une erreur.
    return { etat: creerEtatInitial(), erreurLecture: false };
  }

  try {
    const etat = migrer(JSON.parse(brut));
    return { etat, erreurLecture: false };
  } catch {
    // JSON invalide (données corrompues) : on repart propre plutôt que
    // de planter, mais on prévient quand même que l'ancien contenu est perdu.
    return { etat: creerEtatInitial(), erreurLecture: true };
  }
}

// Sauvegarde l'état complet. Rend true si ça a marché, false sinon (par ex.
// stockage plein) — à app.js d'afficher un avertissement dans ce cas plutôt
// que de laisser Qassim croire que c'est enregistré alors que ça ne l'est pas.
export function sauvegarderEtat(etat) {
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(etat));
    return true;
  } catch {
    return false;
  }
}

// Efface tout ce qui est sauvegardé, pour repartir des données de base
// (data.js) au prochain chargement — irréversible, à confirmer avant côté
// app.js. Utile pendant la refonte du catalogue (rayons/ingrédients/plats) :
// modifier data.js ne change rien à ce que Qassim a déjà en localStorage
// tant qu'il n'a pas réinitialisé.
export function effacerStockage() {
  try {
    localStorage.removeItem(CLE_STOCKAGE);
    return true;
  } catch {
    return false;
  }
}
