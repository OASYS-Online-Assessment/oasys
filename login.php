<?php

	//the JSON output will happen, even if a fatal error prevents the script from finishing
	register_shutdown_function('outputJSON');

	//action is a string that defines what action to perform
	$action = filter_input(INPUT_POST, 'action');

	//data is a JSON encoded associative array that contains all the necessary data for the action to be performed
	//(the array must be manually JSON encoded before sending to get past max_input_vars limitation)
	$data = filter_input(INPUT_POST, 'data');
	if ($data) {
		$data = json_decode($data ?? '', true);
	}

	require_once __DIR__ . '/inc/php/initSettings.php';
	require_once __DIR__ . '/inc/php/actionAllowlist.php';
	require_once __DIR__ . '/inc/php/Crypt.php';
	require_once __DIR__ . '/inc/php/parser.php';
	require_once __DIR__ . '/inc/php/OasysScriptParser.php';
	require_once __DIR__ . '/inc/php/OasysTest.php';
	require_once __DIR__ . '/inc/php/OasysActivity.php';
	require_once __DIR__ . '/inc/php/OasysCredentials.php';
	require_once __DIR__ . '/inc/php/loginData.php';
	require_once __DIR__ . '/inc/php/helperRoutines.php';
	require_once __DIR__ . '/inc/php/OasysFrontendState.php';
	require_once __DIR__ . '/inc/php/OasysLdapAuthenticator.php';

	use Oasys\FrontEnd\OasysFrontendState;
	use Oasys\OasysLdapAuthenticator;

	//all data that is returned by this script will be put into $returnData array which is sent back in JSON encoded form
	$returnData = [];
	$returnData['action'] = $action; //when returning we must specify which action was performed
	$returnData['error'] = false; //if there is an error, this will contain a string with the error message
	$returnData['fatalError'] = false; //if there is an error, this will contain a string with the error message

	if (!$data || !$action) {
		$returnData['fatalError'] = 'Missing parameters';
		die();
	}

	$serialNumber = $data['serialNumber'];
	$parentSerialNumber = $data['parentSerialNumber'] ?? null;
	$state = OasysFrontendState::getInstance($serialNumber, true);
	if ($parentSerialNumber) {
		$parentState = OasysFrontendState::getInstance($parentSerialNumber, true);
	} else {
		$parentState = null;
	}

	//check if system is not in maintenance state
	$query = "SELECT `status` FROM systemState WHERE sys_section='frontend'";
	$results = $db->fetchValue($query);
	if ($results['rows'] === 0 || $results['data'] === 1) {
		$returnData['error'] = 'systemInMaintenance';
		$state->eraseState();
		die();
	}

	//call function whose name is given by the $action variable
	//(the name of the function must obviously exactly match the string in $action)
	//an action function will always be given the $data sent by the client, a pointer to the database object and a pointer to the global $returnData array
	if (oasysRejectUnknownAction(__FILE__, $action, $returnData)) exit;
	$action($data, $db, $returnData);

	/*
	 * actions
	 */

	//the $db and $returnData variables MUST be given by reference
	function login(array $data, rixPDO &$db, array &$returnData): void
	{
		global $skins, $serialNumber, $state, $parentState;

		//this checks if the $data sent has all the necessary key/value pairs, in this case we are checking for param1 and param2 keys
		//if the check fails, the script will be aborted and an error sent back to the client
		checkParams($data, ['login', 'password', 'tsClient', 'serialNumber']);
		$lockStatus = getFrontendLoginLockStatus($db, $data['login']);
		if ($lockStatus['locked'] === true) {
			$returnData['data'] = ['loginError' => 'loginTemporarilyLocked', 'lockMinutes' => $lockStatus['minutesRemaining']];
			$state->eraseState();
			die();
		}

		$unencryptedPassword = $data['password'];
		$data['password'] = Crypt::encryptString($data['password']);

		/*
		If a test is configured to not save data, it can never be recognized as already finished.
		In this case after a test is over the frontend will send the information 'previousTestId' so we know which was
		the last test to have been finished by the test taker.
		*/
		if (isset($data['previousTestId'])) {
			$previousTestId = $data['previousTestId'];
			$skipTest = true;
		} else {
			$previousTestId = -1;
			$skipTest = false;
		}

		$query = "SELECT id, name, overrides, template, loginType FROM logins WHERE name=?";
		$results = $db->fetchRow($query, [$data['login']]);
		if ($results['rows'] === 0) {
			rejectFrontendLoginAttempt($db, $returnData, $state, $data['login'], 'unknownLogin');
		}

		$isTemplate = false;
		$isStudentLogin = false;
		$isLDAP = false;
		$isSAML = false;

		//establish type of login we encountered
		if ($results['data']['loginType'] === 'directPass') {
			$isStudentLogin = true;
		} elseif ($results['data']['loginType'] === 'LDAP') {
			$isStudentLogin = true;
			$isLDAP = true;
		} elseif ($results['data']['loginType'] === 'SAML') {
			$isStudentLogin = true;
			$isSAML = true;
			//temporary measure for v3.5 of OASYS
			logError($db, "SAML login not supported in normal login page", ['login' => $data['login']]);
			rejectFrontendLoginAttempt($db, $returnData, $state, $data['login'], 'unsupportedLoginType');
		} elseif ($results['data']['template'] === 'template') {
			$isTemplate = true;
		}

		$loginId = $results['data']['id'];
		if ($isStudentLogin) {
			$state->studentId = $loginId;
		} else {
			$state->loginId = $loginId;
		}
		unset ($results['data']['id']); //autoincrement id of test taker should not be visible in front end data
		decodeData($results['data'], 'overrides');
		//fill in missing default override properties
		$defaultOverrides = [
			"disableTimer" => false,
			"disableSaving" => false,
			"allowNavigation" => false,
			"additionalTime" => 0,
			"demoMode" => false,
			"forwardUrl" => '',
			"loginForwarding" => false
		];
		addMissingPropertyDefaults($results['data']['overrides'], $defaultOverrides);
		//check if overrides include a login forwarding
		if ($results['data']['overrides']['loginForwarding'] === true && isset($results['data']['overrides']['forwardUrl'])) {
			$returnData['data'] = ['loginError' => 'loginForwarding', 'forwardUrl' => $results['data']['overrides']['forwardUrl']];
			$state->eraseState();
			die();
		}

		$returnData['data']['login'] = $results['data'];
		$returnData['data']['login']['studentLogin'] = false;

		/* even if login is a student login, it may still be a test password, so we check that first */
		$query = "SELECT * FROM passwords WHERE loginID=? AND name=?";
		$results = $db->fetchRow($query, [$loginId, $data['password']]);
		if ($results['rows'] === 0) {
			if ($isStudentLogin === false) {
				rejectFrontendLoginAttempt($db, $returnData, $state, $data['login'], 'invalidPassword');
			} else {
				//this is the normal situation of a student login, proceed with $isStudentLogin === true
			}
		} else {
			//student login with test password (this happens when a task is clicked in the dashboard)
			$passwordId = $results['data']['id'];
			$pwData = $results['data'];
			if ($isStudentLogin === true) {
				if ($parentState) {
					$parentId = $parentState->studentId;
					if ($parentId !== $loginId) {
						logError($db, "Student login id mismatch", ['login' => $data['login']]);
						rejectFrontendLoginAttempt($db, $returnData, $state, $data['login'], 'studentMismatch');
					} else {
						//parent state checks out, we convert this to a normal login so we can proceed
						$isStudentLogin = false;
					}
				} else {
					logError($db, "Direct login to student test blocked", ['login' => $data['login']]);
					rejectFrontendLoginAttempt($db, $returnData, $state, $data['login'], 'studentDirectBlocked');
				}
			}
		}

		/* if login is a student login we need to differentiate between LDAP, SAML and direct logins */
		if ($isStudentLogin) {
			//check if the password corresponds to test password, if not proceed with student login
			$query = "SELECT COUNT(*) FROM passwords WHERE loginID=? AND name=?";
			$results = $db->fetchRow($query, [$loginId, $data['password']]);
			if ($results['rows'] === 0) {
				rejectFrontendLoginAttempt($db, $returnData, $state, $data['login'], 'invalidTestPassword');
			}
			$returnData['data']['login']['studentLogin'] = true;
			$returnData['data']['student']['login'] = $returnData['data']['login']['name'];
			if ($isLDAP) {
				$ldapStatus = checkLDAPLogin($data['login'], $unencryptedPassword, $db);
				if (in_array($ldapStatus, [
					OasysLdapAuthenticator::INVALID_CREDENTIALS,
					OasysLdapAuthenticator::PASSWORD_EXPIRED
				], true)) {
					rejectFrontendLoginAttempt($db, $returnData, $state, $data['login'], 'ldapInvalidCredentials');
				} elseif ($ldapStatus !== OasysLdapAuthenticator::SUCCESS) {
					$returnData['data'] = ['loginError' => 'ldapError'];
					$state->eraseState();
					die();
				}

				//login successful, now fetch student info
				$query = "SELECT info, displayName FROM logins WHERE `id`=?";
				$results = $db->fetchRow($query, [$loginId]);
				if ($results['rows'] === 0) {
					logError($db, "Invalid login after successful LDAP login", ['login' => $data['login']]);
					rejectFrontendLoginAttempt($db, $returnData, $state, $data['login'], 'loginCorruptionAfterLDAP');
				}
				$returnData['data']['student'] = $results['data'];
			} elseif ($isSAML) {
				logError($db, "SAML login not supported in normal login page", ['login' => $data['login']]);
				rejectFrontendLoginAttempt($db, $returnData, $state, $data['login'], 'unsupportedStudentSamlLogin');
			} else {
				/* it's a direct login, so let's check the password */
				$query = "SELECT info, displayName FROM logins WHERE `id`=? AND `password`=?";
				$results = $db->fetchRow($query, [$loginId, $data['password']]);
				if ($results['rows'] === 0) {
					logError($db, "Invalid login", ['login' => $data['login']]);
					rejectFrontendLoginAttempt($db, $returnData, $state, $data['login'], 'invalidDirectPassPassword');
				}
				$returnData['data']['student'] = $results['data'];
			}

			//if the student login is successful, we will fetch all tests associated with this login
			$oasysCredentials = new OasysCredentials();
			$returnData['data']['student']['id'] = $loginId;
			$returnData['data']['student']['tests'] = $oasysCredentials->getTestsForStudentLogin($loginId);
			$state->studentLanguage = $data['language'] ?? null;
			$returnData['data']['tsClient'] = $data['tsClient'];
			$returnData['data']['tsServer'] = round(microtime(true), 3);
			if (isset($data['language'])) {
				$returnData['data']['language'] = $data['language'];
			}
			return; //do not proceed with the rest of the script if it's a student login -> redirect to welcome page
		}

		/*
		 * if testee is a template we need to clone it before we can continue
		 */
		if ($isTemplate) {

			//fetching template data
			$query = "SELECT * FROM logins WHERE id=?";
			$results = $db->fetchRow($query, [$loginId]);
			$loginFields = $results['data'];

			//now we need to find the last used index for clones of this template and increment it by 1
			$query = 'SELECT SUBSTR(MAX(name), LENGTH(?) + 1) lastIndex FROM logins WHERE parentTemplateId=? AND name RLIKE ?';
			$params = [$loginFields['name'] . "_", (int)$loginFields['id'], "^" . $loginFields['name'] . "_[0-9]+"];
			$results = $db->fetchValue($query, $params);
			if ($results['rows'] === 0) {
				$newIdx = str_pad("1", 8, "0", STR_PAD_LEFT);
			} else {
				$newIdx = str_pad(((int)$results['data']) + 1, 8, "0", STR_PAD_LEFT);
			}

			//cloning the testee and updating return data accordingly
			$templateId = (int)$loginFields['id'];
			unset($loginFields['id']); //autoincrement id must be removed before inserting into database
			$loginFields['name'] = $loginFields['name'] . "_$newIdx";
			$loginFields['parent'] = null;
			$loginFields['template'] = 'cloned';
			$loginFields['parentTemplateId'] = $templateId;

			$results = $db->insert("logins", $loginFields);
			$loginId = $results['id']; //new autoincrement id for cloned login
			$returnData['data']['login']['name'] = $loginFields['name'];
			$returnData['data']['login']['template'] = 'cloned';

			//inserting new password data
			unset($pwData['id']);
			$pwData['loginID'] = $loginId;
			$pwData['name'] = Crypt::encryptString(createRandomPassword(12));
			$results = $db->insert("passwords", $pwData);
			$passwordId = $pwData['id'] = $results['id'];
		}

		$pwData['name'] = Crypt::decryptString($pwData['name']);

		unset ($pwData['id']); //autoincrement id of password should not be visible in front end data
		unset ($pwData['loginID']); //autoincrement id of test taker should not be visible in front end data
		$returnData['data']['password'] = $pwData;

		$serialNumber = $data['serialNumber'];
		$tsClient = $data['tsClient'];
		$returnData['data']['tsClient'] = $tsClient; //this will allow to measure the delay from sending to receiving
		$returnData['data']['tsServer'] = round(microtime(true), 3); //this will allow to calculate the delta between local and server time

		decodeData($pwData, 'structure');
		if (!isset($pwData['structure']) || count($pwData['structure']) == 0) {
			$returnData['data'] = ['loginError' => 'invalidTestData'];
			$state->eraseState();
			die();
		}
		$returnData['data']['password']['structure'] = $pwData['structure'];

		$testCount = count($returnData['data']['password']['structure']);
		foreach ($returnData['data']['password']['structure'] as $k => $test) {
			$testId = $test['hiddenID'];
			if ($skipTest) {
				if ($testId === $previousTestId) {
					$skipTest = false;
				}
				continue;
			}
			if ($k < $testCount - 1) {
				$returnData['data']['lastTest'] = false;
			} else {
				$returnData['data']['lastTest'] = true;
			}

			$activity = getActivity($passwordId, $testId, $db);
			if ($activity !== false) {
				/*
				 * Case 1: there is already activity for this test, but there is still time left
				 * Case 2: there is no activity for this test yet
				 */
				/*
				 * Check if the test is currently accessible before fetching its contents.
				 */
				$testAccessData = getTestAccessData($testId, $db, $returnData);
				if (!checkSchedule($testAccessData)) {
					$returnData['data']['loginError'] = 'testLocked'; //date/time constraints prevent access
				} elseif ($testAccessData['active'] !== 1) {
					$returnData['data']['loginError'] = 'testDeactivated'; //test is manually disabled
				} else {
					$testData = getTestData($testId, $db, $returnData, $passwordId);
					$returnData['data']['test'] = $testData;
					/*
					 * test is accessible, now check if it has already some activity
					 */
					$returnData['data']['loginError'] = false; //clear error from previous loop if any
					if ($activity !== true) {
						/*
						 * Case 1: there is already activity for this test, but there is still time left
						 */
						if ($activity['serialNumber'] != $serialNumber && $activity['clientOpen'] === 1) {
							/*
							 * Case 1.1: another computer has been active on this test
							 */
							$tsActivity = DateTime::createFromFormat('Y-m-d H:i:s.u', $activity['tsActiveServer']);
							$now = new DateTime("now");
							$interval = $now->getTimestamp() - $tsActivity->getTimestamp();
							/*
							 * If the other computer has been active on this test less than 1 minute ago, we will not
							 * allow the current computer to login. This is to prevent two computers from working on the
							 * same test at the same time.
							 */
							if ($interval < 60) {
								$returnData['debug']['tsActivity'] = $tsActivity->getTimestamp();
								$returnData['debug']['tsNow'] = $now->getTimestamp();
								$returnData['debug']['interval'] = $interval;
								$returnData['data']['loginError'] = 'loginInUse';
								$returnData['data']['lastActivity'] = $activity['tsActiveServer'];  //last activity by other computer
								$returnData['data']['timeUntilRelease'] = $interval;    //number of seconds until login becomes free again
								$state->eraseState();
								die();
							}
						}
						/*
						 * Nothing prevents the current computer from logging in, so we will send all relevant data about
						 * previous activity to the frontend
						 */
						$returnData['data']['activity'] = [];
						$returnData['data']['activity']['currentItem'] = $activity['currentItem'];
						$returnData['data']['activity']['language'] = $activity['language'];
						$returnData['data']['activity']['lastEventId'] = $activity['lastEventId'];
						$returnData['data']['activity']['lastPayloadId'] = $activity['lastPayloadId'];
						$returnData['data']['activity']['timeLeft'] = $activity['timeLeft'];
						$returnData['data']['activity']['metaData'] = $activity['metaData'];
					}

					if (isset($data['variables'])) {
						$variables = $data['variables'];
						if (count($variables) > 0) {
							$returnData['data']['test']['variables'] = array_merge($returnData['data']['test']['variables'], $variables);
						}
					}

					$returnData['data']['skin'] = getSkinFolder($returnData['data']['test']['skin']['skin'], $skins, $returnData);
					$returnData['data']['answers'] = getAnswersData($passwordId, $testId, $db);
					break;
				}
			} else {
				/*
				 * Case 3: there is already activity for this test, and the time has either run out or
				 * the test has been manually closed
				 */

				$returnData['data']['loginError'] = 'testClosed';
				$state->eraseState();

				/*
				 * In this case we do not break here, so that the foreach loop will continue with the
				 * next test if there is one.
				 */
			}
		}

		if (!isset($returnData['data']['test'])) {
			$state->eraseState();
			die();
		}

		if (($returnData['data']['test']['options']['saveResults'] ?? false) === false || ($returnData['data']['login']['overrides']['disableSaving'] ?? false) === true) {
			$savingDisabled = true;
		} else {
			$savingDisabled = false;
			OasysFrontendState::purge($passwordId); //clear all previous state data for this login/password combination
		}
		$state->loginId = $loginId;
		$state->passwordId = $passwordId;
		$state->savingDisabled = $savingDisabled;

		//save the use of a timer and the timeLimit to the state
		$timeLimit = $returnData['data']['test']['options']['timeLimit'] ?? 0;
		if ($returnData['data']['test']['options']['useTimer'] === true) {
			if ($returnData['data']['login']['overrides']['disableTimer'] === true) {
				$timeLimit = 0;
			}
		} else {
			$timeLimit = 0;
		}
		if ($returnData['data']['login']['overrides']['additionalTime'] > 0 && $timeLimit > 0) {
			$additionalTimeMultiplier = $returnData['data']['login']['overrides']['additionalTime'] / 100;
			$minutesToAdd = $additionalTimeMultiplier * $timeLimit;
			$timeLimit += $minutesToAdd;
		}
		$state->timeLimit = $timeLimit;

		if (isset($testId)) {
			$state->testId = $testId;
		}

		/*
		 * If the foreach loop is over and no test has been found that is still open,
		 * $returnData['data']['loginError'] will contain the appropriate error
		 */
	}

	function normalizeLoginThrottleKey(string $login): string
	{
		return strtolower(trim($login));
	}

	function rejectFrontendLoginAttempt(rixPDO &$db, array &$returnData, OasysFrontendState $state, string $login, string $reason): void
	{
		$lockStatus = registerFrontendLoginFailure($db, $login, $reason);
		if ($lockStatus['locked'] === true) {
			$returnData['data'] = ['loginError' => 'loginTemporarilyLocked', 'lockMinutes' => $lockStatus['minutesRemaining']];
		} else {
			$returnData['data'] = ['loginError' => 'invalidLogin'];
		}
		$state->eraseState();
		die();
	}

	function registerFrontendLoginFailure(rixPDO &$db, string $login, string $reason): array
	{
		global $settings;
		$loginKey = normalizeLoginThrottleKey($login);
		$encodedLogin = rawurlencode($loginKey);
		$encodedReason = rawurlencode($reason);
		$data = "scope=login;login=$encodedLogin;reason=$encodedReason";
		$db->insert("logErrors", ['message' => 'frontendLoginFailure', 'data' => $data]);

		$window = $settings['frontendFailedAttemptWindow'];
		$countByLoginQuery = "SELECT COUNT(*) FROM logErrors
			WHERE message='frontendLoginFailure'
			AND tsServer >= (NOW() - INTERVAL $window SECOND)
			AND data LIKE ?";
		$countByLogin = (int)($db->fetchValue($countByLoginQuery, ["%scope=login;login=$encodedLogin;%"])['data'] ?? 0);
		if ($countByLogin >= $settings['frontendMaxFailedAttempts'] && frontendLockMinutesRemaining($db, "scope=login;login=$encodedLogin;") === 0) {
			$db->insert("logErrors", ['message' => 'frontendLoginLock', 'data' => "scope=login;login=$encodedLogin;"]);
		}

		return getFrontendLoginLockStatus($db, $login);
	}

	function frontendLockMinutesRemaining(rixPDO &$db, string $scopeData): int
	{
		global $settings;
		$lockTsQuery = "SELECT UNIX_TIMESTAMP(tsServer) FROM logErrors
			WHERE message='frontendLoginLock' AND data LIKE ?
			ORDER BY id DESC LIMIT 1";
		$lastLockTimestamp = (int)($db->fetchValue($lockTsQuery, ["%$scopeData%"])['data'] ?? 0);
		if ($lastLockTimestamp === 0) {
			return 0;
		}
		$remaining = $settings['frontendLoginLockoutSeconds'] - (time() - $lastLockTimestamp);
		if ($remaining <= 0) {
			return 0;
		}
		return (int)ceil($remaining / 60);
	}

	function getFrontendLoginLockStatus(rixPDO &$db, string $login): array
	{
		$loginKey = normalizeLoginThrottleKey($login);
		$encodedLogin = rawurlencode($loginKey);
		$remainingMinutes = frontendLockMinutesRemaining($db, "scope=login;login=$encodedLogin;");
		return [
			'locked' => $remainingMinutes > 0,
			'minutesRemaining' => $remainingMinutes
		];
	}

	function checkLDAPLogin(string $username, #[\SensitiveParameter] string $password, &$db): string
	{
		global $settings;
		return OasysLdapAuthenticator::authenticate(
			$username,
			$password,
			$settings,
			static function (string $message, array $context) use (&$db): void {
				logError($db, $message, $context);
			}
		);
	}

	function checkSchedule($testData): bool
	{
		/* check scheduling of test */
		$restrictions = $testData['options']['restrictions'];
		$loginAllowed = true;

		//check date range
		if ($restrictions['dateRange'] !== false) {
			if ($restrictions['dateRange']['start'] !== false) {
				$start = strtotime($restrictions['dateRange']['start']);
				if ($start > time()) {
					$loginAllowed = false;
				}
			}
			if ($restrictions['dateRange']['end'] !== false) {
				$end = strtotime($restrictions['dateRange']['end']);
				if ($end < time()) {
					$loginAllowed = false;
				}
			}
		}

		//check time range
		$currentTime = (new DateTime())->setTimestamp(time());
		if ($restrictions['timeRestriction'] !== false) {
			if ($restrictions['timeRestriction']['start'] !== false) {
				$start = DateTime::createFromFormat('H:i', $restrictions['timeRestriction']['start']);
				if ($start > $currentTime) {
					$loginAllowed = false;
				}
			}
			if ($restrictions['timeRestriction']['end'] !== false) {
				$end = DateTime::createFromFormat('H:i', $restrictions['timeRestriction']['end']);
				if ($end < $currentTime) {
					$loginAllowed = false;
				}
			}
		}

		//check weekday
		$currentDay = date('w', time()) - 1;
		if ($restrictions['testDays'] !== false) {
			if (!preg_match("/$currentDay/", $restrictions['testDays']['days'])) {
				$loginAllowed = false;
			}
		}

		return $loginAllowed;
	}

	function restoreStudentLogin(array $data, rixPDO &$db, array &$returnData): void
	{
		global $state;

		checkParams($data, ['serialNumber', 'tsClient']);
		$studentId = $state->studentId;
		if (!is_numeric($studentId)) {
			$returnData['data'] = ['restored' => false];
			$state->eraseState();
			return;
		}

		$query = "SELECT `name`, `info`, `displayName`, `loginType` FROM logins WHERE `id`=?";
		$results = $db->fetchRow($query, [(int)$studentId]);
		if ($results['rows'] !== 1 || !in_array($results['data']['loginType'], ['directPass', 'LDAP', 'SAML'], true)) {
			$returnData['data'] = ['restored' => false];
			$state->eraseState();
			return;
		}

		$login = $results['data'];
		unset($login['info'], $login['displayName'], $login['loginType']);
		$login['studentLogin'] = true;

		$student = [
			'id' => (int)$studentId,
			'info' => $results['data']['info'],
			'displayName' => $results['data']['displayName'],
		];
		$oasysCredentials = new OasysCredentials();
		$student['tests'] = $oasysCredentials->getTestsForStudentLogin((int)$studentId);

		$returnData['data'] = [
			'restored' => true,
			'login' => $login,
			'student' => $student,
			'tsClient' => $data['tsClient'],
			'tsServer' => round(microtime(true), 3),
		];
		$language = $state->studentLanguage;
		if (is_string($language) && $language !== '') {
			$returnData['data']['language'] = $language;
		}
	}

	function preview(array $data, rixPDO &$db, array &$returnData): void
	{
		global $settings, $config, $skins, $state, $myAuth;

		// a preview must not be allowed in a browser that is not logged into the editor
		$pageName = "login";
		$isSubMod = false;
		$isActionFile = false;
		require_once __DIR__ . '/editor/inc/php/authCommonFunctions.php'; // required for authentication inclusion
		require_once __DIR__ . '/editor/inc/php/permAuth.php'; // required for verifying read permissions

		//this checks if the $data sent has all the necessary key/value pairs, in this case we are checking for param1 and param2 keys
		//if the check fails, the script will be aborted and an error sent back to the client
		checkParams($data, ['previewMode', 'tsClient', 'serialNumber']);

		//check read permissions for the preview mode
		switch ($data['previewMode']) {
			case 'item':
				$action = 'previewItem';
				checkParams($data, ['itemId']);
				//select groupId in which the item is located from database
				$query = "SELECT groupId FROM items WHERE id=?";
				$results = $db->fetchValue($query, [$data['itemId']]);
				if ($results['rows'] === 0) {
					$returnData['error'] = 'previewAccessDenied';
					// we do not confirm if an id exists or not; if it doesn't, we just return the same error as when permissions are not granted
					die();
				}
				$permsData = ['id' => $data['itemId'], 'groupId' => $results['data']];
				break;
			case 'itemGroup':
				$action = 'previewGroup';
				checkParams($data, ['groupId']);
				$permsData = ['id' => $data['groupId']];
				break;
			case 'test':
				$action = 'previewTest';
				checkParams($data, ['testId']);
				$permsData = ['dbId' => $data['testId']];
				$state->testId = $data['testId'];
				break;
			default:
				$returnData['error'] = 'previewAccessDenied';
				die();
		}
		$permAuth = new permAuth($action, $permsData, $myAuth);
		$letMePass = $permAuth->permCheck($data);
		if ($letMePass !== true) {
			$returnData['error'] = 'previewAccessDenied';
			die();
		}

		// A compiler error leaves the editor source available, but all derived
		// columns are NULL. Do not pass such a page into the normal renderer,
		// which expects a complete parsed/fields/options/scripts set.
		if ($data['previewMode'] === 'item') {
			$invalidPages = $db->fetchValue(
				'SELECT COUNT(*) FROM items WHERE (id=? OR id=(SELECT link FROM items WHERE id=?)) AND (`parsed` IS NULL OR `fields` IS NULL OR `options` IS NULL OR `scripts` IS NULL)',
				[$data['itemId'], $data['itemId']]
			);
			if ((int)($invalidPages['data'] ?? 0) > 0) {
				$returnData['error'] = 'noContent';
				die();
			}
		} elseif ($data['previewMode'] === 'itemGroup') {
			$invalidPages = $db->fetchValue(
				'SELECT COUNT(*) FROM items WHERE groupId=? AND (`parsed` IS NULL OR `fields` IS NULL OR `options` IS NULL OR `scripts` IS NULL)',
				[$data['groupId']]
			);
			if ((int)($invalidPages['data'] ?? 0) > 0) {
				$returnData['error'] = 'noContent';
				die();
			}
		}

		$state->preview = $data['previewMode'];
		$state->savingDisabled = true; //disable saving of results in preview mode

		/* fake login data */
		$overrides = ['allowNavigation' => false, 'demoMode' => false, 'disableSaving' => true, 'disableTimer' => false];
		$returnData['data']['login'] = ['template' => 'preview', 'overrides' => $overrides];
		$returnData['data']['password'] = [];
		$returnData['data']['previewMode'] = $data['previewMode'];
		if (isset($data['language'])) {
			$returnData['data']['language'] = $data['language'];
		}

		$tsClient = $data['tsClient'];
		$returnData['data']['tsClient'] = $tsClient; //this will allow to measure the delay from sending to receiving
		$returnData['data']['tsServer'] = round(microtime(true), 3); //this will allow to calculate the delta between local and server time
		$returnData['data']['lastTest'] = true;

		$returnData['data']['activity'] = [];
		$returnData['data']['activity']['currentItem'] = 0;
		$returnData['data']['activity']['lastEventId'] = 0;
		$returnData['data']['activity']['lastPayloadId'] = 0;
		$returnData['data']['activity']['timeLeft'] = -1;

		$test = [];

		if ($data['previewMode'] === 'itemGroup' || $data['previewMode'] === 'item') {
			/* fake test data */
			$test['id'] = -1;
			$returnData['data']['skin'] = getSkinFolder($settings['skin'], $skins, $returnData);

			$test['structure'] = ['help' => [], 'type' => 'linear'];
			if ($data['previewMode'] === 'itemGroup') {
				$itemGroup = fetchItemGroup($data['groupId'], $db, $returnData);
			} else {
				$itemGroup = fetchItem($data['itemId'], $db, $returnData);
			}

			foreach ($itemGroup['items'] as $k => $item) {
				if (isset($data['itemId']) && $item['hiddenID'] === $data['itemId']) {
					$returnData['data']['activity']['currentItem'] = $k;
				}
			}

			$test['structure']['items'] = $itemGroup['items'];
			$test['labels'] = $itemGroup['labels'];
			$test['items'] = $itemGroup['itemDetails'];
			$test['name'] = 'Preview itemGroup';
			$test['metadata'] = [];
			$test['skin'] = getSkinData($settings['skin'], $skins, $returnData);
			$test['options'] = ['limitNavigation' => false, 'saveResults' => false, 'showScore' => false, 'useTimer' => false];
			if (is_array($itemGroup['languages']) && count($itemGroup['languages']) > 0) {
				if (isset($data['language'])) {
					$returnData['data']['activity']['language'] = $data['language'];
				} else {
					$returnData['data']['activity']['language'] = $itemGroup['languages'][0];
				}
			} else {
				$returnData['error'] = "noContent";
				die();
			}
			$returnData['debug'] = $itemGroup;
			foreach ($itemGroup['languages'] as $lang) {
				$test['options'][$lang] = true;
			}
		} elseif ($data['previewMode'] === 'test') {
			checkParams($data, ['testId']);
			$testId = $data['testId'];
			$test = getTestData($testId, $db, $returnData);
			$returnData['data']['skin'] = getSkinFolder($test['skin']['skin'], $skins, $returnData);
		}

		$returnData['data']['test'] = $test;

		$returnData['data']['answers'] = [];
	}

	function logError(rixPDO &$db, string $message, ?array $data): void{
		$encodedData = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) ?: '{}';
		$truncate = static fn(string $value): string => function_exists('mb_strcut')
			? mb_strcut($value, 0, 255, 'UTF-8')
			: substr($value, 0, 255);
		$result = $db->insert("logErrors", [
			'message' => $truncate($message),
			'data' => $truncate($encodedData)
		]);
		if (($result['error'] ?? true) !== false) {
			error_log('[OASYS] Could not insert an entry into logErrors.');
		}
	}

	// this will always be called when the script ends even if a fatal error occurred
	// it encodes the $returnData to JSON and it adds an error message if a fatal PHP error occurred
	// this error message is registered under the 'fatalError' key and includes the file name of the PHP script and the line number of the error
	// all other errors (e.g. database) were registere under the 'error' key
	function outputJSON(): void
	{
		global $returnData, $action, $settings, $handledExceptions;

		if (!isset($returnData['action'])) {
			$returnData['action'] = $action;
		}
		$returnData['sender'] = 'OASYS';
		$error = error_get_last();
		if (!empty($error)) {
			$documentRoot = filter_input(INPUT_SERVER, "DOCUMENT_ROOT");
			$file = str_replace($documentRoot, '', $error['file']);
			$returnData['fatalError'] = "<p>Fatal error [type {$error['type']}] on line {$error['line']} of<br><code class='tinyCode'>$file</code></p><p>{$error['message']}</p>";
		}
		if ($action === 'login' && (
			!empty($returnData['data']['loginError'])
			|| ($returnData['error'] ?? false) !== false
			|| ($returnData['fatalError'] ?? false) !== false
		)) {
			$loginErrorData = [];
			if (!empty($returnData['data']['loginError'])) {
				$loginErrorData['loginError'] = $returnData['data']['loginError'];
				if ($loginErrorData['loginError'] === 'loginForwarding' && isset($returnData['data']['forwardUrl'])) {
					$loginErrorData['forwardUrl'] = $returnData['data']['forwardUrl'];
				}
				if ($loginErrorData['loginError'] === 'loginTemporarilyLocked' && isset($returnData['data']['lockMinutes'])) {
					$loginErrorData['lockMinutes'] = $returnData['data']['lockMinutes'];
				}
			}
			$returnData['data'] = $loginErrorData;
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
