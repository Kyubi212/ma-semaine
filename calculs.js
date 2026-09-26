// Ma Semaine — calculs.js
//
// Toute la logique de calcul du projet, et RIEN d'autre : pas de
// localStorage, pas de manipulation de l'écran. Rien que des fonctions
// "pures" ou qui ne modifient que l'état qu'on leur passe (même entrée →
// toujours le même résultat), ce qui les rend faciles à tester
// automatiquement (voir tests/calculs.test.js).
//
// Vocabulaire du modèle de données (voir CLAUDE.md) :
// - un "ingrédient" a un enStock, un minimum (si essentiel) et un extra ;
// - un "plat" a une liste de lignes { ingredientId, quantitePortion, unite } ;
// - `etat.modele` est la "semaine type" : 35 cases fixes (7 jours × 5
//   créneaux), modifiable, qui sert de valeur par défaut ;
// - `etat.historique` contient un enregistrement RÉEL par date
//   ("AAAA-MM-JJ"), créé à la demande, qui porte l'état "cuisiné" — jamais
//   réinitialisé tout seul : on peut toujours revenir corriger un jour passé.

import { JOURS, CRENEAUX } from "./constantes.js";

const UNITES_CUILLERE_EN_C_A_CAFE = {
  "c. à café": 1,
  "c. à soupe": 3, // 1 c. à soupe = 3 c. à café (équivalence du cahier des charges)
};

// Ramène toute valeur invalide (négative, NaN, texte...) à 0, jamais à une
// erreur : c'est la règle du cas limite "quantité saisie négative ou texte
// au lieu d'un nombre" (CLAUDE.md § Cas limites).
export function clampPositif(valeur) {
  const nombre = Number(valeur);
  if (!Number.isFinite(nombre) || nombre < 0) {
    return 0;
  }
  return nombre;
}

// Convertit la quantité d'une ligne de plat (dans l'unité de la recette,
// par ex. "c. à café") vers l'unité de stock de l'ingrédient (par ex. "g").
export function convertirVersUniteStock(quantite, uniteLigne, ingredient) {
  if (uniteLigne === ingredient.unite) {
    return quantite;
  }

  const enCuillereACafe = UNITES_CUILLERE_EN_C_A_CAFE[uniteLigne];
  if (enCuillereACafe === undefined) {
    // Deux unités différentes qui ne sont pas une histoire de cuillères :
    // c'est une incohérence dans les données (plat mal saisi), pas une
    // erreur de saisie de Qassim. On préfère planter fort ici plutôt que de
    // rendre un chiffre silencieusement faux dans la liste de courses.
    throw new Error(
      `Impossible de convertir "${uniteLigne}" vers "${ingredient.unite}" ` +
        `pour l'ingrédient "${ingredient.nom}" (pas une unité de cuillère connue).`
    );
  }
  if (ingredient.parCuillereACafe === null || ingredient.parCuillereACafe === undefined) {
    throw new Error(
      `L'ingrédient "${ingredient.nom}" est dosé en cuillère dans une recette, ` +
        `mais n'a pas de "parCuillereACafe" pour le convertir en "${ingredient.unite}".`
    );
  }
  return quantite * enCuillereACafe * ingredient.parCuillereACafe;
}

// Une case (qu'elle vienne du modèle ou de l'historique) compte-t-elle dans
// les calculs (besoin, déduction du stock) ? Non si : aucun plat choisi
// (case volontairement vide, ex. "je sors au restaurant"), "reste" (pas une
// nouvelle cuisson), ou 0 portion (CLAUDE.md § Cas limites : équivalent à
// un créneau vide).
export function caseCompte(caseP) {
  return Boolean(caseP.platId) && caseP.preparation !== "reste" && caseP.portions > 0;
}

// Calcule, pour chaque ingrédient, la quantité nécessaire sur une liste de
// cases qui ne sont ni "reste" ni déjà cuisinées (celles-ci ont déjà déduit
// le stock au moment où on les a cochées, voir definirCuisine). Rend une
// Map<ingredientId, quantité en unité de stock>.
export function calculerBesoins(cases, plats, ingredients) {
  const platsParId = new Map(plats.map((plat) => [plat.id, plat]));
  const ingredientsParId = new Map(ingredients.map((ing) => [ing.id, ing]));
  const besoins = new Map();

  for (const caseP of cases) {
    if (!caseCompte(caseP) || caseP.cuisine) {
      continue;
    }
    const plat = platsParId.get(caseP.platId);
    if (!plat) {
      // Le plat a été supprimé entre-temps : on ignore la case plutôt que
      // de planter (CLAUDE.md § Cas limites).
      continue;
    }
    for (const ligne of plat.ingredients) {
      const ingredient = ingredientsParId.get(ligne.ingredientId);
      if (!ingredient) continue;

      const quantiteConvertie = convertirVersUniteStock(
        ligne.quantitePortion,
        ligne.unite,
        ingredient
      );
      const quantiteTotale = caseP.portions * quantiteConvertie;

      besoins.set(ingredient.id, (besoins.get(ingredient.id) ?? 0) + quantiteTotale);
    }
  }

  return besoins;
}

// À acheter = max(0, besoin + minimum essentiel + extra − stock actuel).
// Arrondi au supérieur uniquement pour l'unité "pièce", inchangé pour g/ml/etc.
export function calculerAAcheter(ingredients, besoins) {
  return ingredients.map((ingredient) => {
    const besoin = besoins.get(ingredient.id) ?? 0;
    const minimumEssentiel = ingredient.essentiel ? clampPositif(ingredient.minimum) : 0;
    const extra = clampPositif(ingredient.extra);

    let quantite = Math.max(0, besoin + minimumEssentiel + extra - ingredient.enStock);
    if (ingredient.unite === "pièce" && quantite > 0) {
      quantite = Math.ceil(quantite);
    }

    return { ingredientId: ingredient.id, aAcheter: quantite };
  });
}

// Déduit (sens = -1) ou restitue (sens = +1) du stock les ingrédients d'un
// plat pour une case donnée. Ne fait rien si la case ne "compte" pas.
function ajusterStockPourCase(caseP, plats, ingredients, sens) {
  if (!caseCompte(caseP)) {
    return;
  }
  const plat = plats.find((p) => p.id === caseP.platId);
  if (!plat) return;

  for (const ligne of plat.ingredients) {
    const ingredient = ingredients.find((i) => i.id === ligne.ingredientId);
    if (!ingredient) continue;

    const quantite = caseP.portions * convertirVersUniteStock(
      ligne.quantitePortion,
      ligne.unite,
      ingredient
    );
    ingredient.enStock += sens * quantite;
  }
}

// Marque un ingrédient comme acheté : ajoute la quantité au stock. Remet
// aussi son "extra" à 0 (l'envie ponctuelle a été satisfaite) — décision
// prise avec Qassim au démarrage du projet.
export function marquerAchete(ingredient, quantiteAchetee) {
  ingredient.enStock += clampPositif(quantiteAchetee);
  ingredient.extra = 0;
}

// --- Dates et semaines réelles (voir CLAUDE.md § Semaine glissante) ---
//
// L'affichage reste toujours 7 jours dans l'ordre fixe lundi → dimanche,
// mais chaque date réelle peut désormais être consultée et corrigée à
// n'importe quel moment (navigation arrière/avant), au lieu d'une semaine
// type unique qui se réinitialise toute seule.

// "AAAA-MM-JJ" à partir des composants LOCAUX du téléphone (pas
// toISOString(), qui donne l'heure UTC : le soir ou le matin à Sydney, ce
// serait parfois la date de la veille ou du lendemain).
export function dateEnISO(date) {
  const annee = date.getFullYear();
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  const jour = String(date.getDate()).padStart(2, "0");
  return `${annee}-${mois}-${jour}`;
}

// Analyse une date "AAAA-MM-JJ" comme une date LOCALE à minuit (et non en
// UTC, ce que ferait `new Date("AAAA-MM-JJ")` directement).
function analyserDateISO(dateISO) {
  return new Date(`${dateISO}T00:00:00`);
}

// Index du jour dans la semaine, lundi = 0 … dimanche = 6 (contrairement à
// Date.prototype.getDay(), qui donne 0 pour dimanche).
function indexLundiZero(date) {
  return (date.getDay() + 6) % 7;
}

export function jourDeLaSemaine(dateISO) {
  return JOURS[indexLundiZero(analyserDateISO(dateISO))];
}

// Les 7 dates ("AAAA-MM-JJ") de la semaine (lundi → dimanche) qui contient
// `dateReference`.
export function datesDeLaSemaine(dateReference) {
  const lundi = new Date(dateReference);
  lundi.setDate(lundi.getDate() - indexLundiZero(dateReference));

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(lundi);
    date.setDate(date.getDate() + i);
    dates.push(dateEnISO(date));
  }
  return dates;
}

// Décale une date de N semaines (N négatif = en arrière). Sert à la
// navigation "semaine précédente / suivante" de l'écran Semaine.
export function decalerSemaine(dateReference, nombreDeSemaines) {
  const date = new Date(dateReference);
  date.setDate(date.getDate() + nombreDeSemaines * 7);
  return date;
}

// La case du modèle (la "semaine type") pour un jour + créneau donnés.
function caseDuModele(etat, jour, creneau) {
  return etat.modele.find((c) => c.jour === jour && c.creneau === creneau);
}

// Rend la case "effective" d'une date + créneau : l'enregistrement réel
// dans l'historique s'il existe déjà, sinon un aperçu construit depuis le
// modèle (jamais cuisiné, puisqu'il n'existe pas encore vraiment). NE
// MODIFIE PAS l'état — à utiliser pour l'affichage et les calculs en
// lecture seule (ex. calculerBesoinsSemaine).
export function obtenirCaseEffective(etat, dateISO, creneau) {
  const jourEntree = etat.historique[dateISO];
  if (jourEntree && jourEntree[creneau]) {
    return { ...jourEntree[creneau], dateISO, creneau };
  }
  const caseModele = caseDuModele(etat, jourDeLaSemaine(dateISO), creneau);
  return {
    platId: caseModele.platId,
    portions: caseModele.portions,
    preparation: caseModele.preparation,
    cuisine: false,
    dateISO,
    creneau,
  };
}

// Comme obtenirCaseEffective, mais CRÉE (et enregistre dans
// etat.historique) l'enregistrement du jour s'il n'existe pas encore, en le
// copiant depuis le modèle. À utiliser avant toute modification d'un jour
// précis (cocher Cuisiné, changer de plat) : c'est cette création qui fait
// qu'une date, une fois touchée, garde sa propre histoire pour toujours,
// indépendamment des changements futurs du modèle.
function obtenirOuCreerJourHistorique(etat, dateISO) {
  if (!etat.historique[dateISO]) {
    const jour = jourDeLaSemaine(dateISO);
    const jourEntree = {};
    for (const creneau of CRENEAUX) {
      const caseModele = caseDuModele(etat, jour, creneau);
      jourEntree[creneau] = {
        platId: caseModele.platId,
        portions: caseModele.portions,
        preparation: caseModele.preparation,
        cuisine: false,
      };
    }
    etat.historique[dateISO] = jourEntree;
  }
  return etat.historique[dateISO];
}

// Calcule le besoin de la semaine (voir calculerBesoins) sur les 7 × 5
// cases EFFECTIVES de la semaine réelle qui contient `dateReference` (par
// défaut aujourd'hui). Ne modifie pas l'état : les jours pas encore
// consultés sont lus depuis le modèle sans être enregistrés dans
// l'historique.
export function calculerBesoinsSemaine(etat, dateReference = new Date()) {
  const cases = [];
  for (const dateISO of datesDeLaSemaine(dateReference)) {
    for (const creneau of CRENEAUX) {
      cases.push(obtenirCaseEffective(etat, dateISO, creneau));
    }
  }
  return calculerBesoins(cases, etat.plats, etat.ingredients);
}

// Coche ou décoche "Cuisiné" sur la case d'une date + créneau précis, et
// ajuste le stock en conséquence : cocher déduit immédiatement, décocher
// restitue (correction d'erreur). Ne fait rien si la case a déjà cet état.
export function definirCuisine(etat, dateISO, creneau, cuisine) {
  const jourEntree = obtenirOuCreerJourHistorique(etat, dateISO);
  const caseP = jourEntree[creneau];
  if (caseP.cuisine === cuisine) {
    return;
  }
  const sens = cuisine ? -1 : 1; // cuisiner retire du stock, décocher restitue
  ajusterStockPourCase(caseP, etat.plats, etat.ingredients, sens);
  caseP.cuisine = cuisine;
}

// Change le plat (et/ou portions, préparation) d'une date + créneau précis.
// - propager = false (défaut) : "juste ce jour", ne touche que cette date.
// - propager = true : "à partir d'aujourd'hui", met AUSSI à jour le modèle
//   pour ce jour de la semaine + créneau, ce qui deviendra la nouvelle
//   valeur par défaut pour tous les jours futurs pas encore consultés.
// Si la case était déjà cuisinée, on restitue d'abord son ancien stock
// (sécurité : on ne change jamais silencieusement un plat déjà "consommé").
export function definirPlatDuJour(etat, dateISO, creneau, choix, propager = false) {
  const jourEntree = obtenirOuCreerJourHistorique(etat, dateISO);
  const caseP = jourEntree[creneau];

  if (caseP.cuisine) {
    ajusterStockPourCase(caseP, etat.plats, etat.ingredients, 1);
    caseP.cuisine = false;
  }

  caseP.platId = choix.platId ?? null;
  caseP.portions = clampPositif(choix.portions) || 1;
  caseP.preparation = choix.preparation ?? "cuisine-ici";

  if (propager) {
    const caseModele = caseDuModele(etat, jourDeLaSemaine(dateISO), creneau);
    caseModele.platId = caseP.platId;
    caseModele.portions = caseP.portions;
    caseModele.preparation = caseP.preparation;
  }
}
