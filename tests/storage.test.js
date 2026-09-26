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
import { JOURS, CRENEAUX } from "../constantes.js";

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
  assert.equal(etat.ingredients.length, 60);
  assert.equal(etat.version, 2);
});

test("creerEtatInitial : modèle de 7 jours × 5 créneaux, tous vides ; historique vide", () => {
  const etat = creerEtatInitial();
  assert.equal(etat.modele.length, JOURS.length * CRENEAUX.length);
  for (const caseP of etat.modele) {
    assert.equal(caseP.platId, null);
  }
  assert.deepEqual(etat.historique, {});
});

test("chargerEtat : premier lancement (rien en stockage) → état initial, sans erreur", () => {
  const { etat, erreurLecture } = chargerEtat();
  assert.equal(erreurLecture, false);
  assert.equal(etat.plats.length, 25);
});

test("sauvegarderEtat puis chargerEtat : on retrouve exactement ce qu'on a sauvegardé", () => {
  const etat = creerEtatInitial();
  etat.modele[0].platId = "wraps-chili-au-poulet-riz";
  etat.modele[0].portions = 2;
  etat.historique["2026-09-21"] = {
    "petit-dejeuner": { platId: "bol-yaourt-grec", portions: 1, preparation: "cuisine-ici", cuisine: true },
  };

  const ok = sauvegarderEtat(etat);
  assert.equal(ok, true);

  const relu = chargerEtat();
  assert.equal(relu.erreurLecture, false);
  assert.equal(relu.etat.modele[0].platId, "wraps-chili-au-poulet-riz");
  assert.equal(relu.etat.modele[0].portions, 2);
  assert.equal(relu.etat.historique["2026-09-21"]["petit-dejeuner"].platId, "bol-yaourt-grec");
});

test("chargerEtat : données de l'ancien format (v1, planning) sont migrées vers modele/historique", () => {
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
  assert.equal(etat.version, 2);
  assert.equal(etat.modele[0].platId, "x");
  assert.equal(etat.modele[0].cuisine, undefined, "le modèle ne porte plus l'état cuisiné");
  assert.deepEqual(etat.historique, {});
  assert.equal(etat.planning, undefined);
  assert.equal(etat.dernierePassageDate, undefined);
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
  assert.equal(etat.ingredients.length, 60);
});

test("sauvegarderEtat : stockage plein → rend false, ne plante pas", () => {
  globalThis.localStorage.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  const ok = sauvegarderEtat(creerEtatInitial());
  assert.equal(ok, false);
});
