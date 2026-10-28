// src/http.js — réponses JSON, erreurs HTTP, CORS

export class HttpError extends Error {
	constructor(status, message, extra = {}) {
		super(message);
		this.status = status;
		this.extra = extra;
	}
}

export function json(data, status = 200, headers = {}) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
	});
}

export async function readJson(request) {
	try {
		const body = await request.json();
		return body && typeof body === 'object' ? body : {};
	} catch {
		throw new HttpError(400, 'Requête invalide');
	}
}

export function corsHeaders(request, env) {
	const allowed = (env.ALLOWED_ORIGIN || '*')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	const origin = request.headers.get('Origin') || '';
	const allow = allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0];
	return {
		'Access-Control-Allow-Origin': allow,
		'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type,Authorization',
		'Access-Control-Max-Age': '86400',
		Vary: 'Origin',
	};
}
