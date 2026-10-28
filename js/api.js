// js/api.js — seul module qui parle au Worker (fetch + liens signés mis en cache)
import { API_URL, URL_TTL_MS, MAX_URLS_PER_CALL } from './config.js';
import { getToken } from './session.js';

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export async function api(path, { method = 'GET', body } = {}) {
  const token = getToken();
  const res = await fetch(API_URL + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && path !== '/api/login') { onUnauthorized(); throw new Error('Session expirée, reconnecte-toi.'); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 404 && data.error === 'Introuvable') {
    throw new Error('Le Worker en ligne n’est pas à jour (route ' + path.split('?')[0] + ' inconnue) : redéploie-le avec « npx wrangler deploy ».');
  }
  if (!res.ok) throw Object.assign(new Error(data.error || 'Erreur ' + res.status), { data, status: res.status });
  return data;
}

// ---- liens signés : demandés par lots, réutilisés tant qu'ils sont valides ----
const urlCache = new Map();
const cacheKey = (it) => `${it.key}|${it.inline ? 'i' : 'd'}|${it.type || ''}`;
export const clearUrlCache = () => urlCache.clear();

/** items: [{ key, inline?, type? }] → tableau d'URL dans le même ordre */
export async function signedUrls(items) {
  const out = new Array(items.length);
  const miss = [];
  items.forEach((it, i) => {
    const c = urlCache.get(cacheKey(it));
    if (c && c.exp > Date.now()) out[i] = c.url; else miss.push(i);
  });
  for (let s = 0; s < miss.length; s += MAX_URLS_PER_CALL) {
    const idx = miss.slice(s, s + MAX_URLS_PER_CALL);
    const { urls } = await api('/api/download-urls', {
      method: 'POST',
      body: { items: idx.map((i) => ({ key: items[i].key, inline: !!items[i].inline, type: items[i].type || '' })) },
    });
    idx.forEach((i, j) => { out[i] = urls[j]; urlCache.set(cacheKey(items[i]), { url: urls[j], exp: Date.now() + URL_TTL_MS }); });
  }
  if (urlCache.size > 600) [...urlCache.keys()].slice(0, 200).forEach((k) => urlCache.delete(k));
  return out;
}
export const signedUrl = async (key, opts = {}) => (await signedUrls([{ key, ...opts }]))[0];
