// Modelo 3D del control virtual. Solo se crea el control (sin escenario): el resto es el mundo real.
// Recibe la librería THREE ya cargada y usa los mismos colores e iconos (Bootstrap Icons) de la app.
import { CUERPO, ASA, PANTALLA, TAPA, BOTONES, ROTULOS } from '../dominio/controlVR.js';

const TONOS = { azul: 0x2f8bff, morado: 0xb9a0ff, rojo: 0xff3b55, gris: 0x7e93b4 };
const TONOS_CSS = { azul: '#2f8bff', morado: '#b9a0ff', rojo: '#ff6b7a', gris: '#a9bddb' };
const ESTADO_COLOR = { enviando: 0xffbf3c, aceptado: 0x3ee58a, error: 0xff6b7a };
const PX = 2560; // píxeles por metro en las texturas de la cara

// Articulaciones de WebXR Hand Input y cómo se unen (palma + cinco dedos).
const DEDOS = {
  thumb: ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  index: ['index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip'],
  middle: ['middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip'],
  ring: ['ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip'],
  pinky: ['pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'],
};
const ARTICULACIONES = ['wrist', ...Object.values(DEDOS).flat()];
const HUESOS = [
  ...Object.values(DEDOS).flatMap((d) => [['wrist', d[0]], ...d.slice(1).map((n, k) => [d[k], n])]),
  ['index-finger-phalanx-proximal', 'middle-finger-phalanx-proximal'],
  ['middle-finger-phalanx-proximal', 'ring-finger-phalanx-proximal'],
  ['ring-finger-phalanx-proximal', 'pinky-finger-phalanx-proximal'],
];

// Lee el carácter del icono de Bootstrap Icons desde su regla CSS (::before). Se guarda en caché.
const GLIFOS = new Map();
function glifo(clase) {
  if (GLIFOS.has(clase)) return GLIFOS.get(clase);
  const i = document.createElement('i');
  i.className = `bi ${clase}`;
  i.style.cssText = 'position:absolute;visibility:hidden';
  document.body.append(i);
  const c = getComputedStyle(i, '::before').content.replace(/^["']|["']$/g, '');
  i.remove();
  const res = c && c !== 'none' ? c : '•';
  GLIFOS.set(clase, res);
  return res;
}

function rectRedondeado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function formaRedondeada(THREE, w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2; const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function textura(THREE, canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Cara impresa: relieve, placas de las crucetas, bloque de funciones, rótulos y detalles.
function texturaCara(THREE) {
  const c = document.createElement('canvas');
  c.width = Math.round(CUERPO.ancho * PX); c.height = Math.round(CUERPO.alto * PX);
  const ctx = c.getContext('2d');
  const aPx = (x, y) => [c.width / 2 + x * PX, c.height / 2 - y * PX];
  const m = (v) => v * PX;

  // Recorta al contorno redondeado del cuerpo (las esquinas quedan transparentes)
  rectRedondeado(ctx, 0, 0, c.width, c.height, CUERPO.radio * PX);
  ctx.clip();

  // Fondo: brillo suave arriba (da sensación de volumen)
  const brillo = ctx.createRadialGradient(c.width / 2, c.height * 0.15, 20, c.width / 2, c.height * 0.4, c.width * 0.65);
  brillo.addColorStop(0, 'rgba(60, 120, 230, .30)');
  brillo.addColorStop(1, 'rgba(2, 10, 28, 0)');
  ctx.fillStyle = brillo; ctx.fillRect(0, 0, c.width, c.height);

  // Trama de puntos muy tenue
  ctx.fillStyle = 'rgba(140, 192, 255, .07)';
  for (let y = 24, f = 0; y < c.height; y += 36, f += 1) {
    for (let x = f % 2 ? 24 : 42; x < c.width; x += 36) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill(); }
  }

  // Placas de las crucetas: hueco circular + cruz
  for (const cx of [-0.125, 0.125]) {
    const [x, y] = aPx(cx, -0.02);
    const hueco = ctx.createRadialGradient(x, y - m(0.02), m(0.01), x, y, m(0.07));
    hueco.addColorStop(0, 'rgba(10, 33, 80, .95)');
    hueco.addColorStop(1, 'rgba(3, 12, 36, .95)');
    ctx.fillStyle = hueco;
    ctx.beginPath(); ctx.arc(x, y, m(0.07), 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(47, 139, 255, .55)'; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(140, 192, 255, .25)';
    ctx.beginPath(); ctx.arc(x, y, m(0.075), 0, Math.PI * 2); ctx.stroke();

    ctx.fillStyle = 'rgba(47, 139, 255, .12)'; ctx.strokeStyle = 'rgba(140, 192, 255, .30)'; ctx.lineWidth = 3;
    rectRedondeado(ctx, x - m(0.067), y - m(0.019), m(0.134), m(0.038), m(0.019)); ctx.fill(); ctx.stroke();
    rectRedondeado(ctx, x - m(0.019), y - m(0.067), m(0.038), m(0.134), m(0.019)); ctx.fill(); ctx.stroke();
  }

  // Bloque de funciones con nombres
  const [fx, fy] = aPx(-0.052, 0.045);
  rectRedondeado(ctx, fx, fy, m(0.104), m(0.094), 44);
  ctx.fillStyle = 'rgba(185, 160, 255, .08)'; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(185, 160, 255, .55)'; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#cfc2ff'; ctx.font = '700 17px "Segoe UI", system-ui, sans-serif';
  for (const b of BOTONES.filter((x) => x.tipo === 'unico')) {
    const [x, y] = aPx(b.x, b.y - b.r - 0.0045);
    ctx.fillText(b.etiqueta.toUpperCase(), x, y);
  }

  // DETENER: rótulo debajo, sin contorno
  const det = BOTONES.find((x) => x.tipo === 'detener');
  if (det) {
    const [x, y] = aPx(det.x, det.y - det.r - 0.0055);
    ctx.fillStyle = '#ffc2c8'; ctx.font = '800 18px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('DETENER', x, y);
  }

  // Rótulos de las crucetas con una línea de acento
  ctx.font = '800 32px "Segoe UI", system-ui, sans-serif';
  for (const r of ROTULOS) {
    const [x, y] = aPx(r.x, r.y);
    ctx.fillStyle = '#8cc0ff'; ctx.fillText(r.texto, x, y);
    const w = ctx.measureText(r.texto).width;
    ctx.fillStyle = 'rgba(47, 139, 255, .8)';
    rectRedondeado(ctx, x - w / 2, y + 22, w, 4, 2); ctx.fill();
  }

  // Indicación del asa y tornillos decorativos en las esquinas
  ctx.fillStyle = '#a9bddb'; ctx.font = '600 24px "Segoe UI", system-ui, sans-serif';
  const [hx, hy] = aPx(0, 0.101);
  ctx.fillText('Pellizca el asa para mover el control', hx, hy);
  for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const [x, y] = aPx(sx * (CUERPO.ancho / 2 - 0.016), sy * (CUERPO.alto / 2 - 0.016));
    ctx.fillStyle = 'rgba(4, 18, 47, .95)'; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(140, 192, 255, .45)'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 7, y - 7); ctx.lineTo(x + 7, y + 7); ctx.stroke();
  }

  // Canal de la franja de luz inferior
  ctx.fillStyle = 'rgba(2, 8, 22, .9)';
  for (const lado of [-1, 1]) {
    const [x, y] = aPx(lado * 0.07 - 0.031, -CUERPO.alto / 2 + 0.0135);
    rectRedondeado(ctx, x, y, m(0.062), m(0.009), m(0.0045)); ctx.fill();
  }

  return textura(THREE, c);
}

// Degradado de cada tono para el disco del icono (centro claro → borde oscuro).
const DISCO = {
  azul: ['#2a62c9', '#0b2a66', '#05122e'],
  morado: ['#6a4bc4', '#2c1a6b', '#120a33'],
  rojo: ['#ff3b55', '#c8102e', '#6e0718'],
  gris: ['#4a5e86', '#1c2a48', '#0b1530'],
};

// Icono de un botón: disco con degradado del tono, brillo superior y el glifo de Bootstrap Icons.
function texturaIcono(THREE, b) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const [claro, medio, oscuro] = DISCO[b.tono] ?? DISCO.azul;

  const g = ctx.createRadialGradient(118, 96, 8, 128, 128, 128);
  g.addColorStop(0, claro); g.addColorStop(0.55, medio); g.addColorStop(1, oscuro);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(128, 128, 128, 0, Math.PI * 2); ctx.fill();

  // Aro fino del tono (DETENER va sin contorno)
  if (b.tipo !== 'detener') {
    ctx.lineWidth = 8; ctx.strokeStyle = TONOS_CSS[b.tono];
    ctx.beginPath(); ctx.arc(128, 128, 122, 0, Math.PI * 2); ctx.stroke();
  }

  // Brillo superior (reflejo tipo cristal)
  const reflejo = ctx.createLinearGradient(0, 20, 0, 130);
  reflejo.addColorStop(0, 'rgba(255, 255, 255, .28)');
  reflejo.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = reflejo;
  ctx.beginPath(); ctx.ellipse(128, 78, 92, 58, 0, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${b.tipo === 'detener' ? 124 : 128}px "bootstrap-icons"`;
  ctx.shadowColor = b.tipo === 'detener' ? 'rgba(0, 0, 0, .45)' : TONOS_CSS[b.tono];
  ctx.shadowBlur = 16;
  ctx.fillText(glifo(b.icono), 128, 136);
  return textura(THREE, c);
}

export async function crearModeloControl(THREE) {
  try { await document.fonts.load('100px "bootstrap-icons"'); } catch { /* si falla se dibuja un punto */ }

  const grupo = new THREE.Group();
  grupo.name = 'control-vr';

  // ---------- Cuerpo con halo azul ----------
  const extruir = (w, h, r, prof) => new THREE.ExtrudeGeometry(formaRedondeada(THREE, w, h, r), {
    depth: prof, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 3, curveSegments: 10,
  });
  const cuerpoGeo = extruir(CUERPO.ancho, CUERPO.alto, CUERPO.radio, CUERPO.grosor - 0.006);
  cuerpoGeo.translate(0, 0, -CUERPO.grosor / 2 + 0.003);
  const cuerpo = new THREE.Mesh(cuerpoGeo, new THREE.MeshPhysicalMaterial({
    color: 0x0b1f4d, metalness: 0.45, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3, transparent: true, opacity: 0.96,
  }));
  grupo.add(cuerpo);

  const haloGeo = extruir(CUERPO.ancho + 0.012, CUERPO.alto + 0.012, CUERPO.radio + 0.006, 0.004);
  haloGeo.translate(0, 0, -CUERPO.grosor / 2 - 0.001);
  const matHalo = new THREE.MeshBasicMaterial({ color: 0x2f8bff, transparent: true, opacity: 0.45 });
  const halo = new THREE.Mesh(haloGeo, matHalo);
  grupo.add(halo);

  // Borde luminoso sobre la cara
  const borde = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(formaRedondeada(THREE, CUERPO.ancho - 0.008, CUERPO.alto - 0.008, CUERPO.radio - 0.004).getPoints(12)),
    new THREE.LineBasicMaterial({ color: 0x8cc0ff, transparent: true, opacity: 0.8 }),
  );
  borde.position.z = CUERPO.grosor / 2 + 0.0008;
  grupo.add(borde);

  // Cara impresa
  const cara = new THREE.Mesh(
    new THREE.PlaneGeometry(CUERPO.ancho, CUERPO.alto),
    new THREE.MeshBasicMaterial({ map: texturaCara(THREE), transparent: true, depthWrite: false }),
  );
  cara.position.z = CUERPO.grosor / 2 + 0.0005;
  grupo.add(cara);

  // ---------- Pantalla de estado ----------
  const lienzo = document.createElement('canvas');
  lienzo.width = 600; lienzo.height = 144;
  const texPantalla = textura(THREE, lienzo);
  const pantalla = new THREE.Mesh(
    new THREE.PlaneGeometry(PANTALLA.ancho, PANTALLA.alto),
    new THREE.MeshBasicMaterial({ map: texPantalla, transparent: true }),
  );
  pantalla.position.set(0, PANTALLA.y, CUERPO.grosor / 2 + 0.001);
  grupo.add(pantalla);

  let textoPrevio = '';
  const FUENTE = '"Segoe UI", system-ui, sans-serif';
  function escribirPantalla({ titulo = 'NOVA TRACK', linea = '', tono = '#eaf2ff', punto = '#3ee58a', conexion = '', icono = null } = {}) {
    const clave = `${titulo}|${linea}|${tono}|${punto}|${conexion}|${icono}`;
    if (clave === textoPrevio) return;
    textoPrevio = clave;

    const W = lienzo.width; const H = lienzo.height;
    const ctx = lienzo.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    // Fondo con degradado y borde luminoso
    rectRedondeado(ctx, 4, 4, W - 8, H - 8, 26);
    const fondo = ctx.createLinearGradient(0, 0, 0, H);
    fondo.addColorStop(0, 'rgba(10, 33, 80, .96)'); fondo.addColorStop(1, 'rgba(2, 10, 28, .96)');
    ctx.fillStyle = fondo; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#2f8bff'; ctx.stroke();

    // Cabecera: punto de conexión · marca · estado de la conexión · etiqueta VR
    ctx.textBaseline = 'middle';
    ctx.fillStyle = punto; ctx.shadowColor = punto; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(34, 34, 8, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left'; ctx.fillStyle = '#a9bddb'; ctx.font = `800 24px ${FUENTE}`;
    ctx.fillText(titulo.split('').join(String.fromCharCode(8202)), 52, 35);

    ctx.fillStyle = '#b9a0ff';
    rectRedondeado(ctx, W - 76, 18, 56, 32, 16); ctx.fill();
    ctx.fillStyle = '#120a33'; ctx.textAlign = 'center'; ctx.font = `900 20px ${FUENTE}`;
    ctx.fillText('VR', W - 48, 35);
    if (conexion) {
      ctx.textAlign = 'right'; ctx.fillStyle = punto; ctx.font = `700 22px ${FUENTE}`;
      ctx.fillText(conexion, W - 90, 35);
    }

    // Separador
    ctx.fillStyle = 'rgba(140, 192, 255, .22)';
    ctx.fillRect(22, 58, W - 44, 2);

    // Línea principal: icono del botón + texto
    let x = 30;
    if (icono) {
      ctx.textAlign = 'left'; ctx.fillStyle = tono; ctx.font = `40px "bootstrap-icons"`;
      ctx.fillText(glifo(icono), x, 102);
      x += 54;
    }
    ctx.textAlign = 'left'; ctx.fillStyle = tono; ctx.font = `700 40px ${FUENTE}`;
    let t = linea;
    while (t.length > 3 && ctx.measureText(t).width > W - x - 28) t = `${t.slice(0, -2)}…`;
    ctx.fillText(t, x, 102);
    texPantalla.needsUpdate = true;
  }
  escribirPantalla({ linea: 'Listo' });

  // ---------- Asa (para tomar y mover el control) ----------
  const matAsa = new THREE.MeshStandardMaterial({ color: 0x1f6fe0, emissive: 0x1f6fe0, emissiveIntensity: 0.35, metalness: 0.2, roughness: 0.35 });
  const asa = new THREE.Mesh(new THREE.CapsuleGeometry(ASA.radio, ASA.largo, 6, 16), matAsa);
  asa.rotation.z = Math.PI / 2;
  asa.position.set(0, ASA.y, CUERPO.grosor / 2);
  grupo.add(asa);
  for (const x of [-ASA.largo / 2 + 0.01, ASA.largo / 2 - 0.01]) {
    const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, ASA.y - CUERPO.alto / 2, 10), matAsa);
    poste.position.set(x, (ASA.y + CUERPO.alto / 2) / 2, CUERPO.grosor / 2);
    grupo.add(poste);
  }
  const matEstria = new THREE.MeshStandardMaterial({ color: 0x0b2a66, metalness: 0.5, roughness: 0.4 });
  for (let k = -2; k <= 2; k += 1) { // estrías de agarre
    const estria = new THREE.Mesh(new THREE.TorusGeometry(ASA.radio + 0.0004, 0.0012, 8, 24), matEstria);
    estria.rotation.y = Math.PI / 2;
    estria.position.set(k * 0.016, ASA.y, CUERPO.grosor / 2);
    grupo.add(estria);
  }

  // ---------- Franja de luz de estado (abajo, a ambos lados de DETENER) ----------
  const matLuz = new THREE.MeshBasicMaterial({ color: 0x3ee58a, transparent: true, opacity: 0.9 });
  for (const lado of [-1, 1]) {
    const luz = new THREE.Mesh(new THREE.CapsuleGeometry(0.0026, 0.054, 4, 12), matLuz);
    luz.rotation.z = Math.PI / 2;
    luz.position.set(lado * 0.07, -CUERPO.alto / 2 + 0.009, CUERPO.grosor / 2 + 0.0012);
    grupo.add(luz);
  }
  let luzColor = 0x3ee58a; let luzPulsa = false;

  // ---------- Botones ----------
  const botones = new Map();
  for (const b of BOTONES) {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(b.r + 0.004, b.r + 0.004, 0.003, 40),
      new THREE.MeshStandardMaterial({ color: 0x04122f, metalness: 0.4, roughness: 0.5 }),
    );
    base.rotation.x = Math.PI / 2;
    base.position.set(b.x, b.y, CUERPO.grosor / 2 + 0.0015);
    grupo.add(base);

    const pivote = new THREE.Group(); // se mueve en z para hundir el botón
    pivote.position.set(b.x, b.y, CUERPO.grosor / 2);
    grupo.add(pivote);

    // Tapa abombada: lados rectos y borde redondeado (perfil girado sobre su eje)
    const curva = 0.003;
    const perfil = [new THREE.Vector2(0, 0), new THREE.Vector2(b.r, 0), new THREE.Vector2(b.r, TAPA.alto - curva)];
    for (let k = 1; k <= 6; k += 1) {
      const a = (k / 6) * (Math.PI / 2);
      perfil.push(new THREE.Vector2(b.r - curva + Math.cos(a) * curva, TAPA.alto - curva + Math.sin(a) * curva));
    }
    perfil.push(new THREE.Vector2(0, TAPA.alto));
    const matLado = new THREE.MeshPhysicalMaterial({
      color: TONOS[b.tono], emissive: TONOS[b.tono], emissiveIntensity: 0.25, metalness: 0.25, roughness: 0.3,
      clearcoat: 1, clearcoatRoughness: 0.15, transparent: true, side: THREE.DoubleSide,
    });
    const tapa = new THREE.Mesh(new THREE.LatheGeometry(perfil, 40), matLado);
    tapa.rotation.x = Math.PI / 2;
    tapa.userData.boton = b;
    pivote.add(tapa);

    const matIcono = new THREE.MeshStandardMaterial({ map: texturaIcono(THREE, b), emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.35, transparent: true });
    const icono = new THREE.Mesh(new THREE.CircleGeometry((b.r - curva) * 0.98, 40), matIcono);
    icono.position.z = TAPA.alto + 0.0003;
    icono.userData.boton = b;
    pivote.add(icono);

    // Aro que se ilumina cuando el dedo (o el rayo) está encima (DETENER va sin contorno)
    let matAro = null;
    if (b.tipo !== 'detener') {
      matAro = new THREE.MeshBasicMaterial({ color: TONOS[b.tono], transparent: true, opacity: 0.15 });
      const aro = new THREE.Mesh(new THREE.TorusGeometry(b.r + 0.0032, 0.001, 8, 48), matAro);
      aro.position.set(b.x, b.y, CUERPO.grosor / 2 + 0.0032);
      grupo.add(aro);
    }

    // Onda que se expande al presionar (confirmación visual del toque)
    const matOnda = new THREE.MeshBasicMaterial({ color: b.tipo === 'detener' ? 0xffffff : TONOS[b.tono], transparent: true, opacity: 0, depthWrite: false });
    const onda = new THREE.Mesh(new THREE.RingGeometry(b.r, b.r + 0.0025, 48), matOnda);
    onda.position.set(b.x, b.y, CUERPO.grosor / 2 + 0.0035);
    onda.visible = false;
    grupo.add(onda);

    botones.set(b.id, { b, pivote, tapa, icono, matLado, matIcono, matAro, onda, matOnda, tOnda: -1, estado: null, tEstado: 0, disponible: true, foco: false, h: 0 });
  }

  // Cursores de las puntas de los dedos (esferas pequeñas luminosas)
  const matCursor = new THREE.MeshBasicMaterial({ color: 0x8cc0ff, transparent: true, opacity: 0.9 });
  const cursores = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 16, 12), matCursor);
    m.visible = false;
    return m;
  });

  // Rayos para mandos (sin manos)
  const rayos = [0, 1].map(() => {
    const l = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
      new THREE.LineBasicMaterial({ color: 0x8cc0ff, transparent: true, opacity: 0.7 }),
    );
    l.visible = false;
    return l;
  });

  // Esqueleto de las manos (articulaciones + huesos), mismo estilo que el modo gestos.
  // En el Quest 3 se ven las manos reales por el passthrough; esto sirve de guía y en el emulador es la única mano visible.
  const manos = [0, 1].map(() => {
    const puntos = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }),
      ARTICULACIONES.length,
    );
    puntos.frustumCulled = false;
    puntos.visible = false;

    const posiciones = new Float32Array(HUESOS.length * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
    const huesos = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x8cc0ff, transparent: true, opacity: 0.8 }));
    huesos.frustumCulled = false;
    huesos.visible = false;
    return { puntos, huesos, posiciones };
  });
  const matTmp = new THREE.Matrix4();
  const escTmp = new THREE.Vector3();
  const rotTmp = new THREE.Quaternion();

  /** Dibuja la mano `i` a partir de las articulaciones de three.js (o la oculta si no hay datos). */
  function dibujarMano(i, joints) {
    const m = manos[i];
    const listas = joints && joints.wrist?.visible;
    m.puntos.visible = m.huesos.visible = Boolean(listas);
    if (!listas) return;

    ARTICULACIONES.forEach((nombre, k) => {
      const j = joints[nombre];
      const r = j?.visible ? Math.max(0.003, (j.jointRadius ?? 0.008) * 0.55) : 0;
      escTmp.setScalar(r);
      matTmp.compose(j?.position ?? escTmp, rotTmp, escTmp);
      m.puntos.setMatrixAt(k, matTmp);
    });
    m.puntos.instanceMatrix.needsUpdate = true;

    HUESOS.forEach(([a, b], k) => {
      const pa = joints[a]?.position; const pb = joints[b]?.position;
      if (!pa || !pb) return;
      m.posiciones.set([pa.x, pa.y, pa.z, pb.x, pb.y, pb.z], k * 6);
    });
    m.huesos.geometry.attributes.position.needsUpdate = true;
  }

  // Mallas que se pueden tocar con el rayo
  const objetivos = [asa, ...[...botones.values()].flatMap((v) => [v.tapa, v.icono])];

  /** Aplica el aspecto de cada botón (hundimiento, foco, estado del comando y disponibilidad). */
  function actualizarBotones(t) {
    for (const v of botones.values()) {
      v.pivote.position.z = CUERPO.grosor / 2 - v.h;
      const vence = v.estado && t - v.tEstado > (v.estado === 'enviando' ? 4000 : 900);
      if (vence) v.estado = null;

      let color = TONOS[v.b.tono]; let brillo = v.foco ? 0.6 : 0.25;
      if (v.h > TAPA.recorrido * 0.6) brillo = 1;
      if (v.estado) { color = ESTADO_COLOR[v.estado]; brillo = v.estado === 'enviando' ? 0.5 + 0.4 * Math.sin(t / 90) : 0.9; }
      v.matLado.emissive.setHex(color);
      v.matLado.emissiveIntensity = brillo;
      v.matIcono.emissiveIntensity = v.foco ? 0.12 : 0;
      v.matLado.opacity = v.matIcono.opacity = v.disponible ? 1 : 0.35;
      if (v.matAro) {
        const objetivo = v.estado ? 1 : v.foco ? 0.95 : 0.15;
        v.matAro.opacity += (objetivo - v.matAro.opacity) * 0.3; // transición suave
        v.matAro.color.setHex(color);
      }

      // Onda de pulsación: crece y se desvanece en ~450 ms
      const p = v.tOnda < 0 ? 1 : (t - v.tOnda) / 450;
      v.onda.visible = p >= 0 && p < 1;
      if (v.onda.visible) {
        v.onda.scale.setScalar(1 + p * 0.9);
        v.matOnda.opacity = 0.85 * (1 - p);
      }
    }

    matHalo.opacity = 0.38 + 0.08 * Math.sin(t / 700); // el halo «respira»
    matLuz.color.setHex(luzColor);
    matLuz.opacity = luzPulsa ? 0.55 + 0.4 * Math.sin(t / 120) : 0.9;
  }

  return {
    grupo, cursores, rayos, objetivos, asa,
    manos: manos.flatMap((m) => [m.huesos, m.puntos]),
    dibujarMano,
    escribirPantalla,
    actualizarBotones,
    hundir(id, h) { const v = botones.get(id); if (v) v.h = h; },
    enfocar(ids) { for (const v of botones.values()) v.foco = ids.has(v.b.id); },
    marcar(id, estado, t) { const v = botones.get(id); if (v) { v.estado = estado; v.tEstado = t; } },
    /** Lanza la onda de pulsación del botón. */
    pulso(id, t) { const v = botones.get(id); if (v) v.tOnda = t; },
    disponible(id, ok) { const v = botones.get(id); if (v) v.disponible = ok; },
    resaltarAsa(nivel) { matAsa.emissiveIntensity = nivel; },
    /** Franja de luz: color del estado y si parpadea (movimiento en curso). */
    estadoLuz(color, pulsa = false) { luzColor = color; luzPulsa = pulsa; },
  };
}
