<?php
declare(strict_types=1);

use ITC\Revision\RevisionPendiente;
use function ITC\Revision\consultarOriginal;

ini_set('display_errors', '0');
@set_time_limit(20);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function responder(int $codigo, array $datos): void
{
    http_response_code($codigo);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    responder(405, ['estado'=>'pendiente','motivo'=>'Utiliza el botón Revisar PDF de la página para consultar el original.']);
}
$host = strtolower($_SERVER['HTTP_HOST'] ?? '');
$esquema = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http';
if (!preg_match('/^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/D', $host) ||
    (isset($_SERVER['HTTP_ORIGIN']) && strtolower($_SERVER['HTTP_ORIGIN']) !== $esquema . '://' . $host) ||
    ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
    responder(403, ['estado'=>'pendiente','motivo'=>'Origen de consulta no permitido. Utiliza esta copia desde localhost en XAMPP.']);
}
$longitud = filter_var($_SERVER['CONTENT_LENGTH'] ?? '', FILTER_VALIDATE_INT);
if (!$longitud || $longitud > 4096 || $longitud < 0 ||
    strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') {
    responder(400, ['estado'=>'pendiente','motivo'=>'Solicitud de revisión no válida.']);
}
try {
    $entrada = file_get_contents('php://input', false, null, 0, 4097);
    $datos = json_decode($entrada, false, 8, JSON_THROW_ON_ERROR);
    if (!$datos instanceof stdClass || array_keys(get_object_vars($datos)) !== ['url']) throw new RuntimeException();
} catch (Throwable $error) {
    responder(400, ['estado'=>'pendiente','motivo'=>'Solicitud de revisión no válida.']);
}

// Dos consultas simultáneas como máximo. Los bloqueos temporales no guardan datos del alumno.
$bloqueo = null;
for ($i = 0; $i < 2; $i++) {
    $archivo = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'itc-revision-' . hash('sha256', __DIR__) . '-' . $i . '.lock';
    $recurso = @fopen($archivo, 'c');
    if ($recurso && flock($recurso, LOCK_EX | LOCK_NB)) { $bloqueo = $recurso; break; }
    if ($recurso) fclose($recurso);
}
if (!$bloqueo) responder(503, ['estado'=>'pendiente','motivo'=>'Hay otras revisiones en curso. Vuelve a intentar.']);
try {
    require_once __DIR__ . '/emisor-tecnm.php';
    $resultado = consultarOriginal($datos->url);
} catch (RevisionPendiente $error) {
    $resultado = ['estado'=>'pendiente','motivo'=>$error->getMessage()];
} catch (Throwable $error) {
    $resultado = ['estado'=>'pendiente','motivo'=>'No se pudo completar la consulta a TecNM. La revisión queda pendiente.'];
} finally {
    flock($bloqueo, LOCK_UN);
    fclose($bloqueo);
}
responder(200, $resultado);
