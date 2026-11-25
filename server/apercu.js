/* ============================================================================
   server/apercu.js — APERÇU DE PARTAGE d'un produit (lien « https://VOTRE-DOMAINE/v/<code> »)
   ----------------------------------------------------------------------------
   Les robots de WhatsApp, Facebook, Telegram… ne lancent pas le JavaScript : ils lisent seulement les balises <meta> de la page.
   La fonction Cloudflare functions/v/[code].js renvoie donc index.html avec les balises de CE produit
   (titre, prix, description, 1re photo). Les visiteurs, eux, voient la boutique normale ouverte sur le produit (app.js lit /v/<code>).
   Ce fichier ne dépend d'aucun back-end : il est identique pour Neon et Supabase.
   Sécurité : toutes les valeurs sont échappées (&, <, >, ") avant d'être écrites dans la page.
   ============================================================================ */

const echapper = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const prix = (n, devise) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ' + devise;

/** Texte de l'aperçu : titre « Nom — prix », description « année · km · carburant — description » */
export function textesApercu(produit, boutique, devise = 'FCFA') {
  const a = produit.attributs && typeof produit.attributs === 'object' ? produit.attributs : {};
  const statut = { reserve: ' (réservé)', vendu: ' (vendu)' }[produit.statut] || '';
  const etiquettes = [a.annee, Number.isFinite(Number(a.km)) && a.km !== '' && a.km !== undefined ? prix(a.km, 'km') : '', a.carburant, a.boite]
    .filter((x) => x !== undefined && x !== null && x !== '');
  const titre = `${produit.nom} — ${a.prixMention ? a.prixMention + ' ' : ''}${prix(produit.prix, devise)}${statut}`;
  const description = [etiquettes.join(' · '), String(produit.description || '').trim()].filter(Boolean).join(' — ').slice(0, 200)
    || `${boutique || 'Boutique'} · Commandez directement sur WhatsApp.`;
  const image = (Array.isArray(produit.images) ? produit.images : []).find((u) => /^https:\/\//i.test(String(u))) || '';
  return { titre: titre.slice(0, 120), description, image, site: boutique || '' };
}

/** Réécrit index.html : <base href="/"> (les fichiers restent trouvés depuis /v/…), <title> et balises OpenGraph / Twitter */
export function reecrirePage(html, t) {
  let h = html.replace(/<head>/i, '<head>\n  <base href="/">');
  if (!t) return h;
  const meta = (attr, nom, valeur) => {
    if (!valeur) return;
    const re = new RegExp(`(<meta\\s+${attr}="${nom}"\\s+content=")[^"]*(")`, 'i');
    if (re.test(h)) h = h.replace(re, (_, a, b) => a + echapper(valeur) + b);
    else h = h.replace(/<\/head>/i, () => `  <meta ${attr}="${nom}" content="${echapper(valeur)}">\n</head>`);   // (fonction : aucun « $ » interprété)
  };
  h = h.replace(/<title>[^<]*<\/title>/i, () => `<title>${echapper(t.titre)}</title>`);
  meta('name', 'description', t.description);
  meta('property', 'og:title', t.titre);
  meta('property', 'og:description', t.description);
  meta('property', 'og:site_name', t.site);
  meta('property', 'og:image', t.image);
  meta('name', 'twitter:image', t.image);
  if (t.image) {   // dimensions de l'image d'origine inconnues : on retire celles de l'image par défaut (1200×630)
    h = h.replace(/\s*<meta\s+property="og:image:(width|height)"\s+content="[^"]*">/gi, '');
    meta('property', 'og:image:alt', t.titre);
  }
  return h;
}

/** Réponse complète : page d'accueil réécrite pour le produit (ou telle quelle si le produit est introuvable) */
export async function repondreApercu(ctx, chercher) {
  const url = new URL(ctx.request.url);
  const code = String((ctx.params && ctx.params.code) || '').toLowerCase();
  const page = await ctx.env.ASSETS.fetch(new Request(url.origin + '/', { method: 'GET' }));
  if (!page.ok) return page;
  let trouve = null;
  if (/^[0-9a-f]{8,32}$/.test(code)) { try { trouve = await chercher(ctx.env, code); } catch (e) { trouve = null; } }
  const html = reecrirePage(await page.text(), trouve ? textesApercu(trouve.produit, trouve.boutique, ctx.env.DEVISE || 'FCFA') : null);
  return new Response(html, { status: 200, headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=300',           // 5 min : les robots qui repassent ne réinterrogent pas la base
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN'
  } });
}
