/* ============================================================================
   app.js — Site visiteur de la boutique unique
   ----------------------------------------------------------------------------
   1. Charge boutique + produits visibles + annonces depuis Supabase (API REST publique, lecture seule),
      avec un CACHE navigateur de config.cacheMinutes minutes (5 par défaut).
   2. Bande défilante infinie (annonces) + en-tête fixe (logo, nom, panier).
   3. Grille 2×2, produits MÉLANGÉS à chaque chargement (sauf si boutique.melange_actif = false), affichage progressif
      par lots (lazy loading : les lots suivants se chargent au défilement, images en loading="lazy").
   4. Vue détail : galerie jusqu'à 4 photos, description, caractéristiques, boutons Commander / Ajouter au panier / Partager,
      bloc « Plus d'informations » (≤ 60 mots). PAS de défilement d'un produit à l'autre : bouton « Voir tous les produits ».
   5. Panier (mémorisé dans le navigateur) + commande envoyée sur WhatsApp.
   6. Pied de page : informations réelles de la boutique.
   Toutes les données affichées passent par textContent / setAttribute : aucune injection HTML possible.
   ============================================================================ */
(function () {
  'use strict';

  var NB = window.NB, cfg = NB.cfg, el = NB.el, $ = NB.$;

  var etat = {
    boutique: {}, produits: [], annonces: [], parId: {},
    ordre: [],            // ids dans l'ordre d'affichage de la grille (mélangé ou fixe)
    vueOrdre: [],         // ids réellement affichés (= ordre, ou ordre filtré en mode auto)
    affiches: 0,          // nombre de cartes déjà affichées
    vue: 'grille',        // 'grille' | 'detail'
    courant: null,        // produit affiché en détail
    photo: 0,             // index de la photo affichée
    scrollGrille: 0,
    panier: [],           // [{id, nom, prix, img, qte}]
    observateur: null
  };

  /* ───────────────────────────── Utilitaires ───────────────────────────── */
  var timerToast = null;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(timerToast); timerToast = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function melanger(tab) {                       // Fisher-Yates (copie, ne modifie pas l'original)
    var a = tab.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* Lien court : « …/#a1b2c3d4 » (8 caractères tirés de l'identifiant), comme sur Nya-Market.
     Les anciens liens longs « ?p=identifiant » continuent de fonctionner. */
  function construireCodes() {
    etat.codeDe = {}; etat.parCode = {};
    Object.keys(etat.parId).forEach(function (id) {
      var brut = id.replace(/-/g, '').toLowerCase(), c = brut.slice(0, 8);
      if (etat.parCode[c]) c = brut;                                    // collision (quasi impossible) : code complet
      etat.codeDe[id] = c; etat.parCode[c] = id;
    });
  }
  /** Chemin de la page d'accueil (sans « /v/<code> » quand on arrive par un lien de partage avec aperçu) */
  function cheminBase() { return location.pathname.replace(/\/v\/[^\/]*\/?$/, '/'); }
  function lienProduit(id) {
    var code = etat.codeDe && etat.codeDe[id] || encodeURIComponent(id);
    // MODE DOUBLE / APERÇU : « …/v/<code> » → la fonction Cloudflare met la photo et le prix du produit dans l'aperçu WhatsApp/Facebook
    if (cfg.liensApercu && etat.codeDe && etat.codeDe[id]) return location.origin + cheminBase() + 'v/' + code;
    return location.origin + cheminBase() + '#' + code;
  }
  /** Identifiant du produit demandé par l'adresse de la page (#code, ou ancien ?p=…) ; null si aucun */
  function idDansUrl() {
    var h = decodeURIComponent(location.hash.replace(/^#/, '')).toLowerCase().trim();
    if (h && etat.parCode[h]) return etat.parCode[h];
    var v = /\/v\/([0-9a-f]{8,32})\/?$/i.exec(location.pathname);             // lien de partage avec aperçu : /v/<code>
    if (v && etat.parCode[v[1].toLowerCase()]) return etat.parCode[v[1].toLowerCase()];
    var q = new URLSearchParams(location.search).get('p');
    if (q && etat.parId[q]) return q;
    return null;
  }

  function pourcentage(p) {
    return (p.ancien_prix && p.ancien_prix > p.prix) ? Math.round((1 - p.prix / p.ancien_prix) * 100) : 0;
  }

  /* ───────────────────────────── Chargement des données ───────────────────────────── */
  function rest(chemin) { return NB.lirePublic(chemin); }   // Supabase (config.js)

  /** OPTIMISATION : 1 seule requête (SQL/6 → catalogue_public), sinon les 3 anciennes requêtes ci-dessous (repli automatique). */
  function telecharger() {
    return NB.catalogueComplet().then(function (d) {
      return { t: Date.now(), boutique: d.boutique || {}, produits: d.produits || [], annonces: d.annonces || [] };
    }, telechargerAncien);
  }
  function telechargerAncien() {
    return Promise.all([
      // Les 2 nouveaux champs d'en-tête (SQL/5) sont demandés d'abord ; si la base n'est pas encore à jour, on retombe sur l'ancienne requête
      rest('boutique?select=nom,proprietaire,description,description_courte,header_image_url,ville,localisation,whatsapp,logo_url,melange_actif&id=eq.1')
        .catch(function () { return rest('boutique?select=nom,proprietaire,description,ville,localisation,whatsapp,logo_url,melange_actif&id=eq.1'); }),
      rest('produits?select=id,nom,prix,ancien_prix,description,caracteristiques,plus_infos,images,ordre,cree_le&visible=eq.true&order=ordre.asc,cree_le.desc&limit=1000'),
      rest('annonces?select=id,message,lien&visible=eq.true&order=ordre.asc,cree_le.asc')
    ]).then(function (r) { return { t: Date.now(), boutique: r[0][0] || {}, produits: r[1] || [], annonces: r[2] || [] }; });
  }
  /** Cache (localStorage) — 3 cas :
   *  1. Données fraîches (< cacheMinutes, 5 min par défaut) → affichées, AUCUN appel réseau (comme avant).
   *  2. OPTIMISATION « affichage instantané » : données expirées mais récentes (< cacheAffichageMaxHeures, 24 h par défaut)
   *     → affichées TOUT DE SUITE (pas d'attente, pas de squelettes), puis mises à jour en arrière-plan.
   *     Si quelque chose a changé (prix, produit, annonce…), la page se met à jour sans être rechargée (voir rafraichir()).
   *  3. Pas de cache, ou cache trop ancien → on attend le réseau (squelettes) ; si le réseau échoue, on retombe sur l'ancien cache. */
  function charger() {
    var c = NB.lire(cfg.cleCache);
    var valide = c && c.t && Array.isArray(c.produits), age = valide ? Date.now() - c.t : Infinity;
    if (age < cfg.cacheMinutes * 60000) return Promise.resolve(c);
    var reseau = telecharger().then(function (d) { NB.ecrire(cfg.cleCache, d); return d; });
    var maxAffichage = Math.max(0, Number(cfg.cacheAffichageMaxHeures) || 0) * 3600000;
    if (valide && age < maxAffichage) {
      reseau.then(function (d) { etat.miseAJour = d; if (etat.pret) rafraichir(d); }, function () { /* hors ligne : on garde l'affichage actuel */ });
      return Promise.resolve(c);
    }
    return reseau.catch(function (e) { if (valide) return c; throw e; });
  }

  /* ───────────────────────────── En-tête, bande défilante, pied de page ───────────────────────────── */
  function logo(conteneur, b) {
    conteneur.textContent = '';
    var u = NB.logoUrl(b);
    if (u) { var i = el('img', { src: u, alt: '', width: 46, height: 46, decoding: 'async' }); i.onerror = function () { conteneur.textContent = (b.nom || 'B').charAt(0).toUpperCase(); }; conteneur.appendChild(i); }
    else conteneur.textContent = (b.nom || 'B').charAt(0).toUpperCase();
  }

  function appliquerBoutique(b) {
    var nom = b.nom || 'Boutique';
    $('brand-name').textContent = nom;
    logo($('brand-logo'), b);
    document.title = nom;
    var og = document.querySelector('meta[property="og:title"]'); if (og) og.setAttribute('content', nom);
    var desc = (b.description || '').slice(0, 160);
    if (desc) {
      var m = document.querySelector('meta[name="description"]'); if (m) m.setAttribute('content', desc);
      var od = document.querySelector('meta[property="og:description"]'); if (od) od.setAttribute('content', desc);
    }
    var u = NB.logoUrl(b); if (u) $('favicon').setAttribute('href', u);
    appliquerEnteteImage(b);
  }

  /* ───────────────────────────── En-tête personnalisé : image de fond (2/7 de la hauteur de l'écran) + petite description ───────────────────────────── */
  function appliquerEnteteImage(b) {
    var header = document.querySelector('.site-header'), fond = $('header-bg'), slogan = $('brand-tagline');
    var court = String(b.description_courte || '').trim().slice(0, 90);
    slogan.textContent = court; slogan.hidden = !court;
    var u = NB.urlImage(b.header_image_url);
    if (!u) { header.classList.remove('has-bg'); fond.textContent = ''; fond.hidden = true; mesurerHaut(); return; }
    fond.textContent = '';
    var i = el('img', { src: u, alt: '', decoding: 'async', fetchpriority: 'high' });
    i.onerror = function () { header.classList.remove('has-bg'); fond.hidden = true; mesurerHaut(); };   // image introuvable : retour à l'en-tête classique
    fond.appendChild(i); fond.hidden = false; header.classList.add('has-bg'); mesurerHaut();
  }

  function construireBande(annonces) {
    var bande = $('ticker'), piste = $('ticker-track');
    piste.textContent = ''; piste.style.removeProperty('--dur');
    if (!annonces.length) { bande.hidden = true; mesurerHaut(); return; }
    bande.hidden = false;

    function jeu() {
      var s = el('div', { 'class': 'ticker-set' });
      annonces.forEach(function (a) {
        var lien = NB.urlLien(a.lien);
        var n = lien ? el('a', { 'class': 'ticker-item', href: lien, text: a.message }) : el('span', { 'class': 'ticker-item', text: a.message });
        if (lien && /^https:\/\//i.test(lien)) { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer'); }
        s.appendChild(n);
      });
      return s;
    }
    var reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var premier = jeu(); piste.appendChild(premier);
    if (reduit) { mesurerHaut(); return; }
    // Le jeu doit être plus large que l'écran pour que la boucle soit continue : on le répète au besoin (8 fois max)
    var largeurEcran = document.documentElement.clientWidth || 360, essais = 0;
    while (premier.getBoundingClientRect().width < largeurEcran && essais < 8) {
      annonces.length && Array.prototype.slice.call(jeu().childNodes).forEach(function (n) { premier.appendChild(n); });
      essais++;
    }
    var largeurJeu = premier.getBoundingClientRect().width || largeurEcran;
    piste.appendChild(premier.cloneNode(true));                 // 2e copie identique → défilement infini sans saut
    piste.style.setProperty('--dur', Math.max(8, largeurJeu / cfg.vitesseBande).toFixed(1) + 's');
    mesurerHaut();
  }

  function construirePied(b) {
    var pied = $('shop-info'); pied.textContent = '';
    var tete = el('div', { 'class': 'shop-head' });
    var lg = el('span', { 'class': 'brand-logo' }); logo(lg, b); tete.appendChild(lg);
    tete.appendChild(el('h2', { text: b.nom || 'Boutique' }));
    pied.appendChild(tete);
    if (b.description) pied.appendChild(el('p', { 'class': 'shop-desc', text: b.description }));
    if (b.proprietaire) pied.appendChild(el('div', { 'class': 'shop-row' }, [NB.icon('user', 18), el('span', { text: 'Propriétaire : ' + b.proprietaire })]));
    var lieu = [b.localisation, b.ville].filter(Boolean).join(', ');
    if (lieu) pied.appendChild(el('div', { 'class': 'shop-row' }, [NB.icon('pin', 18), el('span', { text: lieu })]));
    var liens = el('div', { 'class': 'shop-links' });
    var num = NB.chiffres(b.whatsapp);
    if (num) liens.appendChild(el('a', { 'class': 'link-wa', href: 'https://wa.me/' + num, target: '_blank', rel: 'noopener noreferrer' }, [NB.icon('whatsapp', 18), 'Nous contacter']));
    if (lieu) liens.appendChild(el('a', { 'class': 'link-map', href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(lieu), target: '_blank', rel: 'noopener noreferrer' }, [NB.icon('pin', 18), 'Voir sur la carte']));
    if (liens.childNodes.length) pied.appendChild(liens);
    if (NB.auto) NB.auto.decorerPied(pied, b);                // MODE AUTO : horaires, commerciaux, reprise de véhicule
    pied.appendChild(el('p', { 'class': 'copyright', text: '© ' + new Date().getFullYear() + ' ' + (b.nom || 'Boutique') + (NB.auto ? '' : ' · Paiement à la livraison') }));
    pied.hidden = false;
  }

  /** Hauteur de la zone fixe (bande + en-tête) → marge haute de la page */
  function mesurerHaut() {
    var h = $('top-fixed').offsetHeight;
    if (h) document.documentElement.style.setProperty('--top-h', h + 'px');
  }

  /* ───────────────────────────── Grille 2×2 (affichage progressif) ───────────────────────────── */
  function creerCarte(p) {
    var a = el('a', { 'class': 'card', href: '?p=' + encodeURIComponent(p.id), 'data-id': p.id });
    var img = el('div', { 'class': 'card-img' });
    var src = NB.miniature(p, 0);                          // OPTIMISATION : miniature ≈ 400 px (≈ 25 Ko) au lieu de la grande photo (≈ 130 Ko)
    if (src) {
      var im = el('img', { src: src, alt: p.nom, loading: 'lazy', decoding: 'async', width: 400, height: 400 });
      im.onload = function () { im.classList.add('ok'); };
      im.onerror = function () { im.classList.add('ok'); };
      if (im.complete) im.classList.add('ok');
      img.appendChild(im);
    }
    var pct = pourcentage(p);
    if (pct >= 1) img.appendChild(el('span', { 'class': 'badge-promo', text: '-' + pct + '%' }));
    var corps = el('div', { 'class': 'card-body' }, [
      el('h3', { 'class': 'card-name', text: p.nom }),
      el('div', { 'class': 'card-price' }, [el('span', { 'class': 'price', text: NB.prix(p.prix) }), p.ancien_prix > p.prix ? el('span', { 'class': 'price-old', text: NB.prix(p.ancien_prix) }) : null])
    ]);
    a.appendChild(img); a.appendChild(corps);
    if (NB.auto) NB.auto.decorerCarte(p, a, img, corps);  // MODE AUTO : étiquettes (année, km…), statut Réservé/Vendu
    if (cfg.boutonsGrille === false) return a;           // option config.js : boutons de grille désactivés → carte d'origine
    if (NB.auto) return NB.auto.boutonsGrille(p, a);     // MODE AUTO : « Je suis intéressé » au lieu du panier
    return ajouterBoutonsGrille(a, p);
  }

  /* ───────── AJOUT : boutons « Commander » et « Ajouter au panier » directement sur les cartes de la grille ─────────
     Les boutons sont placés À CÔTÉ du lien de la carte (pas dedans) : le clic sur la photo ou le nom ouvre toujours la fiche produit.
     Ils utilisent exactement les mêmes fonctions que la fiche produit (ajouterAuPanier, ouvrirPanier, toast). */
  function ajouterBoutonsGrille(a, p) {
    var bCommander = el('button', { 'class': 'btn btn-order', type: 'button', 'aria-label': 'Commander ' + p.nom }, [NB.icon('whatsapp', 16), el('span', { text: 'Commander' })]);
    var bAjouter = el('button', { 'class': 'btn btn-add', type: 'button', 'aria-label': 'Ajouter ' + p.nom + ' au panier' }, [NB.icon('cart', 16), el('span', { text: 'Ajouter au panier' })]);
    bCommander.onclick = function () { ajouterAuPanier(p, true); ouvrirPanier(); };
    bAjouter.onclick = function () {
      ajouterAuPanier(p, false);
      bAjouter.classList.add('done'); setTimeout(function () { bAjouter.classList.remove('done'); }, 1200);
      toast('Ajouté au panier ✓');
    };
    return el('div', { 'class': 'card-item' }, [a, el('div', { 'class': 'card-actions' }, [bCommander, bAjouter])]);
  }

  function ajouterLot() {
    var grille = $('grid'), ordre = etat.vueOrdre, fin = Math.min(etat.affiches + cfg.lotAffichage, ordre.length);
    var frag = document.createDocumentFragment();
    for (var i = etat.affiches; i < fin; i++) { var p = etat.parId[ordre[i]]; if (p) frag.appendChild(creerCarte(p)); }
    grille.appendChild(frag);
    etat.affiches = fin;
    if (etat.observateur && etat.affiches >= ordre.length) etat.observateur.disconnect();
  }

  /** Grille : etat.ordre = tous les produits ; etat.vueOrdre = ceux réellement affichés
      (MODE AUTO : après filtres, recherche, tri et masquage des véhicules vendus depuis longtemps). */
  function afficherGrille() {
    var g = $('grid'); g.textContent = ''; etat.affiches = 0;
    if (etat.observateur) etat.observateur.disconnect();
    etat.vueOrdre = NB.auto ? NB.auto.filtrer(etat.ordre) : etat.ordre;
    var msg = $('state-msg');
    if (!etat.vueOrdre.length) {
      msg.textContent = (NB.auto && etat.ordre.length) ? NB.auto.messageVide() : 'Aucun produit pour le moment. Revenez bientôt !';
      msg.hidden = false; return;
    }
    msg.hidden = true;
    ajouterLot();
    if ('IntersectionObserver' in window) {
      etat.observateur = etat.observateur || new IntersectionObserver(function (entrees) {
        if (entrees.some(function (e) { return e.isIntersecting; }) && etat.affiches < etat.vueOrdre.length) ajouterLot();
      }, { rootMargin: '700px 0px' });
      if (etat.affiches < etat.vueOrdre.length) etat.observateur.observe($('sentinel'));
    } else { while (etat.affiches < etat.vueOrdre.length) ajouterLot(); }
  }

  function squelettes() {
    var g = $('grid'); g.textContent = '';
    for (var i = 0; i < 6; i++) {
      var c = el('div', { 'class': 'card skeleton', 'aria-hidden': 'true' }, [el('div', { 'class': 'card-img' }), el('div', { 'class': 'card-body' }, [el('div', { 'class': 'sk-line' }), el('div', { 'class': 'sk-line', style: 'width:55%' })])]);
      g.appendChild(c);
    }
  }

  /* ───────────────────────────── Vue détail ───────────────────────────── */
  function montrerPhoto(i) {
    var p = etat.courant; if (!p) return;
    var n = p.images.length; etat.photo = (i + n) % n;
    var im = document.querySelector('#detail-view .g-main img');
    fondFlou(etat.photo);
    im.src = NB.urlImage(p.images[etat.photo]); im.alt = p.nom + ' — photo ' + (etat.photo + 1);
    var cpt = document.querySelector('#detail-view .g-count'); if (cpt) cpt.textContent = (etat.photo + 1) + ' / ' + n;
    Array.prototype.forEach.call(document.querySelectorAll('#detail-view .g-thumb'), function (b, k) { b.classList.toggle('active', k === etat.photo); b.setAttribute('aria-current', k === etat.photo ? 'true' : 'false'); });
    // Vignettes sur une ligne qui défile (mode auto, jusqu'à 12 photos) : la vignette active reste visible
    var vt = document.querySelectorAll('#detail-view .g-thumb')[etat.photo], boite = vt && vt.parentNode;
    if (boite && boite.scrollWidth > boite.clientWidth) {
      var dx = vt.getBoundingClientRect().left - boite.getBoundingClientRect().left - (boite.clientWidth - vt.offsetWidth) / 2;
      boite.scrollTo ? boite.scrollTo({ left: boite.scrollLeft + dx, behavior: 'smooth' }) : (boite.scrollLeft += dx);
    }
    prechargerVoisines();
  }

  /* OPTIMISATION « fluidité » de la galerie :
     • fondFlou : la miniature (déjà en mémoire grâce à la grille) s'affiche en fond pendant que la grande photo arrive :
       plus d'écran gris, la photo se précise simplement.
     • prechargerVoisines : la photo suivante et la précédente sont téléchargées pendant que le client regarde
       la photo actuelle → le balayage est instantané. Au plus 2 photos à l'avance (pas de gaspillage).          */
  function fondFlou(k) {
    var g = document.querySelector('#detail-view .g-main'), p = etat.courant; if (!g || !p) return;
    var mini = p.miniatures && p.miniatures[k];
    g.style.backgroundImage = mini && mini !== p.images[k] ? 'url("' + mini.replace(/["\\\n]/g, '') + '")' : '';
  }
  var prechargees = {};
  function prechargerVoisines() {
    var p = etat.courant; if (!p || p.images.length < 2) return;
    var n = p.images.length;
    [etat.photo + 1, etat.photo - 1].forEach(function (k) {
      var u = NB.urlImage(p.images[(k + n) % n]);
      if (u && !prechargees[u]) { prechargees[u] = true; var i = new Image(); i.decoding = 'async'; i.src = u; }
    });
  }

  function construireDetail(p) {
    var v = $('detail-view'); v.textContent = '';
    var original = p, photos = [], minis = [];
    (p.images || []).forEach(function (u, k) { if (NB.urlImage(u)) { photos.push(u); minis.push(NB.miniature(original, k)); } });
    p = Object.assign({}, p, { images: photos.length ? photos : [''], miniatures: photos.length ? minis : [''] });
    etat.courant = p; etat.photo = 0;

    // — Galerie —
    var principale = el('div', { 'class': 'g-main' }, [el('img', { src: NB.urlImage(photos[0]), alt: p.nom, decoding: 'async', fetchpriority: 'high' })]);
    var galerie = el('div', { 'class': 'gallery' }, [principale]);
    if (photos.length > 1) {
      var prec = el('button', { 'class': 'g-nav g-prev', type: 'button', 'aria-label': 'Photo précédente' }, [NB.icon('left', 20)]);
      var suiv = el('button', { 'class': 'g-nav g-next', type: 'button', 'aria-label': 'Photo suivante' }, [NB.icon('right', 20)]);
      prec.onclick = function () { montrerPhoto(etat.photo - 1); };
      suiv.onclick = function () { montrerPhoto(etat.photo + 1); };
      principale.appendChild(prec); principale.appendChild(suiv);
      principale.appendChild(el('span', { 'class': 'g-count', text: '1 / ' + photos.length }));
      var thumbs = el('div', { 'class': 'g-thumbs' });
      photos.forEach(function (u, k) {
        var b = el('button', { 'class': 'g-thumb' + (k === 0 ? ' active' : ''), type: 'button', 'aria-label': 'Voir la photo ' + (k + 1) }, [el('img', { src: minis[k], alt: '', loading: k === 0 ? 'eager' : 'lazy', decoding: 'async' })]);   // OPTIMISATION : vignette = miniature
        b.onclick = function () { montrerPhoto(k); };
        thumbs.appendChild(b);
      });
      galerie.appendChild(thumbs);
      // Balayage gauche/droite sur la photo (change de PHOTO, jamais de produit)
      var x0 = null;
      principale.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
      principale.addEventListener('touchend', function (e) {
        if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; x0 = null;
        if (Math.abs(dx) > 45) montrerPhoto(etat.photo + (dx < 0 ? 1 : -1));
      }, { passive: true });
    }
    v.appendChild(galerie);
    fondFlou(0); prechargerVoisines();

    // — Infos —
    var pct = pourcentage(p);
    var carte = el('div', { 'class': 'd-card' }, [
      el('h1', { 'class': 'd-name', text: p.nom }),
      el('div', { 'class': 'd-price' }, [el('span', { 'class': 'price', text: NB.prix(p.prix) }), p.ancien_prix > p.prix ? el('span', { 'class': 'price-old', text: NB.prix(p.ancien_prix) }) : null, pct >= 1 ? el('span', { 'class': 'badge-promo', text: '-' + pct + '%' }) : null])
    ]);
    if (p.description) carte.appendChild(el('p', { 'class': 'd-desc', text: p.description }));
    if (NB.auto) NB.auto.decorerFiche(original, carte, v);   // MODE AUTO : statut, étiquettes, fiche technique, vidéo
    if (p.caracteristiques && p.caracteristiques.length) {
      carte.appendChild(el('h2', { 'class': 'd-h', text: 'Caractéristiques' }));
      carte.appendChild(el('ul', { 'class': 'features' }, p.caracteristiques.map(function (c) { return el('li', { text: c }); })));
    }
    // — Boutons —
    var bCommander = el('button', { 'class': 'btn btn-order', type: 'button' }, [NB.icon('whatsapp', 20), 'Commander']);
    var bAjouter = el('button', { 'class': 'btn btn-add', type: 'button' }, [NB.icon('cart', 20), 'Ajouter au panier']);
    var bPartager = el('button', { 'class': 'btn btn-share', type: 'button', 'aria-label': 'Partager ce produit' }, [NB.icon('share', 20)]);
    bCommander.onclick = function () { ajouterAuPanier(original, true); ouvrirPanier(); };
    bAjouter.onclick = function () { ajouterAuPanier(original, false); bAjouter.classList.add('done'); setTimeout(function () { bAjouter.classList.remove('done'); }, 1200); toast('Ajouté au panier ✓'); };
    bPartager.onclick = function () { partager(p); };
    // MODE AUTO : « Je suis intéressé », « Demander un essai », « Réserver une visite » au lieu du panier
    carte.appendChild(NB.auto ? NB.auto.actionsFiche(original, bPartager) : el('div', { 'class': 'actions' }, [bCommander, bAjouter, bPartager]));
    v.appendChild(carte);

    // — Plus d'informations (message marketing du vendeur, ≤ 60 mots) —
    if (p.plus_infos && p.plus_infos.trim()) {
      v.appendChild(el('section', { 'class': 'd-card more-info', 'aria-labelledby': 'more-h' }, [el('h2', { id: 'more-h', text: 'Plus d’informations' }), el('p', { text: p.plus_infos })]));
    }
    if (NB.auto) NB.auto.apresFiche(original, v);             // MODE AUTO : simulateur de paiement échelonné, reprise
  }

  function partager(p) {
    var url = lienProduit(p.id), texte = p.nom + ' — ' + NB.prix(p.prix);
    if (navigator.share) {
      navigator.share({ title: p.nom, text: texte, url: url }).catch(function () { /* annulé par l'utilisateur */ });
      return;
    }
    function ok() { toast('Lien du produit copié ✓'); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, function () { window.prompt('Copiez ce lien :', url); });
    else window.prompt('Copiez ce lien :', url);
  }

  function ouvrirProduit(id, pousser) {
    var p = etat.parId[id];
    if (!p) { afficherVueGrille(pousser); return; }
    if (etat.vue === 'grille') etat.scrollGrille = window.pageYOffset;
    construireDetail(p);
    etat.vue = 'detail';
    $('grid-view').hidden = true; $('detail-view').hidden = false; $('all-btn').hidden = false;
    document.title = p.nom + ' · ' + (etat.boutique.nom || 'Boutique');
    if (pousser) { try { history.pushState({ p: id }, '', cheminBase() + '#' + etat.codeDe[id]); } catch (e) { /* file:// */ } }
    window.scrollTo(0, 0);
  }

  function afficherVueGrille(pousser) {
    var etaitDetail = etat.vue === 'detail';
    etat.vue = 'grille'; etat.courant = null;
    $('detail-view').hidden = true; $('grid-view').hidden = false; $('all-btn').hidden = true;
    document.title = etat.boutique.nom || 'Boutique';
    if (pousser) { try { history.pushState({}, '', cheminBase()); } catch (e) { /* file:// */ } }
    window.scrollTo(0, etaitDetail ? etat.scrollGrille : 0);
  }

  /* ───────────────────────────── Panier & commande WhatsApp ───────────────────────────── */
  function sauverPanier() { NB.ecrire(cfg.cleePanier, etat.panier); majBadge(); }
  function chargerPanier() {
    var s = NB.lire(cfg.cleePanier);
    etat.panier = Array.isArray(s) ? s.filter(function (i) { return i && i.id && i.qte > 0 && isFinite(i.prix); }).slice(0, 50) : [];
  }
  /** Aligne le panier sur le catalogue actuel (prix modifiés, produits retirés) */
  function synchroniserPanier() {
    etat.panier = etat.panier.filter(function (i) { return etat.parId[i.id]; }).map(function (i) {
      var p = etat.parId[i.id]; return { id: i.id, nom: p.nom, prix: p.prix, img: NB.miniature(p, 0), qte: Math.min(99, i.qte) };
    });
    sauverPanier();
  }
  function majBadge() {
    var n = etat.panier.reduce(function (s, i) { return s + i.qte; }, 0), b = $('cart-count');
    b.textContent = String(n); b.hidden = n === 0;
  }
  function ajouterAuPanier(p, sansIncrementer) {
    var l = etat.panier.filter(function (i) { return i.id === p.id; })[0];
    if (l) { if (!sansIncrementer) l.qte = Math.min(99, l.qte + 1); }
    else etat.panier.push({ id: p.id, nom: p.nom, prix: p.prix, img: NB.miniature(p, 0), qte: 1 });
    sauverPanier();
    var c = $('cart-btn'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
  }
  function total() { return etat.panier.reduce(function (s, i) { return s + i.prix * i.qte; }, 0); }

  function dessinerPanier() {
    var liste = $('cart-list'); liste.textContent = '';
    var vide = etat.panier.length === 0;
    $('cart-empty').hidden = !vide; $('cart-total-row').hidden = vide; $('order-form').hidden = vide;
    etat.panier.forEach(function (i) {
      var moins = el('button', { type: 'button', 'aria-label': 'Diminuer la quantité' }, [NB.icon('minus', 14)]);
      var plus = el('button', { type: 'button', 'aria-label': 'Augmenter la quantité' }, [NB.icon('plus', 14)]);
      var suppr = el('button', { 'class': 'ci-remove', type: 'button', 'aria-label': 'Retirer ' + i.nom }, [NB.icon('trash', 18)]);
      moins.onclick = function () { i.qte = Math.max(1, i.qte - 1); sauverPanier(); dessinerPanier(); };
      plus.onclick = function () { i.qte = Math.min(99, i.qte + 1); sauverPanier(); dessinerPanier(); };
      suppr.onclick = function () { etat.panier = etat.panier.filter(function (x) { return x !== i; }); sauverPanier(); dessinerPanier(); };
      var li = el('li', { 'class': 'cart-item' }, [
        i.img ? el('img', { src: i.img, alt: '', loading: 'lazy', width: 56, height: 56 }) : el('span'),
        el('div', {}, [el('div', { 'class': 'ci-name', text: i.nom }), el('div', { 'class': 'ci-price', text: NB.prix(i.prix) }), el('div', { 'class': 'qty' }, [moins, el('span', { text: String(i.qte) }), plus])]),
        suppr
      ]);
      liste.appendChild(li);
    });
    $('cart-total').textContent = NB.prix(total());
  }

  var dernierFocus = null;
  function ouvrirPanier() {
    dernierFocus = document.activeElement; dessinerPanier();
    $('cart-modal').hidden = false; document.body.classList.add('no-scroll'); $('cart-close').focus();
  }
  function fermerPanier() {
    $('cart-modal').hidden = true; document.body.classList.remove('no-scroll');
    if (dernierFocus && dernierFocus.focus) dernierFocus.focus();
  }

  function envoyerCommande(e) {
    e.preventDefault();
    var err = $('order-error'); err.hidden = true;
    var nom = $('o-nom').value.trim(), tel = $('o-tel').value.trim(), adr = $('o-adresse').value.trim(), note = $('o-note').value.trim();
    var gps = etat.position;
    function erreur(m) { err.textContent = m; err.hidden = false; }
    if (!etat.panier.length) return erreur('Votre panier est vide.');
    if (nom.length < 2) return erreur('Indiquez votre nom.');
    if (adr.length < 3 && !gps) return erreur('Indiquez votre quartier ou adresse de livraison (ou touchez « Utiliser ma position »).');
    var num = NB.chiffres(etat.boutique.whatsapp);
    if (!num) return erreur('Le vendeur n’a pas encore renseigné son numéro WhatsApp.');

    var lignes = ['🛒 *Nouvelle commande — ' + (etat.boutique.nom || 'Boutique') + '*', ''];
    etat.panier.forEach(function (i, k) {
      lignes.push((k + 1) + '. ' + i.nom + ' × ' + i.qte + ' — ' + NB.prix(i.prix * i.qte));
      lignes.push('   ' + lienProduit(i.id));
    });
    lignes.push('', '*Total : ' + NB.prix(total()) + '*', '', '👤 ' + nom);
    if (tel) lignes.push('📞 ' + tel);
    if (adr) lignes.push('📍 ' + adr);
    if (gps) lignes.push('🧭 Position GPS (±' + gps.precision + ' m) : https://www.google.com/maps?q=' + gps.lat + ',' + gps.lng);
    if (note) lignes.push('📝 ' + note);
    lignes.push('', 'Paiement à la livraison.');

    var url = 'https://wa.me/' + num + '?text=' + encodeURIComponent(lignes.join('\n'));
    var w = window.open(url, '_blank');                       // (pas de « noopener » ici : il ferait renvoyer null même quand la fenêtre s'ouvre)
    if (w) { try { w.opener = null; } catch (err) { /* sans gravité */ } }
    else location.href = url;                                 // fenêtre bloquée : on ouvre dans le même onglet
    etat.panier = []; sauverPanier(); fermerPanier(); toast('Commande prête : validez l’envoi dans WhatsApp ✓');
    $('order-form').reset(); retirerPosition();
  }

  /* ───────────────────────────── Position GPS du client (facultative) ─────────────────────────────
     Le client touche « Utiliser ma position » : le navigateur demande son accord, puis le lien Google Maps de sa
     position est ajouté au message WhatsApp. Rien n'est enregistré ni envoyé ailleurs ; fonctionne en https uniquement. */
  function majPosition(texte, classe, avecRetrait) {
    var s = $('geo-status'); s.textContent = texte || ''; s.className = 'geo-status' + (classe ? ' ' + classe : ''); s.hidden = !texte;
    if (avecRetrait) { var b = el('button', { type: 'button', text: 'Retirer' }); b.onclick = retirerPosition; s.appendChild(b); }
  }
  function retirerPosition() { etat.position = null; majPosition(''); $('geo-label').textContent = 'Utiliser ma position (GPS)'; }
  function obtenirPosition() {
    var btn = $('geo-btn');
    if (!navigator.geolocation) return majPosition('La position n’est pas disponible sur cet appareil : écrivez votre quartier.', 'ko');
    btn.disabled = true; $('geo-label').textContent = 'Recherche de votre position…'; majPosition('');
    navigator.geolocation.getCurrentPosition(function (pos) {
      btn.disabled = false;
      etat.position = { lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6), precision: Math.round(pos.coords.accuracy || 0) };
      $('geo-label').textContent = 'Actualiser ma position';
      majPosition('📍 Position ajoutée ✓ (précision ≈ ' + etat.position.precision + ' m)', 'ok', true);
    }, function (err) {
      btn.disabled = false; $('geo-label').textContent = 'Utiliser ma position (GPS)';
      majPosition(err && err.code === 1 ? 'Position refusée : autorisez la localisation dans votre navigateur, ou écrivez votre quartier.'
        : err && err.code === 3 ? 'Position trop longue à obtenir : réessayez, ou écrivez votre quartier.'
        : 'Position introuvable : écrivez votre quartier.', 'ko');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }


  /* ───────────────────────────── Navigation (historique du navigateur) ───────────────────────────── */
  function surNavigation() {
    var id = idDansUrl();
    if (id) ouvrirProduit(id, false); else afficherVueGrille(false);
  }

  /* ───────────────────────────── Démarrage ───────────────────────────── */
  /** Prépare l'état à partir des données : index par identifiant, codes courts, liste des produits affichables. */
  function preparer(d) {
    etat.boutique = d.boutique || {}; etat.produits = d.produits || []; etat.annonces = d.annonces || [];
    etat.parId = {}; etat.produits.forEach(function (p) { if (p && p.id && p.nom && p.images && p.images.length) etat.parId[p.id] = p; });
    construireCodes();
    etat.signature = signature(d);
    return Object.keys(etat.parId).map(function (k) { return etat.parId[k]; });
  }
  /** Empreinte des données affichées : sert à savoir si la mise à jour en arrière-plan apporte du nouveau. */
  function signature(d) { return JSON.stringify([d.boutique || {}, d.produits || [], d.annonces || []]); }
  function ordreFixe(valides) {
    return valides.slice().sort(function (a, b) { return (a.ordre - b.ordre) || (String(b.cree_le).localeCompare(String(a.cree_le))); }).map(function (p) { return p.id; });
  }

  function afficherDonnees(d) {
    var valides = preparer(d);
    // Ordre : mélangé à chaque chargement, sauf si le développeur a désactivé le mélange dans Supabase (boutique.melange_actif = false)
    etat.ordre = etat.boutique.melange_actif === false ? ordreFixe(valides) : melanger(valides).map(function (p) { return p.id; });

    appliquerBoutique(etat.boutique); construireBande(etat.annonces); construirePied(etat.boutique);
    synchroniserPanier();
    afficherGrille();
    var id = idDansUrl();                                         // lien de partage : on ouvre directement le produit
    if (id) ouvrirProduit(id, false);
    mesurerHaut();
    etat.pret = true;
    if (etat.miseAJour && etat.miseAJour !== d) rafraichir(etat.miseAJour);   // mise à jour arrivée pendant l'affichage
  }

  /** OPTIMISATION « affichage instantané » : applique en douceur les données arrivées en arrière-plan.
   *  Ne fait RIEN si rien n'a changé. Sinon : le visiteur garde sa place (même ordre des produits, même position dans la page,
   *  même fiche ouverte), seuls les éléments modifiés sont redessinés. Le panier est recalé sur les nouveaux prix. */
  function rafraichir(d) {
    etat.miseAJour = null;
    if (!d || signature(d) === etat.signature) return;
    var ancienne = { boutique: JSON.stringify(etat.boutique), annonces: JSON.stringify(etat.annonces), courant: etat.courant && JSON.stringify(etat.parId[etat.courant.id] || null) };
    var ancienOrdre = etat.ordre, dejaAffiches = etat.affiches, y = window.pageYOffset;
    var valides = preparer(d);

    // Ordre : on garde celui que le visiteur a sous les yeux ; les nouveaux produits s'ajoutent à la fin, les produits retirés disparaissent
    if (etat.boutique.melange_actif === false) etat.ordre = ordreFixe(valides);
    else {
      var garde = ancienOrdre.filter(function (id) { return etat.parId[id]; }), vus = {};
      garde.forEach(function (id) { vus[id] = true; });
      etat.ordre = garde.concat(melanger(valides.filter(function (p) { return !vus[p.id]; })).map(function (p) { return p.id; }));
    }

    if (JSON.stringify(etat.boutique) !== ancienne.boutique) { appliquerBoutique(etat.boutique); construirePied(etat.boutique); }
    if (JSON.stringify(etat.annonces) !== ancienne.annonces) construireBande(etat.annonces);
    synchroniserPanier();
    if (!$('cart-modal').hidden) dessinerPanier();

    // Grille : redessinée avec le même nombre de cartes, puis retour à la même position
    afficherGrille();
    while (etat.affiches < Math.min(dejaAffiches, etat.vueOrdre.length)) ajouterLot();
    if (etat.vue === 'grille') window.scrollTo(0, y);

    // Fiche ouverte : redessinée seulement si CE produit a changé ; s'il a été retiré, retour à la grille
    if (etat.vue === 'detail' && etat.courant) {
      var id = etat.courant.id;
      if (!etat.parId[id]) { afficherVueGrille(false); try { history.replaceState({}, '', cheminBase()); } catch (e) { /* file:// */ } }
      else if (JSON.stringify(etat.parId[id]) !== ancienne.courant) { var photo = etat.photo; construireDetail(etat.parId[id]); if (photo) montrerPhoto(photo); }
    }
    mesurerHaut();
  }

  function afficherErreur() {
    var m = $('state-msg'); m.textContent = ''; $('grid').textContent = '';
    m.appendChild(el('p', { text: 'Impossible de charger la boutique. Vérifiez votre connexion.' }));
    var b = el('button', { 'class': 'btn btn-add', type: 'button', text: 'Réessayer' }); b.onclick = demarrer;
    m.appendChild(b); m.hidden = false;
  }

  function demarrer() {
    $('state-msg').hidden = true; squelettes();
    NB.oublierCatalogue();                                      // « Réessayer » : vrai nouvel essai réseau
    charger().then(afficherDonnees).catch(function (e) { if (window.console) console.error(e); afficherErreur(); });
  }

  function init() {
    NB.appliquerCouleur();
    $('cart-icon').appendChild(NB.icon('cart', 22));
    $('all-icon').appendChild(NB.icon('grid', 18));
    $('wa-icon').appendChild(NB.icon('whatsapp', 20));
    $('geo-icon').appendChild(NB.icon('pin', 18)); $('geo-btn').onclick = obtenirPosition;
    $('cart-close').appendChild(NB.icon('close', 18));
    chargerPanier(); majBadge();

    $('cart-btn').onclick = ouvrirPanier;
    $('cart-close').onclick = fermerPanier;
    $('cart-modal').addEventListener('click', function (e) { if (e.target.hasAttribute('data-close')) fermerPanier(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('cart-modal').hidden) fermerPanier();
      if (e.key === 'Tab' && !$('cart-modal').hidden) {                       // le focus reste dans la fenêtre
        var f = $('cart-modal').querySelectorAll('button:not([hidden]), input, a[href]');
        var vis = Array.prototype.filter.call(f, function (n) { return n.offsetParent !== null; });
        if (!vis.length) return;
        var a = vis[0], z = vis[vis.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    });
    $('order-form').addEventListener('submit', envoyerCommande);
    $('all-btn').onclick = function () { afficherVueGrille(true); };
    $('brand-link').addEventListener('click', function (e) { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); if (etat.vue === 'detail') afficherVueGrille(true); else window.scrollTo({ top: 0, behavior: 'smooth' }); });
    $('grid').addEventListener('click', function (e) {                       // clic sur une carte → vue détail (sans recharger la page)
      var a = e.target.closest && e.target.closest('a.card'); if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault(); ouvrirProduit(a.getAttribute('data-id'), true);
    });
    window.addEventListener('popstate', surNavigation);
    window.addEventListener('hashchange', function () { if (etat.parCode) surNavigation(); });
    window.addEventListener('resize', mesurerHaut);
    if ('ResizeObserver' in window) new ResizeObserver(mesurerHaut).observe($('top-fixed'));
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    // Outils partagés avec le module auto (auto.js)
    NB.app = { etat: etat, afficherGrille: afficherGrille, ouvrirProduit: ouvrirProduit, lienProduit: lienProduit, partager: partager, toast: toast };

    if (!NB.estAuto) { demarrer(); return; }
    // MODE AUTO : le panier est remplacé par des demandes WhatsApp ; auto.js est chargé PENDANT le téléchargement des données
    $('cart-btn').hidden = true;
    if (NB.configOk()) NB.catalogueComplet();
    NB.module('auto').then(function () { if (NB.auto) NB.auto.init(); }, function (e) { if (window.console) console.error(e); $('cart-btn').hidden = false; })
      .then(demarrer);                                          // même si auto.js manque, la boutique s'affiche (mode classique)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
