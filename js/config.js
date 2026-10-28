// js/config.js — réglages de l'interface
export const API_URL = 'https://mes-fichiers.ronaldornathan.workers.dev';
export const URL_TTL_MS = 240000; // un lien signé vit 5 min côté serveur : on le réutilise 4 min
export const MAX_URLS_PER_CALL = 60; // doit rester ≤ MAX_URLS_PER_REQUEST du Worker
export const THUMB_MAX_BYTES = 6 * 1024 * 1024; // pas de miniature au-delà (on évite de charger l'original)
export const TEXT_PREVIEW_MAX_BYTES = 1024 * 1024;
export const DELETE_CHUNK = 100; // doit rester ≤ MAX_KEYS_PER_DELETE_CALL du Worker
export const UPLOAD_PARALLEL = 3;
