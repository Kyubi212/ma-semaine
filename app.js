// Ma Semaine — point d'entrée de l'application.
// Étape 0 : gère uniquement la navigation entre les 4 écrans (contenu vide
// pour l'instant, chaque écran sera rempli aux étapes suivantes).

// Titre affiché en haut de l'écran, selon l'onglet actif.
const titresEcrans = {
  semaine: "Semaine",
  courses: "Courses",
  plats: "Plats & repas",
  stock: "Stock",
};

const titreElement = document.getElementById("titre-ecran");
const boutonsOnglets = document.querySelectorAll(".tab");

function afficherEcran(nomEcran) {
  // Cache tous les écrans, puis montre seulement celui demandé.
  document.querySelectorAll(".ecran").forEach((section) => {
    section.hidden = section.id !== `ecran-${nomEcran}`;
  });

  // Met à jour l'apparence des onglets (lequel est actif) et le titre.
  boutonsOnglets.forEach((bouton) => {
    const estActif = bouton.dataset.ecran === nomEcran;
    bouton.setAttribute("aria-current", estActif ? "true" : "false");
  });

  titreElement.textContent = titresEcrans[nomEcran] ?? "";
}

boutonsOnglets.forEach((bouton) => {
  bouton.addEventListener("click", () => {
    afficherEcran(bouton.dataset.ecran);
  });
});

// Écran de départ : Semaine (déjà visible dans le HTML, on force juste l'état
// des onglets pour rester cohérent).
afficherEcran("semaine");
