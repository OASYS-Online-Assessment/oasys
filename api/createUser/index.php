<?php

	register_shutdown_function('outputJSON');
	require_once __DIR__ . '/../../editor/inc/php/initBackend.php'; // replaces database.php + rixPDO.php
	require_once __DIR__ . '/../../inc/php/rixTools.php';
	require_once __DIR__ . '/../../inc/php/helperRoutines.php';
	require_once __DIR__ . '/../../editor/inc/php/userHandling.php';
	require_once __DIR__ . '/../../inc/php/apiRoutines.php';

	$apiName = 'createUser';
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

		$userName = getParameter('username', FILTER_UNSAFE_RAW, $returnData);
		if (!$userName) {
			$returnData['error'] = "Username missing";
			die();
		}
		$returnData['username'] = $userName;

		$userGroup = getParameter('usergroup', FILTER_UNSAFE_RAW, $returnData);
		if (!$userGroup) {
			$returnData['error'] = "Usergroup missing";
			die();
		}
		$returnData['usergroup'] = $userGroup;

		$email = getParameter('email', FILTER_VALIDATE_EMAIL, $returnData);
		if (!$email) {
			$email = '';
		}
		$returnData['email'] = $email;

		/* let's check if the required usergroup exists */

		$res = $db->fetchValue("SELECT id FROM userGroups WHERE `name` = ? LIMIT 1", [$userGroup]);
		if ($res['rows'] === 0) {
			$returnData['error'] = "Usergroup does not exist";
			die();
			/* creating a user is only supported if a usergroup already exists, otherwise there will be chaos with groups and permissions */
		}

		$groupId = $res['data'];

		$password = getParameter('password', FILTER_UNSAFE_RAW, $returnData);
		if (!$password) {
			$password = createRandomPassword(12);
		}
		$returnData['password'] = $password;

		/*
			check validity of username and password; while this is done again by the addUser function, we want
			to catch problems early and send out customized error messages appropriate for the API.
		 */

		if (preg_match('/[^.A-Za-z0-9_-]/', $userName)) {
			$returnData['error'] = "Username may contain only letters, numbers, underscores, periods and dashes";
			die();
		}

		if (strlen($userName) > 32) {
			$returnData['error'] = "Username must not be longer than 32 characters";
			die();
		}

		if (strlen($password) > 32) {
			$returnData['error'] = "Password must not be longer than 32 characters";
			return;
		}

		$query = "SELECT COUNT(*) as `isPresent` FROM `users` WHERE `name` = ?";
		$parameters = array($userName);
		$results = $db->fetchRow($query, $parameters);

		if ($results['data']['isPresent'] !== 0) {
			$returnData['error'] = "Username already exists";
			die();
		}

		/* if all data is ok we can get on with the task of creating the user */
		//	checkParams($data['userData'], ['nu_edt_uname', 'nu_edt_pwd', 'userGroupId', 'acctTypeVal', 'nu_edt_eml']);

		$data = ['userData' => ['nu_edt_uname' => $userName, 'nu_edt_pwd' => $password, 'userGroupId' => $groupId, 'acctTypeVal' => 'LOCAL', 'nu_edt_eml' => $email]];
		$returnData['error'] = false;
		chdir($_SERVER['DOCUMENT_ROOT'] . $settings['rootURL'] . DIRECTORY_SEPARATOR . 'editor' . DIRECTORY_SEPARATOR);
		addUser($data, $db, $returnData);
		unset($returnData['data']);
	}

	function outputJSON(): void
	{
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