// Cabina de excavadora alrededor del usuario. Es lo único virtual: los cristales son transparentes, así que
// por las ventanas se sigue viendo el mundo real (passthrough del visor). Los mandos están en la cabina:
// dos palancas (joysticks) en las consolas y un panel de botones montado en el tablero.
// Sistema local: el origen está en los ojos del usuario, -Z hacia el frente, +Y hacia arriba.
import { PALANCA } from '../dominio/controlVR.js';

const ANCHO = 1.04;     // ancho interior
const FRENTE = -0.88;   // plano del parabrisas
const ATRAS = 0.6;      // pared trasera
const TECHO = 0.42;     // altura del techo sobre los ojos
const PILAR = 0.06;     // grosor de los pilares

// Animación de la pluma (solo visual: refleja los comandos enviados, no la posición real)
const PLUMA = { min: 0.12, max: 0.95, inicial: 0.5, vel: 0.35 };    // rad y rad/s
const CUCHARA = { min: -0.9, max: 0.9, inicial: 0.2, vel: 0.9 };

function lienzo(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function textura(THREE, canvas, repetir = null) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repetir) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repetir); }
  return t;
}

// Placa antiderrapante (diamante) para el piso.
function texturaPiso(THREE) {
  const [c, ctx] = lienzo(256, 256);
  ctx.fillStyle = '#2a2f37'; ctx.fillRect(0, 0, 256, 256);
  for (let y = 0, f = 0; y < 256; y += 32, f += 1) {
    for (let x = f % 2 ? 16 : 0; x < 256; x += 32) {
      ctx.save(); ctx.translate(x + 8, y + 8); ctx.rotate(f % 2 ? 0.6 : -0.6);
      const g = ctx.createLinearGradient(-10, 0, 10, 0);
      g.addColorStop(0, '#4a525e'); g.addColorStop(1, '#1d2128');
      ctx.fillStyle = g; ctx.fillRect(-10, -2.5, 20, 5);
      ctx.restore();
    }
  }
  return textura(THREE, c, [4, 6]);
}

// Franja de seguridad amarilla y negra.
function texturaFranja(THREE) {
  const [c, ctx] = lienzo(512, 64);
  ctx.fillStyle = '#111317'; ctx.fillRect(0, 0, 512, 64);
  ctx.fillStyle = '#f2b705';
  for (let x = -64; x < 576; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 64); ctx.lineTo(x + 32, 64); ctx.lineTo(x + 64, 0); ctx.lineTo(x + 32, 0); ctx.closePath(); ctx.fill();
  }
  return textura(THREE, c);
}

// Superficie del tablero con el logotipo.
function texturaTablero(THREE) {
  const [c, ctx] = lienzo(1024, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#2b313a'); g.addColorStop(1, '#1b1f26');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
  ctx.strokeStyle = 'rgba(140, 192, 255, .10)'; ctx.lineWidth = 2;
  for (let x = 0; x < 1024; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke(); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 58px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(234, 242, 255, .85)'; ctx.fillText('NOVA', 200, 90);
  ctx.fillStyle = '#8cc0ff'; ctx.fillText('TRACK', 200, 150);
  return textura(THREE, c);
}

// Panel de instrumentos (decorativo): dos indicadores circulares con el estilo de la app.
function texturaInstrumentos(THREE, encendido) {
  const [c, ctx] = lienzo(512, 256);
  ctx.fillStyle = '#020a1c'; ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#2f8bff'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, 506, 250);
  const indicador = (cx, valor, color, texto) => {
    ctx.lineWidth = 14; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255, 255, 255, .12)';
    ctx.beginPath(); ctx.arc(cx, 128, 78, Math.PI * 0.8, Math.PI * 2.2); ctx.stroke();
    if (valor > 0) {
      ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(cx, 128, 78, Math.PI * 0.8, Math.PI * (0.8 + 1.4 * valor)); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = '#eaf2ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 26px "Segoe UI", system-ui, sans-serif'; ctx.fillText(texto, cx, 132);
  };
  indicador(128, encendido ? 0.72 : 0, '#3ee58a', 'RPM');
  indicador(384, encendido ? 0.55 : 0, '#ffbf3c', 'HIDR.');
  return textura(THREE, c);
}

export function crearCabina(THREE, { altura = 1.2, pluma: conPluma = true } = {}) {
  const PISO = -altura;                       // el piso queda `altura` m bajo los ojos
  const ASIENTO = PISO + 0.42;                // superficie del asiento
  const CINTURA = ASIENTO + 0.2;              // borde inferior de las ventanas laterales
  const TABLERO = ASIENTO + 0.3;              // superficie del tablero
  const CONSOLA = ASIENTO + 0.22;             // apoyabrazos / consolas laterales
  const ALTO = TECHO - PISO;

  const grupo = new THREE.Group();
  grupo.name = 'cabina-vr';

  const amarillo = new THREE.MeshStandardMaterial({ color: 0xf2b705, metalness: 0.3, roughness: 0.42 });
  const grafito = new THREE.MeshStandardMaterial({ color: 0x23272e, metalness: 0.4, roughness: 0.6 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x2e343d, metalness: 0.2, roughness: 0.8 });
  const goma = new THREE.MeshStandardMaterial({ color: 0x111317, metalness: 0.1, roughness: 0.95 });
  const cromo = new THREE.MeshStandardMaterial({ color: 0xd8dee8, metalness: 0.95, roughness: 0.15 });
  const vidrio = new THREE.MeshStandardMaterial({
    color: 0x9fd0ff, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide,
  });
  const led = new THREE.MeshBasicMaterial({ color: 0x2f8bff });
  const franja = new THREE.MeshStandardMaterial({ map: texturaFranja(THREE), roughness: 0.6 });

  const caja = (w, h, d, mat, x, y, z, padre = grupo) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    padre.add(m);
    return m;
  };
  const cilindro = (r1, r2, h, mat, x, y, z, padre = grupo, seg = 20) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
    m.position.set(x, y, z);
    padre.add(m);
    return m;
  };
  const cristal = (w, h, x, y, z, rotY = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), vidrio);
    m.position.set(x, y, z); m.rotation.y = rotY;
    m.renderOrder = 2;
    grupo.add(m);
    return m;
  };

  const X = ANCHO / 2;
  const PROF = ATRAS - FRENTE;
  const midZ = (FRENTE + ATRAS) / 2;

  // ---------- Estructura (pilares y vigas amarillas, burletes negros) ----------
  for (const sx of [-1, 1]) {
    caja(PILAR, ALTO, PILAR, amarillo, sx * (X - PILAR / 2), PISO + ALTO / 2, FRENTE + PILAR / 2);
    caja(PILAR, ALTO, PILAR, amarillo, sx * (X - PILAR / 2), PISO + ALTO / 2, ATRAS - PILAR / 2);
    caja(PILAR, PILAR, PROF, amarillo, sx * (X - PILAR / 2), TECHO, midZ);
    caja(PILAR * 0.8, PILAR * 0.8, PROF, amarillo, sx * (X - PILAR / 2), CINTURA, midZ);
    caja(0.012, 0.012, PROF - 2 * PILAR, goma, sx * (X - 0.012), CINTURA + PILAR * 0.4 + 0.006, midZ); // burlete de la ventana
    caja(0.012, ALTO - 0.1, 0.012, goma, sx * (X - PILAR - 0.004), PISO + ALTO / 2, FRENTE + 0.012);   // burlete del parabrisas
  }
  caja(PILAR * 0.8, ALTO, PILAR * 0.8, amarillo, -(X - PILAR / 2), PISO + ALTO / 2, -0.1);          // pilar de la puerta (izq.)
  caja(PILAR * 0.8, ALTO - (CINTURA - PISO), PILAR * 0.8, amarillo, X - PILAR / 2, (CINTURA + TECHO) / 2, 0.1);
  caja(ANCHO, PILAR, PILAR, amarillo, 0, TECHO, FRENTE + PILAR / 2);
  caja(ANCHO, PILAR, PILAR, amarillo, 0, TECHO, ATRAS - PILAR / 2);
  caja(ANCHO, PILAR * 0.7, PILAR * 0.7, amarillo, 0, -0.5, FRENTE + PILAR / 2);                    // travesaño del parabrisas
  caja(ANCHO - 2 * PILAR, 0.012, 0.012, goma, 0, -0.5 + PILAR * 0.35 + 0.006, FRENTE + 0.012);       // burlete del travesaño

  const fr = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO - 2 * PILAR, PILAR * 0.8), franja);
  fr.position.set(0, TECHO, FRENTE + PILAR + 0.001);
  grupo.add(fr);

  // ---------- Techo con tragaluz, visera, faros y baliza ----------
  const T = TECHO + PILAR / 2;
  caja(ANCHO + 0.08, 0.04, 0.42, grafito, 0, T + 0.02, ATRAS - 0.21);
  caja(ANCHO + 0.08, 0.04, 0.3, grafito, 0, T + 0.02, FRENTE + 0.15);
  caja(0.22, 0.04, PROF - 0.72, grafito, -(X - 0.07), T + 0.02, midZ - 0.06);
  caja(0.22, 0.04, PROF - 0.72, grafito, X - 0.07, T + 0.02, midZ - 0.06);
  const tragaluz = cristal(ANCHO - 0.44, PROF - 0.72, 0, T + 0.03, midZ - 0.06);
  tragaluz.rotation.x = -Math.PI / 2;
  caja(ANCHO + 0.1, 0.025, 0.16, amarillo, 0, T + 0.03, FRENTE - 0.07).rotation.x = 0.12;          // visera exterior
  caja(0.16, 0.012, 0.06, new THREE.MeshBasicMaterial({ color: 0xdfe9ff }), 0, TECHO - 0.005, ATRAS - 0.3); // plafón

  // Parasol interior (cristal tintado arriba del parabrisas)
  const parasol = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO - 0.2, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x0a1d45, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
  parasol.position.set(0, TECHO - 0.1, FRENTE + 0.06);
  parasol.renderOrder = 2;
  grupo.add(parasol);

  // Faros de trabajo en las esquinas delanteras del techo (se encienden con «Luces»)
  const matLente = new THREE.MeshBasicMaterial({ color: 0x3a3f47 });
  for (const sx of [-1, 1]) {
    const faro = new THREE.Group();
    faro.position.set(sx * (X - 0.06), T + 0.09, FRENTE - 0.02);
    faro.rotation.x = -0.25;
    caja(0.11, 0.08, 0.07, grafito, 0, 0, 0, faro);
    const lente = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.06), matLente);
    lente.position.z = -0.0355; lente.rotation.y = Math.PI;
    faro.add(lente);
    caja(0.02, 0.06, 0.02, grafito, 0, -0.06, 0.01, faro);
    grupo.add(faro);
  }

  // Baliza naranja en el techo (gira cuando la máquina está «encendida»)
  const matBaliza = new THREE.MeshStandardMaterial({ color: 0xff8a00, emissive: 0xff8a00, emissiveIntensity: 0.1, transparent: true, opacity: 0.9 });
  cilindro(0.04, 0.045, 0.02, grafito, -(X - 0.12), T + 0.05, ATRAS - 0.12);
  const baliza = new THREE.Mesh(new THREE.SphereGeometry(0.04, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), matBaliza);
  baliza.position.set(-(X - 0.12), T + 0.06, ATRAS - 0.12);
  grupo.add(baliza);

  // ---------- Piso y pedales ----------
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO, PROF), new THREE.MeshStandardMaterial({ map: texturaPiso(THREE), metalness: 0.5, roughness: 0.55 }));
  piso.rotation.x = -Math.PI / 2;
  piso.position.set(0, PISO, midZ);
  grupo.add(piso);
  caja(ANCHO - 0.2, 0.012, 0.55, goma, 0, PISO + 0.006, FRENTE + 0.45);
  for (const sx of [-1, 1]) {
    const pedal = caja(0.09, 0.012, 0.2, grafito, sx * 0.11, PISO + 0.08, FRENTE + 0.3);
    pedal.rotation.x = 0.55;
    caja(0.085, 0.004, 0.17, goma, sx * 0.11, PISO + 0.087, FRENTE + 0.3).rotation.x = 0.55;
  }

  // ---------- Paneles bajos ----------
  for (const sx of [-1, 1]) caja(0.02, CINTURA - PISO, PROF, panel, sx * (X - 0.01), (PISO + CINTURA) / 2, midZ);
  caja(ANCHO, 0.3, 0.02, panel, 0, PISO + 0.15, FRENTE + 0.01);
  caja(ANCHO, -0.15 - PISO, 0.02, panel, 0, (PISO - 0.15) / 2, ATRAS - 0.01);

  // ---------- Cristales ----------
  cristal(ANCHO - 2 * PILAR, TECHO + 0.5, 0, (TECHO - 0.5) / 2, FRENTE + 0.005);
  cristal(ANCHO - 2 * PILAR, -0.5 - (PISO + 0.3), 0, (-0.5 + PISO + 0.3) / 2, FRENTE + 0.005);
  cristal(PROF - 2 * PILAR, TECHO - CINTURA, -X + 0.004, (TECHO + CINTURA) / 2, midZ, Math.PI / 2);
  cristal(PROF - 2 * PILAR, TECHO - CINTURA, X - 0.004, (TECHO + CINTURA) / 2, midZ, -Math.PI / 2);
  cristal(ANCHO - 2 * PILAR, TECHO + 0.15, 0, (TECHO - 0.15) / 2, ATRAS - 0.005);

  // Limpiaparabrisas, manija, agarradera, espejo y extintor
  caja(0.006, 0.42, 0.008, goma, 0.08, -0.3, FRENTE + 0.012).rotation.z = -0.55;
  caja(0.02, 0.12, 0.025, grafito, -(X - 0.035), CINTURA + 0.25, -0.16).rotation.x = 0.1;
  caja(0.025, 0.3, 0.025, amarillo, -(X - 0.05), TECHO - 0.25, FRENTE + 0.09);
  caja(0.012, 0.012, 0.12, grafito, -X - 0.05, 0.05, FRENTE + 0.08).rotation.y = 0.5;
  caja(0.02, 0.16, 0.1, cromo, -X - 0.1, 0.05, FRENTE + 0.12);
  const rojo = new THREE.MeshStandardMaterial({ color: 0xc8102e, metalness: 0.3, roughness: 0.4 });
  cilindro(0.045, 0.045, 0.3, rojo, X - 0.1, PISO + 0.25, ATRAS - 0.1);
  cilindro(0.02, 0.03, 0.05, goma, X - 0.1, PISO + 0.42, ATRAS - 0.1);

  // ---------- Tablero (repisa con patas a los lados: las piernas pasan por debajo) ----------
  const fondoTab = 0.51;
  const zTab = FRENTE + 0.02 + fondoTab / 2;
  caja(ANCHO - 0.16, 0.1, fondoTab, panel, 0, TABLERO - 0.05, zTab);
  for (const sx of [-1, 1]) caja(0.1, TABLERO - 0.1 - PISO, 0.3, panel, sx * (X - 0.1), (PISO + TABLERO - 0.1) / 2, FRENTE + 0.17);
  const tapaTab = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO - 0.16, fondoTab), new THREE.MeshStandardMaterial({ map: texturaTablero(THREE), roughness: 0.7 }));
  tapaTab.rotation.x = -Math.PI / 2;
  tapaTab.position.set(0, TABLERO + 0.001, zTab);
  grupo.add(tapaTab);
  const borde = new THREE.Mesh(new THREE.PlaneGeometry(ANCHO - 0.16, 0.04), franja);
  borde.position.set(0, TABLERO - 0.02, zTab + fondoTab / 2 + 0.001);
  grupo.add(borde);
  caja(ANCHO - 0.18, 0.006, 0.006, led, 0, TABLERO + 0.004, zTab + fondoTab / 2 - 0.004);

  // Soporte inclinado donde se monta el panel de botones (mirando al usuario)
  const anclaPanel = new THREE.Group();
  anclaPanel.position.set(0, TABLERO + 0.065, -0.41);
  anclaPanel.rotation.x = -0.87;
  grupo.add(anclaPanel);
  caja(0.46, 0.19, 0.05, grafito, 0, 0, -0.035, anclaPanel); // carcasa detrás del panel

  // Instrumentos (derecha del panel)
  const inst = new THREE.Group();
  inst.position.set(0.36, TABLERO + 0.06, FRENTE + 0.2);
  inst.rotation.x = -0.45;
  caja(0.2, 0.11, 0.04, grafito, 0, 0, 0, inst);
  const matInst = new THREE.MeshBasicMaterial({ map: texturaInstrumentos(THREE, false) });
  const pantInst = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.09), matInst);
  pantInst.position.z = 0.021;
  inst.add(pantInst);
  grupo.add(inst);

  // ---------- Consolas laterales con palancas (joysticks) ----------
  const palancas = {};
  for (const [lado, sx] of [['izq', -1], ['der', 1]]) {
    const cx = sx * 0.37;
    caja(0.16, CONSOLA - PISO, 0.5, panel, cx, (PISO + CONSOLA) / 2, 0.05);
    caja(0.15, 0.03, 0.26, goma, cx, CONSOLA + 0.015, 0.16);
    caja(0.004, 0.004, 0.46, led, cx - sx * 0.08, CONSOLA - 0.004, 0.05);

    // Fuelle de goma y placa con las flechas de dirección
    cilindro(0.024, 0.04, 0.045, goma, cx, CONSOLA + 0.022, -0.12);
    caja(0.11, 0.004, 0.11, grafito, cx, CONSOLA + 0.002, -0.12);

    const pivote = new THREE.Group();
    pivote.position.set(cx, CONSOLA + 0.04, -0.12);
    grupo.add(pivote);
    cilindro(0.008, 0.009, PALANCA.largo - 0.02, cromo, 0, (PALANCA.largo - 0.02) / 2, 0, pivote, 12);
    const matPuno = new THREE.MeshStandardMaterial({ color: 0x15181d, emissive: 0x2f8bff, emissiveIntensity: 0, roughness: 0.7 });
    const puno = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.05, 6, 16), matPuno);
    puno.position.y = PALANCA.largo;
    pivote.add(puno);
    const matBoton = new THREE.MeshStandardMaterial({ color: 0x2f8bff, emissive: 0x2f8bff, emissiveIntensity: 0.3 });
    cilindro(0.011, 0.011, 0.008, matBoton, 0, PALANCA.largo + 0.048, 0, pivote, 16);
    // Anillo luminoso: aparece al acercar la mano y brilla al tomar la palanca
    const matAnillo = new THREE.MeshBasicMaterial({ color: 0x8cc0ff, transparent: true, opacity: 0 });
    const anillo = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0018, 8, 40), matAnillo);
    anillo.rotation.x = Math.PI / 2;
    anillo.position.y = PALANCA.largo;
    pivote.add(anillo);

    palancas[lado] = { pivote, matPuno, matBoton, matAnillo, rx: 0, rz: 0, objetivo: [0, 0], tomada: false, resalte: 0 };
  }

  // ---------- Asiento ----------
  const asiento = new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.85 });
  caja(0.5, 0.1, 0.46, asiento, 0, ASIENTO - 0.05, 0.12);
  const respaldo = caja(0.5, 0.62, 0.1, asiento, 0, ASIENTO + 0.33, 0.4);
  respaldo.rotation.x = -0.12;
  caja(0.3, 0.16, 0.08, asiento, 0, ASIENTO + 0.74, 0.46);
  caja(0.006, 0.6, 0.006, led, -0.23, ASIENTO + 0.33, 0.348).rotation.x = -0.12;
  caja(0.006, 0.6, 0.006, led, 0.23, ASIENTO + 0.33, 0.348).rotation.x = -0.12;
  caja(0.36, 0.25, 0.3, grafito, 0, PISO + 0.15, 0.12);

  // ---------- Pluma, brazo y cuchara (afuera, a la derecha: se ven por el parabrisas) ----------
  let pluma = null; let cuchara = null;
  const estadoPluma = { elev: PLUMA.inicial, cuchara: CUCHARA.inicial };
  if (conPluma) {
    pluma = new THREE.Group();
    pluma.position.set(X + 0.32, PISO + 0.25, -0.15);
    grupo.add(pluma);
    const L1 = 2.0; const L2 = 1.25;
    caja(0.16, 0.22, L1, amarillo, 0, 0, -L1 / 2, pluma);
    caja(0.17, 0.05, L1 * 0.9, grafito, 0, 0.125, -L1 / 2, pluma);                         // refuerzo superior
    cilindro(0.06, 0.06, 0.2, grafito, 0, 0, 0, pluma).rotation.z = Math.PI / 2;            // perno de la base
    const cil = cilindro(0.045, 0.045, 0.9, grafito, 0, -0.2, -0.55, pluma);                // cilindro hidráulico
    cil.rotation.x = Math.PI / 2 - 0.25;
    const vas = cilindro(0.022, 0.022, 0.6, cromo, 0, -0.12, -1.1, pluma);                  // vástago
    vas.rotation.x = Math.PI / 2 - 0.25;

    const brazo = new THREE.Group();
    brazo.position.set(0, 0, -L1);
    brazo.rotation.x = -1.6;
    pluma.add(brazo);
    caja(0.13, 0.17, L2, amarillo, 0, 0, -L2 / 2, brazo);
    cilindro(0.05, 0.05, 0.18, grafito, 0, 0, 0, brazo).rotation.z = Math.PI / 2;
    const cil2 = cilindro(0.035, 0.035, 0.7, grafito, 0, 0.16, -0.45, brazo);
    cil2.rotation.x = Math.PI / 2;

    cuchara = new THREE.Group();
    cuchara.position.set(0, 0, -L2);
    brazo.add(cuchara);
    caja(0.55, 0.05, 0.4, grafito, 0, -0.2, -0.12, cuchara);                               // fondo
    caja(0.55, 0.35, 0.05, grafito, 0, -0.05, 0.06, cuchara);                              // espalda
    for (const sx of [-1, 1]) caja(0.03, 0.3, 0.4, amarillo, sx * 0.27, -0.08, -0.1, cuchara); // laterales
    for (let k = 0; k < 5; k += 1) caja(0.05, 0.03, 0.09, cromo, -0.22 + k * 0.11, -0.22, -0.35, cuchara); // dientes
  }

  let lucesOn = false; let encendidoOn = false;

  /** Inclinación deseada de una palanca (rad). Si está tomada sigue a la mano; si no, regresa al centro. */
  function inclinar(lado, rx, rz, tomada) {
    const p = palancas[lado];
    p.objetivo = [rx, rz]; p.tomada = tomada;
  }

  /** Anima palancas, pluma, cuchara y baliza. `clave` es el movimiento en curso (o null); `dt` en segundos. */
  function animar(t, dt, clave) {
    for (const p of Object.values(palancas)) {
      const [rx, rz] = p.tomada ? p.objetivo : [0, 0];
      const k = p.tomada ? 0.6 : 0.25; // al soltar regresa al centro como un resorte
      p.rx += (rx - p.rx) * k; p.rz += (rz - p.rz) * k;
      p.pivote.rotation.set(p.rx, 0, p.rz);
      p.matAnillo.opacity += ((p.tomada ? 1 : p.resalte) - p.matAnillo.opacity) * 0.3;
      p.matPuno.emissiveIntensity = p.tomada ? 0.35 : p.resalte * 0.15;
      p.matBoton.emissiveIntensity = p.tomada ? 1 : 0.3;
    }

    if (pluma) {
      const paso = Math.min(dt, 0.1);
      if (clave === 'BRAZO_SUBIR') estadoPluma.elev = Math.min(PLUMA.max, estadoPluma.elev + PLUMA.vel * paso);
      if (clave === 'BRAZO_BAJAR') estadoPluma.elev = Math.max(PLUMA.min, estadoPluma.elev - PLUMA.vel * paso);
      if (clave === 'GARRA_IZQUIERDA') estadoPluma.cuchara = Math.min(CUCHARA.max, estadoPluma.cuchara + CUCHARA.vel * paso);
      if (clave === 'GARRA_DERECHA') estadoPluma.cuchara = Math.max(CUCHARA.min, estadoPluma.cuchara - CUCHARA.vel * paso);
      pluma.rotation.x = estadoPluma.elev;
      cuchara.rotation.x = estadoPluma.cuchara;
    }

    matBaliza.emissiveIntensity = encendidoOn ? 0.6 + 0.6 * Math.max(0, Math.sin(t / 140)) : 0.1;
  }

  /** Alterna los faros de trabajo (visual). */
  function alternarLuces() {
    lucesOn = !lucesOn;
    matLente.color.setHex(lucesOn ? 0xfff4d6 : 0x3a3f47);
  }

  /** Alterna el estado «encendido» (baliza e instrumentos; visual). */
  function alternarEncendido() {
    encendidoOn = !encendidoOn;
    matInst.map.dispose();
    matInst.map = texturaInstrumentos(THREE, encendidoOn);
    matInst.needsUpdate = true;
  }

  function liberar() {
    grupo.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material ?? [])) { m.map?.dispose(); m.dispose(); }
    });
  }

  return {
    grupo, anclaPanel,
    palancas: Object.fromEntries(Object.entries(palancas).map(([k, p]) => [k, { pivote: p.pivote }])),
    inclinar,
    resaltar(lado, nivel) { palancas[lado].resalte = nivel; },
    animar, alternarLuces, alternarEncendido, liberar,
  };
}
