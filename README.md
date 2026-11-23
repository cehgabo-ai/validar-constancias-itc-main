# Manual técnico sencillo — Constancias MOOC TecNM

## 1. Objetivo y cambios realizados

El sistema permite generar una constancia institucional con folio y QR después de revisar la evidencia de un curso MOOC de TecNM.

Antes, el campo `archivoPDF` comprobaba que hubiera un archivo seleccionado y conservaba su nombre. Se agregó la lectura del PDF, la búsqueda de su QR y la comparación con el certificado original del emisor. Se conservaron el diseño sencillo, el catálogo de cursos, los formatos por carrera y el historial.

La versión actual utiliza PHP y XAMPP. Se retiraron el servidor de Python y los archivos de desarrollo del paquete para compartir. Solo se admite el emisor `mooc.tecnm.mx`.

## 2. Tecnologías utilizadas

| Tecnología | Función en el sistema |
| --- | --- |
| HTML | Formulario, catálogo y estructura de la página. |
| CSS y Bootstrap | Colores, estilos y adaptación a distintos tamaños de pantalla. Los estilos propios están dentro de `index.html`. |
| JavaScript | Lectura del archivo, comparación, mensajes, folios y acciones de generación. |
| PDF.js | Abre y representa las páginas del PDF y extrae el texto disponible. |
| jsQR | Lee los códigos QR de las imágenes obtenidas del PDF. |
| Tesseract.js | Intenta reconocer texto de escaneos e imágenes mediante OCR, con un modelo en español. |
| QRCode.js | Genera el QR de la constancia institucional. |
| PHP, cURL y DOM | Consultan por HTTPS el certificado original de TecNM y extraen sus datos del HTML recibido. |
| Apache, incluido en XAMPP | Sirve la página y ejecuta el servicio PHP. |
| `localStorage` | Conserva el historial en el navegador y permite exportarlo como CSV. |

Las bibliotecas y sus licencias están incluidas en `vendor/`. No es necesario instalar Python, Node.js, npm, Composer ni una base de datos para ejecutar esta versión. No se necesita iniciar MySQL.

## 3. Archivos principales

| Archivo o carpeta | Responsabilidad |
| --- | --- |
| `index.html` | Interfaz, estilos propios, catálogo de cursos y selección de MOOC TecNM. |
| `revision-inicio.js` | Detecta fallos de carga del lector y permite recargarlo. |
| `revision-evidencia.js` | Coordina PDF.js, OCR, lectura del QR y consulta al servicio PHP. Muestra los resultados. |
| `revision-core.js` | Extrae campos, valida enlaces y aplica las reglas de comparación. |
| `qr-worker.js` | Ejecuta la detección del QR en un proceso de trabajo del navegador para reducir bloqueos de la interfaz. |
| `script-plataform.js` | Genera folios, la constancia institucional y su QR; administra el historial y las descargas. |
| `qrcode.min.js` | Biblioteca utilizada para generar el QR institucional. |
| `api/revisar-original.php` | Recibe la URL del QR y devuelve un resultado JSON. |
| `api/emisor-tecnm.php` | Valida la URL, consulta la página pública de TecNM e interpreta nombre, curso, clave y fecha visible. |
| `vendor/` | Bibliotecas del navegador, motores de OCR, fuentes y recursos necesarios. Conservarla completa. |
| `.htaccess` | Configura los tipos de archivo JavaScript/WASM y evita conservar versiones antiguas de los scripts principales en caché. |
| `logo.png`, `encabezado.png`, `pie_pagina.png` | Imágenes utilizadas en la página y en la constancia institucional. |

Para modificar el catálogo, revisar `index.html`. Los firmantes por carrera y el formato de la constancia se encuentran en `script-plataform.js`.

## 4. Instalación y ejecución en XAMPP

1. Copiar o extraer la carpeta con el nombre `constancias-tecnm` dentro de `C:\xampp\htdocs\`, o en el directorio `htdocs` de la instalación utilizada.
2. Abrir el panel de XAMPP e iniciar **Apache**.
3. Entrar desde Chrome o Edge a **http://localhost/constancias-tecnm/**.
4. Si Apache utiliza otro puerto, agregarlo a la dirección; por ejemplo: `http://localhost:8080/constancias-tecnm/`.
5. Después de reemplazar archivos por una versión nueva, recargar con **Ctrl+F5** y seleccionar nuevamente el PDF.

PHP necesita las extensiones **cURL** y **DOM**, una configuración válida de certificados TLS y acceso a Internet para consultar TecNM. La versión se comprobó con Apache y PHP de XAMPP.

No abrir `index.html` con doble clic: debe utilizarse la dirección HTTP de XAMPP. Un alojamiento que únicamente sirva archivos estáticos no ejecutará el servicio PHP.

## 5. Funcionamiento de la revisión

Existen dos QR con funciones diferentes:

- **QR del certificado del curso:** lo proporciona TecNM y permite abrir el original que se utiliza para revisar la evidencia.
- **QR institucional:** lo genera nuestra página junto con el folio de la nueva constancia. Se conserva su funcionamiento anterior y no se utiliza para verificar el PDF adjunto.

El proceso es el siguiente:

1. El alumno selecciona un PDF en `archivoPDF`. La lectura comienza automáticamente y puede repetirse con **Revisar PDF**.
2. El navegador extrae texto y busca QR en todas las páginas permitidas. Si una página contiene una imagen sin texto suficiente, intenta OCR.
3. Se localizan nombre del alumno, curso, clave y fecha visible. Los campos ambiguos o con OCR dudoso quedan pendientes.
4. Se valida el enlace del QR. Solo se habilitan enlaces HTTPS del dominio exacto `mooc.tecnm.mx`; la consulta automática también exige una ruta `/certificates/` con un identificador reconocido. Si hay varios QR distintos, se debe seleccionar uno.
5. JavaScript envía únicamente la URL al servicio `api/revisar-original.php`. PHP consulta el original mediante HTTPS y devuelve sus datos. El PDF y los datos del formulario no se envían a TecNM.
6. El navegador compara los datos del PDF con los del original. El botón **Abrir constancia original** permite revisar visualmente la página del emisor.

### Reglas para generar y descargar

Deben coincidir **nombre del alumno, nombre del curso y fecha visible del certificado**. Se aceptan diferencias de mayúsculas y espacios. Los nombres parciales, las lecturas inciertas y las fechas numéricas ambiguas quedan pendientes; no se eliminan acentos ni se sustituyen letras para forzar coincidencias.

La clave también se compara cuando está disponible: una diferencia comprobada bloquea. Una clave pendiente por OCR no impide continuar si los tres campos obligatorios coinciden.

**No se compara con el formulario institucional.** Su fecha corresponde a la nueva constancia; no se usa para verificar la evidencia del curso.

| Estado | Comportamiento |
| --- | --- |
| Coinciden nombre, curso y fecha visible con el original | Permite generar y después descargar, si la lectura está completa y no hay otras diferencias comprobadas. |
| Hay diferencias con el original | Bloquea generación y descarga. |
| Pendiente de revisión del original | Mantiene bloqueadas la generación y la descarga hasta resolver la revisión. |

Cambiar el PDF o el QR seleccionado descarta los resultados anteriores. Editar los datos del formulario descarta la constancia institucional ya generada, pero no cambia ni repite la comparación PDF/original.

La opción **Descargar Constancia (PDF)** abre el formato de impresión del navegador. Para obtener el archivo, elegir **Guardar como PDF** en ese diálogo.



Documentación oficial de referencia: [XAMPP](https://www.apachefriends.org/faq_windows.html), [PDF.js](https://mozilla.github.io/pdf.js/), [jsQR](https://github.com/cozmo/jsQR), [Tesseract.js](https://github.com/naptha/tesseract.js), [cURL en PHP](https://www.php.net/manual/en/book.curl.php) y [DOMDocument](https://www.php.net/manual/en/class.domdocument.php).
