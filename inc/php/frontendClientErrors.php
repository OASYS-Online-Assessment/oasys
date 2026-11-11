<?php

// Keep client reports independent of the database, including when cookies are blocked.
function oasysLogFrontendClientError(string $message, array $context = []): void
{
	$context['stateCookiePresent'] = is_string($_COOKIE['oasysStateFrontend'] ?? null) && $_COOKIE['oasysStateFrontend'] !== '';
	$context['userAgent'] = $_SERVER['HTTP_USER_AGENT'] ?? null;
	$entry = gmdate('c') . "\n" . rtrim($message, "\r\n") . "\nContext: "
		. json_encode($context, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) . "\n\n";
	if (file_put_contents(__DIR__ . '/../../logs/fe_client_errors.txt', $entry, FILE_APPEND | LOCK_EX) === false) {
		error_log('OASYS: could not write frontend client error report');
	}
}
