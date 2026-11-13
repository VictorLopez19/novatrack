// Fechas y horas del backend. No inventa valores: si algo no se puede interpretar, devuelve null.
// Un texto sin zona («2026-11-12T14:03:22») NO se convierte salvo que config.monitoreo.fechas.sinZona = 'utc'.
import { CONFIG } from '../config.js';

const RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)?$/i;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const p2 = (n) => String(n).padStart(2, '0');

let formateador = null;

// Interpreta un texto ISO. 'absoluta' trae zona (Z o ±hh:mm); 'ingenua' no la trae.
export function analizarFecha(valor) {
  if (typeof valor !== 'string') return null;

  const m = RE.exec(valor.trim());
  if (!m) return null;

  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;

  const fraccion = m[7] ? Math.floor(Number(`0.${m[7]}`) * 1000) : 0;
  const base = Date.UTC(y, mo - 1, d, h, mi, s, fraccion);
  if (Number.isNaN(base)) return null;

  if (!m[8]) return { tipo: 'ingenua', ms: base, partes: { y, mo, d, h, mi, s } };

  let minutos = 0;
  if (m[8].toUpperCase() !== 'Z') {
    const digitos = m[8].slice(1).replace(':', '');
    minutos = (m[8][0] === '-' ? -1 : 1) * (Number(digitos.slice(0, 2)) * 60 + Number(digitos.slice(2, 4) || 0));
  }

  return { tipo: 'absoluta', ms: base - minutos * 60000 };
}

// Compara dos textos de fecha: -1, 0, 1, o null si no son comparables (distinto tipo o ilegibles).
export function compararFechas(a, b) {
  const x = analizarFecha(a);
  const y = analizarFecha(b);
  if (!x || !y || x.tipo !== y.tipo) return null;
  return Math.sign(x.ms - y.ms);
}

// Obtiene las partes de una fecha absoluta en la zona configurada.
function partesEnZona(ms) {
  const { zonaMostrar } = CONFIG.monitoreo.fechas;

  try {
    formateador ??= new Intl.DateTimeFormat('en-US', {
      timeZone: zonaMostrar, year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
    });

    const o = {};
    for (const p of formateador.formatToParts(new Date(ms))) o[p.type] = p.value;

    return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second };
  } catch {
    const f = new Date(ms); // zona inválida en la configuración: se muestra en UTC
    return { y: f.getUTCFullYear(), mo: f.getUTCMonth() + 1, d: f.getUTCDate(), h: f.getUTCHours(), mi: f.getUTCMinutes(), s: f.getUTCSeconds() };
  }
}

// Devuelve { fecha: '12 nov 2026', hora: '14:03:22' } o null si el texto no es una fecha válida.
export function formatearFecha(valor) {
  const f = analizarFecha(valor);
  if (!f) return null;

  let p;
  if (f.tipo === 'absoluta') p = partesEnZona(f.ms);
  else if (CONFIG.monitoreo.fechas.sinZona === 'utc') p = partesEnZona(f.ms);
  else p = f.partes; // tal cual lo entregó el servidor

  return { fecha: `${p2(p.d)} ${MESES[p.mo - 1]} ${p.y}`, hora: `${p2(p.h)}:${p2(p.mi)}:${p2(p.s)}` };
}

// Texto aclaratorio sobre la zona horaria usada al mostrar.
export function textoZona() {
  const { zonaMostrar, sinZona } = CONFIG.monitoreo.fechas;

  return sinZona === 'utc'
    ? `Las fechas sin zona se interpretan como UTC y se muestran en ${zonaMostrar}.`
    : `Las fechas sin zona se muestran tal como las entrega el servidor; las que traen zona se convierten a ${zonaMostrar}.`;
}
