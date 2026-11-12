// Modo giroscopio: se inclina el teléfono para mover el chasis (como un joystick) y una sacudida
// fuerte es parada de emergencia. Reutiliza ServicioComandos, con las mismas reglas que el resto.
import { crearEmisor } from '../core/utilidades.js';
import { delta, ejesSegunPantalla, ControlInclinacion } from '../dominio/giroscopio.js';

export const giroscopioSoportado = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;

const anguloPantalla = () => screen.orientation?.angle ?? window.orientation ?? 0;

/** iOS exige permiso explícito y solo lo concede dentro de un toque del usuario. */
async function pedirPermisos() {
  for (const Evento of [window.DeviceOrientationEvent, window.DeviceMotionEvent]) {
    if (typeof Evento?.requestPermission === 'function') {
      if ((await Evento.requestPermission()) !== 'granted') throw new Error('Permiso de sensores denegado.');
    }
  }
}

export class ServicioGiroscopio {
  emisor = crearEmisor(); // 'estado', 'progreso', 'lectura'
  #store; #comandos; #haySesion; #alFaltarSesion; #cfg;
  #activo = false; #pidiendo = false; #fase = 'inactivo'; // calibrando | sin_calibrar | activo | emergencia
  #lecturas = []; #inicioCal = 0; #tSinSensor = null;
  #base = { beta: 0, gamma: 0 }; #angBase = 0; #filtro = { beta: 0, gamma: 0 }; #filtroListo = false;
  #control = null; #claveActual = null; #aceleracion = 0; #ultimaSacudida = 0; #ultimaEmision = 0;

  constructor({ store, comandos, haySesion, alFaltarSesion, config }) {
    this.#store = store; this.#comandos = comandos; this.#haySesion = haySesion;
    this.#alFaltarSesion = alFaltarSesion; this.#cfg = config;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.desactivar('La pestaña pasó a segundo plano: modo giroscopio desactivado.', 'warn');
    });
  }

  get activo() { return this.#activo; }
  #msg(texto, tipo = 'info') { this.#store.set('mensaje', { texto, tipo, id: Date.now() + Math.random() }); }
  #fase_(f) { this.#fase = f; this.emisor.emit('estado', f); }

  /** Debe llamarse directamente desde un toque (iOS pide permiso de sensores). */
  async activar() {
    if (this.#activo || this.#pidiendo) return this.#activo;
    if (this.#store.get('modo') !== 'manual') { this.#msg('Sal del modo actual antes de activar el giroscopio.', 'warn'); return false; }
    if (!this.#store.get('vehiculoId')) { this.#msg('Selecciona un vehículo en Ajustes.', 'error'); return false; }
    if (this.#store.get('demo').estado !== 'libre') { this.#msg('Hay una DEMO o una orden de IA en curso. Espera a que termine.', 'warn'); return false; }
    if (!this.#haySesion()) { this.#alFaltarSesion(); return false; }
    if (!window.isSecureContext) { this.#msg('Los sensores solo funcionan en HTTPS o localhost.', 'error'); return false; }

    this.#pidiendo = true;
    try { await pedirPermisos(); } catch (e) {
      this.#pidiendo = false;
      this.#msg(e?.message || 'No se pudieron activar los sensores.', 'error');
      return false;
    }
    this.#pidiendo = false;
    if (this.#store.get('modo') !== 'manual') return false; // otro modo se activó mientras se pedía el permiso

    this.#activo = true;
    this.#store.set('modo', 'giro'); // deshabilita joysticks, botones, DEMO, voz y gestos
    window.addEventListener('deviceorientation', this.#alOrientacion);
    window.addEventListener('devicemotion', this.#alMovimiento);
    this.calibrar();
    return true;
  }

  desactivar(motivo = 'Modo giroscopio desactivado.', tipo = 'info') {
    if (!this.#activo) return;
    this.#activo = false; this.#fase = 'inactivo';
    clearTimeout(this.#tSinSensor);
    window.removeEventListener('deviceorientation', this.#alOrientacion);
    window.removeEventListener('devicemotion', this.#alMovimiento);
    this.#claveActual = null;
    this.#store.set('modo', 'manual');
    this.emisor.emit('estado', 'inactivo');
    this.#comandos.soltar('giro'); // si se movía por inclinación, se detiene
    this.#msg(motivo, tipo);
  }

  /** Toma la posición actual como «neutro»: teléfono quieto y nivelado durante calibracionMs. */
  calibrar() {
    if (!this.#activo) return;
    this.#comandos.soltar('giro'); // el vehículo se queda quieto mientras se calibra
    this.#claveActual = null;
    this.#lecturas = []; this.#inicioCal = performance.now();
    this.#fase_('calibrando');
    this.emisor.emit('progreso', 0);
    this.#msg('Calibrando: mantén el teléfono quieto y nivelado.', 'info');
    clearTimeout(this.#tSinSensor);
    this.#tSinSensor = setTimeout(() => {
      if (this.#fase === 'calibrando' && !this.#lecturas.length) this.desactivar('No se detectó giroscopio en este dispositivo.', 'error');
    }, this.#cfg.sinSensorMs);
  }

  /** Tras una parada de emergencia: vuelve a mover, pero antes hay que nivelar el teléfono. */
  reactivar() {
    if (this.#fase !== 'emergencia') return;
    this.#control = new ControlInclinacion(this.#cfg); this.#filtroListo = false;
    this.#fase_('activo');
    this.#msg('Control reactivado. Nivela el teléfono para continuar.', 'info');
  }

  #terminarCalibracion() {
    clearTimeout(this.#tSinSensor);
    if (this.#lecturas.length < 10) {
      this.#fase_('sin_calibrar');
      this.#msg('Calibración insuficiente: mantén el teléfono quieto y vuelve a intentarlo.', 'warn');
      return;
    }
    const media = (k) => this.#lecturas.reduce((s, d) => s + d[k], 0) / this.#lecturas.length;
    this.#base = { beta: media('beta'), gamma: media('gamma') };
    this.#angBase = anguloPantalla();
    this.#control = new ControlInclinacion(this.#cfg); this.#filtroListo = false;
    this.#fase_('activo');
    this.#msg('Teléfono calibrado. Inclínalo para mover el chasis.', 'ok');
  }

  #alOrientacion = (e) => {
    if (!Number.isFinite(e.beta) || !Number.isFinite(e.gamma)) return;
    const ahora = performance.now();

    if (this.#fase === 'calibrando') {
      this.#lecturas.push({ beta: e.beta, gamma: e.gamma });
      const p = Math.min(1, (ahora - this.#inicioCal) / this.#cfg.calibracionMs);
      this.emisor.emit('progreso', p);
      if (p >= 1) this.#terminarCalibracion();
      return;
    }
    if (this.#fase !== 'activo') return;

    const angulo = anguloPantalla();
    if (angulo !== this.#angBase) { // al girar la pantalla los ejes cambian: se vuelve a calibrar
      this.#msg('Cambió la orientación de la pantalla: recalibrando.', 'warn');
      this.calibrar();
      return;
    }
    if (!this.#filtroListo) { this.#filtro = { beta: e.beta, gamma: e.gamma }; this.#filtroListo = true; }
    // filtro de paso bajo: suaviza el temblor de la mano
    this.#filtro.beta += this.#cfg.filtro * delta(e.beta, this.#filtro.beta);
    this.#filtro.gamma += this.#cfg.filtro * delta(e.gamma, this.#filtro.gamma);

    const { adelante, lateral } = ejesSegunPantalla(
      delta(this.#filtro.beta, this.#base.beta), delta(this.#filtro.gamma, this.#base.gamma), angulo, this.#cfg);
    const clave = this.#control.evaluar(adelante, lateral);

    if (clave !== this.#claveActual) { // solo se envía al cambiar la orden
      this.#claveActual = clave;
      if (clave) this.#comandos.enviar(clave, 'giro', 'WEB_GIROSCOPIO');
      else this.#comandos.soltar('giro');
    }
    if (ahora - this.#ultimaEmision > 50) { // la pantalla se refresca ~20 veces por segundo
      this.#ultimaEmision = ahora;
      this.emisor.emit('lectura', { adelante, lateral, aceleracion: this.#aceleracion, clave, armado: this.#control.armado });
    }
  };

  #alMovimiento = (e) => {
    const g = e.accelerationIncludingGravity;
    const fuerza = Math.hypot(g?.x ?? 0, g?.y ?? 0, g?.z ?? 0);
    this.#aceleracion = fuerza;
    const ahora = Date.now();
    if (this.#fase !== 'activo' || fuerza <= this.#cfg.umbralSacudida || ahora - this.#ultimaSacudida <= this.#cfg.sacudidaPausaMs) return;

    this.#ultimaSacudida = ahora; // sacudida fuerte: parada de emergencia
    this.#claveActual = null;
    this.#comandos.detener();
    this.#fase_('emergencia');
    this.#msg('Parada de emergencia por sacudida. Pulsa «Reactivar» para continuar.', 'error');
  };
}