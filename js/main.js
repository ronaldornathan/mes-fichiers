// js/main.js — point d'entrée : branche les événements du DOM sur les actions. Aucune logique métier.
import { state, subscribe, can, root } from './state.js';
import { setUnauthorizedHandler, api, clearUrlCache } from './api.js';
import { getToken, setToken } from './session.js';
import { $, debounce, fmtSize, isDir } from './utils.js';
import { render } from './ui/render.js';
import { applyRole } from './ui/role.js';
import { fetchMe, joinWith } from './services/shares.js';
import { openShare, closeShare, onShareClick, refreshBadge } from './shareActions.js';
import { showMenu, hideMenu, menuOpen } from './ui/menu.js';
import { closePreview, previewOpen, stepPreview, currentPreview } from './ui/preview.js';
import { dialogOpen } from './ui/dialog.js';
import { toast } from './ui/toast.js';
import { lastUsage } from './ui/gauge.js';
import * as A from './actions.js';

subscribe(render);

/* ---------- session ---------- */
function logout() {
  setToken('');
  clearUrlCache();
  Object.assign(state, { prefix: '', folders: [], files: [], query: '', filter: 'all', me: { role: 'owner' } });
  state.sel.clear();
  applyRole();
  $('#shareDlg').open && closeShare();
  document.body.classList.remove('nav-open');
  closePreview();
  $('#app').hidden = true;
  $('#login').hidden = false;
}
setUnauthorizedHandler(logout);

async function start() {
  try {
    state.me = await fetchMe(); // propriétaire ou invité (et avec quels droits)
  } catch (err) {
    if (getToken()) $('#loginErr').textContent = 'Connexion impossible : ' + err.message;
    return;
  }
  applyRole();
  $('#login').hidden = true;
  $('#app').hidden = false;
  A.load(root());
  if (state.me.role === 'owner') { A.refreshUsage(); refreshBadge(); }
}

function showJoin(on, code = '') {
  $('#loginForm').hidden = on;
  $('#joinForm').hidden = !on;
  if (on) { $('#jcode').value = code; (code ? $('#jname') : $('#jcode')).focus(); }
}
$('#showJoin').addEventListener('click', () => showJoin(true));
$('#showLogin').addEventListener('click', () => showJoin(false));
$('#joinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#joinErr').textContent = '';
  try {
    const d = await joinWith($('#jcode').value.trim().replace(/^.*join=/, ''), $('#jname').value);
    setToken(d.token);
    start();
  } catch (err) { $('#joinErr').textContent = err.message; }
});

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#loginErr').textContent = '';
  try {
    const d = await api('/api/login', { method: 'POST', body: { password: $('#pw').value } });
    setToken(d.token);
    $('#pw').value = '';
    start();
  } catch (err) { $('#loginErr').textContent = err.message; }
});
$('#logout').addEventListener('click', logout);

/* ---------- navigation & liste ---------- */
$('#crumbs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) A.load(b.dataset.p); });
$('#filters').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  document.body.classList.remove('nav-open');
  A.setFilter(b.dataset.f);
});
$('#q').addEventListener('input', debounce((e) => A.setQuery(e.target.value), 120));
$('#sort').addEventListener('change', (e) => A.setSort(e.target.value));
$('#viewBtn').addEventListener('click', A.toggleView);
$('#menuBtn').addEventListener('click', () => document.body.classList.add('nav-open'));
$('#scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));

const menuFor = () => (can.manage() ? { dl: A.download, ren: A.renameItem, mv: A.moveDialog, del: (id) => A.removeItems([id]) } : can.read() ? { dl: A.download } : {});
const content = $('#content');
content.addEventListener('click', (e) => {
  const it = e.target.closest('.item');
  if (!it) return;
  const id = it.dataset.id;
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'menu') return showMenu(e.target.closest('[data-act]'), id, menuFor());
  if (act === 'sel' || state.sel.size) return A.toggleSel(id);
  A.activate(id);
});
content.addEventListener('keydown', (e) => {
  const it = e.target.closest?.('.item');
  if (it && (e.key === 'Enter' || e.key === ' ') && e.target === it) { e.preventDefault(); it.click(); }
});
document.addEventListener('click', (e) => { if (!e.target.closest('#menu,.more')) hideMenu(); });

/* ---------- barre de sélection ---------- */
$('#selAll').addEventListener('click', A.selectAll);
$('#selDl').addEventListener('click', A.downloadSelected);
$('#selDel').addEventListener('click', () => A.removeItems([...state.sel]));
$('#selClear').addEventListener('click', A.clearSel);

/* ---------- création, envoi, glisser-déposer ---------- */
$('#newFolder').addEventListener('click', A.newFolder);
$('#uploadBtn').addEventListener('click', () => $('#pick').click());

/* ---------- partage ---------- */
$('#shareBtn').addEventListener('click', openShare);
$('#shareBody').addEventListener('click', onShareClick);
$('#shareClose').addEventListener('click', closeShare);
$('#shareDlg').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeShare(); });
setInterval(() => { if (!document.hidden && !$('#app').hidden) refreshBadge(); }, 300000); // nouvelles demandes (propriétaire)
$('#pick').addEventListener('change', (e) => { A.uploadFiles([...e.target.files]); e.target.value = ''; });

let depth = 0, hot = null;
const setHot = (el) => { if (hot !== el) { hot?.classList.remove('dropto'); hot = el; hot?.classList.add('dropto'); } };
const folderUnder = (e) => { const it = e.target.closest?.('.item'); return it && isDir(it.dataset.id) ? it : null; };
content.addEventListener('dragstart', (e) => {
  const it = e.target.closest?.('.item');
  if (it) e.dataTransfer.setData('text/fm-key', it.dataset.id);
});
content.addEventListener('dragenter', (e) => { if ([...e.dataTransfer.types].includes('Files') && depth++ === 0) content.classList.add('drag'); });
content.addEventListener('dragover', (e) => { e.preventDefault(); setHot(folderUnder(e)); });
content.addEventListener('dragleave', (e) => {
  if ([...e.dataTransfer.types].includes('Files') && --depth <= 0) { depth = 0; content.classList.remove('drag'); }
  if (!e.relatedTarget || !content.contains(e.relatedTarget)) setHot(null);
});
content.addEventListener('drop', (e) => {
  e.preventDefault();
  depth = 0;
  content.classList.remove('drag');
  const target = folderUnder(e)?.dataset.id;
  setHot(null);
  const moved = e.dataTransfer.getData('text/fm-key');
  if (moved) return target && A.dropMove(moved, target);
  const list = [...e.dataTransfer.files].filter((f) => f.size > 0 || f.type);
  if (list.length) A.uploadFiles(list, target ?? state.prefix);
});

/* ---------- voyant de stockage ---------- */
$('#gauge').addEventListener('click', async () => {
  await A.refreshUsage(true);
  const u = lastUsage();
  if (u) toast(`Stockage : ${fmtSize(u.used)} utilisés sur ${fmtSize(u.limit)} (${u.percent} %) · ${u.count} fichier${u.count > 1 ? 's' : ''}`);
});

/* ---------- aperçu ---------- */
$('#pclose').addEventListener('click', closePreview);
$('#pprev').addEventListener('click', () => stepPreview(-1));
$('#pnext').addEventListener('click', () => stepPreview(1));
$('#pdl').addEventListener('click', () => currentPreview() && A.download(currentPreview().key));

/* ---------- clavier ---------- */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (previewOpen()) closePreview();
    else if (menuOpen()) hideMenu();
    else if (state.sel.size) A.clearSel();
    else document.body.classList.remove('nav-open');
    return;
  }
  if (previewOpen()) { if (e.key === 'ArrowLeft') stepPreview(-1); if (e.key === 'ArrowRight') stepPreview(1); return; }
  if (dialogOpen() || $('#app').hidden || e.metaKey || (e.ctrlKey && e.key !== 'a')) return;
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (e.key === '/') { e.preventDefault(); $('#q').focus(); }
  else if (e.key === 'n' && can.create()) { e.preventDefault(); A.newFolder(); }
  else if (e.key === 'u' && can.create()) $('#pick').click();
  else if (e.key === 'v') A.toggleView();
  else if ((e.key === 'Delete' || e.key === 'Backspace') && state.sel.size) A.removeItems([...state.sel]);
  else if (e.ctrlKey && e.key === 'a') { e.preventDefault(); A.selectAll(); }
});

/* ---------- démarrage ---------- */
render();
const invite = location.hash.match(/join=([\w-]+)/);
if (invite) { // lien reçu : on propose de rejoindre (le code quitte l'URL tout de suite)
  history.replaceState(null, '', location.pathname + location.search);
  showJoin(true, invite[1]);
} else if (getToken()) start();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
