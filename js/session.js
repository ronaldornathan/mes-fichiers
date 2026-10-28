// js/session.js — jeton de connexion (stocké dans le navigateur)
import { store } from './utils.js';
let token = store.get('fm_token');
export const getToken = () => token;
export const setToken = (t) => { token = t; t ? store.set('fm_token', t) : store.del('fm_token'); };
