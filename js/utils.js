// js/utils.js — petits outils sans dépendance
export const $ = (s, root = document) => root.querySelector(s);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const ico = (id) => `<svg><use href="#i-${id}"/></svg>`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const baseName = (k) => (k.endsWith('/') ? k.slice(0, -1) : k).split('/').pop();
export const isDir = (id) => id.endsWith('/');

export function fmtSize(n) {
  if (n < 1024) return n + ' o';
  const u = ['Ko', 'Mo', 'Go', 'To'];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return n.toFixed(n < 10 ? 1 : 0) + ' ' + u[i];
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const store = {
  get(k, d = '') { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
