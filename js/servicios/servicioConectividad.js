// Sondea la API (GET /) y, si existe, el diagnóstico de RDS.
// Sin diagnóstico, RDS se mantiene como «Sin verificar».
export class ServicioConectividad {
  #api;
  #store;
  #t;
  #timer = null;
  #activo = false;

  // Inicializa las dependencias y los tiempos de comprobación.
  constructor({ api, store, tiempos }) {
    this.#api = api;
    this.#store = store;
    this.#t = tiempos;
  }

  // Inicia las comprobaciones periódicas de conectividad.
  iniciar() {
    this.comprobar();

    this.#timer = setInterval(
      () => this.comprobar(),
      this.#t.intervaloSaludMs
    );

    // Comprueba la conexión cuando la pestaña vuelve a estar visible.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.comprobar();
    });

    // Comprueba la conexión cuando el navegador recupera Internet.
    window.addEventListener('online', () => this.comprobar());
  }

  // Verifica la disponibilidad de la API y el estado de RDS.
  async comprobar() {
    if (this.#activo) return;

    this.#activo = true;

    if (this.#store.get('api') !== 'disponible') {
      this.#store.set('api', 'comprobando');
    }

    // Comprueba si la API responde correctamente.
    try {
      await this.#api.salud();
      this.#store.set('api', 'disponible');
    } catch {
      this.#store.set('api', 'no_disponible');
    }

    // Consulta el diagnóstico de la base de datos, si está configurado.
    try {
      const r = await this.#api.dbListo(); // null si no hay endpoint configurado

      if (r !== null) this.#store.set('rds', 'disponible');
    } catch (e) {
      this.#store.set(
        'rds',
        e.status === 503 ? 'no_disponible' : 'sin_verificar'
      );
    }

    this.#activo = false;
  }

  /** Hook del cliente HTTP: un 503 indica que el backend detectó un fallo en RDS. */
  alRespuestaHttp(status, ruta) {
    if (status === 503) {
      this.#store.set('rds', 'no_disponible');
    } else if (
      status < 400 &&
      this.#store.get('rds') === 'no_disponible' &&
      !ruta.startsWith('/ws')
    ) {
      // Una respuesta correcta no confirma que RDS esté disponible.
      this.#store.set('rds', 'sin_verificar');
    }
  }
}
