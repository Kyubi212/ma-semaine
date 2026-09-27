// Tests de storage.js.
//
// Node.js n'a pas de `localStorage` par défaut (c'est une API de navigateur).
// On simule ici un faux localStorage en mémoire, assez fidèle pour tester
// notre code : getItem/setItem/removeItem, et un mode "en panne" pour
// vérifier que storage.js ne plante jamais même quand le stockage échoue.
//
// Lancer avec : node --test

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

function creerFauxLocalStorage() {
  const donnees = new Map();
  return {
    getItem(cle) {
      return donnees.has(cle) ? donnees.get(cle) : null;
    },
    setItem(cle, valeur) {
      donnees.set(cle, valeur);
    },
    removeItem(cle) {
      donnees.delete(cle);
    },
    _donnees: donnees, // accès direct pour préparer certains tests
  };
}

// storage.js utilise `localStorage` comme une variable globale (comme dans
// un vrai navigateur). On la pose ici avant d'importer le module.
globalThis.localStorage = creerFauxLocalStorage();
const { creerEtatInitial, chargerEtat, sauvegarderEtat } = await import("../storage.js");

beforeEach(() => {
  // Un faux localStorage tout neuf avant chaque test, pour qu'ils ne se
  // marchent pas dessus.
  globalThis.localStorage = creerFauxLocalStorage();
});

test("creerEtatInitial : reprend le catalogue de data.js", () => {
  const etat = creerEtatInitial();
  assert.equal(etat.plats.length, 25);
  assert.equal(etat.ingredients.length, 68);
  assert.equal(etat.version, 4);
});

test("creerEtatInitial : les rayons sont des objets {id, nom}, référencés par les ingrédients via leur id", () => {
  const etat = creerEtatInitial();
  assert.ok(etat.rayons.length > 0);
  for (const rayon of etat.rayons) {
    assert.ok(rayon.id);
    assert.ok(rayon.nom);
  }
  const idsRayons = new Set(etat.rayons.map((r) => r.id));
  for (const ingredient of etat.ingredients) {
    assert.ok(idsRayons.has(ingredient.rayon), `rayon inconnu pour ${ingredient.nom} : ${ingredient.rayon}`);
  }
});

test("creerEtatInitial : modèle et historique vides au départ", () => {
  const etat = creerEtatInitial();
  assert.deepEqual(etat.modele, []);
  assert.deepEqual(etat.historique, {});
});

test("chargerEtat : premier lancement (rien en stockage) → état initial, sans erreur", () => {
  const { etat, erreurLecture } = chargerEtat();
  assert.equal(erreurLecture, false);
  assert.equal(etat.plats.length, 25);
});

test("sauvegarderEtat puis chargerEtat : on retrouve exactement ce qu'on a sauvegardé", () => {
  const etat = creerEtatInitial();
  etat.modele.push({ id: "r1", jour: "lundi", creneau: "lunch", platId: "wraps-chili-au-poulet-riz", portions: 2, preparation: "cuisine-ici" });
  etat.historique["2026-09-21"] = {
    "petit-dejeuner": [{ id: "e1", platId: "bol-yaourt-grec", portions: 1, preparation: "cuisine-ici", cuisine: true }],
  };

  const ok = sauvegarderEtat(etat);
  assert.equal(ok, true);

  const relu = chargerEtat();
  assert.equal(relu.erreurLecture, false);
  assert.equal(relu.etat.modele[0].platId, "wraps-chili-au-poulet-riz");
  assert.equal(relu.etat.historique["2026-09-21"]["petit-dejeuner"][0].platId, "bol-yaourt-grec");
});

test("chargerEtat : migre un ancien format v2 (un seul plat par case) vers v3 (liste de plats)", () => {
  const ancienEtat = {
    version: 2,
    ingredients: [],
    plats: [],
    modele: [
      { jour: "lundi", creneau: "lunch", platId: "x", portions: 2, preparation: "cuisine-ici" },
      { jour: "mardi", creneau: "lunch", platId: null, portions: 1, preparation: "cuisine-ici" },
    ],
    historique: {
      "2026-09-21": {
        lunch: { platId: "x", portions: 2, preparation: "cuisine-ici", cuisine: true },
        diner: { platId: null, portions: 1, preparation: "cuisine-ici", cuisine: false },
      },
    },
  };
  globalThis.localStorage.setItem("ma-semaine", JSON.stringify(ancienEtat));

  const { etat, erreurLecture } = chargerEtat();
  assert.equal(erreurLecture, false);
  assert.equal(etat.version, 4);
  assert.ok(etat.rayons.length > 0, "la migration v3 → v4 doit créer les rayons par défaut");

  // Une case vide (platId: null) disparaît (liste vide), une case avec un
  // plat devient une liste à un seul élément.
  assert.equal(etat.modele.length, 1);
  assert.equal(etat.modele[0].platId, "x");
  assert.ok(etat.modele[0].id, "chaque règle doit avoir un id");

  assert.deepEqual(etat.historique["2026-09-21"].diner, []);
  assert.equal(etat.historique["2026-09-21"].lunch.length, 1);
  assert.equal(etat.historique["2026-09-21"].lunch[0].platId, "x");
  assert.equal(etat.historique["2026-09-21"].lunch[0].cuisine, true);
});

test("chargerEtat : migre un très ancien format v1 jusqu'à v3, en chaîne", () => {
  const ancienEtat = {
    version: 1,
    ingredients: [],
    plats: [],
    planning: [
      { jour: "lundi", creneau: "petit-dejeuner", platId: "x", portions: 1, preparation: "cuisine-ici", cuisine: true },
    ],
    dernierePassageDate: "2026-09-20",
  };
  globalThis.localStorage.setItem("ma-semaine", JSON.stringify(ancienEtat));

  const { etat, erreurLecture } = chargerEtat();
  assert.equal(erreurLecture, false);
  assert.equal(etat.version, 4);
  assert.ok(etat.rayons.length > 0, "la migration en chaîne doit aussi créer les rayons par défaut");
  assert.equal(etat.modele.length, 1);
  assert.equal(etat.modele[0].platId, "x");
  assert.deepEqual(etat.historique, {});
  assert.equal(etat.planning, undefined);
  assert.equal(etat.dernierePassageDate, undefined);
});

test("chargerEtat : migre v3 → v4, un ingrédient dont le rayon était un nom retrouve le bon id", () => {
  const ancienEtat = {
    version: 3,
    ingredients: [
      { id: "dentifrice", nom: "Dentifrice", rayon: "Hygiène", unite: "pièce", enStock: 1, essentiel: true, minimum: 1, extra: 0, parCuillereACafe: null },
    ],
    plats: [],
    modele: [],
    historique: {},
  };
  globalThis.localStorage.setItem("ma-semaine", JSON.stringify(ancienEtat));

  const { etat, erreurLecture } = chargerEtat();
  assert.equal(erreurLecture, false);
  assert.equal(etat.version, 4);

  const rayonHygiene = etat.rayons.find((r) => r.nom === "Hygiène");
  assert.ok(rayonHygiene, "le rayon Hygiène doit exister par défaut");
  assert.equal(etat.ingredients[0].rayon, rayonHygiene.id);
});

test("chargerEtat : données corrompues → repart sur un état propre, avec erreurLecture", () => {
  globalThis.localStorage.setItem("ma-semaine", "{ ceci n'est pas du JSON valide");
  const { etat, erreurLecture } = chargerEtat();
  assert.equal(erreurLecture, true);
  assert.equal(etat.plats.length, 25);
});

test("chargerEtat : stockage inaccessible (ex. mode privé) → ne plante pas", () => {
  globalThis.localStorage.getItem = () => {
    throw new Error("stockage désactivé");
  };
  const { etat, erreurLecture } = chargerEtat();
  assert.equal(erreurLecture, true);
  assert.equal(etat.ingredients.length, 68);
});

test("sauvegarderEtat : stockage plein → rend false, ne plante pas", () => {
  globalThis.localStorage.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  const ok = sauvegarderEtat(creerEtatInitial());
  assert.equal(ok, false);
});
