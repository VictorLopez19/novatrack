# Nova Track


<div style="font-size: 1.5em; font-weight: bold; margin-top: 30px;">Descripción del proyecto</div>

<hr style="height: 3px; background-color: #30363d; border: none;">

<p align="justify">
Nova Track es una aplicación web desarrollada para controlar de manera remota una excavadora IoT equipada con un ESP32. La aplicación proporciona una interfaz moderna, intuitiva y responsiva, diseñada principalmente para dispositivos móviles, que permite enviar comandos de movimiento y controlar las funciones del vehículo.
</p>

<p align="justify">
La comunicación con el sistema se realiza mediante una API desarrollada con FastAPI y desplegada en AWS. Se utiliza HTTP REST para enviar comandos y WebSocket seguro (WSS) para recibir eventos y actualizaciones en tiempo real.
</p>

<p align="justify">
Esta aplicación forma parte de un sistema compuesto por tres aplicaciones independientes: Control, Monitoreo y Administración. El presente proyecto corresponde exclusivamente a la aplicación de Control, por lo que no implementa funciones de monitoreo ni administración.
</p>

<div style="font-size: 1.5em; font-weight: bold; margin-top: 30px;">Objetivo</div>

<hr style="height: 3px; background-color: #30363d; border: none;">

<p align="justify">
Diseñar, desarrollar, integrar y publicar una aplicación web responsiva que permita controlar un vehículo IoT mediante joysticks virtuales, botones táctiles y secuencias DEMO, integrando servicios REST y WebSocket para la comunicación con el backend desplegado en AWS.
</p>

<div style="font-size: 1.5em; font-weight: bold; margin-top: 30px;">Tecnologías utilizadas</div>

<hr style="height: 3px; background-color: #30363d; border: none;">

- HTML5
- CSS3
- Bootstrap 5.3
- Bootstrap Icons
- JavaScript ES6+
- API REST
- WebSocket seguro (WSS)
- FastAPI
- AWS
- Git y GitHub
- GitHub Pages

<div style="font-size: 1.5em; font-weight: bold; margin-top: 30px;">Características principales</div>

<hr style="height: 3px; background-color: #30363d; border: none;">

- Interfaz responsiva y adaptada a dispositivos móviles.
- Joystick virtual para controlar el chasis.
- Joystick virtual para controlar el brazo de la excavadora.
- Botonera táctil para enviar comandos.
- Ejecución y cancelación de secuencias DEMO.
- Comunicación con el backend mediante HTTP REST.
- Recepción de eventos en tiempo real mediante WebSocket seguro.
- Reconexión automática ante interrupciones de comunicación.
- Indicadores del estado de conexión.
- Configuración del vehículo y de la clave de acceso.
- Control de sesión y temporizador de expiración.
- Mensajes de confirmación, advertencia y error.
- Botón de detención de emergencia.
- Compatibilidad con pantallas táctiles y controles mediante teclado.

<div style="font-size: 1.5em; font-weight: bold; margin-top: 30px;">Estructura del proyecto</div>

<hr style="height: 3px; background-color: #30363d; border: none;">

```text
novatrack/
│
├── index.html
├── favicon.svg
├── favicon-32.png
├── apple-touch-icon.png
├── .nojekyll
│
├── img/
│
├── css/
│   └── styles.css
│
├── docs/
│   └── PRUEBAS.md
│
└── js/
    ├── main.js
    ├── config.js
    │
    ├── core/
    │   ├── utilidades.js
    │   └── sesion.js
    │
    ├── api/
    │   ├── clienteHttp.js
    │   └── vehiculoApi.js
    │
    ├── dominio/
    │   └── catalogo.js
    │
    ├── servicios/
    │   ├── servicioComandos.js
    │   ├── servicioDemo.js
    │   ├── servicioWebSocket.js
    │   └── servicioConectividad.js
    │
    └── ui/
        ├── joystick.js
        ├── botonera.js
        ├── panelDemo.js
        ├── ajustes.js
        ├── indicadores.js
        ├── mensajes.js
        ├── temporizadorSesion.js
        ├── transicion.js
        ├── splash.js
        └── avisoGiro.js
```

<div style="font-size: 1.5em; font-weight: bold; margin-top: 30px;">Arquitectura y flujo de datos</div>

<hr style="height: 3px; background-color: #30363d; border: none;">

<p align="justify">
La aplicación utiliza una arquitectura modular basada en la separación de responsabilidades. Cada módulo se encarga de una función específica, facilitando el mantenimiento, la organización y la ampliación del proyecto.
</p>

| Módulo | Responsabilidad |
|---|---|
| `ui/` | Interfaz gráfica, controles y componentes visuales. |
| `servicios/` | Gestión de comandos, DEMO, WebSocket y conectividad. |
| `dominio/` | Catálogo y resolución de comandos. |
| `api/` | Comunicación HTTP con el backend. |
| `core/` | Utilidades generales y gestión de sesión. |

<p align="justify">
El flujo de comunicación para enviar un comando comienza en la interfaz, pasa por el servicio de comandos y continúa hacia los módulos encargados de realizar la petición HTTP. Posteriormente, el backend procesa la solicitud y comunica los eventos correspondientes mediante WebSocket.
</p>

```text
Joystick / Botonera
        │
        ▼
 servicioComandos
        │
        ▼
   vehiculoApi
        │
        ▼
   clienteHttp
        │
        ▼
  API REST (AWS)
        │
        ▼
      Backend
        │
        ▼
 WebSocket seguro
        │
        ▼
 servicioWebSocket
        │
        ▼
    Interfaz
```

<p align="justify">
La aplicación también utiliza un almacén de estado y un emisor de eventos para compartir información entre los módulos sin generar dependencias circulares.
</p>

<div style="font-size: 1.5em; font-weight: bold; margin-top: 30px;">Funcionamiento de la aplicación</div>

<hr style="height: 3px; background-color: #30363d; border: none;">

<div style="font-size: 1.17em; font-weight: bold; margin-top: 22px;">1. Inicialización</div>

<p align="justify">
Al iniciar la aplicación se muestra una pantalla de carga durante aproximadamente 3.5 segundos. Después se comprueba la disponibilidad de la API, se establece la conexión WebSocket y se solicitan los datos del vehículo, el catálogo de comandos y las DEMO disponibles.
</p>

<p align="justify">
Las solicitudes de información se realizan de manera paralela. Si existe un vehículo previamente seleccionado, se recupera su identificador; de lo contrario, se utiliza el vehículo definido como predeterminado en la configuración.
</p>

<div style="font-size: 1.17em; font-weight: bold; margin-top: 22px;">2. Configuración del vehículo</div>

<p align="justify">
El apartado de ajustes permite seleccionar un vehículo activo e introducir la clave de acceso requerida por el backend. La clave se conserva en sessionStorage durante la sesión de la pestaña.
</p>

<p align="justify">
Si falta información necesaria, la aplicación solicita completar la configuración antes de permitir el envío de comandos.
</p>

<div style="font-size: 1.17em; font-weight: bold; margin-top: 22px;">3. Joysticks virtuales</div>

<p align="justify">
La aplicación incorpora dos joysticks virtuales: uno para controlar el chasis y otro para manejar el brazo de la excavadora. Los controles utilizan Pointer Events, por lo que admiten interacciones mediante pantalla táctil, mouse y lápiz digital.
</p>

- Zona muerta del 35 % para evitar movimientos involuntarios.
- Identificación de la dirección predominante.
- Histéresis para estabilizar los cambios diagonales.
- Envío de comandos únicamente cuando cambia la dirección.
- Retorno al centro al soltar el control.
- Detención al cancelar o perder el puntero.
- Detención al cambiar de pestaña o perder el foco.
- Compatibilidad con las teclas de dirección del teclado.

<div style="font-size: 1.17em; font-weight: bold; margin-top: 22px;">4. Botonera de control</div>

<p align="justify">
La botonera permite ejecutar comandos individuales mediante botones táctiles. Cada botón representa una acción disponible en el catálogo proporcionado por el backend.
</p>

<p align="justify">
Los botones presentan diferentes estados visuales para indicar si un comando está disponible, presionado, enviándose, aceptado, presenta un error o se encuentra deshabilitado.
</p>

<div style="font-size: 1.17em; font-weight: bold; margin-top: 22px;">5. Gestión de comandos</div>

<p align="justify">
Antes de enviar un comando, el servicio correspondiente verifica que exista un vehículo seleccionado, que la sesión sea válida, que el comando esté disponible en el catálogo y que no se encuentre activa una DEMO.
</p>

<p align="justify">
La aplicación permite controlar un movimiento a la vez. Si se realizan cambios mientras existe una solicitud en proceso, se conserva el último movimiento solicitado para evitar enviar comandos innecesarios.
</p>

<p align="justify">
Los comandos se envían mediante una petición POST al endpoint de movimientos, incluyendo el identificador del comando y su origen.
</p>

<div style="font-size: 1.17em; font-weight: bold; margin-top: 22px;">6. Detención de emergencia</div>

<p align="justify">
El botón DETENER permite interrumpir el control actual y tiene prioridad sobre los demás comandos. También puede ejecutarse mediante la tecla Escape.
</p>

<p align="justify">
Al activarse, se descartan los comandos pendientes, se libera el control y, si existe una DEMO activa, se solicita su cancelación. Cuando no hay una DEMO activa, se envía el comando de detención inmediatamente.
</p>

<p align="justify">
Si existe una petición de movimiento en proceso, la aplicación vuelve a enviar DETENER al finalizarla para procurar que la última orden recibida por el backend sea la de detención.
</p>

<div style="font-size: 1.17em; font-weight: bold; margin-top: 22px;">7. Secuencias DEMO</div>

<p align="justify">
La aplicación obtiene las DEMO disponibles mediante el backend y las presenta en un carrusel de selección. Para iniciar una secuencia se solicita una confirmación mediante una doble pulsación.
</p>

<p align="justify">
La ejecución y temporización de los movimientos corresponden al backend. La aplicación recibe eventos WebSocket que permiten actualizar el estado de la DEMO, mostrar el movimiento actual y conocer cuándo finaliza, se cancela o presenta un error.
</p>

<p align="justify">
Mientras una DEMO está activa, los controles de movimiento permanecen bloqueados, excepto la opción de detener o cancelar. Si se intenta iniciar una DEMO incompatible con otra ejecución activa, el backend puede responder con un conflicto HTTP 409.
</p>

<div style="font-size: 1.17em; font-weight: bold; margin-top: 22px;">8. Comunicación WebSocket</div>

<p align="justify">
La conexión WebSocket utiliza WSS para recibir actualizaciones en tiempo real. La aplicación muestra los estados de conexión, administra los intentos de reconexión y procesa los eventos enviados por el servidor.
</p>

- Reconexión automática con espera progresiva y variación aleatoria.
- Tiempo máximo de espera de reconexión de 15 segundos.
- Envío de ping cada 20 segundos.
- Tiempo de espera de pong de 8 segundos.
- Reconexión inmediata al recuperar la conexión de red.
- No se reintenta automáticamente cuando el servidor cierra la conexión con el código 1008.

<p align="justify">
La recepción del evento de estado inicial permite conocer el estado de conexión que reporta el vehículo al backend. Sin embargo, que el navegador esté conectado mediante WebSocket no significa necesariamente que el vehículo físico esté conectado.
</p>

<div style="font-size: 1.17em; font-weight: bold; margin-top: 22px;">9. Indicadores de conectividad</div>

<p align="justify">
El apartado de información presenta el estado de la conexión WebSocket, la disponibilidad de la API y, cuando existe un endpoint configurado, el estado de la base de datos.
</p>

<p align="justify">
La disponibilidad de la API se comprueba periódicamente y también cuando se recupera la conexión de red o se vuelve a la pestaña. La información de la base de datos se considera sin verificar cuando no existe un endpoint específico para comprobarla.
</p>

<div style="font-size: 1.17em; font-weight: bold; margin-top: 22px;">10. Sesión y seguridad</div>

<p align="justify">
La clave de acceso se envía mediante el encabezado HTTP X-API-Key en las operaciones protegidas. Se almacena en sessionStorage y tiene una vigencia de 30 minutos desde su guardado.
</p>

<p align="justify">
La aplicación muestra avisos cuando se aproxima la expiración de la sesión. Durante los últimos dos minutos se presenta una advertencia mediante el temporizador y los mensajes de la interfaz.
</p>

<p align="justify">
Las consultas de información que no requieren autenticación se realizan sin enviar la clave. Las operaciones protegidas, como el envío de movimientos y el control de DEMO, utilizan el encabezado correspondiente.
</p>

<div style="font-size: 1.17em; font-weight: bold; margin-top: 22px;">11. Mensajes de la interfaz</div>

<p align="justify">
La aplicación dispone de un sistema de notificaciones que informa sobre las operaciones realizadas. Los mensajes se clasifican en información, aceptación, advertencia y error.
</p>

<p align="justify">
Las notificaciones muestran la hora y un contador cuando se repite un mismo mensaje. Se presentan en la esquina inferior derecha y desaparecen automáticamente después de cinco segundos.
</p>

<div style="font-size: 1.17em; font-weight: bold; margin-top: 22px;">12. Orientación de pantalla</div>

<p align="justify">
La interfaz incluye un aviso para girar el dispositivo cuando se utiliza en orientación vertical. En los dispositivos compatibles se intenta activar la pantalla completa y bloquear la orientación horizontal. En iOS estas funciones pueden estar limitadas por el navegador.
</p>

<div style="font-size: 1.5em; font-weight: bold; margin-top: 30px;">Contrato de la API</div>

<hr style="height: 3px; background-color: #30363d; border: none;">

<p align="justify">
La aplicación consume los siguientes endpoints del backend desarrollado con FastAPI:
</p>

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/` | Comprueba la disponibilidad de la API. |
| GET | `/vehiculos` | Obtiene los vehículos disponibles. |
| GET | `/vehiculos/{id}` | Obtiene la información de un vehículo. |
| GET | `/vehiculos/{id}/comandos` | Obtiene el catálogo de comandos. |
| GET | `/vehiculos/{id}/demos` | Obtiene las DEMO disponibles. |
| POST | `/vehiculos/{id}/movimientos` | Envía un comando de movimiento. |
| POST | `/control-demo/{id_demo}/iniciar?id_vehiculo={id}` | Inicia una DEMO. |
| POST | `/control-demo/cancelar?id_vehiculo={id}` | Cancela una DEMO. |
| WSS | `/ws/vehiculos/{id}` | Recibe eventos del vehículo en tiempo real. |

<div style="font-size: 1.17em; font-weight: bold; margin-top: 22px;">Envío de movimientos</div>

<p align="justify">
Los comandos de movimiento se envían mediante una petición POST con un cuerpo JSON que contiene el identificador del comando y el origen de la solicitud.
</p>

```json
{
  "id_comando": 1,
  "origen": "WEB_JOYSTICK_CHASIS"
}
```

<p align="justify">
Los posibles orígenes identificados por la aplicación son:
</p>

- `WEB_JOYSTICK_CHASIS`
- `WEB_JOYSTICK_BRAZO`
- `WEB_BOTON`
- `WEB_DETENER`

<div style="font-size: 1.17em; font-weight: bold; margin-top: 22px;">Eventos WebSocket</div>

<p align="justify">
La aplicación procesa los eventos recibidos desde el backend para actualizar el estado de conexión, los movimientos y las secuencias DEMO.
</p>

- `estado_inicial`
- `movimiento`
- `demo_inicio`
- `demo_movimiento`
- `demo_fin`
- `demo_cancelada`
- `demo_error`
- `pong`

<div style="font-size: 1.5em; font-weight: bold; margin-top: 30px;">Configuración</div>

<hr style="height: 3px; background-color: #30363d; border: none;">

<p align="justify">
Los parámetros generales de la aplicación se encuentran en el archivo <code>js/config.js</code>. Desde este archivo se pueden modificar las direcciones de conexión, el vehículo predeterminado, los tiempos de espera y las opciones de los controles.
</p>

| Parámetro | Descripción |
|---|---|
| `apiBaseUrl` | Dirección base de la API REST. |
| `wsBaseUrl` | Dirección base del servidor WebSocket. |
| `vehiculoPorDefecto` | Identificador del vehículo inicial. |
| `creditos` | Información de créditos de la aplicación. |
| `tiempos` | Tiempos de espera y configuración temporal. |
| `endpoints` | Rutas adicionales, como la comprobación de la base de datos. |
| `comandos` | Catálogo de comandos utilizado por la interfaz. |
| `joysticks` | Configuración de los joysticks virtuales. |
| `botones` | Configuración de los botones de control. |

<p align="justify">
Si cambia el dominio del backend, también debe actualizarse la política CSP del archivo <code>index.html</code>, específicamente la directiva <code>connect-src</code>, para permitir las conexiones HTTP y WebSocket correspondientes.
</p>

<div style="font-size: 1.5em; font-weight: bold; margin-top: 30px;">Requisitos del backend</div>

<hr style="height: 3px; background-color: #30363d; border: none;">

<p align="justify">
Para que la aplicación funcione correctamente, el backend debe proporcionar los endpoints REST y WebSocket descritos anteriormente, permitir las solicitudes desde el dominio donde se publica la aplicación y validar la clave de acceso en las operaciones protegidas.
</p>

<p align="justify">
La configuración CORS de FastAPI debe incluir el origen de GitHub Pages:
</p>

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://victorlopez19.github.io"
    ],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["X-API-Key", "Content-Type"],
    allow_credentials=False
)
```

<p align="justify">
Para realizar pruebas desde un servidor local, también se debe agregar el origen correspondiente. Por ejemplo, si se utiliza Live Server:
</p>

```python
allow_origins=[
    "https://victorlopez19.github.io",
    "http://127.0.0.1:5500"
]
```

<p align="justify">
CORS permite controlar los orígenes autorizados para realizar solicitudes desde el navegador, pero no sustituye la autenticación. La protección de las operaciones se realiza mediante la clave X-API-Key.
</p>

<div style="font-size: 1.5em; font-weight: bold; margin-top: 30px;">Ejecución local</div>

<hr style="height: 3px; background-color: #30363d; border: none;">

<p align="justify">
Para ejecutar el proyecto localmente es necesario contar con un navegador moderno y un servidor HTTP local. Debido al uso de módulos nativos de JavaScript, no se recomienda abrir directamente el archivo <code>index.html</code> mediante <code>file://</code>.
</p>

<div style="font-size: 1.17em; font-weight: bold; margin-top: 22px;">Opción 1. Python</div>

```bash
python -m http.server 8080
```

<p align="justify">
Después, abrir la siguiente dirección en el navegador:
</p>

```text
http://localhost:8080
```

<div style="font-size: 1.17em; font-weight: bold; margin-top: 22px;">Opción 2. Visual Studio Code</div>

<p align="justify">
También se puede utilizar la extensión Live Server. Una vez instalada, se debe abrir el proyecto y seleccionar la opción <strong>Open with Live Server</strong>.
</p>

<p align="justify">
Para las pruebas locales es necesario configurar las direcciones de la API y WebSocket en <code>config.js</code>, además de permitir los orígenes locales en CORS y en la política CSP.
</p>

<div style="font-size: 1.5em; font-weight: bold; margin-top: 30px;">Despliegue en GitHub Pages</div>

<hr style="height: 3px; background-color: #30363d; border: none;">

<p align="justify">
La aplicación se publica mediante GitHub Pages, utilizando la rama <code>main</code> y la carpeta raíz del repositorio.
</p>

1. Subir los archivos del proyecto al repositorio de GitHub.
2. Ingresar a la sección **Settings** del repositorio.
3. Seleccionar **Pages** en el menú lateral.
4. En **Build and deployment**, seleccionar **Deploy from a branch**.
5. Elegir la rama `main` y la carpeta `/ (root)`.
6. Guardar los cambios y esperar a que finalice la publicación.

<p align="justify">
Una vez desplegada, la aplicación estará disponible en:
</p>

<p align="center">
  <a href="https://victorlopez19.github.io/novatrack">https://victorlopez19.github.io/novatrack</a>
</p>

<p align="justify">
El archivo <code>.nojekyll</code> permite evitar el procesamiento de Jekyll y facilitar la publicación de los archivos del proyecto.
</p>

<div style="font-size: 1.5em; font-weight: bold; margin-top: 30px;">Consideraciones de funcionamiento</div>

<hr style="height: 3px; background-color: #30363d; border: none;">

- La aplicación requiere conexión a Internet para comunicarse con el backend desplegado.
- El servidor debe permitir las conexiones REST y WebSocket desde el dominio de publicación.
- Las operaciones protegidas requieren una clave API válida.
- La clave se conserva en `sessionStorage` y no se comparte entre pestañas.
- La sesión de la aplicación tiene una vigencia de 30 minutos desde que se guarda la clave.
- La confirmación HTTP de una solicitud no garantiza que el movimiento se haya ejecutado físicamente.
- Los eventos WebSocket confirman información procesada o comunicada por el backend, pero no necesariamente la ejecución física del mecanismo.
- La conexión WebSocket del navegador no garantiza que el ESP32 esté conectado.
- La disponibilidad de la base de datos solo puede comprobarse si el backend proporciona un endpoint para ello.
- Las funciones de voz, cámara y giroscopio no se encuentran habilitadas mientras el backend no proporcione soporte para ellas.
- La validación definitiva de la clave corresponde al backend. Una clave incorrecta puede producir una respuesta HTTP 403 y una clave ausente una respuesta HTTP 401.
- Los datos recibidos desde la API se validan antes de utilizarse y los mensajes de la interfaz se insertan mediante `textContent` para evitar interpretar datos externos como HTML.

<div style="font-size: 1.5em; font-weight: bold; margin-top: 30px;">Autor</div>

<hr style="height: 3px; background-color: #30363d; border: none;">

<p align="center">
  **Victor Manuel López Cruz**
  <br>
  Aplicación web de control para vehículo IoT.
</p>