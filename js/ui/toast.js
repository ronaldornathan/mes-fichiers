// js/ui/toast.js — notifications
import { $ } from '../utils.js';

export function toast(msg, { err = false, ms = 4000, progress = false } = {}) {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.innerHTML = '<span></span>' + (progress ? '<div class="pg"><i></i></div>' : '');
  t.firstChild.textContent = msg;
  $('#toasts').append(t);
  if (ms) setTimeout(() => t.remove(), ms);
  return {
    el: t,
    text: (m) => { t.firstChild.textContent = m; },
    progress: (p) => { const i = t.querySelector('i'); if (i) i.style.width = p + '%'; },
    done: (m, { err: e = false, ms: keep = 4500 } = {}) => {
      t.firstChild.textContent = m;
      t.classList.toggle('err', e);
      t.querySelector('.pg')?.remove();
      setTimeout(() => t.remove(), keep);
    },
  };
}
