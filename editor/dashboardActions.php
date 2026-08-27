<?php

	/** @phan-file-suppress PhanUnusedGlobalFunctionParameter, PhanUnusedVariable, PhanRedefineFunction, PhanUnusedClosureParameter, PhanTypeArraySuspiciousNullable, PhanSuspiciousWeakTypeComparison, PhanUnusedVariableValueOfForeachWithKey, PhanUnusedPublicNoOverrideMethodParameter */

//the JSON output will happen, even if a fatal error prevents the script from finishing
	register_shutdown_function('outputJSON');
	require_once __DIR__ . '/inc/php/initBackend.php';


	$action = filter_input(INPUT_POST, 'action');
	if (!$action) {
		$action = "";
	}

	$returnData = [];
	$returnData['action'] = $action;
	$returnData['error'] = false;

# ----------------------- #
# Authentication Includes #
# ----------------------- #
	$pageName = "dashboard"; // set to the related 'editor button' string name (e.g., 'items')
	$isSubMod = false; // set true if a module page in a subdirectory
	$isActionFile = true; // set true if an "xxxActions.php" file
	require_once 'inc/php/authCommonFunctions.php'; // required for authentication inclusion

	$returnData = (array)$myAuth->returnData;

// if the auth constructor results in an error, we want to immediately exit and report said error
	if ($myAuth->returnData['error'] !== false) {
		// $returnData['error'] = $myAuth->returnData['error'];
		exit;
	}

	$data = filter_input(INPUT_POST, 'data');
	if ($data) {
		$data = json_decode($data ?? '', true);
	}
	if (!$data) {
		$data = array();
	}
//data field must be separately JSON encoded before sending to get past max_input_vars limitation

	if (oasysRejectUnknownAction(__FILE__, $action, $returnData)) exit;
	$action($data, $db, $returnData, $myAuth);

	/*
	###############
	FUNCTIONS START
	###############
	*/

	function check($data, rixPDO &$db, &$returnData, userAuth &$myAuth)
	{
		// Intentionally empty: authentication runs before dispatch, while outputJSON()
		// returns the current username and validates the user's configured skin.
	}

	function outputJSON(): void
	{
		global $returnData, $db, $action, $myAuth;

		// updated username
		global $myAuth;
		$returnData['loggedInName'] = $myAuth->username;


		if (!isset($returnData['action'])) {
			$returnData['action'] = $action;
		}

		$error = error_get_last();
		if (!empty($error)) {
			$documentRoot = filter_input(INPUT_SERVER, "DOCUMENT_ROOT");
			$file = str_replace($documentRoot, '', $error['file']);
			$returnData['fatalError'] = "<p>Fatal error [type {$error['type']}] on line {$error['line']} of<br><code class='tinyCode'>$file</code></p><p>{$error['message']}</p>";
		}

		// check for valid skin setting for account; and blank out if not valid
		$userAD = $db->fetchValue("SELECT `accessDef` FROM `users` WHERE `id` = ?", [$myAuth->userid])['data'];
		$userAD = json_decode($userAD ?? '{}', true);
		if (!is_array($userAD)) {
			$userAD = [];
		}
		if (isset($userAD['userSettings']['skin'])) {
			$skinList = array_column(\Oasys\OasysSettings::findSkins(), "id");

			// when we find a bad skin value, just remove the setting all together and put back into accessDef column for user
			if (!in_array($userAD['userSettings']['skin'], $skinList)) {
				unset($userAD['userSettings']['skin']);
				$newUserADdata = json_encode($userAD);
				$db->update("users", ["accessDef" => $newUserADdata], "id = ?", [$myAuth->userid]);
			}
		}

		header('Cache-Control: no-cache, must-revalidate');
		header('Content-type: application/json; charset=UTF-8');
		echo json_encode($returnData);
	}
