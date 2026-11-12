// Preferencias locales: recuerda el vehículo elegido en localStorage.
import { esEnteroPositivo } from './utilidades.js';

const K_VEH = 'iot.vehiculoId';

const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const escribir = (k, v) => { try { localStorage.setItem(k, v); } catch { /* almacenamiento bloqueado */ } };
const borrar = (k) => { try { localStorage.removeItem(k); } catch { /* ignorar */ } };

export const preferencias = {
  obtenerVehiculoId(porDefecto) {
    const n = Number(leer(K_VEH));
    return esEnteroPositivo(n) ? n : porDefecto;
  },
  guardarVehiculoId: (id) => escribir(K_VEH, String(id)),
  olvidarVehiculo: () => borrar(K_VEH),
};
