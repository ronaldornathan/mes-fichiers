// js/services/shares.js — partage (réseau uniquement)
import { api } from '../api.js';

export const fetchMe = () => api('/api/me');
export const joinWith = (code, name) => api('/api/share/join', { method: 'POST', body: { code, name } });
export const listShares = () => api('/api/shares');
export const pendingCount = () => api('/api/shares?summary=1');
export const createShare = (body) => api('/api/shares', { method: 'POST', body });
export const revokeShare = (id) => api('/api/shares?id=' + encodeURIComponent(id), { method: 'DELETE' });
export const kickSession = (id) => api('/api/sessions?id=' + encodeURIComponent(id), { method: 'DELETE' });
export const decideRequest = (id, action, perms) => api('/api/share-requests', { method: 'POST', body: { id, action, perms } });
