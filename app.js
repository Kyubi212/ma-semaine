// Ma Semaine — point d'entrée de l'application.
// Gère la navigation entre les 4 écrans, et construit l'écran Semaine
// (le seul déjà branché aux vraies données à cette étape du projet).

import { chargerEtat, sauvegarderEtat } from "./storage.js";
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
  bouton.addEventListener("click", () => {
    afficherEcran(bouton.dataset.ecran);
    // L'écran Courses dépend de ce qui a été planifié dans l'écran Semaine :
    // on le recalcule à chaque fois qu'on l'ouvre, pas seulement au démarrage.
    if (bouton.dataset.ecran === "courses") rendreEcranCourses();
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
    const detailMorceaux = [];
    if (element.preparation === "reste") detailMorceaux.push("♻️ Reste");
    detailMorceaux.push(`${element.portions} portion${element.portions > 1 ? "s" : ""}`);
    infoBouton.innerHTML = `
      <span class="carte-creneau-entete">${infos.icone} ${infos.label}</span>
      <span class="carte-creneau-plat">${nomPlat(element.platId)}</span>
      <span class="carte-creneau-detail">${detailMorceaux.join(" · ")}</span>
    `;
  } else {
    // Plusieurs plats pour ce créneau (voir CLAUDE.md § Plusieurs plats par
    // créneau) : la carte résume, le détail (portions, Cuisiné par plat) se
    // gère dans le panneau.
    infoBouton.innerHTML = `
      <span class="carte-creneau-entete">${infos.icone} ${infos.label}</span>
      <span class="carte-creneau-plat">${elements.map((e) => nomPlat(e.platId)).join(" · ")}</span>
      <span class="carte-creneau-detail">${elements.length} plats</span>
    `;
  }
  carte.appendChild(infoBouton);

  // La case "Cuisiné" directement sur la carte n'a de sens que pour UN seul
  // plat, pas "reste" (voir calculs.js → caseCompte). Avec plusieurs plats,
  // chacun a sa propre case, gérée dans le panneau.
  if (elements.length === 1 && elements[0].preparation !== "reste") {
    const [element] = elements;
    const caseACocher = document.createElement("input");
    caseACocher.type = "checkbox";
    caseACocher.className = "carte-creneau-cuisine";
    caseACocher.checked = element.cuisine;
    caseACocher.setAttribute("aria-label", "Cuisiné");
    caseACocher.addEventListener("change", () => {
      definirCuisine(etat, dateISO, creneau, element.id, caseACocher.checked);
      sauvegarder();
      rendreEcranSemaine();
    });
    carte.appendChild(caseACocher);
  }

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

function ouvrirPanneau(dateISO, creneau) {
  apresFermeturePanneau = rendreEcranSemaine;
  const infos = CRENEAU_INFOS[creneau];
  const jourLabel = jourDeLaSemaine(dateISO);

  // "Candidat" en cours d'ajout (pas encore enregistré) : null tant que
  // Qassim n'a pas tapé sur un plat de la liste "Ajouter un plat".
  let candidat = null;
  let voirTousLesPlats = false;

  function platsAffiches() {
    if (voirTousLesPlats) return etat.plats;
    return etat.plats.filter((p) => p.repas === infos.repas);
  }

  function rendrePanneau() {
    const elements = obtenirElementsEffectifs(etat, dateISO, creneau);
    const plats = platsAffiches();

    panneauPlatEl.innerHTML = `
      <div class="panneau-entete">
        <span class="panneau-titre">${infos.icone} ${infos.label} — ${joursMoisLisible(dateISO)}</span>
        <button class="panneau-fermer" aria-label="Fermer">✕</button>
      </div>

      <div class="panneau-section-titre">Plats prévus</div>
      <div class="liste-elements" id="liste-elements"></div>
      ${elements.length === 0 ? `<p class="panneau-vide">Rien de prévu pour l'instant.</p>` : ""}

      <div class="panneau-section-titre">Ajouter un plat</div>
      <div class="liste-plats" id="liste-plats"></div>
      <button class="lien-voir-tous" id="lien-voir-tous">
        ${voirTousLesPlats ? `Filtrer sur ${infos.label}` : "Voir tous les plats"}
      </button>

      <div id="zone-candidat"></div>
    `;

    // --- Liste des plats déjà prévus (chacun modifiable/retirable) ---
    const listeElementsEl = panneauPlatEl.querySelector("#liste-elements");
    for (const element of elements) {
      const ligne = document.createElement("div");
      ligne.className = "element-prevu";

      const peutCuisiner = element.preparation !== "reste";
      ligne.innerHTML = `
        <div class="element-prevu-ligne1">
          ${peutCuisiner ? `<input type="checkbox" class="element-cuisine" aria-label="Cuisiné" ${element.cuisine ? "checked" : ""}>` : "<span></span>"}
          <span class="element-nom">${nomPlat(element.platId)}</span>
          <button class="element-retirer" aria-label="Retirer">✕</button>
        </div>
        <div class="element-prevu-ligne2">
          <div class="stepper stepper-compact">
            <button class="stepper-bouton" data-action="moins" aria-label="Moins de portions">−</button>
            <span class="stepper-valeur">${element.portions}</span>
            <button class="stepper-bouton" data-action="plus" aria-label="Plus de portions">+</button>
          </div>
          <button class="pastille-prep" data-action="prep">${element.preparation === "reste" ? "♻️ Reste" : "🍳 Cuisiné ici"}</button>
        </div>
      `;

      const caseACocher = ligne.querySelector(".element-cuisine");
      if (caseACocher) {
        caseACocher.addEventListener("change", () => {
          definirCuisine(etat, dateISO, creneau, element.id, caseACocher.checked);
          sauvegarder();
          rendrePanneau();
        });
      }
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
      ligne.querySelector('[data-action="prep"]').addEventListener("click", () => {
        modifierElementDuJour(etat, dateISO, creneau, element.id, {
          preparation: element.preparation === "reste" ? "cuisine-ici" : "reste",
        });
        sauvegarder();
        rendrePanneau();
      });

      listeElementsEl.appendChild(ligne);
    }

    // --- Liste des plats à ajouter ---
    const listePlatsEl = panneauPlatEl.querySelector("#liste-plats");
    for (const plat of plats) {
      const item = document.createElement("button");
      item.className = "plat-choix";
      if (candidat && candidat.platId === plat.id) item.classList.add("selectionne");
      item.textContent = plat.nom;
      item.addEventListener("click", () => {
        candidat = { platId: plat.id, portions: 1, preparation: "cuisine-ici" };
        rendrePanneau();
      });
      listePlatsEl.appendChild(item);
    }

    panneauPlatEl.querySelector("#lien-voir-tous").addEventListener("click", () => {
      voirTousLesPlats = !voirTousLesPlats;
      rendrePanneau();
    });

    // --- Zone du candidat sélectionné (portions, préparation, boutons d'ajout) ---
    const zoneCandidatEl = panneauPlatEl.querySelector("#zone-candidat");
    if (candidat) {
      zoneCandidatEl.innerHTML = `
        <div class="panneau-section-titre">${nomPlat(candidat.platId)}</div>
        <div class="stepper">
          <button class="stepper-bouton" id="candidat-moins" aria-label="Moins de portions">−</button>
          <span class="stepper-valeur">${candidat.portions}</span>
          <button class="stepper-bouton" id="candidat-plus" aria-label="Plus de portions">+</button>
        </div>
        <div class="segmente">
          <button class="segmente-bouton" id="candidat-prep-cuisine" type="button">🍳 Cuisiné ici</button>
          <button class="segmente-bouton" id="candidat-prep-reste" type="button">♻️ Reste</button>
        </div>
        <div class="panneau-actions">
          <button class="bouton-principal" id="ajouter-jour">Ajouter juste ce jour</button>
          <button class="bouton-secondaire" id="ajouter-propager">Ajouter et en faire le défaut du ${jourLabel}</button>
        </div>
        <p class="panneau-note">
          "Défaut du ${jourLabel}" s'applique à tous les ${jourLabel} futurs pas encore
          consultés — pas aux autres jours de la semaine.
        </p>
      `;

      zoneCandidatEl.querySelector("#candidat-moins").addEventListener("click", () => {
        candidat.portions = Math.max(0, candidat.portions - 1);
        rendrePanneau();
      });
      zoneCandidatEl.querySelector("#candidat-plus").addEventListener("click", () => {
        candidat.portions += 1;
        rendrePanneau();
      });
      const boutonPrepCuisine = zoneCandidatEl.querySelector("#candidat-prep-cuisine");
      const boutonPrepReste = zoneCandidatEl.querySelector("#candidat-prep-reste");
      boutonPrepCuisine.classList.toggle("selectionne", candidat.preparation === "cuisine-ici");
      boutonPrepReste.classList.toggle("selectionne", candidat.preparation === "reste");
      boutonPrepCuisine.addEventListener("click", () => {
        candidat.preparation = "cuisine-ici";
        rendrePanneau();
      });
      boutonPrepReste.addEventListener("click", () => {
        candidat.preparation = "reste";
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

// Ordre des rayons = ton parcours dans le magasin (voir CLAUDE.md).
const RAYONS_ORDRE = [
  "Boucherie halal", "Poissonnerie", "Crèmerie", "Fruits et légumes",
  "Épicerie", "Épices", "Conserves", "Surgelés ou frais", "Boulangerie",
  "Emballage",
];

// Articles cochés "Acheté" PENDANT cette visite de l'écran (pas persisté) :
// ingredientId → quantité ajoutée au stock. Sert à garder l'article visible
// et barré en bas de son rayon jusqu'à ce que Qassim quitte l'écran, plutôt
// que de le faire disparaître instantanément (décision prise avec lui).
const achetesSession = new Map();

function formaterNombre(n) {
  const arrondi = Math.round(n * 10) / 10;
  return String(arrondi);
}

function formaterDetail(article) {
  if (article.detail.length > 0) {
    return article.detail
      .map((d) => `${d.platNom} : ${formaterNombre(d.quantite)} ${article.unite}`)
      .join(" · ");
  }
  const ingredient = etat.ingredients.find((i) => i.id === article.ingredientId);
  if (ingredient?.essentiel) return "⭐ Stock minimum";
  return "Envie ponctuelle";
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
    listeCoursesEl.innerHTML = `<p class="liste-vide">Rien à acheter pour l'instant.</p>`;
    return;
  }

  for (const rayon of RAYONS_ORDRE) {
    const articles = liste.filter((a) => a.rayon === rayon);
    if (articles.length === 0) continue;

    // Pas encore achetés d'abord, achetés (cette session) en bas.
    articles.sort((a, b) => {
      const aAchete = achetesSession.has(a.ingredientId) ? 1 : 0;
      const bAchete = achetesSession.has(b.ingredientId) ? 1 : 0;
      return aAchete - bAchete;
    });

    const groupe = document.createElement("div");
    groupe.className = "rayon-groupe";
    groupe.innerHTML = `<h2 class="rayon-titre">${rayon}</h2>`;

    const articlesEl = document.createElement("div");
    articlesEl.className = "rayon-articles";

    for (const article of articles) {
      const achete = achetesSession.has(article.ingredientId);
      const ligne = document.createElement("div");
      ligne.className = `article-course${achete ? " achete" : ""}`;
      ligne.innerHTML = `
        <input type="checkbox" class="article-checkbox" aria-label="Acheté" ${achete ? "checked" : ""}>
        <div class="article-info">
          <span class="article-nom">${article.nom}</span>
          <span class="article-detail">${formaterDetail(article)}</span>
        </div>
        <div class="article-quantite">
          <input type="number" class="article-quantite-input" value="${formaterNombre(article.aAcheter)}" min="0" step="any" ${achete ? "disabled" : ""}>
          <span class="article-unite">${article.unite}</span>
        </div>
      `;

      const caseACocher = ligne.querySelector(".article-checkbox");
      const champQuantite = ligne.querySelector(".article-quantite-input");

      caseACocher.addEventListener("change", () => {
        const ingredient = etat.ingredients.find((i) => i.id === article.ingredientId);
        if (caseACocher.checked) {
          const quantite = clampPositif(champQuantite.value) || article.aAcheter;
          marquerAchete(ingredient, quantite);
          achetesSession.set(article.ingredientId, quantite);
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

// --- Panneau "ajouter un extra" ---

document.getElementById("ajouter-extra").addEventListener("click", ouvrirPanneauExtra);

function ouvrirPanneauExtra() {
  apresFermeturePanneau = rendreEcranCourses;
  let candidat = null; // { ingredientId, quantite }

  function rendrePanneau() {
    panneauPlatEl.innerHTML = `
      <div class="panneau-entete">
        <span class="panneau-titre">🛒 Ajouter un extra</span>
        <button class="panneau-fermer" aria-label="Fermer">✕</button>
      </div>

      <div class="panneau-section-titre">Ingrédient</div>
      <div class="liste-plats" id="liste-ingredients"></div>

      <div id="zone-candidat-extra"></div>
    `;

    const listeEl = panneauPlatEl.querySelector("#liste-ingredients");
    for (const ingredient of etat.ingredients) {
      const item = document.createElement("button");
      item.className = "plat-choix";
      if (candidat && candidat.ingredientId === ingredient.id) item.classList.add("selectionne");
      item.textContent = ingredient.nom;
      item.addEventListener("click", () => {
        candidat = { ingredientId: ingredient.id, quantite: 1 };
        rendrePanneau();
      });
      listeEl.appendChild(item);
    }

    const zoneCandidatEl = panneauPlatEl.querySelector("#zone-candidat-extra");
    if (candidat) {
      const ingredient = etat.ingredients.find((i) => i.id === candidat.ingredientId);
      zoneCandidatEl.innerHTML = `
        <div class="panneau-section-titre">${ingredient.nom} (${ingredient.unite})</div>
        <div class="stepper">
          <button class="stepper-bouton" id="extra-moins" aria-label="Moins">−</button>
          <span class="stepper-valeur">${candidat.quantite}</span>
          <button class="stepper-bouton" id="extra-plus" aria-label="Plus">+</button>
        </div>
        <div class="panneau-actions">
          <button class="bouton-principal" id="extra-ajouter">Ajouter cet extra</button>
        </div>
      `;
      zoneCandidatEl.querySelector("#extra-moins").addEventListener("click", () => {
        candidat.quantite = Math.max(0, candidat.quantite - 1);
        rendrePanneau();
      });
      zoneCandidatEl.querySelector("#extra-plus").addEventListener("click", () => {
        candidat.quantite += 1;
        rendrePanneau();
      });
      zoneCandidatEl.querySelector("#extra-ajouter").addEventListener("click", () => {
        ingredient.extra = clampPositif(ingredient.extra) + candidat.quantite;
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

// --- Démarrage ---

rendreEcranSemaine();
