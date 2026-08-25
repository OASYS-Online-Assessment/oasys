<?php

/*
	editTestTaker V1.0
	by Eric J. FRANCOIS 2024

	This API allows an application to edit the activity of a test taker as well as the login name itself.

	Required parameters:
	$login		=>	string of the login name
	$testId		=>	the internal (autoincrement) id of the OASYS test for which we want to know the progress
	$actions	=>	JSON encoded array of actions to be performed on the test taker
					Each action is an object with the following properties:
					- task: the task to be performed (setTimeLeft, setCurrentPage, resetActivity, changeLogin)
					- value: the value to be set (not required for resetActivity)

	Optional parameters:
	$tag		=>	the password tag, important only if a test taker has filled in more than 1 instance of the same test

	Result:

	Array
	(
		[error] => false or string with error message
	)
*/

	register_shutdown_function('outputJSON');
	require_once '../../inc/php/database.php'; //contains the database connection credentials
	require_once '../../inc/php/rixPDO.php'; //wrapper around PDO functions (c.f. docs folder for manual)
	require_once '../../inc/php/rixTools.php';
	require_once '../../inc/php/helperRoutines.php';
	require_once '../../inc/php/settings.php';
	require_once '../../inc/php/Crypt.php';
	require_once '../../inc/php/apiRoutines.php';

	$apiName = 'editTestTaker';
	$returnData = ['error' => false];

	/* the action defines which step of the process we are at: first make a request, then send the data */
	$action = getParameter('action', FILTER_UNSAFE_RAW, $returnData);
	if (!$action) {
		$returnData['error'] = "action missing";
		die();
	}

	$db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, __DIR__ . '/../../logs/API_editTestTaker.txt', 1, $returnData, 'error');
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

		$login = getParameter('login', FILTER_UNSAFE_RAW, $returnData);
		$testId = getParameter('testId', FILTER_UNSAFE_RAW, $returnData);
		$tag = getParameter('tag', FILTER_UNSAFE_RAW, $returnData);
		$tasks = getParameter('tasks', FILTER_UNSAFE_RAW, $returnData);

		if (!$login || !$testId || !$tasks) {
			raiseError("Missing parameter: login, testId and actions must be provided!");
		}

		$tasks = json_decode($tasks);

		$loginId = getLoginId($login, $db);
		if (!$loginId) {
			raiseError("Error: login '$login' not found!");
		}

		//even though we could theoretically execute the changeLogin task without a passwordId, we'll fail if none can
		//be found as a login with a wrong password suggests a user error or unsavoury activity
		$passwordId = getPasswordId($loginId, $testId, $tag, $db);
		if (!$passwordId) {
			raiseError("Error: no matching password found!");
		}

		foreach ($tasks as $task) {
			if ($task->task === 'setTimeLeft') {
				setTimeLeft($loginId, $passwordId, $testId, $task->value, $db);
			} elseif ($task->task === 'setCurrentPage') {
				setCurrentPage($loginId, $passwordId, $testId, $task->value, $db);
			} elseif ($task->task === 'resetActivity') {
				resetActivity($loginId, $passwordId, $testId, $db);
			} elseif ($task->task === 'changeLogin') {
				changeLogin($loginId, $task->value, $db);
			} else {
				raiseError("Error: unknown task '{$task->task}'!");
			}
		}
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

	function setTimeLeft(int $loginId, int $passwordId, int $testId, int $timeLeft, rixPDO &$db): void {
		$db->execute("UPDATE activity SET timeLeft = ? WHERE loginId = ? AND passwordId = ? AND testId = ?", [$timeLeft, $loginId, $passwordId, $testId]);
	}

	function setCurrentPage(int $loginId, int $passwordId, int $testId, int $currentPage, rixPDO &$db): void {
		$db->execute("UPDATE activity SET currentItem = ? WHERE loginId = ? AND passwordId = ? AND testId = ?", [$currentPage, $loginId, $passwordId, $testId]);
	}

	function resetActivity(int $loginId, int $passwordId, int $testId, rixPDO &$db): void {
		//in order to reset the activity, we simply delete the record from the activity table
		$db->execute("DELETE FROM activity WHERE loginId = ? AND passwordId = ? AND testId = ?", [$loginId, $passwordId, $testId]);
	}

	function changeLogin(int $loginId, string $newLogin, rixPDO &$db): void {
		//check if the new login already exists
		$res = $db->fetchValue("SELECT id FROM logins WHERE name = ?", [$newLogin]);
		if ($res['rows'] === 0) {
			//if the new login does not exist, rename the current login
			$db->execute("UPDATE logins SET name = ? WHERE id = ?", [$newLogin, $loginId]);
		} else {
			$returnData['error'] = "Error: login '$newLogin' already exists!";
		}
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