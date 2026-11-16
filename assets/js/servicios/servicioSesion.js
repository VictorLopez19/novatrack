// Ciclo de vida de la sesión de control de esta página:
//  - al cargar la página se crea una sesión con un PIN de 5 dígitos (sin permiso);
//  - un WSS propio mantiene viva la sesión y recibe los cambios de permiso del administrador;
//  - al salir de la página se destruye (sendBeacon); si el administrador la cierra, la página se recarga.
import { describirDispositivo } from '../api/sesionApi.js';
import { textoSeguro } from '../core/utilidades.js';

export const SIN_SESION = Object.freeze({ estado: 'creando', pin: null, autorizada: false });

export class ServicioSesion {
    #api; #store; #ws; #config;
    #token = null;
    #intento = 0;
    #tReintento = null;
    #saliendo = false;

    /**
     * @param api      SesionApi
     * @param crearWs  (urlPara) => ServicioWebSocket
     */
    constructor({ api, store, crearWs, config }) {
        this.#api = api;
        this.#store = store;
        this.#config = config;
        this.#ws = crearWs(() => this.#token);

        this.#ws.emisor.on('evento', (ev) => this.#alEvento(ev));
        this.#ws.emisor.on('estado', ({ estado }) => this.#store.set('sesionWs', estado));
    }

    /** Token secreto de la sesión (cabecera X-Sesion-Token). */
    get token() {
        return this.#token;
    }

    get pin() {
        return this.#store.get('sesion').pin;
    }

    /** Mensaje para el usuario si esta sesión no puede controlar el vehículo; null si puede. */
    motivoSinPermiso() {
        const s = this.#store.get('sesion');

        if (s.autorizada && this.#token) return null;
        if (s.estado === 'activa') return `Tu sesión (PIN ${s.pin}) aún no tiene permiso del administrador.`;
        if (s.estado === 'cerrada') return 'La sesión fue cerrada por el administrador.';

        return 'No hay una sesión de control activa todavía. Espera un momento.';
    }

    /**
     * Reacciona a un 401 del servidor en una ruta de control: si esta sesión ya no existe
     * allá (por ejemplo, la API se reinició), crea otra sin esperar a que el WSS lo note.
     * El panel de administración y la creación de sesiones quedan fuera: tienen su propio ciclo.
     */
    renovarSiExpiro(status, ruta = '') {
        if (status !== 401 || !this.#token || this.#saliendo) return;
        if (ruta.startsWith('/admin') || ruta.startsWith('/sesiones')) return;

        this.#msg('Tu sesión expiró: se generó un PIN nuevo que el administrador debe autorizar.', 'warn');
        this.#crear();
    }

    iniciar() {
        // Salir de la página (cerrar, recargar o navegar) destruye la sesión en el servidor.
        window.addEventListener('pagehide', () => this.#alSalir());

        // Si el navegador restaura la página desde su caché, la sesión anterior ya no existe.
        window.addEventListener('pageshow', (e) => {
            if (e.persisted) location.reload();
        });

        window.addEventListener('online', () => this.#ws.reconectarYa());

        return this.#crear();
    }

    async #crear() {
        clearTimeout(this.#tReintento);
        this.#ws.desconectar();
        this.#token = null;
        this.#store.set('sesion', SIN_SESION);

        try {
            const s = await this.#api.crear(describirDispositivo());
            if (this.#saliendo) return;

            this.#token = s.token;
            this.#intento = 0;
            this.#store.set('sesion', { estado: 'activa', pin: s.pin, autorizada: s.autorizada });
            this.#ws.conectar('sesion');
        } catch (e) {
            // La API no responde: se reintenta con espera creciente sin bloquear el resto de la página.
            const espera = Math.min(this.#config.reintentoMaxMs, 2000 * 2 ** this.#intento);
            this.#intento += 1;
            this.#store.set('sesion', { estado: 'error', pin: null, autorizada: false, mensaje: textoSeguro(e.message, 120) });
            this.#tReintento = setTimeout(() => this.#crear(), espera);
        }
    }

    #actualizar(cambios) {
        this.#store.set('sesion', { ...this.#store.get('sesion'), ...cambios });
    }

    #msg(texto, tipo = 'info') {
        this.#store.set('mensaje', { texto, tipo, id: Date.now() + Math.random() });
    }

    #alEvento(ev) {
        const actual = this.#store.get('sesion');

        switch (ev.evento) {
            case 'sesion_estado':
                if (ev.pin === actual.pin) this.#actualizar({ estado: 'activa', autorizada: ev.autorizada === true });
                break;

            case 'sesion_permiso': {
                if (ev.pin !== actual.pin) break;
                const autorizada = ev.autorizada === true;
                if (autorizada === actual.autorizada) break;

                this.#actualizar({ autorizada });
                this.#msg(
                    autorizada
                        ? 'El administrador autorizó tu sesión: ya puedes controlar el vehículo.'
                        : 'El administrador revocó el permiso de tu sesión.',
                    autorizada ? 'ok' : 'warn'
                );
                break;
            }

            case 'sesion_cerrada':
                // Cerrada por el administrador: se recarga la página y se obtiene un PIN nuevo sin permiso.
                this.#ws.desconectar();
                this.#token = null;
                this.#store.set('sesion', { estado: 'cerrada', pin: actual.pin, autorizada: false });
                this.#msg('El administrador cerró tu sesión. Recargando la página…', 'warn');
                setTimeout(() => location.reload(), this.#config.recargaMs);
                break;

            case 'sesion_invalida':
                // La sesión expiró (p. ej. la API se reinició o se perdió la conexión demasiado tiempo).
                this.#msg('Tu sesión expiró: se generó un PIN nuevo que el administrador debe autorizar.', 'warn');
                this.#crear();
                break;

            default:
                break;
        }
    }

    #alSalir() {
        this.#saliendo = true;
        clearTimeout(this.#tReintento);

        if (this.#token) this.#api.cerrarAlSalir(this.#token);

        this.#token = null;
        this.#ws.desconectar();
    }
}
