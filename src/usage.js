// src/usage.js — jauge de stockage.
// Parcourir tout le bucket coûte cher : le résultat est gardé 60 s dans KV
// (le Cache API n'existe pas sur *.workers.dev). `fresh` force un recalcul.
import { USAGE_CACHE_SECONDS, storageLimits } from './config.js';
import { totalSize } from './s3.js';

const CACHE_KEY = 'cache:usage';

function describe(env, used, count) {
	const { limit, alertAt } = storageLimits(env);
	const percent = Math.round((used / limit) * 1000) / 10;
	return {
		used,
		count,
		limit,
		alertAt,
		alert: used >= alertAt,
		// ok → warn (seuil d'alerte) → full (95 % du quota)
		level: used >= limit * 0.95 ? 'full' : used >= alertAt ? 'warn' : 'ok',
		percent,
	};
}

export async function getUsage(env, { fresh = false } = {}) {
	if (!fresh) {
		const cached = await env.RATE_LIMIT.get(CACHE_KEY, 'json').catch(() => null);
		if (cached) return describe(env, cached.used, cached.count); // les seuils suivent toujours la config
	}
	const { used, count } = await totalSize(env);
	await env.RATE_LIMIT.put(CACHE_KEY, JSON.stringify({ used, count }), { expirationTtl: Math.max(60, USAGE_CACHE_SECONDS) }).catch(() => {});
	return describe(env, used, count);
}

export const invalidateUsage = (env) => env.RATE_LIMIT.delete(CACHE_KEY).catch(() => {});
