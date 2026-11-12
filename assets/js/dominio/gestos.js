// Gestos de mano (21 puntos de MediaPipe): clasificación y filtro de seguridad.
// Puntos usados: 0 muñeca · 4 punta del pulgar · 5 base del índice · 8 punta del índice · 9 base del medio.
const DEDOS = [[8, 6], [12, 10], [16, 14], [20, 18]]; // [punta, articulación PIP]: índice, medio, anular, meñique
const PALMA = [0, 5, 9, 13, 17];                       // muñeca y base de los dedos: centro de la mano
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const extendido = (m, [punta, pip]) => dist(m[punta], m[0]) > dist(m[pip], m[0]) * 1.15;

/** Dirección de un vector de la imagen, vista desde el usuario (la cámara frontal entrega la imagen sin espejo). */
function direccion(dx, dy, espejo) {
  if (Math.abs(dy) > Math.abs(dx) * 1.2) return dy < 0 ? 'arriba' : 'abajo';
  if (Math.abs(dx) > Math.abs(dy) * 1.2) return (espejo ? dx < 0 : dx > 0) ? 'derecha' : 'izquierda';
  return null; // diagonal ambigua
}

/** @returns {string|null} clave de comando según cfg.mapa, 'DETENER', o null (pose no reconocida) */

export function clasificarMano(m, cfg) {
  if (!Array.isArray(m) || m.length < 21) return null;

  const ext = DEDOS.map((f) => extendido(m, f));
  const [indice, medio, anular, menique] = ext;
  const n = ext.filter(Boolean).length;
  const palma = dist(m[0], m[9]) || 1;

  // OK: pulgar e índice juntos
  if (medio && anular && menique &&
    dist(m[4], m[8]) / palma < cfg.umbralOk) {
    return cfg.mapa.ok;
  }

  // Palma abierta: detener
  if (n === 4) return 'DETENER';

  // Cuernitos
  if (indice && menique && !medio && !anular) {
    return cfg.mapa.cuernitos;
  }

  // Tres dedos
  if (indice && medio && anular && !menique) {
    return cfg.mapa.tres;
  }

  // Puño cerrado: velocidad, sin comprobar posición
  if (n === 0) {
    return cfg.mapa.puno;
  }

  // Dos dedos: brazo y garra según la orientación de los dedos
  if (indice && medio && !anular && !menique) {
    const dx = ((m[8].x + m[12].x) / 2) -
      ((m[5].x + m[9].x) / 2);

    const dy = ((m[8].y + m[12].y) / 2) -
      ((m[5].y + m[9].y) / 2);

    if (Math.hypot(dx, dy) / palma < cfg.largoMin) return null;

    const d = direccion(dx, dy, cfg.espejo);
    return d ? cfg.mapa.dosDedos[d] : null;
  }

  // Índice solo: movimientos del chasis
  if (indice && n === 1) {
    const dx = m[8].x - m[5].x;
    const dy = m[8].y - m[5].y;

    if (Math.hypot(dx, dy) / palma < cfg.largoMin) {
      return null;
    }

    const d = direccion(dx, dy, cfg.espejo);
    return d ? cfg.mapa.indice[d] : null;
  }

  return null;
}


/** Estabiliza las lecturas: exige varias seguidas, detiene si se pierde la mano y pide «armar» antes de mover. */
export class FiltroGestos {
  #cfg; #cand = null; #n = 0; #actual = null; #armado; #visto = -Infinity;

  constructor(cfg) { this.#cfg = cfg; this.#armado = !cfg.requiereArmado; }
  get armado() { return this.#armado; }
  get actual() { return this.#actual; }

  /** @param {string|null} clave lectura del cuadro (null = sin mano o pose rara) @returns {{clave:string}|null} acción a ejecutar */
  actualizar(clave, ahora) {
    if (clave) this.#visto = ahora;
    let efectiva = clave;
    if (!efectiva) {
      if (ahora - this.#visto < this.#cfg.sinManoMs) return null; // se tolera un parpadeo de la detección
      efectiva = 'DETENER'; // sin mano o pose rara por demasiado tiempo
    }
    if (efectiva === this.#cand) this.#n += 1; else { this.#cand = efectiva; this.#n = 1; }

    const necesarios = efectiva === 'DETENER' ? this.#cfg.framesParada
      : this.#cfg.unicos.includes(efectiva) ? this.#cfg.framesUnico // luces, sonido…: más tiempo para evitar disparos por error
        : this.#cfg.framesMov;
    if (this.#n < necesarios || efectiva === this.#actual) return null;
    if (efectiva === 'DETENER') { this.#armado = true; this.#actual = efectiva; return { clave: efectiva }; }
    if (!this.#armado) return null; // todavía no se mostró la palma o se quitó la mano
    this.#actual = efectiva;
    return { clave: efectiva };
  }
}