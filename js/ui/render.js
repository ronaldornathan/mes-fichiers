// js/ui/render.js — dessine l'écran à partir de l'état (aucune requête réseau ici)
import { state, can, root } from '../state.js';
import { FILTERS, typeOf, matchesFilter } from '../filetypes.js';
import { THUMB_MAX_BYTES } from '../config.js';
import { $, esc, ico, fmtSize, baseName } from '../utils.js';
import { observeThumbs } from './thumbs.js';

const collator = new Intl.Collator('fr', { numeric: true });
const dateFmt = new Intl.DateTimeFormat('fr-FR');

/** Dossiers et fichiers à afficher (recherche + filtre + tri appliqués). */
export function visible() {
  const q = state.query.toLowerCase();
  const fo = state.filter === 'all' ? state.folders.filter((f) => f.name.toLowerCase().includes(q)) : [];
  const fi = state.files.filter((f) => f.name.toLowerCase().includes(q) && matchesFilter(f.name, state.filter));
  const [k, d] = state.sort.split('-');
  const m = d === 'asc' ? 1 : -1;
  const cmp = {
    name: (a, b) => collator.compare(a.name, b.name),
    size: (a, b) => a.size - b.size,
    date: (a, b) => new Date(a.lastModified) - new Date(b.lastModified),
  }[k];
  fi.sort((a, b) => m * cmp(a, b));
  fo.sort((a, b) => collator.compare(a.name, b.name));
  return { fo, fi };
}

function renderCrumbs() {
  const base = root();
  const rootName = state.me.role === 'guest' ? state.me.label || (base ? baseName(base) : 'Partage') : 'Mes fichiers';
  let html = `<button data-p="${esc(base)}">${esc(rootName)}</button>`;
  let acc = base;
  for (const seg of state.prefix.slice(base.length).split('/').filter(Boolean)) {
    acc += seg + '/';
    html += `<span>›</span><button data-p="${esc(acc)}">${esc(seg)}</button>`;
  }
  $('#crumbs').innerHTML = html;
}

function renderFilters() {
  const counts = {};
  for (const f of state.files) {
    for (const flt of FILTERS) if (flt.kinds?.includes(typeOf(f.name).kind)) counts[flt.id] = (counts[flt.id] || 0) + 1;
  }
  $('#filters').innerHTML = FILTERS.map((f) =>
    `<button class="nav${f.id === state.filter ? ' on' : ''}" data-f="${f.id}">${ico('all')}${f.label}${counts[f.id] ? `<i>${counts[f.id]}</i>` : ''}</button>`).join('');
}

const CHK = `<button class="chk" data-act="sel" aria-label="Sélectionner">${ico('check')}</button>`;
const MORE = `<button class="more" data-act="menu" aria-label="Actions">${ico('more')}</button>`;

function folderItem(f) {
  const sel = state.sel.has(f.prefix) ? ' sel' : '';
  return `<div class="item${sel}" draggable="${can.manage()}" tabindex="0" data-id="${esc(f.prefix)}">${CHK}<div class="thumb"><div class="ft k-dir">${ico('folder')}</div></div><div class="info"><div class="name" title="${esc(f.name)}">${esc(f.name)}</div><div class="meta">Dossier</div></div>${MORE}</div>`;
}

function fileItem(f, list) {
  const t = typeOf(f.name);
  const img = t.preview === 'img' && f.size <= THUMB_MAX_BYTES ? `<img alt="" decoding="async" data-thumb="${esc(f.key)}" data-type="${esc(t.mime)}">` : '';
  const sel = state.sel.has(f.key) ? ' sel' : '';
  const date = list ? `<div class="meta d">${dateFmt.format(new Date(f.lastModified))}</div>` : '';
  return `<div class="item${sel}" draggable="${can.manage()}" tabindex="0" data-id="${esc(f.key)}">${CHK}<div class="thumb"><div class="ft k-${t.kind}">${esc(t.label)}</div>${img}</div><div class="info"><div class="name" title="${esc(f.name)}">${esc(f.name)}</div><div class="meta">${fmtSize(f.size)}</div>${date}</div>${MORE}</div>`;
}

export function render() {
  renderCrumbs();
  renderFilters();
  $('#viewBtn').innerHTML = ico(state.view === 'grid' ? 'list' : 'grid');
  const c = $('#content');

  if (state.loading) {
    c.innerHTML = '<div class="grid">' + '<div class="skel"></div>'.repeat(8) + '</div>';
    renderSelection();
    return;
  }
  if (!can.read()) { // lien « dépôt seul » : on ne montre rien du contenu
    c.innerHTML = `<div class="empty"><div class="ft k-dir">${ico('up')}</div><b>Dépôt de fichiers</b>Tu peux envoyer des fichiers dans ce dossier, mais son contenu n’est pas visible.${can.create() ? '<br>Glisse-les ici ou utilise « Envoyer ».' : ''}</div>`;
    renderSelection();
    return;
  }
  const { fo, fi } = visible();
  if (!fo.length && !fi.length) {
    c.innerHTML = state.query || state.filter !== 'all'
      ? '<div class="empty"><b>Aucun résultat</b>Essaie un autre mot-clé ou un autre filtre.</div>'
      : `<div class="empty"><div class="ft k-dir">${ico('folder')}</div><b>Ce dossier est vide</b>Glisse des fichiers ici ou utilise le bouton « Envoyer ».</div>`;
  } else {
    const list = state.view === 'list';
    c.innerHTML = `<div class="${state.view}">${fo.map(folderItem).join('')}${fi.map((f) => fileItem(f, list)).join('')}</div>`;
    observeThumbs(c);
  }
  renderSelection();
}

/** Met à jour la barre de sélection (sans tout redessiner). */
export function renderSelection() {
  const n = state.sel.size;
  $('#selbar').hidden = !n;
  $('#selCount').textContent = n + (n > 1 ? ' éléments sélectionnés' : ' élément sélectionné');
  $('#content > div')?.classList.toggle('has-sel', n > 0);
}

export function markSelected(id) {
  document.querySelector(`.item[data-id="${CSS.escape(id)}"]`)?.classList.toggle('sel', state.sel.has(id));
  renderSelection();
}
