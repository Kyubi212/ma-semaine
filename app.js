// Ma Semaine — point d'entrée de l'application.
// Gère la navigation entre les 4 écrans, et construit l'écran Semaine
// (le seul déjà branché aux vraies données à cette étape du projet).

import { chargerEtat, sauvegarderEtat } from "./storage.js";
import {
  obtenirCaseEffective,
  definirCuisine,
  definirPlatDuJour,
  datesDeLaSemaine,
  decalerSemaine,
  dateEnISO,
} from "./calculs.js";
import { JOURS } from "./constantes.js";

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
  bouton.addEventListener("click", () => afficherEcran(bouton.dataset.ecran));
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
const CRENEAU_INFOS = {
  "petit-dejeuner": { icone: "🌅", label: "Petit-déjeuner", repas: "Petit-déjeuner" },
  smoko: { icone: "☕", label: "Smoko", repas: "Smoko" },
  lunch: { icone: "🥗", label: "Lunch", repas: "Déjeuner" },
  snack: { icone: "🍎", label: "Snack", repas: "Snack" },
  diner: { icone: "🍽️", label: "Dîner", repas: "Dîner" },
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

function rendreEcranSemaine() {
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
    bouton.innerHTML = `
      <span class="jour-pastille-nom">${JOUR_LABELS[jourSemaine]}</span>
      <span class="jour-pastille-numero">${dateISO.split("-")[2]}</span>
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

function construireCarteCreneau(dateISO, creneau) {
  const infos = CRENEAU_INFOS[creneau];
  const caseEffective = obtenirCaseEffective(etat, dateISO, creneau);
  const plat = caseEffective.platId ? etat.plats.find((p) => p.id === caseEffective.platId) : null;

  const carte = document.createElement("div");
  carte.className = "carte-creneau";

  const infoBouton = document.createElement("button");
  infoBouton.className = "carte-creneau-info";
  infoBouton.addEventListener("click", () => ouvrirPanneau(dateISO, creneau));

  const detailMorceaux = [];
  if (plat && caseEffective.preparation === "reste") detailMorceaux.push("♻️ Reste");
  if (plat) detailMorceaux.push(`${caseEffective.portions} portion${caseEffective.portions > 1 ? "s" : ""}`);

  infoBouton.innerHTML = `
    <span class="carte-creneau-entete">${infos.icone} ${infos.label}</span>
    <span class="carte-creneau-plat ${plat ? "" : "vide"}">${plat ? plat.nom : "À choisir"}</span>
    ${detailMorceaux.length ? `<span class="carte-creneau-detail">${detailMorceaux.join(" · ")}</span>` : ""}
  `;
  carte.appendChild(infoBouton);

  // La case "Cuisiné" n'a de sens que s'il y a un plat et que ce n'est pas
  // un "reste" (voir calculs.js → caseCompte) : sinon on ne l'affiche pas.
  if (plat && caseEffective.preparation !== "reste") {
    const caseACocher = document.createElement("input");
    caseACocher.type = "checkbox";
    caseACocher.className = "carte-creneau-cuisine";
    caseACocher.checked = caseEffective.cuisine;
    caseACocher.setAttribute("aria-label", "Cuisiné");
    caseACocher.addEventListener("change", () => {
      definirCuisine(etat, dateISO, creneau, caseACocher.checked);
      sauvegarder();
      rendreEcranSemaine();
    });
    carte.appendChild(caseACocher);
  }

  return carte;
}

// --- Panneau "choisir un plat" ---

const panneauFondEl = document.getElementById("panneau-fond");
const panneauPlatEl = document.getElementById("panneau-plat");

function fermerPanneau() {
  panneauFondEl.hidden = true;
  panneauPlatEl.hidden = true;
  panneauPlatEl.innerHTML = "";
}

panneauFondEl.addEventListener("click", fermerPanneau);

function ouvrirPanneau(dateISO, creneau) {
  const infos = CRENEAU_INFOS[creneau];
  const caseActuelle = obtenirCaseEffective(etat, dateISO, creneau);

  // État local du panneau : rien n'est sauvegardé tant qu'on n'appuie pas
  // sur un des deux boutons "Enregistrer".
  const choix = {
    platId: caseActuelle.platId,
    portions: caseActuelle.portions,
    preparation: caseActuelle.preparation,
  };
  let voirTousLesPlats = false;

  function platsAffiches() {
    if (voirTousLesPlats) return etat.plats;
    return etat.plats.filter((p) => p.repas === infos.repas);
  }

  function rendrePanneau() {
    const plats = platsAffiches();

    panneauPlatEl.innerHTML = `
      <div class="panneau-entete">
        <span class="panneau-titre">${infos.icone} ${infos.label} — ${joursMoisLisible(dateISO)}</span>
        <button class="panneau-fermer" aria-label="Fermer">✕</button>
      </div>

      <div class="panneau-section-titre">Plat</div>
      <div class="liste-plats" id="liste-plats"></div>
      <button class="lien-voir-tous" id="lien-voir-tous">
        ${voirTousLesPlats ? `Filtrer sur ${infos.label}` : "Voir tous les plats"}
      </button>

      <div class="panneau-section-titre">Portions</div>
      <div class="stepper">
        <button class="stepper-bouton" id="portions-moins" aria-label="Moins de portions">−</button>
        <span class="stepper-valeur" id="portions-valeur">${choix.portions}</span>
        <button class="stepper-bouton" id="portions-plus" aria-label="Plus de portions">+</button>
      </div>

      <div class="panneau-section-titre">Préparation</div>
      <div class="segmente">
        <button class="segmente-bouton" id="prep-cuisine" type="button">🍳 Cuisiné ici</button>
        <button class="segmente-bouton" id="prep-reste" type="button">♻️ Reste</button>
      </div>

      <div class="panneau-actions">
        <button class="bouton-principal" id="enregistrer-jour">Enregistrer juste ce jour</button>
        <button class="bouton-secondaire" id="enregistrer-propager">Enregistrer à partir d'aujourd'hui</button>
        <button class="bouton-discret" id="vider-case">Vider cette case</button>
      </div>
    `;

    // Liste des plats
    const listeEl = panneauPlatEl.querySelector("#liste-plats");
    for (const plat of plats) {
      const item = document.createElement("button");
      item.className = "plat-choix";
      if (plat.id === choix.platId) item.classList.add("selectionne");
      item.textContent = plat.nom;
      item.addEventListener("click", () => {
        choix.platId = plat.id;
        rendrePanneau();
      });
      listeEl.appendChild(item);
    }

    panneauPlatEl.querySelector("#lien-voir-tous").addEventListener("click", () => {
      voirTousLesPlats = !voirTousLesPlats;
      rendrePanneau();
    });

    // Portions
    panneauPlatEl.querySelector("#portions-moins").addEventListener("click", () => {
      choix.portions = Math.max(0, choix.portions - 1);
      rendrePanneau();
    });
    panneauPlatEl.querySelector("#portions-plus").addEventListener("click", () => {
      choix.portions += 1;
      rendrePanneau();
    });

    // Préparation (segmenté)
    const boutonPrepCuisine = panneauPlatEl.querySelector("#prep-cuisine");
    const boutonPrepReste = panneauPlatEl.querySelector("#prep-reste");
    boutonPrepCuisine.classList.toggle("selectionne", choix.preparation === "cuisine-ici");
    boutonPrepReste.classList.toggle("selectionne", choix.preparation === "reste");
    boutonPrepCuisine.addEventListener("click", () => {
      choix.preparation = "cuisine-ici";
      rendrePanneau();
    });
    boutonPrepReste.addEventListener("click", () => {
      choix.preparation = "reste";
      rendrePanneau();
    });

    // Fermer sans enregistrer
    panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", fermerPanneau);

    // Enregistrer (juste ce jour / à partir d'aujourd'hui)
    panneauPlatEl.querySelector("#enregistrer-jour").addEventListener("click", () => {
      definirPlatDuJour(etat, dateISO, creneau, choix, false);
      sauvegarder();
      fermerPanneau();
      rendreEcranSemaine();
    });
    panneauPlatEl.querySelector("#enregistrer-propager").addEventListener("click", () => {
      definirPlatDuJour(etat, dateISO, creneau, choix, true);
      sauvegarder();
      fermerPanneau();
      rendreEcranSemaine();
    });
    panneauPlatEl.querySelector("#vider-case").addEventListener("click", () => {
      definirPlatDuJour(etat, dateISO, creneau, { platId: null, portions: 1, preparation: "cuisine-ici" }, false);
      sauvegarder();
      fermerPanneau();
      rendreEcranSemaine();
    });
  }

  rendrePanneau();
  panneauFondEl.hidden = false;
  panneauPlatEl.hidden = false;
}

// --- Démarrage ---

rendreEcranSemaine();
