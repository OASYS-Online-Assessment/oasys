<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
	http_response_code(404);
	exit;
}

$initialBufferLevel = ob_get_level();
$errorClientCount = -1; // Negative values are reserved for errors; valid client counts are non-negative.
$outputWritten = false;
register_shutdown_function(static function () use (&$outputWritten, $initialBufferLevel, $errorClientCount): void {
	if ($outputWritten) return;

	while (ob_get_level() > $initialBufferLevel) {
		ob_end_clean();
	}

	fwrite(STDOUT, (string)$errorClientCount);
});

ob_start();
error_reporting(0);
ini_set('display_errors', '0');

$count = $errorClientCount;
$exitCode = 0;

try {
	require_once __DIR__ . '/../../inc/php/OasysApp.php';
	$app = \Oasys\OasysApp::getInstance(rixPDO::ERROR_HANDLING_EXCEPTION);
	$config = $app->config;
	$db = $app->getDatabaseInstance();
	$settings =& $config->getSettingsArray();
	require_once __DIR__ . '/../inc/php/OasysBackendState.php';

	$count = \Oasys\BackEnd\OasysBackendState::getNumberOfActiveClients();
	if ($count < 0) {
		$exitCode = 1;
	}
} catch (Throwable) {
	$count = $errorClientCount;
	$exitCode = 1;
}

while (ob_get_level() > $initialBufferLevel) {
	ob_end_clean();
}

$outputWritten = true;
fwrite(STDOUT, (string)(int)$count);
exit($exitCode);
