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
  etatStock,
  modifierIngredient,
  ajouterIngredient,
  supprimerIngredient,
  ajouterRayon,
  renommerRayon,
  supprimerRayon,
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

// Articles cochés "Acheté" PENDANT cette visite de l'écran (pas persisté) :
// ingredientId → quantité ajoutée au stock. Sert à garder l'article visible
// et barré en bas de son rayon jusqu'à ce que Qassim quitte l'écran, plutôt
// que de le faire disparaître instantanément (décision prise avec lui).
const achetesSession = new Map();

// Rayons repliés PENDANT cette visite de l'écran (pas persisté non plus) :
// un rayon replié doit le rester quand la liste se redessine après une
// coche, sinon Qassim devrait tout replier à nouveau à chaque action.
const rayonsReplies = new Set();

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

  for (const rayon of etat.rayons) {
    const articles = liste.filter((a) => a.rayon === rayon.id);
    if (articles.length === 0) continue;

    // Pas encore achetés d'abord, achetés (cette session) en bas.
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
    groupe.innerHTML = `<summary class="rayon-titre">${rayon.nom} <span class="rayon-compte">${articles.length}</span></summary>`;

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
    listeStockEl.innerHTML = `<p class="liste-vide">Rien à afficher pour ce filtre.</p>`;
    return;
  }

  for (const rayon of etat.rayons) {
    const ingredients = liste.filter((i) => i.rayon === rayon.id);
    if (ingredients.length === 0) continue;

    const groupe = document.createElement("details");
    groupe.className = "rayon-groupe";
    groupe.open = !rayonsRepliesStock.has(rayon.id);
    groupe.addEventListener("toggle", () => {
      if (groupe.open) rayonsRepliesStock.delete(rayon.id);
      else rayonsRepliesStock.add(rayon.id);
    });
    groupe.innerHTML = `<summary class="rayon-titre">${rayon.nom} <span class="rayon-compte">${ingredients.length}</span></summary>`;

    const articlesEl = document.createElement("div");
    articlesEl.className = "rayon-articles";

    for (const ingredient of ingredients) {
      const infosEtat = ETAT_STOCK_INFOS[etatStock(ingredient)];
      const ligne = document.createElement("button");
      ligne.className = "article-course";
      ligne.innerHTML = `
        <span aria-hidden="true">${infosEtat.icone}</span>
        <div class="article-info">
          <span class="article-nom">${ingredient.nom}</span>
          <span class="article-detail">${infosEtat.label}${ingredient.essentiel ? " · ⭐ Essentiel" : ""}</span>
        </div>
        <div class="article-quantite">
          <span class="article-unite">${formaterNombre(ingredient.enStock)} ${ingredient.unite}</span>
        </div>
      `;
      ligne.addEventListener("click", () => ouvrirPanneauIngredient(ingredient.id));
      articlesEl.appendChild(ligne);
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
      <input type="text" id="ingredient-nom" class="article-quantite-input" style="width:100%;" value="${ingredient.nom}">

      <div class="panneau-section-titre">Rayon</div>
      <div class="liste-plats" id="ingredient-liste-rayons"></div>

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
      <input type="number" id="ingredient-minimum" class="article-quantite-input" value="${formaterNombre(ingredient.minimum)}" min="0" step="any" style="width:100%;">

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
      item.className = "plat-choix";
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

document.getElementById("ajouter-ingredient").addEventListener("click", ouvrirPanneauCatalogue);

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
      <input type="text" id="nouveau-nom" class="article-quantite-input" style="width:100%;" value="${nouveau.nom}" placeholder="Ex. Déodorant">

      <div class="panneau-section-titre">Rayon</div>
      <div class="liste-plats" id="liste-rayons"></div>

      <div class="panneau-section-titre">Unité</div>
      <div class="liste-plats" id="liste-unites"></div>

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
      item.className = "plat-choix";
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
      item.className = "plat-choix";
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

function ouvrirPanneauCatalogue() {
  apresFermeturePanneau = rendreEcranStock;

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
      const ingredientsDuRayon = ingredients.filter((i) => i.rayon === rayon.id);
      if (ingredientsDuRayon.length === 0) continue;

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
        <button class="rayon-editer" aria-label="Modifier le rayon ${rayon.nom}">✏️</button>
      `;
      summary.querySelector(".rayon-editer").addEventListener("click", (evenement) => {
        evenement.preventDefault();
        ouvrirPanneauRayon(rayon.id, ouvrirPanneauCatalogue);
      });
      groupe.appendChild(summary);

      const articlesEl = document.createElement("div");
      articlesEl.className = "rayon-articles";
      for (const ingredient of ingredientsDuRayon) {
        const infosEtat = ETAT_STOCK_INFOS[etatStock(ingredient)];
        const ligne = document.createElement("button");
        ligne.className = "article-course";
        ligne.innerHTML = `
          <span aria-hidden="true">${infosEtat.icone}</span>
          <div class="article-info">
            <span class="article-nom">${ingredient.nom}</span>
            <span class="article-detail">${infosEtat.label}${ingredient.essentiel ? " · ⭐ Essentiel" : ""}</span>
          </div>
          <div class="article-quantite">
            <span class="article-unite">${formaterNombre(ingredient.enStock)} ${ingredient.unite}</span>
          </div>
        `;
        ligne.addEventListener("click", () => ouvrirPanneauIngredient(ingredient.id, ouvrirPanneauCatalogue));
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

    <input type="text" id="catalogue-recherche" class="article-quantite-input" style="width:100%;" placeholder="Chercher un ingrédient..." value="${rechercheCatalogue}">

    <div class="panneau-actions" style="margin: 12px 0;">
      <button class="bouton-secondaire" id="catalogue-nouvel-ingredient">➕ Créer un nouvel ingrédient</button>
      <button class="bouton-secondaire" id="catalogue-nouveau-rayon">➕ Ajouter un rayon</button>
    </div>

    <div id="catalogue-liste"></div>
  `;

  panneauPlatEl.querySelector("#catalogue-recherche").addEventListener("input", (evenement) => {
    rechercheCatalogue = evenement.target.value;
    rendreListe();
  });
  panneauPlatEl.querySelector("#catalogue-nouvel-ingredient").addEventListener("click", () => {
    ouvrirPanneauNouvelIngredient(ouvrirPanneauCatalogue);
  });
  panneauPlatEl.querySelector("#catalogue-nouveau-rayon").addEventListener("click", () => {
    ouvrirPanneauNouveauRayon(ouvrirPanneauCatalogue);
  });
  panneauPlatEl.querySelector(".panneau-fermer").addEventListener("click", fermerPanneau);

  rendreListe();
  panneauFondEl.hidden = false;
  panneauPlatEl.hidden = false;
}

// --- Panneau "modifier un rayon" (renommer / supprimer) ---

function ouvrirPanneauRayon(rayonId, retour = fermerPanneau) {
  apresFermeturePanneau = rendreEcranStock;

  function rendrePanneau(messageErreur) {
    const rayon = etat.rayons.find((r) => r.id === rayonId);

    panneauPlatEl.innerHTML = `
      <div class="panneau-entete">
        <span class="panneau-titre">✏️ Modifier le rayon</span>
        <button class="panneau-fermer" aria-label="Fermer">✕</button>
      </div>

      <div class="panneau-section-titre">Nom</div>
      <input type="text" id="rayon-nom" class="article-quantite-input" style="width:100%;" value="${rayon.nom}">

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

function ouvrirPanneauNouveauRayon(retour = fermerPanneau) {
  apresFermeturePanneau = rendreEcranStock;

  function rendrePanneau(messageErreur) {
    panneauPlatEl.innerHTML = `
      <div class="panneau-entete">
        <span class="panneau-titre">➕ Nouveau rayon</span>
        <button class="panneau-fermer" aria-label="Fermer">✕</button>
      </div>

      <div class="panneau-section-titre">Nom</div>
      <input type="text" id="rayon-nom" class="article-quantite-input" style="width:100%;" placeholder="Ex. Marché du dimanche">

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

// --- Démarrage ---

rendreEcranSemaine();
