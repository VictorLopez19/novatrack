// Canjea el PIN temporal generado por el administrador por un token de control.

import { ErrorApi } from './clienteHttp.js';
import { esObjeto, textoSeguro } from '../core/utilidades.js';

export class SesionApi {
    #http; #ep;

    constructor(http, endpoints) {
        this.#http = http;
        this.#ep = endpoints;
    }

    /** Canjea un PIN de un solo uso para la unidad indicada. */
    async canjear(idVehiculo, pin, dispositivo) {
        if (!Number.isInteger(idVehiculo) || idVehiculo < 1 || !/^\d{5}$/.test(pin)) {
            throw new ErrorApi('validacion', 'Selecciona un vehículo e ingresa el PIN de cinco dígitos.');
        }
        const r = await this.#http.post(this.#ep.sesionCanjear, {
            cuerpo: { id_vehiculo: idVehiculo, pin, dispositivo: textoSeguro(dispositivo, 120) },
        });

        if (!esObjeto(r) || typeof r.token !== 'string' || r.token.length < 20 || !/^\d{5}$/.test(r.pin)
            || r.id_vehiculo !== idVehiculo || !Number.isInteger(r.duracion_s)) {
            throw new ErrorApi('formato', 'Respuesta de sesión inválida.');
        }

        return {
            token: r.token,
            pin: r.pin,
            autorizada: r.autorizada === true,
            graciaS: Number.isInteger(r.gracia_s) ? r.gracia_s : 30,
            duracionS: r.duracion_s,
        };
    }

    /** Abre una sesión de prueba (5 min) sin PIN en una unidad de exhibición. */
    async probar(idVehiculo, dispositivo) {
        if (!Number.isInteger(idVehiculo) || idVehiculo < 1) {
            throw new ErrorApi('validacion', 'Selecciona un vehículo para probarlo.');
        }
        const r = await this.#http.post(this.#ep.sesionPrueba, {
            cuerpo: { id_vehiculo: idVehiculo, dispositivo: textoSeguro(dispositivo, 120) },
        });

        if (!esObjeto(r) || typeof r.token !== 'string' || r.token.length < 20 || !/^\d{5}$/.test(r.pin)
            || r.id_vehiculo !== idVehiculo || !Number.isInteger(r.duracion_s)) {
            throw new ErrorApi('formato', 'Respuesta de sesión inválida.');
        }

        return {
            token: r.token,
            pin: r.pin,
            autorizada: r.autorizada === true,
            graciaS: Number.isInteger(r.gracia_s) ? r.gracia_s : 30,
            duracionS: r.duracion_s,
        };
    }

    /** Avisa al servidor que el usuario salió de la página (sobrevive a la descarga de la página). */
    cerrarAlSalir(token) {
        const url = this.#http.url(this.#ep.sesionCerrar(token));

        try {
            if (navigator.sendBeacon?.(url)) return;
        } catch {
            /* se intenta con fetch */
        }

        fetch(url, { method: 'POST', keepalive: true, mode: 'cors', credentials: 'omit' }).catch(() => { });
    }
}

/** Descripción legible del dispositivo para el panel de administración (p. ej. «Chrome · Android»). */
export function describirDispositivo(ua = navigator.userAgent) {
    const navegador =
        /OculusBrowser/i.test(ua) ? 'Meta Quest Browser'
            : /Edg\//i.test(ua) ? 'Edge'
                : /OPR\/|Opera/i.test(ua) ? 'Opera'
                    : /SamsungBrowser/i.test(ua) ? 'Samsung Internet'
                        : /Firefox\//i.test(ua) ? 'Firefox'
                            : /Chrome\//i.test(ua) ? 'Chrome'
                                : /Safari\//i.test(ua) ? 'Safari'
                                    : 'Navegador';

    const sistema =
        /Quest|OculusBrowser/i.test(ua) ? 'Meta Quest'
            : /Android/i.test(ua) ? 'Android'
                : /iPhone/i.test(ua) ? 'iPhone'
                    : /iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad'
                        : /Windows/i.test(ua) ? 'Windows'
                            : /Macintosh|Mac OS/i.test(ua) ? 'macOS'
                                : /Linux/i.test(ua) ? 'Linux'
                                    : 'Desconocido';

    return `${navegador} · ${sistema}`;
}
