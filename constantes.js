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
