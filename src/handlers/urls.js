// src/handlers/urls.js — liens signés (envoi, téléchargement, aperçu)
import { MAX_URLS_PER_REQUEST, SIGNED_URL_TTL } from '../config.js';
import { HttpError, json, readJson } from '../http.js';
import * as s3 from '../s3.js';
import { getUsage } from '../usage.js';
import { assertAccess } from '../access.js';

// Types qu'on accepte de forcer à l'aperçu (liste blanche : jamais de text/html).
const PREVIEW_TYPE =
	/^(image\/(png|jpeg|gif|webp|avif|bmp|x-icon|svg\+xml)|application\/pdf|video\/(mp4|webm|quicktime|ogg)|audio\/(mpeg|wav|ogg|mp4|aac|flac|webm|x-m4a)|text\/plain(; charset=utf-8)?)$/;

function downloadParams(key, { inline, type }) {
	const name = key.split('/').pop();
	const params = {
		'response-content-disposition': inline ? 'inline' : `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
	};
	// Le type stocké est parfois faux (envoi sans type) : on impose celui détecté par l'interface.
	if (inline && typeof type === 'string' && PREVIEW_TYPE.test(type)) params['response-content-type'] = type;
	return params;
}

// Un invité n'écrase jamais un fichier existant : « a.pdf » devient « a (1).pdf ».
async function freeKey(env, key) {
	if (!(await s3.exists(env, key))) return key;
	const dot = key.lastIndexOf('.');
	const [base, ext] = dot > key.lastIndexOf('/') + 1 ? [key.slice(0, dot), key.slice(dot)] : [key, ''];
	for (let i = 1; i <= 20; i++) if (!(await s3.exists(env, `${base} (${i})${ext}`))) return `${base} (${i})${ext}`;
	throw new HttpError(409, 'Trop de fichiers portent déjà ce nom');
}

export async function upload({ request, env, auth }) {
	let { key, size } = await readJson(request);
	if (!s3.validKey(key) || key.endsWith('/')) throw new HttpError(400, 'Clé invalide');
	assertAccess(auth, 'create', key);
	if (auth.role === 'guest') key = await freeKey(env, key);
	const usage = await getUsage(env); // en cache : pas de parcours complet à chaque envoi
	if (usage.used + (Number(size) || 0) > usage.limit) throw new HttpError(413, 'Stockage plein : quota dépassé', { usage });
	return json({ key, url: await s3.presign(env, 'PUT', key), method: 'PUT', expiresIn: SIGNED_URL_TTL, usage });
}

export async function download({ request, env, auth }) {
	const item = await readJson(request);
	if (!s3.validKey(item.key)) throw new HttpError(400, 'Clé invalide');
	assertAccess(auth, 'read', item.key);
	return json({ url: await s3.presign(env, 'GET', item.key, downloadParams(item.key, item)), expiresIn: SIGNED_URL_TTL });
}

// Plusieurs liens en une requête (miniatures) : la signature est locale, aucun appel au stockage.
export async function downloadMany({ request, env, auth }) {
	const { items } = await readJson(request);
	if (!Array.isArray(items) || !items.length || items.length > MAX_URLS_PER_REQUEST) throw new HttpError(400, 'Requête invalide');
	if (!items.every((i) => s3.validKey(i?.key))) throw new HttpError(400, 'Clé invalide');
	items.forEach((i) => assertAccess(auth, 'read', i.key));
	const urls = await Promise.all(items.map((i) => s3.presign(env, 'GET', i.key, downloadParams(i.key, i))));
	return json({ urls, expiresIn: SIGNED_URL_TTL });
}
