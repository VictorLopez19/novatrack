// Resuelve claves lógicas (AVANZAR…) contra el catálogo real del vehículo.

import { normalizar } from '../core/utilidades.js';

// Gestiona la búsqueda y resolución de los comandos disponibles.
export class CatalogoComandos {
    #aliases; #porNombre = new Map(); #detener = null;

    // Inicializa el catálogo con las equivalencias de los comandos.
    constructor(aliases) {
        this.#aliases = aliases;
    }

    // Carga los comandos activos y registra el comando de detención.
    cargar(lista) {
        this.#porNombre = new Map();
        this.#detener = null;

        for (const c of lista.filter((x) => x.activo)) {
            this.#porNombre.set(normalizar(c.nombre), c);

            if (c.codigo === 0 || normalizar(c.nombre) === 'DETENER') {
                this.#detener ??= c;
            }
        }
    }

    // Busca un comando a partir de su clave lógica o sus alias.
    resolver(clave) {
        if (clave === 'DETENER' && this.#detener) return this.#detener;

        for (const alias of this.#aliases[clave] ?? []) {
            const c = this.#porNombre.get(normalizar(alias));
            if (c) return c;
        }

        return null;
    }

    // Obtiene las claves lógicas que no tienen un comando disponible.
    faltantes(claves) {
        return claves.filter((k) => !this.resolver(k));
    }
}