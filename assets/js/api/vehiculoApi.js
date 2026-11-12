// Operaciones del backend. Valida cada respuesta: el JSON remoto no es confiable.

import { ErrorApi } from './clienteHttp.js';
import { esEnteroPositivo, esObjeto } from '../core/utilidades.js';

// Comprueba que la respuesta recibida sea una lista válida.
const lista = (v, que) => {
    if (!Array.isArray(v)) throw new ErrorApi('formato', `Respuesta inesperada (${que}).`);
    return v;
};

// Centraliza las operaciones de comunicación con la API del vehículo.
export class VehiculoApi {
    #http; #ep; #tiempos;

    // Inicializa el cliente con las conexiones, endpoints y tiempos configurados.
    constructor(http, endpoints, tiempos) {
        this.#http = http;
        this.#ep = endpoints;
        this.#tiempos = tiempos;
    }

    // Consulta el estado de disponibilidad de la API.
    async salud() {
        const r = await this.#http.get(this.#ep.salud, { timeoutMs: this.#tiempos.saludMs });

        if (!esObjeto(r) || r.estado !== 'Online') {
            throw new ErrorApi('formato', 'La API no reporta estado Online.');
        }

        return r;
    }

    // Consulta el estado de disponibilidad de la base de datos.
    async dbListo() {
        if (!this.#ep.dbListo) return null;

        return this.#http.get(this.#ep.dbListo, { timeoutMs: this.#tiempos.saludMs });
    }

    // Obtiene y valida la lista de vehículos registrados.
    async listarVehiculos() {
        return lista(await this.#http.get(this.#ep.vehiculos), 'vehículos')
            .filter((v) => esObjeto(v) && esEnteroPositivo(v.id_vehiculo) && typeof v.nombre === 'string')
            .map((v) => ({
                id: v.id_vehiculo,
                nombre: v.nombre,
                activo: v.activo !== false
            }));
    }

    // Obtiene los datos de un vehículo específico.
    async obtenerVehiculo(id) {
        const v = await this.#http.get(this.#ep.vehiculo(id));

        if (!esObjeto(v) || typeof v.nombre !== 'string') {
            throw new ErrorApi('formato', 'Vehículo inválido.');
        }

        return {
            id: v.id_vehiculo,
            nombre: v.nombre,
            activo: v.activo !== false
        };
    }

    // Obtiene y valida los comandos disponibles para un vehículo.
    async listarComandos(id) {
        return lista(await this.#http.get(this.#ep.comandos(id)), 'comandos')
            .filter((c) => esObjeto(c) && esEnteroPositivo(c.id_comando) && typeof c.nombre === 'string' && Number.isInteger(c.codigo))
            .map((c) => ({
                id_comando: c.id_comando,
                nombre: c.nombre,
                codigo: c.codigo,
                activo: c.activo !== false
            }));
    }

    // Obtiene las demostraciones disponibles para un vehículo.
    async listarDemos(id) {
        return lista(await this.#http.get(this.#ep.demos(id)), 'DEMO')
            .filter((d) => esObjeto(d) && esEnteroPositivo(d.id_demo) && typeof d.nombre === 'string')
            .map((d) => ({
                id_demo: d.id_demo,
                nombre: d.nombre,
                descripcion: d.descripcion ?? '',
                activo: d.activo !== false
            }));
    }

    // Registra un movimiento y verifica la respuesta del servidor.
    async registrarMovimiento(idVehiculo, idComando, origen) {
        const r = await this.#http.post(this.#ep.movimiento(idVehiculo), {
            cuerpo: {
                id_comando: idComando,
                origen
            }
        });

        if (!esObjeto(r) || r.evento !== 'movimiento') {
            throw new ErrorApi('formato', 'Respuesta de movimiento inválida.');
        }

        return r;
    }

    // Solicita el inicio de una demostración para el vehículo seleccionado.
    async iniciarDemo(idVehiculo, idDemo) {
        const r = await this.#http.post(this.#ep.iniciarDemo(idDemo), {
            query: {
                id_vehiculo: idVehiculo
            }
        });

        if (!esObjeto(r) || !esEnteroPositivo(r.id_demo)) {
            throw new ErrorApi('formato', 'Respuesta de DEMO inválida.');
        }

        return r;
    }

    // Solicita la cancelación de la demostración en ejecución.
    async cancelarDemo(idVehiculo) {
        return this.#http.post(this.#ep.cancelarDemo, {
            query: {
                id_vehiculo: idVehiculo
            }
        });
    }

    // Solicita la ejecución de movimientos por IA
    async ejecutarIA(idVehiculo, texto) {
        const campo = this.#ep.iaCampo || 'instruccion';
        const r = await this.#http.post(this.#ep.ia(idVehiculo), { cuerpo: { [campo]: texto }, timeoutMs: 20000 });
        if (!esObjeto(r)) throw new ErrorApi('formato', 'Respuesta de la IA inválida.');
        return { mensaje: typeof r.mensaje === 'string' ? r.mensaje.slice(0, 160) : '' };
    }
}