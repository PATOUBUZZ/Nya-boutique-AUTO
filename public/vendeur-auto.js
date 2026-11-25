/* ============================================================================
   vendeur-auto.js — MODE CONCESSIONNAIRE dans l'espace vendeur (vendeur.html)
   ----------------------------------------------------------------------------
   Chargé UNIQUEMENT si config.js > typeBoutique = 'auto' (par vendeur.js, avant son démarrage).
   vendeur.js l'appelle à quelques endroits (repérés par « MODE AUTO » dans vendeur.js) :
     photosMax, remplir(p) à l'ouverture du formulaire, lire() à l'enregistrement, htmlListe(p) dans la liste des véhicules.
   Ajoute au formulaire : statut (Disponible / Réservé / Vendu) + fiche technique (liste des champs : shared.js > CHAMPS_AUTO).
   Les valeurs sont enregistrées dans produits.attributs (JSON) et produits.statut.
   Sécurité : tout texte affiché passe par esc() ; la base vérifie aussi les valeurs (script SQL du mode auto).
   ============================================================================ */
(function () {
  'use strict';
  var NB = window.NB; if (!NB || !NB.estAuto) return;
  var A = NB.cfg.auto || {}, $ = NB.$;
  var CHAMPS = NB.CHAMPS_AUTO;
  var PHOTOS_MAX = Math.min(12, Math.max(1, parseInt(A.photosMax, 10) || 12));
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ───────── Formulaire : section « Véhicule » insérée avant la description ───────── */
  function champHtml(c) {
    var id = 'fa-' + c.k, h = '<div' + (c.type === 'lien' ? ' class="col-span-2"' : '') + '><label class="field-label" for="' + id + '">' + esc(c.label) + '</label>';
    if (c.type === 'choix' || c.type === 'ouinon') {
      var opts = c.type === 'ouinon' ? ['Oui', 'Non'] : c.options;
      h += '<select class="field" id="' + id + '"><option value="">—</option>' + opts.map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + '</option>'; }).join('') + '</select>';
    } else if (c.type === 'nombre') {
      h += '<input class="field" id="' + id + '" type="number" inputmode="numeric" step="1" min="' + c.min + '" max="' + c.max + '"' + (c.k === 'annee' ? ' placeholder="Ex : 2019"' : c.k === 'km' ? ' placeholder="Ex : 85000"' : '') + '>';
    } else if (c.type === 'lien') {
      h += '<input class="field" id="' + id + '" type="url" inputmode="url" maxlength="300" placeholder="https://…">';
    } else {
      h += '<input class="field" id="' + id + '" type="text" maxlength="' + (c.max || 60) + '"' + (c.suggestions ? ' list="' + id + '-liste"' : '') + (c.exemple ? ' placeholder="Ex : ' + esc(c.exemple) + '"' : '') + '>';
      if (c.suggestions) h += '<datalist id="' + id + '-liste">' + c.suggestions.map(function (o) { return '<option value="' + esc(o) + '">'; }).join('') + '</datalist>';
    }
    return h + '</div>';
  }
  function installerFormulaire() {
    var desc = $('f-desc'); if (!desc || $('fa-statut')) return;
    var bloc = document.createElement('div');
    bloc.className = 'rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-3';
    bloc.innerHTML =
      '<p class="field-label"><i class="fas fa-car"></i> Véhicule</p>' +
      '<div><label class="field-label" for="fa-statut">Statut</label>' +
      '<select class="field" id="fa-statut">' + Object.keys(NB.STATUTS).map(function (k) { return '<option value="' + k + '">' + esc(NB.STATUTS[k]) + '</option>'; }).join('') + '</select>' +
      '<p class="text-xs text-slate-500 mt-1">« Vendu » : le véhicule reste visible ' + esc(String(A.venduVisibleJours === undefined ? 7 : A.venduVisibleJours)) + ' jour(s) avec un bandeau, puis quitte la grille automatiquement.</p></div>' +
      '<div class="grid grid-cols-2 gap-3">' + CHAMPS.map(champHtml).join('') + '</div>' +
      '<p class="text-xs text-slate-500">Tous ces champs sont facultatifs : seuls ceux remplis s’affichent sur la fiche.</p>';
    desc.parentNode.parentNode.insertBefore(bloc, desc.parentNode);
    // Textes adaptés aux véhicules
    var info = $('photo-info'); if (info) info.textContent = '1 à ' + PHOTOS_MAX + ' photos (extérieur, intérieur, moteur, compteur…). La 1re est l’image principale. Elles sont automatiquement allégées.';
    var nom = $('f-nom'); if (nom) nom.placeholder = 'Ex : Toyota Corolla 2019';
    var lbl = document.querySelector('label[for="f-nom"]'); if (lbl) lbl.textContent = 'Nom du véhicule';
    var carac = $('f-carac'); if (carac) carac.placeholder = 'Ex :\nClimatisation\nCaméra de recul\nJantes alliage';
    Array.prototype.forEach.call(document.querySelectorAll('h3'), function (h) { if (/Mes produits/.test(h.textContent)) h.lastChild.textContent = ' Mes véhicules'; });
  }

  /** Remplit la section à l'ouverture du formulaire (p = véhicule, ou null pour un nouveau) */
  function remplir(p) {
    var a = NB.attributs(p);
    $('fa-statut').value = p ? NB.statut(p) : 'disponible';
    CHAMPS.forEach(function (c) {
      var n = $('fa-' + c.k), v = a[c.k];
      if (c.type === 'ouinon') n.value = v === true || v === 'oui' ? 'Oui' : (v === false || v === 'non' ? 'Non' : '');
      else n.value = v === undefined || v === null ? '' : String(v);
    });
    $('product-title').textContent = p ? 'Modifier le véhicule' : 'Ajouter un véhicule';
    $('btn-product-label').textContent = p ? 'Enregistrer les modifications' : 'Publier le véhicule';
  }

  /** Lit et vérifie la section → { erreur } ou { attributs, statut } */
  function lire() {
    var a = {};
    for (var i = 0; i < CHAMPS.length; i++) {
      var c = CHAMPS[i], v = String($('fa-' + c.k).value || '').trim();
      if (!v) continue;
      if (c.type === 'nombre') {
        var n = Number(v);
        if (!isFinite(n) || n < c.min || n > c.max || Math.round(n) !== n) return { erreur: c.label + ' : nombre entier entre ' + c.min + ' et ' + c.max + '.' };
        a[c.k] = n;
      } else if (c.type === 'ouinon') a[c.k] = v === 'Oui' ? 'oui' : 'non';
      else if (c.type === 'lien') {
        if (!/^https:\/\/[^\s]+$/i.test(v) || v.length > 300) return { erreur: c.label + ' : adresse commençant par https:// attendue.' };
        a[c.k] = v;
      } else if (c.type === 'choix') { if (c.options.indexOf(v) >= 0) a[c.k] = v; }
      else a[c.k] = v.slice(0, c.max || 60);
    }
    var s = $('fa-statut').value;
    return { attributs: a, statut: NB.STATUTS[s] ? s : 'disponible' };
  }

  /** Dans la liste des véhicules : statut + résumé + boutons de statut rapides */
  function htmlListe(p) {
    var s = NB.statut(p), a = NB.attributs(p);
    var resume = [a.annee, a.km !== undefined && a.km !== '' ? Number(a.km).toLocaleString('fr-FR') + ' km' : '', a.carburant, a.boite].filter(function (x) { return x !== undefined && x !== ''; });
    var couleurs = { disponible: 'bg-emerald-100 text-emerald-800', reserve: 'bg-amber-100 text-amber-800', vendu: 'bg-red-100 text-red-700' };
    var h = '<div class="mt-1 flex flex-wrap items-center gap-1.5">' +
      '<span class="badge ' + couleurs[s] + '">' + esc(NB.STATUTS[s]) + '</span>' +
      (resume.length ? '<span class="text-xs text-slate-500">' + esc(resume.join(' · ')) + '</span>' : '') + '</div>';
    h += '<div class="flex flex-wrap gap-1.5 mt-2">' + Object.keys(NB.STATUTS).filter(function (k) { return k !== s; }).map(function (k) {
      return '<button type="button" class="prod-act" data-action="statut" data-statut="' + k + '">→ ' + esc(NB.STATUTS[k]) + '</button>';
    }).join('') + '</div>';
    return h;
  }

  installerFormulaire();
  NB.vendeurAuto = { photosMax: PHOTOS_MAX, remplir: remplir, lire: lire, htmlListe: htmlListe };
})();
