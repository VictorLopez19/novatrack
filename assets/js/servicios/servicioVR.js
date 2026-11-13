// Modo VR (realidad mixta): un control virtual flota frente al usuario, que sigue viendo el mundo real
// (WebXR «immersive-ar» con passthrough). Los botones se presionan con la punta del índice y el control se
// toma con una pinza (pulgar + índice) sobre el asa para colocarlo donde se quiera.
// Sin seguimiento de manos (mandos del visor o celular) se apunta con el rayo / se toca la pantalla.
// Reutiliza ServicioComandos: mismas reglas que joystick, botones, voz, gestos y giroscopio.
import { crearEmisor } from '../core/utilidades.js';
import { BOTONES, CUERPO, ASA, DetectorPulsacion, DetectorPinza, cercaDelAsa } from '../dominio/controlVR.js';
import { crearModeloControl } from '../ui/modeloControlVR.js';

const COLOR_WS = { en_linea: '#3ee58a', conectando: '#ffbf3c', desconectado: '#ff6b7a' };
const TEXTO_WS = { en_linea: 'En línea', conectando: 'Conectando', desconectado: 'Sin conexión' };

export class ServicioVR {
  emisor = crearEmisor(); // 'estado' (activo | inactivo)
  #store; #comandos; #cfg;
  #soportado = false; #activo = false; #iniciando = false;
  #T = null; #promesaThree = null; #promesaEscena = null;
  #renderer = null; #escena = null; #camara = null; #modelo = null; #sesion = null; #tmp = null;
  #manos = []; #mandos = []; #fuentes = [null, null];
  #detector = null; #pinzas = []; #pinzaPrevia = [false, false]; #medio = [null, null];
  #agarre = null; #rayoPulsado = [null, null]; #colocado = false;
  #movActual = null; #mensaje = ''; #tDisponible = 0; #aviso = ''; #avisoHasta = 0;

  constructor({ store, comandos, emisor, config }) {
    this.#store = store; this.#comandos = comandos; this.#cfg = config;
    this.#detector = new DetectorPulsacion({ profundidad: config.profundidad });
    this.#pinzas = [0, 1].map(() => new DetectorPinza({ cierra: config.pinzaCierra, abre: config.pinzaAbre }));

    // El estado de cada comando (enviando / aceptado / error) ilumina su botón virtual.
    emisor.on('estado', ({ clave, estado }) => {
      const b = BOTONES.find((x) => x.clave === clave);
      if (b && this.#modelo) this.#modelo.marcar(b.id, estado, performance.now());
    });
    store.on('mensaje', (m) => { this.#mensaje = m?.texto ?? ''; });
  }

  get soportado() { return this.#soportado; }
  get activo() { return this.#activo; }
  #msg(texto, tipo = 'info') { this.#store.set('mensaje', { texto, tipo, id: Date.now() + Math.random() }); }

  /** Comprueba si el navegador permite realidad mixta y, si es así, deja todo precargado. */
  async comprobar() {
    try {
      this.#soportado = Boolean(window.isSecureContext && navigator.xr && await navigator.xr.isSessionSupported('immersive-ar'));
    } catch { this.#soportado = false; }
    // Precarga three.js y el modelo para que la sesión arranque dentro del mismo toque del usuario.
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

    const modelo = await crearModeloControl(T);
    escena.add(modelo.grupo, ...modelo.cursores);
    if (this.#cfg.mostrarManos) escena.add(...modelo.manos);

    for (const i of [0, 1]) {
      const mano = renderer.xr.getHand(i);
      const mando = renderer.xr.getController(i);
      escena.add(mano, mando);
      mando.add(modelo.rayos[i]);
      this.#manos[i] = mano; this.#mandos[i] = mando;

      mando.addEventListener('connected', (e) => {
        this.#fuentes[i] = e.data;
        this.#depurar('entrada', i, e.data.hand ? 'mano' : e.data.targetRayMode, e.data.handedness);
        modelo.rayos[i].visible = !e.data.hand && e.data.targetRayMode === 'tracked-pointer';
      });
      mando.addEventListener('disconnected', () => {
        this.#fuentes[i] = null;
        modelo.rayos[i].visible = false;
        modelo.cursores[i].visible = false;
        this.#alSeleccion(i, false);
        if (this.#agarre?.i === i) this.#agarre = null;
      });
      mando.addEventListener('selectstart', () => this.#alSeleccion(i, true));
      mando.addEventListener('selectend', () => this.#alSeleccion(i, false));
    }

    this.#tmp = {
      a: new T.Vector3(), b: new T.Vector3(), c: new T.Vector3(), cabeza: new T.Vector3(),
      q: new T.Quaternion(), guia: new T.Object3D(), rayo: new T.Raycaster(),
    };
    this.#renderer = renderer; this.#escena = escena; this.#modelo = modelo;
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

      this.#renderer.xr.setReferenceSpaceType('local');
      await this.#renderer.xr.setSession(sesion);
      // En el Quest la imagen va directo al visor; un emulador (Immersive Web Emulator) la muestra en este
      // lienzo, así que mientras dure la sesión se hace visible a pantalla completa.
      this.#renderer.domElement.classList.add('activo');

      this.#colocado = false;
      this.#agarre = null;
      this.#detector.reiniciar();
      this.#renderer.setAnimationLoop(this.#cuadro);
      this.emisor.emit('estado', 'activo');
      this.#msg('Modo VR activo: presiona los botones con el índice y pellizca el asa para mover el control.', 'info');
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
    for (const i of [0, 1]) this.#modelo?.dibujarMano(i, null);
    this.#soltarTodo();
    this.#sesion = null;
    this.#activo = false;
    this.#store.set('modo', 'manual');
    this.emisor.emit('estado', 'inactivo');
    this.#msg('Modo VR desactivado.', 'info');
  };

  /** Suelta cualquier botón presionado y deja el vehículo quieto. */
  #soltarTodo() {
    this.#detector.reiniciar();
    this.#rayoPulsado = [null, null];
    this.#agarre = null;
    this.#movActual = null;
    this.#comandos.soltar('vr');
  }

  // ---------- Acciones de los botones ----------
  #pulsar(b, i = null) {
    const f = i === null ? null : this.#fuentes[i];
    f?.gamepad?.hapticActuators?.[0]?.pulse?.(0.6, 25);

    this.#modelo.pulso(b.id, performance.now());
    if (b.tipo === 'salir') { this.desactivar(); return; }
    if (b.tipo === 'detener') { this.#movActual = null; this.#comandos.detener(); return; }
    if (!this.#comandos.puedeEnviar(b.clave)) {
      this.#modelo.marcar(b.id, 'error', performance.now());
      this.#depurar('pulsar', b.id, 'no existe en el catálogo');
      this.#avisar(`${b.etiqueta}: no existe en el catálogo`);
      return;
    }

    let enviado;
    if (b.tipo === 'mov') { // se mantiene mientras el dedo siga presionando
      enviado = this.#comandos.enviar(b.clave, 'vr', this.#cfg.origen);
      if (enviado) this.#movActual = b.id;
    } else { // funciones de un solo toque: primero se frena lo que se movía
      this.#comandos.soltar('vr');
      this.#movActual = null;
      enviado = this.#comandos.enviar(b.clave, 'btn:vr', this.#cfg.origen);
    }
    this.#depurar('pulsar', b.id, enviado ? 'enviado' : `rechazado: ${this.#mensaje}`);
    if (!enviado) this.#avisar(this.#mensaje || 'No se pudo enviar el comando.');
  }

  /** Muestra un aviso en la pantalla del control durante unos segundos (si no, lo tapa el nombre del botón). */
  #avisar(texto) { this.#aviso = texto; this.#avisoHasta = performance.now() + 2500; }

  #depurar(...datos) { if (this.#cfg.depurar) console.debug('[VR]', ...datos); }

  #soltarBoton(b) {
    this.#depurar('soltar', b.id);
    if (b.tipo === 'mov' && this.#movActual === b.id) {
      this.#movActual = null;
      this.#comandos.soltar('vr');
    }
  }

  // ---------- Rayo (mandos y pantalla táctil) ----------
  #rayoDesde(i) {
    const { a, b, q, rayo } = this.#tmp;
    const mando = this.#mandos[i];
    mando.getWorldPosition(a);
    mando.getWorldQuaternion(q);
    b.set(0, 0, -1).applyQuaternion(q);
    rayo.set(a, b);
    return rayo.intersectObjects(this.#modelo.objetivos, false)[0] ?? null;
  }

  #alSeleccion(i, inicio) {
    const f = this.#fuentes[i];
    if (!this.#activo || (inicio && (!f || f.hand))) return; // con manos se usa el dedo, no el pellizco del sistema

    if (inicio) {
      const hit = this.#rayoDesde(i);
      if (!hit) { this.#depurar('rayo sin objetivo', i); return; }
      if (hit.object === this.#modelo.asa) { this.#agarre = { tipo: 'rayo', i, distancia: hit.distance }; return; }
      const b = hit.object.userData.boton;
      if (b) { this.#rayoPulsado[i] = b; this.#pulsar(b, i); }
      return;
    }

    if (this.#agarre?.tipo === 'rayo' && this.#agarre.i === i) this.#agarre = null;
    const b = this.#rayoPulsado[i];
    if (b) { this.#rayoPulsado[i] = null; this.#soltarBoton(b); }
  }

  // ---------- Colocación ----------
  #colocarInicial(cabeza, orientacion) {
    const { a, guia } = this.#tmp;
    const pantallaTactil = this.#sesion?.interactionMode === 'screen-space'; // celular
    const distancia = pantallaTactil ? this.#cfg.distanciaCelular : this.#cfg.distancia;
    const bajada = pantallaTactil ? this.#cfg.bajadaCelular : this.#cfg.bajada;

    a.set(0, 0, -1).applyQuaternion(orientacion);
    a.y = 0;
    if (a.lengthSq() < 1e-4) a.set(0, 0, -1);
    a.normalize();

    guia.position.copy(cabeza).addScaledVector(a, distancia);
    guia.position.y -= bajada;
    guia.lookAt(cabeza); // la cara del control mira hacia el usuario
    this.#modelo.grupo.position.copy(guia.position);
    this.#modelo.grupo.quaternion.copy(guia.quaternion);
    this.#colocado = true;
  }

  /** Mueve el control para que el asa quede en `punto`, siempre de frente al usuario (suavizado). */
  #moverA(punto, cabeza) {
    const { guia } = this.#tmp;
    const grupo = this.#modelo.grupo;
    guia.position.copy(punto);
    guia.lookAt(cabeza);
    guia.translateY(-ASA.y);
    guia.translateZ(-CUERPO.grosor / 2);
    grupo.position.lerp(guia.position, this.#cfg.suavizado);
    grupo.quaternion.slerp(guia.quaternion, this.#cfg.suavizado);
  }

  // ---------- Bucle de cada cuadro ----------
  #cuadro = (t, frame) => {
    const r = this.#renderer;
    const m = this.#modelo;
    const { b: tmpB, c: tmpC, cabeza } = this.#tmp;
    const pose = frame?.getViewerPose(r.xr.getReferenceSpace());

    if (pose) {
      const p = pose.transform.position;
      const o = pose.transform.orientation;
      cabeza.set(p.x, p.y, p.z);
      if (!this.#colocado) this.#colocarInicial(cabeza, this.#tmp.q.set(o.x, o.y, o.z, o.w));

      const grupo = m.grupo;
      grupo.updateMatrixWorld(true);
      let resaltarAsa = 0.35;
      const puntasMundo = [];

      // 1) Manos: punta del índice (para presionar) y pinza (para tomar el asa)
      for (const i of [0, 1]) {
        const f = this.#fuentes[i];
        const indice = f?.hand ? this.#manos[i].joints?.['index-finger-tip'] : null;
        const pulgar = f?.hand ? this.#manos[i].joints?.['thumb-tip'] : null;
        if (this.#cfg.mostrarManos) m.dibujarMano(i, f?.hand ? this.#manos[i].joints : null);

        if (!indice?.visible) {
          m.cursores[i].visible = false;
          this.#pinzas[i].actualizar(NaN);
          this.#pinzaPrevia[i] = false;
          if (this.#agarre?.tipo === 'mano' && this.#agarre.i === i) this.#agarre = null;
          continue;
        }

        m.cursores[i].visible = true;
        m.cursores[i].position.copy(indice.position);

        const dist = pulgar?.visible ? indice.position.distanceTo(pulgar.position) : NaN;
        const cerrada = this.#pinzas[i].actualizar(dist);
        this.#medio[i] ??= indice.position.clone();
        if (pulgar?.visible) this.#medio[i].copy(indice.position).add(pulgar.position).multiplyScalar(0.5);
        else this.#medio[i].copy(indice.position);

        tmpB.copy(this.#medio[i]);
        grupo.worldToLocal(tmpB);
        const enAsa = cercaDelAsa(tmpB.x, tmpB.y, tmpB.z);
        if (enAsa) resaltarAsa = 0.8;

        if (cerrada && !this.#pinzaPrevia[i] && !this.#agarre && enAsa) this.#agarre = { tipo: 'mano', i };
        if (!cerrada && this.#agarre?.tipo === 'mano' && this.#agarre.i === i) this.#agarre = null;
        this.#pinzaPrevia[i] = cerrada;

        // WebXR entrega el CENTRO de la yema: se resta su radio para pulsar al tocar con la piel, no al hundir el dedo.
        if (this.#agarre?.i !== i) puntasMundo.push({ id: `mano${i}`, p: indice.position, radio: indice.jointRadius ?? 0.008 });
      }

      // Mandos: la punta del mando también presiona los botones al tocarlos (además del rayo + gatillo)
      for (const i of [0, 1]) {
        const f = this.#fuentes[i];
        if (!f || f.hand || f.targetRayMode !== 'tracked-pointer' || !this.#mandos[i].visible) continue;
        if (this.#agarre?.i === i) continue;
        puntasMundo.push({ id: `mando${i}`, p: this.#mandos[i].getWorldPosition(new this.#T.Vector3()), radio: 0.006 });
      }

      // 2) Rayos de los mandos: foco y largo del rayo
      const focoRayo = new Set();
      for (const i of [0, 1]) {
        const f = this.#fuentes[i];
        if (!f || f.hand || !this.#mandos[i].visible) continue;
        const hit = this.#rayoDesde(i);
        m.rayos[i].scale.z = hit ? hit.distance : 1.5;
        if (hit?.object === m.asa) resaltarAsa = 0.8;
        else if (hit?.object.userData.boton) focoRayo.add(hit.object.userData.boton.id);
      }

      // 3) Mover el control si está tomado
      if (this.#agarre) {
        resaltarAsa = 1.2;
        if (this.#agarre.tipo === 'mano') this.#moverA(this.#medio[this.#agarre.i], cabeza);
        else {
          const { a, q } = this.#tmp;
          const mando = this.#mandos[this.#agarre.i];
          mando.getWorldPosition(tmpC);
          mando.getWorldQuaternion(q);
          a.set(0, 0, -1).applyQuaternion(q);
          this.#moverA(tmpC.addScaledVector(a, this.#agarre.distancia), cabeza);
        }
        grupo.updateMatrixWorld(true);
      }
      m.resaltarAsa(resaltarAsa);

      // 4) Pulsaciones con el dedo (coordenadas locales, z medida desde la cara)
      const puntas = puntasMundo.map(({ id, p: pm, radio }) => {
        tmpB.copy(pm);
        grupo.worldToLocal(tmpB);
        return { id, x: tmpB.x, y: tmpB.y, z: tmpB.z - CUERPO.grosor / 2 - radio };
      });
      const res = this.#detector.actualizar(puntas);
      for (const b of res.soltar) this.#soltarBoton(b);
      for (const b of res.pulsar) this.#pulsar(b);

      for (const b of BOTONES) m.hundir(b.id, res.hundimiento.get(b.id) ?? 0);
      for (const b of this.#rayoPulsado) if (b) m.hundir(b.id, 0.008);
      const foco = new Set([...res.encima, ...focoRayo]);
      m.enfocar(foco);

      // 5) Pantalla: lo que se apunta, lo que se mueve o el último mensaje
      const enFoco = BOTONES.find((b) => foco.has(b.id));
      const moviendo = BOTONES.find((b) => b.id === this.#movActual);
      const hayAviso = t < this.#avisoHasta;
      m.escribirPantalla({
        linea: hayAviso ? this.#aviso
          : this.#agarre ? 'Moviendo el control…' : (enFoco?.etiqueta ?? moviendo?.etiqueta ?? (this.#mensaje || 'Listo')),
        tono: hayAviso ? '#ff6b7a' : moviendo && !enFoco ? '#ffbf3c' : '#eaf2ff',
        icono: hayAviso ? 'bi-exclamation-triangle-fill' : this.#agarre ? 'bi-arrows-move' : (enFoco ?? moviendo)?.icono ?? null,
        conexion: TEXTO_WS[this.#store.get('ws')] ?? '',
        punto: COLOR_WS[this.#store.get('ws')] ?? '#ffbf3c',
      });

      // Franja de luz: naranja parpadeando si se mueve, azul al mover el control, si no el color de la conexión
      const ws = { en_linea: 0x3ee58a, conectando: 0xffbf3c }[this.#store.get('ws')] ?? 0xff6b7a;
      if (moviendo) m.estadoLuz(0xffb020, true);
      else if (this.#agarre) m.estadoLuz(0x2f8bff, true);
      else m.estadoLuz(ws, false);

      // 6) Disponibilidad de cada botón según el catálogo (no hace falta cada cuadro)
      if (t - this.#tDisponible > 500) {
        this.#tDisponible = t;
        const libre = this.#store.get('demo').estado === 'libre';
        for (const b of BOTONES) {
          const ok = b.tipo === 'salir' || b.tipo === 'detener' || (libre && this.#comandos.puedeEnviar(b.clave));
          m.disponible(b.id, ok);
        }
      }
    }

    m.actualizarBotones(t);
    r.render(this.#escena, this.#camara);
  };
}
