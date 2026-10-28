// js/services/files.js — opérations sur les fichiers (réseau uniquement, pas de DOM, pas d'état)
import { api } from '../api.js';
import { DELETE_CHUNK } from '../config.js';

export const listFolder = (prefix) => api('/api/files?prefix=' + encodeURIComponent(prefix));
export const createFolder = (prefix) => api('/api/folders', { method: 'POST', body: { prefix } });
export const moveItem = (from, to) => api('/api/move', { method: 'POST', body: { from, to } });
export const fetchUsage = (fresh = false) => api('/api/usage' + (fresh ? '?fresh=1' : ''));

/** Supprime des fichiers et/ou des dossiers (préfixe finissant par « / »). Retourne le nombre d'objets supprimés. */
export async function deleteItems(ids) {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += DELETE_CHUNK) {
    deleted += (await api('/api/delete', { method: 'POST', body: { keys: ids.slice(i, i + DELETE_CHUNK) } })).deleted;
  }
  return deleted;
}
