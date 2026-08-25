<?php

	//the JSON output will happen, even if a fatal error prevents the script from finishing
	register_shutdown_function('outputScore');

	global $filterSettings;
	$filterSettings = true;

	require_once 'inc/php/database.php'; //contains the database connection credentials
	require_once 'inc/php/rixPDO.php'; //wrapper around PDO functions (c.f. docs folder for manual)
	require_once 'inc/php/settings.php';
	require_once 'inc/php/parser.php';
	require_once 'inc/php/helperRoutines.php';
	require_once 'inc/php/OasysScoring.php';
	require_once 'inc/php/OasysFrontendState.php';
	require_once 'inc/php/exceptions/StateExpiredException.php';

	use Oasys\frontend\OasysFrontendState;
	use Oasys\exceptions\StateExpiredException;

	//action is a string that defines what action to perform
	$action = filter_input(INPUT_POST, 'action');

	//data is a JSON encoded associative array that contains all the necessary data for the action to be performed
	//(the array must be manually JSON encoded before sending to get past max_input_vars limitation)
	$data = filter_input(INPUT_POST, 'data');
	if ($data) {
		$data = json_decode($data ?? '{}', true);
	}

	checkParams($data, ['serialNumber']);
	$serialNumber = $data['serialNumber'];
	try {
		$state = OasysFrontendState::getInstance($serialNumber);
	} catch (StateExpiredException $e) {
		$returnData['error'] = 'session expired';
		die();
	}
	$data['testId'] = $state->testId ?? null;
	$data['loginId'] = $state->loginId ?? null;
	$data['passwordId'] = $state->passwordId ?? null;

	//all data that is returned by this script will be put into $returnData array which is sent back in JSON encoded form
	$returnData = [];
	$returnData['action'] = $action; //when returning we must specify which action was performed
	$returnData['error'] = false; //if there is an error, this will contain a string with the error message
	$returnData['fatalError'] = false; //if there is an error, this will contain a string with the error message

	//make a connection to the database and define the log file in which database errors are to be recorded
	$db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, __DIR__ . '/logs/score_errors.txt', 1, $returnData, 'error');
	$results = $db->results();
	if ($results['error']) {
		$returnData['error'] = 'mySQL connection error';
		die();
	}

	//call function whose name is given by the $action variable
	//(the name of the function must obviously exactly match the string in $action)
	//an action function will always be given the $data sent by the client, a pointer to the database object and a pointer to the global $returnData array
	$action($data, $db, $returnData);

	/*
	 * actions
	 */

	//the $db and $returnData variables MUST be given by reference
	function fetchScore($data, &$db, &$returnData): void
	{

		/** @var rixPDO $db */ //this checks if the $data sent has all the necessary key/value pairs, in this case we are checking for param1 and param2 keys
		//if the check fails, the script will be aborted and an error sent back to the client
		$testId = $data['testId'];
		$passwordId = $data['passwordId'];
		try {
			$settings = new stdClass();
			$settings->saveResults = $data['saveResults'];
			if (!$settings->saveResults) {
				$settings->adhocAnswers = [$testId => $data['answers']];
				$settings->activity = [
					$passwordId => [
						'passwordId' => $passwordId,
						'login' => 'adhoc'
					]
				];
			}
			$testScoring = new OasysScoring(testId: $testId, db: $db, passwordId: $passwordId, settings: $settings);
			$testScoring->populateAnswers();
		} catch (Exception $e) {
			$returnData['error'] = $e->getMessage();
			die();
		}
		$scoreSummary = $testScoring->getScoreSummary();
		if (isset($scoreSummary[$passwordId]['achieved']) && isset($scoreSummary[$passwordId]['max'])) {
			$returnData['data'] = ['score' => $scoreSummary[$passwordId]['achieved'], 'maxScore' => $scoreSummary[$passwordId]['max'], 'percentage' => $scoreSummary[$passwordId]['percentage']];
		} else {
			$returnData['data'] = ['score' => 0, 'maxScore' => 0, 'percentage' => 0];
		}
	}

	// this will always be called when the script ends even if a fatal error occurred
	// it encodes the $returnData to JSON and it adds an error message if a fatal PHP error occurred
	// this error message is registered under the 'fatalError' key and includes the file name of the PHP script and the line number of the error
	// all other errors (e.g. database) were registere under the 'error' key
	function outputScore(): void
	{
		GLOBAL $returnData, $action, $settings, $handledExceptions;
		if (!isset($returnData['action'])) $returnData['action'] = $action;
		$returnData['sender'] = 'OASYS';
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
			unset($returnData['debug']);
		}
		header('Cache-Control: no-cache, must-revalidate');
		header('Content-type: application/json; charset=UTF-8');
		echo json_encode($returnData);
	}