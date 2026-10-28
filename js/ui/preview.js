// js/ui/preview.js — visionneuse plein écran (image, PDF, vidéo, audio, texte/code)
import { signedUrl } from '../api.js';
import { typeOf } from '../filetypes.js';
import { TEXT_PREVIEW_MAX_BYTES } from '../config.js';
import { $ } from '../utils.js';

let list = [], idx = 0, run = 0;

export const canPreview = (f) => {
  const t = typeOf(f.name);
  return !!t.preview && (t.preview !== 'txt' || f.size <= TEXT_PREVIEW_MAX_BYTES);
};
export const previewOpen = () => !$('#preview').hidden;
export const currentPreview = () => list[idx];

async function buildNode(f) {
  const t = typeOf(f.name);
  const url = await signedUrl(f.key, { inline: true, type: t.mime });
  if (t.preview === 'txt') {
    const res = await fetch(url);
    if (!res.ok) throw new Error('lecture impossible');
    const pre = document.createElement('pre');
    pre.textContent = await res.text();
    return pre;
  }
  const tag = { img: 'img', pdf: 'iframe', vid: 'video', aud: 'audio' }[t.preview];
  const n = document.createElement(tag);
  n.src = url;
  if (t.preview === 'img') n.alt = f.name;
  if (t.preview === 'vid' || t.preview === 'aud') n.controls = true;
  return n;
}

/** Ouvre f dans la visionneuse. `files` : la liste parmi laquelle on navigue (flèches). */
export async function openPreview(f, files) {
  const my = ++run; // ignore les réponses arrivées en retard si on navigue vite
  if (files) list = files.filter(canPreview);
  idx = list.findIndex((x) => x.key === f.key);
  const node = await buildNode(f);
  if (my !== run) return;
  $('#ptitle').textContent = f.name;
  $('#pbody').replaceChildren(node);
  $('#pprev').style.visibility = idx > 0 ? 'visible' : 'hidden';
  $('#pnext').style.visibility = idx < list.length - 1 ? 'visible' : 'hidden';
  $('#preview').hidden = false;
}

export function closePreview() {
  run++;
  $('#preview').hidden = true;
  $('#pbody').replaceChildren();
}
export const stepPreview = (d) => list[idx + d] && openPreview(list[idx + d]);
