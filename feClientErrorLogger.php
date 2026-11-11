<?php

require_once __DIR__ . '/inc/php/frontendClientErrors.php';

// Check if data is sent via POST request
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
	// Get the data sent via the POST request
	$data = file_get_contents('php://input');

	if (!empty($data)) {
		$decoded = json_decode($data, true);
		$context = [];
		if (is_array($decoded) && is_string($decoded['report'] ?? null)) {
			$data = $decoded['report'];
			$context = is_array($decoded['context'] ?? null) ? $decoded['context'] : [];
		}
		// Preserve the report even if optional database initialization terminates the request.
		register_shutdown_function(static function () use ($data, &$context): void {
			oasysLogFrontendClientError($data, $context);
		});
		// Resolve database IDs on the server; they are intentionally omitted from frontend login data.
		if (is_string($_COOKIE['oasysStateFrontend'] ?? null) && $_COOKIE['oasysStateFrontend'] !== ''
			&& is_string($context['serialNumber'] ?? null)) {
			try {
				require_once __DIR__ . '/inc/php/initSettings.php';
				/** @var rixPDO $db */
				$result = $db->fetchRow('SELECT loginId, studentId, testId FROM stateFrontend WHERE stateId=? AND instanceId=?',
				[$_COOKIE['oasysStateFrontend'], $context['serialNumber']]);
				$context['loginId'] = $result['data']['loginId'] ?? $result['data']['studentId'] ?? null;
				$context['testId'] = $result['data']['testId'] ?? $context['testId'] ?? null;
			} catch (Throwable $e) {
				$context['stateLookupFailed'] = true;
			}
		}
	}
} else {
	// Invalid request method
	http_response_code(405);
	echo 'Method Not Allowed';
}
