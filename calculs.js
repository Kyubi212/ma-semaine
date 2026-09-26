// Ma Semaine — calculs.js
//
// Toute la logique de calcul du projet, et RIEN d'autre : pas de
// localStorage, pas de manipulation de l'écran. Rien que des fonctions
// "pures" (même entrée → toujours la même sortie), ce qui les rend faciles
// à tester automatiquement (voir tests/calculs.test.js) — c'est le but :
// une erreur ici serait invisible à l'œil nu dans l'app, mais un test la
// repère tout de suite.
//
// Vocabulaire du modèle de données (voir CLAUDE.md) :
// - un "ingrédient" a un enStock, un minimum (si essentiel) et un extra ;
// - un "plat" a une liste de lignes { ingredientId, quantitePortion, unite } ;
// - une "case" de planning a { jour, creneau, platId, portions, preparation,
//   cuisine }. preparation vaut "cuisine-ici" ou "reste".

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
// Si l'unité de la ligne est déjà l'unité de stock, rien à convertir.
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

// Une case de planning compte-t-elle dans les calculs (besoin, déduction du
// stock) ? Non si : aucun plat choisi, "reste" (pas une nouvelle cuisson),
// ou 0 portion (CLAUDE.md § Cas limites : équivalent à un créneau vide).
export function caseCompte(caseP) {
  return Boolean(caseP.platId) && caseP.preparation !== "reste" && caseP.portions > 0;
}

// Calcule, pour chaque ingrédient, la quantité nécessaire sur les cases du
// planning qui ne sont ni "reste" ni déjà cuisinées (celles-ci ont déjà
// déduit le stock au moment où on les a cochées, voir appliquerCuisine).
// Rend une Map<ingredientId, quantité en unité de stock>.
export function calculerBesoins(planning, plats, ingredients) {
  const platsParId = new Map(plats.map((plat) => [plat.id, plat]));
  const ingredientsParId = new Map(ingredients.map((ing) => [ing.id, ing]));
  const besoins = new Map();

  for (const caseP of planning) {
    if (!caseCompte(caseP) || caseP.cuisine) {
      continue;
    }
    const plat = platsParId.get(caseP.platId);
    if (!plat) {
      // Le plat a été supprimé entre-temps : on ignore la case plutôt que
      // de planter (CLAUDE.md § Cas limites : ingrédient/plat manquant
      // signalé ailleurs, jamais un crash).
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
// Arrondi au supérieur uniquement pour l'unité "pièce" (on n'achète pas
// 2,4 œufs), inchangé pour g/ml/etc.
export function calculerAAcheter(ingredients, besoins) {
  return ingredients.map((ingredient) => {
    const besoin = besoins.get(ingredient.id) ?? 0;
    const minimumEssentiel = ingredient.essentiel ? clampPositif(ingredient.minimum) : 0;
    const extra = clampPositif(ingredient.extra);

    let quantite = Math.max(0, besoin + minimumEssentiel + extra - ingredient.enStock);
    if (ingredient.unite === "pièce" && quantite > 0) {
      quantite = Math.ceil(quantite);
    }

    return { ingredientId: ingredient.id, aAcheter: quantite };
  });
}

// Trouve une case précise du planning (jour + créneau). Rend `undefined`
// si elle n'existe pas (ne devrait pas arriver avec un planning bien formé,
// mais on laisse l'appelant décider quoi faire plutôt que de planter ici).
export function trouverCase(planning, jour, creneau) {
  return planning.find((c) => c.jour === jour && c.creneau === creneau);
}

// Déduit du stock les ingrédients d'un plat pour une case donnée (portions
// × quantité par portion, convertie). Ne fait rien si la case ne "compte"
// pas (voir caseCompte) : cocher Cuisiné sur une case vide ou "reste" ou à
// 0 portion n'a aucun effet sur le stock.
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

// Coche ou décoche "Cuisiné" sur une case, et ajuste le stock en
// conséquence : cocher déduit immédiatement, décocher restitue (correction
// d'erreur). Ne fait rien si la case a déjà cet état (pour ne jamais
// déduire ou restituer deux fois de suite par erreur).
// Modifie `etat.planning` et `etat.ingredients` directement (mutation), ce
// qui est le choix le plus simple ici : c'est app.js qui décide quand
// resauvegarder l'état modifié (storage.js), calculs.js ne s'en occupe pas.
export function definirCuisine(etat, jour, creneau, cuisine) {
  const caseP = trouverCase(etat.planning, jour, creneau);
  if (!caseP || caseP.cuisine === cuisine) {
    return;
  }
  const sens = cuisine ? -1 : 1; // cuisiner retire du stock, décocher restitue
  ajusterStockPourCase(caseP, etat.plats, etat.ingredients, sens);
  caseP.cuisine = cuisine;
}

// Marque un ingrédient comme acheté : ajoute la quantité au stock. Remet
// aussi son "extra" à 0 (l'envie ponctuelle a été satisfaite) — décision
// prise avec Qassim au démarrage du projet.
export function marquerAchete(ingredient, quantiteAchetee) {
  ingredient.enStock += clampPositif(quantiteAchetee);
  ingredient.extra = 0;
}
