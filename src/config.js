// src/config.js — constantes et limites (aucune logique ici)

export const SIGNED_URL_TTL = 300; // durée de vie des liens signés : 5 min
export const SESSION_TTL = 60 * 60 * 12; // session : 12 h
export const MAX_KEY_LENGTH = 512;
export const MAX_FAILURES = 5; // essais de connexion avant blocage
export const LOCK_SECONDS = 900; // blocage : 15 min
export const USAGE_CACHE_SECONDS = 60; // la jauge est mise en cache 60 s (KV)
export const MAX_URLS_PER_REQUEST = 60; // liens signés demandés en une fois
export const MAX_KEYS_PER_DELETE_CALL = 100; // éléments par appel /api/delete
export const FALLBACK_DELETE_LIMIT = 30; // si la suppression groupée est refusée

export const REQUIRED_ENV = ['TIGRIS_ACCESS_KEY_ID', 'TIGRIS_SECRET_ACCESS_KEY', 'BUCKET_NAME', 'JWT_SECRET', 'APP_PASSWORD', 'RATE_LIMIT'];

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

// Déplacer un dossier = 1 copie par fichier (1 sous-requête chacune, 50 max en plan gratuit).
export const moveLimit = (env) => num(env.MAX_BATCH_OBJECTS, 40);
// Supprimer = requêtes groupées par 1000 : on peut aller bien plus loin.
export const deleteLimit = (env) => num(env.MAX_DELETE_OBJECTS, 2000);
export const storageLimits = (env) => ({ limit: num(env.STORAGE_LIMIT_BYTES, 5e9), alertAt: num(env.ALERT_BYTES, 4e9) });
