<?php

/*
	getProgress V1.1
	by Eric J. FRANCOIS 2026

	This API allows an application to check on the status and progress of a specific test for a specfic login

	Required parameters:
	$login		=>	string of the login name
	$testId		=>	the internal (autoincrement) id of the OASYS test for which we want to know the progress

	Optional parameters:
	$tag		=>	the password tag, important only if a test taker has filled in more than 1 instance of the same test

	Result:

	Array
	(
		[error] => false or string with error message
		[status] => Array
			(
				[started] => 0 if test has never been logged into, 1 if their is activity
				[finished] => 0 if the test is still accessible, 1 if it was finalised or time ran out
			)
		[total] => count of all the fields that the test taker could have filled out
		[answers] => count of the answers really given
		[percentage] => percentage of test that was filled
	)


	N.B.:	Beware of tests with conditional branching. There is no way to predict exactly which pages were hidden from
			the test taker, so the total number of fields may be higher than those really available to the test taker
*/

	register_shutdown_function('outputJSON');
	require_once __DIR__ . '/../../editor/inc/php/initBackend.php';
	require_once __DIR__ . '/../../inc/php/rixTools.php';
	require_once __DIR__ . '/../../inc/php/helperRoutines.php';
	require_once __DIR__ . '/../../inc/php/Crypt.php';
	require_once __DIR__ . '/../../inc/php/apiRoutines.php';

	$apiName = 'getProgress';
	$returnData = ['error' => false];

	/* the action defines which step of the process we are at: first make a request, then send the data */
	$action = getParameter('action', FILTER_UNSAFE_RAW, $returnData);
	if (!$action) {
		$returnData['error'] = "action missing";
		die();
	}

	$db = $config->getDatabaseInstance();

	clearApiRequests($db);

	if ($action === 'request') {

		/* step 1 => requesting challenge for use of the API */
		apiAuthentication($apiName, $db, $returnData);

	} elseif ($action === 'send') {

		/* step 2 => sending data and challenge response */
		apiRequestVerification($db, $returnData);

		/* the request verification fails we break the script off at this point */
		if ($returnData['error']) {
			die();
		}

		$login = getParameter('login', FILTER_UNSAFE_RAW, $returnData);
		$testId = getParameter('testId', FILTER_UNSAFE_RAW, $returnData);
		$tag = getParameter('tag', FILTER_UNSAFE_RAW, $returnData);

		if (!$login || !$testId) {
			raiseError("Missing parameter: both login and testId must be provided!");
		}

		$res = $db->fetchValue("SELECT structure FROM tests WHERE id = ?", [$testId]);
		if ($res['rows'] === 0) {
			raiseError("TestId $testId not valid: no such test!");
		}

		$structure = json_decode($res['data'] ?? '', true);
		if (json_last_error() != JSON_ERROR_NONE) {
			raiseError("Error decoding test structure: " . json_last_error_msg() . ")!");
		}

		if ($structure['type'] !== 'linear') {
			raiseError("Test is of type '{$structure['type']}'. Support for this type of test is not implemented yet.");
		}

		$totalFieldCount = 0;
		foreach ($structure['items'] as $page) {
			$id = $page['hiddenID'];
			$res = $db->fetchValue("SELECT fields FROM items WHERE id = ?", [$id]);
			$fields = json_decode($res['data'] ?? '', true);
			if (json_last_error() != JSON_ERROR_NONE) {
				continue;
			}
			foreach ($fields as $field) {
				//count all real fields from list, ignore everything from other categories (e.g. static, metafields)
				if ($field['category'] === 'fields') {
					$totalFieldCount++;
				}
			}
		}

		$loginId = getLoginId($login, $db);
		if (!$loginId) {
			raiseError("Error: login '$login' not found!");
		}

		$passwordId = getPasswordId($loginId, $testId, $tag, $db);
		if (!$passwordId) {
			raiseError("Error: no matching password found!");
		}

		$status = getActivityStatus($loginId, $passwordId, $testId, $db);

		$answerCount = getAnswerCount($loginId, $passwordId, $testId, $db);


		$returnData['status'] = $status;
		$returnData['total'] = $totalFieldCount;
		$returnData['answers'] = $answerCount;
		$returnData['percentage'] = round($answerCount / $totalFieldCount * 100, 2);

	}


	function getLoginId(string $login, rixPDO &$db) {
		$res = $db->fetchValue("SELECT id FROM logins WHERE name = ?", [$login]);
		if ($res['rows'] === 0) {
			return false;
		}
		return $res['data'];
	}

	function getPasswordId(int $loginId, int $testId, ?string $tag, rixPDO &$db) {
		if ($tag !== null) {
			/* if a tag has been given, we'll look for the password if of the given login id and test id with that exact tag
				if none is found we return false
				if more than 1 match is found, the newest will be returned (the highest auto increment id) */
			$res = $db->fetchValue("SELECT MAX(id) FROM passwords WHERE loginId = ? AND tag = ? AND JSON_CONTAINS(JSON_EXTRACT(structure, '$[*].hiddenID'), ?)", [$loginId, $tag, $testId]);
		} else {
			/* if no tag has been given, we'll look for the password if of the given login that matches the given test id
				if none is found we return false
				if more than 1 match is found, the newest will be returned (the highest auto increment id) */
			$res = $db->fetchValue("SELECT MAX(id) FROM passwords WHERE loginId = ? AND JSON_CONTAINS(JSON_EXTRACT(structure, '$[*].hiddenID'), ?)", [$loginId, $testId]);
		}
		if ($res['rows'] === 0) {
			return false;
		}
		return $res['data'];
	}

	function getActivityStatus(int $loginId, int $passwordId, int $testId, rixPDO &$db): array {
		$res = $db->fetchValue("SELECT timeLeft FROM activity WHERE loginId = ? AND passwordId = ? AND testId = ?", [$loginId, $passwordId, $testId]);
		$status = ['started' => 1, 'finished' => 0];
		if ($res['rows'] === 0) {
			$status['started'] = 0;
		} elseif ($res['data'] === 0) {
			$status['finished'] = 1;
		}
		return $status;
	}

	function getAnswerCount(int $loginId, int $passwordId, int $testId, rixPDO &$db): int {
		$res = $db->fetchValue("SELECT COUNT(*) FROM answers WHERE loginId = ? AND passwordId = ? AND testId = ?", [$loginId, $passwordId, $testId]);
		if ($res['rows'] === 0) {
			return 0;
		}
		return $res['data'];
	}

	function raiseError($errorMessage): void {
		global $returnData;
		$returnData['error'] = $errorMessage;
		die();
	}

	function outputJSON(): void {
		global $returnData, $action, $settings, $handledExceptions;
		$error = error_get_last();
		$returnData['action'] = $action;
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
		}
		header('Cache-Control: no-cache, must-revalidate');
		header('Content-type: application/json; charset=UTF-8');
		echo json_encode($returnData);
	}