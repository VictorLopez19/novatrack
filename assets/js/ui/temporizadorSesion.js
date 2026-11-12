// Muestra la cuenta regresiva durante los últimos 2 minutos de la sesión.
import { sesion } from '../core/sesion.js';

// Define el tiempo límite para mostrar el temporizador.
const UMBRAL_MS = 2 * 60 * 1000;

// Inicia y actualiza el temporizador de la sesión.
export function iniciarTemporizador(el) {
  const texto = el.querySelector('span');

  // Actualiza el tiempo restante y la apariencia del temporizador.
  const pintar = () => {
    const ms = sesion.msRestantes();
    const visible = ms > 0 && ms <= UMBRAL_MS;

    el.hidden = !visible;

    if (!visible) return;

    const s = Math.ceil(ms / 1000);

    // Formatea el tiempo restante en minutos y segundos.
    texto.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    // Activa el estilo de urgencia cuando quedan 30 segundos o menos.
    el.classList.toggle('urgente', s <= 30);
  };

  // Realiza la primera actualización del temporizador.
  pintar();

  // Actualiza el temporizador cada segundo.
  setInterval(pintar, 1000);

  // Actualiza el temporizador cuando cambia la visibilidad de la página.
  document.addEventListener('visibilitychange', pintar);
}