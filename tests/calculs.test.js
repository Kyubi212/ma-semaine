// Tests de calculs.js — la logique de calcul est la partie la plus
// importante à vérifier automatiquement (voir CLAUDE.md § Approche de test).
//
// Lancer avec : node --test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampPositif,
  convertirVersUniteStock,
  caseCompte,
  calculerBesoins,
  calculerAAcheter,
  definirCuisine,
  marquerAchete,
} from "../calculs.js";
import { creerEtatInitial, JOURS } from "../storage.js";

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

test("caseCompte : vrai seulement avec un plat, pas 'reste', et des portions > 0", () => {
  assert.equal(caseCompte({ platId: "p1", preparation: "cuisine-ici", portions: 1 }), true);
  assert.equal(caseCompte({ platId: null, preparation: "cuisine-ici", portions: 1 }), false);
  assert.equal(caseCompte({ platId: "p1", preparation: "reste", portions: 1 }), false);
  assert.equal(caseCompte({ platId: "p1", preparation: "cuisine-ici", portions: 0 }), false);
});

// --- calculerBesoins (avec un plat et un ingrédient fabriqués, pour un calcul exact) ---

const platTest = {
  id: "plat-test",
  ingredients: [{ ingredientId: "riz", quantitePortion: 100, unite: "g" }],
};
const ingredientsTest = [{ ...riz, enStock: 0, essentiel: false, minimum: 0, extra: 0 }];

function caseVide(jour, creneau) {
  return { jour, creneau, platId: null, portions: 1, preparation: "cuisine-ici", cuisine: false };
}

test("calculerBesoins : additionne portions × quantité par portion sur les cases qui comptent", () => {
  const planning = [
    { jour: "lundi", creneau: "lunch", platId: "plat-test", portions: 2, preparation: "cuisine-ici", cuisine: false },
    { jour: "mardi", creneau: "lunch", platId: "plat-test", portions: 1, preparation: "cuisine-ici", cuisine: false },
  ];
  const besoins = calculerBesoins(planning, [platTest], ingredientsTest);
  assert.equal(besoins.get("riz"), 300); // 2*100 + 1*100
});

test("calculerBesoins : ignore les cases 'reste', déjà cuisinées, à 0 portion ou vides", () => {
  const planning = [
    { jour: "lundi", creneau: "lunch", platId: "plat-test", portions: 2, preparation: "reste", cuisine: false },
    { jour: "mardi", creneau: "lunch", platId: "plat-test", portions: 2, preparation: "cuisine-ici", cuisine: true },
    { jour: "mercredi", creneau: "lunch", platId: "plat-test", portions: 0, preparation: "cuisine-ici", cuisine: false },
    caseVide("jeudi", "lunch"),
  ];
  const besoins = calculerBesoins(planning, [platTest], ingredientsTest);
  assert.equal(besoins.size, 0);
});

test("calculerBesoins : plat supprimé entre-temps → ignoré sans planter", () => {
  const planning = [
    { jour: "lundi", creneau: "lunch", platId: "plat-fantome", portions: 1, preparation: "cuisine-ici", cuisine: false },
  ];
  assert.doesNotThrow(() => calculerBesoins(planning, [platTest], ingredientsTest));
});

// --- calculerAAcheter ---

test("calculerAAcheter : besoin + minimum essentiel + extra − stock, jamais négatif", () => {
  const ingredients = [
    { id: "a", unite: "g", enStock: 50, essentiel: false, minimum: 0, extra: 0 },
    { id: "b", unite: "g", enStock: 500, essentiel: false, minimum: 0, extra: 0 }, // largement assez
  ];
  const besoins = new Map([["a", 120], ["b", 10]]);
  const resultats = calculerAAcheter(ingredients, besoins);
  assert.equal(resultats.find((r) => r.ingredientId === "a").aAcheter, 70); // 120 - 50
  assert.equal(resultats.find((r) => r.ingredientId === "b").aAcheter, 0); // jamais négatif
});

test("calculerAAcheter : ajoute le minimum si essentiel, et l'extra", () => {
  const ingredients = [{ id: "sel", unite: "g", enStock: 10, essentiel: true, minimum: 50, extra: 20 }];
  const besoins = new Map([["sel", 0]]);
  const resultats = calculerAAcheter(ingredients, besoins);
  assert.equal(resultats[0].aAcheter, 60); // 0 + 50 + 20 - 10
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

// --- definirCuisine ---

function etatDeTestCuisine() {
  return {
    plats: [platTest],
    ingredients: [{ ...riz, enStock: 200 }],
    planning: [
      { jour: "lundi", creneau: "lunch", platId: "plat-test", portions: 2, preparation: "cuisine-ici", cuisine: false },
    ],
  };
}

test("definirCuisine : cocher déduit le stock, décocher le restitue", () => {
  const etat = etatDeTestCuisine();
  definirCuisine(etat, "lundi", "lunch", true);
  assert.equal(etat.ingredients[0].enStock, 0); // 200 - 2*100
  assert.equal(etat.planning[0].cuisine, true);

  definirCuisine(etat, "lundi", "lunch", false);
  assert.equal(etat.ingredients[0].enStock, 200);
  assert.equal(etat.planning[0].cuisine, false);
});

test("definirCuisine : cocher deux fois de suite ne déduit qu'une fois", () => {
  const etat = etatDeTestCuisine();
  definirCuisine(etat, "lundi", "lunch", true);
  definirCuisine(etat, "lundi", "lunch", true); // déjà cuisiné : ne doit rien faire
  assert.equal(etat.ingredients[0].enStock, 0);
});

test("definirCuisine : une case 'reste' ne touche jamais au stock", () => {
  const etat = etatDeTestCuisine();
  etat.planning[0].preparation = "reste";
  definirCuisine(etat, "lundi", "lunch", true);
  assert.equal(etat.ingredients[0].enStock, 200);
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

// --- Test bout-en-bout avec les vraies données (celui demandé dans le cahier des charges) ---

test("bout-en-bout : 7 petits-déjeuners 'Petit-déj habituel' planifiés → 21 œufs et 3,5 avocats", () => {
  const etat = creerEtatInitial();
  const idPlat = "petit-dej-habituel-3-oeufs-12-avocat";
  assert.ok(etat.plats.some((p) => p.id === idPlat), "le plat de test doit exister dans data.js");

  for (const jour of JOURS) {
    const caseP = etat.planning.find((c) => c.jour === jour && c.creneau === "petit-dejeuner");
    caseP.platId = idPlat;
    caseP.portions = 1;
  }

  const besoins = calculerBesoins(etat.planning, etat.plats, etat.ingredients);
  assert.equal(besoins.get("oeufs"), 21); // 3 œufs × 7 jours
  assert.equal(besoins.get("avocat"), 3.5); // 0.5 avocat × 7 jours
});
