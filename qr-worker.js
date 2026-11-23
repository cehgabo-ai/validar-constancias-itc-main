/* jsQR se ejecuta fuera del hilo de la interfaz. Nunca abre ni consulta los QR. */
importScripts('vendor/jsqr/jsQR.js');
self.onmessage = ({ data: { pixels, width, height, limite } }) => {
    try {
        const rgba = new Uint8ClampedArray(pixels);
        const codigos = [];
        let leidos = 0;
        function buscar(x, y, w, h) {
            const crop = new Uint8ClampedArray(w * h * 4);
            for (let row = 0; row < h; row++) crop.set(rgba.subarray(((row+y)*width+x)*4, ((row+y)*width+x+w)*4), row*w*4);
            while (leidos < limite) {
                const qr = jsQR(crop, w, h, { inversionAttempts: 'attemptBoth' });
                if (!qr) return;
                leidos++;
                if (!codigos.includes(qr.data)) codigos.push(qr.data);
                const points = Object.values(qr.location);
                const minX = Math.max(0, Math.floor(Math.min(...points.map(p => p.x))) - 5);
                const maxX = Math.min(w, Math.ceil(Math.max(...points.map(p => p.x))) + 5);
                const minY = Math.max(0, Math.floor(Math.min(...points.map(p => p.y))) - 5);
                const maxY = Math.min(h, Math.ceil(Math.max(...points.map(p => p.y))) + 5);
                for (let row = minY; row < maxY; row++) {
                    crop.fill(255, (row*w+minX)*4, (row*w+maxX)*4);
                    rgba.fill(255, ((row+y)*width+x+minX)*4, ((row+y)*width+x+maxX)*4);
                }
            }
        }
        buscar(0, 0, width, height);
        // Varios QR alineados pueden confundir al localizador de jsQR. Examinar cuadrantes
        // solapados permite aislarlos; se enmascara cada detección en la imagen compartida.
        const tileW = Math.ceil(width * .56), tileH = Math.ceil(height * .56);
        for (const y of [0, height-tileH]) for (const x of [0, width-tileW]) {
            if (leidos < limite) buscar(x, y, tileW, tileH);
        }
        self.postMessage({ codigos, limitado: leidos === limite });
    } catch { self.postMessage({ error: 'No fue posible leer el QR de esta página.' }); }
};
