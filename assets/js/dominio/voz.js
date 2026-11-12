// Interpretación local del texto reconocido: decide si es un comando directo, algo para la IA o ruido.
const limpiar = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const tokenizar = (t) => limpiar(t).split(' ').filter(Boolean);

const cache = new WeakMap();
/** Normaliza la configuración una sola vez (acentos, mayúsculas) y separa palabras sueltas de frases.
 *  Una entrada con espacios en `palabras` («garra izquierda») cuenta como frase, igual que en `frases`. */
function preparar(cfg) {
  if (cache.has(cfg)) return cache.get(cfg);
  const conjunto = (lista = []) => new Set(lista.flatMap(tokenizar));
  const p = {
    relleno: conjunto(cfg.relleno), neutras: conjunto(cfg.neutras),
    negaciones: conjunto(cfg.negaciones), urgentes: conjunto(cfg.urgentes),
    palabras: {}, frases: [],
  };
  // palabras con contenido: sin muletillas ni verbos neutros de movimiento («gira», «mueve»)
  p.esenciales = (tokens) => tokens.filter((t) => !p.relleno.has(t) && !p.neutras.has(t));
  const frase = (clave, tokens) => {
    const e = p.esenciales(tokens);
    if (e.length) p.frases.push({ clave, tokens: e });
  };
  for (const [clave, lista] of Object.entries(cfg.palabras ?? {})) {
    p.palabras[clave] = new Set();
    for (const entrada of lista) {
      const tk = tokenizar(entrada);
      if (tk.length > 1) frase(clave, tk); else tk.forEach((t) => p.palabras[clave].add(t));
    }
  }
  for (const [clave, lista] of Object.entries(cfg.frases ?? {})) {
    p.palabras[clave] ??= new Set();
    for (const f of lista) frase(clave, tokenizar(f));
  }
  cache.set(cfg, p);
  return p;
}

const posicion = (tokens, frase) => {
  for (let i = 0; i + frase.length <= tokens.length; i += 1) {
    if (frase.every((t, k) => tokens[i + k] === t)) return i;
  }
  return -1;
};

/** Frase completa («garra izquierda»). Las palabras sobrantes deben ser del mismo comando. */
function porFrase(tokens, p) {
  const utiles = p.esenciales(tokens);
  let mejor = 0; let claves = new Set();
  for (const { clave, tokens: frase } of p.frases) {
    const i = posicion(utiles, frase);
    if (i < 0) continue;
    const resto = [...utiles.slice(0, i), ...utiles.slice(i + frase.length)];
    if (!resto.every((t) => p.palabras[clave].has(t))) continue; // «avanza garra izquierda» no es una sola orden
    if (frase.length > mejor) { mejor = frase.length; claves = new Set([clave]); } else if (frase.length === mejor) claves.add(clave);
  }
  return claves.size === 1 ? [...claves][0] : null; // empate entre comandos: ambiguo
}

/** @returns {{tipo:'directo', clave:string} | {tipo:'ia'} | {tipo:'ignorar'}} */
export function interpretarDirecto(texto, cfg) {
  const p = preparar(cfg);
  const tokens = tokenizar(texto);
  const contenido = tokens.filter((t) => !p.relleno.has(t));
  if (!contenido.length) return { tipo: 'ignorar' };

  if (tokens.some((t) => p.negaciones.has(t))) return { tipo: 'ia' }; // «no avances» jamás se ejecuta como «avanza»
  if (tokens.some((t) => p.urgentes.has(t))) return { tipo: 'directo', clave: 'DETENER' };

  const clave = porFrase(tokens, p);
  if (clave) return { tipo: 'directo', clave };

  const utiles = contenido.filter((t) => !p.neutras.has(t));
  if (!utiles.length) return { tipo: 'ia' };
  const candidatos = Object.keys(p.palabras).filter((c) => utiles.every((t) => p.palabras[c].has(t)));
  if (candidatos.length === 1) return { tipo: 'directo', clave: candidatos[0] };
  if (!candidatos.length && contenido.length === 1 && contenido[0].length < 4) return { tipo: 'ignorar' }; // muletilla suelta («eh», «mm»)
  return { tipo: 'ia' };
}

/** ¿Trae una palabra de parada («alto», «detente»…) sin negación? Esas actúan al instante. */
export function esUrgente(texto, cfg) {
  const p = preparar(cfg);
  const tokens = tokenizar(texto);
  return !tokens.some((t) => p.negaciones.has(t)) && tokens.some((t) => p.urgentes.has(t));
}