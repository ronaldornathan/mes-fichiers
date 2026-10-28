// src/access.js — qui a le droit de faire quoi, et où
import { HttpError } from './http.js';

/** need : 'read' | 'create'. key : fichier, dossier ou préfixe visé. Le propriétaire passe toujours. */
export function assertAccess(auth, need, key = '') {
	if (auth.role === 'owner') return;
	if (!auth.can[need]) throw new HttpError(403, need === 'read' ? 'Ce lien ne permet pas de lire' : 'Ce lien ne permet pas d’envoyer');
	if (!key.startsWith(auth.link.scope)) throw new HttpError(403, 'Hors du dossier partagé');
}
