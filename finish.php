<?php

	register_shutdown_function('outputFinishScreen');

	require_once __DIR__ . '/inc/php/initSettings.php';
	require_once __DIR__ . '/inc/php/actionAllowlist.php';
	require_once __DIR__ . '/inc/php/helperRoutines.php';
	require_once __DIR__ . '/inc/php/OasysFrontendState.php';
	require_once __DIR__ . '/inc/php/exceptions/StateExpiredException.php';

	use Oasys\FrontEnd\OasysFrontendState;
	use Oasys\exceptions\StateExpiredException;

	$action = filter_input(INPUT_POST, 'action');
	$data = filter_input(INPUT_POST, 'data');
	$data = $data ? json_decode($data, true) : [];

	$returnData = [
		'action' => $action,
		'error' => false,
		'fatalError' => false
	];

	if (oasysRejectUnknownAction(__FILE__, $action, $returnData)) exit;
	$action($data, $db, $returnData);

	function fetchFinishScreen(array $data, rixPDO &$db, array &$returnData): void
	{
		global $config;

		checkParams($data, ['serialNumber']);
		try {
			$state = OasysFrontendState::getInstance($data['serialNumber']);
		} catch (StateExpiredException $e) {
			$returnData['error'] = 'session expired';
			return;
		}

		$returnData['data'] = ['mode' => 'default'];
		$testId = (int)($state->testId ?? 0);
		if ($testId < 1) return;

		$results = $db->fetchRow('SELECT metadata FROM tests WHERE id=?', [$testId]);
		if (($results['rows'] ?? 0) !== 1 || !isset($results['data']['metadata'])) return;

		$metadata = json_decode($results['data']['metadata'], true);
		$finishScreen = $metadata['finish_screen'] ?? null;
		if (!is_array($finishScreen)) return;

		$mode = $finishScreen['mode'] ?? 'default';
		if ($mode === 'url') {
			$url = is_string($finishScreen['url'] ?? null) ? trim($finishScreen['url']) : '';
			$scheme = strtolower((string)parse_url($url, PHP_URL_SCHEME));
			if (filter_var($url, FILTER_VALIDATE_URL) !== false && in_array($scheme, ['http', 'https'], true)) {
				$returnData['data'] = ['mode' => 'url', 'url' => $url];
			}
			return;
		}

		if ($mode !== 'custom') return;

		$contents = [];
		foreach (array_keys($config->getLanguages()) as $language) {
			$content = $finishScreen[$language] ?? null;
			if (is_string($content) && trim($content) !== '') {
				$contents[$language] = $content;
			}
		}
		if (count($contents) === 0) return;

		$returnData['data'] = [
			'mode' => 'custom',
			'contents' => $contents,
			'customCSS' => is_string($finishScreen['customCSS'] ?? null) ? $finishScreen['customCSS'] : ''
		];
	}

	function outputFinishScreen(): void
	{
		global $returnData, $action, $settings, $handledExceptions;

		if (!isset($returnData['action'])) $returnData['action'] = $action;
		$returnData['sender'] = 'OASYS';
		$error = error_get_last();
		if (!empty($error)) {
			$documentRoot = filter_input(INPUT_SERVER, 'DOCUMENT_ROOT');
			$file = str_replace($documentRoot, '', $error['file']);
			$returnData['fatalError'] = "<p>Fatal error [type {$error['type']}] on line {$error['line']} of<br><code class='tinyCode'>$file</code></p><p>{$error['message']}</p>";
		}
		if ($settings['debugSystem'] && $handledExceptions) {
			$returnData['handledExceptions'] = $handledExceptions;
		}
		if (!$settings['debugSystem']) unset($returnData['debug']);
		header('Cache-Control: no-cache, must-revalidate');
		header('Content-type: application/json; charset=UTF-8');
		echo json_encode($returnData);
	}
