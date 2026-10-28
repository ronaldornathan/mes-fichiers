// src/shares.js — liens de partage, sessions invitées, demandes d'autorisation.
//
// Modèle (tout dans KV, clés `link:`, `sess:`, `req:`) :
//   link    un code secret (= son id) + droits (perms) + dossier visé (scope) + expiration
//   sess    un invité connecté avec un lien (sert à la liste « connectés » et à l'exclure)
//   req     une demande d'un invité pour un lien avec droits d'écriture (le propriétaire tranche)
//
// Droits : read (télécharger) · read_create (télécharger + envoyer) · create (envoyer seulement).
// Le propriétaire a toujours le dernier mot : il révoque n'importe quel lien (les liens créés
// à partir de lui tombent aussi), exclut n'importe quel invité, et valide les demandes d'écriture.
import { HttpError } from './http.js';
import { randomId } from './crypto.js';
import { getRecord, putRecord, deleteRecord, listRecords } from './kv.js';

export const PERMS = ['read', 'read_create', 'create'];
export const caps = (perms) => ({ read: perms !== 'create', create: perms !== 'read' });
export const EXPIRY_CHOICES = [3600, 86400, 604800, 2592000, 0]; // 1 h, 24 h, 7 j, 30 j, jamais
const SESSION_DAYS = 30;
const MAX_PENDING_PER_GUEST = 5;
const DAY = 86400;

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const ttlUntil = (exp) => (exp ? (exp - Date.now()) / 1000 + 3600 : 0);
const linkKey = (id) => `link:${id}`;
const validCode = (c) => typeof c === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(c);

// Expiration d'un lien : jamais plus tard que celle du lien dont il découle.
function calcExp(seconds, parentExp = 0) {
	let exp = seconds > 0 ? Date.now() + seconds * 1000 : 0;
	if (parentExp && (!exp || exp > parentExp)) exp = parentExp;
	return exp;
}

export function parseCreateBody(body) {
	if (!PERMS.includes(body.perms)) throw new HttpError(400, 'Droits invalides');
	const seconds = Number(body.expires);
	if (!EXPIRY_CHOICES.includes(seconds)) throw new HttpError(400, 'Durée invalide');
	const scope = body.scope ?? '';
	if (scope && !(typeof scope === 'string' && scope.endsWith('/') && scope.length <= 150)) throw new HttpError(400, 'Dossier invalide');
	return { perms: body.perms, seconds, scope, label: clean(body.label, 40), canShare: body.canShare !== false };
}

// ---------- liens ----------

export async function getLink(env, id) {
	if (!validCode(id)) return null;
	const rec = await getRecord(env, linkKey(id));
	return rec && (!rec.exp || rec.exp > Date.now()) ? rec : null;
}

async function insertLink(env, { label, perms, scope, exp, canShare, parent = '', by, byName }) {
	const rec = { id: randomId(16), label, perms, scope, exp, canShare: !!canShare, parent, by, byName: clean(byName, 30), at: Date.now() };
	await putRecord(env, linkKey(rec.id), rec, ttlUntil(exp));
	return rec;
}

export const createOwnerLink = (env, o) =>
	insertLink(env, { label: o.label, perms: o.perms, scope: o.scope, exp: calcExp(o.seconds), canShare: o.canShare, by: 'owner', byName: 'Moi' });

/** Révoque un lien, tous ceux qui en découlent, et déconnecte leurs invités. */
export async function revokeLink(env, id) {
	const links = await listRecords(env, 'link:');
	const ids = new Set([id]);
	for (let grew = true; grew; ) {
		grew = false;
		for (const l of links) if (l.parent && ids.has(l.parent) && !ids.has(l.id)) { ids.add(l.id); grew = true; }
	}
	const [sessions, requests] = await Promise.all([listRecords(env, 'sess:'), listRecords(env, 'req:')]);
	await Promise.all([
		...[...ids].map((i) => deleteRecord(env, linkKey(i))),
		...sessions.filter((s) => ids.has(s.lid)).map((s) => deleteRecord(env, `sess:${s.id}`)),
		...requests.filter((r) => ids.has(r.lid)).map((r) => deleteRecord(env, `req:${r.id}`)),
	]);
	return ids.size;
}

// ---------- invités ----------

export async function join(env, code, name) {
	const link = await getLink(env, code);
	if (!link) throw new HttpError(404, 'Code invalide ou expiré');
	const sess = { id: randomId(12), lid: link.id, name: clean(name, 30) || 'Invité', at: Date.now(), seen: Date.now() };
	await putRecord(env, `sess:${sess.id}`, sess, link.exp ? ttlUntil(link.exp) : SESSION_DAYS * DAY);
	return { sess, link };
}

/** Vérifie une session invitée à chaque requête : lien et session doivent toujours exister. */
export async function loadGuest(env, payload) {
	const [link, sess] = await Promise.all([getLink(env, payload.lid), getRecord(env, `sess:${payload.sid}`)]);
	if (!link || !sess || sess.lid !== link.id) throw new HttpError(401, 'Accès révoqué ou expiré');
	if (Date.now() - sess.seen > 120000) { // « dernière activité » : au plus une écriture toutes les 2 min
		sess.seen = Date.now();
		await putRecord(env, `sess:${sess.id}`, sess, link.exp ? ttlUntil(link.exp) : SESSION_DAYS * DAY).catch(() => {});
	}
	return { role: 'guest', sid: sess.id, name: sess.name, link, can: caps(link.perms) };
}

export const guestInfo = (g) => ({ role: 'guest', name: g.name, perms: g.link.perms, scope: g.link.scope, canShare: g.link.canShare, label: g.link.label, exp: g.link.exp });

// ---------- liste ----------

export async function listFor(env, auth) {
	const [links, sessions, requests] = await Promise.all([listRecords(env, 'link:'), listRecords(env, 'sess:'), listRecords(env, 'req:')]);
	const live = (l) => !l.exp || l.exp > Date.now();
	if (auth.role === 'owner') {
		const names = new Map(links.map((l) => [l.id, l.label]));
		return {
			role: 'owner',
			links: links.filter(live).sort((a, b) => b.at - a.at),
			sessions: sessions.map((s) => ({ ...s, linkLabel: names.get(s.lid) || '' })).sort((a, b) => b.seen - a.seen),
			requests: requests.filter((r) => r.status === 'pending').sort((a, b) => b.at - a.at),
		};
	}
	return { // un invité ne voit que ce qui le concerne : jamais les autres invités
		role: 'guest',
		links: links.filter((l) => l.by === auth.sid && live(l)).sort((a, b) => b.at - a.at),
		requests: requests.filter((r) => r.sid === auth.sid).sort((a, b) => b.at - a.at),
	};
}

// ---------- création par un invité ----------

export async function createByGuest(env, g, o) {
	if (!g.link.canShare) throw new HttpError(403, 'Ce lien ne permet pas de partager');
	const mine = caps(g.link.perms), want = caps(o.perms);
	if ((want.read && !mine.read) || (want.create && !mine.create)) throw new HttpError(403, 'Tu ne peux pas donner plus de droits que les tiens');
	const scope = o.scope || g.link.scope;
	if (!scope.startsWith(g.link.scope)) throw new HttpError(403, 'Hors du dossier partagé avec toi');

	if (o.perms === 'read') { // lecture seule : libre, sans demander
		const link = await insertLink(env, { label: o.label, perms: 'read', scope, exp: calcExp(o.seconds, g.link.exp), canShare: false, parent: g.link.id, by: g.sid, byName: g.name });
		return { link };
	}
	// droits d'écriture : le propriétaire doit autoriser
	const pending = (await listRecords(env, 'req:')).filter((r) => r.sid === g.sid && r.status === 'pending');
	if (pending.length >= MAX_PENDING_PER_GUEST) throw new HttpError(429, 'Trop de demandes en attente');
	const req = { id: randomId(12), sid: g.sid, lid: g.link.id, name: g.name, perms: o.perms, scope, label: o.label, seconds: o.seconds, at: Date.now(), status: 'pending' };
	await putRecord(env, `req:${req.id}`, req, 7 * DAY);
	return { request: req };
}

// ---------- décision du propriétaire ----------

export async function decide(env, id, action, perms) {
	const req = await getRecord(env, `req:${id}`);
	if (!req) throw new HttpError(404, 'Demande introuvable');
	if (req.status !== 'pending') throw new HttpError(409, 'Demande déjà traitée');
	if (action === 'deny') {
		await putRecord(env, `req:${id}`, { ...req, status: 'denied' }, 7 * DAY);
		return { status: 'denied' };
	}
	const parent = await getLink(env, req.lid);
	if (!parent) throw new HttpError(410, 'Le lien de cet invité n’existe plus');
	const final = PERMS.includes(perms) ? perms : req.perms; // le propriétaire peut accorder moins que demandé
	const link = await insertLink(env, { label: req.label, perms: final, scope: req.scope, exp: calcExp(req.seconds, parent.exp), canShare: false, parent: parent.id, by: req.sid, byName: req.name });
	await putRecord(env, `req:${id}`, { ...req, status: 'approved', perms: final, code: link.id }, 30 * DAY);
	return { status: 'approved', link };
}

export async function pendingCount(env) {
	return (await listRecords(env, 'req:')).filter((r) => r.status === 'pending').length;
}

export async function kick(env, sid) {
	await deleteRecord(env, `sess:${sid}`);
}
