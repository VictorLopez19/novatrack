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

  if (medio && anular && menique && dist(m[4], m[8]) / palma < cfg.umbralOk) return cfg.mapa.ok; // 👌 pulgar e índice juntos
  if (n === 4) return 'DETENER';                                                                  // ✋ palma abierta
  if (indice && menique && !medio && !anular) return cfg.mapa.cuernitos;                          // 🤘
  if (indice && medio && !anular && !menique) return cfg.mapa.v;                                  // ✌
  if (indice && medio && anular && !menique) return cfg.mapa.tres;                                // 3 dedos: índice, medio y anular

  if (indice && n === 1) {                                                                        // ☝ índice apuntando: chasis
    const dx = m[8].x - m[5].x;
    const dy = m[8].y - m[5].y;
    if (Math.hypot(dx, dy) / palma < cfg.largoMin) return null;
    const d = direccion(dx, dy, cfg.espejo);
    return d ? cfg.mapa.indice[d] : null;
  }

  if (n === 0) {                                                                                  // ✊ puño: brazo y garra según su posición
    const cx = PALMA.reduce((s, i) => s + m[i].x, 0) / PALMA.length - 0.5;
    const cy = PALMA.reduce((s, i) => s + m[i].y, 0) / PALMA.length - 0.5;
    if (Math.hypot(cx, cy) < cfg.zonaNeutra) return 'DETENER'; // puño en el centro = quieto
    const d = direccion(cx, cy, cfg.espejo);
    return d ? cfg.mapa.puno[d] : null;
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