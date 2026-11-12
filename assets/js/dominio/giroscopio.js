// Inclinación del teléfono → orden de movimiento. Funciones puras y sin acceso al navegador.

/** Diferencia angular a − b, en (−180, 180]. */
export const delta = (a, b) => ((a - b + 540) % 360) - 180;

/** Pasa la inclinación del sensor (beta/gamma) a «adelante» (− = hacia adelante) y «lateral» (+ = derecha),
 *  según como está girada la pantalla. En vertical es el caso del borrador; en horizontal los ejes se cruzan. */
export function ejesSegunPantalla(dBeta, dGamma, angulo, { invertirAdelante = false, invertirLateral = false } = {}) {
  const a = ((Math.round(angulo) % 360) + 360) % 360;
  let adelante; let lateral;
  switch (a) {
    case 90: adelante = -dGamma; lateral = dBeta; break;
    case 180: adelante = -dBeta; lateral = -dGamma; break;
    case 270: adelante = dGamma; lateral = -dBeta; break;
    default: adelante = dBeta; lateral = dGamma;
  }
  return { adelante: invertirAdelante ? -adelante : adelante, lateral: invertirLateral ? -lateral : lateral };
}

/** Decide la orden con umbral de arranque, zona de liberación (histéresis) y «armado»:
 *  hasta ver el teléfono nivelado una vez no se mueve nada. */
export class ControlInclinacion {
  #umbral; #lib; #actual = null; #armado = false;
  constructor({ umbral, liberacion }) { this.#umbral = umbral; this.#lib = liberacion; }
  get armado() { return this.#armado; }

  /** @returns {'AVANZAR'|'RETROCEDER'|'IZQUIERDA'|'DERECHA'|null} null = neutro (detener) */
  evaluar(adelante, lateral) {
    const a = Math.abs(adelante);
    const l = Math.abs(lateral);
    if (!this.#armado) {
      if (a < this.#lib && l < this.#lib) this.#armado = true;
      return null;
    }
    let cand = null; // eje dominante que supera el umbral
    if (a > l) {
      if (adelante > this.#umbral) cand = 'RETROCEDER'; else if (adelante < -this.#umbral) cand = 'AVANZAR';
    } else if (lateral > this.#umbral) cand = 'DERECHA'; else if (lateral < -this.#umbral) cand = 'IZQUIERDA';
    if (cand) { this.#actual = cand; return cand; }

    // histéresis: la orden vigente se mantiene mientras su eje siga fuera de la zona de liberación
    const v = { AVANZAR: -adelante, RETROCEDER: adelante, DERECHA: lateral, IZQUIERDA: -lateral }[this.#actual];
    if (this.#actual && v > this.#lib) return this.#actual;
    this.#actual = null;
    return null;
  }
}