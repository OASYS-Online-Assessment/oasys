<?php

	register_shutdown_function('outputJSON');
	require_once '../../inc/php/database.php'; //contains the database connection credentials
	require_once '../../inc/php/rixPDO.php'; //wrapper around PDO functions (c.f. docs folder for manual)
	require_once '../../inc/php/rixTools.php';
	require_once '../../inc/php/helperRoutines.php';
	require_once '../../inc/php/settings.php';
	require_once '../../inc/php/Crypt.php';
	require_once '../../inc/php/apiRoutines.php';

	$apiName = 'createTestTaker';
	$returnData = ['error' => false];

	/* the action defines which step of the process we are at: first make a request, then send the data */
	$action = getParameter('action', FILTER_UNSAFE_RAW, $returnData);
	if (!$action) {
		$returnData['error'] = "action missing";
		die();
	}

	$db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, __DIR__ . '/../../logs/API_createTestTaker.txt', 1, $returnData, 'error');
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

		$testTakers = getParameter('testTakers', FILTER_UNSAFE_RAW, $returnData);
		if (!$testTakers) {
			$returnData['error'] = "test taker data is missing";
			die();
		}
		$testTakers = json_decode($testTakers ?? '', true);
		if (json_last_error() != JSON_ERROR_NONE) {
			$returnData['error'] = "Error decoding test takers: JSON error " . json_last_error();
			die();
		}

		/*  all information except for the logins themselves can be sent as a global parameter if it applies to all
			test takers. If supplied again inside a test taker array, that value is seen as an override of the global
			value. */

		$globalPassword = getParameter('password', FILTER_UNSAFE_RAW, $returnData);
		$globalTestIds = getParameter('testIds', FILTER_UNSAFE_RAW, $returnData, true);
		$globalFolderId = getParameter('folderId', FILTER_SANITIZE_NUMBER_INT, $returnData);
		$globalMetaData = getParameter('metaData', FILTER_UNSAFE_RAW, $returnData, true);
		$globalTag = getParameter('tag', FILTER_UNSAFE_RAW, $returnData);

		foreach ($testTakers as $k => $tt) {
			$testTakers[$k]['error'] = false;
			$login = $tt['login'] ?? null;
			if (isset($tt['password'])) {
				$pwSupplied = true;
				$password = $tt['password'];
			} elseif (isset($globalPassword)) {
				$pwSupplied = true;
				$password = $globalPassword;
			} else {
				$pwSupplied = false;
			}
			$testIds = $tt['testIds'] ?? $globalTestIds ?? [];
			$folderId = $tt['folderId'] ?? $globalFolderId;
			$metaData = $tt['metaData'] ?? $globalMetaData ?? [];
			$tag = $tt['tag'] ?? $globalTag;

			/* sanitizing data */
			if (!isset($login)) {
				$testTakers[$k]['error'] = 'login missing';
				continue;
			} elseif (!isset($testIds) || !is_array($testIds) || count($testIds) === 0) {
				$testTakers[$k]['error'] = 'test ids missing or in wrong format';
				continue;
			}

			/* fetching home folder id if no folder id is given */
			if (!isset($folderId)) {
				$res = $db->fetchValue("SELECT id FROM loginsFolders WHERE ISNULL(parent) LIMIT 1");
				if ($res['rows'] === 0) {
					$testTakers[$k]['error'] = 'database error -> home folder could not be found';
					continue;
				}
				$folderId = $res['data'];
			}

			$loginId = getLoginId($login, $db);
			if (!$pwSupplied && isset($tag)) {
				/*	case 1: if no password is supplied but a password tag is given, we'll try to find an existing password
					for that login with the supplied tag and send it back - nothing will be created in that case. If no
					matching password can be found we randomly create one with the supplied tag */

				if ($loginId !== false) {
					/* if login exists check if a password with the supplied tag also does */
					$password = getPasswordByTag($loginId, $tag, $db);

					if ($password !== false) {
						/* if a password with the matching tag was found we check if the testIds match */
						$testTakers[$k]['password'] = $password;
						if (!compareTestStructure($loginId, $tag, $testIds, $db)) {
							/* if the structure does not match we send back the password but we issue an error */
							$testTakers[$k]['error'] = 'credentials already exist, but structure does not match';
						} else {
							$passwordId = getPasswordIdByTag($loginId, $tag, $db);
							$testTakers[$k]['state'] = getState($passwordId, $db);
						}
					} else {
						/* if no password could be found to match the given tag we need to create the password */
						$password = createRandomPassword(8);
						$testTakers[$k]['password'] = $password;
						$testTakers[$k]['error'] = createPassword($loginId, $password, $testIds, $db, $tag);
						$testTakers[$k]['state'] = true; //password was just created, so the credentials are not used yet
					}

				} else {
					/* if login does not exist we are good to go creating the test taker with a random password */
					$res = createLogin($login, $metaData, $folderId, $db);
					if (!is_numeric($res)) {
						$testTakers[$k]['error'] = $res;
						continue;
					} else {
						$loginId = $res;
					}
					$password = createRandomPassword(8);
					$testTakers[$k]['password'] = $password;
					$testTakers[$k]['error'] = createPassword($loginId, $password, $testIds, $db, $tag);
					$testTakers[$k]['state'] = true; //login & password was just created, so the credentials are not used yet
				}
			} elseif (!$pwSupplied && !isset($tag)) {
				/*	case 2: if neither password nor tag is sent, we randomly create a password and create the credentials */

				if ($loginId === false) {
					/* if login does not exist we are good to go creating the test taker with a random password */
					$res = createLogin($login, $metaData, $folderId, $db);
					if (!is_numeric($res)) {
						$testTakers[$k]['error'] = $res;
						continue;
					} else {
						$loginId = $res;
					}
					//login and password was just created, so the credentials are not used yet
				}
				$password = createRandomPassword(8);
				$testTakers[$k]['password'] = $password;
				$testTakers[$k]['error'] = createPassword($loginId, $password, $testIds, $db);
				$testTakers[$k]['state'] = true;
			} else {
				/* case 3: if a password is supplied we create the credentials as supplied, unless they already exist */

				if ($loginId !== false) {
					/* if login exists check if the password also does */
					$passwordId = getPasswordIdByName($loginId, $password, $db);

					if ($passwordId !== false) {
						/* password already exists, so we check the state of the credentials (open/closed) */
						$testTakers[$k]['state'] = getState($passwordId, $db);
					} else {
						/* if password does not exist we need to create it */
						$testTakers[$k]['error'] = createPassword($loginId, $password, $testIds, $db, $tag);
						$testTakers[$k]['state'] = true; //password was just created, so the credentials are not used yet
					}

				} else {
					/* if login does not exist we are good to go creating the test taker with the supplied password */
					$res = createLogin($login, $metaData, $folderId, $db);
					if (!is_numeric($res)) {
						$testTakers[$k]['error'] = $res;
						continue;
					} else {
						$loginId = $res;
					}
					$testTakers[$k]['error'] = createPassword($loginId, $password, $testIds, $db, $tag);
					$testTakers[$k]['state'] = true; //login and password was just created, so the credentials are not used yet
				}
			}
		}

		$returnData['testTakers'] = $testTakers;
	}

	function createLogin(string $login, array $metaData, int $folderId, rixPDO &$db) {
		if (!checkFolderId($folderId, $db)) {
			return "invalid folder id";
		}
		$data = ['name' => $login, 'info' => json_encode($metaData), 'parent' => $folderId, 'overrides' => '{"demoMode": false, "disableTimer": false, "disableSaving": false, "allowNavigation": false}', 'template' => 'testee'];
		$res = $db->insert('logins', $data);
		return $res['id'];

	}

	function createPassword(int $loginId, string $password, array $testIds, rixPDO &$db, ?string $tag = ''): bool|string {
		$password = Crypt::encryptString($password);
		$structure = [];
		if ($tag === null) $tag = '';

		/* Before creating the password and linking the test ids we need to verify if the test ids even exist at all */
		foreach ($testIds as $testId) {
			if (checkTestId($testId, $db)) {
				$structure[] = ['hiddenID' => $testId];
			} else {
				return "invalid test id: $testId";
			}
		}

		$structure = json_encode($structure);
		$data = ['loginID' => $loginId, 'structure' => $structure, 'name' => $password, 'tag' => $tag];
		$db->insert("passwords", $data);
		return false;
	}

	function getLoginId(string $login, rixPDO &$db) {
		$res = $db->fetchValue("SELECT id FROM logins WHERE name = ?", [$login]);
		if ($res['rows'] === 0) {
			return false;
		}
		return $res['data'];
	}

	function getPasswordByTag(int $loginId, string $tag, rixPDO &$db): bool|string {
		$res = $db->fetchValue("SELECT name FROM passwords WHERE loginId = ? AND tag = ? LIMIT 1", [$loginId, $tag]);
		if ($res['rows'] === 0) {
			return false;
		}
		return Crypt::decryptString($res['data']);
	}

	function getPasswordIdByTag(int $loginId, string $tag, rixPDO &$db) {
		$res = $db->fetchValue("SELECT id FROM passwords WHERE loginId = ? AND tag = ? LIMIT 1", [$loginId, $tag]);
		if ($res['rows'] === 0) {
			return false;
		}
		return $res['data'];
	}

	function getPasswordIdByName(int $loginId, string $password, rixPDO &$db) {
		$password = Crypt::encryptString($password);
		$res = $db->fetchValue("SELECT id FROM passwords WHERE loginId = ? AND `name` = ? LIMIT 1", [$loginId, $password]);
		if ($res['rows'] === 0) {
			return false;
		}
		return $res['data'];
	}

	function compareTestStructure(int $loginId, string $tag, array $testIds, rixPDO &$db): bool {
		$res = $db->fetchValue("SELECT structure FROM passwords WHERE loginId = ? AND tag = ? LIMIT 1", [$loginId, $tag]);
		$structure = json_decode($res['data'] ?? '', true);
		if (json_last_error() != JSON_ERROR_NONE) {
			return false;
		}

		if (count($testIds) !== count($structure)) {
			return false;
		}

		foreach ($testIds as $k => $v) {
			if ($v !== $structure[$k]['hiddenID']) {
				return false;
			}
		}
		return true;
	}

	function getState(int $passwordId, rixPDO &$db): bool {
		$res = $db->fetchValue("SELECT structure FROM passwords WHERE id = ? LIMIT 1", [$passwordId]);
		$structure = json_decode($res['data'] ?? '', true);
		if (json_last_error() != JSON_ERROR_NONE) {
			return false;
		}

		foreach ($structure as $test) {
			$testId = $test['hiddenID'];
			$res = $db->fetchValue("SELECT timeLeft FROM activity WHERE passwordId = ? AND testId = ?", [$passwordId, $testId]);

			/* if no activity is registered for at least one of the tests, these credentials are still available, so we can return true */
			if ($res['rows'] === 0) {
				return true;
			}

			/* if there is activity, but timeLeft is not 0 the credentials are also still accessible */
			if ($res['data'] !== 0) {
				return true;
			}

		}

		/* once we reach this point and did not find a test that was still open, we return false: the credentials are already used up */
		return false;
	}

	function checkTestId(int $id, rixPDO &$db): bool {
		$res = $db->fetchValue("SELECT COUNT(*) FROM tests WHERE id = ?", [$id]);
		return $res['data'] === 1;
	}

	function checkFolderId(int $id, rixPDO &$db): bool {
		$res = $db->fetchValue("SELECT COUNT(*) FROM loginsFolders WHERE id = ?", [$id]);
		return $res['data'] === 1;
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