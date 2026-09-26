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
const { creerEtatInitial, chargerEtat, sauvegarderEtat, JOURS, CRENEAUX } =
  await import("../storage.js");

beforeEach(() => {
  // Un faux localStorage tout neuf avant chaque test, pour qu'ils ne se
  // marchent pas dessus.
  globalThis.localStorage = creerFauxLocalStorage();
});

test("creerEtatInitial : reprend le catalogue de data.js", () => {
  const etat = creerEtatInitial();
  assert.equal(etat.plats.length, 25);
  assert.equal(etat.ingredients.length, 60);
  assert.equal(etat.version, 1);
});

test("creerEtatInitial : planning de 7 jours × 5 créneaux, tous vides", () => {
  const etat = creerEtatInitial();
  assert.equal(etat.planning.length, JOURS.length * CRENEAUX.length);
  for (const caseP of etat.planning) {
    assert.equal(caseP.platId, null);
    assert.equal(caseP.cuisine, false);
  }
});

test("chargerEtat : premier lancement (rien en stockage) → état initial, sans erreur", () => {
  const { etat, erreurLecture } = chargerEtat();
  assert.equal(erreurLecture, false);
  assert.equal(etat.plats.length, 25);
});

test("sauvegarderEtat puis chargerEtat : on retrouve exactement ce qu'on a sauvegardé", () => {
  const etat = creerEtatInitial();
  etat.planning[0].platId = "wraps-chili-au-poulet-riz";
  etat.planning[0].portions = 2;

  const ok = sauvegarderEtat(etat);
  assert.equal(ok, true);

  const relu = chargerEtat();
  assert.equal(relu.erreurLecture, false);
  assert.equal(relu.etat.planning[0].platId, "wraps-chili-au-poulet-riz");
  assert.equal(relu.etat.planning[0].portions, 2);
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
