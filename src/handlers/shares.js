// src/handlers/shares.js — partage : rejoindre, créer/révoquer des liens, demandes, exclusions
import { HttpError, json, readJson } from '../http.js';
import { checkLock, signToken } from '../auth.js';
import * as shares from '../shares.js';

export async function me({ auth }) {
	return json(auth.role === 'owner' ? { role: 'owner' } : shares.guestInfo(auth));
}

// Public : un invité échange son code contre une session.
export async function join({ request, env }) {
	const lock = await checkLock(request, env, 'jfail');
	const { code, name } = await readJson(request);
	let joined;
	try {
		joined = await shares.join(env, code, name);
	} catch (err) {
		if (err instanceof HttpError && err.status === 404) await lock.fail();
		throw err;
	}
	await lock.clear();
	const { sess, link } = joined;
	const seconds = link.exp ? Math.max(60, Math.floor((link.exp - Date.now()) / 1000)) : 30 * 86400;
	const token = await signToken(env, { role: 'guest', sid: sess.id, lid: link.id }, Math.min(seconds, 30 * 86400));
	return json({ token, me: shares.guestInfo({ name: sess.name, link }) });
}

export async function list({ env, url, auth }) {
	if (auth.role === 'owner' && url.searchParams.get('summary') === '1') return json({ pending: await shares.pendingCount(env) }); // 1 seul appel KV
	return json(await shares.listFor(env, auth));
}

export async function create({ request, env, auth }) {
	const o = shares.parseCreateBody(await readJson(request));
	if (auth.role === 'owner') return json({ link: await shares.createOwnerLink(env, o) });
	return json(await shares.createByGuest(env, auth, o));
}

// Le propriétaire révoque n'importe quel lien ; un invité seulement ceux qu'il a créés.
export async function revoke({ env, url, auth }) {
	const id = url.searchParams.get('id') || '';
	const link = await shares.getLink(env, id);
	if (!link) throw new HttpError(404, 'Lien introuvable');
	if (auth.role !== 'owner' && link.by !== auth.sid) throw new HttpError(403, 'Ce lien n’est pas le tien');
	return json({ revoked: await shares.revokeLink(env, id) });
}

export async function kick({ env, url }) {
	await shares.kick(env, url.searchParams.get('id') || '');
	return json({ kicked: true });
}

export async function decide({ request, env }) {
	const { id, action, perms } = await readJson(request);
	if (!['approve', 'deny'].includes(action)) throw new HttpError(400, 'Action invalide');
	return json(await shares.decide(env, id, action, perms));
}
