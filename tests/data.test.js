// Tests de cohérence sur les données statiques (data.js).
//
// Objectif : si quelqu'un modifie data.js à la main (ajout d'un plat, d'un
// ingrédient...) et casse un lien entre les deux, ce test le signale
// immédiatement au lieu de planter en silence dans l'app plus tard.
//
// Lancer avec : node --test

import { test } from "node:test";
import assert from "node:assert/strict";
import { ingredients, plats } from "../data.js";

const UNITES_STOCK_VALIDES = new Set([
  "g", "ml", "pièce", "gousse", "bouquet", "boîte", "tranche", "poignée",
  "cube", "dose",
]);

const UNITES_CUILLERE = new Set(["c. à café", "c. à soupe"]);

test("les ingrédients ont un id unique", () => {
  const ids = ingredients.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, "des ids d'ingrédients sont dupliqués");
});

test("les plats ont un id unique", () => {
  const ids = plats.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "des ids de plats sont dupliqués");
});

test("chaque ingrédient utilisé par un plat existe dans le catalogue", () => {
  const idsConnus = new Set(ingredients.map((i) => i.id));
  for (const plat of plats) {
    for (const ligne of plat.ingredients) {
      assert.ok(
        idsConnus.has(ligne.ingredientId),
        `Plat "${plat.nom}" référence l'ingrédient inconnu "${ligne.ingredientId}"`
      );
    }
  }
});

test("chaque plat a au moins un ingrédient", () => {
  for (const plat of plats) {
    assert.ok(plat.ingredients.length > 0, `Plat "${plat.nom}" n'a aucun ingrédient`);
  }
});

test("aucune quantité par portion n'est négative ou nulle", () => {
  for (const plat of plats) {
    for (const ligne of plat.ingredients) {
      assert.ok(
        ligne.quantitePortion > 0,
        `Plat "${plat.nom}", ingrédient "${ligne.ingredientId}" : quantité par portion invalide (${ligne.quantitePortion})`
      );
    }
  }
});

test("l'unité de stock de chaque ingrédient est une unité valide (pas une cuillère)", () => {
  for (const ing of ingredients) {
    assert.ok(
      UNITES_STOCK_VALIDES.has(ing.unite),
      `Ingrédient "${ing.nom}" a une unité de stock invalide : "${ing.unite}"`
    );
  }
});

test("une ligne de plat en cuillère référence un ingrédient convertible", () => {
  const parId = new Map(ingredients.map((i) => [i.id, i]));
  for (const plat of plats) {
    for (const ligne of plat.ingredients) {
      if (UNITES_CUILLERE.has(ligne.unite)) {
        const ing = parId.get(ligne.ingredientId);
        assert.ok(
          ing.parCuillereACafe !== null,
          `Plat "${plat.nom}", ingrédient "${ing.nom}" : dosé en cuillère mais ` +
            `parCuillereACafe est null (conversion impossible)`
        );
      }
    }
  }
});

test("stock, minimum et extra de départ ne sont jamais négatifs", () => {
  for (const ing of ingredients) {
    assert.ok(ing.enStock >= 0, `Ingrédient "${ing.nom}" : enStock négatif`);
    assert.ok(ing.minimum >= 0, `Ingrédient "${ing.nom}" : minimum négatif`);
    assert.ok(ing.extra >= 0, `Ingrédient "${ing.nom}" : extra négatif`);
  }
});

test("chaque plat a un nom et un repas non vides", () => {
  for (const plat of plats) {
    assert.ok(plat.nom && plat.nom.length > 0, `Plat sans nom (id: ${plat.id})`);
    assert.ok(plat.repas && plat.repas.length > 0, `Plat "${plat.nom}" sans repas`);
  }
});

test("il y a bien 6 plats et 168 ingrédients (catalogue de plats nettoyé avec Qassim)", () => {
  assert.equal(plats.length, 6);
  assert.equal(ingredients.length, 168);
});
