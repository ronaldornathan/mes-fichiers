// src/index.js — point d'entrée du Worker (CORS, erreurs, aiguillage). Rien de métier ici.
//
// Secrets : TIGRIS_ACCESS_KEY_ID, TIGRIS_SECRET_ACCESS_KEY, BUCKET_NAME, JWT_SECRET, APP_PASSWORD
// Variables (wrangler.jsonc) : STORAGE_LIMIT_BYTES, ALERT_BYTES, ALLOWED_ORIGIN, S3_ENDPOINT,
//                              MAX_BATCH_OBJECTS (déplacement), MAX_DELETE_OBJECTS (suppression)
// Binding KV : RATE_LIMIT (essais de connexion + cache de la jauge)
//
// Organisation :  index → router → handlers/* → s3 / usage / auth → config / http
import { REQUIRED_ENV } from './config.js';
import { HttpError, corsHeaders, json } from './http.js';
import { dispatch } from './router.js';

export default {
	async fetch(request, env) {
		const cors = corsHeaders(request, env);
		if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
		try {
			if (REQUIRED_ENV.some((name) => !env[name])) throw new HttpError(500, 'Configuration incomplète (secrets manquants)');
			const res = await dispatch(request, env);
			for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
			return res;
		} catch (err) {
			if (err instanceof HttpError) return json({ error: err.message, ...err.extra }, err.status, cors);
			console.error(err);
			return json({ error: 'Erreur serveur' }, 500, cors);
		}
	},
};
