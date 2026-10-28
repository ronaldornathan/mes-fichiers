// src/router.js — table des routes. Accès : 'public' · 'any' (propriétaire ou invité, le handler
// vérifie ses droits) · 'owner' (propriétaire uniquement).
import { login, authenticate } from './auth.js';
import { HttpError, json } from './http.js';
import * as files from './handlers/files.js';
import * as urls from './handlers/urls.js';
import * as shares from './handlers/shares.js';
import { getUsage } from './usage.js';

const usageRoute = async ({ env, url }) => json(await getUsage(env, { fresh: url.searchParams.get('fresh') === '1' }));

const ROUTES = [
	['POST', '/api/login', 'public', login],
	['POST', '/api/share/join', 'public', shares.join],
	['GET', '/api/me', 'any', shares.me],
	['GET', '/api/files', 'any', files.list],
	['POST', '/api/folders', 'any', files.createFolder],
	['POST', '/api/upload-url', 'any', urls.upload],
	['POST', '/api/download-url', 'any', urls.download],
	['POST', '/api/download-urls', 'any', urls.downloadMany],
	['GET', '/api/shares', 'any', shares.list],
	['POST', '/api/shares', 'any', shares.create],
	['DELETE', '/api/shares', 'any', shares.revoke],
	['DELETE', '/api/files', 'owner', files.removeOne],
	['POST', '/api/delete', 'owner', files.removeBatch],
	['POST', '/api/move', 'owner', files.move],
	['GET', '/api/usage', 'owner', usageRoute],
	['DELETE', '/api/sessions', 'owner', shares.kick],
	['POST', '/api/share-requests', 'owner', shares.decide],
];

export async function dispatch(request, env) {
	const url = new URL(request.url);
	const route = ROUTES.find(([m, p]) => m === request.method && p === url.pathname);
	if (!route) throw new HttpError(404, 'Introuvable');
	const [, , access, handler] = route;
	const auth = access === 'public' ? null : await authenticate(request, env);
	if (access === 'owner' && auth.role !== 'owner') throw new HttpError(403, 'Réservé au propriétaire');
	return handler({ request, env, url, auth });
}
