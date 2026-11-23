/* Lectura local y revisión asistida. No existe aquí un estado «auténtica» ni «aprobada». */
(function () {
    'use strict';
    // Capturar la URL mientras el script clásico está ejecutándose. Una importación
    // relativa puede perder su base al cargar el script desde otro origen o file://.
    const scriptURL = document.currentScript?.src || document.baseURI;
    const recurso = ruta => new URL(ruta, scriptURL).href;
    const avisoArchivo = 'Coloca la carpeta constancias-tecnm en htdocs, inicia Apache en XAMPP y abre http://localhost/constancias-tecnm/. La lectura de PDF no funciona al abrir index.html con doble clic.';
    const C = window.RevisionCore;
    const $ = id => document.getElementById(id);
    const originalIds = ['originalNombre', 'originalCurso', 'originalClave', 'originalFechaDocumento'];
    // El catálogo completo ayuda a recomponer títulos. No se lee la selección del formulario.
    const catalogo = [...$('curso').options].map(option => option.value).filter(Boolean);
    let revision = null, activa = null, secuencia = 0, pdfURL = null, pdfLibrary, ocrLibrary, consulta = null;

    function vigente(snapshot) {
        return snapshot && snapshot.archivo === $('archivoPDF').files[0];
    }
    function notificarRevision() {
        document.dispatchEvent(new Event('revision-evidencia-actualizada'));
    }
    function limpiarManual() {
        originalIds.forEach(id => { $(id).value = ''; });
        $('situacionOriginal').value = 'pendiente';
        $('resultadoManual').textContent = 'Pendiente de revisión del original.';
    }
    function cancelarTrabajo() {
        if (!activa) return;
        const anterior = activa;
        activa = null;
        clearTimeout(anterior.reloj);
        anterior.render?.cancel();
        anterior.worker?.terminate();
        anterior.rechazarQR?.(new Error('Lectura cancelada.'));
        anterior.rechazarOCR?.(new Error('Lectura cancelada.'));
        detenerOCR(anterior);
        if (anterior.tarea) void anterior.tarea.destroy().catch(() => {});
    }
    function limpiar(mensaje = 'El PDF cambió. Vuelve a revisarlo.', conservarPDF = false) {
        secuencia++;
        consulta?.abort(); consulta = null;
        cancelarTrabajo();
        revision = null;
        if (!conservarPDF) {
            if (pdfURL) URL.revokeObjectURL(pdfURL);
            pdfURL = null;
            $('abrirPDF').hidden = true;
            $('abrirPDF').removeAttribute('href');
        }
        $('abrirOriginal').hidden = true;
        $('abrirOriginal').removeAttribute('href');
        $('qrEncontrados').replaceChildren(new Option('Sin lectura', ''));
        $('qrEncontrados').disabled = true;
        $('qrDetalle').textContent = 'No hay un enlace del emisor disponible.';
        $('textoPDF').textContent = '';
        $('avisosRevision').replaceChildren();
        $('estadoEmisor').textContent = 'Pendiente de revisión del original';
        $('comparacionOriginal').hidden = true;
        $('datosOriginal').replaceChildren();
        $('detalleConsultaOriginal').textContent = '';
        $('progresoRevision').textContent = mensaje;
        $('btnCancelarRevision').hidden = true;
        $('btnRevisar').disabled = false;
        $('revisionEvidencia').setAttribute('aria-busy', 'false');
        limpiarManual();
        mostrarTabla();
        document.dispatchEvent(new Event('evidencia-invalidada'));
    }
    function aviso(mensaje) {
        const li = document.createElement('li');
        li.textContent = mensaje;
        $('avisosRevision').append(li);
    }
    function mostrarTabla() {
        const labels = { nombre: 'Nombre', curso: 'Curso', clave: 'Clave del curso', fechaDocumento: 'Fecha visible en el certificado' };
        $('datosRevision').replaceChildren();
        for (const [field, label] of Object.entries(labels)) {
            const extracted = revision?.campos[field];
            const tr = document.createElement('tr');
            const values = [label, extracted?.value ? extracted.value + (extracted.origen === 'ocr' ? ' (OCR)' : '') +
                (extracted.confianza !== 'etiqueta' ? ' (dato candidato o ambiguo)' : '') : 'No localizado'];
            values.forEach((value, index) => {
                const cell = document.createElement(index === 0 ? 'th' : 'td');
                if (index === 0) cell.scope = 'row';
                cell.textContent = value;
                tr.append(cell);
            });
            $('datosRevision').append(tr);
        }
    }

    function compararManual() {
        $('estadoEmisor').textContent = 'Pendiente de revisión del original';
        if (!revision || !vigente(revision)) return;
        const estado = $('situacionOriginal').value;
        if (estado !== 'visible') {
            const razones = { pendiente: 'Sin revisar', inexistente: 'El administrador informa que la constancia no existe o muestra un error',
                inaccesible: 'El enlace no es accesible', sesion: 'El emisor solicita iniciar sesión' };
            $('resultadoManual').textContent = `${razones[estado]}. Pendiente de revisión del original; no se acredita autenticidad.`;
            return;
        }
        const fields = ['nombre', 'curso', 'clave', 'fechaDocumento'];
        const resultados = fields.map((field, index) => {
            const extracted = revision.campos[field];
            const value = $(originalIds[index]).value;
            if (!value || !extracted.value || extracted.confianza === 'ambiguo') return 'pendiente';
            return field === 'fechaDocumento' ? C.compararFecha(extracted.value, value) : C.comparar(extracted.value, value);
        });
        const detalle = fields.map((field, index) => `${({nombre:'Nombre',curso:'Curso',clave:'Clave',fechaDocumento:'Fecha visible'})[field]}: ${({coincide:'coincide',diferente:'hay diferencias',pendiente:'pendiente'})[resultados[index]]}`).join('. ');
        const hayDiferencias = resultados.includes('diferente');
        const coincide = resultados.every(value => value === 'coincide');
        $('resultadoManual').textContent = `${hayDiferencias ? 'Hay diferencias' : coincide ? 'Coinciden los datos transcritos del original' : 'Comparación manual pendiente o dudosa'}. ${detalle}. Anotación sin aprobación administrativa protegida.`;
        if (hayDiferencias) $('estadoEmisor').textContent = 'Hay diferencias en la comparación manual; pendiente de dictamen administrativo';
    }

    function seleccionarQR() {
        consulta?.abort(); consulta = null;
        limpiarManual();
        if (revision) delete revision.original;
        $('comparacionOriginal').hidden = true;
        $('datosOriginal').replaceChildren();
        $('detalleConsultaOriginal').textContent = '';
        $('estadoEmisor').textContent = 'Pendiente de revisión del original';
        notificarRevision();
        const selection = $('qrEncontrados').value;
        const item = selection === '' ? null : revision?.qrs[Number(selection)];
        const result = item ? C.validarURL(item.data) : null;
        $('abrirOriginal').hidden = !result?.permitida;
        $('abrirOriginal').removeAttribute('href');
        if (result?.permitida) $('abrirOriginal').href = result.url;
        $('qrDetalle').textContent = item ? `Página(s) ${item.paginas.join(', ')}: ${item.data}\n${result.motivo}` : 'Selecciona un QR para revisar su enlace. No se abre ni se consulta automáticamente.';
        if (result?.permitida && revision) void consultarOriginal(result.url, revision);
    }

    async function consultarOriginal(url, snapshot) {
        const identifier = C.identificadorEmisor(url);
        if (!identifier) {
            $('detalleConsultaOriginal').textContent = 'Este QR no contiene una ruta de certificado reconocida para consulta. La institución debe revisar el original.';
            return;
        }
        const controller = new AbortController();
        consulta = controller;
        const version = secuencia;
        const sigueVigente = () => consulta === controller && revision === snapshot && secuencia === version && vigente(snapshot);
        const reloj = setTimeout(() => controller.abort(), 15000);
        $('estadoEmisor').textContent = 'Consultando la constancia original…';
        $('detalleConsultaOriginal').textContent = '';
        notificarRevision();
        try {
            const response = await fetch(new URL('api/revisar-original.php', document.baseURI), {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }), credentials: 'omit', cache: 'no-store', signal: controller.signal
            });
            if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('El servicio de comparación no está disponible en este alojamiento.');
            const data = await response.json();
            if (!sigueVigente()) return;
            if (data.estado !== 'consultado') throw new Error(data.motivo || 'No se pudo leer el original del emisor.');
            if (data.certificadoId !== identifier || C.identificadorEmisor(data.urlFinal) !== identifier ||
                !data.datos || !['nombre', 'curso', 'clave'].every(field => typeof data.datos[field] === 'string' && data.datos[field].trim() && data.datos[field].length <= 500) ||
                typeof data.datos.fechaDocumento !== 'string' || data.datos.fechaDocumento.length > 500) {
                throw new Error('La respuesta del emisor no permite confirmar los datos de este certificado.');
            }
            const comparacion = C.compararOriginal(snapshot.campos, data.datos);
            snapshot.original = { datos: data.datos, comparacion, consultadoEn: data.consultadoEn, url: data.urlFinal };
            $('estadoEmisor').textContent = comparacion.estado;
            const labels = { nombre: 'Nombre', curso: 'Curso', clave: 'Clave del curso', fechaDocumento: 'Fecha visible en el certificado' };
            const resultados = { coincide: 'Coincide', diferente: 'Hay diferencias', pendiente: 'Pendiente / lectura dudosa' };
            for (const [field, label] of Object.entries(labels)) {
                const row = document.createElement('tr');
                [label, snapshot.campos[field]?.value || 'No localizado', data.datos[field] || 'No identificado en el original', resultados[comparacion.resultados[field]]].forEach((value, index) => {
                    const cell = document.createElement(index ? 'td' : 'th');
                    if (!index) cell.scope = 'row';
                    cell.textContent = value; row.append(cell);
                });
                $('datosOriginal').append(row);
            }
            $('comparacionOriginal').hidden = false;
            $('detalleConsultaOriginal').textContent = 'Datos recibidos del original en mooc.tecnm.mx. Los campos ausentes o dudosos quedan pendientes de revisión por la institución.';
        } catch (error) {
            if (!sigueVigente()) return;
            delete snapshot.original;
            $('estadoEmisor').textContent = 'Pendiente de revisión del original';
            $('detalleConsultaOriginal').textContent = error.name === 'AbortError' ? 'El emisor tardó demasiado en responder. Tu documento queda pendiente de revisión.' : `${error.message} La revisión del original queda pendiente.`;
        } finally {
            clearTimeout(reloj);
            if (consulta === controller) consulta = null;
            notificarRevision();
        }
    }

    function textoPagina(items) {
        const rows = new Map();
        let caracteres = 0;
        if (items.length > 30000) throw new Error('Demasiados fragmentos de texto');
        for (const item of items) {
            if (typeof item.str !== 'string' || !item.str.trim()) continue;
            caracteres += item.str.length;
            if (caracteres > C.LIMITES.caracteres) throw new Error('Demasiado texto');
            const y = Math.round((item.transform?.[5] || 0) / 3) * 3;
            let row = rows.get(y);
            if (!row) { row = { y, items: [] }; rows.set(y, row); }
            row.items.push({ x: item.transform?.[4] || 0, str: item.str });
        }
        return [...rows.values()].sort((a,b) => b.y - a.y).map(row => row.items.sort((a,b) => a.x - b.x).map(item => item.str).join(' ')).join('\n');
    }
    async function libreriaPDF() {
        if (!pdfLibrary) pdfLibrary = import(recurso('vendor/pdfjs/pdf.min.mjs')).then(lib => {
            lib.GlobalWorkerOptions.workerSrc = recurso('vendor/pdfjs/pdf.worker.min.mjs');
            return lib;
        }).catch(() => {
            pdfLibrary = null;
            throw new Error('No se pudo cargar el lector PDF. Abre la página desde su servidor y comprueba que los archivos del lector estén disponibles.');
        });
        return pdfLibrary;
    }
    function leerQR(job, image) {
        return new Promise((resolve, reject) => {
            job.worker = new Worker(recurso('qr-worker.js'));
            job.rechazarQR = reject;
            const finish = (error, data) => {
                job.worker?.terminate(); job.worker = null; job.rechazarQR = null;
                error ? reject(error) : resolve(data);
            };
            job.worker.onmessage = ({data}) => finish(data.error ? new Error(data.error) : null, data);
            job.worker.onerror = () => finish(new Error('No se pudo iniciar el lector QR local.'));
            job.worker.postMessage({ pixels: image.data.buffer, width: image.width, height: image.height, limite: C.LIMITES.qrPorPagina }, [image.data.buffer]);
        });
    }
    function comprobar(job) { if (activa !== job || job.id !== secuencia) throw new Error('Lectura descartada.'); }

    function detenerOCR(job) {
        job.ocrVersion = (job.ocrVersion || 0) + 1;
        if (job.ocr) void job.ocr.terminate().catch(() => {});
        job.ocr = null;
        // Si se cancela mientras se inicia el motor, terminarlo en cuanto esté listo.
        if (job.ocrInicializacion) void job.ocrInicializacion.then(worker => worker.terminate()).catch(() => {});
        job.ocrInicializacion = null;
    }
    async function reconocerImagen(job, canvas, numero) {
        const presupuesto = Math.min(15000, 25000 - (job.tiempoOCR || 0));
        if (presupuesto <= 0 || (job.paginasOCR || 0) >= 3) throw new Error('Se alcanzó el límite de OCR local.');
        const inicio = Date.now(), version = job.ocrVersion || 0;
        let reloj;
        const tarea = (async () => {
            if (!job.ocr) {
                if (!ocrLibrary) ocrLibrary = import(recurso('vendor/ocr/tesseract.esm.min.js')).catch(error => { ocrLibrary = null; throw error; });
                const { default: Tesseract } = await ocrLibrary;
                comprobar(job);
                if (version !== (job.ocrVersion || 0)) throw new Error('OCR descartado.');
                job.ocrInicializacion = Tesseract.createWorker('spa', 1, {
                    workerPath: recurso('vendor/ocr/worker.min.js'), corePath: recurso('vendor/ocr/core/'),
                    langPath: recurso('vendor/ocr/lang').replace(/\/$/, ''),
                    workerBlobURL: false, cacheMethod: 'none', gzip: true,
                    logger: info => {
                        if (activa === job && version === (job.ocrVersion || 0)) $('progresoRevision').textContent = `Leyendo texto de la imagen: página ${numero}… ${Math.round((info.progress || 0) * 100)} %`;
                    },
                    errorHandler: () => {}
                });
                const worker = await job.ocrInicializacion;
                job.ocrInicializacion = null;
                if (activa !== job || version !== (job.ocrVersion || 0)) { await worker.terminate(); throw new Error('OCR descartado.'); }
                job.ocr = worker;
                await worker.setParameters({ tessedit_pageseg_mode: '3', user_defined_dpi: '200' });
            }
            const {data} = await job.ocr.recognize(canvas, {}, { text: true, blocks: true });
            comprobar(job);
            if (version !== (job.ocrVersion || 0)) throw new Error('OCR descartado.');
            return { text: data.text || '', palabras: (data.blocks || []).flatMap(block =>
                (block.paragraphs || []).flatMap(paragraph => (paragraph.lines || []).flatMap(line => line.words || []))) };
        })();
        try {
            return await Promise.race([tarea, new Promise((resolve, reject) => {
                job.rechazarOCR = reject;
                reloj = setTimeout(() => {
                    job.tiempoOCR = 25000;
                    detenerOCR(job);
                    reject(new Error('Se agotó el tiempo de reconocimiento de texto.'));
                }, presupuesto);
            })]);
        } finally {
            clearTimeout(reloj); job.rechazarOCR = null;
            job.tiempoOCR = (job.tiempoOCR || 0) + Date.now() - inicio;
            job.paginasOCR = (job.paginasOCR || 0) + 1;
        }
    }

    async function revisar() {
        limpiar('Preparando lectura local…');
        if (window.location.protocol === 'file:') {
            $('progresoRevision').textContent = avisoArchivo;
            return;
        }
        const archivo = $('archivoPDF').files[0];
        if (!archivo) { $('progresoRevision').textContent = 'Selecciona un PDF para iniciar la revisión.'; return; }
        const job = { id: secuencia };
        activa = job;
        const snapshot = { archivo };
        $('btnRevisar').disabled = true;
        $('btnCancelarRevision').hidden = false;
        $('revisionEvidencia').setAttribute('aria-busy', 'true');
        job.reloj = setTimeout(() => limpiar('Se alcanzó el límite de 60 segundos. La revisión sigue pendiente; usa un PDF más sencillo o revisión manual.', true), C.LIMITES.tiempo);
        let pdf;
        try {
            if (!/\.pdf$/i.test(archivo.name) || archivo.size === 0 || archivo.size > C.LIMITES.bytes) throw new Error('Selecciona un PDF no vacío de hasta 10 MB.');
            const signature = new TextDecoder().decode(await archivo.slice(0, 5).arrayBuffer());
            comprobar(job);
            if (signature !== '%PDF-') throw new Error('El archivo no tiene una cabecera PDF válida.');
            pdfURL = URL.createObjectURL(archivo);
            $('abrirPDF').href = pdfURL; $('abrirPDF').hidden = false;
            const lib = await libreriaPDF(); comprobar(job);
            const bytes = new Uint8Array(await archivo.arrayBuffer()); comprobar(job);
            job.tarea = lib.getDocument({ data: bytes, isEvalSupported: false, stopAtErrors: true,
                maxImageSize: 16000000, canvasMaxAreaInBytes: 16000000,
                cMapUrl: recurso('vendor/pdfjs/cmaps/'), cMapPacked: true,
                standardFontDataUrl: recurso('vendor/pdfjs/standard_fonts/'),
                wasmUrl: recurso('vendor/pdfjs/wasm/'),
                iccUrl: recurso('vendor/pdfjs/iccs/') });
            job.tarea.onPassword = () => { if (activa === job) limpiar('PDF protegido con contraseña. Usa una copia legible autorizada o revisión manual; no se ha completado la lectura.', true); };
            pdf = await job.tarea.promise; comprobar(job);
            if (pdf.numPages > C.LIMITES.paginas) throw new Error('El PDF supera las 20 páginas. No se hizo una revisión parcial; requiere revisión manual o una copia más breve.');
            const pages = [], qrs = [], warnings = [], palabrasOCR = [];
            let completa = true, caracteres = 0, usoOCR = false;
            for (let numero = 1; numero <= pdf.numPages; numero++) {
                comprobar(job);
                $('progresoRevision').textContent = `Leyendo texto y QR: página ${numero} de ${pdf.numPages}…`;
                const page = await pdf.getPage(numero); comprobar(job);
                let canvas, necesitaOCR = false;
                try {
                    try {
                        const content = await page.getTextContent(); comprobar(job);
                        const text = textoPagina(content.items);
                        caracteres += text.length;
                        if (caracteres > C.LIMITES.caracteres) throw new Error('Límite de texto');
                        pages[numero - 1] = text;
                        if (text.replace(/\s/g, '').length < 30) {
                            necesitaOCR = true;
                        }
                    } catch (error) {
                        comprobar(job); completa = false;
                        warnings.push(`Página ${numero}: texto ilegible o límite de texto alcanzado; requiere revisión manual.`);
                    }
                    try {
                        const base = page.getViewport({ scale: 1 });
                        if (!Number.isFinite(base.width * base.height) || base.width <= 0 || base.height <= 0) throw new Error('Dimensiones inválidas');
                        const scale = Math.min(3, 2200 / Math.max(base.width, base.height), Math.sqrt(C.LIMITES.pixeles / (base.width * base.height)));
                        const viewport = page.getViewport({ scale });
                        canvas = document.createElement('canvas');
                        canvas.width = Math.max(1, Math.floor(viewport.width)); canvas.height = Math.max(1, Math.floor(viewport.height));
                        const context = canvas.getContext('2d', { willReadFrequently: true });
                        job.render = page.render({ canvasContext: context, viewport, background: 'rgb(255,255,255)' });
                        await job.render.promise; comprobar(job); job.render = null;
                        const result = await leerQR(job, context.getImageData(0, 0, canvas.width, canvas.height)); comprobar(job);
                        if (result.limitado) { completa = false; warnings.push(`Página ${numero}: demasiados QR; la detección puede estar incompleta.`); }
                        for (const data of result.codigos) {
                            const previous = qrs.find(item => item.data === data);
                            if (previous) previous.paginas.push(numero); else qrs.push({ data, paginas: [numero] });
                        }
                        if (necesitaOCR) {
                            try {
                                const reconocido = await reconocerImagen(job, canvas, numero); comprobar(job);
                                if (reconocido.text.replace(/\s/gu, '').length < 30 || caracteres + reconocido.text.length > C.LIMITES.caracteres) throw new Error('Texto insuficiente');
                                pages[numero - 1] = reconocido.text;
                                caracteres += reconocido.text.length;
                                palabrasOCR.push(...reconocido.palabras);
                                usoOCR = true;
                                warnings.push(`Página ${numero}: texto leído mediante OCR. Los datos dudosos quedan pendientes de revisión.`);
                            } catch (error) {
                                comprobar(job); completa = false;
                                warnings.push(`Página ${numero}: el OCR no pudo completar la lectura del texto. La institución deberá revisar el documento; el QR leído se conserva.`);
                            }
                        }
                    } catch (error) {
                        comprobar(job); completa = false;
                        warnings.push(`Página ${numero}: no se pudo completar la lectura visual del QR. Revisa el PDF manualmente.`);
                    }
                } finally { if (canvas) { canvas.width = 0; canvas.height = 0; } page.cleanup(); }
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            comprobar(job);
            if (!vigente(snapshot)) return;
            const text = pages.join('\n');
            const campos = C.extraerCampos(text, catalogo);
            revision = { ...snapshot, campos: usoOCR ? C.marcarCamposOCR(campos, palabrasOCR) : campos,
                qrs, completa, usoOCR, paginas: pdf.numPages };
            $('textoPDF').textContent = text || 'No hay texto extraíble. Requiere OCR o revisión manual.';
            mostrarTabla();
            warnings.forEach(aviso);
            if (!qrs.length) aviso('No se detectó un QR legible. La revisión del original queda pendiente; usa revisión manual.');
            if (qrs.length > 1) aviso('Hay varios QR distintos. Selecciona explícitamente el que corresponda a la constancia original del curso.');
            if (qrs.some(item => !C.validarURL(item.data).permitida)) aviso('Hay QR con contenido o dominio no autorizado. Sus enlaces no se habilitan.');
            $('qrEncontrados').replaceChildren(new Option(qrs.length ? 'Selecciona un QR' : 'No se detectó QR', ''));
            qrs.forEach((item, index) => $('qrEncontrados').add(new Option(`QR ${index + 1} · página(s) ${item.paginas.join(', ')} · ${C.validarURL(item.data).permitida ? 'dominio autorizado' : 'enlace bloqueado'}`, String(index))));
            $('qrEncontrados').disabled = !qrs.length;
            if (qrs.length === 1) $('qrEncontrados').value = '0';
            seleccionarQR();
            $('progresoRevision').textContent = `Lectura ${completa ? 'completada' : 'incompleta'}: ${pdf.numPages} página(s). Revisa debajo la comparación con el original del emisor.`;
        } catch (error) {
            if (activa === job) {
                $('progresoRevision').textContent = error.name === 'InvalidPDFException' ? 'PDF inválido o ilegible. Requiere una copia legible o revisión manual.' : `No se completó la lectura. ${error.message || 'Comprueba que las dependencias locales estén disponibles y sirve la página por HTTP(S).'} Revisión pendiente.`;
                aviso('No se acredita autenticidad. Puedes revisar una copia legible del documento manualmente.');
            }
        } finally {
            clearTimeout(job.reloj);
            detenerOCR(job);
            if (job.tarea) await job.tarea.destroy().catch(() => {});
            if (activa === job) {
                activa = null;
                $('btnRevisar').disabled = false;
                $('btnCancelarRevision').hidden = true;
                $('revisionEvidencia').setAttribute('aria-busy', 'false');
            }
        }
    }

    $('btnRevisar').addEventListener('click', revisar);
    $('btnCancelarRevision').addEventListener('click', () => limpiar('Lectura cancelada. Pendiente de revisión.'));
    $('archivoPDF').addEventListener('change', () => { limpiar(); if ($('archivoPDF').files[0]) void revisar(); });
    $('qrEncontrados').addEventListener('change', seleccionarQR);
    [...originalIds, 'situacionOriginal'].forEach(id => $(id).addEventListener('input', compararManual));
    window.addEventListener('pagehide', () => { consulta?.abort(); cancelarTrabajo(); if (pdfURL) URL.revokeObjectURL(pdfURL); });
    window.RevisionEvidencia = Object.freeze({
        resumen() {
            if (!revision || !vigente(revision)) return null;
            const selection = $('qrEncontrados').value;
            const qr = selection === '' ? null : revision.qrs[Number(selection)];
            const idSeleccionado = qr ? C.identificadorEmisor(qr.data) : null;
            const permiteDescarga = !consulta && revision.completa && revision.original?.comparacion.permiteDescarga === true &&
                !!idSeleccionado && idSeleccionado === C.identificadorEmisor(revision.original.url) &&
                window.RevisionInicio?.disponible() !== false;
            return { estadoLectura: revision.completa ? 'Lectura completada' : 'Lectura incompleta',
                estadoEmisor: revision.original?.comparacion.estado || 'Pendiente de revisión del original', aprobacionAdministrativa: false,
                permiteDescarga: !!permiteDescarga, lecturaCompleta: revision.completa, paginas: revision.paginas };
        }
    });
    mostrarTabla();
    if (window.location.protocol === 'file:') {
        $('avisoArchivoLocal').hidden = false;
        $('progresoRevision').textContent = avisoArchivo;
    }
})();
