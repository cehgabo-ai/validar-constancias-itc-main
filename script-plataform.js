
        let qrDataURL = null;
        let versionGeneracion = 0;
        let generandoConstancia = false;
        const MENSAJE_VERIFICACION = 'Para generar o descargar la constancia deben coincidir el nombre, el curso y la fecha visible del PDF con el original del QR. Si alguno está pendiente o hay diferencias comprobadas, la descarga queda bloqueada.';
        const URL_BASE = 'https://jorgeperrez754-arch.github.io/validar-constancias-itc/?folio=';

        const FORMATOS = {
            'Ingeniería en Sistemas Computacionales': { jefe: 'ISMAEL AGUSTÍN SILVA DZIB', cargo: 'JEFE DEL DEPTO. DE SISTEMAS Y COMPUTACIÓN', departamento: 'Depto. de Sistemas y Computación' },
            'Ingeniería en Arquitectura': { jefe: 'GUSTAVO PÉREZ HERNÁNDEZ', cargo: 'JEFE DEL DEPTO. DE INGENIERÍAS', departamento: 'Depto. de Ingenierías' },
            'Ingeniería Civil': { jefe: 'GUSTAVO PÉREZ HERNÁNDEZ', cargo: 'JEFE DEL DEPTO. DE INGENIERÍAS', departamento: 'Depto. de Ingenierías' },
            'Ingeniería Electromecánica': { jefe: 'GUSTAVO PÉREZ HERNÁNDEZ', cargo: 'JEFE DEL DEPTO. DE INGENIERÍAS', departamento: 'Depto. de Ingenierías' },
            'Ingeniería Mecatrónica': { jefe: 'GUSTAVO PÉREZ HERNÁNDEZ', cargo: 'JEFE DEL DEPTO. DE INGENIERÍAS', departamento: 'Depto. de Ingenierías' },
            'Ingeniería Ferroviaria': { jefe: 'GUSTAVO PÉREZ HERNÁNDEZ', cargo: 'JEFE DEL DEPTO. DE INGENIERÍAS', departamento: 'Depto. de Ingenierías' },
            'Contador Público': { jefe: 'JOSÉ ROMÁN BRACAMONTE PACHECO', cargo: 'JEFE DEL DEPTO. ECONÓMICO ADMINISTRATIVAS', departamento: 'Depto. Económico-Administrativas' },
            'Ingeniería en Gestión Empresarial': { jefe: 'JOSÉ ROMÁN BRACAMONTE PACHECO', cargo: 'JEFE DEL DEPTO. ECONÓMICO ADMINISTRATIVAS', departamento: 'Depto. Económico-Administrativas' },
            'Ingeniería en Administración': { jefe: 'JOSÉ ROMÁN BRACAMONTE PACHECO', cargo: 'JEFE DEL DEPTO. ECONÓMICO ADMINISTRATIVAS', departamento: 'Depto. Económico-Administrativas' },
            'Turismo': { jefe: 'JOSÉ ROMÁN BRACAMONTE PACHECO', cargo: 'JEFE DEL DEPTO. ECONÓMICO ADMINISTRATIVAS', departamento: 'Depto. Económico-Administrativas' },
            'Licenciatura en Administración': { jefe: 'JOSÉ ROMÁN BRACAMONTE PACHECO', cargo: 'JEFE DEL DEPTO. ECONÓMICO ADMINISTRATIVAS', departamento: 'Depto. Económico-Administrativas' }
        };

        document.getElementById('fecha').valueAsDate = new Date();

        function evidenciaCoincide() {
            if (window.RevisionInicio?.disponible?.() === false) return false;
            try { return window.RevisionEvidencia?.resumen()?.permiteDescarga === true; }
            catch { return false; }
        }

        function actualizarAccionesConstancia() {
            const verificada = evidenciaCoincide();
            document.getElementById('btnGenerar').disabled = !verificada || generandoConstancia;
            document.getElementById('btnPDF').disabled = !verificada || !qrDataURL || generandoConstancia;
            document.getElementById('btnGuardarQR').disabled = !verificada || !qrDataURL || generandoConstancia;
            const detalle = document.getElementById('estadoDescarga');
            if (detalle) detalle.textContent = !verificada ? 'Descarga bloqueada: verifica nombre, curso y fecha visible y resuelve cualquier diferencia con el original.' :
                generandoConstancia ? 'Generando la constancia institucional…' : qrDataURL ? 'Coinciden los tres datos requeridos. Puedes descargar la constancia.' :
                'Coinciden los tres datos requeridos. Ya puedes generar la constancia.';
        }

        function invalidarConstancia() {
            versionGeneracion++;
            qrDataURL = null;
            document.getElementById('qrArea').textContent = 'El QR institucional aparecerá aquí';
            document.getElementById('status').textContent = '';
            actualizarAccionesConstancia();
        }
        document.addEventListener('evidencia-invalidada', invalidarConstancia);
        document.addEventListener('revision-evidencia-actualizada', () => {
            if (!evidenciaCoincide()) invalidarConstancia();
            else actualizarAccionesConstancia();
        });
        ['nombre', 'noControl', 'carrera', 'curso', 'plataforma', 'fecha', 'archivoPDF'].forEach(id => {
            document.getElementById(id).addEventListener('input', invalidarConstancia);
            document.getElementById(id).addEventListener('change', invalidarConstancia);
        });
        actualizarAccionesConstancia();

        function generarFolio() {
            invalidarConstancia();
            const año = new Date().getFullYear();
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            let codigo = '';
            for (let i = 0; i < 8; i++) codigo += chars.charAt(Math.floor(Math.random() * chars.length));
            const folio = `ITC-${año}-${codigo}`;
            document.getElementById('folio').value = folio;
            document.getElementById('urlPreview').textContent = 'URL de validación: ' + URL_BASE + folio;
        }

        function actualizarInfoFormato() {
            const carrera = document.getElementById('carrera').value;
            const info = document.getElementById('infoFormato');
            if (!carrera || !FORMATOS[carrera]) { info.innerHTML = 'ℹ️ Selecciona una carrera para ver quién firma la constancia.'; return; }
            const f = FORMATOS[carrera];
            info.innerHTML = `<strong>Va firmado por:</strong> ${f.jefe}<br><strong>Cargo:</strong> ${f.cargo}<br><strong>Firma subdirector:</strong> Diego Ramón Briceño Domínguez`;
        }

        async function generarTodo() {
            if (generandoConstancia) return;
            try {
                const nombre = document.getElementById('nombre').value.trim();
                const noControl = document.getElementById('noControl').value.trim();
                const carrera = document.getElementById('carrera').value;
                const curso = document.getElementById('curso').value;
                const plataforma = document.getElementById('plataforma').value;
                const fecha = document.getElementById('fecha').value;
                const folio = document.getElementById('folio').value.trim();
                
                const archivoInput = document.getElementById('archivoPDF');
                if (archivoInput.files.length === 0) return alert('⚠️ Sube el certificado en PDF.');
                if (!nombre || !noControl || !carrera || !curso || !fecha || !folio) return alert('Llena todos los campos.');
                if (!evidenciaCoincide()) return alert(MENSAJE_VERIFICACION);
                generandoConstancia = true;
                actualizarAccionesConstancia();
                const version = versionGeneracion;

                const url = URL_BASE + folio;
                const tempDiv = document.createElement('div');
                new QRCode(tempDiv, { text: url, width: 260, height: 260, correctLevel: QRCode.CorrectLevel.H });
                await new Promise(r => setTimeout(r, 300));
                const qrCanvasTemp = tempDiv.querySelector('canvas');

                const canvasFinal = document.createElement('canvas');
                canvasFinal.width = 280; canvasFinal.height = 280;
                const ctx = canvasFinal.getContext('2d');
                ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 280, 280);
                ctx.drawImage(qrCanvasTemp, 10, 10, 260, 260);

                const logoImg = new Image();
                logoImg.src = 'logo.png';
                await new Promise(r => { logoImg.onload = r; logoImg.onerror = r; });
                if (logoImg.complete && logoImg.naturalWidth > 0) {
                    const logoSize = 60, logoX = (280 - logoSize) / 2, logoY = (280 - logoSize) / 2;
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(logoX - 4, logoY - 4, logoSize + 8, logoSize + 8);
                    ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
                }

                if (version !== versionGeneracion || !evidenciaCoincide()) return;
                const qrArea = document.getElementById('qrArea');
                qrArea.innerHTML = '';
                qrArea.appendChild(canvasFinal);
                qrDataURL = canvasFinal.toDataURL('image/png');

                document.getElementById('status').textContent = '✅ Constancia generada. Lista para descargar.';
                
                let historial = JSON.parse(localStorage.getItem('historial_itc') || '[]');
                historial.push({ folio, nombre, noControl, carrera, curso, plataforma, fecha, evidencia: archivoInput.files[0].name });
                localStorage.setItem('historial_itc', JSON.stringify(historial));

            } catch (error) {
                alert("Error: " + error.message);
            } finally {
                generandoConstancia = false;
                actualizarAccionesConstancia();
            }
        }

        // =========================================================================
        // HISTORIAL LOCAL: no equivale a un registro administrativo protegido.
        // =========================================================================
        function descargarHistorial() {
            // Se conserva el acceso solicitado para el historial existente.
            const PASSWORD_ADMIN = 'ITCancun2026';
            const intento = prompt('🔒 Área restringida. Ingresa la contraseña de administrador:');
            if (intento !== PASSWORD_ADMIN) {
                if (intento !== null) alert('❌ Contraseña incorrecta. Acceso denegado.');
                return;
            }
            let historial = JSON.parse(localStorage.getItem('historial_itc') || '[]');
            if (historial.length === 0) return alert('No hay registros aún.');
            
            // Escapar CSV y evitar fórmulas al abrirlo en una hoja de cálculo.
            const celda = value => '"' + String(value ?? '').replace(/^[\s]*[=+@-]/, "'$&").replace(/"/g, '""') + '"';
            let csv = 'Folio,Fecha,Nombre,No.Control,Carrera,Curso,Plataforma,Evidencia\n';
            historial.forEach(h => { csv += [h.folio,h.fecha,h.nombre,h.noControl,h.carrera,h.curso,h.plataforma,h.evidencia].map(celda).join(',') + '\n'; });
            
            const blob = new Blob([csv], { type: 'text/csv' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'historial_constancias.csv';
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        }

        function guardarQR() {
            if (!evidenciaCoincide()) return alert(MENSAJE_VERIFICACION);
            if (!qrDataURL) return alert("Primero genera la constancia.");
            const link = document.createElement('a');
            link.href = qrDataURL;
            link.download = `QR-${document.getElementById('folio').value}.png`;
            link.click();
        }

        // =========================================================================
        // PDF CON ENCABEZADO Y PIE DE PÁGINA
        // =========================================================================
        function generarPDF() {
            if (!evidenciaCoincide()) return alert(MENSAJE_VERIFICACION);
            if (!qrDataURL) return alert("Primero debes hacer clic en 'GENERAR CONSTANCIA'.");

            const escaparHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
            const folio = escaparHTML(document.getElementById('folio').value || 'sin-folio');
            const nombre = escaparHTML(document.getElementById('nombre').value);
            const noControl = escaparHTML(document.getElementById('noControl').value);
            const carrera = escaparHTML(document.getElementById('carrera').value);
            const curso = escaparHTML(document.getElementById('curso').value);
            const plataforma = escaparHTML(document.getElementById('plataforma').value);
            const fecha = document.getElementById('fecha').value;
            
            const f = FORMATOS[document.getElementById('carrera').value];
            const [y, m, d] = fecha.split('-');
            const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
            const mesTexto = meses[parseInt(m) - 1];

            const ventana = window.open('', '_blank');
            if (!ventana) return alert('Permite abrir una pestaña para descargar la constancia.');
            ventana.opener = null;
            
            // Aquí construimos el HTML exacto de la carta para la ventana nueva
            ventana.document.write(`
                <html>
                <head>
                    <title>Constancia-${folio}</title>
                    <style>
                        /* Ajustes milimétricos para que quepa en 1 hoja */
                        @page { margin: 0; size: letter; }
                        body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; }
                        .carta { 
                            width: 216mm; 
                            height: 279mm; 
                            padding: 15mm 20mm; /* Márgenes ajustados */
                            box-sizing: border-box; 
                            font-family: 'Times New Roman', serif; 
                            color: #000; 
                            font-size: 13px; 
                            line-height: 1.5; 
                            display: flex;
                            flex-direction: column;
                        }
                        .header-img { width: 100%; margin-bottom: 20px; }
                        .footer-img { width: 100%; margin-top: auto; } /* Empuja el pie hasta abajo */
                        .contenido { flex-grow: 1; display: flex; flex-direction: column; justify-content: center; }
                        
                        .titulo { text-align: center; font-size: 14px; font-weight: bold; margin: 20px 0; }
                        .cuerpo { text-align: justify; margin: 25px 0; }
                        .firmas { margin-top: 50px; display: flex; justify-content: space-around; align-items: flex-end; }
                        .firma { text-align: center; width: 40%; }
                        .firma-linea { border-top: 1.5px solid #000; padding-top: 6px; font-size: 11px; font-weight: bold; line-height: 1.4; }
                        .atentamente { text-align: center; font-weight: bold; font-size: 13px; margin-top: 30px; }
                        .qr { text-align: right; margin-top: 20px; }
                        .qr img { width: 80px; height: 80px; }
                    </style>
                </head>
                <body>
                    <div class="carta">
                        <!-- ENCABEZADO IMAGEN -->
                        <img src="encabezado.png" class="header-img">

                        <!-- CONTENIDO DE LA CONSTANCIA -->
                        <div class="contenido">
                            <div class="titulo">Constancia de Acreditación de Actividad Complementaria</div>
                            
                            <div class="titulo" style="font-size: 12px; margin-top: 15px;">
                                <div>${f.jefe} - ${f.cargo}</div>
                                <div style="font-weight: normal; margin-top: 5px;">PRESENTE</div>
                            </div>

                            <div class="cuerpo">
                                <p>El que suscribe <strong>${f.jefe}</strong>, ${f.cargo}, se permite hacer de su conocimiento que el (la) alumno (a) <strong>${nombre}</strong>, con número de control <strong>${noControl}</strong>, de la carrera de <strong><em>${carrera}</em></strong>, ha ACREDITADO la Actividad Complementaria en los Eventos Académicos relacionada con el curso <strong><em>${curso}</em></strong>, en la plataforma de ${plataforma}, con un valor de 1 crédito.</p>
                                <p style="margin-top: 20px;">Se extiende la presente en la ciudad de Cancún, Quintana Roo, a los ${parseInt(d)} días del mes de ${mesTexto} del ${y}.</p>
                            </div>

                            <div class="atentamente">ATENTAMENTE</div>

                            <div class="firmas">
                                <div class="firma">
                                    <div style="height: 50px;"></div>
                                    <div class="firma-linea">${f.jefe}<br>${f.cargo}</div>
                                </div>
                                <div class="firma">
                                    <div style="height: 50px;"></div>
                                    <div class="firma-linea">DIEGO RAMÓN BRICEÑO DOMÍNGUEZ<br>SUBDIRECTOR ACADÉMICO</div>
                                </div>
                            </div>

                            <div class="qr">
                                <div style="font-size:10px; margin-bottom: 5px;">Folio: <strong>${folio}</strong></div>
                                <img src="${qrDataURL}">
                                <div style="font-size: 9px; margin-top: 5px;">Valida en: itcancun.edu.mx/validar</div>
                            </div>
                        </div>

                        <!-- PIE DE PÁGINA IMAGEN -->
                        <img src="pie_pagina.png" class="footer-img">
                    </div>
                </body>
                </html>
            `);

            ventana.document.close();
            
            // Le damos un segundo para que carguen las imágenes y abrimos la ventana de "Guardar como PDF"
            ventana.onload = function() {
                setTimeout(() => {
                    ventana.focus();
                    ventana.print();
                }, 1000);
            };
        }


