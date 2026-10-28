// js/shareActions.js — actions du panneau « Partager » (créer, copier, révoquer, autoriser, exclure)
import { state } from './state.js';
import { $ } from './utils.js';
import { toast } from './ui/toast.js';
import { ask } from './ui/dialog.js';
import { renderSharePanel, renderResult, shareUrl } from './ui/shares.js';
import * as S from './services/shares.js';

let data = null;
let last = null; // dernier lien créé, affiché sous le formulaire

function setBadge(n) {
  const b = $('#shareBadge');
  b.hidden = !n;
  b.textContent = n;
}
export function refreshBadge() {
  if (state.me.role === 'owner') S.pendingCount().then((d) => setBadge(d.pending)).catch(() => {});
}

function paint() {
  $('#shareBody').innerHTML = renderSharePanel(data, state.me, state.prefix);
  const out = $('#shResult');
  if (out) out.innerHTML = renderResult(last);
  if (data.role === 'owner') setBadge(data.requests.length);
}
async function refresh() {
  try { data = await S.listShares(); paint(); }
  catch (e) { toast(e.message, { err: true }); }
}

export async function openShare() {
  last = null;
  $('#shareBody').innerHTML = '<p class="hint">Chargement…</p>';
  $('#shareDlg').showModal();
  await refresh();
}
export const closeShare = () => $('#shareDlg').close();

async function copy(code) {
  const url = shareUrl(code);
  try { await navigator.clipboard.writeText(url); toast('Lien copié'); }
  catch {
    const input = document.querySelector('.copyrow input');
    if (input) { input.select(); document.execCommand?.('copy'); toast('Lien copié'); }
    else prompt('Copie ce lien :', url);
  }
}

const field = (id) => document.getElementById(id);

// Un seul écouteur pour tous les boutons du panneau (délégation).
export async function onShareClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const { act, id, code } = btn.dataset;
  try {
    if (act === 'copy') return copy(code);
    if (act === 'create') {
      btn.disabled = true;
      const d = await S.createShare({
        perms: field('shPerm').value,
        expires: Number(field('shExp').value),
        label: field('shLabel').value,
        scope: field('shScope').value,
        canShare: field('shCanShare') ? field('shCanShare').checked : undefined,
      });
      last = d.link ? { code: d.link.id } : { pending: true };
    } else if (act === 'revoke') {
      if (!(await ask({ title: 'Révoquer ce lien ?', text: 'Il cessera de fonctionner (jusqu’à une minute de délai) et les personnes connectées avec lui seront déconnectées, ainsi que celles qui ont reçu un lien créé à partir du sien.', ok: 'Révoquer', danger: true }))) return;
      await S.revokeShare(id);
      toast('Lien révoqué');
    } else if (act === 'kick') {
      if (!(await ask({ title: 'Exclure cette personne ?', text: 'Elle sera déconnectée tout de suite. Elle pourra revenir tant que son lien existe : révoque aussi le lien si besoin.', ok: 'Exclure', danger: true }))) return;
      await S.kickSession(id);
      toast('Personne exclue');
    } else if (act === 'approve' || act === 'deny') {
      await S.decideRequest(id, act, act === 'approve' ? field('rq-' + id).value : undefined);
      toast(act === 'approve' ? 'Demande acceptée' : 'Demande refusée');
    }
  } catch (err) {
    toast(err.message, { err: true });
  }
  await refresh();
}
