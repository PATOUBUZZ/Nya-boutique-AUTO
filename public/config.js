/* ============================================================================
   config.js — LE SEUL FICHIER À PERSONNALISER pour chaque nouvelle boutique
   (le nom, le logo, la description, le WhatsApp… se règlent ensuite depuis
    l'espace propriétaire « vendeur.html », sans toucher au code).
   ============================================================================ */
window.NB_CONFIG = {

  /* ── 0) BACK-END : SUPABASE (version « Supabase » du projet) ───────────────────────────────────────────── */
  backend: 'supabase',

  /* ── 1) SUPABASE (Supabase > Project Settings > API) ───────────────────────
     • supabaseUrl : « Project URL »            ex. https://abcdefgh.supabase.co
     • supabaseKey : clé PUBLIQUE (« anon » ou « publishable »).
       ⚠️ Ne mettez JAMAIS la clé « service_role » / « secret » ici.            */
  supabaseUrl: 'https://rsezkoimmpjygdxhfihm.supabase.co',
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzZXprb2ltbXBqeWdkeGhmaWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUzNTgxNTksImV4cCI6MjExMDkzNDE1OX0.K9RiSB35OxFiwdIed0rDyj8BSxQblCDUHz5ns-kfcr4',

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════
     MODE DOUBLE — TYPE DE BOUTIQUE
       'auto' : boutique classique (panier + commande WhatsApp) — comportement d'origine.
       'boutique'    : CONCESSIONNAIRE AUTOMOBILE — fiche technique, statut Disponible/Réservé/Vendu, filtres, jusqu'à 12 photos,
                    « Je suis intéressé / Demander un essai / Réserver une visite », paiement échelonné, reprise, commerciaux.
                    Nécessite le script SQL du mode auto (voir le guide). Les fichiers auto.js, auto.css et vendeur-auto.js
                    ne sont téléchargés QUE dans ce mode.
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════ */
  typeBoutique: 'auto',

  /* Réglages du mode 'auto' (ignorés en mode 'boutique') */
  auto: {
    photosMax: 12,              // photos par véhicule (1 à 12)
    venduVisibleJours: 7,       // un véhicule « Vendu » reste visible ce nombre de jours (preuve de ventes), puis quitte la grille
                                // (son lien reste valable et affiche « Vendu »). 0 = retiré de la grille dès la vente.
    horaires: 'Lundi – Samedi : 8 h – 19 h',   // affiché en bas du site ('' = masqué)

    // Commerciaux : 1 à 3 numéros WhatsApp (format international sans + ni espaces). Vide = numéro de la boutique.
    // Exemple : [{ nom: 'Koffi', whatsapp: '22961000000' }, { nom: 'Aïcha', whatsapp: '22962000000' }]
    commerciaux: [],
    repartition: 'choix',       // 'choix' = le client choisit son conseiller · 'aleatoire' = un conseiller attribué au hasard (toujours le même pour ce client)

    reprise: true,              // formulaire « Faire reprendre mon véhicule » (true / false)

    // Paiement en plusieurs fois (simulateur sur la fiche) — estimation indicative, envoyée au vendeur sur WhatsApp
    credit: {
      actif: true,
      tauxAnnuel: 0,            // 0 = sans intérêt (reste ÷ mois) ; ex. 12 = 12 % par an
      durees: [6, 12, 24, 36],  // durées proposées, en mois
      apportMinPourcent: 30,    // apport minimum, en % du prix
      note: ''                  // phrase sous le simulateur ('' = « Estimation indicative… »)
    },

    champsMasques: []           // champs de la fiche technique à masquer, ex. ['places', 'moteur'] (liste dans shared.js > CHAMPS_AUTO)
  },

  /* Liens de partage avec APERÇU (photo + nom + prix du produit dans WhatsApp / Facebook) : « …/v/<code> »
     null = automatique (oui en mode 'auto', non en mode 'boutique') · true / false = forcé.
     Fonctionne grâce à la fonction Cloudflare « functions/v/ » (voir le guide).
     ⚠️ Hébergement HORS Cloudflare Pages (Vercel…) : mettez false (les liens redeviennent « …/#code »). */
  liensApercu: null,

  /* ── 2) CACHE : durée pendant laquelle le navigateur du visiteur réutilise les
        données sans interroger Supabase. Les modifications du propriétaire
        apparaissent donc chez les visiteurs après ce délai (5 à 10 minutes).    */
  cacheMinutes: 5,

  /* ── 2 bis bis) AFFICHAGE INSTANTANÉ (cache des DONNÉES, dans le navigateur du visiteur)
        Quand le visiteur revient et que ses données ont plus de « cacheMinutes », la boutique s'affiche QUAND MÊME
        tout de suite avec ces données, puis se met à jour toute seule en arrière-plan (prix, produits, annonces…).
        Le panier se recale automatiquement sur les nouveaux prix avant toute commande.
        • cacheAffichageMaxHeures : âge maximum de ces données pour un affichage instantané.
          Au-delà, on attend le serveur (squelettes de chargement), comme avant.
          24 = recommandé · 0 = désactivé (comportement d'origine : attente du réseau dès que le cache a expiré).     */
  cacheAffichageMaxHeures: 24,

  /* ── 2 bis ter) CACHE DES FICHIERS DU SITE (.js, .css, icônes) — À LIRE, rien à régler ici
        Cette durée est envoyée par le serveur Cloudflare AVANT que ce fichier ne s'exécute : elle ne peut donc
        techniquement PAS se régler dans config.js. Elle se règle dans le fichier « public/_headers »
        (1 h par défaut, tout est expliqué dedans).
        ⚠️ Après chaque modification d'un fichier .js ou .css : changez le numéro « ?v=… » dans index.html ET vendeur.html.
        Ce fichier config.js n'est JAMAIS gardé en cache : ses modifications s'appliquent immédiatement.
        Rappel : dans index.html, remplacez aussi VOTRE-PROJET dans la ligne « preconnect » (connexion anticipée à Supabase). */

  /* ── 3) APPARENCE ───────────────────────────────────────────────────────────  */
  couleur: '#2563eb',        // couleur principale de la boutique (bleu par défaut)
  devise: 'FCFA',            // texte affiché après les prix
  lotAffichage: 12,          // nombre de produits ajoutés à chaque défilement (chargement progressif)
  vitesseBande: 45,          // vitesse de la bande défilante en haut (pixels par seconde)

  /* ── 2 bis) LOGO DU VENDEUR — simple : un fichier dans GitHub ─────────────────────────────────────────────
        1. Dans votre dépôt GitHub, ouvrez le dossier « public » et créez-y un dossier « logo » (s'il n'existe pas).
        2. Déposez l'image dedans : carrée, 256 × 256 px, PNG / WebP / SVG, moins de 100 Ko.   Ex. : public/logo/logo.webp
        3. Écrivez ci-dessous son chemin, SANS « public/ » :       logo: 'logo/logo.webp'
        Le logo apparaît sur le site, dans l'espace vendeur et comme icône d'onglet.
        Vous remplacez l'image sans changer son nom et l'ancienne s'affiche encore ? Ajoutez un numéro : 'logo/logo.webp?v=2'
        '' (vide) = pas de fichier : l'ancien réglage de la base de données (logo_url) est alors utilisé s'il existe. */
  logo: '',

  /* ── 2 ter) PROTECTION DU CONTENU (site visiteur et espace vendeur) ─────────────────────────────────────────
        true = activé (recommandé) · false = désactivé. Les champs de saisie (formulaires) restent normaux.
        • selectionTexte       : empêche de sélectionner / copier les textes
        • menuContextuel       : bloque le menu d'appui long (Android) et le clic droit
        • telechargementImages : bloque « Télécharger l'image », le glisser-déposer et l'appui long sur les photos
        ⚠️ C'est un frein, pas un coffre-fort : les captures d'écran restent possibles. */
  protection: { selectionTexte: true, menuContextuel: true, telechargementImages: true },

  /* ── 3 bis bis) BOUTONS SUR LA GRILLE ───────────────────────────────────────────────────────────────────
        true  = chaque produit de la grille 2×2 affiche « Commander » et « Ajouter au panier » (recommandé)
        false = grille d'origine (les boutons restent uniquement dans la fiche du produit)                        */
  boutonsGrille: true,

  /* ── 3 ter) EN-TÊTE AVEC IMAGE : conteneur à dimensions fixes (en pixels) ───────────────────────────────
        L'image de l'en-tête ne dépasse JAMAIS ces dimensions : elle est centrée et recadrée dans ce cadre.
        • largeurMax     : largeur maximale du cadre (ordinateur/tablette). Au-delà, des bandes de couleur l'entourent.
        • hauteur        : hauteur du cadre sur tablette et ordinateur (≥ 700 px d'écran).
        • hauteurMobile  : hauteur du cadre sur téléphone.
        • positionImage  : partie de l'image qu'on garde quand elle est recadrée : 'center' (défaut), 'top', 'bottom',
                           'left', 'right' ou un pourcentage ex. 'center 30%'.
        • voile          : voile sombre derrière les textes, de 0 (aucun) à 1 (normal). Mettez 0 avec une image claire
                           et un texte foncé (voir « theme » ci-dessous).
        Sécurité : la hauteur ne dépasse jamais 2/7 de la hauteur de l'écran (téléphone tenu en paysage, par exemple). */
  enteteImage: { largeurMax: 1000, hauteur: 250, hauteurMobile: 150, positionImage: 'center', voile: 1 },

  /* ── 3 quater) THÈME : personnalisation fine pour chaque vendeur ─────────────────────────────────────────
        TOUT est facultatif : laissez '' (ou supprimez la ligne) pour garder le style d'origine.
        Les couleurs s'écrivent en hexadécimal : '#fff', '#ffffff', '#1e293b'. Une valeur invalide est ignorée.

        EN-TÊTE
        • couleurNom         : couleur du NOM de la boutique                         ex. '#ffffff'
        • couleurDescription : couleur de la petite description sous le nom          ex. '#fde68a'
        • couleurIcones      : couleur des icônes du panier (TikTok/Facebook gardent leurs couleurs)
        • couleurFondEntete  : couleur UNIE de l'en-tête (remplace le dégradé de couleurPrincipale)
        • tailleNom          : taille du nom, en rem (0.8 à 2.4)   — 1 = normal, 1.3 = plus grand
        • tailleDescription  : taille de la description, en rem (0.6 à 1.4)
        • ombreTexteEntete   : false = supprime l'ombre derrière les textes de l'en-tête (utile si texte foncé)

        RESTE DU SITE
        • couleurBande / couleurTexteBande : fond et texte de la bande défilante (annonces)
        • couleurPromo       : couleur des prix barrés, étiquettes « -20 % », badge du panier
        • couleurFond        : fond des pages          • couleurCartes : fond des cartes produits
        • couleurTitres      : couleur des titres et noms de produits
        • couleurWhatsApp    : couleur des boutons WhatsApp
        • arrondis           : forme des coins : 'carre' | 'doux' (défaut) | 'rond'
        • police             : police du site, ex. "Georgia, serif" ou "'Trebuchet MS', sans-serif"
                               (polices déjà présentes sur l'appareil ; une police Google Fonts doit d'abord être ajoutée
                               dans <head> de index.html).

        EXEMPLE — image d'en-tête claire avec texte foncé :
          enteteImage: { …, voile: 0 },
          theme: { couleurNom: '#0f172a', couleurDescription: '#334155', couleurIcones: '#0f172a', ombreTexteEntete: false }   */
  theme: {
    couleurNom: '',
    couleurDescription: '',
    couleurIcones: '',
    couleurFondEntete: '',
    tailleNom: '',
    tailleDescription: '',
    ombreTexteEntete: true,
    couleurBande: '',
    couleurTexteBande: '',
    couleurPromo: '',
    couleurFond: '',
    couleurCartes: '',
    couleurTitres: '',
    couleurWhatsApp: '',
    arrondis: 'doux',
    police: ''
  },

  /* ── 3 bis) WHATSAPP DU DÉVELOPPEUR (boutons « Notifiez-nous » / « Contactez-nous » de l'espace propriétaire)
        Format international sans + ni espaces, ex. '22961000000'. Laissez '' pour masquer la barre.      */
  whatsappSupport: '22961196907',

  /* ── 4) RÉGLAGES AVANCÉS ────────────────────────────────────────────────────  */
  cleCache: 'nb_cache_v1',   // nom de la mémoire du navigateur (changez-le pour forcer une mise à jour chez tous)
  cleePanier: 'nb_panier_v1'
};
