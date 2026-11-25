/* ============================================================================
   Aperçu de partage d'un produit : GET /v/<code>  (version SUPABASE — voir server/apercu.js)
   Variables à créer dans Cloudflare Pages (Settings → Variables and Secrets, type TEXTE) :
     SUPABASE_URL = https://VOTRE-PROJET.supabase.co      (même valeur que supabaseUrl dans config.js)
     SUPABASE_KEY = votre clé PUBLIQUE anon / publishable  (même valeur que supabaseKey dans config.js — JAMAIS service_role)
   Sans ces variables, le lien fonctionne quand même (la boutique s'ouvre sur le produit), mais sans aperçu personnalisé.
   ============================================================================ */
import { repondreApercu } from '../../server/apercu.js';

/** Produit VISIBLE dont l'identifiant commence par <code> (recherche par plage d'UUID) + nom de la boutique */
async function produitParCode(env, code) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, ''), cle = String(env.SUPABASE_KEY || '');
  if (!/^https:\/\//.test(url) || !cle || !/^[0-9a-f]{8,32}$/.test(code)) return null;
  const uuid = (h) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  const h = { apikey: cle, Accept: 'application/json' };
  if (/^eyJ/.test(cle)) h.Authorization = 'Bearer ' + cle;                     // ancienne clé « anon » (JWT)
  const [rp, rb] = await Promise.all([
    fetch(`${url}/rest/v1/produits?select=*&visible=eq.true&id=gte.${uuid(code.padEnd(32, '0'))}&id=lte.${uuid(code.padEnd(32, 'f'))}&limit=2`, { headers: h }),
    fetch(`${url}/rest/v1/boutique?select=nom&id=eq.1`, { headers: h })
  ]);
  if (!rp.ok) return null;
  const l = await rp.json(), b = rb.ok ? await rb.json() : [];
  return Array.isArray(l) && l.length === 1 ? { produit: l[0], boutique: (b[0] && b[0].nom) || '' } : null;
}

export const onRequestGet = (ctx) => repondreApercu(ctx, produitParCode);
