// Modo gestos: cámara del dispositivo + MediaPipe Hand Landmarker. El video se procesa en el
// navegador y no se envía a ningún servidor. Reutiliza ServicioComandos (mismas reglas que el joystick).
import { crearEmisor } from '../core/utilidades.js';
import { clasificarMano, FiltroGestos } from '../dominio/gestos.js';

export const gestosSoportados = Boolean(navigator.mediaDevices?.getUserMedia);

const ERRORES_CAMARA = {
  NotAllowedError: 'Permiso de cámara denegado.',
  NotFoundError: 'No se encontró una cámara.',
  NotReadableError: 'La cámara está siendo usada por otra aplicación.',
};

async function cargarMediaPipe(cfg) {
  const { FilesetResolver, HandLandmarker } = await import(cfg.libUrl);
  const vision = await FilesetResolver.forVisionTasks(cfg.wasmUrl);
  const opciones = (delegate) => ({ baseOptions: { modelAssetPath: cfg.modeloUrl, delegate }, runningMode: 'VIDEO', numHands: 1 });
  try { return await HandLandmarker.createFromOptions(vision, opciones('GPU')); }
  catch { return HandLandmarker.createFromOptions(vision, opciones('CPU')); } // equipos sin GPU compatible
}

export class ServicioGestos {
  emisor = crearEmisor(); // 'estado' (cargando|activo|inactivo), 'lectura', 'puntos'
  #store; #comandos; #haySesion; #alFaltarSesion; #cfg; #cargarModelo;
  #activo = false; #gen = 0; #modelo = null; #stream = null; #video = null; #filtro = null;
  #raf = 0; #ultimoCuadro = 0; #ultimoT = -1;

  constructor({ store, comandos, haySesion, alFaltarSesion, config, cargarModelo = cargarMediaPipe }) {
    this.#store = store; this.#comandos = comandos; this.#haySesion = haySesion;
    this.#alFaltarSesion = alFaltarSesion; this.#cfg = config; this.#cargarModelo = cargarModelo;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.desactivar('La pestaña pasó a segundo plano: modo gestos desactivado.', 'warn');
    });
  }

  get activo() { return this.#activo; }
  #msg(texto, tipo = 'info') { this.#store.set('mensaje', { texto, tipo, id: Date.now() + Math.random() }); }

  async activar(video) {
    if (this.#activo) return true;
    if (!gestosSoportados) { this.#msg('Tu navegador no permite usar la cámara.', 'error'); return false; }
    if (this.#store.get('modo') !== 'manual') { this.#msg('Sal del modo actual antes de activar los gestos.', 'warn'); return false; }
    if (!this.#store.get('vehiculoId')) { this.#msg('Selecciona un vehículo en Ajustes.', 'error'); return false; }
    if (this.#store.get('demo').estado !== 'libre') { this.#msg('Hay una DEMO o una orden de IA en curso. Espera a que termine.', 'warn'); return false; }
    if (!this.#haySesion()) { this.#alFaltarSesion(); return false; }

    const gen = ++this.#gen;
    const cancelado = () => !this.#activo || gen !== this.#gen;
    this.#activo = true;
    this.#store.set('modo', 'gesto'); // deshabilita joysticks, botones, DEMO y voz
    this.emisor.emit('estado', 'cargando');

    try {
      this.#modelo ??= await this.#cargarModelo(this.#cfg);
    } catch {
      this.desactivar('No se pudo cargar el detector de manos (revisa la conexión y la política CSP).', 'error');
      return false;
    }
    if (cancelado()) return false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } }, audio: false });
      if (cancelado()) { stream.getTracks().forEach((t) => t.stop()); return false; }
      this.#stream = stream; this.#video = video;
      video.srcObject = stream;
      await video.play();
    } catch (e) {
      if (!cancelado()) this.desactivar(ERRORES_CAMARA[e?.name] ?? 'No se pudo iniciar la cámara.', 'error');
      return false;
    }
    if (cancelado()) return false;

    this.#filtro = new FiltroGestos(this.#cfg);
    this.#ultimoT = -1;
    this.emisor.emit('estado', 'activo');
    this.#msg('Modo gestos activo. Muestra la palma abierta para empezar.', 'info');
    this.#raf = requestAnimationFrame(this.#bucle);
    return true;
  }

  desactivar(motivo = 'Modo gestos desactivado.', tipo = 'info') {
    if (!this.#activo) return;
    this.#activo = false; this.#gen += 1;
    cancelAnimationFrame(this.#raf);
    this.#stream?.getTracks().forEach((t) => t.stop()); this.#stream = null;
    if (this.#video) { this.#video.srcObject = null; this.#video = null; }
    this.#store.set('modo', 'manual');
    this.emisor.emit('estado', 'inactivo');
    this.emisor.emit('puntos', null);
    this.#comandos.soltar('gesto'); // si se movía por gestos, se detiene
    this.#msg(motivo, tipo);
  }

  #bucle = (t) => {
    if (!this.#activo) return;
    this.#raf = requestAnimationFrame(this.#bucle);
    const v = this.#video;
    if (!v || t - this.#ultimoCuadro < this.#cfg.cuadroMs || v.readyState < 2 || v.currentTime === this.#ultimoT) return;
    this.#ultimoCuadro = t; this.#ultimoT = v.currentTime;

    let res;
    try { res = this.#modelo.detectForVideo(v, performance.now()); } catch { return; }
    const mano = res?.landmarks?.[0] ?? null;
    const clave = mano ? clasificarMano(mano, this.#cfg) : null;
    const accion = this.#filtro.actualizar(clave, performance.now());
    this.emisor.emit('puntos', mano);
    this.emisor.emit('lectura', { clave, mano: Boolean(mano), armado: this.#filtro.armado, actual: this.#filtro.actual });
    if (accion) this.#aplicar(accion.clave);
  };

  #aplicar(clave) {
    if (clave === 'DETENER') { this.#comandos.detener(); return; }
    if (this.#cfg.unicos.includes(clave)) { // acciones de un solo disparo: primero se frena lo que se movía
      this.#comandos.soltar('gesto');
      this.#comandos.enviar(clave, 'btn:gesto', 'WEB_GESTO');
      return;
    }
    this.#comandos.enviar(clave, 'gesto', 'WEB_GESTO'); // movimiento sostenido, como un joystick
  }

}
