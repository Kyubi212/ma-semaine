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

import { JOURS, CRENEAUX, genererSlug } from "./constantes.js";

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
// (case volontairement vide, ex. "je sors au restaurant"), ou 0 portion
// (CLAUDE.md § Cas limites : équivalent à un créneau vide). Un repas déjà
// prêt (voir "Repas prêts" plus bas) ne passe jamais par ici : il vit à
// part, hors du planning jour par jour.
export function caseCompte(caseP) {
  return Boolean(caseP.platId) && caseP.portions > 0;
}

// Calcule, pour chaque ingrédient, la quantité nécessaire sur une liste de
// cases pas encore marquées mangées (celles-ci ont déjà déduit le stock au
// moment où on les a cochées, voir definirCuisine). Rend une
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
// Arrondi au supérieur pour toutes les unités qui se comptent (pas g/ml).
// Les g/ml restent EXACTS (10 g de sucre, pas un paquet de 1 kg) : c'est
// Qassim qui, en magasin, saisit ce qu'il a réellement acheté (voir CLAUDE.md
// § Quantités exactes dans les courses).
export function calculerAAcheter(ingredients, besoins) {
  return ingredients.map((ingredient) => {
    const besoin = besoins.get(ingredient.id) ?? 0;
    const minimumEssentiel = ingredient.essentiel ? clampPositif(ingredient.minimum) : 0;
    const extra = clampPositif(ingredient.extra);

    let quantite = Math.max(0, besoin + minimumEssentiel + extra - ingredient.enStock);
    // Tout ce qui se compte (pièce, cube, boîte, gousse...) s'achète entier :
    // jamais "0,3 cube" ou "1,5 carotte". Seuls g et ml restent au détail.
    if (ingredient.unite !== "g" && ingredient.unite !== "ml" && quantite > 0) {
      quantite = Math.ceil(quantite - 1e-9);
    }

    return { ingredientId: ingredient.id, aAcheter: quantite };
  });
}

// Texte lisible d'une quantité + unité, en français : virgule décimale,
// arrondi au dixième, et pluriel des unités en toutes lettres à partir de
// 2 ("2 pièces", "3 gousses", mais "1,5 pièce", "5 g", "2 c. à café").
export function formaterQuantite(quantite, unite) {
  const arrondi = Math.round(quantite * 10) / 10;
  const nombre = String(arrondi).replace(".", ",");
  const motEnToutesLettres = /^[a-zàâçéèêëîïôûùüÿœ]{3,}$/i.test(unite);
  const pluriel = arrondi >= 2 && motEnToutesLettres && !/[sx]$/.test(unite);
  return `${nombre} ${pluriel ? `${unite}s` : unite}`;
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

// Les 7 prochaines dates ("AAAA-MM-JJ") à partir de `dateReference` INCLUSE
// (aujourd'hui + les 6 jours suivants), PAS "lundi → dimanche" comme
// `datesDeLaSemaine` : sert au calcul des courses (voir calculerBesoinsSemaine),
// où un jour déjà passé ne doit plus compter, même si le plat prévu n'a
// jamais été coché "🍽️ Mangé" (décision de Qassim : un jour passé est clos,
// plus la peine d'acheter pour lui).
export function datesProchainsJours(dateReference) {
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(dateReference);
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

// Calcule le besoin (voir calculerBesoins) sur tous les plats EFFECTIFS des
// 7 PROCHAINS jours à partir de `dateReference` INCLUSE (par défaut
// aujourd'hui) — jamais les jours déjà passés (voir datesProchainsJours).
// Ne modifie pas l'état : les jours pas encore consultés sont lus depuis le
// modèle sans être enregistrés dans l'historique.
function elementsDeLaSemaine(etat, dateReference) {
  const elements = [];
  for (const dateISO of datesProchainsJours(dateReference)) {
    for (const creneau of creneauxAffiches(etat)) {
      elements.push(...obtenirElementsEffectifs(etat, dateISO, creneau));
    }
  }
  // Les recettes "À prévoir, sans jour" comptent aussi dans les courses :
  // c'est tout leur intérêt (avoir les ingrédients sous la main).
  for (const entree of etat.aPrevoir ?? []) {
    elements.push({ platId: entree.platId, portions: entree.portions, cuisine: false });
  }
  return elements;
}

// Besoin sur les 7 prochains jours à partir de `dateReference` (aujourd'hui
// par défaut) INCLUSE — jamais les jours déjà passés, voir elementsDeLaSemaine.
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
// avec son rayon, son unité, et le détail d'où vient le besoin. Porte sur
// les 7 prochains jours à partir d'aujourd'hui (voir calculerBesoinsSemaine),
// jamais sur des jours déjà passés.
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

  jourEntree[creneau].push({
    id: genererId(),
    platId: choix.platId,
    portions,
    cuisine: false,
  });

  if (propager) {
    etat.modele.push({
      id: genererId(),
      jour: jourDeLaSemaine(dateISO),
      creneau,
      platId: choix.platId,
      portions,
    });
  }
}

// Modifie les portions d'un plat déjà présent à une date + créneau (toujours
// "juste ce jour" : pour changer la règle récurrente, retirer puis rajouter
// avec "à partir d'aujourd'hui"). Si le plat était déjà marqué mangé,
// restitue d'abord son ancien stock avant d'appliquer le changement
// (sécurité : on ne modifie jamais silencieusement un plat déjà "consommé").
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

// Modifie le stock, le statut "essentiel", le minimum et/ou l'équivalence
// cuillère d'un ingrédient existant. Chaque champ omis dans `changements`
// reste inchangé. Les quantités invalides (négatives, texte) sont ramenées
// à 0 (clampPositif), jamais refusées avec une erreur (CLAUDE.md § Cas
// limites). Rend { ok: true } normalement, ou { ok: false, plats } si on a
// essayé de RETIRER l'équivalence cuillère (parCuillereACafe: null) alors
// qu'au moins un plat l'utilise encore pour une ligne en cuillères — sinon
// ce plat deviendrait impossible à calculer (convertirVersUniteStock
// planterait), même logique que supprimerIngredient/supprimerRayon.
export function modifierIngredient(etat, ingredientId, changements) {
  const ingredient = etat.ingredients.find((i) => i.id === ingredientId);
  if (!ingredient) return { ok: true };

  if (changements.parCuillereACafe === null && ingredient.parCuillereACafe !== null) {
    const plats = etat.plats.filter((p) =>
      p.ingredients.some(
        (ligne) => ligne.ingredientId === ingredientId && ligne.unite !== ingredient.unite
      )
    );
    if (plats.length > 0) {
      return { ok: false, plats: plats.map((p) => p.nom) };
    }
  }

  if (changements.nom !== undefined) {
    const nom = changements.nom.trim();
    if (nom) ingredient.nom = nom;
  }
  if (changements.rayon !== undefined) {
    ingredient.rayon = changements.rayon;
  }
  if (changements.enStock !== undefined) {
    ingredient.enStock = clampPositif(changements.enStock);
  }
  if (changements.essentiel !== undefined) {
    ingredient.essentiel = Boolean(changements.essentiel);
  }
  if (changements.minimum !== undefined) {
    ingredient.minimum = clampPositif(changements.minimum);
  }
  if (changements.parCuillereACafe !== undefined) {
    ingredient.parCuillereACafe =
      changements.parCuillereACafe === null ? null : clampPositif(changements.parCuillereACafe);
  }

  return { ok: true };
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
export function ajouterIngredient(etat, { nom, rayon, unite, enStock = 0, essentiel = false, minimum = 0, parCuillereACafe = null }) {
  const cuillere = clampPositif(parCuillereACafe);
  const ingredient = {
    id: genererIdIngredient(etat, nom),
    nom,
    rayon,
    unite,
    enStock: clampPositif(enStock),
    essentiel: Boolean(essentiel),
    minimum: clampPositif(minimum),
    extra: 0,
    // Les cuillères n'ont de sens que pour un ingrédient pesé (g) ou mesuré (ml).
    parCuillereACafe: (unite === "g" || unite === "ml") && cuillere > 0 ? cuillere : null,
  };
  etat.ingredients.push(ingredient);
  return ingredient;
}

// --- Rayons (catégories de courses, éditables par Qassim — voir CLAUDE.md
// § Rayons éditables) ---

// Ajoute un nouveau rayon, en fin de liste. Rend le rayon créé.
export function ajouterRayon(etat, nom) {
  const idsExistants = new Set(etat.rayons.map((r) => r.id));
  const rayon = { id: genererSlug(nom, idsExistants), nom };
  etat.rayons.push(rayon);
  return rayon;
}

// Renomme un rayon existant. Son id ne change pas : les ingrédients qui le
// référencent restent liés sans rien avoir à mettre à jour.
export function renommerRayon(etat, rayonId, nouveauNom) {
  const rayon = etat.rayons.find((r) => r.id === rayonId);
  if (!rayon) return;
  rayon.nom = nouveauNom;
}

// Supprime un rayon — SAUF s'il contient encore au moins un ingrédient
// (même logique que supprimerIngredient ci-dessous : refuser plutôt que de
// laisser des ingrédients sans rayon valide). Rend { ok: true } si
// supprimé, { ok: false, ingredients: [...noms] } sinon.
export function supprimerRayon(etat, rayonId) {
  const ingredientsConcernes = etat.ingredients.filter((i) => i.rayon === rayonId);
  if (ingredientsConcernes.length > 0) {
    return { ok: false, ingredients: ingredientsConcernes.map((i) => i.nom) };
  }
  etat.rayons = etat.rayons.filter((r) => r.id !== rayonId);
  return { ok: true };
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

// --- Écran Plats & repas ---

// Ajoute un tout nouveau plat au catalogue (écran Plats & repas). `favori`
// démarre toujours à false (à cocher ensuite depuis la liste). Rend le plat
// créé.
export function ajouterPlat(etat, { nom, repas, portionsReference = 1, etapes = "", ingredients = [], etiquettes = [], materiel = [], tempsPreparation = 0, tempsCuisson = 0 }) {
  const idsExistants = new Set(etat.plats.map((p) => p.id));
  const plat = {
    id: genererSlug(nom, idsExistants),
    nom,
    repas,
    portionsReference: Math.max(1, Math.round(Number(portionsReference)) || 1),
    etapes,
    ingredients: ingredients.map((ligne) => ({ ...ligne })),
    etiquettes: [...etiquettes],
    materiel: [...materiel],
    tempsPreparation: clampPositif(tempsPreparation),
    tempsCuisson: clampPositif(tempsCuisson),
    favori: false,
  };
  etat.plats.push(plat);
  return plat;
}

// Modifie un plat existant. L'id ne change jamais (les règles du modèle et
// l'historique le référencent). `ingredients`, si fourni, REMPLACE toute la
// liste (pas de fusion partielle).
export function modifierPlat(etat, platId, changements) {
  const plat = etat.plats.find((p) => p.id === platId);
  if (!plat) return;

  if (changements.nom !== undefined) {
    const nom = changements.nom.trim();
    if (nom) plat.nom = nom;
  }
  if (changements.repas !== undefined) plat.repas = changements.repas;
  if (changements.portionsReference !== undefined) {
    plat.portionsReference = Math.max(1, Math.round(Number(changements.portionsReference)) || 1);
  }
  if (changements.etapes !== undefined) plat.etapes = changements.etapes;
  if (changements.ingredients !== undefined) {
    plat.ingredients = changements.ingredients.map((ligne) => ({ ...ligne }));
  }
  if (changements.etiquettes !== undefined) plat.etiquettes = [...changements.etiquettes];
  if (changements.materiel !== undefined) plat.materiel = [...changements.materiel];
  if (changements.tempsPreparation !== undefined) plat.tempsPreparation = clampPositif(changements.tempsPreparation);
  if (changements.tempsCuisson !== undefined) plat.tempsCuisson = clampPositif(changements.tempsCuisson);
  if (changements.favori !== undefined) plat.favori = Boolean(changements.favori);
}

// Supprime un plat — SAUF s'il est encore utilisé, dans le modèle (règles de
// la semaine type) OU dans l'historique (n'importe quelle date, passée ou
// future) : la suppression est alors refusée, avec le détail de ces
// utilisations, plutôt que de laisser une référence orpheline (un jour déjà
// planifié qui pointerait vers un plat qui n'existe plus). Rend { ok: true }
// si supprimé, { ok: false, joursModele, datesHistorique } sinon.
export function supprimerPlat(etat, platId) {
  const joursModele = etat.modele.filter((regle) => regle.platId === platId).map((regle) => regle.jour);

  const datesHistorique = [];
  for (const [dateISO, jourEntree] of Object.entries(etat.historique)) {
    const utiliseCeJour = Object.values(jourEntree).some((elements) =>
      elements.some((element) => element.platId === platId)
    );
    if (utiliseCeJour) datesHistorique.push(dateISO);
  }

  if (joursModele.length > 0 || datesHistorique.length > 0) {
    return { ok: false, joursModele, datesHistorique };
  }

  etat.plats = etat.plats.filter((p) => p.id !== platId);
  // Une simple envie "À prévoir" ne bloque pas la suppression : elle part avec.
  if (etat.aPrevoir) etat.aPrevoir = etat.aPrevoir.filter((e) => e.platId !== platId);
  return { ok: true };
}

// --- Étiquettes (écran Plats & repas, éditables — même principe que les
// rayons). Un plat peut porter PLUSIEURS étiquettes à la fois. ---

// Ajoute une nouvelle étiquette, en fin de liste. Rend l'étiquette créée.
export function ajouterEtiquette(etat, nom) {
  const idsExistants = new Set(etat.etiquettes.map((e) => e.id));
  const etiquette = { id: genererSlug(nom, idsExistants), nom };
  etat.etiquettes.push(etiquette);
  return etiquette;
}

// Renomme une étiquette existante. Son id ne change pas : les plats qui la
// référencent restent liés sans rien avoir à mettre à jour.
export function renommerEtiquette(etat, etiquetteId, nouveauNom) {
  const etiquette = etat.etiquettes.find((e) => e.id === etiquetteId);
  if (!etiquette) return;
  etiquette.nom = nouveauNom;
}

// Supprime une étiquette — SAUF si au moins un plat la porte encore (même
// logique que supprimerRayon). Rend { ok: true } si supprimée,
// { ok: false, plats: [...noms] } sinon.
export function supprimerEtiquette(etat, etiquetteId) {
  const platsConcernes = etat.plats.filter((p) => p.etiquettes.includes(etiquetteId));
  if (platsConcernes.length > 0) {
    return { ok: false, plats: platsConcernes.map((p) => p.nom) };
  }
  etat.etiquettes = etat.etiquettes.filter((e) => e.id !== etiquetteId);
  return { ok: true };
}

// --- Matériel requis (écran Plats & repas, éditable — même principe que les
// étiquettes). Un plat peut demander PLUSIEURS matériels à la fois. ---

// Ajoute un nouveau matériel, en fin de liste. Rend le matériel créé.
export function ajouterMateriel(etat, nom) {
  const idsExistants = new Set(etat.materiel.map((m) => m.id));
  const materiel = { id: genererSlug(nom, idsExistants), nom };
  etat.materiel.push(materiel);
  return materiel;
}

// Renomme un matériel existant. Son id ne change pas : les plats qui le
// référencent restent liés sans rien avoir à mettre à jour.
export function renommerMateriel(etat, materielId, nouveauNom) {
  const materiel = etat.materiel.find((m) => m.id === materielId);
  if (!materiel) return;
  materiel.nom = nouveauNom;
}

// Supprime un matériel — SAUF si au moins un plat le demande encore (même
// logique que supprimerEtiquette). Rend { ok: true } si supprimé,
// { ok: false, plats: [...noms] } sinon.
export function supprimerMateriel(etat, materielId) {
  const platsConcernes = etat.plats.filter((p) => p.materiel.includes(materielId));
  if (platsConcernes.length > 0) {
    return { ok: false, plats: platsConcernes.map((p) => p.nom) };
  }
  etat.materiel = etat.materiel.filter((m) => m.id !== materielId);
  return { ok: true };
}

// --- Repas (écran Plats & repas, éditables — même principe que les rayons
// et les étiquettes). Contrairement aux étiquettes, un plat n'a qu'UN SEUL
// repas à la fois (comme un rayon d'ingrédient). ---

// Ajoute un nouveau repas, en fin de liste. Rend le repas créé.
export function ajouterRepas(etat, nom) {
  const idsExistants = new Set(etat.repas.map((r) => r.id));
  const repas = { id: genererSlug(nom, idsExistants), nom };
  etat.repas.push(repas);
  return repas;
}

// Renomme un repas existant. Son id ne change pas : les plats qui le
// référencent restent liés sans rien avoir à mettre à jour.
export function renommerRepas(etat, repasId, nouveauNom) {
  const repas = etat.repas.find((r) => r.id === repasId);
  if (!repas) return;
  repas.nom = nouveauNom;
}

// Supprime un repas — SAUF si au moins un plat l'utilise encore (même
// logique que supprimerEtiquette/supprimerRayon). Rend { ok: true } si
// supprimé, { ok: false, plats: [...noms] } sinon.
export function supprimerRepas(etat, repasId) {
  const platsConcernes = etat.plats.filter((p) => p.repas === repasId);
  if (platsConcernes.length > 0) {
    return { ok: false, plats: platsConcernes.map((p) => p.nom) };
  }
  etat.repas = etat.repas.filter((r) => r.id !== repasId);
  return { ok: true };
}

// --- Avertissement stock insuffisant (écran Semaine, choix "À cuisiner") ---

// Pour un plat et un nombre de portions donnés, rend la liste des
// ingrédients dont le stock actuel ne suffit pas (nom, quantité manquante,
// unité). Purement informatif : n'AJUSTE rien, ne bloque rien (voir CLAUDE.md
// § Cas limites — l'app prévient plutôt que d'empêcher).
export function ingredientsManquantsPourPlat(etat, platId, portions) {
  const plat = etat.plats.find((p) => p.id === platId);
  if (!plat) return [];

  const manquants = [];
  for (const ligne of plat.ingredients) {
    const ingredient = etat.ingredients.find((i) => i.id === ligne.ingredientId);
    if (!ingredient) continue;

    const besoin = portions * convertirVersUniteStock(ligne.quantitePortion, ligne.unite, ingredient);
    // Stock négatif (interne, ou projeté après d'autres repas prévus) compté
    // comme 0 : on n'annonce jamais plus que ce que CE plat demande (sinon
    // un 4e repas afficherait aussi le manque des précédents).
    const disponible = Math.max(0, ingredient.enStock);
    if (besoin > disponible) {
      manquants.push({ nom: ingredient.nom, manque: besoin - disponible, unite: ingredient.unite });
    }
  }
  return manquants;
}

// --- Filtre "⏱️ temps max" (préparation + cuisson) ---
//
// Remplace l'étiquette "Rapide à préparer" (demandé par Qassim : "entre midi
// et deux j'ai 20 minutes"). null = pas de limite. Les −/+ passent par des
// paliers ronds plutôt que minute par minute ; depuis "pas de limite", un
// premier appui démarre à 30 min ; au-delà du dernier palier, retour à "pas
// de limite".
export const PALIERS_TEMPS_MAX = [10, 15, 20, 30, 45, 60, 90, 120];
const TEMPS_MAX_DEPART = 30;

export function changerTempsMax(actuel, sens) {
  if (actuel === null || actuel === undefined) return TEMPS_MAX_DEPART;
  if (sens > 0) {
    const suivant = PALIERS_TEMPS_MAX.find((p) => p > actuel);
    return suivant ?? null;
  }
  const precedents = PALIERS_TEMPS_MAX.filter((p) => p < actuel);
  return precedents.length > 0 ? precedents[precedents.length - 1] : PALIERS_TEMPS_MAX[0];
}

// Temps total d'un plat (préparation + cuisson), en minutes.
export function tempsTotalPlat(plat) {
  return clampPositif(plat.tempsPreparation) + clampPositif(plat.tempsCuisson);
}

export function platDansTempsMax(plat, tempsMax) {
  if (tempsMax === null || tempsMax === undefined) return true;
  return tempsTotalPlat(plat) <= tempsMax;
}

// --- Repas affichés (créneaux choisis par Qassim) et état d'un jour ---
//
// Qassim peut masquer les créneaux qu'il n'utilise pas (ex. ne garder que
// petit-déjeuner, déjeuner, dîner). Un créneau masqué disparaît de l'écran
// Semaine ET de tous les calculs (courses, stock projeté, état du jour) :
// les plats qui y étaient prévus sont mis de côté, jamais supprimés, et
// reviennent s'il le réaffiche. Toujours dans l'ordre fixe de la journée.
export function creneauxAffiches(etat) {
  const choisis = etat.creneauxAffiches ?? CRENEAUX;
  const liste = CRENEAUX.filter((c) => choisis.includes(c));
  return liste.length > 0 ? liste : [...CRENEAUX];
}

// Affiche ou masque un créneau. Refuse de masquer le dernier affiché (une
// journée sans aucun repas n'aurait plus rien à montrer).
export function basculerCreneauAffiche(etat, creneau) {
  const actuels = creneauxAffiches(etat);
  if (actuels.includes(creneau)) {
    if (actuels.length === 1) return { ok: false };
    etat.creneauxAffiches = actuels.filter((c) => c !== creneau);
  } else {
    etat.creneauxAffiches = CRENEAUX.filter((c) => actuels.includes(c) || c === creneau);
  }
  return { ok: true };
}

// État d'un jour, pour le point sous sa pastille (écran Semaine) :
// - "vide"    : aucun plat prévu ;
// - "entame"  : au moins un plat, mais pas tous les créneaux affichés remplis ;
// - "complet" : chaque créneau affiché a au moins un plat ;
// - "mange"   : tous les plats prévus ce jour sont cochés "Mangé".
// Les créneaux masqués ne comptent pas (voir creneauxAffiches).
export function etatDuJour(etat, dateISO) {
  const parCreneau = creneauxAffiches(etat).map((c) =>
    obtenirElementsEffectifs(etat, dateISO, c).filter((e) => e.platId)
  );
  const elements = parCreneau.flat();
  if (elements.length === 0) return "vide";
  if (elements.every((e) => e.cuisine)) return "mange";
  if (parCreneau.every((liste) => liste.length > 0)) return "complet";
  return "entame";
}

// --- Stock projeté (Réalisable / "Il manque" sur le planning) ---
//
// Le stock ACTUEL ne suffit pas pour juger un repas prévu plus tard : si
// lundi et mardi prévoient déjà une compote, les pommes seront parties
// mercredi, même si elles sont encore dans le frigo aujourd'hui (cas réel
// testé par Qassim). Rend une COPIE de l'état dont le stock a été diminué
// de tout ce que les repas prévus AVANT ce moment vont consommer — à partir
// d'aujourd'hui seulement (un jour passé est clos, même règle que la liste
// de courses), et en ignorant ce qui est déjà coché "Mangé" (déjà déduit du
// vrai stock). "Avant" = les jours précédents, les créneaux précédents du
// même jour, puis :
// - sans `avantElementId` : TOUS les plats déjà prévus dans ce créneau
//   (cas d'un plat qu'on s'apprête à AJOUTER : il passe après eux) ;
// - avec `avantElementId` : seulement ceux listés avant cet élément (cas
//   d'un plat déjà prévu, pour son avertissement "Il manque").
// Ne modifie jamais l'état réel.
export function etatAvecStockProjete(etat, dateISO, creneau, { avantElementId = null, dateReference = new Date() } = {}) {
  const aujourdhuiISO = dateEnISO(dateReference);
  if (dateISO < aujourdhuiISO) return etat;

  const elementsAvant = [];
  const date = analyserDateISO(aujourdhuiISO);
  for (let dateCourante = aujourdhuiISO; dateCourante <= dateISO; ) {
    for (const creneauCourant of creneauxAffiches(etat)) {
      const elements = obtenirElementsEffectifs(etat, dateCourante, creneauCourant);
      if (dateCourante < dateISO || CRENEAUX.indexOf(creneauCourant) < CRENEAUX.indexOf(creneau)) {
        elementsAvant.push(...elements);
      } else if (creneauCourant === creneau) {
        if (avantElementId === null) {
          elementsAvant.push(...elements);
        } else {
          const index = elements.findIndex((e) => e.id === avantElementId);
          elementsAvant.push(...(index === -1 ? elements : elements.slice(0, index)));
        }
      }
    }
    date.setDate(date.getDate() + 1);
    dateCourante = dateEnISO(date);
  }

  const reserve = calculerBesoins(elementsAvant, etat.plats, etat.ingredients);
  return {
    ...etat,
    ingredients: etat.ingredients.map((ingredient) => ({
      ...ingredient,
      enStock: ingredient.enStock - (reserve.get(ingredient.id) ?? 0),
    })),
  };
}

// Un plat est "réalisable" quand le stock actuel couvre tous ses
// ingrédients pour le nombre de portions donné (1 par défaut, portions
// toujours par personne — voir CLAUDE.md § Semaine). Réutilise
// ingredientsManquantsPourPlat : réalisable = aucun ingrédient manquant.
// Sert au filtre "🧺 Réalisable avec mon stock" (écran Plats & repas).
export function platEstRealisableAvecStock(etat, platId, portions = 1) {
  return ingredientsManquantsPourPlat(etat, platId, portions).length === 0;
}

// --- Repas prêts (écran Semaine) ---
//
// Des portions déjà prêtes à manger, SANS lien avec un jour précis du
// planning (modele/historique) — un plat offert par un voisin (recette
// inconnue), un batch-cook fait à l'avance... Qassim les consulte et les
// mange au fur et à mesure, sans devoir les caser dans un jour.

// Ajoute des portions au stock de repas prêts. Si `platId` est fourni (un
// vrai plat du catalogue, ex. un batch-cook), déduit IMMÉDIATEMENT le stock
// d'ingrédients pour ces portions (on considère qu'elles viennent d'être
// cuisinées) — sans `platId` (recette inconnue, ex. le plat du voisin),
// aucun ingrédient n'est déduit, faute de savoir ce qu'il contient. Rend le
// repas prêt créé.
export function ajouterRepasPret(etat, { nom, platId = null, portions }) {
  const quantite = clampPositif(portions) || 1;
  if (platId) {
    // Déduit ce qui a servi, mais sans faire passer le stock sous zéro : un
    // repas prêt est DÉJÀ cuisiné, il ne doit jamais générer d'achats (bug
    // remonté par Qassim : un repas prêt sans stock remplissait la liste de
    // courses). Pour avoir des ingrédients sous la main, c'est "À prévoir".
    deduireSansPasserSousZero({ platId, portions: quantite }, etat);
  }
  const repasPret = { id: genererId(), nom, platId, portions: quantite };
  etat.repasPrets.push(repasPret);
  return repasPret;
}

// Comme ajusterStockPourCase(..., -1), mais un stock ne descend jamais sous
// zéro à cause de cette déduction (s'il était déjà négatif, il n'est pas
// touché davantage).
function deduireSansPasserSousZero(caseP, etat) {
  const plat = etat.plats.find((p) => p.id === caseP.platId);
  if (!plat) return;
  for (const ligne of plat.ingredients) {
    const ingredient = etat.ingredients.find((i) => i.id === ligne.ingredientId);
    if (!ingredient) continue;
    const quantite = caseP.portions * convertirVersUniteStock(ligne.quantitePortion, ligne.unite, ingredient);
    ingredient.enStock = Math.max(Math.min(ingredient.enStock, 0), ingredient.enStock - quantite);
  }
}

// Marque une portion comme mangée : décrémente de 1. Rien d'autre à
// cocher — si ça tombe à 0, l'entrée disparaît toute seule (CLAUDE.md
// § Méthode : pas de case en trop pour un repas déjà à 0 portion).
export function mangerRepasPret(etat, repasPretId) {
  const repasPret = etat.repasPrets.find((r) => r.id === repasPretId);
  if (!repasPret) return;
  repasPret.portions -= 1;
  if (repasPret.portions <= 0) {
    etat.repasPrets = etat.repasPrets.filter((r) => r.id !== repasPretId);
  }
}

// Retire un repas prêt en entier (ex. erreur de saisie, ou périmé/jeté).
export function retirerRepasPret(etat, repasPretId) {
  etat.repasPrets = etat.repasPrets.filter((r) => r.id !== repasPretId);
}

// --- À prévoir, sans jour (écran Semaine) ---
//
// Des recettes qu'on veut pouvoir cuisiner "à un moment" (ex. peut-être ce
// week-end) sans les caser dans un jour précis : leurs ingrédients comptent
// dans la liste de courses, comme un repas planifié (voir
// elementsDeLaSemaine). Rien n'est déduit du stock tant qu'on ne l'a pas
// cuisinée. Contrairement aux Repas prêts (déjà cuisinés), elles génèrent
// donc des achats — c'est leur but. Demandé par Qassim.

export function ajouterAPrevoir(etat, { platId, portions }) {
  if (!etat.aPrevoir) etat.aPrevoir = [];
  const entree = { id: genererId(), platId, portions: clampPositif(portions) || 1 };
  etat.aPrevoir.push(entree);
  return entree;
}

export function modifierPortionsAPrevoir(etat, entreeId, portions) {
  const entree = (etat.aPrevoir ?? []).find((e) => e.id === entreeId);
  if (entree) entree.portions = Math.max(1, clampPositif(portions));
}

// Retire sans rien déduire (changement d'avis).
export function retirerAPrevoir(etat, entreeId) {
  etat.aPrevoir = (etat.aPrevoir ?? []).filter((e) => e.id !== entreeId);
}

// Cuisinée : déduit le stock (comme "Mangé" sur le planning) et la retire.
export function cuisinerAPrevoir(etat, entreeId) {
  const entree = (etat.aPrevoir ?? []).find((e) => e.id === entreeId);
  if (!entree) return;
  ajusterStockPourCase(entree, etat.plats, etat.ingredients, -1);
  retirerAPrevoir(etat, entreeId);
}

// --- Partir d'une appli vide (menu ⋯) ---
//
// Pour qui veut tout renseigner lui-même, avec ses propres produits et ses
// propres noms (demandé par Qassim) : vide plats, ingrédients, étiquettes,
// matériel, planning (modèle + historique), repas prêts et "À prévoir".
// Garde la structure qui sert de cadre : rayons, repas (catégories de
// plats) et créneaux affichés — éditables ensuite comme d'habitude.
export function viderPourPartirDeZero(etat) {
  etat.plats = [];
  etat.ingredients = [];
  etat.etiquettes = [];
  etat.materiel = [];
  etat.modele = [];
  etat.historique = {};
  etat.repasPrets = [];
  etat.aPrevoir = [];
}

// --- Suppression multiple (sélection "☑️" dans les listes) ---
//
// Applique la fonction de suppression habituelle d'un type (supprimerPlat,
// supprimerIngredient, supprimerEtiquette...) à chaque id choisi, sans
// jamais contourner ses refus : ce qui est encore utilisé (plat au
// planning, ingrédient d'une recette...) reste en place et est rendu dans
// `refuses`, avec la réponse de la fonction pour expliquer pourquoi.
export function supprimerPlusieurs(ids, supprimerUn) {
  const supprimes = [];
  const refuses = [];
  for (const id of ids) {
    const resultat = supprimerUn(id);
    if (resultat.ok) supprimes.push(id);
    else refuses.push({ id, resultat });
  }
  return { supprimes, refuses };
}
