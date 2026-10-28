// js/filetypes.js — détection du type d'un fichier à partir de son nom.
// Le stockage ne renvoie pas le type MIME dans les listes : tout repose donc sur le nom.
// Un seul endroit à modifier pour ajouter un format.

const list = (kind, exts) => exts.split(' ').map((e) => [e, kind]);

const EXT = new Map([
  ...list('img', 'png jpg jpeg jpe jfif gif webp avif svg bmp ico heic heif tif tiff raw cr2 nef arw dng psd ai eps'),
  ...list('pdf', 'pdf'),
  ...list('vid', 'mp4 m4v webm mov ogv mkv avi wmv flv mpg mpeg 3gp m2ts mts'),
  ...list('aud', 'mp3 wav ogg oga m4a aac flac opus weba wma aiff aif amr mid midi'),
  ...list('doc', 'doc docx odt rtf pages wps epub mobi azw3'),
  ...list('sheet', 'xls xlsx xlsm ods csv tsv numbers'),
  ...list('slide', 'ppt pptx pps ppsx odp key'),
  ...list('txt', 'txt md markdown log rst nfo srt vtt tex'),
  ...list('code', 'js mjs cjs jsx ts tsx json jsonc html htm css scss sass less xml yml yaml toml ini conf cfg env py rb php java kt c h cpp hpp cs go rs swift sh bash zsh bat ps1 sql lua dart vue svelte r pl gradle properties lock'),
  ...list('zip', 'zip rar 7z tar gz tgz bz2 xz zst lz cab iso'),
  ...list('app', 'exe msi apk aab ipa dmg pkg deb rpm appimage jar'),
  ...list('font', 'ttf otf woff woff2 eot'),
]);

// Fichiers sans extension (ou « dotfiles ») reconnus par leur nom entier
const SPECIAL = new Map([
  ['dockerfile', 'code'], ['makefile', 'code'], ['procfile', 'code'], ['gemfile', 'code'],
  ['.gitignore', 'code'], ['.gitattributes', 'code'], ['.env', 'code'], ['.editorconfig', 'code'], ['.npmrc', 'code'], ['.bashrc', 'code'], ['.zshrc', 'code'],
  ['readme', 'txt'], ['license', 'txt'], ['licence', 'txt'], ['changelog', 'txt'], ['authors', 'txt'],
]);

// Suffixes ajoutés par les navigateurs / éditeurs : « rapport.pdf.crdownload » reste un PDF
const TRAILING = new Set(['bak', 'old', 'tmp', 'orig', 'crdownload', 'part', 'download', 'swp']);

// Ce que le navigateur sait afficher lui-même, avec le type MIME à imposer à l'aperçu
const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', jfif: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
  pdf: 'application/pdf',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ogv: 'video/ogg',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac',
  flac: 'audio/flac', opus: 'audio/ogg', weba: 'audio/webm',
};
const TEXT_MIME = 'text/plain; charset=utf-8';
const PREVIEW_AS = { img: 'img', pdf: 'pdf', vid: 'vid', aud: 'aud', txt: 'txt', code: 'txt' };

export const KIND_LABEL = {
  img: 'Image', pdf: 'PDF', vid: 'Vidéo', aud: 'Audio', doc: 'Document', sheet: 'Tableur', slide: 'Présentation',
  txt: 'Texte', code: 'Code', zip: 'Archive', app: 'Application', font: 'Police', file: 'Fichier',
};

// Filtres du menu latéral : un filtre peut regrouper plusieurs types
export const FILTERS = [
  { id: 'all', label: 'Tout' },
  { id: 'img', label: 'Images', kinds: ['img'] },
  { id: 'vid', label: 'Vidéos', kinds: ['vid'] },
  { id: 'aud', label: 'Audio', kinds: ['aud'] },
  { id: 'pdf', label: 'PDF', kinds: ['pdf'] },
  { id: 'doc', label: 'Documents', kinds: ['doc', 'sheet', 'slide', 'txt'] },
  { id: 'code', label: 'Code', kinds: ['code'] },
  { id: 'zip', label: 'Archives', kinds: ['zip'] },
];

const cache = new Map();

/** @returns {{kind:string, ext:string, label:string, preview:string|null, mime:string}} */
export function typeOf(name) {
  const hit = cache.get(name);
  if (hit) return hit;

  const n = name.toLowerCase().trim().replace(/~$/, '');
  let kind = SPECIAL.get(n) || '';
  let ext = '';
  if (!kind) {
    const parts = n.split('.');
    while (parts.length > 1) {
      const e = parts.pop();
      if (TRAILING.has(e) && parts.length > 1) continue; // on regarde l'extension d'avant
      ext = e;
      break;
    }
    kind = EXT.get(ext) || (/^(z|r)\d{2}$|^\d{3}$/.test(ext) ? 'zip' : 'file'); // archives découpées : .z01, .r00, .001
  } else {
    ext = n.replace(/^\./, '');
  }

  const mime = MIME[ext] || (kind === 'txt' || kind === 'code' || ext === 'csv' || ext === 'tsv' ? TEXT_MIME : '');
  let preview = PREVIEW_AS[kind] || (ext === 'csv' || ext === 'tsv' ? 'txt' : null);
  if (preview && preview !== 'txt' && !MIME[ext]) preview = null; // ex. .heic, .mkv : pas affichables dans un navigateur
  if (preview === 'txt' && ext === 'svg') preview = 'img';

  const result = { kind, ext, label: (ext || 'fich').slice(0, 4).toUpperCase(), preview, mime };
  if (cache.size > 2000) cache.clear();
  cache.set(name, result);
  return result;
}

export const matchesFilter = (name, filterId) => {
  if (filterId === 'all') return true;
  const f = FILTERS.find((x) => x.id === filterId);
  return !!f && f.kinds.includes(typeOf(name).kind);
};
