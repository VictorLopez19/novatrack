// Diseño y lógica de los mandos de la cabina VR. No depende de three.js ni del navegador (se prueba con Node).
//
// 1) Panel de botones del tablero: sistema local del panel, en metros. X a la derecha, Y hacia arriba sobre
//    la cara del panel y Z saliendo de la cara hacia el usuario.
// 2) Palancas (joysticks) de las consolas: la inclinación se calcula desde la posición de la mano respecto
//    al pivote, en el sistema de la cabina (-Z hacia el frente).

export const CUERPO = Object.freeze({ ancho: 0.42, alto: 0.16, grosor: 0.02, radio: 0.022 });
export const PANTALLA = Object.freeze({ y: 0.04, ancho: 0.22, alto: 0.05 });
export const TAPA = Object.freeze({ alto: 0.012, recorrido: 0.008 }); // altura sobre la cara y cuánto se hunde

const R_UNI = 0.013; // funciones de un solo toque
const Y_FILA = -0.035;

// tipo: 'unico' (un disparo) | 'detener' | 'salir' | 'recentrar'
export const BOTONES = Object.freeze([
  { id: 'SONIDO', tipo: 'unico', clave: 'SONIDO', etiqueta: 'Sonido', icono: 'bi-volume-up-fill', x: -0.15, y: Y_FILA, r: R_UNI, tono: 'morado' },
  { id: 'VELOCIDAD', tipo: 'unico', clave: 'VELOCIDAD', etiqueta: 'Velocidad', icono: 'bi-speedometer2', x: -0.105, y: Y_FILA, r: R_UNI, tono: 'morado' },
  { id: 'DETENER', tipo: 'detener', clave: 'DETENER', etiqueta: 'Detener', icono: 'bi-stop-fill', x: 0, y: Y_FILA, r: 0.026, tono: 'rojo' },
  { id: 'ENCENDIDO', tipo: 'unico', clave: 'ENCENDIDO', etiqueta: 'Encendido', icono: 'bi-power', x: 0.105, y: Y_FILA, r: R_UNI, tono: 'morado' },
  { id: 'LUCES', tipo: 'unico', clave: 'LUCES', etiqueta: 'Luces', icono: 'bi-lightbulb-fill', x: 0.15, y: Y_FILA, r: R_UNI, tono: 'morado' },
  { id: 'RECENTRAR', tipo: 'recentrar', clave: null, etiqueta: 'Recentrar cabina', icono: 'bi-bullseye', x: -0.185, y: 0.055, r: 0.011, tono: 'gris' },
  { id: 'SALIR', tipo: 'salir', clave: null, etiqueta: 'Salir de VR', icono: 'bi-x-lg', x: 0.185, y: 0.055, r: 0.011, tono: 'gris' },
]);

const limitar = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * Detecta pulsaciones con la punta del dedo. Cada punta llega en coordenadas locales del panel, con z medida
 * desde la cara. Un botón solo se pulsa si el dedo llegó desde ARRIBA (evita disparos al atravesar el panel
 * por detrás o de lado) y se suelta con histéresis para no rebotar.
 */
export class DetectorPulsacion {
  #botones; #cfg;
  #puntas = new Map();   // id de la punta -> { encima: boton|null, pulsado: boton|null }
  #pulsados = new Set(); // botones presionados en el cuadro anterior

  constructor({ botones = BOTONES, profundidad = 0.004, margen = 0.006, alturaEncima = 0.045, histeresis = 0.003 } = {}) {
    this.#botones = botones;
    this.#cfg = { profundidad, margen, alturaEncima, histeresis };
  }

  #botonBajo(x, y) {
    let mejor = null; let dMejor = Infinity;
    for (const b of this.#botones) {
      const d = Math.hypot(x - b.x, y - b.y);
      if (d < b.r + this.#cfg.margen && d < dMejor) { mejor = b; dMejor = d; }
    }
    return mejor;
  }

  /**
   * @param {{id:string,x:number,y:number,z:number}[]} puntas
   * @returns {{ pulsar: object[], soltar: object[], hundimiento: Map<string, number>, encima: Set<string> }}
   */
  actualizar(puntas) {
    const { profundidad, alturaEncima, histeresis } = this.#cfg;
    const superficie = TAPA.alto;
    const hundimiento = new Map();
    const encima = new Set();
    const vistas = new Set();

    for (const p of puntas) {
      vistas.add(p.id);
      const st = this.#puntas.get(p.id) ?? { encima: null, pulsado: null };
      this.#puntas.set(p.id, st);

      if (st.pulsado) {
        const b = st.pulsado;
        const fuera = Math.hypot(p.x - b.x, p.y - b.y) > b.r + this.#cfg.margen * 2;
        const subio = p.z > superficie - profundidad + histeresis;
        const atraveso = p.z < -CUERPO.grosor - 0.02;
        if (fuera || subio || atraveso) { st.pulsado = null; st.encima = subio && !fuera ? b : null; }
      }

      const b = st.pulsado ?? this.#botonBajo(p.x, p.y);
      if (!b) { st.encima = null; continue; }

      if (!st.pulsado) {
        if (p.z > superficie - 0.001 && p.z < superficie + alturaEncima) st.encima = b;         // se acerca por arriba
        else if (st.encima !== b || p.z > superficie + alturaEncima) st.encima = null;
        if (st.encima === b && p.z <= superficie - profundidad) st.pulsado = b;                 // hundió lo suficiente
      }

      if (st.encima === b || st.pulsado === b) {
        encima.add(b.id);
        const h = limitar(superficie - p.z, 0, TAPA.recorrido);
        hundimiento.set(b.id, Math.max(hundimiento.get(b.id) ?? 0, h));
      }
    }

    // Las puntas que desaparecieron (mano fuera de vista) sueltan lo que presionaban.
    for (const id of [...this.#puntas.keys()]) if (!vistas.has(id)) this.#puntas.delete(id);

    const ahora = new Set([...this.#puntas.values()].map((s) => s.pulsado).filter(Boolean));
    const pulsar = [...ahora].filter((b) => !this.#pulsados.has(b));
    const soltar = [...this.#pulsados].filter((b) => !ahora.has(b));
    this.#pulsados = ahora;
    return { pulsar, soltar, hundimiento, encima };
  }

  /** Suelta todo (al perder la sesión o el foco). Devuelve los botones que estaban presionados. */
  reiniciar() {
    const soltados = [...this.#pulsados];
    this.#puntas.clear();
    this.#pulsados = new Set();
    return soltados;
  }
}

/** Pinza pulgar–índice con histéresis: se cierra por debajo de `cierra` y se abre por encima de `abre`. */
export class DetectorPinza {
  #cerrada = false;
  constructor({ cierra = 0.02, abre = 0.035 } = {}) { this.cierra = cierra; this.abre = abre; }
  actualizar(distancia) {
    if (!Number.isFinite(distancia)) { this.#cerrada = false; return false; }
    this.#cerrada = this.#cerrada ? distancia < this.abre : distancia < this.cierra;
    return this.#cerrada;
  }
  get cerrada() { return this.#cerrada; }
}

// ---------- Palancas (joysticks) ----------

export const PALANCA = Object.freeze({
  largo: 0.17,        // del pivote al centro del puño
  maxAngulo: 0.45,    // rad (~26°) de inclinación máxima
  zonaMuerta: 0.14,   // rad (~8°) antes de mandar movimiento
  histeresis: 0.05,   // rad: para soltar la dirección hay que volver más cerca del centro
  alcance: 0.07,      // m: distancia de la mano al puño para poder tomarlo
});

// Dirección de cada palanca -> clave lógica del catálogo (igual que los joysticks de la app).
export const MAPA_PALANCAS = Object.freeze({
  izq: Object.freeze({ adelante: 'AVANZAR', atras: 'RETROCEDER', izquierda: 'IZQUIERDA', derecha: 'DERECHA' }),
  der: Object.freeze({ atras: 'BRAZO_SUBIR', adelante: 'BRAZO_BAJAR', izquierda: 'GARRA_IZQUIERDA', derecha: 'GARRA_DERECHA' }),
});

/**
 * Inclinación de la palanca para que el puño apunte hacia la mano.
 * (dx, dy, dz) = mano − pivote en el sistema de la cabina. rx > 0 inclina hacia atrás (hacia el usuario),
 * rz > 0 inclina a la izquierda. Ambos se limitan a ±maxAngulo.
 */
export function inclinacionDesdeMano(dx, dy, dz, maxAngulo = PALANCA.maxAngulo) {
  const alto = Math.max(dy, 0.02); // si la mano baja del pivote, se toma como inclinación máxima
  return {
    rx: limitar(Math.atan2(dz, alto), -maxAngulo, maxAngulo),
    rz: limitar(Math.atan2(-dx, alto), -maxAngulo, maxAngulo),
  };
}

/** Convierte la inclinación en una dirección (o null) con zona muerta e histéresis; solo un eje a la vez. */
export class DireccionPalanca {
  #actual = null;
  constructor({ zonaMuerta = PALANCA.zonaMuerta, histeresis = PALANCA.histeresis } = {}) {
    this.zonaMuerta = zonaMuerta; this.histeresis = histeresis;
  }

  static #componente(dir, rx, rz) {
    return { adelante: -rx, atras: rx, izquierda: rz, derecha: -rz }[dir];
  }

  actualizar(rx, rz) {
    // Se conserva la dirección actual mientras no regrese cerca del centro.
    if (this.#actual && DireccionPalanca.#componente(this.#actual, rx, rz) > this.zonaMuerta - this.histeresis
      && Math.max(Math.abs(rx), Math.abs(rz)) === Math.abs(DireccionPalanca.#componente(this.#actual, rx, rz))) {
      return this.#actual;
    }
    let dir = null;
    if (Math.max(Math.abs(rx), Math.abs(rz)) > this.zonaMuerta) {
      dir = Math.abs(rx) >= Math.abs(rz) ? (rx < 0 ? 'adelante' : 'atras') : (rz > 0 ? 'izquierda' : 'derecha');
    }
    this.#actual = dir;
    return dir;
  }

  reiniciar() { this.#actual = null; }
  get actual() { return this.#actual; }
}
