<?php


	register_shutdown_function('outputJSON');
	require_once __DIR__ . "/inc/php/initBackend.php";

	//action is a string that defines what action to perform
	$action = filter_input(INPUT_POST, 'action');
	if (!$action) {
		$action = "";
	}

	//data is a JSON encoded associative array that contains all the necessary data for the action to be performed
	//(the array must be manually JSON encoded before sending to get past max_input_vars limitation)
	$data = filter_input(INPUT_POST, 'data');
	if ($data) {
		$data = base64_decode($data);
		$data = json_decode($data ?? '', true);
	}
	if (!$data) {
		$data = array();
	}

	//all data that is returned by this script will be put into $returnData array which is sent back in JSON encoded form
	$returnData = array();
	$returnData['action'] = $action; //when returning we must specify which action was performed
	$returnData['error'] = false; //if there is an error, this will contain a string with the error message

	# ----------------------- #
	# Authentication Includes #
	# ----------------------- #
	$pageName = "pages"; // set to the related 'editor button' string name (i.e., 'items')
	$isSubMod = false; // set true if a module page in a subdirectory
	$isActionFile = true; // set true if an "xxxActions.php" file
	require_once 'inc/php/authCommonFunctions.php'; // required for authentication inclusion

	# ----------------------- #
	# Translation Include 	  #
	# ----------------------- #
	$uiLang = new uiLang($settings['interfaceLanguage']);

	if ($action === 'keepSessionAlive') {
		// This action is used to keep the session alive, no further processing needed
		exit();
	}

	// The page editor is an editing interface. Resolve permissions from the
	// requested page id and require the established Content Manager write
	// permission for every operation; page/group ids supplied by the client
	// are never used as an authorization boundary.
	$pageId = $data['id'] ?? null;
	if (!is_int($pageId) || $pageId <= 0) {
		$returnData['error'] = 'Invalid page id.';
		exit;
	}
	$permAuth = new permAuth('fetchPage', ['id' => $pageId], $myAuth);
	if ($permAuth->permCheck(['id' => $pageId]) !== true) {
		$returnData['error'] = $permAuth->returnData['error'] ?? 'You do not have permission to edit this page.';
		$returnData['reloadFolder'] = $permAuth->returnData['reloadFolder'] ?? true;
		exit;
	}

	require_once "inc/php/pageClass.php";
	if (oasysRejectUnknownAction(__FILE__, $action, $returnData)) exit;
	$importer = new pageClass($returnData, $data);
	$importer->execute($action);

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
