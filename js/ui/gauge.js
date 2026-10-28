// js/ui/gauge.js — le voyant de stockage (barre d'en-tête : toujours visible, mobile compris)
// + la jauge détaillée du menu et le bandeau d'alerte.
import { $, fmtSize } from '../utils.js';

let last = null;

export function renderUsage(u) {
  last = u;
  const level = u.level || (u.alert ? 'warn' : 'ok');
  const g = $('#gauge');
  g.dataset.level = level;
  $('#gaugeTxt').textContent = u.percent + ' %';
  const detail = `${fmtSize(u.used)} utilisés sur ${fmtSize(u.limit)} (${u.percent} %)`;
  g.title = detail;
  g.setAttribute('aria-label', 'Stockage : ' + detail);

  $('#bar').style.width = Math.min(u.percent, 100) + '%';
  $('#bar').dataset.level = level;
  $('#usageTxt').textContent = detail;

  const banner = $('#alert');
  banner.hidden = level === 'ok';
  banner.dataset.level = level;
  banner.textContent = level === 'full'
    ? `Stockage presque plein (${fmtSize(u.used)} sur ${fmtSize(u.limit)}) : supprime des fichiers avant d’en envoyer d’autres.`
    : `Tu approches de la limite de stockage (${fmtSize(u.used)} utilisés). Pense à faire du tri.`;
}

export function renderUsageUnknown() {
  $('#gauge').dataset.level = 'unknown';
  $('#gaugeTxt').textContent = '–';
}
export const lastUsage = () => last;
