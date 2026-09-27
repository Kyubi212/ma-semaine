// Ma Semaine — constantes partagées entre storage.js et calculs.js.
// Dans un fichier à part pour que les deux puissent les utiliser sans
// dépendre l'un de l'autre.

// Les 7 jours de la semaine type, dans l'ordre où ils s'affichent TOUJOURS
// (jamais réorganisés — voir CLAUDE.md § Semaine glissante).
export const JOURS = [
  "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
];

// Les 5 créneaux de repas par jour.
export const CRENEAUX = ["petit-dejeuner", "smoko", "lunch", "snack", "diner"];

// Les rayons, dans l'ordre où ils s'affichent (écran Courses) et où ils sont
// proposés (ajout d'un ingrédient). Repris du parcours habituel de Qassim au
// supermarché ; les rayons alimentaires d'abord (déjà utilisés par les
// ingrédients importés de Notion), puis les rayons non-alimentaires — jamais
// mélangés au même endroit dans un vrai supermarché, donc jamais mélangés ici.
export const RAYONS = [
  "Fruits et légumes",
  "Boucherie",
  "Poissonnerie",
  "Crèmerie",
  "Boulangerie",
  "Épicerie salée",
  "Épicerie sucrée",
  "Épices et condiments",
  "Surgelés",
  "Boissons",
  "Compléments alimentaires",
  "Hygiène",
  "Entretien maison",
  "Emballage",
];

// Unités de stock valides (pas les cuillères — voir CLAUDE.md § Données
// existantes). Utilisé par l'écran Stock pour proposer un choix fermé
// quand Qassim ajoute un nouvel ingrédient.
export const UNITES = [
  "g", "ml", "pièce", "gousse", "bouquet", "boîte", "tranche", "poignée",
  "cube", "dose",
];

// Un identifiant simple et stable dérivé d'un nom (minuscules, sans accents,
// tirets) — utilisé pour les rayons, qui ont un nom éditable par Qassim
// (renommer un rayon) mais un id qui ne change jamais (ce que les
// ingrédients référencent). En cas de collision, un compteur est ajouté.
export function genererSlug(nom, idsExistants) {
  const base = nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // enlève les accents (é → e, etc.)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");

  let id = base || "rayon";
  let compteur = 2;
  while (idsExistants.has(id)) {
    id = `${base}-${compteur}`;
    compteur += 1;
  }
  return id;
}
