// js/ui/dialog.js — boîte de dialogue (confirmation ou saisie de texte)
import { $ } from '../utils.js';

/** Retourne null si annulé, true (confirmation) ou le texte saisi. */
export function ask({ title, text = '', input, ok = 'OK', danger = false }) {
  return new Promise((resolve) => {
    const d = $('#dlg'), i = $('#di'), b = $('#dok');
    $('#dt').textContent = title;
    $('#dx').textContent = text;
    $('#dx').hidden = !text;
    i.hidden = input === undefined;
    i.value = input || '';
    b.textContent = ok;
    b.className = 'btn ' + (danger ? 'danger fill' : 'primary');
    d.returnValue = '';
    d.onclose = () => resolve(d.returnValue === 'ok' ? (input === undefined ? true : i.value.trim()) : null);
    $('#dno').onclick = () => d.close('no');
    d.showModal();
    if (input !== undefined) { i.focus(); i.select(); }
  });
}
export const dialogOpen = () => $('#dlg').open;
