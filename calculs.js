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
// - `etat.modele` est la "semaine type" : une liste de règles { id, jour,
//   creneau, platId, portions, preparation }. Plusieurs règles peuvent
//   partager le même jour + créneau (une case peut contenir plusieurs
//   plats, voir CLAUDE.md § Plusieurs plats par créneau) ;
// - `etat.historique` contient, par date ("AAAA-MM-JJ") puis par créneau,
//   une LISTE de plats réels { id, platId, portions, preparation, cuisine },
//   créée à la demande, qui porte l'état "cuisiné" — jamais réinitialisée
//   toute seule : on peut toujours revenir corriger un jour passé.

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

// Identifiant simple, unique dans cet état (pas besoin de plus robuste :
// tout reste local à ce seul appareil, voir CLAUDE.md § Stack technique).
function genererId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Les règles du modèle (la "semaine type") pour un jour + créneau donnés.
// PLUSIEURS règles peuvent partager le même jour + créneau (ex. "fruits" ET
// "œufs" au petit-déjeuner du lundi) — voir CLAUDE.md § Plusieurs plats par
// créneau.
function reglesDuModele(etat, jour, creneau) {
  return etat.modele.filter((r) => r.jour === jour && r.creneau === creneau);
}

// Rend la LISTE des plats effectifs d'une date + créneau : l'enregistrement
// réel dans l'historique s'il existe déjà, sinon un aperçu construit depuis
// les règles du modèle (jamais cuisiné, puisqu'il n'existe pas encore
// vraiment). NE MODIFIE PAS l'état — à utiliser pour l'affichage et les
// calculs en lecture seule (ex. calculerBesoinsSemaine).
export function obtenirElementsEffectifs(etat, dateISO, creneau) {
  const jourEntree = etat.historique[dateISO];
  if (jourEntree && jourEntree[creneau]) {
    return jourEntree[creneau].map((element) => ({ ...element }));
  }
  // Important : on reprend l'id de la RÈGLE telle quelle (pas un nouvel id
  // généré ici) pour qu'un id lu en aperçu reste valable si, juste après,
  // une action (cocher Cuisiné, retirer...) crée réellement l'enregistrement
  // du jour via obtenirOuCreerJourHistorique — qui doit produire le même id.
  return reglesDuModele(etat, jourDeLaSemaine(dateISO), creneau).map((regle) => ({
    id: regle.id,
    platId: regle.platId,
    portions: regle.portions,
    preparation: regle.preparation,
    cuisine: false,
  }));
}

// Comme obtenirElementsEffectifs, mais CRÉE (et enregistre dans
// etat.historique) l'enregistrement du jour s'il n'existe pas encore, en le
// copiant depuis le modèle. À utiliser avant toute modification d'un jour
// précis (cocher Cuisiné, ajouter/retirer un plat) : c'est cette création
// qui fait qu'une date, une fois touchée, garde sa propre histoire pour
// toujours, indépendamment des changements futurs du modèle.
function obtenirOuCreerJourHistorique(etat, dateISO) {
  if (!etat.historique[dateISO]) {
    const jour = jourDeLaSemaine(dateISO);
    const jourEntree = {};
    for (const creneau of CRENEAUX) {
      // Même id que la règle d'origine (voir obtenirElementsEffectifs) :
      // un id lu en aperçu avant cette création doit rester valable après.
      jourEntree[creneau] = reglesDuModele(etat, jour, creneau).map((regle) => ({
        id: regle.id,
        platId: regle.platId,
        portions: regle.portions,
        preparation: regle.preparation,
        cuisine: false,
      }));
    }
    etat.historique[dateISO] = jourEntree;
  }
  return etat.historique[dateISO];
}

// Calcule le besoin de la semaine (voir calculerBesoins) sur tous les plats
// EFFECTIFS de la semaine réelle qui contient `dateReference` (par défaut
// aujourd'hui). Ne modifie pas l'état : les jours pas encore consultés sont
// lus depuis le modèle sans être enregistrés dans l'historique.
function elementsDeLaSemaine(etat, dateReference) {
  const elements = [];
  for (const dateISO of datesDeLaSemaine(dateReference)) {
    for (const creneau of CRENEAUX) {
      elements.push(...obtenirElementsEffectifs(etat, dateISO, creneau));
    }
  }
  return elements;
}

export function calculerBesoinsSemaine(etat, dateReference = new Date()) {
  return calculerBesoins(elementsDeLaSemaine(etat, dateReference), etat.plats, etat.ingredients);
}

// Pour chaque ingrédient du besoin, le détail de quels plats y contribuent
// et pour quelle quantité (ex. "Riz mexicain : 150 g"). Sert uniquement à
// l'affichage (écran Courses) — n'influence aucun calcul.
// Rend une Map<ingredientId, Array<{ platNom, quantite }>>.
export function calculerDetailBesoinsSemaine(etat, dateReference = new Date()) {
  const platsParId = new Map(etat.plats.map((p) => [p.id, p]));
  const ingredientsParId = new Map(etat.ingredients.map((i) => [i.id, i]));
  const detail = new Map();

  for (const element of elementsDeLaSemaine(etat, dateReference)) {
    if (!caseCompte(element) || element.cuisine) continue;
    const plat = platsParId.get(element.platId);
    if (!plat) continue;

    for (const ligne of plat.ingredients) {
      const ingredient = ingredientsParId.get(ligne.ingredientId);
      if (!ingredient) continue;
      const quantite = element.portions * convertirVersUniteStock(
        ligne.quantitePortion,
        ligne.unite,
        ingredient
      );

      if (!detail.has(ingredient.id)) detail.set(ingredient.id, new Map());
      const parPlat = detail.get(ingredient.id);
      parPlat.set(plat.nom, (parPlat.get(plat.nom) ?? 0) + quantite);
    }
  }

  const resultat = new Map();
  for (const [ingredientId, parPlat] of detail) {
    resultat.set(
      ingredientId,
      [...parPlat.entries()].map(([platNom, quantite]) => ({ platNom, quantite }))
    );
  }
  return resultat;
}

// Construit la liste de courses complète : un article par ingrédient dont
// la quantité "à acheter" est supérieure à 0 (CLAUDE.md § Écran Courses),
// avec son rayon, son unité, et le détail d'où vient le besoin.
export function construireListeCourses(etat, dateReference = new Date()) {
  const besoins = calculerBesoinsSemaine(etat, dateReference);
  const detail = calculerDetailBesoinsSemaine(etat, dateReference);
  const aAcheter = calculerAAcheter(etat.ingredients, besoins);
  const ingredientsParId = new Map(etat.ingredients.map((i) => [i.id, i]));

  return aAcheter
    .filter((ligne) => ligne.aAcheter > 0)
    .map((ligne) => {
      const ingredient = ingredientsParId.get(ligne.ingredientId);
      return {
        ingredientId: ligne.ingredientId,
        nom: ingredient.nom,
        rayon: ingredient.rayon,
        unite: ingredient.unite,
        aAcheter: ligne.aAcheter,
        detail: detail.get(ligne.ingredientId) ?? [],
      };
    });
}

// Coche ou décoche "Cuisiné" sur UN plat précis d'une date + créneau, et
// ajuste le stock en conséquence : cocher déduit immédiatement, décocher
// restitue (correction d'erreur). Ne fait rien si l'élément a déjà cet état.
export function definirCuisine(etat, dateISO, creneau, elementId, cuisine) {
  const jourEntree = obtenirOuCreerJourHistorique(etat, dateISO);
  const element = jourEntree[creneau].find((e) => e.id === elementId);
  if (!element || element.cuisine === cuisine) {
    return;
  }
  const sens = cuisine ? -1 : 1; // cuisiner retire du stock, décocher restitue
  ajusterStockPourCase(element, etat.plats, etat.ingredients, sens);
  element.cuisine = cuisine;
}

// Ajoute un plat à une date + créneau (une case peut désormais contenir
// plusieurs plats, voir CLAUDE.md § Plusieurs plats par créneau).
// - propager = false (défaut) : "juste ce jour", n'ajoute qu'à cette date.
// - propager = true : "à partir d'aujourd'hui", ajoute AUSSI une règle au
//   modèle pour ce jour de la semaine + créneau, qui s'appliquera à tous
//   les jours futurs pas encore consultés (en plus des plats déjà prévus,
//   pas à leur place).
export function ajouterPlatAuJour(etat, dateISO, creneau, choix, propager = false) {
  const jourEntree = obtenirOuCreerJourHistorique(etat, dateISO);
  const portions = clampPositif(choix.portions) || 1;
  const preparation = choix.preparation ?? "cuisine-ici";

  jourEntree[creneau].push({
    id: genererId(),
    platId: choix.platId,
    portions,
    preparation,
    cuisine: false,
  });

  if (propager) {
    etat.modele.push({
      id: genererId(),
      jour: jourDeLaSemaine(dateISO),
      creneau,
      platId: choix.platId,
      portions,
      preparation,
    });
  }
}

// Modifie les portions et/ou la préparation d'un plat déjà présent à une
// date + créneau (toujours "juste ce jour" : pour changer la règle
// récurrente, retirer puis rajouter avec "à partir d'aujourd'hui"). Si le
// plat était déjà cuisiné, restitue d'abord son ancien stock avant
// d'appliquer le changement (sécurité : on ne modifie jamais silencieusement
// un plat déjà "consommé").
export function modifierElementDuJour(etat, dateISO, creneau, elementId, changements) {
  const jourEntree = obtenirOuCreerJourHistorique(etat, dateISO);
  const element = jourEntree[creneau].find((e) => e.id === elementId);
  if (!element) return;

  if (element.cuisine) {
    ajusterStockPourCase(element, etat.plats, etat.ingredients, 1);
    element.cuisine = false;
  }

  if (changements.portions !== undefined) {
    element.portions = clampPositif(changements.portions) || 1;
  }
  if (changements.preparation !== undefined) {
    element.preparation = changements.preparation;
  }
}

// Retire un plat d'une date + créneau (toujours "juste ce jour" : s'il
// venait d'une règle récurrente du modèle, elle n'est pas touchée et
// réapparaîtra les autres jours). Si le plat était déjà cuisiné, restitue
// d'abord son stock.
export function retirerElementDuJour(etat, dateISO, creneau, elementId) {
  const jourEntree = obtenirOuCreerJourHistorique(etat, dateISO);
  const element = jourEntree[creneau].find((e) => e.id === elementId);
  if (!element) return;

  if (element.cuisine) {
    ajusterStockPourCase(element, etat.plats, etat.ingredients, 1);
  }
  jourEntree[creneau] = jourEntree[creneau].filter((e) => e.id !== elementId);
}

// --- Écran Stock ---

// L'état d'un ingrédient, pour l'afficher (⚪ vide · 🟠 bas · 🟢 ok) :
// - vide : plus rien en stock ;
// - bas : il en reste, mais l'ingrédient est essentiel et sous son minimum ;
// - ok : sinon (pas essentiel, ou essentiel et au-dessus de son minimum).
export function etatStock(ingredient) {
  if (ingredient.enStock <= 0) return "vide";
  if (ingredient.essentiel && ingredient.enStock < ingredient.minimum) return "bas";
  return "ok";
}

// Modifie le stock, le statut "essentiel" et/ou le minimum d'un ingrédient
// existant. Chaque champ omis dans `changements` reste inchangé. Les
// quantités invalides (négatives, texte) sont ramenées à 0 (clampPositif),
// jamais refusées avec une erreur (CLAUDE.md § Cas limites).
export function modifierIngredient(etat, ingredientId, changements) {
  const ingredient = etat.ingredients.find((i) => i.id === ingredientId);
  if (!ingredient) return;

  if (changements.enStock !== undefined) {
    ingredient.enStock = clampPositif(changements.enStock);
  }
  if (changements.essentiel !== undefined) {
    ingredient.essentiel = Boolean(changements.essentiel);
  }
  if (changements.minimum !== undefined) {
    ingredient.minimum = clampPositif(changements.minimum);
  }
}

// Un identifiant simple et unique dérivé du nom (pas d'accents, minuscules,
// tirets) ; en cas de collision (deux ingrédients au nom proche), un
// compteur est ajouté à la fin.
function genererIdIngredient(etat, nom) {
  const base = nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // enlève les accents (é → e, etc.)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  const idsExistants = new Set(etat.ingredients.map((i) => i.id));

  let id = base || "ingredient";
  let compteur = 2;
  while (idsExistants.has(id)) {
    id = `${base}-${compteur}`;
    compteur += 1;
  }
  return id;
}

// Ajoute un tout nouvel ingrédient au catalogue (alimentaire ou non — voir
// CLAUDE.md § Rayons et articles non-alimentaires). Pas besoin d'être
// utilisé dans un plat pour exister : essentiel/minimum/extra démarrent à
// zéro, à régler ensuite si besoin. Rend l'ingrédient créé.
export function ajouterIngredient(etat, { nom, rayon, unite, enStock = 0 }) {
  const ingredient = {
    id: genererIdIngredient(etat, nom),
    nom,
    rayon,
    unite,
    enStock: clampPositif(enStock),
    essentiel: false,
    minimum: 0,
    extra: 0,
    parCuillereACafe: null,
  };
  etat.ingredients.push(ingredient);
  return ingredient;
}

// Supprime un ingrédient — SAUF s'il est utilisé par au moins un plat
// (CLAUDE.md § Règles de calcul) : la suppression est alors refusée, avec
// la liste des plats concernés, plutôt que de casser silencieusement ces
// plats. Rend { ok: true } si supprimé, { ok: false, plats: [...noms] } sinon.
export function supprimerIngredient(etat, ingredientId) {
  const platsConcernes = etat.plats.filter((plat) =>
    plat.ingredients.some((ligne) => ligne.ingredientId === ingredientId)
  );
  if (platsConcernes.length > 0) {
    return { ok: false, plats: platsConcernes.map((p) => p.nom) };
  }
  etat.ingredients = etat.ingredients.filter((i) => i.id !== ingredientId);
  return { ok: true };
}
