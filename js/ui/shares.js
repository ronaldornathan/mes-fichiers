// js/ui/shares.js — contenu du panneau « Partager » (HTML uniquement, aucun réseau)
import { esc, ico } from '../utils.js';

const PERM = {
  read: ['Lecture seule', 'Télécharger uniquement'],
  read_create: ['Lecture + dépôt', 'Télécharger et envoyer'],
  create: ['Dépôt seul', 'Envoyer sans voir le contenu'],
};
export const permLabel = (p) => PERM[p]?.[0] || p;
export const shareUrl = (code) => `${location.origin}${location.pathname}#join=${code}`;
const scopeLabel = (s) => (s ? s.replace(/\/$/, '').split('/').join(' › ') : 'Tout l’espace');
const EXPIRY = [[3600, '1 heure'], [86400, '24 heures'], [604800, '7 jours'], [2592000, '30 jours'], [0, 'Sans limite']];

function expText(exp) {
  if (!exp) return 'sans limite';
  const ms = exp - Date.now();
  if (ms <= 0) return 'expiré';
  const h = Math.round(ms / 3600000);
  return 'expire dans ' + (h < 1 ? '< 1 h' : h < 48 ? h + ' h' : Math.round(h / 24) + ' j');
}
function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 90) return 'à l’instant';
  if (s < 3600) return 'il y a ' + Math.round(s / 60) + ' min';
  if (s < 86400) return 'il y a ' + Math.round(s / 3600) + ' h';
  return 'il y a ' + Math.round(s / 86400) + ' j';
}

function form(me, prefix) {
  const owner = me.role === 'owner';
  const mine = owner ? { read: true, create: true } : { read: me.perms !== 'create', create: me.perms !== 'read' };
  const ok = { read: mine.read, read_create: mine.read && mine.create, create: mine.create };
  const perms = Object.keys(PERM).filter((p) => ok[p]).map((p) =>
    `<option value="${p}">${PERM[p][0]} — ${PERM[p][1]}${!owner && p !== 'read' ? ' (sur autorisation)' : ''}</option>`).join('');
  const rootScope = owner ? '' : me.scope;
  const scopes = [[prefix, 'Ce dossier : ' + scopeLabel(prefix || '')]];
  if (rootScope !== prefix) scopes.push([rootScope, owner ? 'Tout l’espace' : 'Tout le dossier partagé avec moi']);
  const exps = EXPIRY.filter(([s]) => owner || s || !me.exp).map(([s, l]) => `<option value="${s}"${s === 604800 ? ' selected' : ''}>${l}</option>`).join('');
  return `<section><h4>Nouveau lien</h4>
    <label>Dossier partagé<select id="shScope" class="field">${scopes.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></label>
    <label>Droits<select id="shPerm" class="field">${perms}</select></label>
    <div class="two"><label>Durée<select id="shExp" class="field">${exps}</select></label>
    <label>Nom du lien (facultatif)<input id="shLabel" class="field" maxlength="40" placeholder="Ex. Photos famille" autocomplete="off"></label></div>
    ${owner ? '<label class="chk2"><input type="checkbox" id="shCanShare" checked> L’invité peut repartager en lecture seule</label>' : '<p class="hint">Lecture seule : le lien est créé tout de suite. Les droits d’envoi sont soumis à l’accord du propriétaire, qui a toujours le dernier mot.</p>'}
    <button class="btn primary" data-act="create">${ico('plus')}Créer le lien</button>
    <div id="shResult"></div></section>`;
}

function result(r) {
  if (!r) return '';
  if (r.pending) return '<div class="note">Demande envoyée au propriétaire. Tu verras le lien ici dès qu’il l’aura acceptée.</div>';
  return `<div class="note ok">Lien créé. Envoie-le à la personne : elle n’a rien d’autre à saisir.<div class="copyrow"><input class="field" readonly value="${esc(shareUrl(r.code))}"><button class="btn" data-act="copy" data-code="${esc(r.code)}">Copier</button></div><small>Code seul (saisie manuelle) : <code>${esc(r.code)}</code></small></div>`;
}

const linkRow = (l, owner) => `<div class="shrow"><div class="shmain"><b>${esc(l.label || permLabel(l.perms))}</b><span class="pill p-${l.perms}">${permLabel(l.perms)}</span>
  <small>${esc(scopeLabel(l.scope))} · ${expText(l.exp)}${owner && l.by !== 'owner' ? ' · créé par ' + esc(l.byName) : ''}</small></div>
  <div class="shbtns"><button class="btn" data-act="copy" data-code="${esc(l.id)}">Copier</button><button class="btn danger" data-act="revoke" data-id="${esc(l.id)}">Révoquer</button></div></div>`;

function ownerSections(d) {
  const reqs = d.requests.map((r) => `<div class="shrow"><div class="shmain"><b>${esc(r.name)}</b> demande <span class="pill p-${r.perms}">${permLabel(r.perms)}</span>
    <small>${esc(scopeLabel(r.scope))} · ${ago(r.at)}${r.label ? ' · « ' + esc(r.label) + ' »' : ''}</small></div>
    <div class="shbtns"><select class="field sm" id="rq-${esc(r.id)}" aria-label="Droits accordés">${Object.keys(PERM).map((p) => `<option value="${p}"${p === r.perms ? ' selected' : ''}>${PERM[p][0]}</option>`).join('')}</select>
    <button class="btn primary" data-act="approve" data-id="${esc(r.id)}">Autoriser</button><button class="btn danger" data-act="deny" data-id="${esc(r.id)}">Refuser</button></div></div>`).join('');
  const sess = d.sessions.map((s) => {
    const on = Date.now() - s.seen < 300000;
    return `<div class="shrow"><div class="shmain"><span class="dot${on ? ' on' : ''}" title="${on ? 'En ligne' : 'Hors ligne'}"></span><b>${esc(s.name)}</b>
      <small>${esc(s.linkLabel || 'lien')} · ${on ? 'en ligne' : 'vu ' + ago(s.seen)}</small></div>
      <div class="shbtns"><button class="btn danger" data-act="kick" data-id="${esc(s.id)}">Exclure</button></div></div>`;
  }).join('');
  return `${d.requests.length ? `<section><h4>Demandes en attente <span class="count">${d.requests.length}</span></h4>${reqs}</section>` : ''}
    <section><h4>Liens actifs <span class="count">${d.links.length}</span></h4>${d.links.map((l) => linkRow(l, true)).join('') || '<p class="hint">Aucun lien pour l’instant.</p>'}</section>
    <section><h4>Connectés <span class="count">${d.sessions.length}</span></h4>${sess || '<p class="hint">Personne n’a rejoint un lien.</p>'}</section>`;
}

function guestSections(d) {
  const statusText = { pending: 'En attente', denied: 'Refusée' };
  const reqs = d.requests.map((r) => `<div class="shrow"><div class="shmain"><b>${esc(r.label || permLabel(r.perms))}</b><span class="pill p-${r.perms}">${permLabel(r.perms)}</span>
    <small>${esc(scopeLabel(r.scope))} · ${r.status === 'approved' ? 'Acceptée' : statusText[r.status]}</small></div>
    ${r.status === 'approved' && r.code ? `<div class="shbtns"><button class="btn" data-act="copy" data-code="${esc(r.code)}">Copier le lien</button></div>` : ''}</div>`).join('');
  return `${d.requests.length ? `<section><h4>Mes demandes</h4>${reqs}</section>` : ''}
    <section><h4>Mes liens <span class="count">${d.links.length}</span></h4>${d.links.map((l) => linkRow(l, false)).join('') || '<p class="hint">Tu n’as pas encore partagé de lien.</p>'}</section>`;
}

export function renderSharePanel(d, me, prefix, last) {
  const mayCreate = me.role === 'owner' || me.canShare;
  return (mayCreate ? form(me, prefix) : '') + (d.role === 'owner' ? ownerSections(d) : guestSections(d));
}
export const renderResult = result;
