// Panel de administración: login, estado en tiempo real (WSS /ws/admin) y acciones sobre las sesiones.
// El token del administrador se guarda en sessionStorage: dura lo que la pestaña y no se comparte.
import { crearStore } from '../core/utilidades.js';
import { normalizarEstadoAdmin } from '../api/adminApi.js';

// Lectura/escritura tolerantes: en modo privado o con almacenamiento bloqueado simplemente no se recuerda.
const almacen = {
    leer(clave) {
        try { return JSON.parse(sessionStorage.getItem(clave) ?? 'null'); } catch { return null; }
    },
    guardar(clave, valor) {
        try { sessionStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin persistencia */ }
    },
    borrar(clave) {
        try { sessionStorage.removeItem(clave); } catch { /* nada que borrar */ }
    },
};

export class ServicioAdmin {
    estado = crearStore({
        autenticado: false,
        usuario: '',
        ws: 'desconectado',
        datos: null,      // estado normalizado del panel
        recibido: 0,      // performance.now() de la última actualización (para los contadores)
        ocupado: false,   // hay una acción en curso
    });

    #api; #ws; #msg; #clave; #pinPropio;
    #token = null;
    #vence = 0;
    #activa = false;
    #autorizado = '';   // PIN de esta pestaña ya autorizado automáticamente

    /**
     * @param api        AdminApi
     * @param crearWs    (alAbrir) => ServicioWebSocket hacia /ws/admin
     * @param pinPropio  () => PIN de la sesión de control de esta pestaña (o null)
     */
    constructor({ api, crearWs, msg, claveAlmacen, pinPropio = () => null }) {
        this.#api = api;
        this.#msg = msg;
        this.#clave = claveAlmacen;
        this.#pinPropio = pinPropio;
        this.#ws = crearWs((ws) => ws.send(JSON.stringify({ token: this.#token })));

        this.#ws.emisor.on('estado', ({ estado }) => this.estado.set('ws', estado));
        this.#ws.emisor.on('evento', (ev) => {
            if (ev.evento === 'admin_estado') this.#aplicar(ev);
            else if (ev.evento === 'admin_expirado') this.#limpiar('Tu sesión de administrador venció. Inicia sesión de nuevo.');
        });
    }

    /** Recupera el login guardado en esta pestaña (si no ha vencido). */
    restaurar() {
        const g = almacen.leer(this.#clave);

        if (g && typeof g.token === 'string' && Number(g.vence) > Date.now()) {
            this.#token = g.token;
            this.#vence = Number(g.vence);
            this.estado.set('usuario', String(g.usuario ?? ''));
            this.estado.set('autenticado', true);
        } else {
            almacen.borrar(this.#clave);
        }
    }

    async login(usuario, contrasena) {
        const r = await this.#api.login(usuario, contrasena);

        this.#token = r.token;
        this.#vence = Date.now() + r.venceEnS * 1000;
        almacen.guardar(this.#clave, { token: r.token, usuario: r.usuario, vence: this.#vence });

        this.estado.set('usuario', r.usuario);
        this.estado.set('autenticado', true);

        if (this.#activa) this.#conectar();

        // Quien administra no debería pedirse permiso a sí mismo.
        await this.autorizarPropia();
    }

    /**
     * Autoriza la sesión de control de esta misma pestaña, porque su dueño acaba de
     * demostrar que es el administrador. Se vuelve a intentar si cambia el PIN
     * (por ejemplo, tras expirar la sesión y generarse otra).
     */
    async autorizarPropia() {
        const pin = this.#pinPropio();

        if (!this.#token || !pin || this.#autorizado === pin) return false;
        this.#autorizado = pin;

        try {
            this.#aplicar(await this.#api.permiso(this.#token, pin, true), true);
            this.#msg(`Tu sesión (PIN ${pin}) quedó autorizada por ser la del administrador.`, 'ok');
            return true;
        } catch (e) {
            this.#autorizado = '';  // se reintenta en el siguiente cambio de sesión
            if (e.status === 401) this.#limpiar('Tu sesión de administrador venció. Inicia sesión de nuevo.');
            return false;
        }
    }

    async logout() {
        const token = this.#token;
        this.#limpiar();

        if (token) {
            try { await this.#api.logout(token); } catch { /* el token vence solo */ }
        }
    }

    /** La vista de administración se muestra. */
    entrar() {
        this.#activa = true;
        if (this.#token) this.#conectar();
    }

    /** La vista se oculta: no hace falta seguir recibiendo eventos. */
    salir() {
        this.#activa = false;
        this.#ws.desconectar();
    }

    #conectar() {
        if (this.#vence && this.#vence < Date.now()) {
            this.#limpiar('Tu sesión de administrador venció. Inicia sesión de nuevo.');
            return;
        }

        this.#ws.conectar('admin');
        this.refrescar();
    }

    async refrescar() {
        await this.#accion(() => this.#api.estado(this.#token), { silenciosa: true });
    }

    permiso(pin, autorizada) {
        return this.#accion(() => this.#api.permiso(this.#token, pin, autorizada), {
            ok: autorizada ? `Sesión ${pin} autorizada.` : `Permiso de la sesión ${pin} revocado.`,
        });
    }

    permisoTodas(autorizada) {
        return this.#accion(() => this.#api.permisoTodas(this.#token, autorizada), {
            ok: autorizada ? 'Todas las sesiones fueron autorizadas.' : 'Se revocó el permiso de todas las sesiones.',
        });
    }

    cerrar(pin) {
        return this.#accion(() => this.#api.cerrar(this.#token, pin), { ok: `Sesión ${pin} cerrada.` });
    }

    configurar(autoAutorizar) {
        return this.#accion(() => this.#api.configurar(this.#token, autoAutorizar), {
            ok: autoAutorizar ? 'Las sesiones nuevas se autorizarán automáticamente.' : 'Las sesiones nuevas requerirán tu permiso.',
        });
    }

    async detener(idVehiculo) {
        const ok = await this.#accion(() => this.#api.detener(this.#token, idVehiculo), {
            ok: 'Parada de emergencia enviada: DETENER registrado.',
            aplicar: false,
        });
        return ok;
    }

    // Ejecuta una acción, aplica el estado devuelto y gestiona el vencimiento del token.
    async #accion(fn, { ok = '', silenciosa = false, aplicar = true } = {}) {
        if (!this.#token) return false;

        this.estado.set('ocupado', true);

        try {
            const r = await fn();
            if (aplicar) this.#aplicar(r, true);
            if (ok) this.#msg(ok, 'ok');
            return true;
        } catch (e) {
            if (e.status === 401) {
                this.#limpiar('Tu sesión de administrador venció. Inicia sesión de nuevo.');
            } else if (!silenciosa || this.estado.get('datos') === null) {
                this.#msg(e.message, 'error');
            }
            return false;
        } finally {
            this.estado.set('ocupado', false);
        }
    }

    #aplicar(r, normalizado = false) {
        try {
            this.estado.set('datos', normalizado ? r : normalizarEstadoAdmin(r));
            this.estado.set('recibido', performance.now());
        } catch {
            /* se ignora un estado con formato inesperado */
        }
    }

    #limpiar(aviso = '') {
        this.#token = null;
        this.#vence = 0;
        this.#autorizado = '';
        almacen.borrar(this.#clave);
        this.#ws.desconectar();

        this.estado.set('datos', null);
        this.estado.set('usuario', '');
        this.estado.set('autenticado', false);

        if (aviso) this.#msg(aviso, 'warn');
    }
}
