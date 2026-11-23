<?php
declare(strict_types=1);

namespace ITC\Revision;

// Adaptador de la página pública de TecNM. No es una API oficial ni una aprobación institucional.
const DOMINIO = 'mooc.tecnm.mx';
const MAX_HTML = 1048576;

final class RevisionPendiente extends \RuntimeException {}

function validarCertificado($url): array
{
    if (!is_string($url) || strlen($url) > 2048 || preg_match('~[\s\\\\\x00-\x1f\x7f]~u', $url)) {
        throw new RevisionPendiente('El QR no contiene un enlace de certificado admitido.');
    }
    $partes = parse_url($url);
    if (!$partes || ($partes['scheme'] ?? '') !== 'https' || strtolower($partes['host'] ?? '') !== DOMINIO ||
        isset($partes['user']) || isset($partes['pass']) ||
        (isset($partes['port']) && $partes['port'] !== 443) || isset($partes['query']) || isset($partes['fragment']) ||
        !preg_match('~^/certificates/([a-f0-9]{32})/?$~iD', $partes['path'] ?? '', $match)) {
        throw new RevisionPendiente('Solo se consultan certificados HTTPS de mooc.tecnm.mx con identificador válido.');
    }
    $id = strtolower($match[1]);
    return ['https://' . DOMINIO . '/certificates/' . $id, $id];
}

function ipv4Publica(string $ip): bool
{
    if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 | FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return false;
    $numero = unpack('N', inet_pton($ip))[1];
    foreach (['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16',
        '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16',
        '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4'] as $rango) {
        [$red, $bits] = explode('/', $rango);
        $mascara = (0xffffffff << (32 - (int)$bits)) & 0xffffffff;
        if (($numero & $mascara) === (unpack('N', inet_pton($red))[1] & $mascara)) return false;
    }
    return true;
}

function solicitar(string $url, float $limite): array
{
    validarCertificado($url);
    if (!function_exists('curl_init')) throw new RevisionPendiente('Activa la extensión cURL de PHP en XAMPP para consultar TecNM.');
    if (microtime(true) >= $limite) throw new RevisionPendiente('La consulta al emisor tardó demasiado.');
    // Solo IPv4 pública. La dirección validada queda fijada a la conexión TLS.
    $ips = @gethostbynamel(DOMINIO);
    if (!$ips || count(array_filter($ips, __NAMESPACE__ . '\\ipv4Publica')) !== count($ips)) {
        throw new RevisionPendiente('No fue posible resolver un destino público permitido para TecNM.');
    }
    $restante = (int)(($limite - microtime(true)) * 1000);
    if ($restante <= 0) throw new RevisionPendiente('La consulta al emisor tardó demasiado.');
    $curl = curl_init($url);
    $html = ''; $headers = []; $bytesHeaders = 0; $exceso = false;
    curl_setopt_array($curl, [
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROXY => '',
        CURLOPT_RESOLVE => [DOMINIO . ':443:' . $ips[0]],
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_TIMEOUT_MS => $restante,
        CURLOPT_CONNECTTIMEOUT_MS => min(5000, $restante),
        CURLOPT_USERAGENT => 'ITC-RevisionConstancias/1.0 (consulta de certificado por QR)',
        CURLOPT_HTTPHEADER => ['Accept: text/html', 'Accept-Encoding: identity'],
        CURLOPT_HEADERFUNCTION => static function ($handle, string $linea) use (&$headers, &$bytesHeaders, &$exceso): int {
            $bytesHeaders += strlen($linea);
            if ($bytesHeaders > 65536) { $exceso = true; return 0; }
            if (preg_match('~^HTTP/\S+ \d{3}~', $linea)) $headers = [];
            elseif (strpos($linea, ':') !== false) {
                [$clave, $valor] = explode(':', $linea, 2);
                $headers[strtolower(trim($clave))] = trim($valor);
            }
            return strlen($linea);
        },
        CURLOPT_WRITEFUNCTION => static function ($handle, string $parte) use (&$html, &$exceso): int {
            if (strlen($html) + strlen($parte) > MAX_HTML) { $exceso = true; return 0; }
            $html .= $parte;
            return strlen($parte);
        },
    ]);
    try {
        $ok = curl_exec($curl);
        if ($exceso) throw new RevisionPendiente('La respuesta de TecNM excede el tamaño permitido.');
        if ($ok === false) throw new RevisionPendiente('No fue posible conectar de forma segura con TecNM. Revisa la conexión y los certificados TLS de PHP; la revisión sigue pendiente.');
        return [(int)curl_getinfo($curl, CURLINFO_HTTP_CODE), $headers, $html];
    } finally {
        curl_close($curl);
    }
}

function leerHTML(string $html): array
{
    if (!$html || strlen($html) > MAX_HTML || preg_match('//u', $html) !== 1) {
        throw new RevisionPendiente('La respuesta de TecNM no contiene texto legible dentro de los límites.');
    }
    if (!class_exists('DOMDocument')) throw new RevisionPendiente('Activa la extensión DOM de PHP para leer la constancia original.');
    $previo = libxml_use_internal_errors(true);
    try {
        $doc = new \DOMDocument('1.0', 'UTF-8');
        $doc->resolveExternals = false;
        $doc->substituteEntities = false;
        if (!$doc->loadHTML('<?xml encoding="UTF-8">' . $html, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING)) {
            throw new RevisionPendiente('No fue posible interpretar la página de TecNM.');
        }
    } finally {
        libxml_clear_errors();
        libxml_use_internal_errors($previo);
    }
    $xpath = new \DOMXPath($doc);
    foreach ($xpath->query('//script | //style | //noscript | //template') as $nodo) $nodo->parentNode->removeChild($nodo);
    $cuerpos = $xpath->query('//body[@data-view="valid-accomplishment" and contains(concat(" ",normalize-space(@class)," ")," view-valid-accomplishment ")]');
    if ($cuerpos->length !== 1) throw new RevisionPendiente('TecNM no muestra una constancia válida con la estructura reconocida.');
    $campos = ['nombre' => ['strong','accomplishment-recipient'], 'curso' => ['span','accomplishment-course-name'],
        'clave' => ['span','accomplishment-course-number'], 'fecha' => ['p','accomplishment-statement-detail']];
    $datos = [];
    foreach ($campos as $campo => [$etiqueta, $clase]) {
        $nodos = $xpath->query('.//' . $etiqueta . '[contains(concat(" ",normalize-space(@class)," ")," ' . $clase . ' ")]', $cuerpos->item(0));
        if ($nodos->length > 20) throw new RevisionPendiente('TecNM devolvió demasiados valores para un campo.');
        $valores = [];
        foreach ($nodos as $nodo) {
            $texto = trim(preg_replace('/\s+/u', ' ', $nodo->textContent));
            if (preg_match_all('/./us', $texto) > 500) throw new RevisionPendiente('TecNM devolvió un campo demasiado largo.');
            if ($texto !== '' && !in_array($texto, $valores, true)) $valores[] = $texto;
        }
        if (count($valores) > 1 || ($campo !== 'fecha' && !$valores)) {
            throw new RevisionPendiente('Los datos de TecNM faltan o son ambiguos; requiere revisión institucional.');
        }
        $datos[$campo] = $valores[0] ?? '';
    }
    $fecha = $datos['fecha']; unset($datos['fecha']);
    $datos['fechaDocumento'] = '';
    if (preg_match('/^Ciudad de M[eé]xico,?\s+(\d{1,2} de [\p{L}]+ de \d{4})$/iu', $fecha, $match) ||
        preg_match('/^(?:Fecha visible(?: del certificado)?|Fecha del certificado|Fecha de emisi[oó]n|Fecha de expedici[oó]n)\s*:\s*(.+)$/iu', $fecha, $match)) {
        $datos['fechaDocumento'] = trim($match[1]);
    }
    return $datos;
}

function consultarOriginal($url, ?callable $transporte = null): array
{
    [$inicial, $id] = validarCertificado($url);
    $actual = $inicial; $limite = microtime(true) + 12;
    $transporte = $transporte ?? (__NAMESPACE__ . '\\solicitar');
    for ($intento = 0; $intento < 3; $intento++) {
        [$estado, $headers, $html] = $transporte($actual, $limite);
        if (in_array($estado, [301,302,303,307,308], true)) {
            $destino = $headers['location'] ?? '';
            if (!$destino || $intento === 2) throw new RevisionPendiente('La redirección de TecNM no permite confirmar el certificado.');
            if (substr($destino, 0, 2) === '//') $destino = 'https:' . $destino;
            elseif (substr($destino, 0, 1) === '/') $destino = 'https://' . DOMINIO . $destino;
            elseif (!preg_match('~^[a-z][a-z0-9+.-]*:~i', $destino)) $destino = 'https://' . DOMINIO . '/certificates/' . $destino;
            [$nuevo, $nuevoId] = validarCertificado($destino);
            if ($nuevoId !== $id) throw new RevisionPendiente('La redirección de TecNM cambia de certificado.');
            $actual = $nuevo;
            continue;
        }
        if (in_array($estado, [401,403], true)) throw new RevisionPendiente('TecNM restringe el acceso o requiere iniciar sesión.');
        if ($estado === 404) throw new RevisionPendiente('TecNM no encontró la constancia. Requiere revisión institucional.');
        if ($estado !== 200) throw new RevisionPendiente('TecNM no está disponible para completar la comparación.');
        if (stripos($headers['content-type'] ?? '', 'text/html') === false ||
            !in_array(strtolower($headers['content-encoding'] ?? 'identity'), ['', 'identity'], true)) {
            throw new RevisionPendiente('TecNM no devolvió una página de certificado legible.');
        }
        return ['estado' => 'consultado', 'datos' => leerHTML($html), 'certificadoId' => $id,
            'urlInicial' => $inicial, 'urlFinal' => $actual, 'consultadoEn' => gmdate('c'), 'aprobacionAdministrativa' => false];
    }
    throw new RevisionPendiente('La consulta a TecNM no se pudo completar.');
}
