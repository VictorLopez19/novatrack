// Diseño y lógica del control virtual (VR/AR). Todo está en metros y en el sistema local del control:
// X a la derecha, Y hacia arriba sobre la cara del control y Z saliendo de la cara hacia el usuario.
// No depende de three.js ni del navegador, así que se puede probar con Node.

export const CUERPO = Object.freeze({ ancho: 0.40, alto: 0.22, grosor: 0.022, radio: 0.03 });
export const ASA = Object.freeze({ y: 0.138, largo: 0.11, radio: 0.009 });
export const PANTALLA = Object.freeze({ y: 0.075, ancho: 0.15, alto: 0.036 });
export const TAPA = Object.freeze({ alto: 0.012, recorrido: 0.008 }); // altura sobre la cara y cuánto se hunde

const R_MOV = 0.017; // botones de movimiento
const R_UNI = 0.013; // funciones de un solo toque

// tipo: 'mov' (se mantiene mientras se presiona) | 'unico' (un disparo) | 'detener' | 'salir'
export const BOTONES = Object.freeze([
  // Cruceta izquierda: chasis
  { id: 'AVANZAR', tipo: 'mov', clave: 'AVANZAR', etiqueta: 'Avanzar', icono: 'bi-arrow-up', x: -0.125, y: 0.028, r: R_MOV, tono: 'azul' },
  { id: 'RETROCEDER', tipo: 'mov', clave: 'RETROCEDER', etiqueta: 'Retroceder', icono: 'bi-arrow-down', x: -0.125, y: -0.068, r: R_MOV, tono: 'azul' },
  { id: 'IZQUIERDA', tipo: 'mov', clave: 'IZQUIERDA', etiqueta: 'Izquierda', icono: 'bi-arrow-left', x: -0.173, y: -0.02, r: R_MOV, tono: 'azul' },
  { id: 'DERECHA', tipo: 'mov', clave: 'DERECHA', etiqueta: 'Derecha', icono: 'bi-arrow-right', x: -0.077, y: -0.02, r: R_MOV, tono: 'azul' },

  // Cruceta derecha: brazo y garra
  { id: 'BRAZO_SUBIR', tipo: 'mov', clave: 'BRAZO_SUBIR', etiqueta: 'Brazo arriba', icono: 'bi-arrow-bar-up', x: 0.125, y: 0.028, r: R_MOV, tono: 'azul' },
  { id: 'BRAZO_BAJAR', tipo: 'mov', clave: 'BRAZO_BAJAR', etiqueta: 'Brazo abajo', icono: 'bi-arrow-bar-down', x: 0.125, y: -0.068, r: R_MOV, tono: 'azul' },
  { id: 'GARRA_IZQUIERDA', tipo: 'mov', clave: 'GARRA_IZQUIERDA', etiqueta: 'Garra izquierda', icono: 'bi-arrow-counterclockwise', x: 0.077, y: -0.02, r: R_MOV, tono: 'azul' },
  { id: 'GARRA_DERECHA', tipo: 'mov', clave: 'GARRA_DERECHA', etiqueta: 'Garra derecha', icono: 'bi-arrow-clockwise', x: 0.173, y: -0.02, r: R_MOV, tono: 'azul' },

  // Funciones (centro)
  { id: 'SONIDO', tipo: 'unico', clave: 'SONIDO', etiqueta: 'Sonido', icono: 'bi-volume-up-fill', x: -0.026, y: 0.02, r: R_UNI, tono: 'morado' },
  { id: 'VELOCIDAD', tipo: 'unico', clave: 'VELOCIDAD', etiqueta: 'Velocidad', icono: 'bi-speedometer2', x: 0.026, y: 0.02, r: R_UNI, tono: 'morado' },
  { id: 'ENCENDIDO', tipo: 'unico', clave: 'ENCENDIDO', etiqueta: 'Encendido', icono: 'bi-power', x: -0.026, y: -0.022, r: R_UNI, tono: 'morado' },
  { id: 'LUCES', tipo: 'unico', clave: 'LUCES', etiqueta: 'Luces', icono: 'bi-lightbulb-fill', x: 0.026, y: -0.022, r: R_UNI, tono: 'morado' },

  // Seguridad y salida
  { id: 'DETENER', tipo: 'detener', clave: 'DETENER', etiqueta: 'Detener', icono: 'bi-stop-fill', x: 0, y: -0.072, r: 0.022, tono: 'rojo' },
  { id: 'SALIR', tipo: 'salir', clave: null, etiqueta: 'Salir de VR', icono: 'bi-x-lg', x: 0.176, y: 0.088, r: 0.011, tono: 'gris' },
]);

// Rótulos impresos sobre la cara del control.
export const ROTULOS = Object.freeze([
  { texto: 'CHASIS', x: -0.125, y: 0.085 },
  { texto: 'BRAZO Y GARRA', x: 0.110, y: 0.085 },
]);

const limitar = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * Detecta pulsaciones con la punta del dedo. Cada punta llega en coordenadas locales, con z medida
 * desde la cara del control. Un botón solo se pulsa si el dedo llegó desde ARRIBA (evita disparos
 * al atravesar el control por detrás o de lado) y se suelta con histéresis para no rebotar.
 */
export class DetectorPulsacion {
  #botones; #cfg;
  #puntas = new Map();   // id de la punta -> { encima: boton|null, pulsado: boton|null }
  #pulsados = new Set(); // botones presionados en el cuadro anterior

  constructor({ botones = BOTONES, profundidad = 0.006, margen = 0.006, alturaEncima = 0.045, histeresis = 0.003 } = {}) {
    this.#botones = botones;
    this.#cfg = { profundidad, margen, alturaEncima, histeresis };
  }

  /** Botón bajo la punta (dentro de su radio + margen) o null. */
  #botonBajo(x, y, margenExtra = 0) {
    let mejor = null; let dMejor = Infinity;
    for (const b of this.#botones) {
      const d = Math.hypot(x - b.x, y - b.y);
      if (d < b.r + this.#cfg.margen + margenExtra && d < dMejor) { mejor = b; dMejor = d; }
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

/** ¿Está un punto local cerca del asa? (segmento horizontal en y = ASA.y). */
export function cercaDelAsa(x, y, z, tolerancia = 0.04) {
  const mitad = ASA.largo / 2;
  const dx = Math.max(0, Math.abs(x) - mitad);
  return Math.hypot(dx, y - ASA.y, z - CUERPO.grosor / 2) < ASA.radio + tolerancia;
}
