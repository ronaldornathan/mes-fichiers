// src/kv.js — enregistrements JSON dans KV. La valeur est aussi copiée dans les « metadata »,
// ce qui permet de LISTER tous les enregistrements en un seul appel (sans un `get` par clé).
import { HttpError } from './http.js';

const MAX_BYTES = 1000; // limite KV des metadata : 1024 octets

export const getRecord = (env, key) => env.RATE_LIMIT.get(key, 'json');
export const deleteRecord = (env, key) => env.RATE_LIMIT.delete(key);

export async function putRecord(env, key, rec, ttlSeconds) {
	const value = JSON.stringify(rec);
	if (new TextEncoder().encode(value).length > MAX_BYTES) throw new HttpError(400, 'Texte ou chemin trop long');
	await env.RATE_LIMIT.put(key, value, { metadata: rec, ...(ttlSeconds ? { expirationTtl: Math.max(60, Math.ceil(ttlSeconds)) } : {}) });
}

export async function listRecords(env, prefix) {
	const out = [];
	let cursor;
	do {
		const page = await env.RATE_LIMIT.list({ prefix, cursor });
		for (const k of page.keys) if (k.metadata) out.push(k.metadata);
		cursor = page.list_complete ? undefined : page.cursor;
	} while (cursor);
	return out;
}
