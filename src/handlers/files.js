// src/handlers/files.js — dossiers, fichiers : lister, créer, supprimer, déplacer
import { moveLimit, deleteLimit, MAX_KEYS_PER_DELETE_CALL } from '../config.js';
import { HttpError, json, readJson } from '../http.js';
import * as s3 from '../s3.js';
import { invalidateUsage } from '../usage.js';
import { assertAccess } from '../access.js';

const isFolderKey = (k) => s3.validKey(k) && k.endsWith('/');

export async function list({ env, url, auth }) {
	let prefix = url.searchParams.get('prefix') || '';
	if (auth.role === 'guest' && !prefix) prefix = auth.link.scope; // un invité démarre dans le dossier partagé
	if (prefix && !isFolderKey(prefix)) throw new HttpError(400, 'Dossier invalide');
	assertAccess(auth, 'read', prefix);
	const { folders, files } = await s3.listFolder(env, prefix);
	return json({
		prefix,
		folders: folders.map((p) => ({ prefix: p, name: p.slice(prefix.length, -1) })),
		files: files.map((f) => ({ ...f, name: f.key.slice(prefix.length) })).filter((f) => f.name && f.name !== '.keep'),
	});
}

export async function createFolder({ request, env, auth }) {
	const { prefix } = await readJson(request);
	if (!isFolderKey(prefix)) throw new HttpError(400, 'Nom de dossier invalide');
	assertAccess(auth, 'create', prefix);
	await s3.putEmpty(env, `${prefix}.keep`);
	return json({ created: prefix });
}

// Supprime fichiers et dossiers (avec tout leur contenu) en un minimum de requêtes.
async function deleteItems(env, items) {
	const wanted = [...new Set(items)];
	if (!wanted.length || wanted.length > MAX_KEYS_PER_DELETE_CALL || !wanted.every(s3.validKey)) {
		throw new HttpError(400, 'Éléments invalides');
	}
	const budget = deleteLimit(env);
	const all = new Set();
	for (const item of wanted) {
		if (!item.endsWith('/')) {
			all.add(item);
			continue;
		}
		const { keys, tooMany } = await s3.listKeys(env, item, budget - all.size);
		if (tooMany) throw new HttpError(413, `Trop de fichiers à supprimer d’un coup (max ${budget})`);
		keys.forEach((k) => all.add(k));
	}
	if (all.size > budget) throw new HttpError(413, `Trop de fichiers à supprimer d’un coup (max ${budget})`);
	if (all.size) await s3.removeMany(env, [...all]);
	await invalidateUsage(env);
	return json({ deleted: all.size, items: wanted.length });
}

// POST /api/delete { keys: [...] } — plusieurs éléments d'un coup
export async function removeBatch({ request, env }) {
	const { keys } = await readJson(request);
	return deleteItems(env, Array.isArray(keys) ? keys : []);
}

// DELETE /api/files?key=… — un seul élément (conservé pour compatibilité)
export async function removeOne({ env, url }) {
	return deleteItems(env, [url.searchParams.get('key')]);
}

export async function move({ request, env }) {
	const { from, to } = await readJson(request);
	if (!s3.validKey(from) || !s3.validKey(to)) throw new HttpError(400, 'Chemin invalide');
	const isDir = from.endsWith('/');
	if (to.endsWith('/') !== isDir) throw new HttpError(400, 'Chemin invalide');
	if (from === to) return json({ moved: to });
	if (isDir && to.startsWith(from)) throw new HttpError(400, 'Impossible de déplacer un dossier dans lui-même');

	if (!isDir) {
		if (await s3.exists(env, to)) throw new HttpError(409, 'Un fichier porte déjà ce nom à cet endroit');
		await s3.copy(env, from, to);
		await s3.remove(env, from);
		return json({ moved: to });
	}

	const limit = moveLimit(env);
	const clash = await s3.listPage(env, { prefix: to });
	if (clash.files.length) throw new HttpError(409, 'Un dossier porte déjà ce nom à cet endroit');
	const { keys, tooMany } = await s3.listKeys(env, from, limit);
	if (tooMany) throw new HttpError(413, `Dossier trop volumineux à déplacer (max ${limit} fichiers)`);
	// Copie tout d'abord, supprime ensuite : en cas d'échec, rien n'est perdu.
	await s3.pool(keys, 5, (k) => s3.copy(env, k, to + k.slice(from.length)));
	await s3.removeMany(env, keys);
	return json({ moved: to, count: keys.length });
}
