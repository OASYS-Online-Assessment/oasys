<?php

require_once __DIR__ . '/inc/php/initBackend.php';

$returnData = ['error' => false];
$pageName = 'content';
$isSubMod = false;
$isActionFile = false;
require_once __DIR__ . '/inc/php/authCommonFunctions.php';
require_once __DIR__ . '/inc/php/PageGroupPackage.php';

$db = $app->getDatabaseInstance();
$permAuth = new permAuth('fetchItemGroup', ['id' => 1], $myAuth);
if (!($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin())) {
	http_response_code(403);
	echo 'Only administrators may download page-group packages.';
	exit;
}
$token = (string)(filter_input(INPUT_GET, 'token') ?? '');
$package = pgpReadDownloadToken($token, $db);
if ($package === null) {
	http_response_code(403);
	echo 'This export package is unavailable, expired, or no longer permitted.';
	exit;
}

$zipPath = $package['zipPath'];
$metaPath = $package['metaPath'];
$filename = preg_replace('/[^A-Za-z0-9._-]/', '_', (string)$package['filename']) ?: 'oasys-page-groups.zip';
header('Content-Description: File Transfer');
header('Content-Type: application/zip');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Content-Length: ' . filesize($zipPath));
header('Cache-Control: private, no-store, max-age=0');
header('Pragma: no-cache');
readfile($zipPath);
@unlink($zipPath);
@unlink($metaPath);
