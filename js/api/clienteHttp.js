// Cliente HTTP único: URL base, headers, timeout, parseo JSON y errores amigables.

/**
 * Representa los errores generados durante las solicitudes a la API.
 * Permite identificar el tipo de error, el código HTTP y su detalle.
 */
export class ErrorApi extends Error {
    constructor(tipo, mensaje, { status = 0, detalle = '' } = {}) {
        super(mensaje);
        this.tipo = tipo; // 'red' | 'timeout' | 'http' | 'formato' | 'config'
        this.status = status;
        this.detalle = detalle;
    }
}

/**
 * Mensajes descriptivos asociados a los códigos de respuesta HTTP.
 * Facilitan la presentación de errores comprensibles en la interfaz.
 */
const MENSAJES = {
    400: 'La solicitud no es válida',
    401: 'No se ha configurado la clave de acceso.',
    403: 'La clave de acceso no es válida',
    404: 'El recurso no existe',
    409: 'La operación no es posible en el estado actual',
    422: 'Los datos enviados no son válidos',
    500: 'Error interno del servidor',
    503: 'Base de datos no disponible; intenta más tarde',
};

/**
 * Centraliza la comunicación HTTP con la API.
 * Gestiona las solicitudes, credenciales, tiempos de espera,
 * respuestas JSON y tratamiento de errores.
 */
export class ClienteHttp {
    #base; #timeoutMs; #obtenerClave; #alRespuesta;

    /**
     * Inicializa el cliente HTTP con la configuración del servidor,
     * el tiempo de espera y las funciones auxiliares.
     */
    constructor({ baseUrl, timeoutMs, obtenerClave = () => '', alRespuesta = () => {} }) {
        const base = String(baseUrl).replace(/\/+$/, '');

        // Evita conexiones HTTP inseguras cuando la aplicación utiliza HTTPS.
        if (location.protocol === 'https:' && !base.startsWith('https://')) {
            throw new ErrorApi('config', 'Contenido mixto bloqueado: la API debe usar HTTPS.');
        }

        this.#base = base;
        this.#timeoutMs = timeoutMs;
        this.#obtenerClave = obtenerClave;
        this.#alRespuesta = alRespuesta;
    }

    /**
     * Ejecuta una solicitud HTTP y procesa la respuesta del servidor.
     * Admite parámetros, autenticación, cancelación y tiempo de espera.
     */
    async solicitar(metodo, ruta, { cuerpo, query, timeoutMs, senal, protegido = false } = {}) {
        // Construye la URL y agrega los parámetros de consulta cuando existen.
        let url = `${this.#base}${ruta}`;
        if (query) url += `?${new URLSearchParams(query)}`;

        // Define los encabezados de la solicitud y la autenticación opcional.
        const headers = { Accept: 'application/json' };

        if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';

        if (protegido) {
            const clave = this.#obtenerClave();
            if (clave) headers['X-API-Key'] = clave;
        }

        // Configura la cancelación de la solicitud y el tiempo máximo de espera.
        const ctl = new AbortController();
        let vencio = false;

        const t = setTimeout(() => {
            vencio = true;
            ctl.abort();
        }, timeoutMs ?? this.#timeoutMs);

        const alAbortar = () => ctl.abort();
        senal?.addEventListener('abort', alAbortar, { once: true });

        try {
            let resp;

            // Envía la solicitud al servidor y clasifica los errores de conexión.
            try {
                resp = await fetch(url, {
                    method: metodo,
                    headers,
                    signal: ctl.signal,
                    mode: 'cors',
                    credentials: 'omit',
                    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
                });
            } catch (e) {
                if (vencio) throw new ErrorApi('timeout', 'El servidor tardó demasiado en responder.');
                if (e?.name === 'AbortError') throw new ErrorApi('timeout', 'Solicitud cancelada.');

                throw new ErrorApi('red', 'No se pudo contactar al servidor (red o CORS).');
            }

            // Notifica el código HTTP recibido y procesa el contenido de la respuesta.
            this.#alRespuesta(resp.status, ruta);

            const texto = await resp.text();
            let json = null;

            // Convierte el contenido recibido a JSON cuando existe una respuesta.
            if (texto) {
                try {
                    json = JSON.parse(texto);
                } catch {
                    json = null;
                }
            }

            // Identifica las respuestas HTTP fallidas y genera un mensaje descriptivo.
            if (!resp.ok) {
                const d = json?.detalle ?? json?.detail;
                const detalle = typeof d === 'string' ? d.slice(0, 160) : '';
                const generico = MENSAJES[resp.status] ?? `Error HTTP ${resp.status}.`;
                const usarDetalle = detalle && resp.status !== 401 && resp.status !== 403;

                throw new ErrorApi('http', usarDetalle ? detalle : generico, {
                    status: resp.status,
                    detalle
                });
            }

            // Comprueba que la respuesta del servidor tenga un formato JSON válido.
            if (json === null) {
                throw new ErrorApi('formato', 'La respuesta del servidor no es JSON válido.', {
                    status: resp.status
                });
            }

            return json;

        } finally {
            // Libera el temporizador y el evento de cancelación al finalizar la solicitud.
            clearTimeout(t);
            senal?.removeEventListener('abort', alAbortar);
        }
    }

    // Métodos abreviados para realizar solicitudes GET y POST.
    get = (ruta, op) => this.solicitar('GET', ruta, op);
    post = (ruta, op) => this.solicitar('POST', ruta, { ...op, protegido: true });
}