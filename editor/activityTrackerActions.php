<?php

register_shutdown_function('outputJSON');
$filterSettings = false;

require_once __DIR__ . '/../inc/php/OasysActivity.php';
require_once __DIR__ . '/../inc/php/OasysFrontendState.php';

use Oasys\FrontEnd\OasysFrontendState;

const STATUS_CLOSED = 0;
const STATUS_ACTIVE = 1;
const STATUS_TIMEOUT = 2;
const STATUS_ABORTED = 3;

$data = filter_input(INPUT_POST, 'data');
if ($data) {
	$data = json_decode($data ?? '{}', true);
}

if (!$data) {
	$data = array();
}

$action = filter_input(INPUT_POST, 'action');
if ($action) {
	$action = json_decode($action ?? '{}', true);
}

if (!$action) {
	$action = false;
}

require_once '../inc/php/settings.php';
require_once '../inc/php/rixTools.php';
require_once '../inc/php/database.php';
require_once '../inc/php/rixPDO.php';
require_once '../inc/php/Crypt.php';
require_once '../inc/php/helperRoutines.php';

//all data that is returned by this script will be put into $returnData array which is sent back in JSON encoded form
$returnData = $data;
$returnData['error'] = false; //if there is an error, this will contain a string with the error message

# ----------------------- #
# Authentication Includes #
# ----------------------- #
$pageName = "activityTracker"; // set to the related 'editor button' string name (e.g., 'items')
$isSubMod = false; // set true if a module page in a subdirectory
$isActionFile = true; // set true if an "xxxActions.php" file
require_once 'inc/php/authCommonFunctions.php'; // required for authentication inclusion

//make a connection to the database and define the log file in which database errors are to be recorded
$db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, '../logs/activityTracker_errors.txt', 1, $returnData, 'error');
$results = $db->results();
if ($results['error']) {
	$returnData['error'] = 'mySQL connection error';
	die();
}

if ($action !== false) {
	//if the action is not false, it means that the user has requested an action
	//the action is a json object that is sent by the client and is used to determine which action to take
	switch ($action['action']) {
		case 'reopenTest':
			reopenTest($action, $db, $returnData);
			break;
		case 'closeTest':
			closeTest($action, $db, $returnData);
			break;
		case 'addTime':
			addTime($action, $db, $returnData);
			break;
		case 'resetActivity':
			resetActivity($action, $db, $returnData);
			break;
		default:
			$returnData['error'] = "Unknown action: {$action['action']}";
			break;
	}
}
fetchActivity($data, $db, $returnData);

/*
 *	actions
 */

//the $db and $returnData variables MUST be given by reference
function fetchActivity($data, &$db, &$returnData): void
{
	global $settings;
	$timeoutLimit = round($settings['retryCount'] * $settings['sendFrequency'] / 1000);

	/* @var $db rixPDO */ //this checks if the $data sent has all the necessary key/value pairs, in this case we are checking for param1 and param2 keys
	//if the check fails, the script will be aborted and an error sent back to the client
	checkParams($data, array('selection', 'live'));
	$whereClause = '';
	$params = [];

	switch ($data['selection']) {
		case 'date':
			if (!isset($data['date'])) {
				$whereClause = "DATE(tsLoginServer)=DATE(NOW())";
				$params = [];
			} else {
				$whereClause = "DATE(tsLoginServer)=?";
				$params = [$data['date']];
			}
			break;
	}

	$query = "SELECT
					logins.info,
					activity.loginId,
					logins.`name` as login,
					activity.passwordId,
					passwords.`name` as `password`,
       				passwords.tag as passwordTag,
					activity.testId,
					tests.`name` as test,
					DATE(tsLoginServer) AS loginDate,
					TIME(tsLoginServer) AS loginTime,
					DATE(tsActiveServer) AS contactDate,
					TIME(tsActiveServer) AS contactTime,
					TIME_TO_SEC(TIMEDIFF(now(), tsActiveServer)) AS silence,
					timeLeft,
					IF(
						JSON_VALUE(tests.options,  '$.useTimer') AND NOT JSON_VALUE(logins.overrides,'$.disableTimer'),
						JSON_VALUE(tests.options,  '$.timeLimit'),
						0
					) AS timeLimit,
					clientOpen,
					ROUND(progress*100) as progress
				  FROM
					activity
				  JOIN logins ON activity.loginId = logins.id
				  JOIN passwords ON activity.passwordId = passwords.id
				  JOIN tests ON testID = tests.id
				  WHERE $whereClause ORDER BY login, tsLoginServer";

	$res = $db->fetchTable($query, $params);
	$logins = $res['data'];

	if (count($logins) === 0) return; //no need to proceed if there is no data

	$passwords = [];
	$query = "SELECT DISTINCT passwords.name FROM activity JOIN logins ON activity.loginId = logins.id JOIN passwords ON activity.passwordId = passwords.id WHERE $whereClause";
	$res = $db->fetchColumn($query, $params);
	foreach ($res['data'] as $encryptedPW) {
		$passwords[$encryptedPW] = Crypt::decryptString($encryptedPW);
	}

	/* group data into hierarchy */
	$out = [];
	foreach ($logins as $row) {
		$p = $row;
		unset($p['login']);
		unset($p['info']);
		unset($p['loginId']);
		if (!isset($out[$row['login']])) {
			$out[$row['login']] = ['info' => json_decode($row['info'] ?? ''), 'loginId' => $row['loginId'], 'login' => $row['login']];
		}
		if ($p['timeLeft'] < 0) {
			$p['timeLeft'] = "∞";
			$p['status'] = STATUS_ACTIVE;
			if ($p['silence'] > $timeoutLimit) {
				if ($p['clientOpen'] === 0) {
					$p['status'] = STATUS_ABORTED;
				} else {
					$p['status'] = STATUS_TIMEOUT;
				}
			}
		} elseif ($p['timeLeft'] === 0) {
			$p['timeLeft'] = "00:00";
			$p['status'] = STATUS_CLOSED;
		} else {
			$p['timeLeft'] = str_pad(intdiv($p['timeLeft'], 60), 2, "0", STR_PAD_LEFT) . ":" . str_pad($p['timeLeft'] % 60, 2, "0", STR_PAD_LEFT);
			$p['status'] = STATUS_ACTIVE;
			if ($p['silence'] > $timeoutLimit) {
				if ($p['clientOpen'] === 0) {
					$p['status'] = STATUS_ABORTED;
				} else {
					$p['status'] = STATUS_TIMEOUT;
				}
			}
		}
		$p['password'] = $passwords[$p['password']];
		$out[$row['login']]['activity'][] = $p;
	}

	ksort($out);

	$returnData['data'] = $out;
}

function reopenTest($action, &$db, &$returnData): void
{
	$passwordId = $action['passwordId'] ?? null;
	$testId = $action['testId'] ?? null;
	// remove the state of this activity before closing it
	OasysFrontendState::purge($passwordId, $testId);
	$activity = new OasysActivity();
	if ($passwordId === null || $testId === null) {
		$returnData['error'] = 'Missing passwordId or testId';
		return;
	}
	$res = $activity->reopenTestWithoutTimeLimit($passwordId, $testId);
	if ($res['error']) {
		$returnData['error'] = $res['error'];
	}
}

function closeTest($action, &$db, &$returnData): void
{
	$passwordId = $action['passwordId'] ?? null;
	$testId = $action['testId'] ?? null;
	// remove the state of this activity before closing it
	OasysFrontendState::purge($passwordId, $testId);
	$activity = new OasysActivity();
	if ($passwordId === null || $testId === null) {
		$returnData['error'] = 'Missing passwordId or testId';
		return;
	}
	$res = $activity->terminateActivity($passwordId, $testId);
	if ($res['error']) {
		$returnData['error'] = $res['error'];
	}
}

function addTime($action, &$db, &$returnData): void
{
	$passwordId = $action['passwordId'] ?? null;
	$testId = $action['testId'] ?? null;
	$minutes = 60 * $action['minutes'] ?? 0;
	$activity = new OasysActivity();
	if ($passwordId === null || $testId === null) {
		$returnData['error'] = 'Missing passwordId or testId';
		return;
	}
	$res = $activity->addTime($passwordId, $testId, $minutes);
	if ($res['error']) {
		$returnData['error'] = $res['error'];
	}
}

function resetActivity($action, &$db, &$returnData): void
{
	$passwordId = $action['passwordId'] ?? null;
	$testId = $action['testId'] ?? null;
	if ($passwordId === null || $testId === null) {
		$returnData['error'] = 'Missing passwordId or testId';
		return;
	}
	$activity = new OasysActivity();
	$res = $activity->resetActivity($passwordId, $testId);
	if ($res['error']) {
		$returnData['error'] = $res['error'];
	} else {
		killState($passwordId, $testId);
	}
}


function killState($passwordId, $testId): void
{
	/*	this function is called to remove the state of a test, e.g. when the test is closed to make sure no test taker
		is still logged in and still producing data */
	if ($passwordId === null || $testId === null) {
		return; // do not purge state if no passwordId or testId is given
	}
	OasysFrontendState::purge($passwordId, $testId);
}


// this will always be called when the script ends even if a fatal error occurred
// it encodes the $returnData to JSON, and it adds an error message if a fatal PHP error occurred
// this error message is registered under the 'fatalError' key and includes the file name of the PHP script and the line number of the error
// all other errors (e.g. database) were registere under the 'error' key
function outputJSON(): void
{
	global $returnData;

	// updated username
	global $myAuth;
	$returnData['loggedInName'] = $myAuth->username;

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
