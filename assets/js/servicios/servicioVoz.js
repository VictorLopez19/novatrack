// Modo voz: reconoce con el navegador (Web Speech API), ejecuta los comandos directos
// y envía el resto del texto al endpoint de IA del backend. Mientras está activo,
// los otros modos quedan deshabilitados.
import { crearEmisor, textoSeguro } from '../core/utilidades.js';
import { interpretarDirecto, esUrgente } from '../dominio/voz.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const vozSoportada = Boolean(SR);

const FATALES = {
  'not-allowed': 'Permiso de micrófono denegado.',
  'service-not-allowed': 'El navegador no permite el reconocimiento de voz.',
  'audio-capture': 'No se encontró un micrófono.',
  'language-not-supported': 'Idioma de voz no soportado.',
};

export class ServicioVoz {
  emisor = crearEmisor(); // 'estado', 'parcial', 'resultado'
  #api; #store; #comandos; #demo; #haySesion; #alFaltarSesion; #cfg;
  #rec = null; #activo = false; #fallos = 0; #tAuto = null; #tReinicio = null;
  #hechos = new Set();        // resultados de voz ya procesados (por índice)
  #interinos = new Map();     // temporizadores de estabilidad de cada resultado

  constructor({ api, store, comandos, demo, haySesion, alFaltarSesion, config }) {
    this.#api = api; this.#store = store; this.#comandos = comandos; this.#demo = demo;
    this.#haySesion = haySesion; this.#alFaltarSesion = alFaltarSesion; this.#cfg = config;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.desactivar('La pestaña pasó a segundo plano: modo voz desactivado.', 'warn');
    });
  }

  get activo() { return this.#activo; }
  #msg(texto, tipo = 'info') { this.#store.set('mensaje', { texto, tipo, id: Date.now() + Math.random() }); }
  #estado(e) { this.emisor.emit('estado', e); }

  activar() {
    if (this.#activo) return true;
    if (this.#store.get('modo') !== 'manual') { this.#msg('Sal del modo actual antes de activar la voz.', 'warn'); return false; }
    if (!vozSoportada) { this.#msg('Tu navegador no soporta el reconocimiento de voz. Usa Chrome, Edge o Safari.', 'error'); return false; }
    if (!this.#store.get('vehiculoId')) { this.#msg('Selecciona un vehículo en Ajustes.', 'error'); return false; }
    if (this.#store.get('demo').estado !== 'libre') { this.#msg('Hay una DEMO o una orden de IA en curso. Espera a que termine.', 'warn'); return false; }
    if (!this.#haySesion()) { this.#alFaltarSesion(); return false; }

    this.#activo = true; this.#fallos = 0;
    this.#store.set('modo', 'voz'); // deshabilita joysticks, botones y DEMO
    this.#msg('Modo voz activado. Di un comando.', 'info');
    this.#abrir();
    return true;
  }

  desactivar(motivo = 'Modo voz desactivado.', tipo = 'info') {
    if (!this.#activo) return;
    this.#activo = false;
    clearTimeout(this.#tAuto); clearTimeout(this.#tReinicio); this.#limpiarInterinos();
    const rec = this.#rec; this.#rec = null;
    if (rec) { rec.onstart = rec.onresult = rec.onerror = rec.onend = null; try { rec.abort(); } catch { /* ya detenido */ } }
    this.#store.set('modo', 'manual');
    this.#estado('inactivo');
    this.#comandos.soltar('voz'); // si se movía por voz, se detiene
    this.#msg(motivo, tipo);
  }

  #abrir() {
    if (!this.#activo) return;
    const rec = new SR();
    rec.lang = this.#cfg.idioma; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onstart = () => { this.#limpiarInterinos(); this.#estado('escuchando'); };
    rec.onresult = (e) => {
      this.#fallos = 0;
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const r = e.results[i];
        const texto = textoSeguro(r[0]?.transcript ?? '', 200).trim();
        if (!texto) continue;
        if (r.isFinal) {
          clearTimeout(this.#interinos.get(i));
          if (!this.#hechos.has(i)) { this.#hechos.add(i); this.#procesar(texto); }
        } else {
          this.emisor.emit('parcial', texto);
          this.#programarInterino(i, texto);
        }
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return; // 'end' reinicia la escucha
      if (FATALES[e.error]) { this.desactivar(FATALES[e.error], 'error'); return; }
      this.#fallos += 1;
      if (this.#fallos >= 3) this.desactivar(`El reconocimiento de voz falló (${textoSeguro(e.error, 30)}).`, 'error');
    };
    rec.onend = () => { // el navegador corta la escucha tras un silencio: se reabre sola
      if (this.#rec !== rec) return;
      this.#rec = null;
      if (this.#activo) this.#tReinicio = setTimeout(() => this.#abrir(), 400);
    };
    this.#rec = rec;
    try { rec.start(); } catch {
      this.#rec = null; this.#fallos += 1;
      if (this.#fallos >= 3) this.desactivar('No se pudo iniciar el micrófono.', 'error');
      else this.#tReinicio = setTimeout(() => this.#abrir(), 800);
    }
  }

  /** Para ganar tiempo no se espera al cierre de la frase: si el texto parcial se queda
   *  igual `interinoMs`, se procesa ya. Las palabras de parada actúan al instante. */
  #programarInterino(i, texto) {
    const ms = this.#cfg.interinoMs;
    if (!ms || this.#hechos.has(i)) return;
    clearTimeout(this.#interinos.get(i));
    this.#interinos.set(i, setTimeout(() => {
      this.#interinos.delete(i);
      if (!this.#activo || this.#hechos.has(i)) return;
      this.#hechos.add(i);
      this.#procesar(texto);
    }, esUrgente(texto, this.#cfg) ? 0 : ms));
  }

  #limpiarInterinos() {
    for (const t of this.#interinos.values()) clearTimeout(t);
    this.#interinos.clear(); this.#hechos.clear();
  }

  async #procesar(texto) {
    const r = interpretarDirecto(texto, this.#cfg);
    if (this.#cfg.depurar) console.info('[voz]', JSON.stringify(texto), '→', r);
    if (r.tipo === 'ignorar') return;
    if (r.tipo === 'directo') { this.#ejecutar(r.clave, texto); return; }
    await this.#consultarIA(texto);
  }

  /** Comando concreto: se ejecuta directo, sin IA. */
  #ejecutar(clave, texto) {
    clearTimeout(this.#tAuto);
    if (clave === 'DETENER') { this.#comandos.detener(); this.#resultado(texto, { clave, via: 'directo' }); return; }
    const movimiento = this.#cfg.movimientos.includes(clave);
    const ok = this.#comandos.enviar(clave, movimiento ? 'voz' : 'btn:voz', 'WEB_VOZ');
    this.#resultado(texto, ok ? { clave, via: 'directo' } : { aviso: 'No se pudo ejecutar el comando.' });
    if (ok && movimiento && this.#cfg.autoDetenerMs > 0) {
      this.#tAuto = setTimeout(() => this.#comandos.soltar('voz'), this.#cfg.autoDetenerMs);
    }
  }

  /** Cualquier otra frase: el backend la interpreta con IA y la ejecuta (avance por WSS, no cancelable). */
  async #consultarIA(texto) {
    if (this.#store.get('demo').estado !== 'libre') {
      this.#resultado(texto, { aviso: 'Hay una ejecución en curso. Espera a que termine.' }); return;
    }
    if (!this.#haySesion()) { this.#alFaltarSesion(); return; }
    clearTimeout(this.#tAuto);
    this.#demo.iniciarIA(); // bloquea los demás controles mientras la IA responde
    this.#estado('procesando');
    try {
      const t0 = performance.now();
      const r = await this.#api.ejecutarIA(this.#store.get('vehiculoId'), texto);
      const seg = ((performance.now() - t0) / 1000).toFixed(1); // tiempo de respuesta del backend
      this.#resultado(texto, { ok: true, via: 'ia', aviso: `${r.mensaje || 'La IA aceptó la orden'} (${seg} s)` });
    } catch (e) {
      this.#demo.abortarIA();
      this.#resultado(texto, { aviso: e.message });
    } finally {
      if (this.#activo) this.#estado('escuchando');
    }
  }

  #resultado(texto, { clave = null, aviso = '', via = '', ok = Boolean(clave) } = {}) {
    this.emisor.emit('resultado', { texto, clave, aviso, via, ok });
  }
}
