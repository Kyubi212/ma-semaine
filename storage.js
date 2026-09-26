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

// Une seule clé, un seul objet JSON dedans : plus simple à inspecter
// (Outils de développement → Application → Local Storage) et à sauvegarder
// entièrement d'un coup (export/import, étape 8).
const CLE_STOCKAGE = "ma-semaine";

// Numéro de version du FORMAT des données (pas de l'application). À monter
// uniquement le jour où la forme de l'état change (ex. un champ renommé) ET
// qu'on ajoute une conversion dans migrer() ci-dessous pour ne pas perdre
// les données déjà sauvegardées chez Qassim.
const VERSION_FORMAT = 3;

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
  return {
    version: VERSION_FORMAT,
    ingredients: ingredientsParDefaut.map((ingredient) => ({ ...ingredient })),
    plats: platsParDefaut.map((plat) => ({
      ...plat,
      ingredients: plat.ingredients.map((ligne) => ({ ...ligne })),
    })),
    modele: [],
    historique: {},
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
