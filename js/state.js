// js/state.js — l'état de l'application, un seul endroit. Les modules « ui » le lisent,
// les modules « actions » le modifient puis appellent changed().
import { store } from './utils.js';

export const state = {
  prefix: '',
  folders: [],
  files: [],
  query: '',
  filter: 'all',
  sort: 'name-asc',
  view: store.get('fm_view', 'grid'),
  sel: new Set(), // clés de fichiers et préfixes de dossiers sélectionnés
  loading: false,
  me: { role: 'owner' }, // { role:'guest', perms, scope, canShare, label, name, exp } pour un invité
};

const subscribers = new Set();
export const subscribe = (fn) => subscribers.add(fn);
export const changed = () => subscribers.forEach((fn) => fn());

// Ce que la personne connectée a le droit de faire (le serveur revérifie toujours).
const owner = () => state.me.role === 'owner';
export const can = {
  read: () => owner() || state.me.perms !== 'create',
  create: () => owner() || state.me.perms !== 'read',
  manage: () => owner(), // supprimer, renommer, déplacer, voir les connectés
  share: () => owner() || !!state.me.canShare,
};
/** Dossier de départ : tout pour le propriétaire, le dossier partagé pour un invité. */
export const root = () => (owner() ? '' : state.me.scope || '');
