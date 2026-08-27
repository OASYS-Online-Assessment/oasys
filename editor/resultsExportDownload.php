<?php

require_once __DIR__ . '/inc/php/initBackend.php';

$returnData = ['error' => false];
$pageName = 'testresults';
$isSubMod = false;
$isActionFile = false;
require_once __DIR__ . '/inc/php/authCommonFunctions.php';
require_once __DIR__ . '/inc/php/resultsExportFiles.php';

$token = (string)(filter_input(INPUT_GET, 'token') ?? '');
$export = resultsExportRead($token);
if ($export === null) {
	http_response_code(403);
	echo 'This results export is unavailable, expired, or no longer permitted.';
	exit;
}

$filename = preg_replace('/[\x00-\x1F\x7F"\\\/]/u', '_', (string)$export['filename']) ?: 'oasys-results-export';
header('Content-Description: File Transfer');
header('Content-Type: ' . (string)$export['mime']);
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Content-Length: ' . filesize($export['dataPath']));
header('Cache-Control: private, no-store, max-age=0');
header('Pragma: no-cache');
readfile($export['dataPath']);
@unlink($export['dataPath']);
@unlink($export['metaPath']);
