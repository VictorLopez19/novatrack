// Lecturas de monitoreo protegidas por la sesión temporal vigente.
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
    return validarEstado(await this.#http.solicitar('GET', this.#ep.estado(id), { senal, protegido: true }));
  }

  // Últimos movimientos individuales (los de DEMO nunca aparecen, lo garantiza el backend).
  async consultarHistorial(id, { senal } = {}) {
    return validarHistorial(await this.#http.solicitar('GET', this.#ep.historial(id), { senal, protegido: true }), id, this.#limite);
  }
}
