#!/usr/bin/env php
<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
	exit(1);
}

ob_start(static fn(string $output): string => '');

error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '0');
ini_set('error_log', '/dev/null');

$exitCode = 1;

register_shutdown_function(static function () use (&$exitCode): void {
	$error = error_get_last();
	$fatalErrorTypes = E_ERROR | E_PARSE | E_CORE_ERROR | E_COMPILE_ERROR | E_USER_ERROR | E_RECOVERABLE_ERROR;
	if ($error !== null && ($error['type'] & $fatalErrorTypes) !== 0) {
		$exitCode = 1;
	}

	if ($exitCode > 0) {
		exit($exitCode);
	}
});

try {
	$action = 'update';
	$returnData = [];
	$debugInfo = [];

	require_once __DIR__ . '/../../inc/php/OasysApp.php';

	$app = \Oasys\OasysApp::getInstance(rixPDO::ERROR_HANDLING_EXCEPTION);
	$config = $app->config;
	$db = $app->getDatabaseInstance();
	$settings =& $config->getSettingsArray();

	require_once __DIR__ . '/../maintenance/pageUpdater.php';

	$updater = new pageUpdater($returnData);
	$updater->checkAllPages();

	$changes = array_values(array_filter(
		$returnData['log'] ?? [],
		static fn(mixed $entry): bool => is_string($entry) && $entry !== ''
	));
	if (($returnData['changeCount'] ?? 0) > 0 && count($changes) > 0) {
		$logEntry = '[' . date('Y-m-d H:i:s') . "] Page migration\n";
		$logEntry .= implode("\n", $changes) . "\n";
		$logFile = __DIR__ . '/../../logs/migrate.log';
		if (file_put_contents($logFile, $logEntry, FILE_APPEND | LOCK_EX) === false) {
			throw new RuntimeException('Could not write the migration log.');
		}
	}
	$exitCode = 0;
} catch (Throwable) {
	$exitCode = 1;
}

exit($exitCode);
