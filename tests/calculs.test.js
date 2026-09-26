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

// --- obtenirElementsEffectifs / ajouterPlatAuJour / definirCuisine / etc. ---

function etatDeTest() {
  const etat = creerEtatInitial();
  // Copies (pas les objets partagés platTest/platTest2) : certains tests
  // modifient le "nom" du plat, ça ne doit pas fuiter d'un test à l'autre.
  etat.plats = [
    { ...platTest, ingredients: platTest.ingredients.map((l) => ({ ...l })) },
    { ...platTest2, ingredients: platTest2.ingredients.map((l) => ({ ...l })) },
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

  const besoins = calculerBesoinsSemaine(etat, new Date(2026, 8, 24));
  assert.equal(besoins.get("riz") ?? 0, 0);
});

// --- calculerDetailBesoinsSemaine / construireListeCourses ---

test("calculerDetailBesoinsSemaine : indique quel plat contribue et pour combien", () => {
  const etat = etatDeTest();
  etat.plats[0].nom = "Plat Test";
  ajouterPlatAuJour(etat, "2026-09-21", "lunch", { platId: "plat-test", portions: 2 }, false);

  const detail = calculerDetailBesoinsSemaine(etat, new Date(2026, 8, 24));
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

  const detail = calculerDetailBesoinsSemaine(etat, new Date(2026, 8, 24));
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

  const detail = calculerDetailBesoinsSemaine(etat, new Date(2026, 8, 24));
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

  const liste = construireListeCourses(etat, new Date(2026, 8, 24));
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

test("modifierIngredient : une quantité négative ou invalide est ramenée à 0", () => {
  const etat = etatDeTest();
  modifierIngredient(etat, "riz", { enStock: -10 });
  assert.equal(etat.ingredients.find((i) => i.id === "riz").enStock, 0);
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

// --- Test bout-en-bout avec les vraies données (celui demandé dans le cahier des charges) ---

test("bout-en-bout : 7 petits-déjeuners 'Petit-déj habituel' planifiés → 21 œufs et 3,5 avocats", () => {
  const etat = creerEtatInitial();
  const idPlat = "petit-dej-habituel-3-oeufs-12-avocat";
  assert.ok(etat.plats.some((p) => p.id === idPlat), "le plat de test doit exister dans data.js");

  for (const jour of JOURS) {
    etat.modele.push({
      id: `regle-${jour}`, jour, creneau: "petit-dejeuner",
      platId: idPlat, portions: 1, preparation: "cuisine-ici",
    });
  }

  const besoins = calculerBesoinsSemaine(etat, new Date(2026, 8, 24)); // jeudi 24/09/2026
  assert.equal(besoins.get("oeufs"), 21); // 3 œufs × 7 jours
  assert.equal(besoins.get("avocat"), 3.5); // 0.5 avocat × 7 jours
});
