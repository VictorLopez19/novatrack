// Modelo 3D del control virtual. Solo se crea el control (sin escenario): el resto es el mundo real.
// Recibe la librería THREE ya cargada y usa los mismos colores e iconos (Bootstrap Icons) de la app.
import { CUERPO, ASA, PANTALLA, TAPA, BOTONES, ROTULOS } from '../dominio/controlVR.js';

const TONOS = { azul: 0x2f8bff, morado: 0xb9a0ff, rojo: 0xff3b55, gris: 0x7e93b4 };
const TONOS_CSS = { azul: '#2f8bff', morado: '#b9a0ff', rojo: '#ff6b7a', gris: '#a9bddb' };
const ESTADO_COLOR = { enviando: 0xffbf3c, aceptado: 0x3ee58a, error: 0xff6b7a };
const PX = 2560; // píxeles por metro en las texturas de la cara

// Lee el carácter del icono de Bootstrap Icons desde su regla CSS (::before).
function glifo(clase) {
  const i = document.createElement('i');
  i.className = `bi ${clase}`;
  i.style.cssText = 'position:absolute;visibility:hidden';
  document.body.append(i);
  const c = getComputedStyle(i, '::before').content.replace(/^["']|["']$/g, '');
  i.remove();
  return c && c !== 'none' ? c : '•';
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

// Cara impresa: rótulos, aros de las crucetas y la indicación del asa.
function texturaCara(THREE) {
  const c = document.createElement('canvas');
  c.width = Math.round(CUERPO.ancho * PX); c.height = Math.round(CUERPO.alto * PX);
  const ctx = c.getContext('2d');
  const aPx = (x, y) => [c.width / 2 + x * PX, c.height / 2 - y * PX];

  // Recorta al contorno redondeado del cuerpo (las esquinas quedan transparentes)
  rectRedondeado(ctx, 0, 0, c.width, c.height, CUERPO.radio * PX);
  ctx.clip();

  // Rejilla tenue como el fondo de la app
  ctx.strokeStyle = 'rgba(80, 140, 255, .10)'; ctx.lineWidth = 2;
  for (let x = 0; x < c.width; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, c.height); ctx.stroke(); }
  for (let y = 0; y < c.height; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y); ctx.stroke(); }

  // Aros de las crucetas y del bloque de funciones
  ctx.setLineDash([14, 10]); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(140, 192, 255, .45)';
  for (const cx of [-0.125, 0.125]) {
    const [x, y] = aPx(cx, -0.02);
    ctx.beginPath(); ctx.arc(x, y, 0.072 * PX, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(185, 160, 255, .45)';
  const [fx, fy] = aPx(-0.05, 0.043);
  rectRedondeado(ctx, fx, fy, 0.1 * PX, 0.086 * PX, 40); ctx.stroke();
  ctx.setLineDash([]);

  // Rótulos
  ctx.fillStyle = '#8cc0ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '700 34px "Segoe UI", system-ui, sans-serif';
  for (const r of ROTULOS) { const [x, y] = aPx(r.x, r.y); ctx.fillText(r.texto, x, y); }
  ctx.fillStyle = '#a9bddb'; ctx.font = '600 26px "Segoe UI", system-ui, sans-serif';
  const [hx, hy] = aPx(0, 0.101);
  ctx.fillText('Pellizca el asa para mover el control', hx, hy);

  return textura(THREE, c);
}

// Icono de un botón: disco con degradado, aro del tono y el glifo de Bootstrap Icons.
function texturaIcono(THREE, b) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(110, 100, 10, 128, 128, 128);
  g.addColorStop(0, b.tono === 'rojo' ? '#e01535' : '#123a85');
  g.addColorStop(1, b.tono === 'rojo' ? '#8a0b20' : '#06163a');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(128, 128, 128, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 14; ctx.strokeStyle = TONOS_CSS[b.tono]; ctx.beginPath(); ctx.arc(128, 128, 120, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${b.tipo === 'detener' ? 120 : 130}px "bootstrap-icons"`;
  ctx.shadowColor = TONOS_CSS[b.tono]; ctx.shadowBlur = 18;
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
  const cuerpo = new THREE.Mesh(cuerpoGeo, new THREE.MeshStandardMaterial({
    color: 0x0a1d45, metalness: 0.35, roughness: 0.45, transparent: true, opacity: 0.94,
  }));
  grupo.add(cuerpo);

  const haloGeo = extruir(CUERPO.ancho + 0.012, CUERPO.alto + 0.012, CUERPO.radio + 0.006, 0.004);
  haloGeo.translate(0, 0, -CUERPO.grosor / 2 - 0.001);
  const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: 0x2f8bff, transparent: true, opacity: 0.45 }));
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
  function escribirPantalla({ titulo = 'NOVA TRACK · VR', linea = '', tono = '#8cc0ff', punto = '#3ee58a' } = {}) {
    const clave = `${titulo}|${linea}|${tono}|${punto}`;
    if (clave === textoPrevio) return;
    textoPrevio = clave;

    const ctx = lienzo.getContext('2d');
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    rectRedondeado(ctx, 4, 4, lienzo.width - 8, lienzo.height - 8, 26);
    ctx.fillStyle = 'rgba(2, 10, 28, .92)'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#2f8bff'; ctx.stroke();

    ctx.fillStyle = punto; ctx.shadowColor = punto; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(40, 44, 10, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = '#a9bddb'; ctx.font = '700 30px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(titulo, 62, 45);
    ctx.fillStyle = tono; ctx.font = '700 42px "Segoe UI", system-ui, sans-serif';
    let t = linea;
    while (t.length > 3 && ctx.measureText(t).width > lienzo.width - 60) t = `${t.slice(0, -2)}…`;
    ctx.fillText(t, 30, 102);
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

    const matLado = new THREE.MeshStandardMaterial({ color: TONOS[b.tono], emissive: TONOS[b.tono], emissiveIntensity: 0.25, metalness: 0.3, roughness: 0.4, transparent: true });
    const tapa = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r, TAPA.alto, 40), matLado);
    tapa.rotation.x = Math.PI / 2;
    tapa.position.z = TAPA.alto / 2;
    tapa.userData.boton = b;
    pivote.add(tapa);

    const matIcono = new THREE.MeshStandardMaterial({ map: texturaIcono(THREE, b), emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6, transparent: true });
    const icono = new THREE.Mesh(new THREE.CircleGeometry(b.r * 0.96, 40), matIcono);
    icono.position.z = TAPA.alto + 0.0004;
    icono.userData.boton = b;
    pivote.add(icono);

    botones.set(b.id, { b, pivote, tapa, icono, matLado, matIcono, estado: null, tEstado: 0, disponible: true, foco: false, h: 0 });
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
    }
  }

  return {
    grupo, cursores, rayos, objetivos, asa,
    escribirPantalla,
    actualizarBotones,
    hundir(id, h) { const v = botones.get(id); if (v) v.h = h; },
    enfocar(ids) { for (const v of botones.values()) v.foco = ids.has(v.b.id); },
    marcar(id, estado, t) { const v = botones.get(id); if (v) { v.estado = estado; v.tEstado = t; } },
    disponible(id, ok) { const v = botones.get(id); if (v) v.disponible = ok; },
    resaltarAsa(nivel) { matAsa.emissiveIntensity = nivel; },
  };
}
