// La API Key NUNCA va en el código: la escribe el usuario, vive en sessionStorage y caduca.
import { CONFIG } from '../config.js';
import { esEnteroPositivo } from './utilidades.js';

const K_CLAVE = 'iot.apiKey';
const K_VEH = 'iot.vehiculoId';
const AVISO_MS = 2 * 60 * 1000; // aviso previo al vencimiento
const MAX_TIMER = 2 ** 31 - 1;

const leer = (s, k) => { try { return s.getItem(k); } catch { return null; } };
const escribir = (s, k, v) => { try { s.setItem(k, v); } catch { /* almacenamiento bloqueado */ } };
const borrar = (s, k) => { try { s.removeItem(k); } catch { /* ignorar */ } };

let tExpira = null; let tAviso = null;
let cb = { avisar: () => { }, expirar: () => { } };

/** Devuelve { v, vence } o null. Un formato antiguo o dañado se descarta. */
function leerClave() {
  const crudo = leer(sessionStorage, K_CLAVE);
  if (!crudo) return null;
  try {
    const o = JSON.parse(crudo);
    if (typeof o?.v === 'string' && Number.isFinite(o.vence)) return o;
  } catch { /* se descarta abajo */ }
  borrar(sessionStorage, K_CLAVE);
  return null;
}

function cancelar() { clearTimeout(tExpira); clearTimeout(tAviso); }

/** Borra la clave si ya venció y avisa una sola vez. */
function expirarSiVencida() {
  const o = leerClave();
  if (!o || Date.now() < o.vence) return false;
  borrar(sessionStorage, K_CLAVE); cancelar(); cb.expirar();
  return true;
}

function programar() {
  cancelar();
  const o = leerClave();
  if (!o) return;
  const resta = o.vence - Date.now();
  if (resta <= 0) { expirarSiVencida(); return; }
  tExpira = setTimeout(() => { if (!expirarSiVencida()) programar(); }, Math.min(resta, MAX_TIMER));
  if (resta > AVISO_MS) tAviso = setTimeout(() => cb.avisar(), resta - AVISO_MS);
}

export const sesion = {
  obtenerClave() {
    if (expirarSiVencida()) return '';
    return leerClave()?.v ?? '';
  },
  guardarClave(c) {
    if (!c) { this.borrarClave(); return; }
    escribir(sessionStorage, K_CLAVE, JSON.stringify({ v: c, vence: Date.now() + CONFIG.tiempos.claveMs }));
    programar();
  },
  borrarClave() { borrar(sessionStorage, K_CLAVE); cancelar(); },
  minutosRestantes() {
    const o = leerClave();
    return o ? Math.max(0, Math.ceil((o.vence - Date.now()) / 60000)) : 0;
  },
  msRestantes() {
    const o = leerClave();
    return o ? Math.max(0, o.vence - Date.now()) : 0;
  },
  /** Registra los avisos (2 min antes y al vencer) y arranca la cuenta si ya hay una clave. */
  vigilar(callbacks) { cb = { ...cb, ...callbacks }; programar(); },

  obtenerVehiculoId(porDefecto) {
    const n = Number(leer(localStorage, K_VEH));
    return esEnteroPositivo(n) ? n : porDefecto;
  },
  guardarVehiculoId: (id) => escribir(localStorage, K_VEH, String(id)),
  olvidarVehiculo: () => borrar(localStorage, K_VEH),
};