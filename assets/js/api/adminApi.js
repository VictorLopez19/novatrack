// Operaciones del panel de administración. Las credenciales se validan solo en el servidor.

import { ErrorApi } from './clienteHttp.js';
import { esEnteroPositivo, esObjeto, textoSeguro } from '../core/utilidades.js';

const entero = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);

/** Valida y limpia el estado del panel (`admin_estado`): el JSON remoto no es confiable. */
export function normalizarEstadoAdmin(r) {
    if (!esObjeto(r) || !Array.isArray(r.sesiones)) {
        throw new ErrorApi('formato', 'Respuesta de administración inválida.');
    }

    const sesiones = r.sesiones
        .filter((s) => esObjeto(s) && /^\d{5}$/.test(s.pin))
        .map((s) => ({
            pin: s.pin,
            dispositivo: textoSeguro(s.dispositivo, 120) || 'Desconocido',
            ip: textoSeguro(s.ip, 64),
            autorizada: s.autorizada === true,
            conectada: s.conectada === true,
            cierreEnS: Number.isInteger(s.cierre_en_s) ? s.cierre_en_s : null,
            edadS: entero(s.edad_s),
            inactivaS: entero(s.inactiva_s),
            idVehiculo: esEnteroPositivo(s.id_vehiculo) ? s.id_vehiculo : null,
            comandos: entero(s.comandos),
            ultimoComando: s.ultimo_comando ? textoSeguro(s.ultimo_comando, 60) : '',
        }));

    const bitacora = (Array.isArray(r.bitacora) ? r.bitacora : [])
        .filter(esObjeto)
        .slice(0, 80)
        .map((b) => ({
            fecha: new Date(b.timestamp),
            tipo: textoSeguro(b.tipo, 20),
            pin: /^\d{5}$/.test(b.pin) ? b.pin : null,
            texto: textoSeguro(b.texto, 160),
        }));

    return {
        sesiones,
        bitacora,
        autoAutorizar: r.auto_autorizar === true,
        obligatorias: r.obligatorias !== false,
        graciaS: entero(r.gracia_s),
        resumen: {
            total: sesiones.length,
            conectadas: sesiones.filter((s) => s.conectada).length,
            autorizadas: sesiones.filter((s) => s.autorizada).length,
            pendientes: sesiones.filter((s) => !s.autorizada).length,
        },
    };
}

export class AdminApi {
    #http; #ep;

    constructor(http, endpoints) {
        this.#http = http;
        this.#ep = endpoints;
    }

    async login(usuario, contrasena) {
        const r = await this.#http.solicitar('POST', this.#ep.adminLogin, { cuerpo: { usuario, contrasena } });

        if (!esObjeto(r) || typeof r.token !== 'string' || !Number.isInteger(r.vence_en_s)) {
            throw new ErrorApi('formato', 'Respuesta de inicio de sesión inválida.');
        }

        return { token: r.token, usuario: textoSeguro(r.usuario, 60), venceEnS: r.vence_en_s };
    }

    async crearPin(token, idVehiculo, identificadorInvitado = 'Invitado', duracionMin = null) {
        const r = await this.#http.postAdmin(this.#ep.adminPines, token, {
            cuerpo: {
                id_vehiculo: idVehiculo, identificador_invitado: textoSeguro(identificadorInvitado, 100),
                ...(Number.isInteger(duracionMin) ? { duracion_min: duracionMin } : {}),
            },
        });
        if (!esObjeto(r) || !/^\d{5}$/.test(r.pin) || r.id_vehiculo !== idVehiculo
            || !Number.isInteger(r.vigencia_s) || !Number.isInteger(r.duracion_sesion_s)) {
            throw new ErrorApi('formato', 'Respuesta al generar PIN inválida.');
        }
        return { pin: r.pin, idVehiculo: r.id_vehiculo, vigenciaS: r.vigencia_s, duracionS: r.duracion_sesion_s };
    }

    logout(token) {
        return this.#http.postAdmin(this.#ep.adminLogout, token);
    }

    async estado(token) {
        return normalizarEstadoAdmin(await this.#http.getAdmin(this.#ep.adminSesiones, token));
    }

    async permiso(token, pin, autorizada) {
        return normalizarEstadoAdmin(await this.#http.postAdmin(this.#ep.adminPermiso(pin), token, { cuerpo: { autorizada } }));
    }

    async permisoTodas(token, autorizada) {
        return normalizarEstadoAdmin(await this.#http.postAdmin(this.#ep.adminPermisoTodas, token, { cuerpo: { autorizada } }));
    }

    async cerrar(token, pin) {
        return normalizarEstadoAdmin(await this.#http.postAdmin(this.#ep.adminCerrar(pin), token));
    }

    async configurar(token, autoAutorizar) {
        return normalizarEstadoAdmin(await this.#http.postAdmin(this.#ep.adminConfiguracion, token, {
            cuerpo: { auto_autorizar: autoAutorizar },
        }));
    }

    detener(token, idVehiculo) {
        return this.#http.postAdmin(this.#ep.adminDetener(idVehiculo), token);
    }

    dashboard(token) {
        return this.#http.getAdmin(this.#ep.adminDashboard, token);
    }

    comercial(token, metodo, ruta, cuerpo) {
        return this.#http.solicitar(metodo, ruta, { autorizacion: token, cuerpo });
    }
}
