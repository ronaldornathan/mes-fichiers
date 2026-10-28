// src/crypto.js — petits outils cryptographiques partagés
const ENC = new TextEncoder();

export const b64url = (buf) =>
	btoa(String.fromCharCode(...new Uint8Array(buf)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
export const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export async function hmac(secret, data) {
	const key = await crypto.subtle.importKey('raw', ENC.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return new Uint8Array(await crypto.subtle.sign('HMAC', key, ENC.encode(data)));
}

export function sameBytes(a, b) {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}

/** Identifiant aléatoire, impossible à deviner (16 octets = 128 bits par défaut). */
export const randomId = (bytes = 16) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));
