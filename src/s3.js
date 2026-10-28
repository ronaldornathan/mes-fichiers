// src/s3.js — tout ce qui parle au stockage Tigris (API S3). Rien d'autre ici.
import { AwsClient } from 'aws4fetch';
import { SIGNED_URL_TTL, MAX_KEY_LENGTH, FALLBACK_DELETE_LIMIT } from './config.js';
import { HttpError } from './http.js';

const ENC = new TextEncoder();

const client = (env) =>
	new AwsClient({
		accessKeyId: env.TIGRIS_ACCESS_KEY_ID,
		secretAccessKey: env.TIGRIS_SECRET_ACCESS_KEY,
		service: 's3',
		region: 'auto',
	});

const endpointHost = (env) => new URL(env.S3_ENDPOINT || 'https://t3.storage.dev').host;
const bucketUrl = (env) => `https://${env.BUCKET_NAME}.${endpointHost(env)}`;
const encodeKey = (key) => key.split('/').map(encodeURIComponent).join('/');
const objectUrl = (env, key) => `${bucketUrl(env)}/${encodeKey(key)}`;

export function validKey(key) {
	return (
		typeof key === 'string' &&
		key.length > 0 &&
		key.length <= MAX_KEY_LENGTH &&
		!key.startsWith('/') &&
		!key.split('/').some((seg) => seg === '..' || seg === '.') &&
		!/[\u0000-\u001f]/.test(key)
	);
}

// Exécute `fn` sur chaque élément, `size` à la fois (plus rapide que une par une).
export async function pool(items, size, fn) {
	let i = 0;
	await Promise.all(
		Array.from({ length: Math.min(size, items.length) }, async () => {
			while (i < items.length) await fn(items[i++]);
		}),
	);
}

// ---------- liens signés ----------

export async function presign(env, method, key, params = {}) {
	const url = new URL(objectUrl(env, key));
	url.searchParams.set('X-Amz-Expires', String(SIGNED_URL_TTL));
	for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	const signed = await client(env).sign(new Request(url.toString(), { method }), { aws: { signQuery: true } });
	return signed.url;
}

// ---------- lecture ----------

const decodeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const encodeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const tag = (xml, name) => {
	const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
	return m ? decodeXml(m[1]) : '';
};

function parseList(xml) {
	return {
		files: [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((m) => ({
			key: tag(m[1], 'Key'),
			size: Number(tag(m[1], 'Size')),
			lastModified: tag(m[1], 'LastModified'),
		})),
		folders: [...xml.matchAll(/<CommonPrefixes>\s*<Prefix>([\s\S]*?)<\/Prefix>/g)].map((m) => decodeXml(m[1])),
		next: /<IsTruncated>true<\/IsTruncated>/.test(xml) ? tag(xml, 'NextContinuationToken') : null,
	};
}

export async function listPage(env, { prefix = '', delimiter = '', token = '' } = {}) {
	const url = new URL(`${bucketUrl(env)}/`);
	url.searchParams.set('list-type', '2');
	if (prefix) url.searchParams.set('prefix', prefix);
	if (delimiter) url.searchParams.set('delimiter', delimiter);
	if (token) url.searchParams.set('continuation-token', token);
	const res = await client(env).fetch(url.toString());
	if (!res.ok) throw new HttpError(502, `Liste impossible (${res.status})`);
	return parseList(await res.text());
}

// Contenu d'un dossier (un niveau) : sous-dossiers + fichiers.
export async function listFolder(env, prefix) {
	const folders = [];
	const files = [];
	let token = '';
	do {
		const page = await listPage(env, { prefix, delimiter: '/', token });
		folders.push(...page.folders);
		files.push(...page.files);
		token = page.next || '';
	} while (token);
	return { folders, files };
}

// Toutes les clés sous un préfixe. S'arrête dès que `limit` est dépassé.
export async function listKeys(env, prefix, limit) {
	const keys = [];
	let token = '';
	do {
		const page = await listPage(env, { prefix, token });
		keys.push(...page.files.map((f) => f.key));
		if (keys.length > limit) return { keys, tooMany: true };
		token = page.next || '';
	} while (token);
	return { keys, tooMany: false };
}

// Taille totale du bucket (parcourt toutes les pages — appelé rarement, voir usage.js).
export async function totalSize(env) {
	let used = 0;
	let count = 0;
	let token = '';
	let pages = 0;
	do {
		const page = await listPage(env, { token });
		for (const f of page.files) {
			used += f.size;
			count++;
		}
		token = page.next || '';
	} while (token && ++pages < 100);
	return { used, count };
}

export async function exists(env, key) {
	return (await client(env).fetch(objectUrl(env, key), { method: 'HEAD' })).ok;
}

// ---------- écriture ----------

export async function putEmpty(env, key) {
	const res = await client(env).fetch(objectUrl(env, key), { method: 'PUT', body: '' });
	if (!res.ok) throw new HttpError(502, 'Création impossible');
}

export async function copy(env, from, to) {
	const res = await client(env).fetch(objectUrl(env, to), {
		method: 'PUT',
		headers: { 'x-amz-copy-source': `/${env.BUCKET_NAME}/${encodeKey(from)}` },
	});
	if (!res.ok) throw new HttpError(502, `Copie impossible (${res.status})`);
}

export async function remove(env, key) {
	const res = await client(env).fetch(objectUrl(env, key), { method: 'DELETE' });
	if (!res.ok) throw new HttpError(502, `Suppression impossible (${res.status})`);
}

async function md5Base64(text) {
	const digest = await crypto.subtle.digest('MD5', ENC.encode(text)); // MD5 est supporté par les Workers
	return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

// Suppression groupée : 1 requête pour 1000 objets (au lieu de 1 par objet).
async function removeBatch(env, keys) {
	const body =
		'<?xml version="1.0" encoding="UTF-8"?><Delete><Quiet>true</Quiet>' +
		keys.map((k) => `<Object><Key>${encodeXml(k)}</Key></Object>`).join('') +
		'</Delete>';
	const res = await client(env).fetch(`${bucketUrl(env)}/?delete`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/xml', 'Content-MD5': await md5Base64(body) },
		body,
	});
	if (!res.ok) throw new Error(`delete ${res.status}`);
	const failed = [...(await res.text()).matchAll(/<Error>[\s\S]*?<Key>([\s\S]*?)<\/Key>/g)].length;
	if (failed) throw new HttpError(502, `${failed} suppression(s) refusée(s) par le stockage`);
}

// Supprime beaucoup de clés. Essaie le mode groupé ; si le stockage le refuse,
// retombe sur des suppressions unitaires (limitées pour rester sous le quota de sous-requêtes).
export async function removeMany(env, keys) {
	if (keys.length === 1) return remove(env, keys[0]);
	try {
		for (let i = 0; i < keys.length; i += 1000) await removeBatch(env, keys.slice(i, i + 1000));
	} catch (err) {
		if (err instanceof HttpError) throw err;
		if (keys.length > FALLBACK_DELETE_LIMIT) {
			throw new HttpError(502, 'Suppression groupée refusée par le stockage, réessaie avec moins d’éléments');
		}
		await pool(keys, 5, (k) => remove(env, k));
	}
}
