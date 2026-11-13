<?php

// Keep client reports independent of the database, including when cookies are blocked.
function oasysLogFrontendClientError(string $message, array $context = []): void
{
	$context['stateCookiePresent'] = is_string($_COOKIE['oasysStateFrontend'] ?? null) && $_COOKIE['oasysStateFrontend'] !== '';
	$context['userAgent'] = $_SERVER['HTTP_USER_AGENT'] ?? null;
	$entry = gmdate('c') . "\n" . rtrim($message, "\r\n") . "\nContext: "
		. json_encode($context, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) . "\n\n";
	$stream = fopen(__DIR__ . '/../../logs/fe_client_errors.txt', 'ab');
	if ($stream === false) {
		error_log('OASYS: could not write frontend client error report');
		return;
	}

	$written = false;
	// Redirected logs (for example, container logging pipes) may not support locking.
	$stat = fstat($stream);
	$isRegularFile = $stat !== false && ($stat['mode'] & 0170000) === 0100000;
	if (!$isRegularFile || !stream_supports_lock($stream) || flock($stream, LOCK_EX)) {
		$written = fwrite($stream, $entry);
	}
	fclose($stream); // Also releases the lock, if one was acquired.
	if ($written !== strlen($entry)) {
		error_log('OASYS: could not write frontend client error report');
	}
}
