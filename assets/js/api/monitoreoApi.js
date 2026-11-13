// Lecturas de monitoreo (solo GET, sin clave). Reutiliza el ClienteHttp único del proyecto.
import { validarEstado, validarHistorial } from '../core/validaciones.js';

export class MonitoreoApi {
  #http; #ep; #limite;

  constructor(http, endpoints, limite = 10) {
    this.#http = http;
    this.#ep = endpoints;
    this.#limite = limite;
  }

  // Último estado persistido; null si el vehículo existe pero aún no tiene estado.
  async obtenerEstado(id, { senal } = {}) {
    return validarEstado(await this.#http.get(this.#ep.estado(id), { senal }));
  }

  // Últimos movimientos individuales (los de DEMO nunca aparecen, lo garantiza el backend).
  async consultarHistorial(id, { senal } = {}) {
    return validarHistorial(await this.#http.get(this.#ep.historial(id), { senal }), id, this.#limite);
  }
}
