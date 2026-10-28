// src/auth.js — connexion propriétaire (mot de passe), session JWT (HS256), identification des invités
import { SESSION_TTL, MAX_FAILURES, LOCK_SECONDS } from './config.js';
import { HttpError, json, readJson } from './http.js';
import { b64url, fromB64url, hmac, sameBytes } from './crypto.js';
import { loadGuest } from './shares.js';

const ENC = new TextEncoder();

// Comparaison à temps constant : on compare les HMAC des deux valeurs.
const safeEqual = async (secret, a, b) => sameBytes(await hmac(secret, a), await hmac(secret, b));

export async function signToken(env, claims, ttlSeconds = SESSION_TTL) {
	const header = b64url(ENC.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
	const payload = b64url(ENC.encode(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + ttlSeconds })));
	return `${header}.${payload}.${b64url(await hmac(env.JWT_SECRET, `${header}.${payload}`))}`;
}

async function verifyToken(env, token) {
	const parts = (token || '').split('.');
	if (parts.length !== 3) return null;
	try {
		const expected = await hmac(env.JWT_SECRET, `${parts[0]}.${parts[1]}`);
		if (!sameBytes(expected, fromB64url(parts[2]))) return null;
		const payload = JSON.parse(new TextDecoder().decode(fromB64url(parts[1])));
		return payload.exp > Date.now() / 1000 ? payload : null;
	} catch {
		return null;
	}
}

/** Retourne { role: 'owner' } ou { role: 'guest', sid, link, can… } — ou lève une 401. */
export async function authenticate(request, env) {
	const token = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
	const p = await verifyToken(env, token);
	if (!p) throw new HttpError(401, 'Non autorisé');
	if (!p.role || p.role === 'owner') return { role: 'owner' }; // anciens jetons (sans rôle) = propriétaire
	if (p.role === 'guest') return loadGuest(env, p);
	throw new HttpError(401, 'Non autorisé');
}

// Limite les essais (mot de passe ou code d'invitation) : 5 échecs → blocage 15 min par IP.
export async function checkLock(request, env, scope) {
	const key = `${scope}:${request.headers.get('CF-Connecting-IP') || 'inconnue'}`;
	const failures = Number(await env.RATE_LIMIT.get(key)) || 0;
	if (failures >= MAX_FAILURES) throw new HttpError(429, "Trop d'essais. Réessaie dans 15 minutes.");
	return {
		fail: async () => {
			await env.RATE_LIMIT.put(key, String(failures + 1), { expirationTtl: LOCK_SECONDS });
			await new Promise((r) => setTimeout(r, 1000)); // ralentit les essais en rafale
		},
		clear: async () => { if (failures > 0) await env.RATE_LIMIT.delete(key); },
	};
}

export async function login({ request, env }) {
	const lock = await checkLock(request, env, 'fail');
	const body = await readJson(request);
	const ok = typeof body.password === 'string' && (await safeEqual(env.JWT_SECRET, body.password, env.APP_PASSWORD));
	if (!ok) {
		await lock.fail();
		throw new HttpError(401, 'Mot de passe incorrect');
	}
	await lock.clear();
	return json({ token: await signToken(env, { role: 'owner' }), expiresIn: SESSION_TTL });
}
