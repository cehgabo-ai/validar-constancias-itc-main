/* Reglas puras compartidas con las pruebas. Ningún resultado acredita autenticidad. */
(function (root) {
    'use strict';
    const LIMITES = Object.freeze({ bytes: 10 * 1024 * 1024, paginas: 20, caracteres: 200000,
        pixeles: 4000000, tiempo: 60000, qrPorPagina: 8 });
    const DOMINIOS = Object.freeze(['mooc.tecnm.mx']);
    const normalizar = value => String(value || '').normalize('NFC').toLocaleLowerCase('es')
        .replace(/\s+/gu, ' ').trim();

    function validarURL(value) {
        const raw = String(value || '').trim();
        if (raw.length > 2048 || !/^https:\/\//i.test(raw) || /[\u0000-\u0020\u007f\\]/u.test(raw)) {
            return { permitida: false, motivo: 'El QR debe contener una URL HTTPS sin espacios ni caracteres de control.' };
        }
        try {
            const url = new URL(raw);
            if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
                !DOMINIOS.includes(url.hostname)) {
                return { permitida: false, motivo: 'Dominio no autorizado, credenciales o puerto no permitido. Solo se admite mooc.tecnm.mx por HTTPS.' };
            }
            return { permitida: true, url: url.href, motivo: 'Dominio autorizado. Esto no prueba la autenticidad ni que el enlace exista.' };
        } catch {
            return { permitida: false, motivo: 'El QR no contiene una URL válida.' };
        }
    }

    function comparar(a, b) {
        const left = normalizar(a), right = normalizar(b);
        if (!left || !right) return 'pendiente';
        if (left === right) return 'coincide';
        // No se eliminan acentos, signos ni palabras: abreviaturas y fragmentos necesitan revisión.
        const tokensA = left.split(' '), tokensB = right.split(' ');
        if (left.includes(right) || right.includes(left) ||
            tokensA.some(token => token.length > 2 && tokensB.includes(token))) return 'pendiente';
        return 'diferente';
    }

    function fechaISO(value) {
        const text = normalizar(value);
        let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
        let year, month, day;
        if (match) [, year, month, day] = match;
        else if ((match = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(text))) {
            // Una fecha numérica con día y mes <= 12 tiene dos interpretaciones posibles.
            if (+match[1] <= 12 && +match[2] <= 12 && +match[1] !== +match[2]) return null;
            [, day, month, year] = match;
        } else {
            match = /^(\d{1,2})(?: de)? (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?: de)? (\d{4})$/.exec(text);
            if (!match) return null;
            day = match[1]; year = match[3];
            month = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'].indexOf(match[2].replace('setiembre', 'septiembre')) + 1;
        }
        const date = new Date(Date.UTC(+year, +month - 1, +day));
        if (+year < 1900 || date.getUTCFullYear() !== +year || date.getUTCMonth() !== +month - 1 || date.getUTCDate() !== +day) return null;
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    function compararFecha(a, b) {
        const left = fechaISO(a), right = fechaISO(b);
        return !left || !right ? 'pendiente' : left === right ? 'coincide' : 'diferente';
    }

    function extraerCampos(text, catalogo = []) {
        const lines = String(text || '').split(/\r?\n/).map(line => line.replace(/\s+/gu, ' ').trim()).filter(Boolean);
        const found = { nombre: [], curso: [], clave: [], fechaDocumento: [] };
        const add = (field, value, confianza = 'etiqueta') => {
            value = String(value || '').trim().replace(/[.;]$/, '');
            if (value && value.length <= 500) found[field].push({ value, confianza });
        };
        const labels = {
            nombre: /^(?:nombre(?: completo)?(?: del (?:alumno|participante|estudiante))?|alumno|participante|estudiante|otorgad[oa] a|se otorga(?: la presente constancia)? a)\s*[:：-]\s*(.*)$/iu,
            curso: /^(?:curso|nombre del curso|course(?: name)?)\s*[:：-]\s*(.*)$/iu,
            clave: /^(?:clave(?: del curso)?|c[oó]digo del curso|course (?:id|key))\s*[:：-]\s*(.*)$/iu,
            fechaDocumento: /^(?:fecha visible(?: del certificado)?|fecha del certificado|fecha de emisi[oó]n|fecha de expedici[oó]n)\s*[:：-]\s*(.*)$/iu
        };
        const isLabel = line => Object.values(labels).some(regex => regex.test(line)) || /^fecha\s+de\s+/iu.test(line);
        const plantillaTecNM = /tecnol[oó]gico nacional de m[eé]xico/iu.test(lines.join(' '));
        lines.forEach((line, index) => {
            // Constancia TecNM: «OTORGA LA PRESENTE / CONSTANCIA / A / nombre».
            // Solo se interpreta como campo cuando también existe el contexto del curso.
            if (plantillaTecNM && /^otorga la presente(?: constancia)?$/iu.test(line)) {
                let cursor = index + 1;
                if (/^constancia$/iu.test(lines[cursor] || '')) cursor++;
                if (/^a\s*:?$/iu.test(lines[cursor] || '')) {
                    const inicio = ++cursor;
                    while (cursor < Math.min(inicio + 3, lines.length) && !/^por haber concluido el curso/iu.test(lines[cursor])) cursor++;
                    const nombre = lines.slice(inicio, cursor).join(' ');
                    if (/^por haber concluido el curso/iu.test(lines[cursor] || '') && /^[\p{L}\p{M} .'’-]{5,180}$/u.test(nombre)) add('nombre', nombre);
                }
            }
            if (plantillaTecNM && /^con clave\s*:?$/iu.test(line)) {
                const match = /^([A-Z0-9][A-Z0-9._-]{1,40})\s*:\s*(.+)$/iu.exec(lines[index + 1] || '');
                if (match && /\d/u.test(match[1]) && /[a-z]/iu.test(match[1])) {
                    add('clave', match[1]);
                    let title = match[2];
                    for (let next = index + 2; next < Math.min(index + 5, lines.length); next++) {
                        if (catalogo.some(course => normalizar(course) === normalizar(title))) break;
                        if (!catalogo.some(course => normalizar(course).startsWith(normalizar(title) + ' '))) break;
                        title += ' ' + lines[next];
                    }
                    add('curso', title);
                }
            }
            const fechaVisible = /^Ciudad de M[eé]xico,?\s+(\d{1,2} de [\p{L}]+ de \d{4})$/iu.exec(line);
            if (fechaVisible && fechaISO(fechaVisible[1])) add('fechaDocumento', fechaVisible[1]);
            for (const [field, regex] of Object.entries(labels)) {
                const match = regex.exec(line);
                if (!match) continue;
                let value = match[1] || (!isLabel(lines[index + 1] || '') ? lines[index + 1] : '');
                if (field === 'curso' && value) {
                    // Recupera títulos partidos en líneas usando todo el catálogo, no el curso elegido.
                    let joined = value;
                    const start = match[1] ? index + 1 : index + 2;
                    for (let n = start; n < Math.min(start + 3, lines.length); n++) {
                        if (catalogo.some(course => normalizar(course) === normalizar(joined)) || isLabel(lines[n])) break;
                        if (!catalogo.some(course => normalizar(course).startsWith(normalizar(joined) + ' '))) break;
                        joined += ' ' + lines[n];
                    }
                    value = joined;
                }
                add(field, value);
            }
            // Plantillas frecuentes de certificados. Las inferencias se muestran como candidatas.
            if (/^(?:a|otorga(?: la presente constancia)? a|se otorga la presente constancia a)\s*:?$/iu.test(line)) add('nombre', lines[index + 1], 'candidato');
            if (/^(?:ha |por haber )?(?:completado|concluido|aprobado)(?: satisfactoriamente| con [eé]xito)?(?: el)? curso\s*:?(.*)$/iu.test(line)) {
                const value = line.replace(/^(?:ha |por haber )?(?:completado|concluido|aprobado)(?: satisfactoriamente| con [eé]xito)?(?: el)? curso\s*:?[ ]*/iu, '');
                if (!/^masivo abierto en l[ií]nea$/iu.test(value)) add('curso', value || lines[index + 1], 'candidato');
            }
            if (catalogo.some(course => normalizar(course) === normalizar(line))) add('curso', line, 'candidato');
            const courseKey = /\bcourse-v1:[A-Za-z0-9._-]+\+([A-Za-z0-9._-]+)\+[A-Za-z0-9._-]+\b/.exec(line);
            if (courseKey) add('clave', courseKey[1], 'candidato');
        });
        return Object.fromEntries(Object.entries(found).map(([field, values]) => {
            const unique = [...new Map(values.map(item => [field === 'fechaDocumento' ? fechaISO(item.value) || normalizar(item.value) : normalizar(item.value), item])).values()];
            // Una etiqueta explícita prevalece sobre la misma cadena encontrada como título suelto.
            for (const item of unique) if (values.some(v => normalizar(v.value) === normalizar(item.value) && v.confianza === 'etiqueta')) item.confianza = 'etiqueta';
            return [field, { value: unique.map(item => item.value).join(' / '),
                confianza: unique.length > 1 ? 'ambiguo' : unique[0]?.confianza || 'ausente' }];
        }));
    }

    function marcarCamposOCR(campos, palabras) {
        const tokens = text => (normalizar(text).match(/[\p{L}\p{M}\d]+/gu) || []);
        const demasiadas = palabras.length > 10000;
        const observadas = demasiadas ? [] : palabras.flatMap(word => tokens(String(word.text || '').slice(0, 500)).map(text => ({ text, confianza: Number(word.confidence) || 0 })));
        return Object.fromEntries(Object.entries(campos).map(([key, field]) => {
            if (!field.value) return [key, field];
            const buscadas = tokens(field.value), coincidencias = [];
            for (let start = 0; buscadas.length <= 100 && start <= observadas.length - buscadas.length; start++) {
                if (buscadas.length && buscadas.every((token, index) => token === observadas[start + index].text)) {
                    coincidencias.push(Math.min(...observadas.slice(start, start + buscadas.length).map(word => word.confianza)));
                }
            }
            const confianzaOCR = coincidencias.length ? Math.min(...coincidencias) : 0;
            // Una clave alfanumérica reconocida en imagen puede confundir O/0 o I/1,
            // incluso con puntaje alto. Se conserva lo leído, sin corregir ni certificar la clave.
            const claveDudosa = key === 'clave' && /[oOiIlL01]/u.test(field.value);
            return [key, { ...field, origen: 'ocr', confianzaOCR,
                confianza: field.confianza === 'etiqueta' && (confianzaOCR < 90 || claveDudosa) ? 'candidato' : field.confianza }];
        }));
    }

    function compararCampo(field, expected) {
        if (!field || field.confianza !== 'etiqueta') return 'pendiente';
        return comparar(field.value, expected);
    }
    function identificadorEmisor(value) {
        const result = validarURL(value);
        if (!result.permitida) return null;
        const url = new URL(result.url);
        if (url.search || url.hash) return null;
        return /^\/certificates\/([a-f0-9]{32})\/?$/i.exec(url.pathname)?.[1].toLowerCase() || null;
    }

    function compararOriginal(campos, original) {
        if (!original || !['nombre', 'curso', 'clave'].every(field => typeof original[field] === 'string' && original[field].trim())) {
            throw new TypeError('Se requieren los datos completos del original del emisor.');
        }
        const resultados = {};
        for (const field of ['nombre', 'curso', 'clave', 'fechaDocumento']) {
            const local = campos[field];
            const valor = original[field];
            if (!local?.value || !valor || local.confianza === 'ambiguo' ||
                (local.origen === 'ocr' && (local.confianzaOCR < 90 || (field === 'clave' && local.confianza !== 'etiqueta')))) {
                resultados[field] = 'pendiente';
            } else if (field === 'fechaDocumento') {
                resultados[field] = compararFecha(local.value, valor);
            } else {
                resultados[field] = compararCampo(local, valor);
            }
        }
        const diferencias = Object.values(resultados).includes('diferente');
        const requeridosCoinciden = ['nombre', 'curso', 'fechaDocumento'].every(field => resultados[field] === 'coincide');
        return { resultados,
            estado: diferencias ? 'Hay diferencias con el original' : requeridosCoinciden ? 'Coinciden nombre, curso y fecha visible con el original' : 'Pendiente de revisión del original',
            permiteDescarga: requeridosCoinciden && !diferencias,
            aprobacionAdministrativa: false };
    }
    const api = { LIMITES, DOMINIOS, normalizar, validarURL, comparar, fechaISO, compararFecha, extraerCampos, marcarCamposOCR, compararCampo, identificadorEmisor, compararOriginal };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.RevisionCore = Object.freeze(api);
})(typeof globalThis === 'undefined' ? this : globalThis);
