// js/services/upload.js — envoi direct vers le stockage via un lien signé
import { api } from '../api.js';
import { typeOf } from '../filetypes.js';

function put(url, file, mime, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('Content-Type', mime); // évite les fichiers stockés sans type (aperçu cassé ensuite)
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    x.onload = () => (x.status < 300 ? resolve() : reject(new Error('Échec de l’envoi (' + x.status + ')')));
    x.onerror = () => reject(new Error('Envoi bloqué : vérifie le CORS du bucket'));
    x.send(file);
  });
}

export async function uploadFile(file, key, onProgress) {
  const { url } = await api('/api/upload-url', { method: 'POST', body: { key, size: file.size } });
  await put(url, file, file.type || typeOf(file.name).mime || 'application/octet-stream', onProgress);
}
