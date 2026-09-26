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
  marquerAchete,
  dateEnISO,
  jourDeLaSemaine,
  datesDeLaSemaine,
  decalerSemaine,
  obtenirCaseEffective,
  calculerBesoinsSemaine,
  definirCuisine,
  definirPlatDuJour,
} from "../calculs.js";
import { creerEtatInitial } from "../storage.js";
import { JOURS, CRENEAUX } from "../constantes.js";

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

test("calculerBesoins : additionne portions × quantité par portion sur les cases qui comptent", () => {
  const cases = [
    { platId: "plat-test", portions: 2, preparation: "cuisine-ici", cuisine: false },
    { platId: "plat-test", portions: 1, preparation: "cuisine-ici", cuisine: false },
  ];
  const besoins = calculerBesoins(cases, [platTest], ingredientsTest);
  assert.equal(besoins.get("riz"), 300); // 2*100 + 1*100
});

test("calculerBesoins : ignore les cases 'reste', déjà cuisinées, à 0 portion ou vides", () => {
  const cases = [
    { platId: "plat-test", portions: 2, preparation: "reste", cuisine: false },
    { platId: "plat-test", portions: 2, preparation: "cuisine-ici", cuisine: true },
    { platId: "plat-test", portions: 0, preparation: "cuisine-ici", cuisine: false },
    { platId: null, portions: 1, preparation: "cuisine-ici", cuisine: false },
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

test("decalerSemaine : avance ou recule de 7 jours par semaine demandée", () => {
  const reference = new Date(2026, 8, 24);
  assert.equal(dateEnISO(decalerSemaine(reference, 1)), "2026-10-01");
  assert.equal(dateEnISO(decalerSemaine(reference, -1)), "2026-09-17");
  assert.equal(dateEnISO(decalerSemaine(reference, 2)), "2026-10-08");
});

// --- obtenirCaseEffective / definirCuisine / definirPlatDuJour ---

function etatDeTest() {
  const etat = creerEtatInitial();
  etat.plats = [platTest];
  etat.ingredients = [{ ...riz, enStock: 200 }];
  return etat;
}

test("obtenirCaseEffective : sans historique, reprend le modèle (jamais cuisiné)", () => {
  const etat = etatDeTest();
  const jourSemaine = jourDeLaSemaine("2026-09-21"); // lundi
  const caseModele = etat.modele.find((c) => c.jour === jourSemaine && c.creneau === "lunch");
  caseModele.platId = "plat-test";
  caseModele.portions = 3;

  const effective = obtenirCaseEffective(etat, "2026-09-21", "lunch");
  assert.equal(effective.platId, "plat-test");
  assert.equal(effective.portions, 3);
  assert.equal(effective.cuisine, false);
  assert.equal(etat.historique["2026-09-21"], undefined, "ne doit rien enregistrer en lecture seule");
});

test("definirCuisine : crée l'enregistrement du jour, déduit le stock, décocher le restitue", () => {
  const etat = etatDeTest();
  const jourSemaine = jourDeLaSemaine("2026-09-21");
  etat.modele.find((c) => c.jour === jourSemaine && c.creneau === "lunch").platId = "plat-test";
  etat.modele.find((c) => c.jour === jourSemaine && c.creneau === "lunch").portions = 2;

  definirCuisine(etat, "2026-09-21", "lunch", true);
  assert.equal(etat.ingredients[0].enStock, 0); // 200 - 2*100
  assert.ok(etat.historique["2026-09-21"], "l'enregistrement du jour doit maintenant exister");
  assert.equal(etat.historique["2026-09-21"].lunch.cuisine, true);

  definirCuisine(etat, "2026-09-21", "lunch", false);
  assert.equal(etat.ingredients[0].enStock, 200);
  assert.equal(etat.historique["2026-09-21"].lunch.cuisine, false);
});

test("definirCuisine : cocher deux fois de suite ne déduit qu'une fois", () => {
  const etat = etatDeTest();
  etat.modele.find((c) => c.creneau === "lunch" && c.jour === "lundi").platId = "plat-test";
  definirCuisine(etat, "2026-09-21", "lunch", true);
  definirCuisine(etat, "2026-09-21", "lunch", true);
  assert.equal(etat.ingredients[0].enStock, 100); // une seule déduction de 100g
});

test("definirCuisine : un jour passé peut toujours être corrigé, quel que soit le nombre de jours écoulés", () => {
  const etat = etatDeTest();
  etat.modele.find((c) => c.creneau === "lunch" && c.jour === "lundi").platId = "plat-test";
  // On "oublie" de cocher lundi, et on ne s'en occupe que le jeudi suivant :
  // aucune limite dans le code pour ça, contrairement à l'ancien système de
  // réinitialisation automatique.
  definirCuisine(etat, "2026-09-21", "lunch", true);
  assert.equal(etat.ingredients[0].enStock, 100);
});

test("definirPlatDuJour : 'juste ce jour' ne touche pas au modèle", () => {
  const etat = etatDeTest();
  definirPlatDuJour(etat, "2026-09-21", "lunch", { platId: "plat-test", portions: 2 }, false);

  assert.equal(etat.historique["2026-09-21"].lunch.platId, "plat-test");
  const caseModele = etat.modele.find((c) => c.jour === "lundi" && c.creneau === "lunch");
  assert.equal(caseModele.platId, null, "le modèle ne doit pas changer");
});

test("definirPlatDuJour : 'à partir d'aujourd'hui' met aussi à jour le modèle", () => {
  const etat = etatDeTest();
  definirPlatDuJour(etat, "2026-09-21", "lunch", { platId: "plat-test", portions: 2 }, true);

  const caseModele = etat.modele.find((c) => c.jour === "lundi" && c.creneau === "lunch");
  assert.equal(caseModele.platId, "plat-test");
  assert.equal(caseModele.portions, 2);

  // Un jour futur pas encore consulté doit maintenant reprendre ce choix.
  const effectiveSemaineSuivante = obtenirCaseEffective(etat, "2026-09-28", "lunch"); // lundi suivant
  assert.equal(effectiveSemaineSuivante.platId, "plat-test");
});

test("definirPlatDuJour : changer une case déjà cuisinée restitue d'abord son ancien stock", () => {
  const etat = etatDeTest();
  definirPlatDuJour(etat, "2026-09-21", "lunch", { platId: "plat-test", portions: 2 }, false);
  definirCuisine(etat, "2026-09-21", "lunch", true);
  assert.equal(etat.ingredients[0].enStock, 0); // 200 - 200

  // Qassim change d'avis : il enlève finalement le plat de cette case.
  definirPlatDuJour(etat, "2026-09-21", "lunch", { platId: null }, false);
  assert.equal(etat.ingredients[0].enStock, 200, "le stock déduit doit être restitué");
  assert.equal(etat.historique["2026-09-21"].lunch.cuisine, false);
});

// --- calculerBesoinsSemaine ---

test("calculerBesoinsSemaine : additionne sur les 7 jours de la semaine réelle en cours", () => {
  const etat = etatDeTest();
  // Un plat le lundi et le jeudi de la semaine type (via le modèle).
  etat.modele.find((c) => c.jour === "lundi" && c.creneau === "lunch").platId = "plat-test";
  etat.modele.find((c) => c.jour === "jeudi" && c.creneau === "lunch").platId = "plat-test";

  const besoins = calculerBesoinsSemaine(etat, new Date(2026, 8, 24)); // jeudi 24/09/2026
  assert.equal(besoins.get("riz"), 200); // 1 portion lundi + 1 portion jeudi, 100g chacune
});

test("calculerBesoinsSemaine : une case déjà cuisinée cette semaine ne compte plus dans le besoin", () => {
  const etat = etatDeTest();
  etat.modele.find((c) => c.jour === "lundi" && c.creneau === "lunch").platId = "plat-test";
  definirCuisine(etat, "2026-09-21", "lunch", true); // lundi de cette même semaine, déjà cuisiné

  const besoins = calculerBesoinsSemaine(etat, new Date(2026, 8, 24));
  assert.equal(besoins.get("riz") ?? 0, 0);
});

// --- Test bout-en-bout avec les vraies données (celui demandé dans le cahier des charges) ---

test("bout-en-bout : 7 petits-déjeuners 'Petit-déj habituel' planifiés → 21 œufs et 3,5 avocats", () => {
  const etat = creerEtatInitial();
  const idPlat = "petit-dej-habituel-3-oeufs-12-avocat";
  assert.ok(etat.plats.some((p) => p.id === idPlat), "le plat de test doit exister dans data.js");

  for (const jour of JOURS) {
    const caseModele = etat.modele.find((c) => c.jour === jour && c.creneau === "petit-dejeuner");
    caseModele.platId = idPlat;
    caseModele.portions = 1;
  }

  const besoins = calculerBesoinsSemaine(etat, new Date(2026, 8, 24)); // jeudi 24/09/2026
  assert.equal(besoins.get("oeufs"), 21); // 3 œufs × 7 jours
  assert.equal(besoins.get("avocat"), 3.5); // 0.5 avocat × 7 jours
});
