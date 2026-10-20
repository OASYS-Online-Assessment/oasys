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

$filename = preg_replace('/[\x00-\x1F\x7F"\\\\\/]/', '_', (string)($export['filename'] ?? ''));
$filename = trim((string)$filename, " .\t\n\r\0\x0B");
$mime = (string)($export['mime'] ?? 'application/octet-stream');
$fallbackExtension = match (true) {
	str_starts_with($mime, 'text/csv') => 'csv',
	str_contains($mime, 'spreadsheetml') => 'xlsx',
	str_contains($mime, 'oasis.opendocument.spreadsheet') => 'ods',
	default => 'bin',
};
if ($filename === '') $filename = 'oasys-results-export.' . $fallbackExtension;
if (pathinfo($filename, PATHINFO_EXTENSION) === '') $filename .= '.' . $fallbackExtension;

// Send an ASCII fallback for all browsers and an RFC 5987 UTF-8 filename when possible.
$utf8Filename = preg_match('//u', $filename) === 1 ? $filename : null;
$asciiFilename = $utf8Filename;
if ($asciiFilename !== null && function_exists('iconv')) {
	$transliterated = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $asciiFilename);
	if ($transliterated !== false) $asciiFilename = $transliterated;
}
$asciiFilename = preg_replace('/[^\x20-\x7E]/', '_', (string)$asciiFilename);
$asciiFilename = preg_replace('/["\\\\]/', '_', (string)$asciiFilename) ?: 'oasys-results-export.' . $fallbackExtension;
$contentDisposition = 'attachment; filename="' . $asciiFilename . '"';
if ($utf8Filename !== null) $contentDisposition .= "; filename*=UTF-8''" . rawurlencode($utf8Filename);

header('Content-Description: File Transfer');
header('Content-Type: ' . $mime);
header('Content-Disposition: ' . $contentDisposition);
header('Content-Length: ' . filesize($export['dataPath']));
header('Cache-Control: private, no-store, max-age=0');
header('Pragma: no-cache');
readfile($export['dataPath']);
@unlink($export['dataPath']);
@unlink($export['metaPath']);
