// Ma Semaine — point d'entrée de l'application.
// Gère la navigation entre les 4 écrans, et construit l'écran Semaine
// (le seul déjà branché aux vraies données à cette étape du projet).

import { chargerEtat, sauvegarderEtat, effacerStockage, exporterEtat, importerEtat } from "./storage.js";
import {
  obtenirElementsEffectifs,
  definirCuisine,
  ajouterPlatAuJour,
  modifierElementDuJour,
  retirerElementDuJour,
  datesDeLaSemaine,
  decalerSemaine,
  dateEnISO,
  jourDeLaSemaine,
  construireListeCourses,
  marquerAchete,
  clampPositif,
  etatStock,
  modifierIngredient,
  ajouterIngredient,
  supprimerIngredient,
  ajouterRayon,
  renommerRayon,
  supprimerRayon,
  ajouterPlat,
  modifierPlat,
  supprimerPlat,
  ajouterEtiquette,
  renommerEtiquette,
  supprimerEtiquette,
  ajouterMateriel,
  renommerMateriel,
  supprimerMateriel,
  ajouterRepas,
  renommerRepas,
  supprimerRepas,
  ingredientsManquantsPourPlat,
  platEstRealisableAvecStock,
  etatAvecStockProjete,
  ajouterRepasPret,
  mangerRepasPret,
  retirerRepasPret,
  formaterQuantite,
  convertirVersUniteStock,
} from "./calculs.js";
import { JOURS, UNITES } from "./constantes.js";

// --- Bandeau d'avertissement (EN PREMIER, avant tout le reste : le code
// plus bas peut avoir besoin de l'afficher dès la toute première ligne) ---

const avertissementEl = document.getElementById("avertissement");
const avertissementTexteEl = document.getElementById("avertissement-texte");
document.getElementById("avertissement-fermer").addEventListener("click", () => {
  avertissementEl.hidden = true;
});

function afficherAvertissement(message) {
  avertissementTexteEl.textContent = message;
  avertissementEl.hidden = false;
}

// Qassim n'a pas d'ordinateur : il ne peut pas ouvrir la console du
// navigateur pour me montrer une erreur technique. Si quelque chose plante
// de façon imprévue, on l'affiche directement et lisiblement à l'écran
// (dans le même bandeau), pour qu'il puisse au moins m'envoyer une capture
// d'écran du message exact plutôt qu'une page blanche muette.
window.addEventListener("error", (evenement) => {
  afficherAvertissement(`Erreur technique : ${evenement.message}`);
});
window.addEventListener("unhandledrejection", (evenement) => {
  afficherAvertissement(`Erreur technique : ${evenement.reason}`);
});

// --- Chargement de l'état (une seule fois, au démarrage) ---

const { etat, erreurLecture } = chargerEtat();

if (erreurLecture) {
  afficherAvertissement(
    "Tes données précédentes n'ont pas pu être lues (stockage indisponible, mode " +
      "privé, ou données corrompues). Un nouveau départ propre a été créé."
  );
}

// Sauvegarde l'état actuel ; prévient si ça échoue (ex. stockage plein),
// plutôt que de laisser croire que c'est enregistré alors que ça ne l'est
// pas (voir CLAUDE.md § Cas limites).
function sauvegarder() {
  const ok = sauvegarderEtat(etat);
  if (!ok) {
    afficherAvertissement(
      "Le stockage de ton téléphone semble plein : ce dernier changement n'a peut-être pas été enregistré."
    );
  }
}

// --- Navigation entre les 4 écrans (barre du bas) ---

const titresEcrans = {
  semaine: "Semaine",
  courses: "Courses",
  plats: "Plats & repas",
  stock: "Stock",
};

const titreElement = document.getElementById("titre-ecran");
const boutonsOnglets = document.querySelectorAll(".tab");

function afficherEcran(nomEcran) {
  document.querySelectorAll(".ecran").forEach((section) => {
    section.hidden = section.id !== `ecran-${nomEcran}`;
  });
  boutonsOnglets.forEach((bouton) => {
    bouton.setAttribute("aria-current", bouton.dataset.ecran === nomEcran ? "true" : "false");
  });
  titreElement.textContent = titresEcrans[nomEcran] ?? "";
}

boutonsOnglets.forEach((bouton) => {
  bouton.addEventListener("click", () => {
    afficherEcran(bouton.dataset.ecran);
    // L'écran Courses dépend de ce qui a été planifié dans l'écran Semaine :
    // on le recalcule à chaque fois qu'on l'ouvre, pas seulement au démarrage.
    if (bouton.dataset.ecran === "courses") rendreEcranCourses();
    if (bouton.dataset.ecran === "stock") rendreEcranStock();
    if (bouton.dataset.ecran === "plats") rendreEcranPlats();
  });
});

afficherEcran("semaine");

// ============================================================
// Écran Semaine
// ============================================================

// Fenêtre de navigation autorisée, en nombre de semaines par rapport à la
// semaine réelle en cours (voir CLAUDE.md § Semaines réelles et modèle).
const LIMITE_SEMAINES_ARRIERE = -1;
const LIMITE_SEMAINES_AVANT = 2;

const JOUR_LABELS = {
  lundi: "Lun", mardi: "Mar", mercredi: "Mer", jeudi: "Jeu",
  vendredi: "Ven", samedi: "Sam", dimanche: "Dim",
};

const MOIS_ABREGES = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

// Pour chaque créneau : son icône, son libellé affiché, et le libellé
// "repas" correspondant dans data.js (utilisé pour filtrer la liste de
// plats proposée dans le panneau).
// repasId : id du repas (écran Plats & repas, éditable — voir CLAUDE.md
// § Repas éditables) utilisé pour filtrer les plats proposés à ce créneau.
// Ids déterministes (dérivés des noms par défaut dans storage.js), stables
// même si Qassim renomme le repas ensuite (seul le nom change, pas l'id).
// lunch ET diner partagent le même repas "Déjeuner/Dîner" fusionné ; smoko
// ET snack partagent le même repas "Snack/Goûter" fusionné. Vocabulaire en
// français partout (Qassim : "Smoko" n'est pas français).
const CRENEAU_INFOS = {
  "petit-dejeuner": { icone: "🌅", label: "Petit-déjeuner", repasId: "petit-dejeuner" },
  smoko: { icone: "☕", label: "Snack", repasId: "snack-gouter" },
  lunch: { icone: "🥗", label: "Déjeuner", repasId: "dejeuner-diner" },
  snack: { icone: "🍎", label: "Goûter", repasId: "snack-gouter" },
  diner: { icone: "🍽️", label: "Dîner", repasId: "dejeuner-diner" },
};
const ORDRE_CRENEAUX = ["petit-dejeuner", "smoko", "lunch", "snack", "diner"];

let decalageSemaine = 0; // 0 = semaine réelle en cours
let dateSelectionnee = dateEnISO(new Date());

function joursMoisLisible(dateISO) {
  const [, mois, jour] = dateISO.split("-").map(Number);
  return `${jour} ${MOIS_ABREGES[mois - 1]}`;
}

function referenceSemaineAffichee() {
  return decalerSemaine(new Date(), decalageSemaine);
}

function changerSemaine(nouveauDecalage) {
  decalageSemaine = Math.max(
    LIMITE_SEMAINES_ARRIERE,
    Math.min(LIMITE_SEMAINES_AVANT, nouveauDecalage)
  );
  const dates = datesDeLaSemaine(referenceSemaineAffichee());
  // Sur la semaine en cours, on ouvre sur aujourd'hui ; sur une autre
  // semaine, on ouvre sur le lundi.
  dateSelectionnee = decalageSemaine === 0 ? dateEnISO(new Date()) : dates[0];
  rendreEcranSemaine();
}

// --- Éléments de l'écran ---

const boutonSemainePrecedente = document.getElementById("semaine-precedente");
const boutonSemaineSuivante = document.getElementById("semaine-suivante");
const semaineLabelEl = document.getElementById("semaine-label");
const joursPastillesEl = document.getElementById("jours-pastilles");
const cartesCreneauxEl = document.getElementById("cartes-creneaux");

boutonSemainePrecedente.addEventListener("click", () => changerSemaine(decalageSemaine - 1));
boutonSemaineSuivante.addEventListener("click", () => changerSemaine(decalageSemaine + 1));

// --- Repas prêts : des portions déjà prêtes à manger, sans lien avec un
// jour précis (un plat offert, un batch-cook à l'avance...) — voir
// CLAUDE.md § Repas prêts. Une section à part, au-dessus du planning. ---

const listeRepasPretsEl = document.getElementById("liste-repas-prets");
const repasPretsCompteEl = document.getElementById("repas-prets-compte");

document.getElementById("ajouter-repas-pret").addEventListener("click", () => {
  ouvrirPanneauNouveauRepasPret();
});

// Section "🍱 Repas prêts" en haut de l'écran seulement quand il y en a :
// vide, elle prenait de la place pour rien. Pour en ajouter un premier, un
// lien discret reste toujours disponible sous le planning.
const repasPretsGroupeEl = document.getElementById("repas-prets-groupe");
document.getElementById("ajouter-repas-pret-bas").addEventListener("click", () => {
  ouvrirPanneauNouveauRepasPret();
});

function rendreRepasPrets() {
  repasPretsGroupeEl.hidden = etat.repasPrets.length === 0;
  repasPretsCompteEl.textContent = etat.repasPrets.length;
  listeRepasPretsEl.innerHTML = "";

  if (etat.repasPrets.length === 0) {
    listeRepasPretsEl.innerHTML = `<p class="panneau-vide">Rien en stock pour l'instant.</p>`;
    return;
  }

  for (const repasPret of etat.repasPrets) {
    const ligne = document.createElement("div");
    ligne.className = "element-prevu";
    ligne.innerHTML = `
      <div class="element-prevu-ligne1">
        <span class="element-nom">${repasPret.nom}</span>
        <button class="element-retirer" aria-label="Retirer">✕</button>
      </div>
      <div class="element-prevu-ligne2">
        <span class="article-detail">${repasPret.portions} portion${repasPret.portions > 1 ? "s" : ""} restante${repasPret.portions > 1 ? "s" : ""}</span>
        <button class="bouton-secondaire" data-action="manger">🍽️ Manger</button>
      </div>
    `;
    ligne.querySelector(".element-retirer").addEventListener("click", () => {
      retirerRepasPret(etat, repasPret.id);
      sauvegarder();
      rendreRepasPrets();
    });
    ligne.querySelector('[data-action="manger"]').addEventListener("click", () => {
      mangerRepasPret(etat, repasPret.id);
      sauvegarder();
      rendreRepasPrets();
    });
    listeRepasPretsEl.appendChild(ligne);
  }
}

// --- Panneau "ajouter un repas prêt" : soit depuis un plat déjà connu (ex.
// un batch-cook — déduit son stock d'ingrédients immédiatement), soit un nom
// libre pour une recette inconnue (ex. offerte par quelqu'un — ne touche
// jamais le stock d'ingrédients). ---

function ouvrirPanneauNouveauRepasPret() {
  apresFermeturePanneau = rendreRepasPrets;
  let platId = null; // null = recette inconnue (ne touche jamais le stock)
  let montrerListePlats = false;
  const nouveau = { nom: "", portions: 1 };

  function rendrePanneau(messageErreur) {
    const platChoisi = platId ? etat.plats.find((p) => p.id === platId) : null;

    panneauPlatEl.innerHTML = `
      <div class="panneau-entete">
        <span class="panneau-titre">🍱 Nouveau repas prêt</span>
        <button class="panneau-fermer" aria-label="Fermer">✕</button>
      </div>

      <div class="panneau-section-titre">Nom</div>
      <input type="text" id="repas-pret-nom" class="champ-texte" value="${nouveau.nom}" placeholder="Ex. Plat mongol (offert par le voisin)">

      <button class="bouton-discret" id="repas-pret-toggle-plat">
        ${platChoisi ? `Lié à : ${platChoisi.nom} (toucher pour changer)` : "Lier à un plat déjà connu (ex. un batch-cook — déduit son stock d'ingrédients)"}
      </button>
      <div class="liste-plats" id="repas-pret-liste-plats" ${montrerListePlats ? "" : "hidden"}></div>
      <p class="panneau-note">
        Sans lien à un plat, aucun ingrédient n'est déduit (recette inconnue, ex. offerte par
        quelqu'un). Avec un plat, le stock d'ingrédients est déduit tout de suite, pour ces
        portions.
      </p>

      <div class="panneau-section-titre">Portions</div>
      <div class="stepper">
        <button class="stepper-bouton" id="repas-pret-moins" aria-label="Moins">−</button>
        <span class="stepper-valeur">${nouveau.portions}</span>
        <button class="stepper-bouton" id="repas-pret-plus" aria-label="Plus">+</button>
      </div>

      ${messageErreur ? `<p class="panneau-note" style="color:#c0392b;">${messageErreur}</p>` : ""}

      <div class="panneau-actions">
        <button class="bouton-principal" id="repas-pret-valider">Ajouter</button>
      </div>
    `;

    panneauPlatEl.querySelector("#repas-pret-nom").addEventListener("change", (evenement) => {
      nouveau.nom = evenement.target.value;
    });

    panneauPlatEl.querySelector("#repas-pret-toggle-plat").addEventListener("click", () => {
      montrerListePlats = !montrerListePlats;
      rendrePanneau();
    });

    if (montrerListePlats) {
      const listePlatsEl = panneauPlatEl.querySelector("#repas-pret-liste-plats");
      for (const plat of trierParNom(etat.plats)) {
        const item = document.createElement("button");
        item.className = "plat-choix";
        if (plat.id === platId) item.classList.add("selectionne");
        item.textContent = plat.nom;
        item.addEventListener("click", () => {
          platId = plat.id;
          if (!nouveau.nom) nouveau.nom = plat.nom;
          montrerListePlats = false;
          rendrePanneau();
        });
        listePlatsEl.appendChild(item);
      }
    }

    panneauPlatEl.querySelector("#repas-pret-moins").addEventListener("click", () => {
      nouveau.portions = Math.max(1, nouveau.portions - 1);
      rendrePanneau();
    });
    panneauPlatEl.querySelector("#repas-pret-plus").addEventListener("click", () => {
      nouveau.portions += 1;
      rendrePanneau();
    });

    panneauPlatEl.querySelector("#repas-pret-valider").addEventListener("click", () => {
      const nomSaisi = panneauPlatEl.querySelector("#repas-pret-nom").value.trim() || platChoisi?.nom;
      if (!nomSaisi) {
        rendrePanneau("Donne un nom à ce repas.");
        return;
      }
      ajouterRepasPret(etat, { nom: nomSaisi, platId, portions: nouveau.portions });
      sauvegarder();
      fermerPanneau();
    });

    panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", fermerPanneau);
  }

  rendrePanneau();
  panneauFondEl.hidden = false;
  panneauPlatEl.hidden = false;
}

function rendreEcranSemaine() {
  rendreRepasPrets();
  const dates = datesDeLaSemaine(referenceSemaineAffichee());
  const aujourdhuiISO = dateEnISO(new Date());

  // Navigation : flèches désactivées en bout de fenêtre autorisée.
  boutonSemainePrecedente.disabled = decalageSemaine <= LIMITE_SEMAINES_ARRIERE;
  boutonSemaineSuivante.disabled = decalageSemaine >= LIMITE_SEMAINES_AVANT;
  semaineLabelEl.textContent = `Semaine du ${joursMoisLisible(dates[0])} au ${joursMoisLisible(dates[6])}`;

  // Pastilles des 7 jours, toujours dans l'ordre fixe lundi → dimanche
  // (datesDeLaSemaine rend déjà les dates dans cet ordre, comme JOURS).
  joursPastillesEl.innerHTML = "";
  dates.forEach((dateISO, index) => {
    const jourSemaine = JOURS[index];
    const bouton = document.createElement("button");
    bouton.className = "jour-pastille";
    if (dateISO === aujourdhuiISO) bouton.classList.add("aujourdhui");
    if (dateISO === dateSelectionnee) bouton.classList.add("actif");
    // Petit point sous le numéro : ce jour a au moins un plat prévu (plein
    // = tout est mangé, creux = il en reste à manger) — pour voir d'un coup
    // d'œil quels jours sont remplis, sans les ouvrir un par un.
    const elementsDuJour = ORDRE_CRENEAUX.flatMap((c) => obtenirElementsEffectifs(etat, dateISO, c));
    let point = "";
    if (elementsDuJour.length > 0) {
      const toutMange = elementsDuJour.every((e) => e.cuisine);
      point = `<span class="jour-pastille-point${toutMange ? " plein" : ""}" aria-label="${elementsDuJour.length} plat${elementsDuJour.length > 1 ? "s" : ""} prévu${elementsDuJour.length > 1 ? "s" : ""}"></span>`;
    } else {
      point = `<span class="jour-pastille-point vide" aria-hidden="true"></span>`;
    }
    bouton.innerHTML = `
      <span class="jour-pastille-nom">${JOUR_LABELS[jourSemaine]}</span>
      <span class="jour-pastille-numero">${dateISO.split("-")[2]}</span>
      ${point}
    `;
    bouton.addEventListener("click", () => {
      dateSelectionnee = dateISO;
      rendreEcranSemaine();
    });
    joursPastillesEl.appendChild(bouton);
  });

  // Les 5 cartes de créneaux pour le jour sélectionné.
  cartesCreneauxEl.innerHTML = "";
  for (const creneau of ORDRE_CRENEAUX) {
    cartesCreneauxEl.appendChild(construireCarteCreneau(dateSelectionnee, creneau));
  }
}

function nomPlat(platId) {
  const plat = etat.plats.find((p) => p.id === platId);
  return plat ? plat.nom : "Plat inconnu";
}

function construireCarteCreneau(dateISO, creneau) {
  const infos = CRENEAU_INFOS[creneau];
  const elements = obtenirElementsEffectifs(etat, dateISO, creneau);

  const carte = document.createElement("div");
  carte.className = "carte-creneau";

  const infoBouton = document.createElement("button");
  infoBouton.className = "carte-creneau-info";
  infoBouton.addEventListener("click", () => ouvrirPanneau(dateISO, creneau));

  if (elements.length === 0) {
    infoBouton.innerHTML = `
      <span class="carte-creneau-entete">${infos.icone} ${infos.label}</span>
      <span class="carte-creneau-plat vide">À choisir</span>
    `;
  } else if (elements.length === 1) {
    const [element] = elements;
    infoBouton.innerHTML = `
      <span class="carte-creneau-entete">${infos.icone} ${infos.label}</span>
      <span class="carte-creneau-plat">${nomPlat(element.platId)}</span>
      <span class="carte-creneau-detail">${element.portions} portion${element.portions > 1 ? "s" : ""}</span>
    `;
  } else {
    // Plusieurs plats pour ce créneau (voir CLAUDE.md § Plusieurs plats par
    // créneau) : la carte résume, le détail (portions, Mangé par plat) se
    // gère dans le panneau.
    infoBouton.innerHTML = `
      <span class="carte-creneau-entete">${infos.icone} ${infos.label}</span>
      <span class="carte-creneau-plat">${elements.map((e) => nomPlat(e.platId)).join(" · ")}</span>
      <span class="carte-creneau-detail">${elements.length} plats</span>
    `;
  }
  carte.appendChild(infoBouton);

  // La case "Mangé" directement sur la carte n'a de sens que pour UN seul
  // plat. Avec plusieurs plats, chacun a sa propre case, gérée dans le panneau.
  // Case accompagnée de son libellé "Mangé" (seule, on ne savait pas à quoi
  // elle servait sans ouvrir le panneau).
  if (elements.length === 1) {
    const [element] = elements;
    const etiquette = document.createElement("label");
    etiquette.className = "carte-creneau-mange";
    etiquette.innerHTML = `
      <input type="checkbox" class="carte-creneau-cuisine" ${element.cuisine ? "checked" : ""} aria-label="Mangé (déduit le stock)">
      <span>Mangé</span>
    `;
    const caseACocher = etiquette.querySelector("input");
    caseACocher.addEventListener("change", () => {
      definirCuisine(etat, dateISO, creneau, element.id, caseACocher.checked);
      sauvegarder();
      rendreEcranSemaine();
    });
    carte.appendChild(etiquette);
  }
  if (elements.length === 1 && elements[0].cuisine) carte.classList.add("mange");

  return carte;
}

// --- Panneau "gérer les plats d'un créneau" ---

const panneauFondEl = document.getElementById("panneau-fond");
const panneauPlatEl = document.getElementById("panneau-plat");

// Le panneau est partagé entre plusieurs usages (choisir un plat, ajouter un
// extra) : chaque fonction qui l'ouvre indique ici quel écran rafraîchir à
// la fermeture, plutôt que de coder ça en dur dans le bouton "fermer".
let apresFermeturePanneau = null;

function fermerPanneau() {
  panneauFondEl.hidden = true;
  panneauPlatEl.hidden = true;
  panneauPlatEl.innerHTML = "";
  if (apresFermeturePanneau) apresFermeturePanneau();
}

panneauFondEl.addEventListener("click", fermerPanneau);

// --- Menu ⋯ (en-tête) : export/import de sauvegarde (fichier JSON, aucun
// serveur — voir storage.js § exporterEtat/importerEtat) et réinitialisation.
// Modifier data.js (rayons, ingrédients, plats) ne change RIEN à ce qui est
// déjà sauvegardé sur ce téléphone — il faut un vrai reset pour repartir des
// données de base à jour. ---

document.getElementById("menu-options").addEventListener("click", () => ouvrirPanneauMenu());

function ouvrirPanneauMenu() {
  apresFermeturePanneau = null;

  panneauPlatEl.innerHTML = `
    <div class="panneau-entete">
      <span class="panneau-titre">Menu</span>
      <button class="panneau-fermer" aria-label="Fermer">✕</button>
    </div>
    <button class="bouton-discret" id="menu-exporter">⬇️ Exporter une sauvegarde</button>
    <button class="bouton-discret" id="menu-importer">⬆️ Importer une sauvegarde</button>
    <p class="panneau-note">Exporter télécharge un fichier avec tout ce qui est enregistré sur ce
      téléphone (planning, stock, plats...) — à garder de côté ou à réimporter sur un autre
      téléphone. Importer remplace tout ce qui est déjà là par le contenu du fichier.</p>
    <button class="bouton-discret" id="menu-reinitialiser">🗑️ Réinitialiser avec les données de base</button>
    <p class="panneau-note">Efface TOUT ce qui est enregistré sur ce téléphone (planning, stock,
      plats modifiés...) et recharge l'appli avec le catalogue de base (rayons, ingrédients,
      plats). Irréversible.</p>
  `;

  panneauPlatEl.querySelector("#menu-exporter").addEventListener("click", () => {
    exporterSauvegarde();
  });
  panneauPlatEl.querySelector("#menu-importer").addEventListener("click", () => {
    declencherSelectionFichierImport();
  });
  panneauPlatEl.querySelector("#menu-reinitialiser").addEventListener("click", () => {
    ouvrirPanneauConfirmerReinitialisation();
  });
  panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", fermerPanneau);

  panneauFondEl.hidden = false;
  panneauPlatEl.hidden = false;
}

function exporterSauvegarde() {
  const texte = exporterEtat(etat);
  const blob = new Blob([texte], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const dateISO = new Date().toISOString().slice(0, 10);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = `ma-semaine-sauvegarde-${dateISO}.json`;
  lien.click();
  URL.revokeObjectURL(url);
}

function declencherSelectionFichierImport() {
  // L'input doit être dans le DOM (même caché) pour que le sélecteur de
  // fichier s'ouvre de façon fiable sur tous les navigateurs — un input
  // créé sans être attaché au document ne déclenche pas toujours la
  // boîte de dialogue native (bug réel rencontré et corrigé ici).
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.hidden = true;
  document.body.appendChild(input);
  input.addEventListener("change", () => {
    const fichier = input.files[0];
    input.remove();
    if (!fichier) return;
    const lecteur = new FileReader();
    lecteur.addEventListener("load", () => {
      ouvrirPanneauConfirmerImport(fichier.name, lecteur.result);
    });
    lecteur.addEventListener("error", () => {
      afficherAvertissement("Impossible de lire ce fichier.");
    });
    lecteur.readAsText(fichier);
  });
  input.click();
}

function ouvrirPanneauConfirmerImport(nomFichier, texteFichier) {
  panneauPlatEl.innerHTML = `
    <div class="panneau-entete">
      <span class="panneau-titre">⚠️ Importer cette sauvegarde ?</span>
      <button class="panneau-fermer" aria-label="Fermer">✕</button>
    </div>
    <p class="panneau-note">Fichier : ${nomFichier}</p>
    <p class="panneau-note">Ton planning, ton stock actuel et tes plats seront remplacés par le
      contenu de ce fichier. Cette action ne peut pas être annulée.</p>
    <div class="panneau-actions">
      <button class="bouton-principal" id="confirmer-importer" style="background:#c0392b;">Oui, importer</button>
      <button class="bouton-secondaire" id="annuler-importer">Annuler</button>
    </div>
  `;

  panneauPlatEl.querySelector("#confirmer-importer").addEventListener("click", () => {
    const resultat = importerEtat(texteFichier);
    if (resultat.ok) {
      location.reload();
    } else {
      fermerPanneau();
      afficherAvertissement(resultat.erreur);
    }
  });
  panneauPlatEl.querySelector("#annuler-importer").addEventListener("click", () => ouvrirPanneauMenu());
  panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", fermerPanneau);
}

function ouvrirPanneauConfirmerReinitialisation() {
  panneauPlatEl.innerHTML = `
    <div class="panneau-entete">
      <span class="panneau-titre">⚠️ Tout réinitialiser ?</span>
      <button class="panneau-fermer" aria-label="Fermer">✕</button>
    </div>
    <p class="panneau-note">Ton planning, ton stock actuel et tes plats modifiés seront
      définitivement perdus. Cette action ne peut pas être annulée.</p>
    <div class="panneau-actions">
      <button class="bouton-principal" id="confirmer-reinitialiser" style="background:#c0392b;">Oui, tout effacer</button>
      <button class="bouton-secondaire" id="annuler-reinitialiser">Annuler</button>
    </div>
  `;

  panneauPlatEl.querySelector("#confirmer-reinitialiser").addEventListener("click", () => {
    effacerStockage();
    location.reload();
  });
  panneauPlatEl.querySelector("#annuler-reinitialiser").addEventListener("click", () => ouvrirPanneauMenu());
  panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", fermerPanneau);
}

function ouvrirPanneau(dateISO, creneau) {
  apresFermeturePanneau = rendreEcranSemaine;
  const infos = CRENEAU_INFOS[creneau];
  const jourLabel = jourDeLaSemaine(dateISO);

  // "Candidat" en cours d'ajout (pas encore enregistré) : null tant que
  // Qassim n'a pas tapé sur un plat de la liste "Ajouter un plat".
  let candidat = null;

  // Filtres de la liste "Ajouter un plat" — par défaut sur le repas de ce
  // créneau, mais entièrement changeables (mêmes filtres que l'écran
  // Plats & repas) pour pouvoir ex. mettre un plat "Petit-déjeuner" au
  // déjeuner (brunch), ou ne voir que ses favoris.
  let filtreRepasPanneau = infos.repasId;
  let filtreFavorisPanneau = false;
  let filtreRealisablePanneau = false;
  const etiquettesSelectionneesPanneau = new Set();
  let recherchePlatsPanneau = "";

  function platsAffiches() {
    let liste = filtreRepasPanneau === "tous" ? etat.plats : etat.plats.filter((p) => p.repas === filtreRepasPanneau);
    if (filtreFavorisPanneau) liste = liste.filter((p) => p.favori);
    // Réalisable avec le stock qui RESTERA à ce moment-là, une fois servis
    // les repas déjà prévus avant (voir etatAvecStockProjete) — pas le stock
    // d'aujourd'hui : 2 compotes en stock, prévues lundi et mardi → plus
    // proposée mercredi (cas testé par Qassim).
    if (filtreRealisablePanneau) {
      const etatProjete = etatAvecStockProjete(etat, dateISO, creneau);
      liste = liste.filter((p) => platEstRealisableAvecStock(etatProjete, p.id));
    }
    if (etiquettesSelectionneesPanneau.size > 0) {
      liste = liste.filter((p) => [...etiquettesSelectionneesPanneau].every((id) => p.etiquettes.includes(id)));
    }
    const recherche = normaliserRecherche(recherchePlatsPanneau.trim());
    if (recherche) {
      liste = liste.filter((p) => normaliserRecherche(p.nom).includes(recherche));
    }
    return trierParNom(liste);
  }

  function rendreListePlatsPanneau() {
    const listePlatsEl = panneauPlatEl.querySelector("#liste-plats");
    listePlatsEl.innerHTML = "";
    for (const plat of platsAffiches()) {
      const item = document.createElement("button");
      item.className = "plat-choix";
      if (candidat && candidat.platId === plat.id) item.classList.add("selectionne");
      item.textContent = plat.nom;
      item.addEventListener("click", () => {
        candidat = { platId: plat.id, portions: 1 };
        rendrePanneau();
        // Portions + boutons "Ajouter" sont sous la liste : on y amène
        // directement, sinon il fallait défiler pour les trouver (et on ne
        // voyait pas que le choix avait été pris en compte).
        panneauPlatEl.querySelector("#zone-candidat")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      listePlatsEl.appendChild(item);
    }
  }

  // --- Panneau "Plus de filtres" imbriqué (repas/étiquettes) : comme sur
  // l'écran Plats & repas, regroupés à part plutôt qu'empilés directement
  // ici (retour de Qassim : même souci de place que sur Plats & repas).
  // Favoris et Réalisable avec mon stock, eux, sont directement cliquables
  // sur le panneau créneau (voir rendrePanneau) — pas cachés ici. Le ✕ de CE
  // panneau revient au panneau créneau (rendrePanneau), pas à l'écran
  // Semaine — voir apresFermeturePanneau, qui reste réglé sur
  // rendreEcranSemaine pour la fermeture complète (backdrop). ---
  function ouvrirPanneauFiltresCreneau() {
    function rendreFiltres() {
      panneauPlatEl.innerHTML = `
        <div class="panneau-entete">
          <span class="panneau-titre">➕ Plus de filtres</span>
          <button class="panneau-fermer" aria-label="Fermer">✕</button>
        </div>

        <div class="panneau-section-titre">Repas</div>
        <div class="puces" id="panneau-filtres-repas-creneau"></div>
        <button class="bouton-discret" id="panneau-gerer-repas-creneau">⚙️ Gérer les repas</button>

        <div class="panneau-section-titre">Étiquettes</div>
        <div class="puces" id="panneau-filtres-etiquettes-creneau"></div>
        <button class="bouton-discret" id="panneau-gerer-etiquettes-creneau">⚙️ Gérer les étiquettes</button>
      `;

      const filtresRepasEl = panneauPlatEl.querySelector("#panneau-filtres-repas-creneau");
      construireListeChoixEl(filtresRepasEl, "puce", etat.repas, (id) => id === filtreRepasPanneau, (repasId) => {
        filtreRepasPanneau = repasId;
        rendreFiltres();
      });
      const boutonTous = document.createElement("button");
      boutonTous.className = "puce";
      if (filtreRepasPanneau === "tous") boutonTous.classList.add("selectionne");
      boutonTous.textContent = "Tous";
      boutonTous.addEventListener("click", () => {
        filtreRepasPanneau = "tous";
        rendreFiltres();
      });
      filtresRepasEl.prepend(boutonTous);
      panneauPlatEl.querySelector("#panneau-gerer-repas-creneau").addEventListener("click", () => {
        ouvrirPanneauGererRepas(() => ouvrirPanneauFiltresCreneau(), rendreEcranSemaine);
      });

      construireListeChoixEl(
        panneauPlatEl.querySelector("#panneau-filtres-etiquettes-creneau"),
        "puce",
        etat.etiquettes,
        (id) => etiquettesSelectionneesPanneau.has(id),
        (etiquetteId) => {
          if (etiquettesSelectionneesPanneau.has(etiquetteId)) etiquettesSelectionneesPanneau.delete(etiquetteId);
          else etiquettesSelectionneesPanneau.add(etiquetteId);
          rendreFiltres();
        }
      );
      panneauPlatEl.querySelector("#panneau-gerer-etiquettes-creneau").addEventListener("click", () => {
        ouvrirPanneauGererEtiquettes(() => ouvrirPanneauFiltresCreneau(), rendreEcranSemaine);
      });

      panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", () => rendrePanneau());
    }

    rendreFiltres();
    panneauFondEl.hidden = false;
    panneauPlatEl.hidden = false;
  }

  // --- Panneau "Voir la recette" (lecture seule) : accessible depuis un
  // plat déjà prévu, pour lire la recette (ingrédients, étapes, matériel)
  // sans risquer de la modifier par inadvertance en défilant — retour de
  // Qassim, il ne veut pas atterrir dans un champ éditable juste en
  // regardant quoi cuisiner. Les quantités sont recalculées pour le nombre
  // de portions choisi CE jour-là (pas celui de la recette d'origine). La
  // case "🍽️ Mangé" reste accessible ici aussi, pour cocher juste après
  // avoir suivi la recette sans redescendre dans la liste "Plats prévus".
  function ouvrirPanneauRecetteLectureSeule(elementId) {
    function rendreRecette() {
      const element = obtenirElementsEffectifs(etat, dateISO, creneau).find((e) => e.id === elementId);
      if (!element) {
        // Retiré entre-temps (ex. depuis un autre onglet) : rien à montrer.
        rendrePanneau();
        return;
      }

      const plat = etat.plats.find((p) => p.id === element.platId);
      const nomsMateriel = plat.materiel.map((id) => etat.materiel.find((m) => m.id === id)?.nom).filter(Boolean);
      const tempsTotal = plat.tempsPreparation + plat.tempsCuisson;
      // Stock restant après les repas prévus AVANT celui-ci (voir etatAvecStockProjete).
      const manquants = element.cuisine
        ? []
        : ingredientsManquantsPourPlat(
            etatAvecStockProjete(etat, dateISO, creneau, { avantElementId: element.id }),
            element.platId,
            element.portions
          );
      const texteManquants = manquants.length > 0
        ? texteIngredientsManquants(manquants)
        : "";
      const detailMorceaux = [
        `${element.portions} portion${element.portions > 1 ? "s" : ""}`,
        tempsTotal > 0 ? `${tempsTotal} min` : null,
        nomsMateriel.length > 0 ? nomsMateriel.join(", ") : null,
      ].filter(Boolean);

      panneauPlatEl.innerHTML = `
        <div class="panneau-entete">
          <span class="panneau-titre">📖 ${plat.nom}</span>
          <button class="panneau-fermer" aria-label="Fermer">✕</button>
        </div>

        <p class="panneau-note">${detailMorceaux.join(" · ")}</p>

        <div class="panneau-section-titre">Ingrédients</div>
        <div id="recette-ingredients"></div>

        ${plat.etapes ? `
          <div class="panneau-section-titre">Étapes</div>
          <p class="panneau-note" style="white-space: pre-line;">${plat.etapes}</p>
        ` : ""}

        ${texteManquants ? `<p class="panneau-note" style="color:#c0392b;">${texteManquants}</p>` : ""}

        <label class="segmente-bouton" style="display:flex; align-items:center; gap:8px; justify-content:flex-start; margin-top:8px;">
          <input type="checkbox" id="recette-cuisine" ${element.cuisine ? "checked" : ""}>
          🍽️ Mangé (déduit le stock)
        </label>
      `;

      const listeIngredientsEl = panneauPlatEl.querySelector("#recette-ingredients");
      listeIngredientsEl.innerHTML = plat.ingredients.length === 0
        ? `<p class="panneau-vide">Aucun ingrédient renseigné.</p>`
        : plat.ingredients.map((ligne) => {
            const ingredient = etat.ingredients.find((i) => i.id === ligne.ingredientId);
            const quantite = ligne.quantitePortion * element.portions;
            // Ligne en cuillères : on rappelle l'équivalent en g/ml entre
            // parenthèses, le même chiffre que l'alerte "Il manque" et la
            // liste de courses (sinon "1 c. à café" ici et "5 g" là-bas
            // semblent se contredire).
            const equivalent = ingredient && ligne.unite !== ingredient.unite
              ? ` (${formaterQuantite(convertirVersUniteStock(quantite, ligne.unite, ingredient), ingredient.unite)})`
              : "";
            return `<p class="panneau-note">${formaterQuantite(quantite, ligne.unite)}${equivalent} — ${ingredient ? ingredient.nom : ligne.ingredientId}</p>`;
          }).join("");

      panneauPlatEl.querySelector("#recette-cuisine").addEventListener("change", (evenement) => {
        definirCuisine(etat, dateISO, creneau, elementId, evenement.target.checked);
        sauvegarder();
        rendreRecette();
      });
      panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", () => rendrePanneau());
    }

    rendreRecette();
    panneauFondEl.hidden = false;
    panneauPlatEl.hidden = false;
  }

  function rendrePanneau() {
    const elements = obtenirElementsEffectifs(etat, dateISO, creneau);

    panneauPlatEl.innerHTML = `
      <div class="panneau-entete">
        <span class="panneau-titre">${infos.icone} ${infos.label} — ${joursMoisLisible(dateISO)}</span>
        <button class="panneau-fermer" aria-label="Fermer">✕</button>
      </div>

      <div class="panneau-section-titre">Plats prévus</div>
      <div class="liste-elements" id="liste-elements"></div>
      ${elements.length === 0 ? `<p class="panneau-vide">Rien de prévu pour l'instant.</p>` : ""}

      <div class="panneau-section-titre">Ajouter un plat</div>
      <input type="search" id="recherche-plats-panneau" class="champ-texte" style="margin-bottom:8px;" placeholder="🔍 Chercher un plat..." value="${recherchePlatsPanneau}">
      <div class="puces" style="margin-bottom:8px;">
        <button class="puce" id="panneau-filtre-favoris-rapide" type="button">⭐ Favoris</button>
        <button class="puce" id="panneau-filtre-realisable-rapide" type="button">🧺 Réalisable</button>
        <button class="puce" id="ouvrir-filtres-panneau" type="button">➕ Filtres<span id="filtres-panneau-compte"></span></button>
      </div>
      <p class="panneau-note" id="filtres-panneau-resume" style="margin:0 0 8px;"></p>
      <div class="liste-plats liste-resultats" id="liste-plats"></div>

      <div id="zone-candidat"></div>
    `;

    // Ne reconstruit QUE la liste de résultats (pas tout le panneau) à
    // chaque lettre tapée, sinon le champ perdrait le focus en boucle.
    panneauPlatEl.querySelector("#recherche-plats-panneau").addEventListener("input", (evenement) => {
      recherchePlatsPanneau = evenement.target.value;
      rendreListePlatsPanneau();
    });

    // ⭐ Favoris et 🧺 Réalisable avec mon stock : directement cliquables ici
    // (pas cachés dans "➕ Plus de filtres", demandé par Qassim) — même
    // principe que sur l'écran Plats & repas.
    const favorisRapideEl = panneauPlatEl.querySelector("#panneau-filtre-favoris-rapide");
    favorisRapideEl.classList.toggle("selectionne", filtreFavorisPanneau);
    favorisRapideEl.addEventListener("click", () => {
      filtreFavorisPanneau = !filtreFavorisPanneau;
      rendrePanneau();
    });
    const realisableRapideEl = panneauPlatEl.querySelector("#panneau-filtre-realisable-rapide");
    realisableRapideEl.classList.toggle("selectionne", filtreRealisablePanneau);
    realisableRapideEl.addEventListener("click", () => {
      filtreRealisablePanneau = !filtreRealisablePanneau;
      rendrePanneau();
    });

    // --- Bouton "Plus de filtres" (repas à choix unique, étiquettes à choix
    // multiple ET — mêmes filtres que l'écran Plats & repas, regroupés dans
    // un panneau à part pour ne pas prendre trop de place ici — voir
    // CLAUDE.md § Repas/Étiquettes éditables) ---
    // Le repas du créneau, présélectionné d'office, ne compte PAS comme un
    // filtre "actif" (sinon le badge affichait déjà (1) sans rien avoir
    // touché, trompeur) : seul ce que Qassim a changé lui-même compte. Ce qui
    // filtre la liste reste écrit en toutes lettres juste en dessous.
    const nbFiltresActifs = (filtreRepasPanneau !== infos.repasId ? 1 : 0) + etiquettesSelectionneesPanneau.size;
    panneauPlatEl.querySelector("#filtres-panneau-compte").textContent = nbFiltresActifs > 0 ? ` (${nbFiltresActifs})` : "";
    const nomRepasFiltre = filtreRepasPanneau === "tous"
      ? "tous les repas"
      : etat.repas.find((r) => r.id === filtreRepasPanneau)?.nom ?? filtreRepasPanneau;
    const nomsEtiquettesFiltre = [...etiquettesSelectionneesPanneau]
      .map((id) => etat.etiquettes.find((e) => e.id === id)?.nom)
      .filter(Boolean);
    panneauPlatEl.querySelector("#filtres-panneau-resume").textContent =
      `Affiché : ${nomRepasFiltre}${nomsEtiquettesFiltre.length > 0 ? ` · ${nomsEtiquettesFiltre.join(" + ")}` : ""}`;
    panneauPlatEl.querySelector("#ouvrir-filtres-panneau").addEventListener("click", () => {
      ouvrirPanneauFiltresCreneau();
    });

    // --- Liste des plats déjà prévus (chacun modifiable/retirable) ---
    const listeElementsEl = panneauPlatEl.querySelector("#liste-elements");
    for (const element of elements) {
      const ligne = document.createElement("div");
      ligne.className = "element-prevu";

      // Stock restant après les repas prévus AVANT celui-ci (voir etatAvecStockProjete).
      const manquants = element.cuisine
        ? []
        : ingredientsManquantsPourPlat(
            etatAvecStockProjete(etat, dateISO, creneau, { avantElementId: element.id }),
            element.platId,
            element.portions
          );
      const texteManquants = manquants.length > 0
        ? texteIngredientsManquants(manquants)
        : "";

      ligne.innerHTML = `
        <div class="element-prevu-ligne1">
          <span class="element-nom">${nomPlat(element.platId)}</span>
          <button class="element-retirer" aria-label="Retirer">✕</button>
        </div>
        <div class="element-prevu-ligne2">
          <div class="stepper stepper-compact">
            <button class="stepper-bouton" data-action="moins" aria-label="Moins de portions">−</button>
            <span class="stepper-valeur">${element.portions} portion${element.portions > 1 ? "s" : ""}</span>
            <button class="stepper-bouton" data-action="plus" aria-label="Plus de portions">+</button>
          </div>
          <button class="bouton-secondaire bouton-petit" data-action="voir-recette">📖 Recette</button>
        </div>
        ${texteManquants ? `<p class="panneau-note" style="color:#c0392b;">${texteManquants}</p>` : ""}
        <label class="segmente-bouton" style="display:flex; align-items:center; gap:8px; justify-content:flex-start; margin-top:8px;">
          <input type="checkbox" class="element-cuisine" ${element.cuisine ? "checked" : ""}>
          🍽️ Mangé (déduit le stock)
        </label>
      `;

      ligne.querySelector('[data-action="voir-recette"]').addEventListener("click", () => {
        ouvrirPanneauRecetteLectureSeule(element.id);
      });
      ligne.querySelector(".element-cuisine").addEventListener("change", (evenement) => {
        definirCuisine(etat, dateISO, creneau, element.id, evenement.target.checked);
        sauvegarder();
        rendrePanneau();
      });
      ligne.querySelector(".element-retirer").addEventListener("click", () => {
        retirerElementDuJour(etat, dateISO, creneau, element.id);
        sauvegarder();
        rendrePanneau();
      });
      ligne.querySelector('[data-action="moins"]').addEventListener("click", () => {
        modifierElementDuJour(etat, dateISO, creneau, element.id, { portions: Math.max(0, element.portions - 1) });
        sauvegarder();
        rendrePanneau();
      });
      ligne.querySelector('[data-action="plus"]').addEventListener("click", () => {
        modifierElementDuJour(etat, dateISO, creneau, element.id, { portions: element.portions + 1 });
        sauvegarder();
        rendrePanneau();
      });

      listeElementsEl.appendChild(ligne);
    }

    // --- Liste des plats à ajouter --- (fonction à part : appelée seule
    // depuis la recherche, pour ne pas reconstruire tout le panneau à
    // chaque lettre tapée et perdre le focus du champ de recherche)
    rendreListePlatsPanneau();

    // --- Zone du candidat sélectionné (portions, avertissement stock, boutons d'ajout) ---
    const zoneCandidatEl = panneauPlatEl.querySelector("#zone-candidat");
    zoneCandidatEl.className = candidat ? "zone-candidat" : "";
    if (candidat) {
      const manquants = ingredientsManquantsPourPlat(
        etatAvecStockProjete(etat, dateISO, creneau),
        candidat.platId,
        candidat.portions
      );
      const texteManquants = manquants.length > 0
        ? texteIngredientsManquants(manquants)
        : "";

      zoneCandidatEl.innerHTML = `
        <div class="candidat-entete">
          <span class="candidat-nom">✔️ ${nomPlat(candidat.platId)}</span>
          <button class="bouton-discret" id="candidat-annuler">Changer</button>
        </div>
        <div class="panneau-section-titre" style="margin-top:0;">Portions (par personne)</div>
        <div class="stepper">
          <button class="stepper-bouton" id="candidat-moins" aria-label="Moins de portions">−</button>
          <span class="stepper-valeur">${candidat.portions}</span>
          <button class="stepper-bouton" id="candidat-plus" aria-label="Plus de portions">+</button>
        </div>
        ${texteManquants ? `<p class="panneau-note" style="color:#c0392b;">${texteManquants}</p>` : ""}
        <div class="panneau-actions">
          <button class="bouton-principal" id="ajouter-jour">Ajouter juste ce jour</button>
          <button class="bouton-secondaire" id="ajouter-propager">Ajouter et en faire le défaut du ${jourLabel}</button>
        </div>
        <p class="panneau-note">
          "Défaut du ${jourLabel}" s'applique à tous les ${jourLabel} futurs pas encore
          consultés — pas aux autres jours de la semaine.
        </p>
      `;

      zoneCandidatEl.querySelector("#candidat-annuler").addEventListener("click", () => {
        candidat = null;
        rendrePanneau();
        panneauPlatEl.querySelector("#liste-plats")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      zoneCandidatEl.querySelector("#candidat-moins").addEventListener("click", () => {
        candidat.portions = Math.max(0, candidat.portions - 1);
        rendrePanneau();
      });
      zoneCandidatEl.querySelector("#candidat-plus").addEventListener("click", () => {
        candidat.portions += 1;
        rendrePanneau();
      });

      zoneCandidatEl.querySelector("#ajouter-jour").addEventListener("click", () => {
        ajouterPlatAuJour(etat, dateISO, creneau, candidat, false);
        sauvegarder();
        candidat = null;
        rendrePanneau();
      });
      zoneCandidatEl.querySelector("#ajouter-propager").addEventListener("click", () => {
        ajouterPlatAuJour(etat, dateISO, creneau, candidat, true);
        sauvegarder();
        candidat = null;
        rendrePanneau();
      });
    } else {
      zoneCandidatEl.innerHTML = "";
    }

    panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", fermerPanneau);
  }

  rendrePanneau();
  panneauFondEl.hidden = false;
  panneauPlatEl.hidden = false;
}

// ============================================================
// Écran Courses
// ============================================================

// Articles cochés "Acheté" PENDANT cette visite de l'écran (pas persisté) :
// ingredientId → quantité ajoutée au stock. Sert à garder l'article visible
// et barré en bas de son rayon jusqu'à ce que Qassim quitte l'écran, plutôt
// que de le faire disparaître instantanément (décision prise avec lui).
const achetesSession = new Map();

// Quantité changée à la main (−/+ ou clavier) PENDANT cette visite de
// l'écran, pas encore cochée "Acheté" : ingredientId → quantité. Sert à ne
// pas la perdre quand la liste se redessine (ex. après avoir coché un autre
// article). Ex. la liste dit 2 carottes, Qassim en prend 3 : il met 3 puis
// coche, et c'est 3 qui entre dans le stock.
const quantitesModifieesSession = new Map();

// Rayons repliés PENDANT cette visite de l'écran (pas persisté non plus) :
// un rayon replié doit le rester quand la liste se redessine après une
// coche, sinon Qassim devrait tout replier à nouveau à chaque action.
const rayonsReplies = new Set();

// Pas de gestion des rayons ici (plus de ✏️ par rayon ni de "+ Ajouter un
// rayon") : pendant les courses, ce n'est jamais le geste utile — ça se fait
// depuis Stock ou le Catalogue ("⚙️ Gérer les rayons", voir CLAUDE.md
// § Rayons éditables).

// "⚠️ Il manque : Pain de mie (2 pièces), Œufs (1 pièce)" — même texte
// partout (panneau créneau, candidat, recette en lecture seule).
function texteIngredientsManquants(manquants) {
  return `⚠️ Il manque : ${manquants.map((m) => `${m.nom} (${formaterQuantite(m.manque, m.unite)})`).join(", ")}`;
}

function formaterNombre(n) {
  const arrondi = Math.round(n * 10) / 10;
  return String(arrondi);
}

// Trie une copie de la liste par nom (ordre alphabétique français, insensible
// à la casse et aux accents) — sert à retrouver plus vite quelque chose dans
// une grande liste (ingrédients d'un rayon, plats...), sans modifier
// l'original (Qassim peut toujours réordonner ses rayons eux-mêmes, voir
// CLAUDE.md § Rayons et articles non-alimentaires : cet ordre-là, lui, est
// volontaire et ne doit jamais être alphabétisé).
function trierParNom(liste) {
  return [...liste].sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));
}

const listeCoursesEl = document.getElementById("liste-courses");

function rendreEcranCourses() {
  const liste = construireListeCourses(etat, new Date());

  // On ajoute les articles achetés pendant cette session mais qui ont
  // disparu du calcul (normal : ils ne sont plus "à acheter" une fois le
  // stock reconstitué), pour qu'ils restent visibles, barrés, en bas.
  const idsEnListe = new Set(liste.map((a) => a.ingredientId));
  for (const [ingredientId, quantiteAjoutee] of achetesSession) {
    if (idsEnListe.has(ingredientId)) continue;
    const ingredient = etat.ingredients.find((i) => i.id === ingredientId);
    if (!ingredient) continue;
    liste.push({
      ingredientId,
      nom: ingredient.nom,
      rayon: ingredient.rayon,
      unite: ingredient.unite,
      aAcheter: quantiteAjoutee,
      detail: [],
    });
  }

  listeCoursesEl.innerHTML = "";

  if (liste.length === 0) {
    listeCoursesEl.innerHTML = `<p class="liste-vide">Rien à acheter pour l'instant.<br>
      Prévois des plats dans Semaine, ou ajoute une envie avec "+ Ajouter un extra".</p>`;
    return;
  }

  // Avancement pendant les courses : "3 / 6 dans le panier".
  const nbAchetes = liste.filter((a) => achetesSession.has(a.ingredientId)).length;
  const progression = document.createElement("p");
  progression.className = "courses-progression";
  progression.textContent = nbAchetes === liste.length
    ? `✅ Tout est dans le panier (${liste.length}/${liste.length})`
    : `🛒 ${nbAchetes} / ${liste.length} dans le panier`;
  listeCoursesEl.appendChild(progression);

  for (const rayon of etat.rayons) {
    const articles = trierParNom(liste.filter((a) => a.rayon === rayon.id));
    if (articles.length === 0) continue;

    // Pas encore achetés d'abord, achetés (cette session) en bas — le tri
    // par nom juste au-dessus reste stable à l'intérieur de chaque groupe.
    articles.sort((a, b) => {
      const aAchete = achetesSession.has(a.ingredientId) ? 1 : 0;
      const bAchete = achetesSession.has(b.ingredientId) ? 1 : 0;
      return aAchete - bAchete;
    });

    // <details> : repliable nativement, sans JS pour l'ouverture/fermeture.
    // Le nombre d'articles reste visible dans le titre même replié.
    const groupe = document.createElement("details");
    groupe.className = "rayon-groupe";
    groupe.open = !rayonsReplies.has(rayon.id);
    groupe.addEventListener("toggle", () => {
      if (groupe.open) rayonsReplies.delete(rayon.id);
      else rayonsReplies.add(rayon.id);
    });
    const summary = document.createElement("summary");
    summary.className = "rayon-titre";
    summary.innerHTML = `
      <span class="rayon-titre-texte">${rayon.nom} <span class="rayon-compte">${articles.length}</span></span>
    `;
    groupe.appendChild(summary);

    const articlesEl = document.createElement("div");
    articlesEl.className = "rayon-articles";

    for (const article of articles) {
      const achete = achetesSession.has(article.ingredientId);
      const ingredientArticle = etat.ingredients.find((i) => i.id === article.ingredientId);
      const pas = pasStock(article.unite);
      // Déjà acheté : on montre ce qui a réellement été ajouté au stock.
      // Sinon : la quantité changée à la main s'il y en a une, sinon le calcul.
      const quantiteAffichee = achete
        ? achetesSession.get(article.ingredientId)
        : quantitesModifieesSession.get(article.ingredientId) ?? article.aAcheter;
      const ligne = document.createElement("div");
      ligne.className = `article-course${achete ? " achete" : ""}`;
      // Juste le nom : plus de ligne de détail en dessous ("Blanquette de
      // poulet : 1,5 pièce"...) — retour de Qassim, "moi j'ai juste mes
      // courses". −/+ autour de la quantité pour l'ajuster en magasin avant
      // de cocher (ex. 3 carottes au lieu de 2).
      ligne.innerHTML = `
        <input type="checkbox" class="article-checkbox" aria-label="Acheté" ${achete ? "checked" : ""}>
        <div class="article-info">
          <span class="article-nom">${article.nom}</span>
        </div>
        <div class="stepper stepper-compact">
          <button type="button" class="stepper-bouton" data-action="moins" aria-label="Moins de ${article.nom}" ${achete ? "disabled" : ""}>−</button>
          <label class="stepper-saisie">
            <input type="number" inputmode="decimal" class="stepper-saisie-input" value="${formaterNombre(quantiteAffichee)}" min="0" step="any" aria-label="Quantité de ${article.nom}" ${achete ? "disabled" : ""}>
            <span class="article-unite">${article.unite}</span>
          </label>
          <button type="button" class="stepper-bouton" data-action="plus" aria-label="Plus de ${article.nom}" ${achete ? "disabled" : ""}>+</button>
        </div>
      `;

      const caseACocher = ligne.querySelector(".article-checkbox");
      const champQuantite = ligne.querySelector(".stepper-saisie-input");

      // −/+ ne redessinent que ce champ (pas toute la liste) : rien ne saute
      // à l'écran pendant qu'on ajuste en magasin.
      function changerQuantite(nouvelleQuantite) {
        const quantite = Math.max(0, nouvelleQuantite);
        quantitesModifieesSession.set(article.ingredientId, quantite);
        champQuantite.value = formaterNombre(quantite);
      }
      ligne.querySelector('[data-action="moins"]').addEventListener("click", () => {
        changerQuantite(clampPositif(champQuantite.value) - pas);
      });
      ligne.querySelector('[data-action="plus"]').addEventListener("click", () => {
        changerQuantite(clampPositif(champQuantite.value) + pas);
      });
      champQuantite.addEventListener("focus", () => champQuantite.select());
      champQuantite.addEventListener("change", () => {
        changerQuantite(clampPositif(champQuantite.value));
      });

      caseACocher.addEventListener("change", () => {
        const ingredient = ingredientArticle;
        if (caseACocher.checked) {
          // 0 volontaire (rien trouvé en magasin) : on n'ajoute rien, mais
          // l'article est quand même coché.
          const quantite = clampPositif(champQuantite.value);
          marquerAchete(ingredient, quantite);
          achetesSession.set(article.ingredientId, quantite);
          quantitesModifieesSession.delete(article.ingredientId);
        } else {
          // On décoche : correction d'erreur, on retire du stock exactement
          // ce qui avait été ajouté.
          const quantiteAjoutee = achetesSession.get(article.ingredientId) ?? 0;
          ingredient.enStock -= quantiteAjoutee;
          achetesSession.delete(article.ingredientId);
        }
        sauvegarder();
        rendreEcranCourses();
      });

      articlesEl.appendChild(ligne);
    }

    groupe.appendChild(articlesEl);
    listeCoursesEl.appendChild(groupe);
  }
}

// --- Panneau "ajouter un extra" : passe par le Catalogue (recherche +
// rayons, voir CLAUDE.md § Écran Catalogue) pour retrouver un ingrédient
// qu'on n'a pas à la maison, puis une étape quantité dédiée. ---

document.getElementById("ajouter-extra").addEventListener("click", () => {
  ouvrirPanneauCatalogue(rendreEcranCourses, ouvrirPanneauExtraPourIngredient);
});

function ouvrirPanneauExtraPourIngredient(ingredientId, retour = fermerPanneau) {
  let quantite = 1;

  function rendrePanneau() {
    const ingredient = etat.ingredients.find((i) => i.id === ingredientId);
    panneauPlatEl.innerHTML = `
      <div class="panneau-entete">
        <span class="panneau-titre">🛒 Ajouter un extra</span>
        <button class="panneau-fermer" aria-label="Fermer">✕</button>
      </div>

      <div class="panneau-section-titre">${ingredient.nom} (${ingredient.unite})</div>
      <div class="stepper">
        <button class="stepper-bouton" id="extra-moins" aria-label="Moins">−</button>
        <span class="stepper-valeur">${quantite}</span>
        <button class="stepper-bouton" id="extra-plus" aria-label="Plus">+</button>
      </div>
      <div class="panneau-actions">
        <button class="bouton-principal" id="extra-ajouter">Ajouter cet extra</button>
      </div>
    `;

    panneauPlatEl.querySelector("#extra-moins").addEventListener("click", () => {
      quantite = Math.max(0, quantite - 1);
      rendrePanneau();
    });
    panneauPlatEl.querySelector("#extra-plus").addEventListener("click", () => {
      quantite += 1;
      rendrePanneau();
    });
    panneauPlatEl.querySelector("#extra-ajouter").addEventListener("click", () => {
      ingredient.extra = clampPositif(ingredient.extra) + quantite;
      sauvegarder();
      retour();
    });
    panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", retour);
  }

  rendrePanneau();
  panneauFondEl.hidden = false;
  panneauPlatEl.hidden = false;
}

// ============================================================
// Écran Stock
// ============================================================

// Pas de pas fixe pour tous les ingrédients : 50 g/ml (trop long à ajuster
// gramme par gramme), 1 pour tout le reste (pièce, gousse, tranche...).
function pasStock(unite) {
  return unite === "g" || unite === "ml" ? 50 : 1;
}

const ETAT_STOCK_INFOS = {
  vide: { icone: "⚪", label: "Vide" },
  bas: { icone: "🟠", label: "Bas" },
  ok: { icone: "🟢", label: "OK" },
};

let filtreStock = "tous";
const rayonsRepliesStock = new Set();

const listeStockEl = document.getElementById("liste-stock");
const filtresStockEl = document.getElementById("filtres-stock");

filtresStockEl.querySelectorAll(".segmente-bouton").forEach((bouton) => {
  bouton.addEventListener("click", () => {
    filtreStock = bouton.dataset.filtre;
    rendreEcranStock();
  });
});

// Un seul bouton "⚙️ Gérer les rayons" (renommer/supprimer/ajouter), au lieu
// d'un ✏️ sur chaque rayon — même principe que "⚙️ Gérer les repas/
// étiquettes/matériel" (retour de Qassim : trop de crayons). Il liste TOUS
// les rayons, même vides : plus besoin de l'ancien "👁️ Voir les rayons vides".
document.getElementById("gerer-rayons-stock").addEventListener("click", () => {
  ouvrirPanneauGererRayons(fermerPanneau, rendreEcranStock);
});

function ouvrirPanneauGererRayons(retour = fermerPanneau, ecranSousJacent = rendreEcranStock) {
  ouvrirPanneauGererListe(
    "⚙️ Gérer les rayons",
    () => etat.rayons,
    ouvrirPanneauRayon,
    ouvrirPanneauNouveauRayon,
    "+ Ajouter un rayon",
    retour,
    ecranSousJacent
  );
}

// Une ligne d'ingrédient avec son stock réglable sur place (écran Stock et
// Catalogue ouvert depuis Stock) : +/− pour les petits ajustements, ET la
// valeur elle-même est un champ où taper directement la quantité (ex. 1000 g
// de riz d'un coup, au lieu de 20 appuis sur + de 50 g). Le nom reste un
// bouton à part qui ouvre le panneau complet (essentiel, minimum, rayon...).
function construireLigneStock(ingredient, onOuvrir, apresChangement) {
  const infosEtat = ETAT_STOCK_INFOS[etatStock(ingredient)];
  const pas = pasStock(ingredient.unite);
  const ligne = document.createElement("div");
  ligne.className = "article-course";
  ligne.innerHTML = `
    <span aria-hidden="true">${infosEtat.icone}</span>
    <button type="button" class="article-info article-info-bouton">
      <span class="article-nom">${ingredient.nom}</span>
      <span class="article-detail">${infosEtat.label}${ingredient.essentiel ? " · ⭐ Essentiel" : ""}</span>
    </button>
    <div class="stepper stepper-compact">
      <button type="button" class="stepper-bouton" data-action="moins" aria-label="Moins de ${ingredient.nom}">−</button>
      <label class="stepper-saisie">
        <input type="number" inputmode="decimal" class="stepper-saisie-input" value="${formaterNombre(Math.max(0, ingredient.enStock))}" min="0" step="any" aria-label="Stock de ${ingredient.nom}">
        <span class="article-unite">${ingredient.unite}</span>
      </label>
      <button type="button" class="stepper-bouton" data-action="plus" aria-label="Plus de ${ingredient.nom}">+</button>
    </div>
  `;
  ligne.querySelector(".article-info-bouton").addEventListener("click", onOuvrir);
  ligne.querySelector('[data-action="moins"]').addEventListener("click", () => {
    modifierIngredient(etat, ingredient.id, { enStock: Math.max(0, ingredient.enStock - pas) });
    sauvegarder();
    apresChangement();
  });
  ligne.querySelector('[data-action="plus"]').addEventListener("click", () => {
    modifierIngredient(etat, ingredient.id, { enStock: Math.max(0, ingredient.enStock) + pas });
    sauvegarder();
    apresChangement();
  });
  const champ = ligne.querySelector(".stepper-saisie-input");
  // Tout sélectionner au toucher : on tape directement la nouvelle valeur.
  champ.addEventListener("focus", () => champ.select());
  champ.addEventListener("change", () => {
    modifierIngredient(etat, ingredient.id, { enStock: champ.value });
    sauvegarder();
    apresChangement();
  });
  return ligne;
}

function ingredientsFiltres() {
  switch (filtreStock) {
    case "essentiels":
      return etat.ingredients.filter((i) => i.essentiel);
    default:
      // À 0, un ingrédient non essentiel n'est plus "en stock" : il disparaît.
      // Un essentiel à 0 reste affiché (vide) pour rappeler de le racheter.
      return etat.ingredients.filter((i) => i.enStock > 0 || i.essentiel);
  }
}

function rendreEcranStock() {
  filtresStockEl.querySelectorAll(".segmente-bouton").forEach((bouton) => {
    bouton.classList.toggle("selectionne", bouton.dataset.filtre === filtreStock);
  });

  const liste = ingredientsFiltres();
  listeStockEl.innerHTML = "";

  if (liste.length === 0) {
    // Écran vide (ex. premier lancement) : on explique quoi faire plutôt
    // qu'un simple "rien à afficher".
    listeStockEl.innerHTML = filtreStock === "essentiels"
      ? `<p class="liste-vide">Aucun essentiel pour l'instant.<br>
          Un essentiel, c'est ce que tu veux toujours avoir à la maison (sel, huile,
          dentifrice...) : touche le nom d'un ingrédient puis coche "Essentiel".</p>`
      : `<p class="liste-vide">Ton stock est vide.<br>
          Touche "+ Ajouter un ingrédient" pour noter ce que tu as déjà chez toi —
          il suffit d'appuyer sur + à côté de chaque produit.</p>`;
    return;
  }

  for (const rayon of etat.rayons) {
    const ingredients = trierParNom(liste.filter((i) => i.rayon === rayon.id));
    if (ingredients.length === 0) continue;

    const groupe = document.createElement("details");
    groupe.className = "rayon-groupe";
    groupe.open = !rayonsRepliesStock.has(rayon.id);
    groupe.addEventListener("toggle", () => {
      if (groupe.open) rayonsRepliesStock.delete(rayon.id);
      else rayonsRepliesStock.add(rayon.id);
    });

    const summary = document.createElement("summary");
    summary.className = "rayon-titre";
    summary.innerHTML = `
      <span class="rayon-titre-texte">${rayon.nom} <span class="rayon-compte">${ingredients.length}</span></span>
    `;
    groupe.appendChild(summary);

    const articlesEl = document.createElement("div");
    articlesEl.className = "rayon-articles";

    for (const ingredient of ingredients) {
      articlesEl.appendChild(
        construireLigneStock(ingredient, () => ouvrirPanneauIngredient(ingredient.id), rendreEcranStock)
      );
    }

    groupe.appendChild(articlesEl);
    listeStockEl.appendChild(groupe);
  }
}

// --- Panneau "modifier un ingrédient" ---

function ouvrirPanneauIngredient(ingredientId, retour = fermerPanneau) {
  apresFermeturePanneau = rendreEcranStock;

  function rendrePanneau(messageErreur) {
    const ingredient = etat.ingredients.find((i) => i.id === ingredientId);
    const pas = pasStock(ingredient.unite);

    panneauPlatEl.innerHTML = `
      <div class="panneau-entete">
        <span class="panneau-titre">✏️ Modifier l'ingrédient</span>
        <button class="panneau-fermer" aria-label="Fermer">✕</button>
      </div>

      <div class="panneau-section-titre">Nom</div>
      <input type="text" id="ingredient-nom" class="champ-texte" value="${ingredient.nom}">

      <div class="panneau-section-titre">Rayon</div>
      <div class="puces" id="ingredient-liste-rayons"></div>

      <div class="panneau-section-titre">Stock actuel (${ingredient.unite})</div>
      <div class="stepper">
        <button class="stepper-bouton" id="stock-moins" aria-label="Moins">−</button>
        <input type="number" id="stock-valeur" class="article-quantite-input" value="${formaterNombre(ingredient.enStock)}" min="0" step="any">
        <button class="stepper-bouton" id="stock-plus" aria-label="Plus">+</button>
      </div>

      <div class="panneau-section-titre">Essentiel</div>
      <label class="segmente-bouton" style="display:flex; align-items:center; gap:8px; justify-content:flex-start;">
        <input type="checkbox" id="ingredient-essentiel" ${ingredient.essentiel ? "checked" : ""}>
        Toujours en avoir à la maison
      </label>

      <div class="panneau-section-titre">Minimum à toujours avoir (${ingredient.unite})</div>
      <input type="number" id="ingredient-minimum" class="champ-texte" value="${formaterNombre(ingredient.minimum)}" min="0" step="any">

      ${ingredient.unite === "g" || ingredient.unite === "ml" ? `
        <div class="panneau-section-titre">Équivalence 1 c. à café (en ${ingredient.unite})</div>
        <p class="panneau-note">Optionnel : à régler une fois, permet ensuite de saisir les
          quantités de cet ingrédient dans une recette en cuillères (comme la recette d'origine
          te les donne) plutôt qu'en ${ingredient.unite}.</p>
        <input type="number" id="ingredient-cuillere" class="champ-texte" value="${ingredient.parCuillereACafe ?? ""}" min="0" step="any" placeholder="Ex. 5">
      ` : ""}

      ${messageErreur ? `<p class="panneau-note" style="color:#c0392b;">${messageErreur}</p>` : ""}

      <div class="panneau-actions">
        <button class="bouton-discret" id="ingredient-supprimer">🗑️ Supprimer cet ingrédient</button>
      </div>
    `;

    panneauPlatEl.querySelector("#ingredient-nom").addEventListener("change", (evenement) => {
      modifierIngredient(etat, ingredientId, { nom: evenement.target.value });
      sauvegarder();
      rendrePanneau();
    });

    const listeRayonsIngredientEl = panneauPlatEl.querySelector("#ingredient-liste-rayons");
    for (const rayon of etat.rayons) {
      const item = document.createElement("button");
      item.className = "puce";
      if (rayon.id === ingredient.rayon) item.classList.add("selectionne");
      item.textContent = rayon.nom;
      item.addEventListener("click", () => {
        modifierIngredient(etat, ingredientId, { rayon: rayon.id });
        sauvegarder();
        rendrePanneau();
      });
      listeRayonsIngredientEl.appendChild(item);
    }

    panneauPlatEl.querySelector("#stock-moins").addEventListener("click", () => {
      modifierIngredient(etat, ingredientId, { enStock: Math.max(0, ingredient.enStock - pas) });
      sauvegarder();
      rendrePanneau();
    });
    panneauPlatEl.querySelector("#stock-plus").addEventListener("click", () => {
      modifierIngredient(etat, ingredientId, { enStock: ingredient.enStock + pas });
      sauvegarder();
      rendrePanneau();
    });
    panneauPlatEl.querySelector("#stock-valeur").addEventListener("change", (evenement) => {
      modifierIngredient(etat, ingredientId, { enStock: evenement.target.value });
      sauvegarder();
      rendrePanneau();
    });
    panneauPlatEl.querySelector("#ingredient-essentiel").addEventListener("change", (evenement) => {
      modifierIngredient(etat, ingredientId, { essentiel: evenement.target.checked });
      sauvegarder();
      rendrePanneau();
    });
    panneauPlatEl.querySelector("#ingredient-minimum").addEventListener("change", (evenement) => {
      modifierIngredient(etat, ingredientId, { minimum: evenement.target.value });
      sauvegarder();
      rendrePanneau();
    });
    const champCuillereEl = panneauPlatEl.querySelector("#ingredient-cuillere");
    if (champCuillereEl) {
      champCuillereEl.addEventListener("change", (evenement) => {
        const valeurBrute = evenement.target.value.trim();
        const resultat = modifierIngredient(etat, ingredientId, {
          parCuillereACafe: valeurBrute === "" ? null : valeurBrute,
        });
        if (!resultat.ok) {
          rendrePanneau(`Impossible de retirer cette équivalence : utilisée en cuillères par ${resultat.plats.join(", ")}.`);
          return;
        }
        sauvegarder();
        rendrePanneau();
      });
    }
    panneauPlatEl.querySelector("#ingredient-supprimer").addEventListener("click", () => {
      const resultat = supprimerIngredient(etat, ingredientId);
      if (!resultat.ok) {
        rendrePanneau(`Impossible : utilisé par ${resultat.plats.join(", ")}.`);
        return;
      }
      sauvegarder();
      retour();
    });
    panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", retour);
  }

  rendrePanneau();
  panneauFondEl.hidden = false;
  panneauPlatEl.hidden = false;
}

// --- Panneau "ajouter un ingrédient" ---

document.getElementById("ajouter-ingredient").addEventListener("click", () => ouvrirPanneauCatalogue());

function ouvrirPanneauNouvelIngredient(retour = fermerPanneau) {
  apresFermeturePanneau = rendreEcranStock;
  const nouveau = { nom: "", rayon: null, unite: null };

  function rendrePanneau(messageErreur) {
    panneauPlatEl.innerHTML = `
      <div class="panneau-entete">
        <span class="panneau-titre">➕ Nouvel ingrédient</span>
        <button class="panneau-fermer" aria-label="Fermer">✕</button>
      </div>

      <div class="panneau-section-titre">Nom</div>
      <input type="text" id="nouveau-nom" class="champ-texte" value="${nouveau.nom}" placeholder="Ex. Déodorant">

      <div class="panneau-section-titre">Rayon</div>
      <div class="puces" id="liste-rayons"></div>

      <div class="panneau-section-titre">Unité</div>
      <div class="puces" id="liste-unites"></div>

      ${messageErreur ? `<p class="panneau-note" style="color:#c0392b;">${messageErreur}</p>` : ""}

      <div class="panneau-actions">
        <button class="bouton-principal" id="nouveau-valider">Ajouter</button>
      </div>
    `;

    panneauPlatEl.querySelector("#nouveau-nom").addEventListener("change", (evenement) => {
      nouveau.nom = evenement.target.value;
    });

    const listeRayonsEl = panneauPlatEl.querySelector("#liste-rayons");
    for (const rayon of etat.rayons) {
      const item = document.createElement("button");
      item.className = "puce";
      if (rayon.id === nouveau.rayon) item.classList.add("selectionne");
      item.textContent = rayon.nom;
      item.addEventListener("click", () => {
        nouveau.rayon = rayon.id;
        rendrePanneau();
      });
      listeRayonsEl.appendChild(item);
    }

    const listeUnitesEl = panneauPlatEl.querySelector("#liste-unites");
    for (const unite of UNITES) {
      const item = document.createElement("button");
      item.className = "puce";
      if (unite === nouveau.unite) item.classList.add("selectionne");
      item.textContent = unite;
      item.addEventListener("click", () => {
        nouveau.unite = unite;
        rendrePanneau();
      });
      listeUnitesEl.appendChild(item);
    }

    panneauPlatEl.querySelector("#nouveau-valider").addEventListener("click", () => {
      const nomSaisi = panneauPlatEl.querySelector("#nouveau-nom").value.trim();
      if (!nomSaisi) {
        rendrePanneau("Donne un nom à cet ingrédient.");
        return;
      }
      if (!nouveau.rayon) {
        rendrePanneau("Choisis un rayon.");
        return;
      }
      if (!nouveau.unite) {
        rendrePanneau("Choisis une unité.");
        return;
      }
      ajouterIngredient(etat, { nom: nomSaisi, rayon: nouveau.rayon, unite: nouveau.unite });
      sauvegarder();
      retour();
    });

    panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", retour);
  }

  rendrePanneau();
  panneauFondEl.hidden = false;
  panneauPlatEl.hidden = false;
}

// --- Panneau "Catalogue" : chercher n'importe quel ingrédient (même à 0 g
// ou non essentiel), gérer les rayons, ou créer un tout nouvel ingrédient ---

let rechercheCatalogue = "";
const rayonsRepliesCatalogue = new Set();

// Ignore accents et ligatures (œ, æ) pour que taper "oeufs" trouve "Œufs".
function normaliserRecherche(texte) {
  return texte
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// ecranSousJacent : l'écran à re-afficher quand tout le panneau se ferme
// (Stock par défaut, ou Courses depuis "+ Ajouter un extra").
// onChoisirIngredient(id, retourVersCatalogue) : par défaut, toucher un
// ingrédient ouvre son panneau d'édition habituel (stock/essentiel/minimum).
// Depuis "+ Ajouter un extra", on passe une fonction différente (quantité +
// "Ajouter cet extra") — voir ouvrirPanneauExtraPourIngredient.
// retourPropre : ce que fait le ✕ DU Catalogue lui-même. Par défaut ferme
// tout le panneau (cas Stock/Courses, un seul niveau). Depuis l'éditeur de
// plat (Catalogue ouvert PAR-DESSUS ce panneau), on passe une fonction qui
// revient à l'éditeur au lieu de tout fermer — voir ouvrirPanneauPlat.
function ouvrirPanneauCatalogue(ecranSousJacent = rendreEcranStock, onChoisirIngredient = null, retourPropre = fermerPanneau) {
  apresFermeturePanneau = ecranSousJacent;
  const retourVersCatalogue = () => ouvrirPanneauCatalogue(ecranSousJacent, onChoisirIngredient, retourPropre);

  function rendreListe() {
    const recherche = normaliserRecherche(rechercheCatalogue.trim());
    const ingredients = recherche
      ? etat.ingredients.filter((i) => normaliserRecherche(i.nom).includes(recherche))
      : etat.ingredients;

    const listeEl = panneauPlatEl.querySelector("#catalogue-liste");
    listeEl.innerHTML = "";

    if (ingredients.length === 0) {
      listeEl.innerHTML = `<p class="liste-vide">Aucun ingrédient ne correspond.</p>`;
      return;
    }

    for (const rayon of etat.rayons) {
      const ingredientsDuRayon = trierParNom(ingredients.filter((i) => i.rayon === rayon.id));
      // Un rayon vide reste affiché HORS recherche (CLAUDE.md § Écran
      // Catalogue : seul endroit qui montre systématiquement TOUS les
      // rayons, même vides, sinon impossible d'y ajouter un premier
      // ingrédient ou de le renommer). Pendant une recherche, un rayon sans
      // résultat n'a rien à montrer : on le masque.
      if (recherche !== "" && ingredientsDuRayon.length === 0) continue;

      const groupe = document.createElement("details");
      groupe.className = "rayon-groupe";
      // Pendant une recherche, tout reste ouvert pour voir les résultats.
      groupe.open = recherche !== "" || !rayonsRepliesCatalogue.has(rayon.id);
      groupe.addEventListener("toggle", () => {
        if (groupe.open) rayonsRepliesCatalogue.delete(rayon.id);
        else rayonsRepliesCatalogue.add(rayon.id);
      });

      const summary = document.createElement("summary");
      summary.className = "rayon-titre";
      summary.innerHTML = `
        <span class="rayon-titre-texte">${rayon.nom} <span class="rayon-compte">${ingredientsDuRayon.length}</span></span>
      `;
      groupe.appendChild(summary);

      const articlesEl = document.createElement("div");
      articlesEl.className = "rayon-articles";
      for (const ingredient of ingredientsDuRayon) {
        const infosEtat = ETAT_STOCK_INFOS[etatStock(ingredient)];

        // Depuis Stock (onChoisirIngredient non fourni) : +/− directement sur
        // la ligne pour ajuster le stock sans ouvrir le panneau complet — le
        // geste du quotidien (Qassim change son stock tous les jours, mais
        // ne touche au rayon/essentiel/minimum qu'occasionnellement). Le nom
        // reste un bouton à part, pour garder l'accès à l'édition complète.
        // Depuis Courses ("+ Ajouter un extra") ou l'éditeur d'un plat
        // ("➕ Ajouter un ingrédient"), le stock n'est pas le geste principal :
        // toute la ligne reste cliquable comme avant, pas de +/−.
        if (!onChoisirIngredient) {
          articlesEl.appendChild(
            construireLigneStock(ingredient, () => ouvrirPanneauIngredient(ingredient.id, retourVersCatalogue), rendreListe)
          );
          continue;
        }

        const ligne = document.createElement("button");
        ligne.className = "article-course";
        ligne.innerHTML = `
          <span aria-hidden="true">${infosEtat.icone}</span>
          <div class="article-info">
            <span class="article-nom">${ingredient.nom}</span>
            <span class="article-detail">${infosEtat.label}${ingredient.essentiel ? " · ⭐ Essentiel" : ""}</span>
          </div>
          <div class="article-quantite">
            <span class="article-unite">${formaterQuantite(Math.max(0, ingredient.enStock), ingredient.unite)}</span>
          </div>
        `;
        ligne.addEventListener("click", () => {
          onChoisirIngredient(ingredient.id, retourVersCatalogue);
        });
        articlesEl.appendChild(ligne);
      }
      groupe.appendChild(articlesEl);
      listeEl.appendChild(groupe);
    }
  }

  panneauPlatEl.innerHTML = `
    <div class="panneau-entete">
      <span class="panneau-titre">📚 Catalogue</span>
      <button class="panneau-fermer" aria-label="Fermer">✕</button>
    </div>

    <input type="search" id="catalogue-recherche" class="champ-texte" placeholder="🔍 Chercher un ingrédient..." value="${rechercheCatalogue}">

    <div class="panneau-actions" style="margin: 12px 0;">
      <button class="bouton-secondaire" id="catalogue-nouvel-ingredient">➕ Créer un nouvel ingrédient</button>
      <button class="bouton-secondaire" id="catalogue-gerer-rayons">⚙️ Gérer les rayons</button>
    </div>

    <div id="catalogue-liste"></div>
  `;

  panneauPlatEl.querySelector("#catalogue-recherche").addEventListener("input", (evenement) => {
    rechercheCatalogue = evenement.target.value;
    rendreListe();
  });
  panneauPlatEl.querySelector("#catalogue-nouvel-ingredient").addEventListener("click", () => {
    ouvrirPanneauNouvelIngredient(retourVersCatalogue);
  });
  panneauPlatEl.querySelector("#catalogue-gerer-rayons").addEventListener("click", () => {
    ouvrirPanneauGererRayons(retourVersCatalogue, ecranSousJacent);
  });
  panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", retourPropre);

  rendreListe();
  panneauFondEl.hidden = false;
  panneauPlatEl.hidden = false;
}

// --- Panneau "modifier un rayon" (renommer / supprimer) ---

function ouvrirPanneauRayon(rayonId, retour = fermerPanneau, ecranSousJacent = rendreEcranStock) {
  apresFermeturePanneau = ecranSousJacent;

  function rendrePanneau(messageErreur) {
    const rayon = etat.rayons.find((r) => r.id === rayonId);

    panneauPlatEl.innerHTML = `
      <div class="panneau-entete">
        <span class="panneau-titre">✏️ Modifier le rayon</span>
        <button class="panneau-fermer" aria-label="Fermer">✕</button>
      </div>

      <div class="panneau-section-titre">Nom</div>
      <input type="text" id="rayon-nom" class="champ-texte" value="${rayon.nom}">

      ${messageErreur ? `<p class="panneau-note" style="color:#c0392b;">${messageErreur}</p>` : ""}

      <div class="panneau-actions">
        <button class="bouton-principal" id="rayon-renommer">Enregistrer</button>
        <button class="bouton-discret" id="rayon-supprimer">🗑️ Supprimer ce rayon</button>
      </div>
    `;

    panneauPlatEl.querySelector("#rayon-renommer").addEventListener("click", () => {
      const nouveauNom = panneauPlatEl.querySelector("#rayon-nom").value.trim();
      if (!nouveauNom) {
        rendrePanneau("Donne un nom à ce rayon.");
        return;
      }
      renommerRayon(etat, rayonId, nouveauNom);
      sauvegarder();
      retour();
    });
    panneauPlatEl.querySelector("#rayon-supprimer").addEventListener("click", () => {
      const resultat = supprimerRayon(etat, rayonId);
      if (!resultat.ok) {
        rendrePanneau(`Impossible : contient encore ${resultat.ingredients.join(", ")}.`);
        return;
      }
      sauvegarder();
      retour();
    });
    panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", retour);
  }

  rendrePanneau();
  panneauFondEl.hidden = false;
  panneauPlatEl.hidden = false;
}

// --- Panneau "nouveau rayon" ---

function ouvrirPanneauNouveauRayon(retour = fermerPanneau, ecranSousJacent = rendreEcranStock) {
  apresFermeturePanneau = ecranSousJacent;

  function rendrePanneau(messageErreur) {
    panneauPlatEl.innerHTML = `
      <div class="panneau-entete">
        <span class="panneau-titre">➕ Nouveau rayon</span>
        <button class="panneau-fermer" aria-label="Fermer">✕</button>
      </div>

      <div class="panneau-section-titre">Nom</div>
      <input type="text" id="rayon-nom" class="champ-texte" placeholder="Ex. Marché du dimanche">

      ${messageErreur ? `<p class="panneau-note" style="color:#c0392b;">${messageErreur}</p>` : ""}

      <div class="panneau-actions">
        <button class="bouton-principal" id="rayon-valider">Ajouter</button>
      </div>
    `;

    panneauPlatEl.querySelector("#rayon-valider").addEventListener("click", () => {
      const nom = panneauPlatEl.querySelector("#rayon-nom").value.trim();
      if (!nom) {
        rendrePanneau("Donne un nom à ce rayon.");
        return;
      }
      ajouterRayon(etat, nom);
      sauvegarder();
      retour();
    });
    panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", retour);
  }

  rendrePanneau();
  panneauFondEl.hidden = false;
  panneauPlatEl.hidden = false;
}

// ============================================================
// Écran Plats & repas
// ============================================================

let filtreRepas = "tous"; // "tous" | un id de repas (sélection UNIQUE)
// Favoris est un filtre INDÉPENDANT du repas (une case à part, pas dans la
// même rangée à choix unique) : on doit pouvoir combiner les deux en même
// temps, ex. "Petit-déjeuner" + "Favoris" pour voir ses petits-déjeuners
// favoris — demandé par Qassim (ce n'était pas possible avant, les deux
// étaient dans le même groupe à choix unique).
let filtreFavorisActif = false;
// Même principe, indépendant lui aussi : "qu'est-ce que je peux cuisiner
// avec ce que j'ai déjà ?" (1 portion, stock actuel — voir
// platEstRealisableAvecStock dans calculs.js).
let filtreRealisableActif = false;
// Étiquettes cochées en même temps (logique ET, décidée avec Qassim : un
// plat doit porter TOUTES les étiquettes cochées pour apparaître).
const etiquettesSelectionnees = new Set();
// Matériel coché en même temps (même logique ET que les étiquettes : un
// plat doit demander TOUT le matériel coché pour apparaître).
const materielSelectionnes = new Set();

let recherchePlats = "";

const recherchePlatsEl = document.getElementById("recherche-plats");
const ouvrirFiltresPlatsEl = document.getElementById("ouvrir-filtres-plats");
const filtresPlatsCompteEl = document.getElementById("filtres-plats-compte");
const grillePlatsEl = document.getElementById("grille-plats");
const filtreFavorisRapideEl = document.getElementById("filtre-favoris-rapide");
const filtreRealisableRapideEl = document.getElementById("filtre-realisable-rapide");

ouvrirFiltresPlatsEl.addEventListener("click", () => ouvrirPanneauFiltresPlats());

document.getElementById("ajouter-plat").addEventListener("click", () => {
  ouvrirPanneauNouveauPlat();
});

// ⭐ Favoris et 🧺 Réalisable avec mon stock : demandés par Qassim directement
// cliquables sur l'écran principal (pas cachés dans le panneau Filtres,
// contrairement à Repas/Étiquettes/Matériel) — ce sont les deux filtres du
// quotidien, le reste reste derrière "➕ Plus de filtres" pour ne pas
// surcharger l'écran.
filtreFavorisRapideEl.addEventListener("click", () => {
  filtreFavorisActif = !filtreFavorisActif;
  rendreEcranPlats();
});
filtreRealisableRapideEl.addEventListener("click", () => {
  filtreRealisableActif = !filtreRealisableActif;
  rendreEcranPlats();
});

// --- Panneau "Plus de filtres" (repas + étiquettes + matériel) : regroupés
// dans un panneau à part plutôt qu'empilés sur l'écran principal (trop de
// place prise à l'écran, retour de Qassim) — Favoris et Réalisable avec mon
// stock, eux, sont directement sur l'écran principal (voir ci-dessus). ---

function ouvrirPanneauFiltresPlats() {
  apresFermeturePanneau = rendreEcranPlats;

  function rendrePanneau() {
    panneauPlatEl.innerHTML = `
      <div class="panneau-entete">
        <span class="panneau-titre">➕ Plus de filtres</span>
        <button class="panneau-fermer" aria-label="Fermer">✕</button>
      </div>

      <div class="panneau-section-titre">Repas</div>
      <div class="puces" id="panneau-filtres-repas"></div>
      <button class="bouton-discret" id="panneau-gerer-repas">⚙️ Gérer les repas</button>

      <div class="panneau-section-titre">Étiquettes</div>
      <div class="puces" id="panneau-filtres-etiquettes"></div>
      <button class="bouton-discret" id="panneau-gerer-etiquettes">⚙️ Gérer les étiquettes</button>

      <div class="panneau-section-titre">Matériel</div>
      <div class="puces" id="panneau-filtres-materiel"></div>
      <button class="bouton-discret" id="panneau-gerer-materiel">⚙️ Gérer le matériel</button>
    `;

    panneauPlatEl.querySelector("#panneau-gerer-repas").addEventListener("click", () => {
      ouvrirPanneauGererRepas(() => ouvrirPanneauFiltresPlats(), rendreEcranPlats);
    });
    const filtresRepasEl = panneauPlatEl.querySelector("#panneau-filtres-repas");
    construireListeChoixEl(filtresRepasEl, "puce", etat.repas, (id) => id === filtreRepas, (repasId) => {
      filtreRepas = repasId;
      rendrePanneau();
    });
    // "Tous" n'est pas un vrai repas éditable : ajouté à part, en tête.
    const boutonTous = document.createElement("button");
    boutonTous.className = "puce";
    if (filtreRepas === "tous") boutonTous.classList.add("selectionne");
    boutonTous.textContent = "Tous";
    boutonTous.addEventListener("click", () => {
      filtreRepas = "tous";
      rendrePanneau();
    });
    filtresRepasEl.prepend(boutonTous);

    panneauPlatEl.querySelector("#panneau-gerer-etiquettes").addEventListener("click", () => {
      ouvrirPanneauGererEtiquettes(() => ouvrirPanneauFiltresPlats(), rendreEcranPlats);
    });
    construireListeChoixEl(
      panneauPlatEl.querySelector("#panneau-filtres-etiquettes"),
      "puce",
      etat.etiquettes,
      (id) => etiquettesSelectionnees.has(id),
      (etiquetteId) => {
        if (etiquettesSelectionnees.has(etiquetteId)) etiquettesSelectionnees.delete(etiquetteId);
        else etiquettesSelectionnees.add(etiquetteId);
        rendrePanneau();
      }
    );

    panneauPlatEl.querySelector("#panneau-gerer-materiel").addEventListener("click", () => {
      ouvrirPanneauGererMateriel(() => ouvrirPanneauFiltresPlats(), rendreEcranPlats);
    });
    construireListeChoixEl(
      panneauPlatEl.querySelector("#panneau-filtres-materiel"),
      "puce",
      etat.materiel,
      (id) => materielSelectionnes.has(id),
      (materielId) => {
        if (materielSelectionnes.has(materielId)) materielSelectionnes.delete(materielId);
        else materielSelectionnes.add(materielId);
        rendrePanneau();
      }
    );

    panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", fermerPanneau);
  }

  rendrePanneau();
  panneauFondEl.hidden = false;
  panneauPlatEl.hidden = false;
}

function platsFiltres() {
  let liste = filtreRepas === "tous" ? etat.plats : etat.plats.filter((p) => p.repas === filtreRepas);

  if (filtreFavorisActif) liste = liste.filter((p) => p.favori);
  if (filtreRealisableActif) liste = liste.filter((p) => platEstRealisableAvecStock(etat, p.id));

  if (etiquettesSelectionnees.size > 0) {
    liste = liste.filter((p) => [...etiquettesSelectionnees].every((id) => p.etiquettes.includes(id)));
  }
  if (materielSelectionnes.size > 0) {
    liste = liste.filter((p) => [...materielSelectionnes].every((id) => p.materiel.includes(id)));
  }
  const recherche = normaliserRecherche(recherchePlats.trim());
  if (recherche) {
    liste = liste.filter((p) => normaliserRecherche(p.nom).includes(recherche));
  }
  return trierParNom(liste);
}

// Ne reconstruit QUE la grille (pas les filtres) — appelée seule depuis la
// recherche, sinon le champ perdrait le focus à chaque lettre tapée.
function rendreGrillePlats() {
  const liste = platsFiltres();
  grillePlatsEl.innerHTML = "";

  if (liste.length === 0) {
    grillePlatsEl.innerHTML = `<p class="liste-vide">Aucun plat pour ce filtre.</p>`;
    return;
  }

  for (const plat of liste) {
    const nbIngredients = plat.ingredients.length;
    const nomRepas = etat.repas.find((r) => r.id === plat.repas)?.nom ?? plat.repas;
    const nomsEtiquettes = plat.etiquettes
      .map((id) => etat.etiquettes.find((e) => e.id === id)?.nom)
      .filter(Boolean);
    const nomsMateriel = plat.materiel
      .map((id) => etat.materiel.find((m) => m.id === id)?.nom)
      .filter(Boolean);
    const tempsTotal = plat.tempsPreparation + plat.tempsCuisson;
    // Deux lignes au lieu d'une seule coupée par "…" : l'essentiel d'abord
    // (repas · temps · ingrédients · matériel), les étiquettes à part en
    // dessous, qui peuvent passer à la ligne — elles étaient souvent cachées.
    const morceaux = [
      nomRepas,
      tempsTotal > 0 ? `⏱️ ${tempsTotal} min` : null,
      `${nbIngredients} ingrédient${nbIngredients > 1 ? "s" : ""}`,
      nomsMateriel.length > 0 ? nomsMateriel.join(", ") : null,
    ].filter(Boolean);
    const carte = document.createElement("div");
    carte.className = "article-course";
    carte.innerHTML = `
      <button class="plat-favori" aria-label="${plat.favori ? "Retirer des favoris" : "Marquer comme favori"}">${plat.favori ? "⭐" : "☆"}</button>
      <div class="article-info">
        <span class="article-nom">${plat.nom}</span>
        <span class="article-detail article-detail-multiligne">${morceaux.join(" · ")}</span>
        ${nomsEtiquettes.length > 0 ? `<span class="plat-etiquettes">${nomsEtiquettes.map((n) => `<span class="plat-etiquette">${n}</span>`).join("")}</span>` : ""}
      </div>
    `;
    carte.querySelector(".plat-favori").addEventListener("click", (evenement) => {
      evenement.stopPropagation();
      modifierPlat(etat, plat.id, { favori: !plat.favori });
      sauvegarder();
      rendreGrillePlats();
    });
    carte.addEventListener("click", () => ouvrirPanneauPlat(plat.id));
    grillePlatsEl.appendChild(carte);
  }
}

recherchePlatsEl.addEventListener("input", (evenement) => {
  recherchePlats = evenement.target.value;
  rendreGrillePlats();
});

function rendreEcranPlats() {
  filtreFavorisRapideEl.classList.toggle("selectionne", filtreFavorisActif);
  filtreRealisableRapideEl.classList.toggle("selectionne", filtreRealisableActif);

  // Favoris et Réalisable sont directement visibles (boutons rapides
  // ci-dessus) : pas comptés ici, seul ce qui reste caché dans "➕ Plus de
  // filtres" (Repas/Étiquettes/Matériel) l'est.
  const nbFiltresActifs =
    (filtreRepas !== "tous" ? 1 : 0) +
    etiquettesSelectionnees.size +
    materielSelectionnes.size;
  filtresPlatsCompteEl.textContent = nbFiltresActifs > 0 ? ` (${nbFiltresActifs})` : "";

  rendreGrillePlats();
}

// Construit une liste d'options à choisir (repas à choix unique, ou
// étiquettes/matériel à choix multiple selon `estSelectionne`) — juste le
// choix, sans affordance d'édition ici (voir "Gérer les repas/étiquettes/
// matériel" plus bas : un seul endroit cliquable pour ajouter ET modifier,
// plutôt qu'un ✏️ à côté de chaque option — retour de Qassim, "ça fait
// beaucoup"). `classeChoix` : "plat-choix" (liste verticale) ou
// "puce" (petites pastilles côte à côte) selon le contexte d'appel.
function construireListeChoixEl(conteneurEl, classeChoix, liste, estSelectionne, onChoisir) {
  conteneurEl.innerHTML = "";
  for (const item of liste) {
    const bouton = document.createElement("button");
    bouton.className = classeChoix;
    bouton.type = "button";
    if (estSelectionne(item.id)) bouton.classList.add("selectionne");
    bouton.textContent = item.nom;
    bouton.addEventListener("click", () => onChoisir(item.id));
    conteneurEl.appendChild(bouton);
  }
}

// Panneau "Gérer les repas/étiquettes/matériel" : une liste complète, dont
// chaque ligne ouvre directement le renommage/suppression, plus un
// "+ Ajouter" toujours en bas — un seul endroit cliquable pour ajouter ET
// éditer (retour de Qassim), au lieu d'un ✏️ à côté de chaque filtre.
function ouvrirPanneauGererListe(titre, obtenirListe, ouvrirEdition, ouvrirNouveau, labelAjouter, retour, ecranSousJacent) {
  apresFermeturePanneau = ecranSousJacent;

  function rendrePanneau() {
    const liste = obtenirListe();
    panneauPlatEl.innerHTML = `
      <div class="panneau-entete">
        <span class="panneau-titre">${titre}</span>
        <button class="panneau-fermer" aria-label="Fermer">✕</button>
      </div>

      <div class="liste-plats" id="gerer-liste"></div>
      ${liste.length === 0 ? `<p class="panneau-vide">Rien pour l'instant.</p>` : ""}
      <button class="bouton-secondaire bouton-pleine-largeur" id="gerer-ajouter" style="margin-top:8px;">${labelAjouter}</button>
    `;

    const listeEl = panneauPlatEl.querySelector("#gerer-liste");
    for (const item of liste) {
      const bouton = document.createElement("button");
      bouton.className = "plat-choix";
      bouton.textContent = item.nom;
      bouton.addEventListener("click", () => ouvrirEdition(item.id, () => rendrePanneau(), ecranSousJacent));
      listeEl.appendChild(bouton);
    }

    panneauPlatEl.querySelector("#gerer-ajouter").addEventListener("click", () => {
      ouvrirNouveau(() => rendrePanneau(), ecranSousJacent);
    });
    panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", retour);
  }

  rendrePanneau();
  panneauFondEl.hidden = false;
  panneauPlatEl.hidden = false;
}

function ouvrirPanneauGererRepas(retour = fermerPanneau, ecranSousJacent = rendreEcranPlats) {
  ouvrirPanneauGererListe(
    "⚙️ Gérer les repas", () => etat.repas,
    ouvrirPanneauRepas, ouvrirPanneauNouveauRepas, "+ Ajouter un repas",
    retour, ecranSousJacent
  );
}

function ouvrirPanneauGererEtiquettes(retour = fermerPanneau, ecranSousJacent = rendreEcranPlats) {
  ouvrirPanneauGererListe(
    "⚙️ Gérer les étiquettes", () => etat.etiquettes,
    ouvrirPanneauEtiquette, ouvrirPanneauNouvelleEtiquette, "+ Ajouter une étiquette",
    retour, ecranSousJacent
  );
}

function ouvrirPanneauGererMateriel(retour = fermerPanneau, ecranSousJacent = rendreEcranPlats) {
  ouvrirPanneauGererListe(
    "⚙️ Gérer le matériel", () => etat.materiel,
    ouvrirPanneauMateriel, ouvrirPanneauNouveauMateriel, "+ Ajouter un matériel",
    retour, ecranSousJacent
  );
}

// --- Panneau "modifier une étiquette" (renommer / supprimer) ---

function ouvrirPanneauEtiquette(etiquetteId, retour = fermerPanneau, ecranSousJacent = rendreEcranPlats) {
  apresFermeturePanneau = ecranSousJacent;

  function rendrePanneau(messageErreur) {
    const etiquette = etat.etiquettes.find((e) => e.id === etiquetteId);

    panneauPlatEl.innerHTML = `
      <div class="panneau-entete">
        <span class="panneau-titre">✏️ Modifier l'étiquette</span>
        <button class="panneau-fermer" aria-label="Fermer">✕</button>
      </div>

      <div class="panneau-section-titre">Nom</div>
      <input type="text" id="etiquette-nom" class="champ-texte" value="${etiquette.nom}">

      ${messageErreur ? `<p class="panneau-note" style="color:#c0392b;">${messageErreur}</p>` : ""}

      <div class="panneau-actions">
        <button class="bouton-principal" id="etiquette-renommer">Enregistrer</button>
        <button class="bouton-discret" id="etiquette-supprimer">🗑️ Supprimer cette étiquette</button>
      </div>
    `;

    panneauPlatEl.querySelector("#etiquette-renommer").addEventListener("click", () => {
      const nouveauNom = panneauPlatEl.querySelector("#etiquette-nom").value.trim();
      if (!nouveauNom) {
        rendrePanneau("Donne un nom à cette étiquette.");
        return;
      }
      renommerEtiquette(etat, etiquetteId, nouveauNom);
      sauvegarder();
      retour();
    });
    panneauPlatEl.querySelector("#etiquette-supprimer").addEventListener("click", () => {
      const resultat = supprimerEtiquette(etat, etiquetteId);
      if (!resultat.ok) {
        rendrePanneau(`Impossible : portée par ${resultat.plats.join(", ")}.`);
        return;
      }
      sauvegarder();
      retour();
    });
    panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", retour);
  }

  rendrePanneau();
  panneauFondEl.hidden = false;
  panneauPlatEl.hidden = false;
}

// --- Panneau "nouvelle étiquette" ---

function ouvrirPanneauNouvelleEtiquette(retour = fermerPanneau, ecranSousJacent = rendreEcranPlats) {
  apresFermeturePanneau = ecranSousJacent;

  function rendrePanneau(messageErreur) {
    panneauPlatEl.innerHTML = `
      <div class="panneau-entete">
        <span class="panneau-titre">➕ Nouvelle étiquette</span>
        <button class="panneau-fermer" aria-label="Fermer">✕</button>
      </div>

      <div class="panneau-section-titre">Nom</div>
      <input type="text" id="etiquette-nom" class="champ-texte" placeholder="Ex. Sans gluten">

      ${messageErreur ? `<p class="panneau-note" style="color:#c0392b;">${messageErreur}</p>` : ""}

      <div class="panneau-actions">
        <button class="bouton-principal" id="etiquette-valider">Ajouter</button>
      </div>
    `;

    panneauPlatEl.querySelector("#etiquette-valider").addEventListener("click", () => {
      const nom = panneauPlatEl.querySelector("#etiquette-nom").value.trim();
      if (!nom) {
        rendrePanneau("Donne un nom à cette étiquette.");
        return;
      }
      ajouterEtiquette(etat, nom);
      sauvegarder();
      retour();
    });
    panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", retour);
  }

  rendrePanneau();
  panneauFondEl.hidden = false;
  panneauPlatEl.hidden = false;
}

// --- Panneau "modifier un matériel" (renommer / supprimer) ---

function ouvrirPanneauMateriel(materielId, retour = fermerPanneau, ecranSousJacent = rendreEcranPlats) {
  apresFermeturePanneau = ecranSousJacent;

  function rendrePanneau(messageErreur) {
    const materiel = etat.materiel.find((m) => m.id === materielId);

    panneauPlatEl.innerHTML = `
      <div class="panneau-entete">
        <span class="panneau-titre">✏️ Modifier le matériel</span>
        <button class="panneau-fermer" aria-label="Fermer">✕</button>
      </div>

      <div class="panneau-section-titre">Nom</div>
      <input type="text" id="materiel-nom" class="champ-texte" value="${materiel.nom}">

      ${messageErreur ? `<p class="panneau-note" style="color:#c0392b;">${messageErreur}</p>` : ""}

      <div class="panneau-actions">
        <button class="bouton-principal" id="materiel-renommer">Enregistrer</button>
        <button class="bouton-discret" id="materiel-supprimer">🗑️ Supprimer ce matériel</button>
      </div>
    `;

    panneauPlatEl.querySelector("#materiel-renommer").addEventListener("click", () => {
      const nouveauNom = panneauPlatEl.querySelector("#materiel-nom").value.trim();
      if (!nouveauNom) {
        rendrePanneau("Donne un nom à ce matériel.");
        return;
      }
      renommerMateriel(etat, materielId, nouveauNom);
      sauvegarder();
      retour();
    });
    panneauPlatEl.querySelector("#materiel-supprimer").addEventListener("click", () => {
      const resultat = supprimerMateriel(etat, materielId);
      if (!resultat.ok) {
        rendrePanneau(`Impossible : demandé par ${resultat.plats.join(", ")}.`);
        return;
      }
      sauvegarder();
      retour();
    });
    panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", retour);
  }

  rendrePanneau();
  panneauFondEl.hidden = false;
  panneauPlatEl.hidden = false;
}

// --- Panneau "nouveau matériel" ---

function ouvrirPanneauNouveauMateriel(retour = fermerPanneau, ecranSousJacent = rendreEcranPlats) {
  apresFermeturePanneau = ecranSousJacent;

  function rendrePanneau(messageErreur) {
    panneauPlatEl.innerHTML = `
      <div class="panneau-entete">
        <span class="panneau-titre">➕ Nouveau matériel</span>
        <button class="panneau-fermer" aria-label="Fermer">✕</button>
      </div>

      <div class="panneau-section-titre">Nom</div>
      <input type="text" id="materiel-nom" class="champ-texte" placeholder="Ex. Blender">

      ${messageErreur ? `<p class="panneau-note" style="color:#c0392b;">${messageErreur}</p>` : ""}

      <div class="panneau-actions">
        <button class="bouton-principal" id="materiel-valider">Ajouter</button>
      </div>
    `;

    panneauPlatEl.querySelector("#materiel-valider").addEventListener("click", () => {
      const nom = panneauPlatEl.querySelector("#materiel-nom").value.trim();
      if (!nom) {
        rendrePanneau("Donne un nom à ce matériel.");
        return;
      }
      ajouterMateriel(etat, nom);
      sauvegarder();
      retour();
    });
    panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", retour);
  }

  rendrePanneau();
  panneauFondEl.hidden = false;
  panneauPlatEl.hidden = false;
}

// --- Panneau "modifier un repas" (renommer / supprimer) ---

function ouvrirPanneauRepas(repasId, retour = fermerPanneau, ecranSousJacent = rendreEcranPlats) {
  apresFermeturePanneau = ecranSousJacent;

  function rendrePanneau(messageErreur) {
    const repas = etat.repas.find((r) => r.id === repasId);

    panneauPlatEl.innerHTML = `
      <div class="panneau-entete">
        <span class="panneau-titre">✏️ Modifier le repas</span>
        <button class="panneau-fermer" aria-label="Fermer">✕</button>
      </div>

      <div class="panneau-section-titre">Nom</div>
      <input type="text" id="repas-nom" class="champ-texte" value="${repas.nom}">

      ${messageErreur ? `<p class="panneau-note" style="color:#c0392b;">${messageErreur}</p>` : ""}

      <div class="panneau-actions">
        <button class="bouton-principal" id="repas-renommer">Enregistrer</button>
        <button class="bouton-discret" id="repas-supprimer">🗑️ Supprimer ce repas</button>
      </div>
    `;

    panneauPlatEl.querySelector("#repas-renommer").addEventListener("click", () => {
      const nouveauNom = panneauPlatEl.querySelector("#repas-nom").value.trim();
      if (!nouveauNom) {
        rendrePanneau("Donne un nom à ce repas.");
        return;
      }
      renommerRepas(etat, repasId, nouveauNom);
      sauvegarder();
      retour();
    });
    panneauPlatEl.querySelector("#repas-supprimer").addEventListener("click", () => {
      const resultat = supprimerRepas(etat, repasId);
      if (!resultat.ok) {
        rendrePanneau(`Impossible : utilisé par ${resultat.plats.join(", ")}.`);
        return;
      }
      sauvegarder();
      retour();
    });
    panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", retour);
  }

  rendrePanneau();
  panneauFondEl.hidden = false;
  panneauPlatEl.hidden = false;
}

// --- Panneau "nouveau repas" ---

function ouvrirPanneauNouveauRepas(retour = fermerPanneau, ecranSousJacent = rendreEcranPlats) {
  apresFermeturePanneau = ecranSousJacent;

  function rendrePanneau(messageErreur) {
    panneauPlatEl.innerHTML = `
      <div class="panneau-entete">
        <span class="panneau-titre">➕ Nouveau repas</span>
        <button class="panneau-fermer" aria-label="Fermer">✕</button>
      </div>

      <div class="panneau-section-titre">Nom</div>
      <input type="text" id="repas-nom" class="champ-texte" placeholder="Ex. Brunch">

      ${messageErreur ? `<p class="panneau-note" style="color:#c0392b;">${messageErreur}</p>` : ""}

      <div class="panneau-actions">
        <button class="bouton-principal" id="repas-valider">Ajouter</button>
      </div>
    `;

    panneauPlatEl.querySelector("#repas-valider").addEventListener("click", () => {
      const nom = panneauPlatEl.querySelector("#repas-nom").value.trim();
      if (!nom) {
        rendrePanneau("Donne un nom à ce repas.");
        return;
      }
      ajouterRepas(etat, nom);
      sauvegarder();
      retour();
    });
    panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", retour);
  }

  rendrePanneau();
  panneauFondEl.hidden = false;
  panneauPlatEl.hidden = false;
}

// --- Panneau "nouveau plat" : juste nom + repas, puis bascule sur le
// panneau d'édition complet (ingrédients, étapes...) une fois créé. ---

function ouvrirPanneauNouveauPlat(ecranSousJacent = rendreEcranPlats) {
  apresFermeturePanneau = ecranSousJacent;
  const nouveau = { nom: "", repas: null };

  function rendrePanneau(messageErreur) {
    panneauPlatEl.innerHTML = `
      <div class="panneau-entete">
        <span class="panneau-titre">➕ Nouveau plat</span>
        <button class="panneau-fermer" aria-label="Fermer">✕</button>
      </div>

      <div class="panneau-section-titre">Nom</div>
      <input type="text" id="nouveau-plat-nom" class="champ-texte" value="${nouveau.nom}" placeholder="Ex. Curry de poulet">

      <div class="panneau-section-titre">Repas</div>
      <div class="puces" id="nouveau-plat-repas"></div>

      ${messageErreur ? `<p class="panneau-note" style="color:#c0392b;">${messageErreur}</p>` : ""}

      <div class="panneau-actions">
        <button class="bouton-principal" id="nouveau-plat-valider">Créer ce plat</button>
      </div>
    `;

    panneauPlatEl.querySelector("#nouveau-plat-nom").addEventListener("change", (evenement) => {
      nouveau.nom = evenement.target.value;
    });

    construireListeChoixEl(
      panneauPlatEl.querySelector("#nouveau-plat-repas"),
      "puce",
      etat.repas,
      (id) => id === nouveau.repas,
      (repas) => {
        nouveau.repas = repas;
        rendrePanneau();
      }
    );

    panneauPlatEl.querySelector("#nouveau-plat-valider").addEventListener("click", () => {
      const nomSaisi = panneauPlatEl.querySelector("#nouveau-plat-nom").value.trim();
      if (!nomSaisi) {
        rendrePanneau("Donne un nom à ce plat.");
        return;
      }
      if (!nouveau.repas) {
        rendrePanneau("Choisis un repas.");
        return;
      }
      const plat = ajouterPlat(etat, { nom: nomSaisi, repas: nouveau.repas, ingredients: [] });
      sauvegarder();
      ouvrirPanneauPlat(plat.id, ecranSousJacent);
    });

    panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", fermerPanneau);
  }

  rendrePanneau();
  panneauFondEl.hidden = false;
  panneauPlatEl.hidden = false;
}

// --- Panneau "modifier un plat" : nom, repas, portions, étapes,
// ingrédients (ajoutés via le Catalogue), suppression. Tout s'enregistre
// immédiatement (même principe que le panneau ingrédient de Stock). ---

function ouvrirPanneauPlat(platId, ecranSousJacent = rendreEcranPlats) {
  apresFermeturePanneau = ecranSousJacent;

  function rendrePanneau(messageErreur) {
    const plat = etat.plats.find((p) => p.id === platId);

    panneauPlatEl.innerHTML = `
      <div class="panneau-entete">
        <span class="panneau-titre">✏️ Modifier le plat</span>
        <button class="panneau-fermer" aria-label="Fermer">✕</button>
      </div>

      <div class="panneau-section-titre">Nom</div>
      <input type="text" id="plat-nom" class="champ-texte" value="${plat.nom}">

      <div class="panneau-section-titre">Repas</div>
      <div class="puces" id="plat-repas"></div>
      <button class="bouton-discret" id="plat-gerer-repas">⚙️ Gérer les repas</button>

      <div class="panneau-section-titre">Étiquettes</div>
      <div class="puces" id="plat-etiquettes"></div>
      <button class="bouton-discret" id="plat-gerer-etiquettes">⚙️ Gérer les étiquettes</button>

      <div class="panneau-section-titre">Portions de référence</div>
      <p class="panneau-note">Pour combien de personnes est la recette d'origine ? Les quantités
        des ingrédients se saisissent pour ce nombre-là, telles que la recette les donne.</p>
      <div class="stepper">
        <button class="stepper-bouton" id="plat-portions-moins" aria-label="Moins">−</button>
        <input type="number" id="plat-portions-valeur" class="article-quantite-input" value="${plat.portionsReference}" min="1" step="1">
        <button class="stepper-bouton" id="plat-portions-plus" aria-label="Plus">+</button>
      </div>

      <div class="panneau-section-titre">Matériel requis</div>
      <div class="puces" id="plat-materiel"></div>
      <button class="bouton-discret" id="plat-gerer-materiel">⚙️ Gérer le matériel</button>

      <div class="deux-colonnes">
        <div>
          <div class="panneau-section-titre">⏱️ Préparation (min)</div>
          <div class="stepper stepper-compact">
            <button class="stepper-bouton" id="plat-prepa-moins" aria-label="Moins">−</button>
            <input type="number" inputmode="numeric" id="plat-prepa-valeur" class="article-quantite-input" value="${plat.tempsPreparation}" min="0" step="1">
            <button class="stepper-bouton" id="plat-prepa-plus" aria-label="Plus">+</button>
          </div>
        </div>
        <div>
          <div class="panneau-section-titre">🔥 Cuisson (min)</div>
          <div class="stepper stepper-compact">
            <button class="stepper-bouton" id="plat-cuisson-moins" aria-label="Moins">−</button>
            <input type="number" inputmode="numeric" id="plat-cuisson-valeur" class="article-quantite-input" value="${plat.tempsCuisson}" min="0" step="1">
            <button class="stepper-bouton" id="plat-cuisson-plus" aria-label="Plus">+</button>
          </div>
        </div>
      </div>
      <p class="panneau-note">Cuisson à 0 si le plat ne se cuit pas.</p>

      <div class="panneau-section-titre">Étapes / recette</div>
      <textarea id="plat-etapes" class="champ-texte" style="min-height:120px;" placeholder="Ex. Faire revenir l'oignon, ajouter le poulet...">${plat.etapes ?? ""}</textarea>

      <div class="panneau-section-titre">Ingrédients (quantités pour ${plat.portionsReference} portion${plat.portionsReference > 1 ? "s" : ""})</div>
      <div id="plat-ingredients"></div>
      <button class="bouton-secondaire bouton-pleine-largeur" id="plat-ajouter-ingredient" style="margin-top:8px;">➕ Ajouter un ingrédient</button>

      ${messageErreur ? `<p class="panneau-note" style="color:#c0392b;">${messageErreur}</p>` : ""}

      <div class="panneau-actions">
        <button class="bouton-discret" id="plat-supprimer">🗑️ Supprimer ce plat</button>
      </div>
    `;

    panneauPlatEl.querySelector("#plat-nom").addEventListener("change", (evenement) => {
      modifierPlat(etat, platId, { nom: evenement.target.value });
      sauvegarder();
      rendrePanneau();
    });

    construireListeChoixEl(
      panneauPlatEl.querySelector("#plat-repas"),
      "puce",
      etat.repas,
      (id) => id === plat.repas,
      (repas) => {
        modifierPlat(etat, platId, { repas });
        sauvegarder();
        rendrePanneau();
      }
    );

    construireListeChoixEl(
      panneauPlatEl.querySelector("#plat-etiquettes"),
      "puce",
      etat.etiquettes,
      (id) => plat.etiquettes.includes(id),
      (etiquetteId) => {
        const nouvellesEtiquettes = plat.etiquettes.includes(etiquetteId)
          ? plat.etiquettes.filter((id) => id !== etiquetteId)
          : [...plat.etiquettes, etiquetteId];
        modifierPlat(etat, platId, { etiquettes: nouvellesEtiquettes });
        sauvegarder();
        rendrePanneau();
      }
    );

    construireListeChoixEl(
      panneauPlatEl.querySelector("#plat-materiel"),
      "puce",
      etat.materiel,
      (id) => plat.materiel.includes(id),
      (materielId) => {
        const nouveauMateriel = plat.materiel.includes(materielId)
          ? plat.materiel.filter((id) => id !== materielId)
          : [...plat.materiel, materielId];
        modifierPlat(etat, platId, { materiel: nouveauMateriel });
        sauvegarder();
        rendrePanneau();
      }
    );

    panneauPlatEl.querySelector("#plat-gerer-repas").addEventListener("click", () => {
      ouvrirPanneauGererRepas(() => ouvrirPanneauPlat(platId, ecranSousJacent), ecranSousJacent);
    });
    panneauPlatEl.querySelector("#plat-gerer-materiel").addEventListener("click", () => {
      ouvrirPanneauGererMateriel(() => ouvrirPanneauPlat(platId, ecranSousJacent), ecranSousJacent);
    });

    panneauPlatEl.querySelector("#plat-prepa-moins").addEventListener("click", () => {
      modifierPlat(etat, platId, { tempsPreparation: Math.max(0, plat.tempsPreparation - 5) });
      sauvegarder();
      rendrePanneau();
    });
    panneauPlatEl.querySelector("#plat-prepa-plus").addEventListener("click", () => {
      modifierPlat(etat, platId, { tempsPreparation: plat.tempsPreparation + 5 });
      sauvegarder();
      rendrePanneau();
    });
    panneauPlatEl.querySelector("#plat-prepa-valeur").addEventListener("change", (evenement) => {
      modifierPlat(etat, platId, { tempsPreparation: evenement.target.value });
      sauvegarder();
      rendrePanneau();
    });

    panneauPlatEl.querySelector("#plat-cuisson-moins").addEventListener("click", () => {
      modifierPlat(etat, platId, { tempsCuisson: Math.max(0, plat.tempsCuisson - 5) });
      sauvegarder();
      rendrePanneau();
    });
    panneauPlatEl.querySelector("#plat-cuisson-plus").addEventListener("click", () => {
      modifierPlat(etat, platId, { tempsCuisson: plat.tempsCuisson + 5 });
      sauvegarder();
      rendrePanneau();
    });
    panneauPlatEl.querySelector("#plat-cuisson-valeur").addEventListener("change", (evenement) => {
      modifierPlat(etat, platId, { tempsCuisson: evenement.target.value });
      sauvegarder();
      rendrePanneau();
    });
    panneauPlatEl.querySelector("#plat-gerer-etiquettes").addEventListener("click", () => {
      ouvrirPanneauGererEtiquettes(() => ouvrirPanneauPlat(platId, ecranSousJacent), ecranSousJacent);
    });

    panneauPlatEl.querySelector("#plat-portions-moins").addEventListener("click", () => {
      modifierPlat(etat, platId, { portionsReference: Math.max(1, plat.portionsReference - 1) });
      sauvegarder();
      rendrePanneau();
    });
    panneauPlatEl.querySelector("#plat-portions-plus").addEventListener("click", () => {
      modifierPlat(etat, platId, { portionsReference: plat.portionsReference + 1 });
      sauvegarder();
      rendrePanneau();
    });
    panneauPlatEl.querySelector("#plat-portions-valeur").addEventListener("change", (evenement) => {
      modifierPlat(etat, platId, { portionsReference: evenement.target.value });
      sauvegarder();
      rendrePanneau();
    });

    panneauPlatEl.querySelector("#plat-etapes").addEventListener("change", (evenement) => {
      modifierPlat(etat, platId, { etapes: evenement.target.value });
      sauvegarder();
    });

    const listeIngredientsEl = panneauPlatEl.querySelector("#plat-ingredients");
    if (plat.ingredients.length === 0) {
      listeIngredientsEl.innerHTML = `<p class="panneau-vide">Aucun ingrédient pour l'instant.</p>`;
    } else {
      for (const ligne of plat.ingredients) {
        const ingredient = etat.ingredients.find((i) => i.id === ligne.ingredientId);
        // Affichée/saisie "pour N portions" (comme la recette d'origine),
        // mais toujours STOCKÉE par portion (quantitePortion) — voir la note
        // sous "Portions de référence" plus haut.
        const quantitePourReference = ligne.quantitePortion * plat.portionsReference;
        const ligneEl = document.createElement("div");
        ligneEl.className = "element-prevu ligne-ingredient-recette";
        ligneEl.innerHTML = `
          <span class="element-nom">${ingredient ? ingredient.nom : ligne.ingredientId}</span>
          <input type="number" inputmode="decimal" class="article-quantite-input" value="${formaterNombre(quantitePourReference)}" min="0" step="any" aria-label="Quantité">
          <span class="article-unite">${ligne.unite}</span>
          <button class="element-retirer" aria-label="Retirer cet ingrédient">✕</button>
        `;
        ligneEl.querySelector(".element-retirer").addEventListener("click", () => {
          modifierPlat(etat, platId, { ingredients: plat.ingredients.filter((l) => l !== ligne) });
          sauvegarder();
          rendrePanneau();
        });
        ligneEl.querySelector("input").addEventListener("change", (evenement) => {
          const quantitePortion = clampPositif(evenement.target.value) / plat.portionsReference;
          const nouvelleListe = plat.ingredients.map((l) => (l === ligne ? { ...l, quantitePortion } : l));
          modifierPlat(etat, platId, { ingredients: nouvelleListe });
          sauvegarder();
        });
        listeIngredientsEl.appendChild(ligneEl);
      }
    }

    panneauPlatEl.querySelector("#plat-ajouter-ingredient").addEventListener("click", () => {
      ouvrirPanneauCatalogue(
        ecranSousJacent,
        (ingredientId, retourVersCatalogue) => ouvrirPanneauQuantitePourPlat(platId, ingredientId, retourVersCatalogue),
        () => ouvrirPanneauPlat(platId, ecranSousJacent)
      );
    });

    panneauPlatEl.querySelector("#plat-supprimer").addEventListener("click", () => {
      const resultat = supprimerPlat(etat, platId);
      if (!resultat.ok) {
        const morceaux = [];
        if (resultat.joursModele.length > 0) morceaux.push(`prévu le ${resultat.joursModele.join(", ")} (semaine type)`);
        if (resultat.datesHistorique.length > 0) morceaux.push(`utilisé le ${resultat.datesHistorique.join(", ")}`);
        rendrePanneau(`Impossible : ${morceaux.join(" et ")}.`);
        return;
      }
      sauvegarder();
      fermerPanneau();
    });

    panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", fermerPanneau);
  }

  rendrePanneau();
  panneauFondEl.hidden = false;
  panneauPlatEl.hidden = false;
}

// --- Panneau "quantité par portion" pour un ingrédient qu'on vient de
// choisir dans le Catalogue, pendant l'édition d'un plat. ---

function ouvrirPanneauQuantitePourPlat(platId, ingredientId, retour) {
  let quantite = 1;
  let uniteChoisie = null; // par défaut l'unité de stock, choisie au premier rendu
  let montrerFormCuillere = false;

  function rendrePanneau() {
    const ingredient = etat.ingredients.find((i) => i.id === ingredientId);
    const plat = etat.plats.find((p) => p.id === platId);
    const nbPortions = plat.portionsReference;
    if (!uniteChoisie) uniteChoisie = ingredient.unite;

    // Les cuillères ne sont proposées que si l'ingrédient a son équivalence
    // réglée (voir "Équivalence 1 c. à café" dans le panneau Stock) — sinon
    // impossible de convertir vers l'unité de stock au moment des calculs.
    // Si elle manque encore, on propose de la régler ici même (pas besoin
    // d'aller sur Stock pour ça pendant qu'on saisit une recette).
    const uniteCompatibleCuillere = ingredient.unite === "g" || ingredient.unite === "ml";
    const cuillereReglee = ingredient.parCuillereACafe != null;
    const unitesDisponibles =
      uniteCompatibleCuillere && cuillereReglee
        ? [ingredient.unite, "c. à café", "c. à soupe"]
        : [ingredient.unite];

    panneauPlatEl.innerHTML = `
      <div class="panneau-entete">
        <span class="panneau-titre">${ingredient.nom}</span>
        <button class="panneau-fermer" aria-label="Fermer">✕</button>
      </div>

      ${unitesDisponibles.length > 1 ? `
        <div class="panneau-section-titre">Unité (comme la recette te la donne)</div>
        <div class="puces" id="plat-qte-unites"></div>
      ` : ""}

      ${uniteCompatibleCuillere && !cuillereReglee ? (
        montrerFormCuillere
          ? `<div class="panneau-section-titre">Équivalence 1 c. à café (en ${ingredient.unite})</div>
             <div class="stepper">
               <input type="number" id="plat-qte-cuillere-valeur" class="article-quantite-input" min="0" step="any" placeholder="Ex. 5">
               <button class="bouton-secondaire" id="plat-qte-cuillere-valider">Enregistrer</button>
             </div>`
          : `<button class="bouton-discret" id="plat-qte-cuillere-toggle">🥄 La recette parle en cuillères ? Régler l'équivalence</button>`
      ) : ""}

      <div class="panneau-section-titre">Quantité pour ${nbPortions} portion${nbPortions > 1 ? "s" : ""} (${uniteChoisie})</div>
      <p class="panneau-note">La quantité telle que donnée par la recette (pour ${nbPortions}
        portion${nbPortions > 1 ? "s" : ""}) — ramenée automatiquement à 1 portion.</p>
      <div class="stepper">
        <button class="stepper-bouton" id="plat-qte-moins" aria-label="Moins">−</button>
        <input type="number" id="plat-qte-valeur" class="article-quantite-input" value="${quantite}" min="0" step="any">
        <button class="stepper-bouton" id="plat-qte-plus" aria-label="Plus">+</button>
      </div>

      <div class="panneau-actions">
        <button class="bouton-principal" id="plat-qte-ajouter">Ajouter à la recette</button>
      </div>
    `;

    if (unitesDisponibles.length > 1) {
      const listeUnitesEl = panneauPlatEl.querySelector("#plat-qte-unites");
      for (const unite of unitesDisponibles) {
        const item = document.createElement("button");
        item.className = "puce";
        if (unite === uniteChoisie) item.classList.add("selectionne");
        item.textContent = unite;
        item.addEventListener("click", () => {
          uniteChoisie = unite;
          rendrePanneau();
        });
        listeUnitesEl.appendChild(item);
      }
    }

    const cuillereToggleEl = panneauPlatEl.querySelector("#plat-qte-cuillere-toggle");
    if (cuillereToggleEl) {
      cuillereToggleEl.addEventListener("click", () => {
        montrerFormCuillere = true;
        rendrePanneau();
      });
    }
    const cuillereValiderEl = panneauPlatEl.querySelector("#plat-qte-cuillere-valider");
    if (cuillereValiderEl) {
      cuillereValiderEl.addEventListener("click", () => {
        const valeur = panneauPlatEl.querySelector("#plat-qte-cuillere-valeur").value;
        modifierIngredient(etat, ingredientId, { parCuillereACafe: valeur });
        sauvegarder();
        montrerFormCuillere = false;
        rendrePanneau();
      });
    }

    panneauPlatEl.querySelector("#plat-qte-moins").addEventListener("click", () => {
      quantite = Math.max(0, quantite - 1);
      rendrePanneau();
    });
    panneauPlatEl.querySelector("#plat-qte-plus").addEventListener("click", () => {
      quantite += 1;
      rendrePanneau();
    });
    panneauPlatEl.querySelector("#plat-qte-valeur").addEventListener("change", (evenement) => {
      quantite = clampPositif(evenement.target.value);
    });
    panneauPlatEl.querySelector("#plat-qte-ajouter").addEventListener("click", () => {
      const quantitePortion = quantite / nbPortions;
      modifierPlat(etat, platId, {
        ingredients: [...plat.ingredients, { ingredientId, quantitePortion, unite: uniteChoisie }],
      });
      sauvegarder();
      retour();
    });
    panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", retour);
  }

  rendrePanneau();
  panneauFondEl.hidden = false;
  panneauPlatEl.hidden = false;
}

// --- Démarrage ---

rendreEcranSemaine();
// Signal pour le filet de sécurité d'index.html : l'app a bien démarré.
window.maSemaineDemarree = true;

// --- PWA : installable sur l'écran d'accueil, utilisable hors connexion
// (chantier, zone sans réseau...) une fois ouverte au moins une fois avec
// du réseau — voir manifest.json et service-worker.js. Pas grave si le
// navigateur ne supporte pas les service workers (Safari très ancien...) :
// l'appli continue de fonctionner normalement, juste sans le mode hors-ligne.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      // Échec silencieux : l'appli reste utilisable en ligne sans ce confort.
    });
  });
}
