/* Recuperación del lector si un archivo no carga o se mezcla una versión antigua. */
(function () {
    'use strict';
    let fallo = false;
    const $ = id => document.getElementById(id);
    const esLector = value => /revision-(?:core|evidencia)\.js/iu.test(String(value || ''));
    const listo = () => !fallo && typeof window.RevisionCore?.extraerCampos === 'function' &&
        typeof window.RevisionCore?.compararOriginal === 'function' && typeof window.RevisionEvidencia?.resumen === 'function';

    function mostrarFallo() {
        fallo = true;
        if ($('avisoCargaLector')) $('avisoCargaLector').hidden = false;
        if ($('progresoRevision')) $('progresoRevision').textContent = 'El lector no se pudo cargar correctamente. Pulsa «Recargar lector» y vuelve a seleccionar el PDF.';
        if ($('estadoEmisor')) $('estadoEmisor').textContent = 'Pendiente de revisión del original';
        if ($('btnRevisar')) $('btnRevisar').disabled = false;
        if ($('btnCancelarRevision')) $('btnCancelarRevision').hidden = true;
        $('revisionEvidencia')?.setAttribute('aria-busy', 'false');
        document.dispatchEvent(new Event('evidencia-invalidada'));
        for (const id of ['btnGenerar', 'btnPDF', 'btnGuardarQR']) if ($(id)) $(id).disabled = true;
    }

    window.addEventListener('error', event => {
        if (esLector(event.filename || event.target?.src)) mostrarFallo();
    }, true);
    window.addEventListener('unhandledrejection', event => {
        if (esLector(event.reason?.stack)) mostrarFallo();
    });
    document.addEventListener('DOMContentLoaded', () => {
        $('btnRevisar')?.addEventListener('click', event => {
            if (!listo()) {
                event.preventDefault();
                event.stopImmediatePropagation();
                mostrarFallo();
            }
        }, true);
        $('btnRecargarLector')?.addEventListener('click', () => {
            const url = new URL(window.location.href);
            url.searchParams.set('lector', String(Date.now()));
            window.location.replace(url.href);
        });
        if (!listo()) mostrarFallo();
    });
    window.RevisionInicio = Object.freeze({ disponible: listo });
})();
