<?php
	/* getTestData API */

	//TODO: security checks
	//TODO: fluid test support

	register_shutdown_function('outputJSON');
	require_once '../../inc/php/database.php'; //contains the database connection credentials
	require_once '../../inc/php/rixPDO.php'; //wrapper around PDO functions (c.f. docs folder for manual)
	require_once '../../inc/php/Crypt.php';
	require_once '../../inc/php/settings.php';
	require_once '../../inc/php/parser.php';
	require_once '../../inc/php/rixTools.php';
	require_once '../../inc/php/OasysScriptParser.php';
	require_once '../../inc/php/loginData.php';
	require_once '../../inc/php/helperRoutines.php';

	$returnData = [];

	$testId = filter_input(INPUT_POST, 'testId');
	if (!$testId) {
		$returnData['error'] = "testId missing";
		die();
	}

	/** @var string $sql_db */
	/** @var string $sql_user */
	/** @var string $sql_password */
	/** @var string $sql_host */
	/** @var rixPDO $db */
	$db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, __DIR__ . '/../../logs/API_getTestData.txt', 1, $returnData, 'error');
	$results = $db->results();
	if ($results['error']) {
		$returnData['error'] = 'mySQL connection error';
		die();
	}

	$fullData = getTestData($testId, $db, $returnData);
	$testData = [];

	foreach ($fullData['structure']['items'] as $itemData) {
		$id = $itemData['hiddenID'];
		$row = $fullData['items'][$id];
		$item = [];
		$item['id'] = $row['id'];
		$item['groupId'] = $row['groupId'];
		$item['itemCode'] = $row['itemCode'];
		if (isset($row['fields'])) $item['fields'] = $row['fields'];
		$testData[] = $item;
	}

	$returnData['data'] = $testData;

	// this will always be called when the script ends even if a fatal error occurred
	// it encodes the $returnData to JSON and it adds an error message if a fatal PHP error occurred
	// this error message is registered under the 'fatalError' key and includes the file name of the PHP script and the line number of the error
	// all other errors (e.g. database) were registere under the 'error' key
	function outputJSON() {
		GLOBAL $returnData, $action, $settings, $handledExceptions;
		$error = error_get_last();
		if (!empty($error)) {
			$documentRoot = filter_input(INPUT_SERVER, "DOCUMENT_ROOT");
			$file = str_replace($documentRoot, '', $error['file']);
			$returnData['fatalError'] = "<p>Fatal error [type {$error['type']}] on line {$error['line']} of<br><code class='tinyCode'>$file</code></p><p>{$error['message']}</p>";
		}
		if ($settings['debugSystem'] && $handledExceptions) {
			$returnData['handledExceptions'] = $handledExceptions;
		}
		if (!$settings['debugSystem']) {
			if ($returnData['fatalError']) {
				$returnData['fatalError'] = "<p>A fatal error occurred. Details have been omitted since the system is not in debugging mode!</p>";
			}
			if ($returnData['error']) {
				$returnData['error'] = "<p>An error occurred. Details have been omitted since the system is not in debugging mode!</p>";
			}
		}
		header('Cache-Control: no-cache, must-revalidate');
		header('Content-type: application/json; charset=UTF-8');
		echo json_encode($returnData);
	}