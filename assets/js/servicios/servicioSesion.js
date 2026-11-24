// Ciclo de vida de la sesión de control de esta página:
//  - al cargar la página se crea una sesión con un PIN de 5 dígitos (sin permiso);
//  - un WSS propio mantiene viva la sesión y recibe los cambios de permiso del administrador;
//  - al salir de la página se destruye (sendBeacon); si el administrador la cierra, la página se recarga.
import { describirDispositivo } from '../api/sesionApi.js';
import { textoSeguro } from '../core/utilidades.js';

export const SIN_SESION = Object.freeze({ estado: 'requiere_pin', pin: null, autorizada: false });

export class ServicioSesion {
    #api; #store; #ws; #alCambiar;
    #token = null;
    #saliendo = false;

    /**
     * @param api      SesionApi
     * @param crearWs  (urlPara) => ServicioWebSocket
     */
    constructor({ api, store, crearWs, alCambiar = () => {} }) {
        this.#api = api;
        this.#store = store;
        this.#alCambiar = alCambiar;
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
        return 'Ingresa un PIN temporal generado por Administración para iniciar el control.';
    }

    /**
     * Reacciona a un 401 del servidor en una ruta de control: si esta sesión ya no existe
     * allá (por ejemplo, la API se reinició), crea otra sin esperar a que el WSS lo note.
     * El panel de administración y la creación de sesiones quedan fuera: tienen su propio ciclo.
     */
    renovarSiExpiro(status, ruta = '') {
        if (status !== 401 || !this.#token || this.#saliendo) return;
        if (ruta.startsWith('/admin') || ruta.startsWith('/sesiones')) return;

        this.#invalidar('Tu sesión expiró. Solicita un PIN nuevo al administrador.');
    }

    iniciar() {
        // Salir de la página (cerrar, recargar o navegar) destruye la sesión en el servidor.
        window.addEventListener('pagehide', () => this.#alSalir());

        // Si el navegador restaura la página desde su caché, la sesión anterior ya no existe.
        window.addEventListener('pageshow', (e) => {
            if (e.persisted) location.reload();
        });

        window.addEventListener('online', () => { if (this.#token) this.#ws.reconectarYa(); });
        this.#store.set('sesion', SIN_SESION);
        return Promise.resolve();
    }

    /** Canjea el PIN que entregó el administrador. */
    canjear(pin) {
        return this.#abrir((id) => this.#api.canjear(id, String(pin).trim(), describirDispositivo()));
    }

    /** Prueba una unidad de exhibición durante unos minutos, sin PIN. */
    probar() {
        return this.#abrir((id) => this.#api.probar(id, describirDispositivo()));
    }

    async #abrir(llamar) {
        const vehiculoId = this.#store.get('vehiculoId');
        if (!vehiculoId) throw new Error('No hay una unidad seleccionada.');
        this.#ws.desconectar();
        this.#token = null;
        this.#alCambiar(null);
        this.#store.set('sesion', { estado: 'canjeando', pin: null, autorizada: false });

        try {
            const s = await llamar(vehiculoId);
            if (this.#saliendo) return;

            this.#token = s.token;
            this.#store.set('sesion', {
                estado: 'activa', pin: s.pin, autorizada: s.autorizada,
                idVehiculo: vehiculoId, duracionS: s.duracionS,
                venceEn: Date.now() + s.duracionS * 1000,
            });
            this.#alCambiar(this.#token);
            this.#ws.conectar('sesion');
            return true;
        } catch (e) {
            this.#store.set('sesion', {
                estado: 'requiere_pin', pin: null, autorizada: false,
                mensaje: textoSeguro(e.message, 160),
            });
            throw e;
        }
    }

    unidadCambiada() {
        if (this.#token) this.#api.cerrarAlSalir(this.#token);
        this.#invalidar('Cambió la unidad. Solicita un PIN nuevo para la unidad seleccionada.');
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
                if (ev.pin === actual.pin) {
                    const cambios = { estado: 'activa', autorizada: ev.autorizada === true };
                    // El servidor informa cuánto le queda a la sesión: afina el temporizador.
                    if (Number.isFinite(ev.vence_en_s)) cambios.venceEn = Date.now() + ev.vence_en_s * 1000;
                    this.#actualizar(cambios);
                }
                break;

            case 'sesion_permiso': {
                if (ev.pin !== actual.pin) break;
                const autorizada = ev.autorizada === true;
                if (autorizada === actual.autorizada) break;

                this.#actualizar({ autorizada });
                this.#alCambiar(this.#token);
                this.#msg(
                    autorizada
                        ? 'El administrador autorizó tu sesión: ya puedes controlar el vehículo.'
                        : 'El administrador revocó el permiso de tu sesión.',
                    autorizada ? 'ok' : 'warn'
                );
                break;
            }

            case 'sesion_cerrada':
                this.#invalidar('El administrador cerró la sesión. Solicita un PIN nuevo para volver a entrar.');
                break;

            case 'sesion_invalida':
                // La sesión expiró (p. ej. la API se reinició o se perdió la conexión demasiado tiempo).
                this.#invalidar('Tu sesión expiró. Solicita un PIN nuevo al administrador.');
                break;

            default:
                break;
        }
    }

    #alSalir() {
        this.#saliendo = true;
        if (this.#token) this.#api.cerrarAlSalir(this.#token);

        this.#token = null;
        this.#alCambiar(null);
        this.#ws.desconectar();
    }

    #invalidar(mensaje) {
        this.#ws.desconectar();
        this.#token = null;
        this.#alCambiar(null);
        this.#store.set('sesionWs', 'desconectado');
        this.#store.set('sesion', { estado: 'requiere_pin', pin: null, autorizada: false, mensaje });
        this.#msg(mensaje, 'warn');
    }
}
