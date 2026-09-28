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
const { creerEtatInitial, chargerEtat, sauvegarderEtat, exporterEtat, importerEtat } = await import("../storage.js");

beforeEach(() => {
  // Un faux localStorage tout neuf avant chaque test, pour qu'ils ne se
  // marchent pas dessus.
  globalThis.localStorage = creerFauxLocalStorage();
});

test("creerEtatInitial : reprend le catalogue de data.js", () => {
  const etat = creerEtatInitial();
  assert.equal(etat.plats.length, 30);
  assert.equal(etat.ingredients.length, 176);
  assert.equal(etat.version, 16);
  assert.deepEqual(etat.repasPrets, []);
});

test("creerEtatInitial : tous les plats démarrent avec favori à false, étiquettes est toujours un tableau", () => {
  const etat = creerEtatInitial();
  assert.ok(etat.plats.every((p) => p.favori === false));
  assert.ok(etat.plats.every((p) => Array.isArray(p.etiquettes)));
});

test("creerEtatInitial : une liste d'étiquettes par défaut existe (Sucré, Salé, Sain...)", () => {
  const etat = creerEtatInitial();
  assert.ok(etat.etiquettes.length > 0);
  assert.ok(etat.etiquettes.some((e) => e.nom === "Sucré"));
});

test("creerEtatInitial : les repas sont des objets {id, nom}, Déjeuner/Dîner et Snack/Goûter fusionnés, référencés par les plats via leur id", () => {
  const etat = creerEtatInitial();
  assert.ok(etat.repas.some((r) => r.nom === "Déjeuner/Dîner"));
  assert.ok(!etat.repas.some((r) => r.nom === "Déjeuner"), "Déjeuner ne doit plus exister seul");
  assert.ok(!etat.repas.some((r) => r.nom === "Dîner"), "Dîner ne doit plus exister seul");
  assert.ok(etat.repas.some((r) => r.nom === "Snack/Goûter"));
  assert.ok(!etat.repas.some((r) => r.nom === "Smoko"), "Smoko ne doit plus exister (vocabulaire en français)");
  assert.ok(!etat.repas.some((r) => r.nom === "Snack"), "Snack ne doit plus exister seul");

  const idsRepas = new Set(etat.repas.map((r) => r.id));
  for (const plat of etat.plats) {
    assert.ok(idsRepas.has(plat.repas), `repas inconnu pour ${plat.nom} : ${plat.repas}`);
  }
});

test("creerEtatInitial : une liste de matériel par défaut existe (Poêle, Four...), plats référencés par id, sans assemblage orphelin", () => {
  const etat = creerEtatInitial();
  assert.ok(etat.materiel.length > 0);
  assert.ok(etat.materiel.some((m) => m.nom === "Poêle"));

  const idsMateriel = new Set(etat.materiel.map((m) => m.id));
  for (const plat of etat.plats) {
    assert.equal(plat.assemblage, undefined, `"assemblage" ne doit plus exister sur ${plat.nom}`);
    assert.ok(Array.isArray(plat.materiel));
    assert.equal(typeof plat.tempsPreparation, "number");
    assert.equal(typeof plat.tempsCuisson, "number");
    for (const materielId of plat.materiel) {
      assert.ok(idsMateriel.has(materielId), `matériel inconnu pour ${plat.nom} : ${materielId}`);
    }
  }
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
  assert.equal(etat.plats.length, 30);
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
  assert.equal(etat.version, 16);
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
  assert.equal(etat.version, 16);
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
  assert.equal(etat.version, 16);

  const rayonHygiene = etat.rayons.find((r) => r.nom === "Hygiène");
  assert.ok(rayonHygiene, "le rayon Hygiène doit exister par défaut");
  assert.equal(etat.ingredients[0].rayon, rayonHygiene.id);
});

test("chargerEtat : migre v4 → v5, un plat sans favori en récupère un à false", () => {
  const ancienEtat = {
    version: 4,
    rayons: [{ id: "epicerie", nom: "Épicerie" }],
    ingredients: [],
    plats: [{ id: "riz-sauce", nom: "Riz sauce", repas: "Déjeuner", ingredients: [] }],
    modele: [],
    historique: {},
  };
  globalThis.localStorage.setItem("ma-semaine", JSON.stringify(ancienEtat));

  const { etat, erreurLecture } = chargerEtat();
  assert.equal(erreurLecture, false);
  assert.equal(etat.version, 16);
  assert.equal(etat.plats[0].favori, false);
});

test("chargerEtat : migre v5 → v6, un plat sans étiquette en récupère une liste vide", () => {
  const ancienEtat = {
    version: 5,
    rayons: [{ id: "epicerie", nom: "Épicerie" }],
    ingredients: [],
    plats: [{ id: "riz-sauce", nom: "Riz sauce", repas: "Déjeuner", favori: false, ingredients: [] }],
    modele: [],
    historique: {},
  };
  globalThis.localStorage.setItem("ma-semaine", JSON.stringify(ancienEtat));

  const { etat, erreurLecture } = chargerEtat();
  assert.equal(erreurLecture, false);
  assert.equal(etat.version, 16);
  assert.deepEqual(etat.plats[0].etiquettes, []);
  assert.ok(etat.etiquettes.length > 0, "la migration v5 → v6 doit créer les étiquettes par défaut");
});

test("chargerEtat : migre v6 → v7, Déjeuner et Dîner deviennent le même repas ; une catégorie inconnue est conservée", () => {
  const ancienEtat = {
    version: 6,
    rayons: [{ id: "epicerie", nom: "Épicerie" }],
    etiquettes: [],
    ingredients: [],
    plats: [
      { id: "plat-a", nom: "Plat déjeuner", repas: "Déjeuner", favori: false, etiquettes: [], ingredients: [] },
      { id: "plat-b", nom: "Plat dîner", repas: "Dîner", favori: false, etiquettes: [], ingredients: [] },
      { id: "plat-c", nom: "Plat plaisir", repas: "Plaisir occasionnel", favori: false, etiquettes: [], ingredients: [] },
    ],
    modele: [],
    historique: {},
  };
  globalThis.localStorage.setItem("ma-semaine", JSON.stringify(ancienEtat));

  const { etat, erreurLecture } = chargerEtat();
  assert.equal(erreurLecture, false);
  assert.equal(etat.version, 16);

  const platA = etat.plats.find((p) => p.id === "plat-a");
  const platB = etat.plats.find((p) => p.id === "plat-b");
  const platC = etat.plats.find((p) => p.id === "plat-c");
  assert.equal(platA.repas, platB.repas, "Déjeuner et Dîner doivent pointer vers le même repas");

  const repasFusionne = etat.repas.find((r) => r.id === platA.repas);
  assert.equal(repasFusionne.nom, "Déjeuner/Dîner");

  const repasPlaisir = etat.repas.find((r) => r.id === platC.repas);
  assert.equal(repasPlaisir.nom, "Plaisir occasionnel", "une catégorie inconnue doit être conservée, pas perdue");
});

test("chargerEtat : migre v7 → v8, Smoko et Snack (déjà séparés depuis la v7) deviennent le même repas en français", () => {
  const ancienEtat = {
    version: 7,
    rayons: [],
    etiquettes: [],
    ingredients: [],
    repas: [
      { id: "petit-dejeuner", nom: "Petit-déjeuner" },
      { id: "smoko", nom: "Smoko" },
      { id: "dejeuner-diner", nom: "Déjeuner/Dîner" },
      { id: "snack", nom: "Snack" },
    ],
    plats: [
      { id: "plat-smoko", nom: "Plat smoko", repas: "smoko", favori: false, etiquettes: [], ingredients: [] },
      { id: "plat-snack", nom: "Plat snack", repas: "snack", favori: false, etiquettes: [], ingredients: [] },
    ],
    modele: [],
    historique: {},
  };
  globalThis.localStorage.setItem("ma-semaine", JSON.stringify(ancienEtat));

  const { etat, erreurLecture } = chargerEtat();
  assert.equal(erreurLecture, false);
  assert.equal(etat.version, 16);
  assert.ok(!etat.repas.some((r) => r.nom === "Smoko"));

  const platSmoko = etat.plats.find((p) => p.id === "plat-smoko");
  const platSnack = etat.plats.find((p) => p.id === "plat-snack");
  assert.equal(platSmoko.repas, platSnack.repas, "Smoko et Snack doivent pointer vers le même repas fusionné");

  const repasFusionne = etat.repas.find((r) => r.id === platSmoko.repas);
  assert.equal(repasFusionne.nom, "Snack/Goûter");
});

test("chargerEtat : migre v8 → v9, un état sans repasPrets en récupère une liste vide", () => {
  const ancienEtat = {
    version: 8,
    rayons: [],
    etiquettes: [],
    repas: [],
    ingredients: [],
    plats: [],
    modele: [],
    historique: {},
  };
  globalThis.localStorage.setItem("ma-semaine", JSON.stringify(ancienEtat));

  const { etat, erreurLecture } = chargerEtat();
  assert.equal(erreurLecture, false);
  assert.equal(etat.version, 16);
  assert.deepEqual(etat.repasPrets, []);
});

test("chargerEtat : migre v9 → v10, matériel par défaut créé, plats sans assemblage avec materiel/temps par défaut", () => {
  const ancienEtat = {
    version: 9,
    rayons: [],
    etiquettes: [],
    repas: [],
    ingredients: [],
    plats: [{ id: "plat-x", nom: "Plat X", repas: "r1", assemblage: true, portionsReference: 1, etapes: "", ingredients: [], etiquettes: [], favori: false }],
    modele: [],
    historique: {},
    repasPrets: [],
  };
  globalThis.localStorage.setItem("ma-semaine", JSON.stringify(ancienEtat));

  const { etat, erreurLecture } = chargerEtat();
  assert.equal(erreurLecture, false);
  assert.equal(etat.version, 16);
  assert.ok(etat.materiel.length > 0, "la migration v9 → v10 doit créer le matériel par défaut");

  const plat = etat.plats[0];
  assert.equal(plat.assemblage, undefined, '"assemblage" ne doit plus exister après migration');
  assert.deepEqual(plat.materiel, []);
  assert.equal(plat.tempsPreparation, 0);
  assert.equal(plat.tempsCuisson, 0);
});

test("chargerEtat : migre v11 → v12, le conditionnement disparaît sans toucher au stock", () => {
  const ancienEtat = {
    version: 11,
    rayons: [],
    etiquettes: [],
    repas: [],
    materiel: [],
    ingredients: [
      { id: "beurre", nom: "Beurre", rayon: "cremerie", unite: "g", enStock: 120, essentiel: true, minimum: 100, extra: 0, parCuillereACafe: 5, conditionnement: 250 },
    ],
    plats: [],
    modele: [],
    historique: {},
    repasPrets: [],
  };
  globalThis.localStorage.setItem("ma-semaine", JSON.stringify(ancienEtat));

  const { etat } = chargerEtat();
  assert.equal(etat.version, 16);
  const beurre = etat.ingredients[0];
  assert.equal("conditionnement" in beurre, false);
  assert.equal(beurre.enStock, 120);
  assert.equal(beurre.minimum, 100);
});

test("chargerEtat : migre v12 → v13, les 5 créneaux affichés par défaut", () => {
  const ancienEtat = {
    version: 12, rayons: [], etiquettes: [], repas: [], materiel: [], ingredients: [], plats: [],
    modele: [], historique: {}, repasPrets: [],
  };
  globalThis.localStorage.setItem("ma-semaine", JSON.stringify(ancienEtat));
  const { etat } = chargerEtat();
  assert.equal(etat.version, 16);
  assert.deepEqual(etat.creneauxAffiches, ["petit-dejeuner", "smoko", "lunch", "snack", "diner"]);
});

test("chargerEtat : migre v13 → v14, l'étiquette Rapide à préparer disparaît de la liste et des plats", () => {
  const ancienEtat = {
    version: 13, rayons: [], repas: [], materiel: [], ingredients: [],
    etiquettes: [{ id: "sain", nom: "Sain" }, { id: "rapide-a-preparer", nom: "Rapide à préparer" }],
    plats: [{ id: "p", nom: "P", repas: "r", etiquettes: ["sain", "rapide-a-preparer"], ingredients: [] }],
    modele: [], historique: {}, repasPrets: [], creneauxAffiches: ["lunch"],
  };
  globalThis.localStorage.setItem("ma-semaine", JSON.stringify(ancienEtat));
  const { etat } = chargerEtat();
  assert.equal(etat.version, 16);
  assert.deepEqual(etat.etiquettes.map((e) => e.id), ["sain"]);
  assert.deepEqual(etat.plats[0].etiquettes, ["sain"]);
  assert.deepEqual(etat.creneauxAffiches, ["lunch"], "le reste n'est pas touché");
});

test("chargerEtat : migre v15 → v16, les plats sans typePortions démarrent en 'personne'", () => {
  const ancienEtat = {
    version: 15, rayons: [], etiquettes: [], repas: [], materiel: [], ingredients: [],
    plats: [
      { id: "p1", nom: "P1", repas: "r", etiquettes: [], ingredients: [] },
      { id: "p2", nom: "P2", repas: "r", etiquettes: [], ingredients: [], typePortions: "quantite" },
    ],
    modele: [], historique: {}, repasPrets: [], creneauxAffiches: [], aPrevoir: [],
  };
  globalThis.localStorage.setItem("ma-semaine", JSON.stringify(ancienEtat));
  const { etat } = chargerEtat();
  assert.equal(etat.version, 16);
  assert.equal(etat.plats[0].typePortions, "personne", "aucune valeur avant migration → 'personne' (comportement d'avant, inchangé)");
  assert.equal(etat.plats[1].typePortions, "quantite", "une valeur déjà présente n'est pas écrasée");
});

test("chargerEtat : données corrompues → repart sur un état propre, avec erreurLecture", () => {
  globalThis.localStorage.setItem("ma-semaine", "{ ceci n'est pas du JSON valide");
  const { etat, erreurLecture } = chargerEtat();
  assert.equal(erreurLecture, true);
  assert.equal(etat.plats.length, 30);
});

test("chargerEtat : stockage inaccessible (ex. mode privé) → ne plante pas", () => {
  globalThis.localStorage.getItem = () => {
    throw new Error("stockage désactivé");
  };
  const { etat, erreurLecture } = chargerEtat();
  assert.equal(erreurLecture, true);
  assert.equal(etat.ingredients.length, 176);
});

test("sauvegarderEtat : stockage plein → rend false, ne plante pas", () => {
  globalThis.localStorage.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  const ok = sauvegarderEtat(creerEtatInitial());
  assert.equal(ok, false);
});

test("exporterEtat puis importerEtat : on retrouve exactement ce qui a été exporté", () => {
  const etat = creerEtatInitial();
  etat.ingredients[0].enStock = 42;
  const texte = exporterEtat(etat);

  const resultat = importerEtat(texte);
  assert.equal(resultat.ok, true);

  const relu = chargerEtat();
  assert.equal(relu.etat.ingredients[0].enStock, 42);
  assert.equal(relu.etat.plats.length, 30);
});

test("importerEtat : JSON invalide → rend { ok: false } avec un message, ne plante pas", () => {
  const resultat = importerEtat("{ ceci n'est pas du JSON valide");
  assert.equal(resultat.ok, false);
  assert.ok(resultat.erreur.length > 0);
});

test("importerEtat : objet sans version/plats/ingrédients → refusé", () => {
  const resultat = importerEtat(JSON.stringify({ quelqueChose: "sans rapport" }));
  assert.equal(resultat.ok, false);
});

test("importerEtat : sauvegarde d'une version future de l'app → refusée sans rien écraser", () => {
  const etat = creerEtatInitial();
  sauvegarderEtat(etat);

  const sauvegardeFuture = { ...creerEtatInitial(), version: 9999 };
  const resultat = importerEtat(JSON.stringify(sauvegardeFuture));

  assert.equal(resultat.ok, false);
  assert.match(resultat.erreur, /plus récente/);
  const relu = chargerEtat();
  assert.equal(relu.etat.version, etat.version);
});

test("importerEtat : sauvegarde d'un ancien format (v1) → migrée avant d'être enregistrée", () => {
  const ancienneSauvegarde = {
    version: 1,
    ingredients: [],
    plats: [],
    planning: [{ jour: "lundi", creneau: "lunch", platId: "x", portions: 2, preparation: "cuisine-ici" }],
  };

  const resultat = importerEtat(JSON.stringify(ancienneSauvegarde));
  assert.equal(resultat.ok, true);

  const relu = chargerEtat();
  assert.equal(relu.etat.version, 16);
  assert.equal(relu.etat.modele[0].platId, "x");
});
