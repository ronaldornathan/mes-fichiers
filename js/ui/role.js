// js/ui/role.js — montre ou cache les commandes selon les droits de la personne connectée
import { state, can } from '../state.js';
import { $ } from '../utils.js';

export function applyRole() {
  const guest = state.me.role === 'guest';
  document.body.dataset.role = state.me.role;
  const show = (sel, on) => { const el = $(sel); if (el) el.hidden = !on; };
  show('#newFolder', can.create());
  show('#uploadBtn', can.create());
  show('#selDel', can.manage());
  show('#shareBtn', can.share());
  show('#gauge', !guest);
  show('#usageBox', !guest);
  show('.search', can.read());
  show('#sort', can.read());
  show('#viewBtn', can.read());
  show('#filters', can.read());
  show('#selAll', can.read());
  show('#selDl', can.read());
  $('#logoutTxt').textContent = guest ? 'Quitter' : 'Déconnexion';
  $('#brandName').textContent = guest ? 'Dossier partagé' : 'Mes fichiers';
}
