<?php

	/*
		getTestProgress V1.3
		by Eric J. FRANCOIS 2026

		This API allows an application to check on the status and progress of a specific test for a specfic login

		Required parameters:
		$testId		=>	the internal (autoincrement) id of the OASYS test for which we want to know the progress

		Optional parameters:
		$filters['tags']		=>	filters out any logins whose password does not have at least one of the tags in the list
		$filters['cutoffDate']	=>	filters out any logins whose last server contact predates the given date

		Result:

		Array
		(
			[error] => false or string with error message
			[activity] => Array of logins with the following fields:
				[
					[login] => the name of the login
					[tag] => the tag of the password
					[started] => 0 if test has never been logged into, 1 if there is activity
					[finished] => 0 if the test is still accessible, 1 if it was finalised or time ran out
					[answers] => count of the answers given
					[lastAnswer] => the timestamp of the last answer given
					[percentage] => percentage of test that was filled (by complete pages)
				)
			[total] => count of all the fields that the test takers could have filled out
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
	require_once __DIR__ . '/../../inc/php/OasysActivity.php';
	require_once __DIR__ . '/../../inc/php/OasysTest.php';

	$apiName = 'getTestProgress';
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

		$testId = getParameter('testId', FILTER_UNSAFE_RAW, $returnData);
		$filters = getParameter('filters', FILTER_UNSAFE_RAW, $returnData);
		if ($filters === null) {
			$filters = [];
		} else {
			if (!is_string($filters)) {
				raiseError('The filters parameter must contain a JSON object or array.');
			}
			try {
				$filters = json_decode($filters, true, 512, JSON_THROW_ON_ERROR);
			} catch (JsonException) {
				raiseError('The filters parameter must contain valid JSON.');
			}
			if (!is_array($filters)) {
				raiseError('The filters parameter must contain a JSON object or array.');
			}
		}

		if (!$testId) {
			raiseError("Missing parameter: testId must be provided!");
		}

		$testApi = new OasysTest();
		$structure = $testApi->getTestStructure($testId);
		if ($structure === null) {
			raiseError("TestId $testId not valid: no such test!");
		}

		if (!isset($structure['type'], $structure['items']) || !is_array($structure['items'])) {
			raiseError('The test structure is invalid.');
		}

		if ($structure['type'] !== 'linear') {
			raiseError("Test is of type '{$structure['type']}'. Support for this type of test is not implemented yet.");
		}

		$totalFieldCount = 0;
		foreach ($structure['items'] as $page) {
			if (!isset($page['hiddenID'])) {
				continue;
			}
			$fields = $testApi->getFieldsForSinglePage($page['hiddenID']);
			if ($fields === null) {
				continue;
			}
			foreach ($fields as $field) {
				//count all real fields from list, ignore everything from other categories (e.g. static, metafields)
				if (($field['category'] ?? null) === 'fields') {
					$totalFieldCount++;
				}
			}
		}

		$activityApi = new OasysActivity();
		try {
			$activity = $activityApi->getTestProgressSummary($testId, $filters);
		} catch (InvalidArgumentException $e) {
			raiseError($e->getMessage());
		}

		foreach ($activity as $k => $row) {
			$activity[$k]['percentage'] = round($row['answers'] / $totalFieldCount * 100, 2);
		}

		$returnData['activity'] = $activity;
		$returnData['total'] = $totalFieldCount;

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
