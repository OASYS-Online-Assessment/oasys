<?php

	/*
		getTestProgress V1.1
		by Eric J. FRANCOIS 2024

		This API allows an application to check on the status and progress of a specific test for a specfic login

		Required parameters:
		$testId		=>	the internal (autoincrement) id of the OASYS test for which we want to know the progress

		Optional parameters:
		$filters['tags']		=>	filters out any logins whose password does not have at least one of the tags in the list
		$filters['cutoffDate']	=>	filters out any logins that have not been active since the given date

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
	require_once '../../inc/php/database.php'; //contains the database connection credentials
	require_once '../../inc/php/rixPDO.php'; //wrapper around PDO functions (c.f. docs folder for manual)
	require_once '../../inc/php/rixTools.php';
	require_once '../../inc/php/helperRoutines.php';
	require_once '../../inc/php/settings.php';
	require_once '../../inc/php/Crypt.php';
	require_once '../../inc/php/apiRoutines.php';

	$apiName = 'getTestProgress';
	$returnData = ['error' => false];

	/* the action defines which step of the process we are at: first make a request, then send the data */
	$action = getParameter('action', FILTER_UNSAFE_RAW, $returnData);
	if (!$action) {
		$returnData['error'] = "action missing";
		die();
	}

	$db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, __DIR__ . '/../../logs/API_getTestProgress.txt', 1, $returnData, 'error');
	$results = $db->results();
	if ($results['error']) {
		$returnData['error'] = 'mySQL connection error';
		die();
	}

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
			$filters = json_decode($filters, true);
		}

		if (!$testId) {
			raiseError("Missing parameter: testId must be provided!");
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

		$activity = getActivity($testId, $filters, $db);

		foreach ($activity as $k => $row) {
			$activity[$k]['percentage'] = round($row['answers'] / $totalFieldCount * 100, 2);
		}

		$returnData['activity'] = $activity;
		$returnData['total'] = $totalFieldCount;

	}


	function getActivity(int $testId, array $filters, rixPDO &$db) {
		$tagCondition = '';
		$dateCondition = '';
		if (!empty($filters)) {
			/* tag filter condition */
			if (isset($filters['tags']) && count($filters['tags']) > 0) {
				$quotedTags = array_map(function ($tag) {
					return "'" . $tag . "'";
				}, $filters['tags']);
				$tagList = implode(', ', $quotedTags);
				$tagCondition = "AND tag IN ($tagList)";
			}
			/* date filter condition */
			if (isset($filters['cutoffDate'])) {
				if (!preg_match("/^\d{4}-\d{2}-\d{2}$/", $filters['cutoffDate'])) {
					raiseError("The cutoffDate filter needs to be given in the form of YYYY-MM-DD");
				}
				$dateCondition = "HAVING lastAnswer >= '{$filters['cutoffDate']}' OR (ISNULL(lastAnswer) AND finished = 1)";
			}
		}
		$query = <<<query
			SELECT
				logins.`name` AS login,
				passwords.tag,
			IF
				( activity.progress IS NULL, 0, 1 ) AS started,
			IF
				( activity.timeLeft = 0, 1, 0 ) AS finished,
				COUNT( answers.`value` ) AS answers,
				MAX( tsClient ) AS lastAnswer 
			FROM
				passwords
				INNER JOIN logins ON passwords.loginID = logins.id
				LEFT JOIN activity ON passwords.id = activity.passwordId 
				AND activity.testId = ?
				LEFT JOIN answers ON activity.loginId = answers.loginId 
				AND activity.passwordId = answers.passwordId 
				AND activity.testId = answers.testId 
			WHERE
				JSON_SEARCH( structure, 'one', ?, NULL, '$[*].hiddenID' ) IS NOT NULL 
				AND logins.template = 'testee'
			 	$tagCondition
			GROUP BY
				passwords.loginId,
				passwords.id 
			$dateCondition
			ORDER BY
				login,
				lastAnswer
			query;
		$res = $db->fetchTable($query, [$testId, $testId], 'login');
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