// js/ui/menu.js — petit menu contextuel « ⋯ »
import { $, ico, isDir } from '../utils.js';

export function showMenu(btn, id, h) {
  const m = $('#menu'), r = btn.getBoundingClientRect();
  const items = [
    ['dl', 'down', 'Télécharger', ''], ['ren', 'edit', 'Renommer', ''], ['mv', 'move', 'Déplacer…', ''], ['del', 'trash', 'Supprimer', 'del'],
  ].filter(([a]) => h[a] && !(a === 'dl' && isDir(id)));
  if (!items.length) return;
  m.innerHTML = items.map(([a, i, label, cls]) => `<button${cls ? ` class="${cls}"` : ''} data-a="${a}">${ico(i)}${label}</button>`).join('');
  m.hidden = false;
  m.style.top = Math.max(8, Math.min(r.bottom + 4, innerHeight - m.offsetHeight - 8)) + 'px';
  m.style.left = Math.max(8, Math.min(r.right - 180, innerWidth - m.offsetWidth - 8)) + 'px';
  m.onclick = (e) => {
    const a = e.target.closest('button')?.dataset.a;
    m.hidden = true;
    if (a) h[a](id);
  };
}
export const hideMenu = () => { $('#menu').hidden = true; };
export const menuOpen = () => !$('#menu').hidden;
