// js/actions.js — les actions de l'utilisateur : elles enchaînent service (réseau) → état → écran.
// C'est le seul module qui mélange dialogues, notifications et services.
import { state, changed, can, root } from './state.js';
import { signedUrl } from './api.js';
import { listFolder, createFolder, moveItem, deleteItems, fetchUsage } from './services/files.js';
import { uploadFile } from './services/upload.js';
import { UPLOAD_PARALLEL } from './config.js';
import { $, baseName, isDir, sleep, store } from './utils.js';
import { toast } from './ui/toast.js';
import { ask } from './ui/dialog.js';
import { visible, markSelected } from './ui/render.js';
import { renderUsage, renderUsageUnknown, lastUsage } from './ui/gauge.js';
import { canPreview, openPreview } from './ui/preview.js';

/* ---------- données ---------- */
export async function load(prefix = state.prefix) {
  if (!prefix.startsWith(root())) prefix = root(); // un invité ne sort jamais de son dossier
  if (!can.read()) { // « dépôt seul » : rien à lister
    Object.assign(state, { prefix, folders: [], files: [], query: '', loading: false });
    state.sel.clear();
    return changed();
  }
  state.loading = true;
  changed();
  try {
    const d = await listFolder(prefix);
    Object.assign(state, { prefix, folders: d.folders, files: d.files, query: '' });
    $('#q').value = '';
    state.sel.clear();
  } catch (e) {
    toast(e.message, { err: true });
  }
  state.loading = false;
  changed();
}

export async function refreshUsage(fresh = false) {
  if (state.me.role !== 'owner') return; // la jauge globale n'est pas pour les invités
  try { renderUsage(await fetchUsage(fresh)); } catch { if (!lastUsage()) renderUsageUnknown(); }
}

/* ---------- affichage ---------- */
export const setFilter = (id) => { state.filter = id; state.sel.clear(); changed(); };
export const setSort = (v) => { state.sort = v; changed(); };
export const setQuery = (v) => { state.query = v; changed(); };
export function toggleView() {
  state.view = state.view === 'grid' ? 'list' : 'grid';
  store.set('fm_view', state.view);
  changed();
}

/* ---------- sélection ---------- */
export function toggleSel(id) {
  state.sel.has(id) ? state.sel.delete(id) : state.sel.add(id);
  markSelected(id);
}
export function selectAll() {
  const { fo, fi } = visible();
  fo.forEach((f) => state.sel.add(f.prefix));
  fi.forEach((f) => state.sel.add(f.key));
  changed();
}
export const clearSel = () => { state.sel.clear(); changed(); };

/* ---------- ouvrir / télécharger ---------- */
export async function download(key) {
  try {
    const a = document.createElement('a');
    a.href = await signedUrl(key, { inline: false });
    document.body.append(a);
    a.click();
    a.remove();
  } catch (e) { toast(e.message, { err: true }); }
}

export async function downloadSelected() {
  const keys = [...state.sel].filter((id) => !isDir(id));
  if (!keys.length) return toast('Les dossiers ne se téléchargent pas : sélectionne des fichiers.', { err: true });
  for (const k of keys) { await download(k); await sleep(350); }
}

export async function openFile(f) {
  if (!f) return;
  if (!canPreview(f)) return download(f.key);
  try {
    await openPreview(f, visible().fi);
  } catch {
    toast('Aperçu indisponible, téléchargement du fichier…');
    download(f.key);
  }
}

/** Clic sur un élément : dossier → on entre, fichier → aperçu. */
export function activate(id) {
  if (isDir(id)) return load(id);
  openFile(state.files.find((f) => f.key === id));
}

/* ---------- suppression (fichiers ET dossiers, un ou plusieurs) ---------- */
export async function removeItems(ids) {
  if (!ids.length || !can.manage()) return;
  const dirs = ids.filter(isDir).length;
  const label = ids.length === 1 ? '« ' + baseName(ids[0]) + ' »' : ids.length + ' éléments';
  const ok = await ask({
    title: 'Supprimer ' + label + ' ?',
    text: dirs ? 'Les dossiers et tout leur contenu seront supprimés définitivement.' : 'Cette action est définitive.',
    ok: 'Supprimer',
    danger: true,
  });
  if (!ok) return;

  const t = toast('Suppression…', { ms: 0 });
  try {
    await deleteItems(ids);
    const gone = new Set(ids);
    state.folders = state.folders.filter((f) => !gone.has(f.prefix));
    state.files = state.files.filter((f) => !gone.has(f.key));
    ids.forEach((id) => state.sel.delete(id));
    changed(); // pas de rechargement : l'écran est mis à jour tout de suite
    t.done(ids.length > 1 ? ids.length + ' éléments supprimés' : dirs ? 'Dossier supprimé' : 'Fichier supprimé');
  } catch (e) {
    t.done(e.message, { err: true });
    await load(); // on se resynchronise avec ce qui existe vraiment
  }
  refreshUsage(true);
}

/* ---------- dossiers : créer, renommer, déplacer ---------- */
export async function newFolder() {
  if (!can.create()) return;
  const name = ((await ask({ title: 'Nouveau dossier', input: '', ok: 'Créer' })) || '').replace(/[\/\\]/g, '');
  if (!name) return;
  try { await createFolder(state.prefix + name + '/'); toast('Dossier créé'); load(); }
  catch (e) { toast(e.message, { err: true }); }
}

async function mv(from, to) {
  try { await moveItem(from, to); toast('Déplacé'); await load(); }
  catch (e) { toast(e.message, { err: true }); }
}

export async function renameItem(id) {
  if (!can.manage()) return;
  const dir = isDir(id), old = baseName(id);
  const name = ((await ask({ title: 'Renommer', input: old, ok: 'Renommer' })) || '').replace(/[\/\\]/g, '');
  if (!name || name === old) return;
  mv(id, id.slice(0, id.length - old.length - (dir ? 1 : 0)) + name + (dir ? '/' : ''));
}

export async function moveDialog(id) {
  if (!can.manage()) return;
  let dest = await ask({ title: 'Déplacer vers', text: 'Chemin du dossier de destination (vide = racine).', input: state.prefix, ok: 'Déplacer' });
  if (dest === null) return;
  dest = dest.replace(/^\/+/, '');
  if (dest && !dest.endsWith('/')) dest += '/';
  mv(id, dest + baseName(id) + (isDir(id) ? '/' : ''));
}

/** Glisser-déposer d'un élément sur un dossier. */
export function dropMove(id, targetPrefix) {
  if (!can.manage()) return;
  if (isDir(id) && targetPrefix.startsWith(id)) return; // pas dans lui-même
  const to = targetPrefix + baseName(id) + (isDir(id) ? '/' : '');
  if (to !== id) mv(id, to);
}

/* ---------- envoi ---------- */
export async function uploadFiles(list, dest = state.prefix) {
  if (!can.create()) return;
  const queue = [...list];
  const worker = async () => {
    while (queue.length) {
      const f = queue.shift();
      const t = toast('Envoi de ' + f.name, { ms: 0, progress: true });
      try {
        await uploadFile(f, dest + f.name, (p) => { t.text('Envoi de ' + f.name + ' · ' + p + ' %'); t.progress(p); });
        t.done('Envoyé : ' + f.name);
      } catch (e) {
        t.done(f.name + ' : ' + e.message, { err: true, ms: 6000 });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(UPLOAD_PARALLEL, queue.length) }, worker));
  await load();
  refreshUsage(true);
}
