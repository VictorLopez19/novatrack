// Modo VR (realidad mixta): el usuario queda sentado dentro de una cabina de excavadora virtual y sigue
// viendo el mundo real por los cristales (WebXR «immersive-ar» con passthrough). Se maneja con los mandos
// de la cabina:
//   · Palanca izquierda = chasis; palanca derecha = brazo y garra. Se toman con una pinza (pulgar + índice)
//     o con el gatillo del mando y se inclinan; al soltarlas regresan al centro y el vehículo se detiene.
//   · Panel de botones en el tablero: funciones, DETENER, recentrar y salir (se presionan con el índice,
//     tocándolos con el mando o con rayo + gatillo).
// Reutiliza ServicioComandos: mismas reglas que joystick, botones, voz, gestos y giroscopio.
import { crearEmisor, formatoMovimiento } from '../core/utilidades.js';
import {
  BOTONES, CUERPO, PALANCA, MAPA_PALANCAS,
  DetectorPulsacion, DetectorPinza, DireccionPalanca, inclinacionDesdeMano,
} from '../dominio/controlVR.js';
import { crearPanelBotones } from '../ui/modeloControlVR.js';
import { crearCabina } from '../ui/modeloCabinaVR.js';

const COLOR_WS = { en_linea: '#3ee58a', conectando: '#ffbf3c', desconectado: '#ff6b7a' };
const TEXTO_WS = { en_linea: 'En línea', conectando: 'Conectando', desconectado: 'Sin conexión' };
const ICONO_CLAVE = {
  AVANZAR: 'bi-arrow-up', RETROCEDER: 'bi-arrow-down', IZQUIERDA: 'bi-arrow-left', DERECHA: 'bi-arrow-right',
  BRAZO_SUBIR: 'bi-arrow-bar-up', BRAZO_BAJAR: 'bi-arrow-bar-down',
  GARRA_IZQUIERDA: 'bi-arrow-counterclockwise', GARRA_DERECHA: 'bi-arrow-clockwise',
};
const LADOS = ['izq', 'der'];

export class ServicioVR {
  emisor = crearEmisor(); // 'estado' (activo | inactivo)
  #store; #comandos; #cfg;
  #soportado = false; #activo = false; #iniciando = false;
  #T = null; #promesaThree = null; #promesaEscena = null;
  #renderer = null; #escena = null; #camara = null; #panel = null; #cabina = null; #sesion = null; #tmp = null;
  #manos = []; #mandos = []; #fuentes = [null, null];
  #detector = null; #pinzas = []; #pinzaPrevia = [false, false]; #medio = [null, null];
  #rayoPulsado = [null, null]; #colocado = false; #conPiso = false; #orientacion = null;
  #agarres = { izq: null, der: null };      // quién toma cada palanca: { i, tipo: 'mano' | 'mando' }
  #direcciones = { izq: null, der: null };  // DireccionPalanca por lado
  #claves = { izq: null, der: null };       // movimiento enviado por cada palanca
  #rechazada = { izq: false, der: false };  // el último envío de esa palanca fue rechazado
  #bloqueo = { izq: false, der: false };    // tras DETENER hay que regresar la palanca al centro
  #mensaje = ''; #tDisponible = 0; #tPrevio = 0; #aviso = ''; #avisoHasta = 0;

  constructor({ store, comandos, emisor, config }) {
    this.#store = store; this.#comandos = comandos; this.#cfg = config;
    this.#detector = new DetectorPulsacion({ profundidad: config.profundidad });
    this.#pinzas = [0, 1].map(() => new DetectorPinza({ cierra: config.pinzaCierra, abre: config.pinzaAbre }));
    for (const lado of LADOS) this.#direcciones[lado] = new DireccionPalanca();

    // Estado de cada comando: ilumina su botón y, si el servidor aceptó Luces o Encendido, lo refleja en la cabina.
    emisor.on('estado', ({ clave, estado }) => {
      const b = BOTONES.find((x) => x.clave === clave);
      if (b && this.#panel) this.#panel.marcar(b.id, estado, performance.now());
      if (this.#activo && estado === 'aceptado') {
        if (clave === 'LUCES') this.#cabina?.alternarLuces();
        if (clave === 'ENCENDIDO') this.#cabina?.alternarEncendido();
      }
    });
    store.on('mensaje', (m) => { this.#mensaje = m?.texto ?? ''; });
  }

  get soportado() { return this.#soportado; }
  get activo() { return this.#activo; }
  #msg(texto, tipo = 'info') { this.#store.set('mensaje', { texto, tipo, id: Date.now() + Math.random() }); }
  #depurar(...datos) { if (this.#cfg.depurar) console.debug('[VR]', ...datos); }
  /** Aviso en la pantalla del panel durante unos segundos. */
  #avisar(texto) { this.#aviso = texto; this.#avisoHasta = performance.now() + 2500; }

  /** Comprueba si el navegador permite realidad mixta y, si es así, deja todo precargado. */
  async comprobar() {
    try {
      this.#soportado = Boolean(window.isSecureContext && navigator.xr && await navigator.xr.isSessionSupported('immersive-ar'));
    } catch { this.#soportado = false; }
    // Precarga three.js y el panel para que la sesión arranque dentro del mismo toque del usuario.
    if (this.#soportado) this.#prepararEscena().catch(() => { /* se reintenta al activar */ });
    return this.#soportado;
  }

  #cargarThree() {
    this.#promesaThree ??= import(this.#cfg.threeUrl)
      .then((m) => { this.#T = m; return m; })
      .catch((e) => { this.#promesaThree = null; throw e; });
    return this.#promesaThree;
  }

  #prepararEscena() {
    this.#promesaEscena ??= this.#crearEscena().catch((e) => { this.#promesaEscena = null; throw e; });
    return this.#promesaEscena;
  }

  async #crearEscena() {
    const T = await this.#cargarThree();

    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0); // fondo transparente: se ve el mundo real
    renderer.xr.enabled = true;
    renderer.domElement.className = 'lienzo-vr';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    document.body.append(renderer.domElement);

    const escena = new T.Scene();
    escena.add(new T.HemisphereLight(0xdfe9ff, 0x0a1d45, 1.6));
    const luz = new T.DirectionalLight(0xffffff, 1.4);
    luz.position.set(0.4, 1, 0.6);
    escena.add(luz);

    const panel = await crearPanelBotones(T);
    escena.add(...panel.cursores);
    if (this.#cfg.mostrarManos) escena.add(...panel.manos);

    for (const i of [0, 1]) {
      const mano = renderer.xr.getHand(i);
      const mando = renderer.xr.getController(i);
      escena.add(mano, mando);
      mando.add(panel.rayos[i]);
      this.#manos[i] = mano; this.#mandos[i] = mando;

      mando.addEventListener('connected', (e) => {
        this.#fuentes[i] = e.data;
        panel.rayos[i].visible = !e.data.hand && e.data.targetRayMode === 'tracked-pointer';
        this.#depurar('entrada', i, e.data.hand ? 'mano' : e.data.targetRayMode, e.data.handedness);
      });
      mando.addEventListener('disconnected', () => {
        this.#fuentes[i] = null;
        panel.rayos[i].visible = false;
        panel.cursores[i].visible = false;
        this.#alSeleccion(i, false);
        for (const lado of LADOS) if (this.#agarres[lado]?.i === i) this.#soltarPalanca(lado);
      });
      mando.addEventListener('selectstart', () => this.#alSeleccion(i, true));
      mando.addEventListener('selectend', () => this.#alSeleccion(i, false));
      mando.addEventListener('squeezestart', () => this.#tomarConMando(i));
      mando.addEventListener('squeezeend', () => this.#soltarDeMando(i));
    }

    this.#tmp = {
      a: new T.Vector3(), b: new T.Vector3(), c: new T.Vector3(), cabeza: new T.Vector3(), puno: new T.Vector3(),
      q: new T.Quaternion(), orientacion: new T.Quaternion(), rayo: new T.Raycaster(),
    };
    this.#renderer = renderer; this.#escena = escena; this.#panel = panel;
    this.#camara = new T.PerspectiveCamera(70, 1, 0.01, 20);
  }

  async activar() {
    if (this.#activo || this.#iniciando) return this.#activo;
    if (!this.#soportado) { this.#msg('Tu navegador no permite realidad mixta (WebXR).', 'error'); return false; }
    if (this.#store.get('modo') !== 'manual') { this.#msg('Sal del modo actual antes de entrar a VR.', 'warn'); return false; }
    if (!this.#store.get('vehiculoId')) { this.#msg('Selecciona un vehículo en Ajustes.', 'error'); return false; }
    if (this.#store.get('demo').estado !== 'libre') { this.#msg('Hay una DEMO o una orden de IA en curso. Espera a que termine.', 'warn'); return false; }

    this.#iniciando = true;
    let sesion = null;
    try {
      await this.#prepararEscena();
      sesion = await navigator.xr.requestSession('immersive-ar', { optionalFeatures: ['hand-tracking', 'local-floor'] });

      this.#sesion = sesion;
      this.#activo = true;
      this.#store.set('modo', 'vr'); // deshabilita joysticks, botones, DEMO, voz, gestos y giroscopio
      sesion.addEventListener('end', this.#alTerminar);
      sesion.addEventListener('visibilitychange', () => {
        if (sesion.visibilityState !== 'visible') this.#soltarTodo(); // menú del sistema u otra app encima
      });

      // Con «local-floor» se conoce la altura real de los ojos y la cabina queda apoyada en el piso real.
      this.#conPiso = Boolean(sesion.enabledFeatures?.includes('local-floor'));
      this.#renderer.xr.setReferenceSpaceType(this.#conPiso ? 'local-floor' : 'local');
      await this.#renderer.xr.setSession(sesion);
      // En el Quest la imagen va directo al visor; un emulador (Immersive Web Emulator) la muestra en este
      // lienzo, así que mientras dure la sesión se hace visible a pantalla completa.
      this.#renderer.domElement.classList.add('activo');

      this.#colocado = false;
      this.#soltarTodo();
      this.#tPrevio = 0;
      this.#renderer.setAnimationLoop(this.#cuadro);
      this.emisor.emit('estado', 'activo');
      this.#msg('Modo VR activo: toma las palancas con un pellizco y presiona los botones del tablero con el índice.', 'info');
      return true;
    } catch (e) {
      if (sesion) { try { await sesion.end(); } catch { /* ya terminó */ } }
      else this.#msg(e?.name === 'NotSupportedError'
        ? 'Este dispositivo no permite realidad mixta.'
        : 'No se pudo iniciar el modo VR (revisa la conexión y los permisos).', 'error');
      return false;
    } finally {
      this.#iniciando = false;
    }
  }

  desactivar() {
    if (this.#sesion) { this.#sesion.end().catch(() => this.#alTerminar()); return; }
    this.#alTerminar();
  }

  #alTerminar = () => {
    if (!this.#activo) return;
    this.#renderer?.setAnimationLoop(null);
    this.#renderer?.domElement.classList.remove('activo');
    for (const i of [0, 1]) this.#panel?.dibujarMano(i, null);
    this.#soltarTodo();
    this.#quitarCabina();
    this.#sesion = null;
    this.#activo = false;
    this.#store.set('modo', 'manual');
    this.emisor.emit('estado', 'inactivo');
    this.#msg('Modo VR desactivado.', 'info');
  };

  /** Suelta botones y palancas y deja el vehículo quieto. */
  #soltarTodo() {
    this.#detector.reiniciar();
    this.#rayoPulsado = [null, null];
    for (const lado of LADOS) this.#soltarPalanca(lado);
    this.#bloqueo = { izq: false, der: false };
  }

  // ---------- Palancas ----------
  #tomarPalanca(lado, i, tipo) {
    if (this.#agarres[lado]) return;
    this.#agarres[lado] = { i, tipo };
    this.#direcciones[lado].reiniciar();
    this.#fuentes[i]?.gamepad?.hapticActuators?.[0]?.pulse?.(0.4, 20);
    this.#depurar('palanca tomada', lado, tipo);
  }

  #soltarPalanca(lado) {
    if (this.#agarres[lado]) this.#depurar('palanca soltada', lado);
    this.#agarres[lado] = null;
    this.#direcciones[lado]?.reiniciar();
    this.#cabina?.inclinar(lado, 0, 0, false);
    this.#aplicarDireccion(lado, null);
  }

  /** Envía el movimiento de una palanca (solo cuando cambia la dirección). */
  #aplicarDireccion(lado, dir) {
    if (!dir) this.#bloqueo[lado] = false;       // regresó al centro: se puede volver a mover
    if (this.#bloqueo[lado]) return;
    const clave = dir ? MAPA_PALANCAS[lado][dir] : null;
    if (clave === this.#claves[lado]) return;

    const duenio = `vr:${lado}`;
    this.#claves[lado] = clave;
    this.#rechazada[lado] = false;
    if (!clave) { this.#comandos.soltar(duenio); return; }

    if (!this.#comandos.puedeEnviar(clave)) {
      this.#rechazada[lado] = true;
      this.#avisar(`${formatoMovimiento(clave)}: no existe en el catálogo`);
      return;
    }
    const ok = this.#comandos.enviar(clave, duenio, this.#cfg.origen);
    this.#depurar('palanca', lado, clave, ok ? 'enviado' : `rechazado: ${this.#mensaje}`);
    if (!ok) { this.#rechazada[lado] = true; this.#avisar(this.#mensaje || 'No se pudo enviar el movimiento.'); }
  }

  /** Posición (en el mundo) del puño de una palanca. */
  #puno(lado, destino) {
    return this.#cabina.palancas[lado].pivote.localToWorld(destino.set(0, PALANCA.largo, 0));
  }

  /** Palanca libre más cercana al punto, si está a su alcance. */
  #palancaCerca(punto, alcance = PALANCA.alcance) {
    if (!this.#cabina) return null;
    let mejor = null; let dMejor = alcance;
    for (const lado of LADOS) {
      const d = this.#puno(lado, this.#tmp.puno).distanceTo(punto);
      if (d < dMejor) { mejor = lado; dMejor = d; }
    }
    return mejor;
  }

  #tomarConMando(i) {
    const f = this.#fuentes[i];
    if (!this.#activo || !f || f.hand) return false;
    const lado = this.#palancaCerca(this.#mandos[i].getWorldPosition(this.#tmp.c), PALANCA.alcance * 1.5);
    if (lado && !this.#agarres[lado]) { this.#tomarPalanca(lado, i, 'mando'); return true; }
    return false;
  }

  #soltarDeMando(i) {
    for (const lado of LADOS) if (this.#agarres[lado]?.tipo === 'mando' && this.#agarres[lado].i === i) this.#soltarPalanca(lado);
  }

  // ---------- Botones del panel ----------
  #pulsar(b, i = null) {
    const f = i === null ? null : this.#fuentes[i];
    f?.gamepad?.hapticActuators?.[0]?.pulse?.(0.6, 25);
    this.#panel.pulso(b.id, performance.now());

    if (b.tipo === 'salir') { this.desactivar(); return; }
    if (b.tipo === 'recentrar') { this.#construirCabina(this.#tmp.cabeza, this.#tmp.orientacion); this.#avisar('Cabina centrada'); return; }
    if (b.tipo === 'detener') {
      // Prioridad absoluta; las palancas tomadas deben regresar al centro antes de volver a mover.
      for (const lado of LADOS) { this.#claves[lado] = null; this.#bloqueo[lado] = Boolean(this.#agarres[lado]); }
      this.#comandos.detener();
      this.#depurar('pulsar', b.id);
      return;
    }
    if (!this.#comandos.puedeEnviar(b.clave)) {
      this.#panel.marcar(b.id, 'error', performance.now());
      this.#avisar(`${b.etiqueta}: no existe en el catálogo`);
      return;
    }
    // Funciones de un solo toque: primero se frena lo que se movía
    for (const lado of LADOS) {
      if (this.#claves[lado]) { this.#comandos.soltar(`vr:${lado}`); this.#claves[lado] = null; this.#bloqueo[lado] = Boolean(this.#agarres[lado]); }
    }
    const ok = this.#comandos.enviar(b.clave, 'btn:vr', this.#cfg.origen);
    this.#depurar('pulsar', b.id, ok ? 'enviado' : `rechazado: ${this.#mensaje}`);
    if (!ok) this.#avisar(this.#mensaje || 'No se pudo enviar el comando.');
  }

  #soltarBoton(b) { this.#depurar('soltar', b.id); }

  // ---------- Rayo (mandos y pantalla táctil) ----------
  #rayoDesde(i) {
    const { a, b, q, rayo } = this.#tmp;
    const mando = this.#mandos[i];
    mando.getWorldPosition(a);
    mando.getWorldQuaternion(q);
    b.set(0, 0, -1).applyQuaternion(q);
    rayo.set(a, b);
    return rayo.intersectObjects(this.#panel.objetivos, false)[0] ?? null;
  }

  #alSeleccion(i, inicio) {
    const f = this.#fuentes[i];
    if (!this.#activo || (inicio && (!f || f.hand))) return; // con manos se usa el dedo, no el pellizco del sistema

    if (inicio) {
      if (this.#tomarConMando(i)) return;               // gatillo junto al puño: toma la palanca
      const hit = this.#rayoDesde(i);
      if (!hit) { this.#depurar('rayo sin objetivo', i); return; }
      const b = hit.object.userData.boton;
      if (b) { this.#rayoPulsado[i] = b; this.#pulsar(b, i); }
      return;
    }

    this.#soltarDeMando(i);
    const b = this.#rayoPulsado[i];
    if (b) { this.#rayoPulsado[i] = null; this.#soltarBoton(b); }
  }

  // ---------- Cabina ----------
  /** Crea la cabina alrededor del usuario, de frente a donde mira (solo gira en el eje vertical). */
  #construirCabina(cabeza, orientacion) {
    for (const lado of LADOS) this.#soltarPalanca(lado);
    this.#quitarCabina();
    const T = this.#T;
    const altura = this.#conPiso ? Math.min(1.9, Math.max(0.9, cabeza.y)) : this.#cfg.alturaOjos;
    const cabina = crearCabina(T, { altura, pluma: this.#cfg.pluma });

    const adelante = new T.Vector3(0, 0, -1).applyQuaternion(orientacion);
    adelante.y = 0;
    if (adelante.lengthSq() < 1e-4) adelante.set(0, 0, -1);
    adelante.normalize();
    cabina.grupo.position.copy(cabeza);
    cabina.grupo.rotation.y = Math.atan2(-adelante.x, -adelante.z);
    cabina.anclaPanel.add(this.#panel.grupo); // el panel de botones queda montado en el tablero

    this.#escena.add(cabina.grupo);
    this.#cabina = cabina;
    this.#depurar('cabina', `altura de los ojos ${altura.toFixed(2)} m`, this.#conPiso ? '(piso real)' : '(supuesta, sentado)');
  }

  #quitarCabina() {
    if (!this.#cabina) return;
    this.#cabina.anclaPanel.remove(this.#panel.grupo); // el panel se reutiliza: no se libera
    this.#escena.remove(this.#cabina.grupo);
    this.#cabina.liberar();
    this.#cabina = null;
  }

  // ---------- Bucle de cada cuadro ----------
  #cuadro = (t, frame) => {
    const r = this.#renderer;
    const panel = this.#panel;
    const { b: tmpB, cabeza } = this.#tmp;
    const dt = this.#tPrevio ? (t - this.#tPrevio) / 1000 : 0;
    this.#tPrevio = t;
    const pose = frame?.getViewerPose(r.xr.getReferenceSpace());

    if (pose) {
      const p = pose.transform.position;
      const o = pose.transform.orientation;
      cabeza.set(p.x, p.y, p.z);
      this.#tmp.orientacion.set(o.x, o.y, o.z, o.w);
      if (!this.#colocado) { this.#construirCabina(cabeza, this.#tmp.orientacion); this.#colocado = true; }

      const cab = this.#cabina;
      cab.grupo.updateMatrixWorld(true);
      const resalte = { izq: 0, der: 0 };
      const puntasMundo = [];
      const manoDe = [null, null]; // punto de agarre de cada entrada (mano: pinza; mando: su posición)

      // 1) Manos: punta del índice (botones) y pinza (palancas)
      for (const i of [0, 1]) {
        const f = this.#fuentes[i];
        if (this.#cfg.mostrarManos) panel.dibujarMano(i, f?.hand ? this.#manos[i].joints : null);
        const indice = f?.hand ? this.#manos[i].joints?.['index-finger-tip'] : null;
        const pulgar = f?.hand ? this.#manos[i].joints?.['thumb-tip'] : null;

        if (!indice?.visible) {
          panel.cursores[i].visible = false;
          this.#pinzas[i].actualizar(NaN);
          this.#pinzaPrevia[i] = false;
          for (const lado of LADOS) if (this.#agarres[lado]?.tipo === 'mano' && this.#agarres[lado].i === i) this.#soltarPalanca(lado);
          continue;
        }

        panel.cursores[i].visible = true;
        panel.cursores[i].position.copy(indice.position);
        const dist = pulgar?.visible ? indice.position.distanceTo(pulgar.position) : NaN;
        const cerrada = this.#pinzas[i].actualizar(dist);
        this.#medio[i] ??= indice.position.clone();
        if (pulgar?.visible) this.#medio[i].copy(indice.position).add(pulgar.position).multiplyScalar(0.5);
        else this.#medio[i].copy(indice.position);
        manoDe[i] = this.#medio[i];

        const cerca = this.#palancaCerca(this.#medio[i]);
        if (cerca) resalte[cerca] = 1;
        if (cerrada && !this.#pinzaPrevia[i] && cerca && !this.#agarres[cerca]) this.#tomarPalanca(cerca, i, 'mano');
        if (!cerrada) for (const lado of LADOS) if (this.#agarres[lado]?.tipo === 'mano' && this.#agarres[lado].i === i) this.#soltarPalanca(lado);
        this.#pinzaPrevia[i] = cerrada;

        const sostiene = LADOS.some((lado) => this.#agarres[lado]?.i === i);
        // WebXR entrega el CENTRO de la yema: se resta su radio para pulsar al tocar con la piel.
        if (!sostiene) puntasMundo.push({ id: `mano${i}`, p: indice.position, radio: indice.jointRadius ?? 0.008 });
      }

      // 2) Mandos: tocar botones con la punta, acercarse a las palancas y rayo hacia el panel
      const focoRayo = new Set();
      for (const i of [0, 1]) {
        const f = this.#fuentes[i];
        if (!f || f.hand || !this.#mandos[i].visible) continue;
        const pos = this.#mandos[i].getWorldPosition(new this.#T.Vector3());
        manoDe[i] = pos;
        const cerca = this.#palancaCerca(pos, PALANCA.alcance * 1.5);
        if (cerca) resalte[cerca] = 1;
        const sostiene = LADOS.some((lado) => this.#agarres[lado]?.i === i);
        if (f.targetRayMode === 'tracked-pointer' && !sostiene) puntasMundo.push({ id: `mando${i}`, p: pos, radio: 0.006 });
        const hit = this.#rayoDesde(i);
        panel.rayos[i].visible = f.targetRayMode === 'tracked-pointer' && !sostiene && !cerca;
        panel.rayos[i].scale.z = hit ? hit.distance : 1.5;
        if (hit?.object.userData.boton) focoRayo.add(hit.object.userData.boton.id);
      }

      // 3) Palancas tomadas: la inclinación sigue a la mano y se envía la dirección
      for (const lado of LADOS) {
        cab.resaltar(lado, resalte[lado] * 0.6);
        const ag = this.#agarres[lado];
        const punto = ag ? manoDe[ag.i] : null;
        if (!punto) { if (ag) this.#soltarPalanca(lado); continue; }
        tmpB.copy(punto);
        cab.grupo.worldToLocal(tmpB);
        const pv = cab.palancas[lado].pivote.position;
        const { rx, rz } = inclinacionDesdeMano(tmpB.x - pv.x, tmpB.y - pv.y, tmpB.z - pv.z, PALANCA.maxAngulo);
        cab.inclinar(lado, rx, rz, true);
        this.#aplicarDireccion(lado, this.#direcciones[lado].actualizar(rx, rz));
      }

      // 4) Botones del panel (coordenadas locales del panel, z medida desde su cara)
      panel.grupo.updateMatrixWorld(true);
      const puntas = puntasMundo.map(({ id, p: pm, radio }) => {
        tmpB.copy(pm);
        panel.grupo.worldToLocal(tmpB);
        return { id, x: tmpB.x, y: tmpB.y, z: tmpB.z - CUERPO.grosor / 2 - radio };
      });
      const res = this.#detector.actualizar(puntas);
      for (const b of res.soltar) this.#soltarBoton(b);
      for (const b of res.pulsar) this.#pulsar(b);
      for (const b of BOTONES) panel.hundir(b.id, res.hundimiento.get(b.id) ?? 0);
      for (const b of this.#rayoPulsado) if (b) panel.hundir(b.id, 0.008);
      const foco = new Set([...res.encima, ...focoRayo]);
      panel.enfocar(foco);

      // 5) Pantalla: aviso, movimiento de una palanca, botón apuntado o el último mensaje
      const enCurso = LADOS.map((l) => (!this.#rechazada[l] ? this.#claves[l] : null)).find(Boolean) ?? null;
      const enFoco = BOTONES.find((b) => foco.has(b.id));
      const hayAviso = t < this.#avisoHasta;
      let linea; let icono = null; let tono = '#eaf2ff';
      if (hayAviso) { linea = this.#aviso; icono = 'bi-exclamation-triangle-fill'; tono = '#ff6b7a'; }
      else if (enCurso) { linea = formatoMovimiento(enCurso); icono = ICONO_CLAVE[enCurso]; tono = '#ffbf3c'; }
      else if (enFoco) { linea = enFoco.etiqueta; icono = enFoco.icono; }
      else if (LADOS.some((l) => this.#agarres[l])) { linea = 'Palanca tomada'; icono = 'bi-joystick'; }
      else linea = this.#mensaje || 'Listo';
      panel.escribirPantalla({
        linea, icono, tono,
        punto: COLOR_WS[this.#store.get('ws')] ?? '#ffbf3c',
        conexion: TEXTO_WS[this.#store.get('ws')] ?? '',
      });

      // 6) Disponibilidad de cada botón según el catálogo (no hace falta cada cuadro)
      if (t - this.#tDisponible > 500) {
        this.#tDisponible = t;
        const libre = this.#store.get('demo').estado === 'libre';
        for (const b of BOTONES) {
          const ok = b.tipo !== 'unico' || (libre && this.#comandos.puedeEnviar(b.clave));
          panel.disponible(b.id, ok);
        }
      }

      cab.animar(t, dt, enCurso);
    }

    panel.actualizarBotones(t);
    r.render(this.#escena, this.#camara);
  };
}
