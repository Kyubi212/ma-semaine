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
  "Boucherie halal",
  "Poissonnerie",
  "Crèmerie",
  "Fruits et légumes",
  "Épicerie",
  "Épices",
  "Conserves",
  "Surgelés ou frais",
  "Boulangerie",
  "Emballage",
  "Hygiène",
  "Entretien maison",
  "Compléments alimentaires",
];
