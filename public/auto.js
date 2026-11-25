/* ============================================================================
   auto.js — MODE CONCESSIONNAIRE AUTOMOBILE (site visiteur)
   ----------------------------------------------------------------------------
   Chargé UNIQUEMENT si config.js > typeBoutique = 'auto' (par shared.js / app.js). Une boutique classique ne le télécharge pas.
   app.js appelle ces fonctions à quelques endroits précis (« points d'accroche », repérés par « MODE AUTO » dans app.js) :
     filtrer, messageVide, decorerCarte, boutonsGrille, decorerFiche, actionsFiche, apresFiche, decorerPied.
   Ce que ce module ajoute :
     • Fiche technique (marque, modèle, année, km, carburant, boîte…) + étiquettes sur les cartes de la grille.
     • Statut Disponible / Réservé / Vendu (un véhicule vendu reste visible « venduVisibleJours » jours, puis disparaît de la grille).
     • Recherche, filtres (marque, carburant, boîte, état, année, prix) et tri — dans le navigateur, sans requête au serveur.
     • « Je suis intéressé », « Demander un essai », « Réserver une visite » : messages WhatsApp pré-remplis (le panier est masqué).
     • Simulateur de paiement échelonné, formulaire de reprise de véhicule, plusieurs commerciaux, horaires, lien vidéo.
   Sécurité : tous les textes passent par textContent / setAttribute (fonction el) ; liens vidéo en https uniquement.
   ============================================================================ */
(function () {
  'use strict';
  var NB = window.NB; if (!NB || !NB.estAuto) return;
  var cfg = NB.cfg, el = NB.el, A = cfg.auto || {};
  var CHAMPS = NB.CHAMPS_AUTO, PAR_CLE = {};
  CHAMPS.forEach(function (c) { PAR_CLE[c.k] = c; });
  var JOURS_VENDU = isFinite(parseInt(A.venduVisibleJours, 10)) ? parseInt(A.venduVisibleJours, 10) : 7;

  /* ───────────────────────────── Outils ───────────────────────────── */
  function attr(p) { return NB.attributs(p); }
  function nombre(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  /** Valeur d'un champ, prête à afficher ('' si vide) */
  function valeur(p, k) {
    var c = PAR_CLE[k], v = attr(p)[k];
    if (!c || v === undefined || v === null || v === '') return '';
    if (c.type === 'ouinon') return v === true || v === 'oui' ? 'Oui' : (v === false || v === 'non' ? 'Non' : '');
    if (c.type === 'nombre') { if (!isFinite(Number(v))) return ''; return (k === 'annee' ? String(v) : nombre(v)) + (c.unite ? ' ' + c.unite : ''); }
    return String(v).slice(0, 200);
  }
  function lienVideo(p) { var u = String(attr(p).video || '').trim(); return /^https:\/\/[^\s]+$/i.test(u) ? u : ''; }
  function code(p) { var c = NB.app.etat.codeDe && NB.app.etat.codeDe[p.id]; return String(c || p.id).slice(0, 8).toUpperCase(); }
  function titre(p) { return p.nom; }
  function venduDepuis(p) { var t = Date.parse(p.vendu_le || ''); return isFinite(t) ? (Date.now() - t) / 86400000 : 0; }
  function cacheDansGrille(p) { return NB.statut(p) === 'vendu' && venduDepuis(p) > JOURS_VENDU; }
  function etiquettes(p) {
    return CHAMPS.filter(function (c) { return c.carte; }).map(function (c) { return valeur(p, c.k); }).filter(Boolean);
  }

  /* ───────────────────────────── WhatsApp : commerciaux ─────────────────────────────
     config.js > auto.commerciaux : [{ nom: 'Koffi', whatsapp: '22961000000' }, …] (3 maximum conseillé).
     auto.repartition : 'choix' (le client choisit) ou 'aleatoire' (un commercial tiré au sort, toujours le même pour ce client).
     Sans commerciaux : le numéro WhatsApp de la boutique (réglé dans l'espace vendeur). */
  function commerciaux() {
    var l = (Array.isArray(A.commerciaux) ? A.commerciaux : []).map(function (c) { return { nom: String((c && c.nom) || '').slice(0, 40), num: NB.chiffres(c && c.whatsapp) }; })
      .filter(function (c) { return c.num.length >= 8 && c.num.length <= 15; });
    if (!l.length) { var n = NB.chiffres(NB.app.etat.boutique.whatsapp); if (n) l.push({ nom: '', num: n }); }
    return l;
  }
  function ouvrirWhatsApp(num, texte) {
    var url = 'https://wa.me/' + num + '?text=' + encodeURIComponent(texte);
    var w = window.open(url, '_blank');
    if (w) { try { w.opener = null; } catch (e) { /* sans gravité */ } } else location.href = url;
  }
  /** Envoie le message au bon commercial (choix du client, ou tirage au sort mémorisé) */
  function envoyer(texte) {
    var l = commerciaux();
    if (!l.length) { NB.app.toast('Le vendeur n’a pas encore renseigné son numéro WhatsApp.'); return; }
    if (l.length === 1) return ouvrirWhatsApp(l[0].num, texte);
    if (A.repartition === 'aleatoire') {
      var k = parseInt(NB.lire('nb_auto_commercial'), 10);
      if (!(k >= 0 && k < l.length)) { k = Math.floor(Math.random() * l.length); NB.ecrire('nb_auto_commercial', k); }
      return ouvrirWhatsApp(l[k].num, texte);
    }
    var corps = el('div', { 'class': 'auto-commerciaux' });
    corps.appendChild(el('p', { 'class': 'auto-note', text: 'Choisissez votre conseiller :' }));
    l.forEach(function (c, i) {
      var b = el('button', { 'class': 'btn btn-order', type: 'button' }, [NB.icon('whatsapp', 18), el('span', { text: c.nom || ('Conseiller ' + (i + 1)) })]);
      b.onclick = function () { fermer(); ouvrirWhatsApp(c.num, texte); };
      corps.appendChild(b);
    });
    var fermer = modale('Contacter un conseiller', corps);
  }
  function resume(p) {
    var l = ['*' + titre(p) + '*' + (NB.statut(p) !== 'disponible' ? ' (' + NB.STATUTS[NB.statut(p)] + ')' : ''), 'Prix : ' + NB.prix(p.prix) + (attr(p).prixMention ? ' (' + attr(p).prixMention + ')' : '')];
    var e = etiquettes(p); if (e.length) l.push(e.join(' · '));
    l.push('Réf. ' + code(p), NB.app.lienProduit(p.id));
    return l.join('\n');
  }

  /* ───────────────────────────── Fenêtre (modale) générique ───────────────────────────── */
  function modale(titreTexte, contenu) {
    var fond = el('div', { 'class': 'modal-backdrop' });
    var btnX = el('button', { 'class': 'icon-btn', type: 'button', 'aria-label': 'Fermer' }, [NB.icon('close', 18)]);
    var boite = el('div', { 'class': 'modal-box', role: 'dialog', 'aria-modal': 'true', 'aria-label': titreTexte }, [
      el('div', { 'class': 'modal-head' }, [el('h2', { text: titreTexte }), btnX]),
      el('div', { 'class': 'modal-body' }, [contenu])
    ]);
    var m = el('div', { 'class': 'modal auto-modal' }, [fond, boite]);
    var avant = document.activeElement;
    function fermer() { if (m.parentNode) m.parentNode.removeChild(m); document.body.classList.remove('no-scroll'); document.removeEventListener('keydown', echap); if (avant && avant.focus) avant.focus(); }
    function echap(e) { if (e.key === 'Escape') fermer(); }
    fond.onclick = fermer; btnX.onclick = fermer; document.addEventListener('keydown', echap);
    document.body.appendChild(m); document.body.classList.add('no-scroll'); btnX.focus();
    return fermer;
  }
  /** Petit formulaire : champs = [{id, label, type, options, requis, max}] → valeurs, ou null si erreur affichée */
  function formulaire(champs, libelleBouton, auValider) {
    var f = el('form', { 'class': 'order-form', novalidate: true }), err = el('p', { 'class': 'form-error', role: 'alert', hidden: true });
    var entrees = {};
    champs.forEach(function (c) {
      var idc = 'auto-f-' + c.id;
      f.appendChild(el('label', { 'for': idc, text: c.label + (c.requis ? ' *' : '') }));
      var n;
      if (c.type === 'select') { n = el('select', { id: idc, 'class': 'auto-select' }, (c.options || []).map(function (o) { return el('option', { value: o, text: o || '—' }); })); }
      else if (c.type === 'textarea') n = el('textarea', { id: idc, rows: 3, maxlength: c.max || 300, 'class': 'auto-textarea' });
      else n = el('input', { id: idc, type: c.type || 'text', maxlength: c.max || 120, inputmode: c.inputmode || false, min: c.min || false, autocomplete: c.autocomplete || false, placeholder: c.placeholder || false });
      if (c.valeur !== undefined) n.value = c.valeur;
      entrees[c.id] = n; f.appendChild(n);
    });
    f.appendChild(err);
    f.appendChild(el('button', { 'class': 'btn btn-wa', type: 'submit' }, [NB.icon('whatsapp', 20), el('span', { text: libelleBouton })]));
    f.addEventListener('submit', function (e) {
      e.preventDefault(); err.hidden = true;
      var v = {}; Object.keys(entrees).forEach(function (k) { v[k] = String(entrees[k].value || '').trim(); });
      var manquant = champs.filter(function (c) { return c.requis && v[c.id].length < 2; })[0];
      if (manquant) { err.textContent = 'Indiquez : ' + manquant.label.toLowerCase() + '.'; err.hidden = false; return; }
      auValider(v);
    });
    return f;
  }

  /* ───────────────────────────── Demandes : intérêt, essai, visite, reprise, financement ───────────────────────────── */
  function interesse(p) {
    envoyer('Bonjour, je suis intéressé(e) par ce véhicule :\n\n' + resume(p) + '\n\nEst-il toujours disponible ?');
  }
  function rendezVous(p, type) {   // type : 'essai' | 'visite'
    var essai = type === 'essai';
    var fermer = modale(essai ? 'Demander un essai' : 'Réserver une visite', el('div', {}, [
      el('p', { 'class': 'auto-note', text: titre(p) + ' — ' + NB.prix(p.prix) }),
      formulaire([
        { id: 'nom', label: 'Votre nom', requis: true, max: 80, autocomplete: 'name' },
        { id: 'tel', label: 'Votre téléphone', type: 'tel', inputmode: 'tel', max: 20, autocomplete: 'tel' },
        { id: 'jour', label: 'Jour souhaité', type: 'date', min: new Date().toISOString().slice(0, 10) },
        { id: 'creneau', label: 'Moment de la journée', type: 'select', options: ['Matin', 'Midi', 'Après-midi', 'Fin de journée'] },
        { id: 'note', label: 'Message (facultatif)', type: 'textarea', max: 300 }
      ], essai ? 'Envoyer la demande d’essai' : 'Envoyer la demande de visite', function (v) {
        var jour = v.jour ? new Date(v.jour + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : 'à convenir';
        var l = [essai ? '🚗 *Demande d’essai*' : '📅 *Demande de visite*', '', resume(p), '', '👤 ' + v.nom];
        if (v.tel) l.push('📞 ' + v.tel);
        l.push('🗓️ ' + jour + ' — ' + v.creneau);
        if (v.note) l.push('📝 ' + v.note);
        fermer(); envoyer(l.join('\n'));
      })
    ]));
  }
  function reprise(p) {
    var annees = ['']; for (var a = new Date().getFullYear(); a >= 1980; a--) annees.push(String(a));
    var fermer = modale('Reprise de votre véhicule', el('div', {}, [
      el('p', { 'class': 'auto-note', text: 'Vous voulez vendre ou échanger votre voiture ? Décrivez-la : nous vous répondons avec une estimation. Vous pourrez envoyer les photos dans WhatsApp.' }),
      formulaire([
        { id: 'marque', label: 'Marque et modèle', requis: true, max: 80, placeholder: 'Ex : Toyota Corolla' },
        { id: 'annee', label: 'Année', type: 'select', options: annees },
        { id: 'km', label: 'Kilométrage', type: 'number', inputmode: 'numeric', min: '0', max: 9 },
        { id: 'etat', label: 'État général', type: 'select', options: ['Très bon', 'Bon', 'Moyen', 'À réparer'] },
        { id: 'prix', label: 'Prix souhaité (facultatif)', type: 'number', inputmode: 'numeric', min: '0', max: 12 },
        { id: 'nom', label: 'Votre nom', requis: true, max: 80, autocomplete: 'name' }
      ], 'Envoyer ma demande de reprise', function (v) {
        var l = ['🔁 *Demande de reprise*', '', '🚙 ' + v.marque + (v.annee ? ' (' + v.annee + ')' : '')];
        if (v.km) l.push('Kilométrage : ' + nombre(v.km) + ' km');
        l.push('État : ' + v.etat);
        if (v.prix) l.push('Prix souhaité : ' + NB.prix(v.prix));
        if (p) l.push('', 'En échange de :', resume(p));
        l.push('', '👤 ' + v.nom, '', '(J’envoie les photos juste après ce message.)');
        fermer(); envoyer(l.join('\n'));
      })
    ]));
  }

  /* Simulateur de paiement échelonné — config.js > auto.credit :
     { actif: true, tauxAnnuel: 0, durees: [6, 12, 24, 36], apportMinPourcent: 30, note: '…' }
     tauxAnnuel = 0 → paiement en plusieurs fois sans intérêt (montant restant ÷ nombre de mois). */
  function simulateur(p) {
    var C = A.credit || {};
    if (C.actif === false || NB.statut(p) === 'vendu' || !(p.prix > 0)) return null;
    var taux = Math.max(0, Number(C.tauxAnnuel) || 0), durees = (Array.isArray(C.durees) && C.durees.length ? C.durees : [6, 12, 24, 36]).map(Number).filter(function (n) { return n > 0 && n <= 120; });
    var minPct = Math.min(100, Math.max(0, Number(C.apportMinPourcent) || 0));
    var apportMin = Math.ceil(p.prix * minPct / 100);
    var apport = el('input', { id: 'auto-apport', type: 'number', inputmode: 'numeric', min: String(apportMin), max: String(p.prix), step: '1000', value: String(apportMin), 'class': 'auto-input' });
    var duree = el('select', { id: 'auto-duree', 'class': 'auto-select' }, durees.map(function (d) { return el('option', { value: String(d), text: d + ' mois' }); }));
    if (durees.length > 1) duree.value = String(durees[Math.min(1, durees.length - 1)]);
    var res = el('p', { 'class': 'auto-mensualite', 'aria-live': 'polite' }), detail = el('p', { 'class': 'auto-note' });
    function calcul() {
      var a = Math.min(p.prix, Math.max(apportMin, Number(apport.value) || 0)), n = Number(duree.value), reste = p.prix - a, m;
      if (taux > 0) { var r = taux / 1200; m = reste * r / (1 - Math.pow(1 + r, -n)); } else m = reste / n;
      res.textContent = reste > 0 ? NB.prix(Math.ceil(m)) + ' / mois' : 'Paiement comptant';
      detail.textContent = 'Apport ' + NB.prix(a) + ' + ' + n + ' × ' + NB.prix(Math.ceil(m)) + (taux > 0 ? ' (taux ' + String(taux).replace('.', ',') + ' %/an)' : ' (sans intérêt)') + '.';
      return { a: a, n: n, m: Math.ceil(m) };
    }
    apport.addEventListener('input', calcul); duree.addEventListener('change', calcul);
    var demander = el('button', { 'class': 'btn btn-add auto-btn-large', type: 'button' }, [NB.icon('whatsapp', 18), el('span', { text: 'Demander ce financement' })]);
    demander.onclick = function () {
      var c = calcul();
      envoyer('💳 *Demande de paiement échelonné*\n\n' + resume(p) + '\n\nApport : ' + NB.prix(c.a) + '\nDurée : ' + c.n + ' mois\nMensualité estimée : ' + NB.prix(c.m) + '\n\nPouvez-vous me confirmer les conditions ?');
    };
    var boite = el('section', { 'class': 'd-card auto-credit', 'aria-labelledby': 'auto-credit-h' }, [
      el('h2', { id: 'auto-credit-h', 'class': 'd-h auto-h0', text: '💳 Paiement en plusieurs fois' }),
      el('div', { 'class': 'auto-credit-grille' }, [
        el('label', { 'for': 'auto-apport', text: 'Apport (minimum ' + NB.prix(apportMin) + ')' }), apport,
        el('label', { 'for': 'auto-duree', text: 'Durée' }), duree
      ]),
      res, detail,
      el('p', { 'class': 'auto-petit', text: C.note || 'Estimation indicative. Les conditions définitives sont fixées avec le vendeur.' }),
      demander
    ]);
    calcul();
    return boite;
  }

  /* ───────────────────────────── Recherche, filtres, tri ───────────────────────────── */
  var F = { q: '', marque: '', carburant: '', boite: '', etat: '', anneeMin: '', prixMax: '', tri: '' };
  var barre = null, compteur = null, panneau = null, selects = {}, signatureOptions = '';
  function filtresActifs() { return ['marque', 'carburant', 'boite', 'etat', 'anneeMin', 'prixMax'].filter(function (k) { return F[k]; }).length; }
  function normaliser(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function filtrer(ordre) {
    var par = NB.app.etat.parId, q = normaliser(F.q).split(/\s+/).filter(Boolean);
    var l = ordre.filter(function (id) {
      var p = par[id]; if (!p || cacheDansGrille(p)) return false;
      var a = attr(p);
      if (F.marque && normaliser(a.marque) !== normaliser(F.marque)) return false;
      if (F.carburant && a.carburant !== F.carburant) return false;
      if (F.boite && a.boite !== F.boite) return false;
      if (F.etat && a.etat !== F.etat) return false;
      if (F.anneeMin && !(Number(a.annee) >= Number(F.anneeMin))) return false;
      if (F.prixMax && !(p.prix <= Number(F.prixMax))) return false;
      if (q.length) { var t = normaliser([p.nom, a.marque, a.modele, a.annee, a.carburant, a.couleur, a.provenance].join(' ')); if (!q.every(function (m) { return t.indexOf(m) >= 0; })) return false; }
      return true;
    });
    var cle = { 'prix-asc': function (p) { return p.prix; }, 'prix-desc': function (p) { return -p.prix; }, 'annee-desc': function (p) { return -(Number(attr(p).annee) || 0); }, 'km-asc': function (p) { var k = Number(attr(p).km); return isFinite(k) && attr(p).km !== '' ? k : Infinity; } }[F.tri];
    var rang = { disponible: 0, reserve: 0, vendu: 1 };          // seuls les véhicules vendus passent en dernier (un réservé reste trié normalement)
    l = l.map(function (id, i) { return { id: id, i: i, p: par[id] }; }).sort(function (x, y) {
      return (rang[NB.statut(x.p)] - rang[NB.statut(y.p)]) || (cle ? (cle(x.p) - cle(y.p)) : 0) || (x.i - y.i);   // vendus en dernier
    }).map(function (x) { return x.id; });
    majBarre(l.length);
    return l;
  }
  function messageVide() { return 'Aucun véhicule ne correspond à votre recherche. Modifiez ou effacez les filtres.'; }

  function construireBarre() {
    var recherche = el('input', { type: 'search', 'class': 'af-recherche', placeholder: 'Rechercher : marque, modèle, année…', 'aria-label': 'Rechercher un véhicule', enterkeyhint: 'search' });
    var btnF = el('button', { 'class': 'af-btn', type: 'button', 'aria-expanded': 'false' }, [el('span', { text: 'Filtres' })]);
    panneau = el('div', { 'class': 'af-panneau', hidden: true });
    function select(k, label) { var s = el('select', { 'class': 'auto-select', 'aria-label': label }); selects[k] = s; s.addEventListener('change', function () { F[k] = s.value; appliquer(); }); return el('label', { 'class': 'af-champ' }, [el('span', { text: label }), s]); }
    panneau.appendChild(select('marque', 'Marque'));
    panneau.appendChild(select('carburant', 'Carburant'));
    panneau.appendChild(select('boite', 'Boîte'));
    panneau.appendChild(select('etat', 'État'));
    panneau.appendChild(select('anneeMin', 'Année minimum'));
    panneau.appendChild(select('prixMax', 'Prix maximum'));
    panneau.appendChild(select('tri', 'Trier par'));
    var effacer = el('button', { 'class': 'af-effacer', type: 'button', text: 'Effacer les filtres' });
    effacer.onclick = function () { Object.keys(F).forEach(function (k) { F[k] = ''; }); recherche.value = ''; Object.keys(selects).forEach(function (k) { selects[k].value = ''; }); appliquer(); };
    panneau.appendChild(effacer);
    btnF.onclick = function () { panneau.hidden = !panneau.hidden; btnF.setAttribute('aria-expanded', String(!panneau.hidden)); };
    var minuteur = null;
    recherche.addEventListener('input', function () { clearTimeout(minuteur); minuteur = setTimeout(function () { F.q = recherche.value; appliquer(); }, 250); });
    compteur = el('p', { 'class': 'af-compteur', 'aria-live': 'polite' });
    barre = el('section', { 'class': 'auto-filtres', 'aria-label': 'Recherche de véhicules' }, [el('div', { 'class': 'af-ligne' }, [recherche, btnF]), panneau, compteur]);
    var grille = document.getElementById('grid');
    grille.parentNode.insertBefore(barre, grille);
  }
  /** Options des listes : calculées à partir des véhicules réellement en ligne (recalculées si le catalogue change) */
  function majOptions() {
    var produits = Object.keys(NB.app.etat.parId).map(function (k) { return NB.app.etat.parId[k]; }).filter(function (p) { return !cacheDansGrille(p); });
    var sig = produits.map(function (p) { return p.id + p.prix + JSON.stringify(attr(p)); }).join('|');
    if (sig === signatureOptions) return; signatureOptions = sig;
    function uniques(k) { var v = {}; produits.forEach(function (p) { var x = attr(p)[k]; if (x !== undefined && x !== null && x !== '') v[String(x)] = 1; }); return Object.keys(v).sort(function (a, b) { return a.localeCompare(b, 'fr'); }); }
    function remplir(k, options, tous) {
      var s = selects[k]; if (!s) return; var garde = s.value; s.textContent = '';
      s.appendChild(el('option', { value: '', text: tous }));
      options.forEach(function (o) { s.appendChild(el('option', { value: o[0], text: o[1] })); });
      s.value = garde; if (s.value !== garde) { s.value = ''; F[k] = ''; }
      s.parentNode.hidden = k !== 'tri' && options.length < 2 && !garde;     // liste inutile (une seule valeur) : masquée
    }
    var paire = function (x) { return [x, x]; };
    remplir('marque', uniques('marque').map(paire), 'Toutes');
    remplir('carburant', uniques('carburant').map(paire), 'Tous');
    remplir('boite', uniques('boite').map(paire), 'Toutes');
    remplir('etat', uniques('etat').map(paire), 'Tous');
    var annees = uniques('annee').map(Number).filter(isFinite).sort(function (a, b) { return b - a; });
    remplir('anneeMin', annees.map(function (a) { return [String(a), a + ' et plus récent']; }), 'Toutes');
    var prix = produits.map(function (p) { return p.prix; }).sort(function (a, b) { return a - b; }), paliers = [];
    if (prix.length) {
      var pas = [500000, 1000000, 2000000, 2500000, 5000000, 10000000, 25000000, 50000000].filter(function (x) { return (prix[prix.length - 1] - prix[0]) / x <= 8; })[0] || 50000000;
      for (var v = Math.ceil(prix[0] / pas) * pas; v < prix[prix.length - 1]; v += pas) paliers.push([String(v), 'Jusqu’à ' + NB.prix(v)]);
    }
    remplir('prixMax', paliers, 'Tous');
    remplir('tri', [['prix-asc', 'Prix croissant'], ['prix-desc', 'Prix décroissant'], ['annee-desc', 'Plus récents'], ['km-asc', 'Moins de kilomètres']], 'Par défaut');
  }
  function majBarre(n) {
    if (!barre) return;
    majOptions();
    var total = Object.keys(NB.app.etat.parId).length;
    barre.hidden = total < 2;                                      // inutile avec 0 ou 1 véhicule
    var nf = filtresActifs();
    barre.querySelector('.af-btn span').textContent = nf ? 'Filtres (' + nf + ')' : 'Filtres';
    compteur.textContent = n + ' véhicule' + (n > 1 ? 's' : '') + (nf || F.q ? ' trouvé' + (n > 1 ? 's' : '') : ' en stock');
  }
  function appliquer() {
    NB.app.afficherGrille();
    var haut = barre.getBoundingClientRect().top + window.pageYOffset - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--top-h'), 10) || 0) - 8;
    if (window.pageYOffset > haut) window.scrollTo(0, Math.max(0, haut));
  }

  /* ───────────────────────────── Grille : cartes ───────────────────────────── */
  function badgeStatut(p, classe) {
    var s = NB.statut(p); if (s === 'disponible') return null;
    return el('span', { 'class': 'auto-statut auto-statut-' + s + (classe ? ' ' + classe : ''), text: NB.STATUTS[s] });
  }
  function decorerCarte(p, lien, img, corps) {
    var b = badgeStatut(p); if (b) img.appendChild(b);
    if (NB.statut(p) === 'vendu') lien.classList.add('auto-vendu');
    var mention = attr(p).prixMention, prixBloc = corps.querySelector('.card-price');
    if (mention && prixBloc) prixBloc.insertBefore(el('span', { 'class': 'auto-mention', text: mention }), prixBloc.firstChild);
    var e = etiquettes(p);
    if (e.length) corps.appendChild(el('p', { 'class': 'auto-tags', text: e.join(' · ') }));
  }
  function boutonsGrille(p, lien) {
    var actions = el('div', { 'class': 'card-actions' });
    if (NB.statut(p) === 'vendu') {
      actions.appendChild(el('button', { 'class': 'btn btn-add', type: 'button', disabled: true }, [el('span', { text: 'Véhicule vendu' })]));
    } else {
      var b = el('button', { 'class': 'btn btn-order', type: 'button', 'aria-label': 'Je suis intéressé par ' + p.nom }, [NB.icon('whatsapp', 16), el('span', { text: 'Je suis intéressé' })]);
      b.onclick = function () { interesse(p); };
      var d = el('button', { 'class': 'btn btn-add', type: 'button', 'aria-label': 'Voir la fiche de ' + p.nom }, [el('span', { text: 'Voir la fiche' })]);
      d.onclick = function () { NB.app.ouvrirProduit(p.id, true); };
      actions.appendChild(b); actions.appendChild(d);
    }
    return el('div', { 'class': 'card-item' }, [lien, actions]);
  }

  /* ───────────────────────────── Fiche du véhicule ───────────────────────────── */
  function decorerFiche(p, carte) {
    var prixBloc = carte.querySelector('.d-price'), mention = attr(p).prixMention;
    if (mention && prixBloc) prixBloc.insertBefore(el('span', { 'class': 'auto-mention', text: mention }), prixBloc.firstChild);
    var b = badgeStatut(p, 'auto-statut-fiche');
    if (b) carte.insertBefore(b, carte.firstChild);
    var e = etiquettes(p);
    if (e.length) carte.appendChild(el('p', { 'class': 'auto-tags auto-tags-fiche', text: e.join(' · ') }));
    // Fiche technique : uniquement les champs renseignés
    var lignes = CHAMPS.filter(function (c) { return !c.horsTableau && valeur(p, c.k); });
    if (lignes.length) {
      carte.appendChild(el('h2', { 'class': 'd-h', text: 'Fiche technique' }));
      carte.appendChild(el('dl', { 'class': 'auto-fiche' }, lignes.reduce(function (t, c) {
        t.push(el('dt', { text: c.label })); t.push(el('dd', { text: valeur(p, c.k) })); return t;
      }, [])));
    }
    var v = lienVideo(p);
    if (v) carte.appendChild(el('a', { 'class': 'auto-video', href: v, target: '_blank', rel: 'noopener noreferrer' }, [el('span', { text: '▶ Voir la vidéo du véhicule' })]));
  }
  function actionsFiche(p, bPartager) {
    var zone = el('div', { 'class': 'actions auto-actions' });
    if (NB.statut(p) === 'vendu') {
      zone.appendChild(el('p', { 'class': 'auto-vendu-msg', text: 'Ce véhicule est vendu. Découvrez nos autres véhicules ou demandez-nous de vous trouver le même modèle.' }));
      var cherche = el('button', { 'class': 'btn btn-order', type: 'button' }, [NB.icon('whatsapp', 20), el('span', { text: 'Trouvez-moi un modèle similaire' })]);
      cherche.onclick = function () { envoyer('Bonjour, je cherche un véhicule similaire à celui-ci (vendu) :\n\n' + resume(p)); };
      zone.appendChild(cherche); zone.appendChild(bPartager);
      return zone;
    }
    var i = el('button', { 'class': 'btn btn-order', type: 'button' }, [NB.icon('whatsapp', 20), el('span', { text: 'Je suis intéressé' })]);
    i.onclick = function () { interesse(p); };
    var essai = el('button', { 'class': 'btn btn-add', type: 'button' }, [el('span', { text: '🚗 Demander un essai' })]);
    essai.onclick = function () { rendezVous(p, 'essai'); };
    var visite = el('button', { 'class': 'btn btn-add', type: 'button' }, [el('span', { text: '📅 Réserver une visite' })]);
    visite.onclick = function () { rendezVous(p, 'visite'); };
    zone.appendChild(i); zone.appendChild(essai); zone.appendChild(visite); zone.appendChild(bPartager);
    return zone;
  }
  function apresFiche(p, vue) {
    var s = simulateur(p); if (s) vue.appendChild(s);
    if (A.reprise !== false && NB.statut(p) !== 'vendu') {
      var b = el('button', { 'class': 'btn btn-add auto-btn-large', type: 'button' }, [el('span', { text: '🔁 Échanger ma voiture contre celle-ci' })]);
      b.onclick = function () { reprise(p); };
      vue.appendChild(el('section', { 'class': 'd-card auto-reprise' }, [el('h2', { 'class': 'd-h auto-h0', text: 'Reprise de votre véhicule' }), el('p', { 'class': 'auto-note', text: 'Nous pouvons reprendre votre voiture actuelle en déduction du prix.' }), b]));
    }
  }

  /* ───────────────────────────── Pied de page : horaires, commerciaux, reprise ───────────────────────────── */
  function decorerPied(pied) {
    var avant = pied.querySelector('.shop-links');
    function ajouter(n) { if (avant) pied.insertBefore(n, avant); else pied.appendChild(n); }
    if (A.horaires) ajouter(el('div', { 'class': 'shop-row' }, [el('span', { 'class': 'auto-ico', text: '🕒' }), el('span', { text: String(A.horaires).slice(0, 200) })]));
    var l = (Array.isArray(A.commerciaux) ? A.commerciaux : []).filter(function (c) { return c && c.nom && NB.chiffres(c.whatsapp).length >= 8; });
    if (l.length) {
      var liste = el('div', { 'class': 'auto-conseillers' }, [el('p', { 'class': 'auto-note', text: 'Nos conseillers :' })]);
      l.forEach(function (c) {
        liste.appendChild(el('a', { 'class': 'link-wa', href: 'https://wa.me/' + NB.chiffres(c.whatsapp), target: '_blank', rel: 'noopener noreferrer' }, [NB.icon('whatsapp', 18), String(c.nom).slice(0, 40)]));
      });
      ajouter(liste);
    }
    if (A.reprise !== false) {
      var b = el('button', { 'class': 'btn btn-add auto-btn-large', type: 'button' }, [el('span', { text: '🔁 Faire reprendre mon véhicule' })]);
      b.onclick = function () { reprise(null); };
      ajouter(b);
    }
  }

  function init() { construireBarre(); }

  NB.auto = {
    init: init, filtrer: filtrer, messageVide: messageVide, decorerCarte: decorerCarte, boutonsGrille: boutonsGrille,
    decorerFiche: decorerFiche, actionsFiche: actionsFiche, apresFiche: apresFiche, decorerPied: decorerPied
  };
})();
