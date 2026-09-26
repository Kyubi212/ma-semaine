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
const VERSION_FORMAT = 1;

// Les 7 jours de la semaine type (pas de dates, voir CLAUDE.md § Semaine glissante).
export const JOURS = [
  "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
];

// Les 5 créneaux de repas par jour.
export const CRENEAUX = ["petit-dejeuner", "smoko", "lunch", "snack", "diner"];

function creerPlanningVide() {
  const planning = [];
  for (const jour of JOURS) {
    for (const creneau of CRENEAUX) {
      planning.push({
        jour,
        creneau,
        platId: null, // aucun plat choisi pour l'instant
        portions: 1,
        preparation: "cuisine-ici", // ou "reste" (voir CLAUDE.md)
        cuisine: false,
      });
    }
  }
  return planning;
}

// Construit un état de départ propre, à partir du catalogue de data.js.
// Utilisé au tout premier lancement de l'app, et chaque fois que les
// données sauvegardées sont absentes ou illisibles.
export function creerEtatInitial() {
  return {
    version: VERSION_FORMAT,
    ingredients: ingredientsParDefaut.map((ingredient) => ({ ...ingredient })),
    plats: platsParDefaut.map((plat) => ({
      ...plat,
      ingredients: plat.ingredients.map((ligne) => ({ ...ligne })),
    })),
    planning: creerPlanningVide(),
  };
}

// Fait passer un état sauvegardé dans une ANCIENNE version du format à la
// version actuelle. Pour l'instant il n'y a qu'une version (1), donc rien à
// convertir : cette fonction ne fait qu'attendre le jour où ce sera utile.
function migrer(etat) {
  if (etat.version === VERSION_FORMAT) {
    return etat;
  }
  // Exemple pour plus tard :
  // if (etat.version === 1) { ...adapter etat vers la forme de la v2...; etat.version = 2; }
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
