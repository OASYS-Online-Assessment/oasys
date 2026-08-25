<?php

/** @phan-file-suppress PhanUnusedGlobalFunctionParameter, PhanUnusedVariable, PhanRedefineFunction, PhanUnusedClosureParameter, PhanTypeArraySuspiciousNullable, PhanSuspiciousWeakTypeComparison, PhanUnusedVariableValueOfForeachWithKey, PhanUnusedPublicNoOverrideMethodParameter */
/** @noinspection SqlResolve */

require_once __DIR__ . "/inc/php/initBackend.php";
require_once 'inc/php/testsCommonFunctions.php';

//the JSON output will happen, even if a fatal error prevents the script from finishing
register_shutdown_function('outputJSON');

require_once "../inc/php/Crypt.php";
require_once '../inc/php/parser.php';
require_once '../inc/php/helperRoutines.php';
require_once '../inc/php/OasysScoring.php';

//action is a string that defines what action to perform
$action = filter_input(INPUT_POST, 'action');
if (!$action) {
	$action = "";
}

//all data that is returned by this script will be put into $returnData array which is sent back in JSON encoded form
$returnData = array();
$returnData['action'] = $action; //when returning we must specify which action was performed
$returnData['error'] = false; //if there is an error, this will contain a string with the error message

# ----------------------- #
# Authentication Includes #
# ----------------------- #
$pageName = "tests"; // set to the related 'editor button' string name (e.g., 'items')
$isSubMod = false; // set true if a module page in a subdirectory
$isActionFile = true; // set true if an "xxxActions.php" file
require_once 'inc/php/authCommonFunctions.php'; // required for authentication inclusion

//data is a JSON encoded associative array that contains all the necessary data for the action to be performed
//(the array must be manually JSON encoded before sending to get past max_input_vars limitation)
$data = filter_input(INPUT_POST, 'data');
if ($data) {
	$data = json_decode($data ?? '', true);
}
if (!$data) {
	$data = array();
}

// //call function whose name is given by the $action variable
// //(the name of the function must obviously exactly match the string in $action)
// //an action function will always be given the $data sent by the client, a pointer to the database object and a pointer to the global $returnData array
// $action($data, $db, $returnData);

# ------------------------------------------- #
# Inclusion of item/folder existence checking #
# ------------------------------------------- #
$tableName = (object)['primary' => 'testFolders', 'secondary' => 'tests'];
require_once 'inc/php/objectCommonFunctions.php';

# ------------------------------------------- #
# Inclusion of permission authenticator class #
# ------------------------------------------- #
$permAuth = new permAuth($action, $data, $myAuth);

# ---------------------------------------- #
# Action permission authentication routine #
# ---------------------------------------- #
$letMePass = $permAuth->permCheck($data);
if ($letMePass === true) {
	switch ($action) {
		// the following action calls are in the permAuth class, and require redirection to said class
		case 'updatePerm':
		case 'fetchIgPerm':
			$permAuth->$action($data, $db, $permAuth->returnData, $myAuth);
			$returnData = $permAuth->returnData;
			break;

		// standard actions found in this itemActions file
		default:
			// preset the returnData var with anything the authenticator may have alraedy loaded in prior to sending to action
			$returnData = $permAuth->returnData;
			if (oasysRejectUnknownAction(__FILE__, $action, $returnData)) exit;
			$action($data, $db, $returnData);
			break;
	}
} else {
	// forward on the fail message from the auth class
	$returnData = $permAuth->returnData;
}

/*
###############
FUNCTIONS START
###############
*/
