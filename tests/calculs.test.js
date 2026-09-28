// Tests de calculs.js — la logique de calcul est la partie la plus
// importante à vérifier automatiquement (voir CLAUDE.md § Approche de test).
//
// Lancer avec : node --test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formaterQuantite,
  clampPositif,
  convertirVersUniteStock,
  caseCompte,
  calculerBesoins,
  calculerAAcheter,
  marquerAchete,
  dateEnISO,
  jourDeLaSemaine,
  datesDeLaSemaine,
  datesProchainsJours,
  decalerSemaine,
  obtenirElementsEffectifs,
  calculerBesoinsSemaine,
  definirCuisine,
  ajouterPlatAuJour,
  modifierElementDuJour,
  retirerElementDuJour,
  calculerDetailBesoinsSemaine,
  construireListeCourses,
  etatStock,
  modifierIngredient,
  ajouterIngredient,
  supprimerIngredient,
  ajouterRayon,
  renommerRayon,
  supprimerRayon,
  ajouterPlat,
  modifierPlat,
  supprimerPlat,
  ajouterEtiquette,
  renommerEtiquette,
  supprimerEtiquette,
  ajouterMateriel,
  renommerMateriel,
  supprimerMateriel,
  ajouterRepas,
  renommerRepas,
  supprimerRepas,
  ingredientsManquantsPourPlat,
  platEstRealisableAvecStock,
  ajouterRepasPret,
  mangerRepasPret,
  retirerRepasPret,
} from "../calculs.js";
import { creerEtatInitial } from "../storage.js";
import { JOURS } from "../constantes.js";

// --- clampPositif ---

test("clampPositif : garde les nombres positifs tels quels", () => {
  assert.equal(clampPositif(5), 5);
  assert.equal(clampPositif(0), 0);
  assert.equal(clampPositif(2.5), 2.5);
});

test("clampPositif : ramène les nombres négatifs à 0", () => {
  assert.equal(clampPositif(-3), 0);
});

test("clampPositif : ramène le texte ou l'absence de valeur à 0", () => {
  assert.equal(clampPositif("abc"), 0);
  assert.equal(clampPositif(undefined), 0);
  assert.equal(clampPositif(null), 0);
});

// --- convertirVersUniteStock ---

const huile = { id: "huile", nom: "Huile d'olive", unite: "ml", parCuillereACafe: 5 };
const riz = { id: "riz", nom: "Riz", unite: "g", parCuillereACafe: null };

test("convertirVersUniteStock : même unité, aucune conversion", () => {
  assert.equal(convertirVersUniteStock(150, "g", riz), 150);
});

test("convertirVersUniteStock : c. à café → unité de stock via parCuillereACafe", () => {
  assert.equal(convertirVersUniteStock(2, "c. à café", huile), 2 * 5);
});

test("convertirVersUniteStock : c. à soupe = 3 c. à café", () => {
  assert.equal(convertirVersUniteStock(1, "c. à soupe", huile), 1 * 3 * 5);
});

test("convertirVersUniteStock : unités incompatibles → erreur", () => {
  assert.throws(() => convertirVersUniteStock(1, "pièce", riz));
});

test("convertirVersUniteStock : cuillère sans parCuillereACafe → erreur", () => {
  const sansEquivalence = { id: "x", nom: "Mystère", unite: "g", parCuillereACafe: null };
  assert.throws(() => convertirVersUniteStock(1, "c. à café", sansEquivalence));
});

// --- caseCompte ---

test("caseCompte : vrai seulement avec un plat et des portions > 0", () => {
  assert.equal(caseCompte({ platId: "p1", portions: 1 }), true);
  assert.equal(caseCompte({ platId: null, portions: 1 }), false);
  assert.equal(caseCompte({ platId: "p1", portions: 0 }), false);
});

// --- calculerBesoins (avec un plat et un ingrédient fabriqués, pour un calcul exact) ---

const platTest = {
  id: "plat-test",
  ingredients: [{ ingredientId: "riz", quantitePortion: 100, unite: "g" }],
};
const platTest2 = {
  id: "plat-test-2",
  ingredients: [{ ingredientId: "huile", quantitePortion: 10, unite: "ml" }],
};
const ingredientsTest = [
  { ...riz, enStock: 0, essentiel: false, minimum: 0, extra: 0 },
  { ...huile, enStock: 0, essentiel: false, minimum: 0, extra: 0 },
];

test("calculerBesoins : additionne portions × quantité par portion sur les cases qui comptent", () => {
  const cases = [
    { platId: "plat-test", portions: 2, preparation: "cuisine-ici", cuisine: false },
    { platId: "plat-test", portions: 1, preparation: "cuisine-ici", cuisine: false },
  ];
  const besoins = calculerBesoins(cases, [platTest], ingredientsTest);
  assert.equal(besoins.get("riz"), 300); // 2*100 + 1*100
});

test("calculerBesoins : additionne plusieurs plats différents d'une même case", () => {
  // Deux plats au même créneau (ex. "fruits" + "œufs") : la somme doit
  // couvrir les deux, voir CLAUDE.md § Plusieurs plats par créneau.
  const cases = [
    { platId: "plat-test", portions: 1, preparation: "cuisine-ici", cuisine: false },
    { platId: "plat-test-2", portions: 1, preparation: "cuisine-ici", cuisine: false },
  ];
  const besoins = calculerBesoins(cases, [platTest, platTest2], ingredientsTest);
  assert.equal(besoins.get("riz"), 100);
  assert.equal(besoins.get("huile"), 10);
});

test("calculerBesoins : ignore les cases déjà mangées, à 0 portion ou vides", () => {
  const cases = [
    { platId: "plat-test", portions: 2, cuisine: true },
    { platId: "plat-test", portions: 0, cuisine: false },
    { platId: null, portions: 1, cuisine: false },
  ];
  const besoins = calculerBesoins(cases, [platTest], ingredientsTest);
  assert.equal(besoins.size, 0);
});

test("calculerBesoins : plat supprimé entre-temps → ignoré sans planter", () => {
  const cases = [{ platId: "plat-fantome", portions: 1, preparation: "cuisine-ici", cuisine: false }];
  assert.doesNotThrow(() => calculerBesoins(cases, [platTest], ingredientsTest));
});

// --- calculerAAcheter ---

test("calculerAAcheter : besoin + minimum essentiel + extra − stock, jamais négatif", () => {
  const ingredients = [
    { id: "a", unite: "g", enStock: 50, essentiel: false, minimum: 0, extra: 0 },
    { id: "b", unite: "g", enStock: 500, essentiel: false, minimum: 0, extra: 0 },
  ];
  const besoins = new Map([["a", 120], ["b", 10]]);
  const resultats = calculerAAcheter(ingredients, besoins);
  assert.equal(resultats.find((r) => r.ingredientId === "a").aAcheter, 70);
  assert.equal(resultats.find((r) => r.ingredientId === "b").aAcheter, 0);
});

test("calculerAAcheter : ajoute le minimum si essentiel, et l'extra", () => {
  const ingredients = [{ id: "sel", unite: "g", enStock: 10, essentiel: true, minimum: 50, extra: 20 }];
  const besoins = new Map([["sel", 0]]);
  const resultats = calculerAAcheter(ingredients, besoins);
  assert.equal(resultats[0].aAcheter, 60);
});

test("calculerAAcheter : arrondit au supérieur pour l'unité 'pièce', pas pour les autres", () => {
  const ingredients = [
    { id: "oeuf", unite: "pièce", enStock: 0, essentiel: false, minimum: 0, extra: 0 },
    { id: "riz", unite: "g", enStock: 0, essentiel: false, minimum: 0, extra: 0 },
  ];
  const besoins = new Map([["oeuf", 2.4], ["riz", 133.3]]);
  const resultats = calculerAAcheter(ingredients, besoins);
  assert.equal(resultats.find((r) => r.ingredientId === "oeuf").aAcheter, 3);
  assert.equal(resultats.find((r) => r.ingredientId === "riz").aAcheter, 133.3);
});

test("calculerAAcheter : arrondit au paquet entier si l'ingrédient a un conditionnement", () => {
  const ingredients = [
    { id: "beurre", unite: "g", enStock: 0, essentiel: false, minimum: 0, extra: 0, conditionnement: 250 },
    { id: "cannelle", unite: "g", enStock: 0, essentiel: false, minimum: 0, extra: 0, conditionnement: 40 },
    { id: "lait", unite: "ml", enStock: 200, essentiel: false, minimum: 0, extra: 0, conditionnement: 1000 },
    { id: "riz", unite: "g", enStock: 0, essentiel: false, minimum: 0, extra: 0, conditionnement: null },
  ];
  const besoins = new Map([["beurre", 5], ["cannelle", 0.5], ["lait", 1500], ["riz", 133.3]]);
  const resultats = calculerAAcheter(ingredients, besoins);
  const aAcheter = (id) => resultats.find((r) => r.ingredientId === id).aAcheter;
  assert.equal(aAcheter("beurre"), 250, "5 g de beurre → 1 plaquette de 250 g");
  assert.equal(aAcheter("cannelle"), 40, "0,5 g de cannelle → 1 pot de 40 g");
  assert.equal(aAcheter("lait"), 2000, "1500 − 200 ml en stock = 1300 ml → 2 bouteilles de 1 L");
  assert.equal(aAcheter("riz"), 133.3, "sans conditionnement, quantité exacte comme avant");
});

test("calculerAAcheter : un besoin pile égal à un paquet n'en fait pas acheter un 2e (arrondi flottant)", () => {
  const ingredients = [{ id: "miel", unite: "g", enStock: 0, essentiel: false, minimum: 0, extra: 0, conditionnement: 500 }];
  const besoins = new Map([["miel", 500.0000000001]]);
  assert.equal(calculerAAcheter(ingredients, besoins)[0].aAcheter, 500);
});

test("calculerAAcheter : rien à acheter reste à 0, même avec un conditionnement", () => {
  const ingredients = [{ id: "sel", unite: "g", enStock: 900, essentiel: false, minimum: 0, extra: 0, conditionnement: 1000 }];
  const besoins = new Map([["sel", 10]]);
  assert.equal(calculerAAcheter(ingredients, besoins)[0].aAcheter, 0);
});

test("calculerAAcheter : toute unité qui se compte (cube, boîte...) est arrondie au supérieur", () => {
  const ingredients = [
    { id: "bouillon", unite: "cube", enStock: 0, essentiel: false, minimum: 0, extra: 0 },
    { id: "carotte", unite: "pièce", enStock: 0, essentiel: false, minimum: 0, extra: 0 },
    { id: "ail", unite: "gousse", enStock: 0, essentiel: false, minimum: 0, extra: 0 },
  ];
  const besoins = new Map([["bouillon", 0.3], ["carotte", 1.5], ["ail", 2]]);
  const resultats = calculerAAcheter(ingredients, besoins);
  const aAcheter = (id) => resultats.find((r) => r.ingredientId === id).aAcheter;
  assert.equal(aAcheter("bouillon"), 1);
  assert.equal(aAcheter("carotte"), 2);
  assert.equal(aAcheter("ail"), 2, "un nombre déjà entier ne bouge pas");
});

// --- formaterQuantite ---

test("formaterQuantite : pluriel des unités en toutes lettres à partir de 2", () => {
  assert.equal(formaterQuantite(2, "pièce"), "2 pièces");
  assert.equal(formaterQuantite(3, "gousse"), "3 gousses");
  assert.equal(formaterQuantite(1, "pièce"), "1 pièce");
  assert.equal(formaterQuantite(1.5, "tranche"), "1,5 tranche");
});

test("formaterQuantite : abréviations et cuillères restent invariables, virgule décimale", () => {
  assert.equal(formaterQuantite(5, "g"), "5 g");
  assert.equal(formaterQuantite(250, "ml"), "250 ml");
  assert.equal(formaterQuantite(2, "c. à café"), "2 c. à café");
  assert.equal(formaterQuantite(0.5, "g"), "0,5 g");
  assert.equal(formaterQuantite(3, "dose"), "3 doses");
  assert.equal(formaterQuantite(2.04, "g"), "2 g");
});

test("modifierIngredient : règle ou retire le conditionnement (0 ou vide = aucun)", () => {
  const etat = { ingredients: [{ id: "beurre", unite: "g", enStock: 0, parCuillereACafe: 5, conditionnement: null }], plats: [] };
  modifierIngredient(etat, "beurre", { conditionnement: "250" });
  assert.equal(etat.ingredients[0].conditionnement, 250);
  modifierIngredient(etat, "beurre", { conditionnement: 0 });
  assert.equal(etat.ingredients[0].conditionnement, null);
  modifierIngredient(etat, "beurre", { conditionnement: -3 });
  assert.equal(etat.ingredients[0].conditionnement, null);
});

// --- marquerAchete ---

test("marquerAchete : ajoute au stock et remet l'extra à 0", () => {
  const ingredient = { enStock: 10, extra: 5 };
  marquerAchete(ingredient, 40);
  assert.equal(ingredient.enStock, 50);
  assert.equal(ingredient.extra, 0);
});

test("marquerAchete : une quantité négative ou invalide n'ajoute rien", () => {
  const ingredient = { enStock: 10, extra: 0 };
  marquerAchete(ingredient, -5);
  assert.equal(ingredient.enStock, 10);
});

// --- Dates et semaines réelles ---

test("dateEnISO : formate une date en AAAA-MM-JJ (heure locale)", () => {
  assert.equal(dateEnISO(new Date(2026, 8, 24)), "2026-09-24"); // jeudi 24/09/2026
  assert.equal(dateEnISO(new Date(2026, 0, 5)), "2026-01-05"); // vérifie le zero-padding
});

test("jourDeLaSemaine : associe une date ISO au bon jour de la semaine type", () => {
  assert.equal(jourDeLaSemaine("2026-09-21"), "lundi");
  assert.equal(jourDeLaSemaine("2026-09-24"), "jeudi");
  assert.equal(jourDeLaSemaine("2026-09-27"), "dimanche");
});

test("datesDeLaSemaine : rend les 7 dates lundi → dimanche de la semaine contenant la référence", () => {
  const dates = datesDeLaSemaine(new Date(2026, 8, 24)); // jeudi 24/09/2026
  assert.deepEqual(dates, [
    "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24",
    "2026-09-25", "2026-09-26", "2026-09-27",
  ]);
});

test("datesDeLaSemaine : un dimanche donne bien la semaine qui se termine ce jour-là", () => {
  const dates = datesDeLaSemaine(new Date(2026, 8, 27)); // dimanche 27/09/2026
  assert.equal(dates[0], "2026-09-21");
  assert.equal(dates[6], "2026-09-27");
});

test("datesProchainsJours : rend la référence incluse puis les 6 jours suivants (jamais avant)", () => {
  const dates = datesProchainsJours(new Date(2026, 8, 24)); // jeudi 24/09/2026
  assert.deepEqual(dates, [
    "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27",
    "2026-09-28", "2026-09-29", "2026-09-30",
  ]);
});

test("decalerSemaine : avance ou recule de 7 jours par semaine demandée", () => {
  const reference = new Date(2026, 8, 24);
  assert.equal(dateEnISO(decalerSemaine(reference, 1)), "2026-10-01");
  assert.equal(dateEnISO(decalerSemaine(reference, -1)), "2026-09-17");
  assert.equal(dateEnISO(decalerSemaine(reference, 2)), "2026-10-08");
});

// --- obtenirElementsEffectifs / ajouterPlatAuJour / definirCuisine / etc. ---

function etatDeTest() {
  const etat = creerEtatInitial();
  // Copies (pas les objets partagés platTest/platTest2) : certains tests
  // modifient le "nom" du plat, ça ne doit pas fuiter d'un test à l'autre.
  etat.plats = [
    { ...platTest, ingredients: platTest.ingredients.map((l) => ({ ...l })), etiquettes: [], materiel: [] },
    { ...platTest2, ingredients: platTest2.ingredients.map((l) => ({ ...l })), etiquettes: [], materiel: [] },
  ];
  etat.ingredients = [
    { ...riz, enStock: 200, rayon: "Épicerie", essentiel: false, minimum: 0, extra: 0 },
    { ...huile, enStock: 200, rayon: "Épicerie", essentiel: false, minimum: 0, extra: 0 },
  ];
  return etat;
}

test("obtenirElementsEffectifs : sans historique, reprend les règles du modèle (jamais cuisiné)", () => {
  const etat = etatDeTest();
  etat.modele.push({ id: "r1", jour: "lundi", creneau: "lunch", platId: "plat-test", portions: 3, preparation: "cuisine-ici" });

  const elements = obtenirElementsEffectifs(etat, "2026-09-21", "lunch"); // lundi
  assert.equal(elements.length, 1);
  assert.equal(elements[0].platId, "plat-test");
  assert.equal(elements[0].portions, 3);
  assert.equal(elements[0].cuisine, false);
  assert.equal(etat.historique["2026-09-21"], undefined, "ne doit rien enregistrer en lecture seule");
});

test("obtenirElementsEffectifs : plusieurs règles pour le même jour + créneau → plusieurs plats", () => {
  const etat = etatDeTest();
  etat.modele.push(
    { id: "r1", jour: "lundi", creneau: "petit-dejeuner", platId: "plat-test", portions: 1, preparation: "cuisine-ici" },
    { id: "r2", jour: "lundi", creneau: "petit-dejeuner", platId: "plat-test-2", portions: 1, preparation: "cuisine-ici" }
  );
  const elements = obtenirElementsEffectifs(etat, "2026-09-21", "petit-dejeuner");
  assert.equal(elements.length, 2);
  assert.deepEqual(elements.map((e) => e.platId).sort(), ["plat-test", "plat-test-2"]);
});

test("ajouterPlatAuJour : 'juste ce jour' ajoute au jour sans toucher au modèle", () => {
  const etat = etatDeTest();
  ajouterPlatAuJour(etat, "2026-09-21", "lunch", { platId: "plat-test", portions: 2 }, false);

  const elements = etat.historique["2026-09-21"].lunch;
  assert.equal(elements.length, 1);
  assert.equal(elements[0].platId, "plat-test");
  assert.equal(etat.modele.length, 0, "le modèle ne doit pas changer");
});

test("ajouterPlatAuJour : on peut ajouter plusieurs plats à la même case", () => {
  const etat = etatDeTest();
  ajouterPlatAuJour(etat, "2026-09-21", "petit-dejeuner", { platId: "plat-test", portions: 1 }, false);
  ajouterPlatAuJour(etat, "2026-09-21", "petit-dejeuner", { platId: "plat-test-2", portions: 1 }, false);

  const elements = etat.historique["2026-09-21"]["petit-dejeuner"];
  assert.equal(elements.length, 2);
});

test("ajouterPlatAuJour : 'à partir d'aujourd'hui' ajoute AUSSI une règle au modèle", () => {
  const etat = etatDeTest();
  ajouterPlatAuJour(etat, "2026-09-21", "lunch", { platId: "plat-test", portions: 2 }, true);

  assert.equal(etat.modele.length, 1);
  assert.equal(etat.modele[0].jour, "lundi");
  assert.equal(etat.modele[0].platId, "plat-test");

  // Un jour futur (même jour de semaine) pas encore consulté doit reprendre ce choix.
  const semaineSuivante = obtenirElementsEffectifs(etat, "2026-09-28", "lunch"); // lundi suivant
  assert.equal(semaineSuivante.length, 1);
  assert.equal(semaineSuivante[0].platId, "plat-test");
});

test("ajouterPlatAuJour : la propagation ne remplace pas les plats déjà prévus, elle s'ajoute", () => {
  const etat = etatDeTest();
  etat.modele.push({ id: "r1", jour: "lundi", creneau: "lunch", platId: "plat-test", portions: 1, preparation: "cuisine-ici" });
  ajouterPlatAuJour(etat, "2026-09-21", "lunch", { platId: "plat-test-2", portions: 1 }, true);

  const elements = obtenirElementsEffectifs(etat, "2026-09-28", "lunch");
  assert.equal(elements.length, 2);
});

test("definirCuisine : coche un plat précis, déduit le stock, décocher le restitue", () => {
  const etat = etatDeTest();
  ajouterPlatAuJour(etat, "2026-09-21", "lunch", { platId: "plat-test", portions: 2 }, false);
  const [element] = etat.historique["2026-09-21"].lunch;

  definirCuisine(etat, "2026-09-21", "lunch", element.id, true);
  assert.equal(etat.ingredients.find((i) => i.id === "riz").enStock, 0); // 200 - 2*100
  assert.equal(etat.historique["2026-09-21"].lunch[0].cuisine, true);

  definirCuisine(etat, "2026-09-21", "lunch", element.id, false);
  assert.equal(etat.ingredients.find((i) => i.id === "riz").enStock, 200);
});

test("definirCuisine : ne touche qu'au plat visé, pas aux autres plats de la même case", () => {
  const etat = etatDeTest();
  ajouterPlatAuJour(etat, "2026-09-21", "petit-dejeuner", { platId: "plat-test", portions: 1 }, false);
  ajouterPlatAuJour(etat, "2026-09-21", "petit-dejeuner", { platId: "plat-test-2", portions: 1 }, false);
  const [premier, second] = etat.historique["2026-09-21"]["petit-dejeuner"];

  definirCuisine(etat, "2026-09-21", "petit-dejeuner", premier.id, true);
  assert.equal(etat.ingredients.find((i) => i.id === "riz").enStock, 100); // déduit
  assert.equal(etat.ingredients.find((i) => i.id === "huile").enStock, 200); // inchangé
  assert.equal(etat.historique["2026-09-21"]["petit-dejeuner"].find((e) => e.id === second.id).cuisine, false);
});

test("definirCuisine : cocher deux fois de suite ne déduit qu'une fois", () => {
  const etat = etatDeTest();
  ajouterPlatAuJour(etat, "2026-09-21", "lunch", { platId: "plat-test", portions: 1 }, false);
  const [element] = etat.historique["2026-09-21"].lunch;
  definirCuisine(etat, "2026-09-21", "lunch", element.id, true);
  definirCuisine(etat, "2026-09-21", "lunch", element.id, true);
  assert.equal(etat.ingredients.find((i) => i.id === "riz").enStock, 100);
});

test("modifierElementDuJour : change les portions, restitue d'abord le stock si déjà cuisiné", () => {
  const etat = etatDeTest();
  ajouterPlatAuJour(etat, "2026-09-21", "lunch", { platId: "plat-test", portions: 1 }, false);
  const [element] = etat.historique["2026-09-21"].lunch;
  definirCuisine(etat, "2026-09-21", "lunch", element.id, true);
  assert.equal(etat.ingredients.find((i) => i.id === "riz").enStock, 100);

  modifierElementDuJour(etat, "2026-09-21", "lunch", element.id, { portions: 2 });
  assert.equal(etat.ingredients.find((i) => i.id === "riz").enStock, 200, "le stock doit être restitué");
  assert.equal(etat.historique["2026-09-21"].lunch[0].portions, 2);
  assert.equal(etat.historique["2026-09-21"].lunch[0].cuisine, false);
});

test("retirerElementDuJour : enlève un plat de ce jour, restitue le stock s'il était cuisiné", () => {
  const etat = etatDeTest();
  ajouterPlatAuJour(etat, "2026-09-21", "petit-dejeuner", { platId: "plat-test", portions: 1 }, false);
  ajouterPlatAuJour(etat, "2026-09-21", "petit-dejeuner", { platId: "plat-test-2", portions: 1 }, false);
  const [premier, second] = etat.historique["2026-09-21"]["petit-dejeuner"];
  definirCuisine(etat, "2026-09-21", "petit-dejeuner", premier.id, true);

  retirerElementDuJour(etat, "2026-09-21", "petit-dejeuner", premier.id);
  const restants = etat.historique["2026-09-21"]["petit-dejeuner"];
  assert.equal(restants.length, 1);
  assert.equal(restants[0].id, second.id);
  assert.equal(etat.ingredients.find((i) => i.id === "riz").enStock, 200, "le stock doit être restitué");
});

test("retirerElementDuJour : ne touche pas au modèle (réapparaît les autres jours)", () => {
  const etat = etatDeTest();
  etat.modele.push({ id: "r1", jour: "lundi", creneau: "lunch", platId: "plat-test", portions: 1, preparation: "cuisine-ici" });
  const [element] = obtenirElementsEffectifs(etat, "2026-09-21", "lunch");
  retirerElementDuJour(etat, "2026-09-21", "lunch", element.id);

  assert.equal(etat.historique["2026-09-21"].lunch.length, 0);
  assert.equal(obtenirElementsEffectifs(etat, "2026-09-28", "lunch").length, 1, "lundi suivant garde la règle");
});

// --- calculerBesoinsSemaine ---

test("calculerBesoinsSemaine : additionne sur les 7 jours de la semaine réelle en cours", () => {
  const etat = etatDeTest();
  etat.modele.push(
    { id: "r1", jour: "lundi", creneau: "lunch", platId: "plat-test", portions: 1, preparation: "cuisine-ici" },
    { id: "r2", jour: "jeudi", creneau: "lunch", platId: "plat-test", portions: 1, preparation: "cuisine-ici" }
  );
  const besoins = calculerBesoinsSemaine(etat, new Date(2026, 8, 24)); // jeudi 24/09/2026
  assert.equal(besoins.get("riz"), 200);
});

test("calculerBesoinsSemaine : un plat déjà cuisiné cette semaine ne compte plus dans le besoin", () => {
  const etat = etatDeTest();
  etat.modele.push({ id: "r1", jour: "lundi", creneau: "lunch", platId: "plat-test", portions: 1, preparation: "cuisine-ici" });
  const [element] = obtenirElementsEffectifs(etat, "2026-09-21", "lunch");
  definirCuisine(etat, "2026-09-21", "lunch", element.id, true);

  // Référence = lundi 21/09/2026 lui-même ("aujourd'hui"), pour que ce jour
  // reste dans la fenêtre des 7 prochains jours (voir datesProchainsJours).
  const besoins = calculerBesoinsSemaine(etat, new Date(2026, 8, 21));
  assert.equal(besoins.get("riz") ?? 0, 0);
});

test("calculerBesoinsSemaine : un jour déjà passé ne compte plus, même sans avoir coché Mangé", () => {
  const etat = etatDeTest();
  // "Juste ce jour" (propager=false) : aucune règle récurrente, seulement
  // l'historique de cette date précise — rien ne le fait réapparaître ailleurs.
  ajouterPlatAuJour(etat, "2026-09-21", "lunch", { platId: "plat-test", portions: 1 }, false);

  const besoins = calculerBesoinsSemaine(etat, new Date(2026, 8, 24)); // jeudi 24/09, lundi 21 est passé
  assert.equal(besoins.get("riz") ?? 0, 0, "un jour passé ne doit plus compter, décision de Qassim");
});

// --- calculerDetailBesoinsSemaine / construireListeCourses ---

test("calculerDetailBesoinsSemaine : indique quel plat contribue et pour combien", () => {
  const etat = etatDeTest();
  etat.plats[0].nom = "Plat Test";
  ajouterPlatAuJour(etat, "2026-09-21", "lunch", { platId: "plat-test", portions: 2 }, false);

  // Référence = 21/09 lui-même, pour que ce jour précis reste dans la
  // fenêtre des 7 prochains jours (voir datesProchainsJours).
  const detail = calculerDetailBesoinsSemaine(etat, new Date(2026, 8, 21));
  const detailRiz = detail.get("riz");
  assert.equal(detailRiz.length, 1);
  assert.equal(detailRiz[0].platNom, "Plat Test");
  assert.equal(detailRiz[0].quantite, 200); // 2 portions × 100 g
});

test("calculerDetailBesoinsSemaine : additionne si le même plat apparaît plusieurs fois", () => {
  const etat = etatDeTest();
  etat.plats[0].nom = "Plat Test";
  ajouterPlatAuJour(etat, "2026-09-21", "lunch", { platId: "plat-test", portions: 1 }, false);
  ajouterPlatAuJour(etat, "2026-09-22", "diner", { platId: "plat-test", portions: 1 }, false);

  const detail = calculerDetailBesoinsSemaine(etat, new Date(2026, 8, 21));
  const detailRiz = detail.get("riz");
  assert.equal(detailRiz.length, 1); // un seul plat nommé "Plat Test", quantités cumulées
  assert.equal(detailRiz[0].platNom, "Plat Test");
  assert.equal(detailRiz[0].quantite, 200); // 100g + 100g
});

test("calculerDetailBesoinsSemaine : deux plats différents apparaissent séparément", () => {
  const etat = etatDeTest();
  etat.plats[0].nom = "Plat Riz";
  etat.plats[1].nom = "Plat Huile";
  // plat-test-2 utilise l'huile, pas le riz : pas d'entrée croisée attendue.
  ajouterPlatAuJour(etat, "2026-09-21", "petit-dejeuner", { platId: "plat-test", portions: 1 }, false);
  ajouterPlatAuJour(etat, "2026-09-21", "petit-dejeuner", { platId: "plat-test-2", portions: 1 }, false);

  const detail = calculerDetailBesoinsSemaine(etat, new Date(2026, 8, 21));
  assert.equal(detail.get("riz").length, 1);
  assert.equal(detail.get("riz")[0].platNom, "Plat Riz");
  assert.equal(detail.get("huile").length, 1);
  assert.equal(detail.get("huile")[0].platNom, "Plat Huile");
});

test("construireListeCourses : ne garde que les ingrédients à acheter > 0, avec rayon et détail", () => {
  const etat = etatDeTest();
  etat.plats[0].nom = "Plat Riz";
  ajouterPlatAuJour(etat, "2026-09-21", "lunch", { platId: "plat-test", portions: 1 }, false);
  // Riz : besoin 100g, stock 200g → rien à acheter. Baisse le stock pour en avoir besoin.
  etat.ingredients.find((i) => i.id === "riz").enStock = 20;

  const liste = construireListeCourses(etat, new Date(2026, 8, 21));
  assert.equal(liste.length, 1);
  assert.equal(liste[0].ingredientId, "riz");
  assert.equal(liste[0].rayon, "Épicerie");
  assert.equal(liste[0].aAcheter, 80); // 100 - 20
  assert.equal(liste[0].detail[0].platNom, "Plat Riz");
});

test("construireListeCourses : un essentiel sous son minimum apparaît même sans plat planifié", () => {
  const etat = etatDeTest();
  const sel = etat.ingredients.find((i) => i.id === "huile");
  sel.essentiel = true;
  sel.minimum = 500;
  sel.enStock = 100;

  const liste = construireListeCourses(etat, new Date(2026, 8, 24));
  const ligneHuile = liste.find((l) => l.ingredientId === "huile");
  assert.ok(ligneHuile);
  assert.equal(ligneHuile.aAcheter, 400); // 500 - 100
  assert.deepEqual(ligneHuile.detail, []); // aucun plat ne le demande, juste l'essentiel
});

// --- Écran Stock : etatStock / modifierIngredient / ajouterIngredient / supprimerIngredient ---

test("etatStock : vide si le stock est à 0 ou moins", () => {
  assert.equal(etatStock({ enStock: 0, essentiel: false, minimum: 0 }), "vide");
  assert.equal(etatStock({ enStock: -5, essentiel: false, minimum: 0 }), "vide");
});

test("etatStock : bas seulement si essentiel ET sous le minimum", () => {
  assert.equal(etatStock({ enStock: 10, essentiel: true, minimum: 50 }), "bas");
  assert.equal(etatStock({ enStock: 10, essentiel: false, minimum: 50 }), "ok"); // pas essentiel
});

test("etatStock : ok si pas essentiel, ou essentiel au-dessus du minimum", () => {
  assert.equal(etatStock({ enStock: 100, essentiel: false, minimum: 0 }), "ok");
  assert.equal(etatStock({ enStock: 100, essentiel: true, minimum: 50 }), "ok");
});

test("modifierIngredient : change stock, essentiel et minimum indépendamment", () => {
  const etat = etatDeTest();
  const riz = etat.ingredients.find((i) => i.id === "riz");

  modifierIngredient(etat, "riz", { enStock: 500 });
  assert.equal(riz.enStock, 500);
  assert.equal(riz.essentiel, false); // inchangé

  modifierIngredient(etat, "riz", { essentiel: true, minimum: 200 });
  assert.equal(riz.essentiel, true);
  assert.equal(riz.minimum, 200);
  assert.equal(riz.enStock, 500); // inchangé
});

test("modifierIngredient : change le nom et le rayon (via ouvrirPanneauIngredient dans le Catalogue)", () => {
  const etat = etatDeTest();
  const rayonHygiene = etat.rayons.find((r) => r.nom === "Hygiène");

  modifierIngredient(etat, "riz", { nom: "Riz basmati" });
  assert.equal(etat.ingredients.find((i) => i.id === "riz").nom, "Riz basmati");
  assert.equal(etat.ingredients.find((i) => i.id === "riz").id, "riz", "l'id ne change jamais (les plats le référencent)");

  modifierIngredient(etat, "riz", { rayon: rayonHygiene.id });
  assert.equal(etat.ingredients.find((i) => i.id === "riz").rayon, rayonHygiene.id);
});

test("modifierIngredient : un nom vide est ignoré (garde l'ancien nom)", () => {
  const etat = etatDeTest();
  modifierIngredient(etat, "riz", { nom: "   " });
  assert.equal(etat.ingredients.find((i) => i.id === "riz").nom, riz.nom);
});

test("modifierIngredient : une quantité négative ou invalide est ramenée à 0", () => {
  const etat = etatDeTest();
  modifierIngredient(etat, "riz", { enStock: -10 });
  assert.equal(etat.ingredients.find((i) => i.id === "riz").enStock, 0);
});

// --- modifierIngredient : équivalence cuillère (parCuillereACafe) ---

test("modifierIngredient : règle l'équivalence cuillère d'un ingrédient", () => {
  const etat = etatDeTest();
  etat.ingredients.find((i) => i.id === "riz").parCuillereACafe = null;

  const resultat = modifierIngredient(etat, "riz", { parCuillereACafe: 4 });
  assert.equal(resultat.ok, true);
  assert.equal(etat.ingredients.find((i) => i.id === "riz").parCuillereACafe, 4);
});

test("modifierIngredient : retire l'équivalence cuillère si aucun plat ne l'utilise en cuillères", () => {
  const etat = etatDeTest();
  const resultat = modifierIngredient(etat, "huile", { parCuillereACafe: null });
  assert.equal(resultat.ok, true);
  assert.equal(etat.ingredients.find((i) => i.id === "huile").parCuillereACafe, null);
});

test("modifierIngredient : refuse de retirer l'équivalence cuillère si un plat l'utilise en cuillères", () => {
  const etat = etatDeTest();
  etat.plats[0].nom = "Vinaigrette";
  etat.plats[0].ingredients = [{ ingredientId: "huile", quantitePortion: 2, unite: "c. à café" }];

  const resultat = modifierIngredient(etat, "huile", { parCuillereACafe: null });
  assert.equal(resultat.ok, false);
  assert.deepEqual(resultat.plats, ["Vinaigrette"]);
  assert.equal(etat.ingredients.find((i) => i.id === "huile").parCuillereACafe, 5, "inchangé");
});

test("ajouterIngredient : crée un ingrédient sans lien avec aucun plat", () => {
  const etat = etatDeTest();
  const nouveau = ajouterIngredient(etat, { nom: "Déodorant", rayon: "Hygiène", unite: "pièce" });

  assert.equal(nouveau.nom, "Déodorant");
  assert.equal(nouveau.essentiel, false);
  assert.equal(nouveau.enStock, 0);
  assert.ok(etat.ingredients.some((i) => i.id === nouveau.id));
});

test("ajouterIngredient : deux noms proches n'entrent jamais en collision d'id", () => {
  const etat = etatDeTest();
  const premier = ajouterIngredient(etat, { nom: "Savon", rayon: "Hygiène", unite: "pièce" });
  const second = ajouterIngredient(etat, { nom: "Savon", rayon: "Hygiène", unite: "pièce" });
  assert.notEqual(premier.id, second.id);
});

test("supprimerIngredient : refuse si utilisé par au moins un plat, en les nommant", () => {
  const etat = etatDeTest();
  etat.plats[0].nom = "Plat Riz";
  const resultat = supprimerIngredient(etat, "riz");

  assert.equal(resultat.ok, false);
  assert.deepEqual(resultat.plats, ["Plat Riz"]);
  assert.ok(etat.ingredients.some((i) => i.id === "riz"), "l'ingrédient ne doit pas être supprimé");
});

test("supprimerIngredient : autorise si aucun plat ne l'utilise", () => {
  const etat = etatDeTest();
  const nouveau = ajouterIngredient(etat, { nom: "Déodorant", rayon: "Hygiène", unite: "pièce" });
  const resultat = supprimerIngredient(etat, nouveau.id);

  assert.equal(resultat.ok, true);
  assert.ok(!etat.ingredients.some((i) => i.id === nouveau.id));
});

// --- Rayons éditables (ajouterRayon / renommerRayon / supprimerRayon) ---

test("ajouterRayon : ajoute un rayon en fin de liste, avec un id dérivé du nom", () => {
  const etat = creerEtatInitial();
  const nbAvant = etat.rayons.length;
  const rayon = ajouterRayon(etat, "Marché du dimanche");

  assert.equal(etat.rayons.length, nbAvant + 1);
  assert.equal(etat.rayons[etat.rayons.length - 1], rayon);
  assert.equal(rayon.nom, "Marché du dimanche");
  assert.equal(rayon.id, "marche-du-dimanche");
});

test("ajouterRayon : deux noms proches n'entrent jamais en collision d'id", () => {
  const etat = creerEtatInitial();
  const premier = ajouterRayon(etat, "Local");
  const second = ajouterRayon(etat, "Local");
  assert.notEqual(premier.id, second.id);
});

test("renommerRayon : change le nom sans toucher à l'id, donc les ingrédients restent liés", () => {
  const etat = creerEtatInitial();
  const rayon = etat.rayons.find((r) => r.nom === "Fruits et légumes");
  const idAvant = rayon.id;
  const ingredientLie = etat.ingredients.find((i) => i.rayon === idAvant);

  renommerRayon(etat, idAvant, "Marché du dimanche");

  assert.equal(rayon.id, idAvant);
  assert.equal(rayon.nom, "Marché du dimanche");
  assert.equal(ingredientLie.rayon, idAvant);
});

test("supprimerRayon : refuse si des ingrédients y sont encore rangés, en les nommant", () => {
  const etat = creerEtatInitial();
  const rayon = etat.rayons.find((r) => r.nom === "Compléments alimentaires");
  const resultat = supprimerRayon(etat, rayon.id);

  assert.equal(resultat.ok, false);
  assert.ok(resultat.ingredients.length > 0);
  assert.ok(etat.rayons.some((r) => r.id === rayon.id), "le rayon ne doit pas être supprimé");
});

test("supprimerRayon : autorise si aucun ingrédient ne l'utilise", () => {
  const etat = creerEtatInitial();
  const rayon = ajouterRayon(etat, "Rayon vide");
  const resultat = supprimerRayon(etat, rayon.id);

  assert.equal(resultat.ok, true);
  assert.ok(!etat.rayons.some((r) => r.id === rayon.id));
});

// --- Écran Plats & repas (ajouterPlat / modifierPlat / supprimerPlat) ---

test("ajouterPlat : crée un plat avec favori à false, portions minimum 1", () => {
  const etat = etatDeTest();
  const plat = ajouterPlat(etat, {
    nom: "Riz sauté aux légumes",
    repas: "Déjeuner",
    etapes: "Faire revenir le riz avec les légumes.",
    ingredients: [{ ingredientId: "riz", quantitePortion: 150, unite: "g" }],
  });

  assert.equal(plat.nom, "Riz sauté aux légumes");
  assert.equal(plat.favori, false);
  assert.equal(plat.portionsReference, 1);
  assert.ok(etat.plats.some((p) => p.id === plat.id));
});

test("ajouterPlat : deux noms proches n'entrent jamais en collision d'id", () => {
  const etat = etatDeTest();
  const premier = ajouterPlat(etat, { nom: "Salade", repas: "Snack", ingredients: [] });
  const second = ajouterPlat(etat, { nom: "Salade", repas: "Snack", ingredients: [] });
  assert.notEqual(premier.id, second.id);
});

test("modifierPlat : change nom, repas, étapes, ingrédients et favori indépendamment, sans changer l'id", () => {
  const etat = etatDeTest();
  const plat = ajouterPlat(etat, { nom: "Bowl", repas: "Snack", ingredients: [] });

  modifierPlat(etat, plat.id, { favori: true });
  assert.equal(plat.favori, true);
  assert.equal(plat.nom, "Bowl"); // inchangé

  modifierPlat(etat, plat.id, {
    nom: "Bowl protéiné",
    repas: "Lunch",
    etapes: "Mélanger.",
    ingredients: [{ ingredientId: "riz", quantitePortion: 80, unite: "g" }],
  });
  assert.equal(plat.id, "bowl", "l'id ne change jamais (le modèle et l'historique le référencent)");
  assert.equal(plat.nom, "Bowl protéiné");
  assert.equal(plat.repas, "Lunch");
  assert.equal(plat.ingredients.length, 1);
  assert.equal(plat.favori, true); // inchangé
});

test("supprimerPlat : refuse si utilisé dans le modèle, en nommant les jours", () => {
  const etat = etatDeTest();
  etat.modele.push({ id: "r1", jour: "lundi", creneau: "lunch", platId: "plat-test", portions: 2, preparation: "cuisine-ici" });

  const resultat = supprimerPlat(etat, "plat-test");
  assert.equal(resultat.ok, false);
  assert.deepEqual(resultat.joursModele, ["lundi"]);
  assert.ok(etat.plats.some((p) => p.id === "plat-test"), "le plat ne doit pas être supprimé");
});

test("supprimerPlat : refuse si utilisé dans l'historique, en nommant les dates", () => {
  const etat = etatDeTest();
  etat.historique["2026-09-21"] = {
    lunch: [{ id: "e1", platId: "plat-test", portions: 1, preparation: "cuisine-ici", cuisine: true }],
  };

  const resultat = supprimerPlat(etat, "plat-test");
  assert.equal(resultat.ok, false);
  assert.deepEqual(resultat.datesHistorique, ["2026-09-21"]);
});

test("supprimerPlat : autorise si le plat n'est utilisé nulle part", () => {
  const etat = etatDeTest();
  const plat = ajouterPlat(etat, { nom: "Plat jamais planifié", repas: "Snack", ingredients: [] });

  const resultat = supprimerPlat(etat, plat.id);
  assert.equal(resultat.ok, true);
  assert.ok(!etat.plats.some((p) => p.id === plat.id));
});

// --- Étiquettes éditables (ajouterEtiquette / renommerEtiquette / supprimerEtiquette) ---

test("ajouterEtiquette : ajoute en fin de liste, avec un id dérivé du nom", () => {
  const etat = creerEtatInitial();
  const nbAvant = etat.etiquettes.length;
  const etiquette = ajouterEtiquette(etat, "Épicé");

  assert.equal(etat.etiquettes.length, nbAvant + 1);
  assert.equal(etat.etiquettes[etat.etiquettes.length - 1], etiquette);
  assert.equal(etiquette.nom, "Épicé");
  assert.equal(etiquette.id, "epice");
});

test("renommerEtiquette : change le nom sans toucher à l'id", () => {
  const etat = creerEtatInitial();
  const etiquette = etat.etiquettes.find((e) => e.nom === "Sucré");
  const idAvant = etiquette.id;

  renommerEtiquette(etat, idAvant, "Sucré léger");
  assert.equal(etiquette.id, idAvant);
  assert.equal(etiquette.nom, "Sucré léger");
});

test("supprimerEtiquette : refuse si un plat la porte encore, en le nommant", () => {
  const etat = etatDeTest();
  const etiquette = ajouterEtiquette(etat, "Test étiquette");
  etat.plats[0].nom = "Plat test étiquette";
  etat.plats[0].etiquettes = [etiquette.id];

  const resultat = supprimerEtiquette(etat, etiquette.id);
  assert.equal(resultat.ok, false);
  assert.deepEqual(resultat.plats, ["Plat test étiquette"]);
  assert.ok(etat.etiquettes.some((e) => e.id === etiquette.id), "l'étiquette ne doit pas être supprimée");
});

test("supprimerEtiquette : autorise si aucun plat ne la porte", () => {
  const etat = creerEtatInitial();
  const etiquette = ajouterEtiquette(etat, "Étiquette inutilisée");

  const resultat = supprimerEtiquette(etat, etiquette.id);
  assert.equal(resultat.ok, true);
  assert.ok(!etat.etiquettes.some((e) => e.id === etiquette.id));
});

test("ajouterMateriel : ajoute en fin de liste, avec un id dérivé du nom", () => {
  const etat = creerEtatInitial();
  const nbAvant = etat.materiel.length;
  const materiel = ajouterMateriel(etat, "Blender");

  assert.equal(etat.materiel.length, nbAvant + 1);
  assert.equal(etat.materiel[etat.materiel.length - 1], materiel);
  assert.equal(materiel.nom, "Blender");
  assert.equal(materiel.id, "blender");
});

test("renommerMateriel : change le nom sans toucher à l'id", () => {
  const etat = creerEtatInitial();
  const materiel = etat.materiel.find((m) => m.nom === "Poêle");
  const idAvant = materiel.id;

  renommerMateriel(etat, idAvant, "Poêle antiadhésive");
  assert.equal(materiel.id, idAvant);
  assert.equal(materiel.nom, "Poêle antiadhésive");
});

test("supprimerMateriel : refuse si un plat le demande encore, en le nommant", () => {
  const etat = etatDeTest();
  const materiel = ajouterMateriel(etat, "Test matériel");
  etat.plats[0].nom = "Plat test matériel";
  etat.plats[0].materiel = [materiel.id];

  const resultat = supprimerMateriel(etat, materiel.id);
  assert.equal(resultat.ok, false);
  assert.deepEqual(resultat.plats, ["Plat test matériel"]);
  assert.ok(etat.materiel.some((m) => m.id === materiel.id), "le matériel ne doit pas être supprimé");
});

test("supprimerMateriel : autorise si aucun plat ne le demande", () => {
  const etat = creerEtatInitial();
  const materiel = ajouterMateriel(etat, "Matériel inutilisé");

  const resultat = supprimerMateriel(etat, materiel.id);
  assert.equal(resultat.ok, true);
  assert.ok(!etat.materiel.some((m) => m.id === materiel.id));
});

test("ajouterPlat / modifierPlat : gèrent les étiquettes (plusieurs à la fois)", () => {
  const etat = creerEtatInitial();
  const sucre = etat.etiquettes.find((e) => e.nom === "Sucré");
  const sain = etat.etiquettes.find((e) => e.nom === "Sain");

  const plat = ajouterPlat(etat, { nom: "Porridge test", repas: "Petit-déjeuner", ingredients: [], etiquettes: [sucre.id] });
  assert.deepEqual(plat.etiquettes, [sucre.id]);

  modifierPlat(etat, plat.id, { etiquettes: [sucre.id, sain.id] });
  assert.deepEqual(plat.etiquettes, [sucre.id, sain.id]);
});

// --- Repas éditables (ajouterRepas / renommerRepas / supprimerRepas) ---

test("ajouterRepas : ajoute en fin de liste, avec un id dérivé du nom", () => {
  const etat = creerEtatInitial();
  const nbAvant = etat.repas.length;
  const repas = ajouterRepas(etat, "Brunch");

  assert.equal(etat.repas.length, nbAvant + 1);
  assert.equal(etat.repas[etat.repas.length - 1], repas);
  assert.equal(repas.nom, "Brunch");
  assert.equal(repas.id, "brunch");
});

test("renommerRepas : change le nom sans toucher à l'id", () => {
  const etat = creerEtatInitial();
  const repas = etat.repas.find((r) => r.nom === "Snack/Goûter");
  const idAvant = repas.id;

  renommerRepas(etat, idAvant, "Goûter");
  assert.equal(repas.id, idAvant);
  assert.equal(repas.nom, "Goûter");
});

test("supprimerRepas : refuse si un plat l'utilise encore, en le nommant", () => {
  const etat = creerEtatInitial();
  const repasSnack = etat.repas.find((r) => r.nom === "Snack/Goûter");
  const platConcerne = ajouterPlat(etat, { nom: "Snack test", repas: repasSnack.id, ingredients: [] });

  const resultat = supprimerRepas(etat, repasSnack.id);
  assert.equal(resultat.ok, false);
  assert.ok(resultat.plats.includes(platConcerne.nom));
});

test("supprimerRepas : autorise si aucun plat ne l'utilise", () => {
  const etat = creerEtatInitial();
  const repas = ajouterRepas(etat, "Repas inutilisé");

  const resultat = supprimerRepas(etat, repas.id);
  assert.equal(resultat.ok, true);
  assert.ok(!etat.repas.some((r) => r.id === repas.id));
});

test("creerEtatInitial : Déjeuner et Dîner sont fusionnés en un seul repas", () => {
  const etat = creerEtatInitial();
  const dejeunerDiner = etat.repas.find((r) => r.nom === "Déjeuner/Dîner");
  assert.ok(dejeunerDiner, "le repas fusionné doit exister");

  const platsDejeunerOuDiner = etat.plats.filter((p) => p.repas === dejeunerDiner.id);
  assert.ok(platsDejeunerOuDiner.length > 0, "des plats importés (Déjeuner ou Dîner) doivent y être rattachés");
});

// --- ingredientsManquantsPourPlat (avertissement stock insuffisant, écran Semaine) ---

test("ingredientsManquantsPourPlat : liste les ingrédients dont le stock actuel ne suffit pas", () => {
  const etat = etatDeTest();
  // plat-test a besoin de 100 g de riz par portion ; le riz de etatDeTest a 200 g en stock.
  const manquants2Portions = ingredientsManquantsPourPlat(etat, "plat-test", 2); // besoin 200g, stock 200g
  assert.deepEqual(manquants2Portions, []);

  const manquants3Portions = ingredientsManquantsPourPlat(etat, "plat-test", 3); // besoin 300g, stock 200g
  assert.equal(manquants3Portions.length, 1);
  assert.equal(manquants3Portions[0].nom, riz.nom);
  assert.equal(manquants3Portions[0].manque, 100);
});

test("ingredientsManquantsPourPlat : rend un tableau vide si le plat n'existe pas (pas de plantage)", () => {
  const etat = etatDeTest();
  assert.deepEqual(ingredientsManquantsPourPlat(etat, "plat-inconnu", 1), []);
});

// --- platEstRealisableAvecStock (filtre "🧺 Réalisable avec mon stock", écran Plats & repas) ---

test("platEstRealisableAvecStock : true quand le stock couvre 1 portion, false sinon", () => {
  const etat = etatDeTest();
  // plat-test a besoin de 100 g de riz par portion ; le riz de etatDeTest a 200 g en stock.
  assert.equal(platEstRealisableAvecStock(etat, "plat-test", 1), true);
  assert.equal(platEstRealisableAvecStock(etat, "plat-test", 3), false); // besoin 300g, stock 200g
});

test("platEstRealisableAvecStock : 1 portion par défaut si non précisé", () => {
  const etat = etatDeTest();
  assert.equal(platEstRealisableAvecStock(etat, "plat-test"), true);
});

// --- Repas prêts (ajouterRepasPret / mangerRepasPret / retirerRepasPret) ---

test("ajouterRepasPret : avec un plat connu, déduit le stock d'ingrédients immédiatement", () => {
  const etat = etatDeTest();
  const rizAvant = etat.ingredients.find((i) => i.id === "riz").enStock;

  const repasPret = ajouterRepasPret(etat, { nom: "Riz sauté (batch)", platId: "plat-test", portions: 2 });
  assert.equal(repasPret.portions, 2);
  assert.equal(etat.ingredients.find((i) => i.id === "riz").enStock, rizAvant - 200); // 2 × 100g
  assert.ok(etat.repasPrets.some((r) => r.id === repasPret.id));
});

test("ajouterRepasPret : sans plat (recette inconnue), ne touche jamais le stock", () => {
  const etat = etatDeTest();
  const rizAvant = etat.ingredients.find((i) => i.id === "riz").enStock;

  const repasPret = ajouterRepasPret(etat, { nom: "Plat mongol du voisin", portions: 3 });
  assert.equal(repasPret.platId, null);
  assert.equal(etat.ingredients.find((i) => i.id === "riz").enStock, rizAvant);
});

test("mangerRepasPret : décrémente d'une portion, retire l'entrée à 0", () => {
  const etat = etatDeTest();
  const repasPret = ajouterRepasPret(etat, { nom: "Plat mongol du voisin", portions: 2 });

  mangerRepasPret(etat, repasPret.id);
  assert.equal(etat.repasPrets.find((r) => r.id === repasPret.id).portions, 1);

  mangerRepasPret(etat, repasPret.id);
  assert.ok(!etat.repasPrets.some((r) => r.id === repasPret.id), "l'entrée doit disparaître à 0 portion");
});

test("retirerRepasPret : supprime l'entrée entière, quel que soit le nombre de portions restantes", () => {
  const etat = etatDeTest();
  const repasPret = ajouterRepasPret(etat, { nom: "Plat mongol du voisin", portions: 5 });

  retirerRepasPret(etat, repasPret.id);
  assert.ok(!etat.repasPrets.some((r) => r.id === repasPret.id));
});

// --- Test bout-en-bout avec les vraies données (celui demandé dans le cahier des charges) ---

test("bout-en-bout : 7 dîners 'Steak-frites' planifiés → 1400 g de bœuf et 1400 g de frites", () => {
  const etat = creerEtatInitial();
  const idPlat = "steak-frites";
  assert.ok(etat.plats.some((p) => p.id === idPlat), "le plat de test doit exister dans data.js");

  for (const jour of JOURS) {
    etat.modele.push({
      id: `regle-${jour}`, jour, creneau: "diner",
      platId: idPlat, portions: 1, preparation: "cuisine-ici",
    });
  }

  const besoins = calculerBesoinsSemaine(etat, new Date(2026, 8, 24)); // jeudi 24/09/2026
  assert.equal(besoins.get("boeuf-faux-filet"), 1400); // 200 g × 7 jours
  assert.equal(besoins.get("frites-surgelees"), 1400); // 200 g × 7 jours
});
