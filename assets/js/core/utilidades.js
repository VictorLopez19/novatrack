// Utilidades puras: normalización, validación básica, emisor de eventos y store.

// Normaliza textos eliminando acentos y convirtiendo caracteres a mayúsculas.
export const normalizar = (t) =>
    String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// Comprueba si un valor es un objeto válido.
export const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Comprueba si un valor es un número entero positivo.
export const esEnteroPositivo = (v) => Number.isInteger(v) && v > 0;

// Limpia caracteres de control y limita la longitud de un texto.
export const textoSeguro = (v, max = 120) =>
    String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, max);

// Obtiene la hora local en formato de 24 horas.
export const horaLocal = () => new Date().toLocaleTimeString('es-MX', { hour12: false });

// Crea un emisor de eventos para registrar y ejecutar suscriptores.
export function crearEmisor() {
    const m = new Map();

    return {
        // Registra una función para escuchar un tipo de evento.
        on(tipo, fn) {
            if (!m.has(tipo)) m.set(tipo, new Set());
            m.get(tipo).add(fn);
            return () => m.get(tipo)?.delete(fn);
        },

        // Ejecuta las funciones registradas para un evento.
        emit(tipo, dato) {
            for (const fn of [...(m.get(tipo) ?? [])]) {
                try {
                    fn(dato);
                } catch (e) {
                    console.error('Error en suscriptor', tipo, e);
                }
            }
        },
    };
}

// Crea un almacén de datos que notifica los cambios mediante eventos.
export function crearStore(inicial) {
    const datos = { ...inicial };
    const em = crearEmisor();

    return {
        // Recupera el valor asociado a una clave.
        get: (k) => datos[k],

        // Actualiza un valor y notifica a los suscriptores si cambia.
        set(k, v) {
            if (datos[k] === v) return;

            datos[k] = v;
            em.emit(k, v);
            em.emit('*', k);
        },

        // Registra una función para escuchar cambios en una clave.
        on: (k, fn) => em.on(k, fn),
    };
}

// Nombre legible de un movimiento: sin «_» y solo la primera letra en mayúscula (GIRAR_GARRA → Girar garra).
export function formatoMovimiento(texto) {
    const t = String(texto).replaceAll('_', ' ').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es');
    return t.charAt(0).toLocaleUpperCase('es') + t.slice(1);
}
