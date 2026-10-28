// js/ui/thumbs.js — miniatures : chargées seulement quand elles deviennent visibles,
// et leurs liens signés sont demandés par lots (1 requête pour tout l'écran, pas 1 par image).
import { signedUrls } from '../api.js';

const pending = new Set();
let timer = 0;

async function flush() {
  timer = 0;
  const imgs = [...pending].filter((i) => i.isConnected);
  pending.clear();
  if (!imgs.length) return;
  try {
    const urls = await signedUrls(imgs.map((i) => ({ key: i.dataset.thumb, inline: true, type: i.dataset.type })));
    imgs.forEach((img, n) => {
      if (!img.isConnected) return;
      img.onload = () => img.classList.add('ok');
      img.onerror = () => img.remove(); // on garde l'icône du type
      img.src = urls[n];
    });
  } catch { /* les icônes restent affichées */ }
}

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    io.unobserve(e.target);
    pending.add(e.target);
  }
  if (pending.size && !timer) timer = setTimeout(flush, 40);
}, { rootMargin: '300px' });

export const observeThumbs = (root) => root.querySelectorAll('img[data-thumb]').forEach((i) => io.observe(i));
