<?php


	register_shutdown_function('outputJSON');
	require_once __DIR__ . '/inc/php/initSettings.php';
	require_once __DIR__ . '/inc/php/actionAllowlist.php';
	require_once __DIR__ . '/inc/php/OasysCredentials.php';
	require_once __DIR__ . '/inc/php/OasysTest.php';
	require_once __DIR__ . '/inc/php/OasysActivity.php';
	require_once __DIR__ . '/inc/php/OasysFrontendState.php';

	use Oasys\FrontEnd\OasysFrontendState;
	use Oasys\exceptions\StateExpiredException;

	//action is a string that defines what action to perform
	$action = filter_input(INPUT_POST, 'action');
	if (!$action) {
		$action = "";
	}

	$serialNumber = filter_input(INPUT_POST, 'serialNumber');
	if (!$serialNumber) {
		die();
	}

	//data is a JSON encoded associative array that contains all the necessary data for the action to be performed
	//(the array must be manually JSON encoded before sending to get past max_input_vars limitation)
	$data = filter_input(INPUT_POST, 'data');
	if ($data) {
		$data = json_decode($data ?? '', true);
	}
	if (!$data) {
		$data = array();
	}

	//all data that is returned by this script will be put into $returnData array which is sent back in JSON encoded form
	$returnData = array();
	$returnData['action'] = $action; //when returning we must specify which action was performed
	$returnData['error'] = false; //if there is an error, this will contain a string with the error message

	$state = OasysFrontendState::getInstance($serialNumber);

	//call function whose name is given by the $action variable
	//(the name of the function must obviously exactly match the string in $action)
	//an action function will always be given the $data sent by the client, a pointer to the database object and a pointer to the global $returnData array
	if (oasysRejectUnknownAction(__FILE__, $action, $returnData)) exit;
	$action($data, $db, $returnData);

	function fetchStudentLoginTests(array $data, rixPDO $db, array &$returnData): void {
		global $state;
		$loginId = $state->studentId;
		$oasysCredentials = new OasysCredentials();
		$tests = $oasysCredentials->getTestsForStudentLogin($loginId);
		$returnData['data']['tests'] = $tests;
	}

	//checks if mandatory data is present
	function checkParams(&$data, $params): void
	{
		global $returnData;
		if (!$params || count($params) == 0) {
			return;
		}
		foreach ($params as $key) {
			if (!isset($data[$key])) {
				$returnData['error'] = "Error: missing parameter '$key'!";
				die();
			}
		}
	}

	function outputJSON(): void {
		global $returnData, $action;
		$error = error_get_last();
		if (!empty($error)) {
			$documentRoot = filter_input(INPUT_SERVER, "DOCUMENT_ROOT");
			$file = str_replace($documentRoot, '', $error['file']);
			$returnData['fatalError'] = "<p>Fatal error [type {$error['type']}] on line {$error['line']} of<br><code class='tinyCode'>$file</code></p><p>{$error['message']}</p>";
		}
		header('Cache-Control: no-cache, must-revalidate');
		header('Content-type: application/json; charset=UTF-8');
		echo json_encode($returnData);
	}
