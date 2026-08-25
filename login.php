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

	global $filterSettings;

	//if the action is 'preview', we will load all settings, otherwise we will only load system settings
	if ($action !== 'preview') {
		$filterSettings = true;
	}

	require_once 'inc/php/database.php'; //contains the database connection credentials
	require_once 'inc/php/rixPDO.php'; //wrapper around PDO functions (c.f. docs folder for manual)
	require_once 'inc/php/Crypt.php';
	require_once 'inc/php/settings.php';
	require_once 'inc/php/parser.php';
	require_once 'inc/php/rixTools.php';
	require_once 'inc/php/OasysScriptParser.php';
	require_once 'inc/php/OasysTest.php';
	require_once 'inc/php/OasysActivity.php';
	require_once 'inc/php/OasysCredentials.php';
	require_once 'inc/php/loginData.php';
	require_once 'inc/php/helperRoutines.php';
	require_once 'inc/php/OasysFrontendState.php';

	use Oasys\FrontEnd\OasysFrontendState;

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

	//make a connection to the database and define the log file in which database errors are to be recorded
	$db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, __DIR__ . '/logs/login_errors.txt', 1, $returnData, 'error');
	$results = $db->results();
	if ($results['error']) {
		$returnData['error'] = 'mySQL connection error';
		die();
	}

	//check if system is not in maintenance state
	$query = "SELECT `status` FROM systemState WHERE sys_section='frontend'";
	$results = $db->fetchValue($query);
	if ($results['rows'] === 0 || $results['data'] === 1) {
		$returnData['error'] = 'systemInMaintenance';
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
	function login(array $data, rixPDO &$db, array &$returnData): void
	{
		global $skins, $serialNumber, $state, $parentState;

		//this checks if the $data sent has all the necessary key/value pairs, in this case we are checking for param1 and param2 keys
		//if the check fails, the script will be aborted and an error sent back to the client
		checkParams($data, ['login', 'password', 'tsClient', 'serialNumber']);

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
			$log = ['message' => "Invalid login", 'data' => json_encode(['login' => $data['login']])];
			$db->insert("logErrors", $log);
			$returnData['data'] = ['loginError' => 'invalidLogin'];
			die();
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
			$returnData['data'] = ['loginError' => 'invalidLogin'];
			die();
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
		$returnData['data']['login'] = $results['data'];
		$returnData['data']['login']['studentLogin'] = false;

		/* even if login is a student login, it may still be a test password, so we check that first */
		$query = "SELECT * FROM passwords WHERE loginID=? AND name=?";
		$results = $db->fetchRow($query, [$loginId, $data['password']]);
		if ($results['rows'] === 0) {
			if ($isStudentLogin === false) {
				$log = ['message' => "Invalid password", 'data' => json_encode(['login' => $data['login']])];
				$db->insert("logErrors", $log);
				$returnData['data'] = ['loginError' => 'invalidLogin'];
				die();
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
						$returnData['data'] = ['loginError' => 'invalidLogin'];
						die();
					} else {
						//parent state checks out, we convert this to a normal login so we can proceed
						$isStudentLogin = false;
					}
				} else {
					logError($db, "Direct login to student test blocked", ['login' => $data['login']]);
					$returnData['data'] = ['loginError' => 'invalidLogin'];
					die();
				}
			}
		}

		/* if login is a student login we need to differentiate between LDAP, SAML and direct logins */
		if ($isStudentLogin) {
			//check if the password corresponds to test password, if not proceed with student login
			$query = "SELECT COUNT(*) FROM passwords WHERE loginID=? AND name=?";
			$results = $db->fetchRow($query, [$loginId, $data['password']]);
			if ($results['rows'] === 0) {
				$log = ['message' => "Invalid test password", 'data' => json_encode(['login' => $data['login']])];
				$db->insert("logErrors", $log);
				$returnData['data'] = ['loginError' => 'invalidLogin'];
				die();
			}
			$returnData['data']['login']['studentLogin'] = true;
			$returnData['data']['student']['login'] = $returnData['data']['login']['name'];
			if ($isLDAP) {
				$ldapLoggedIn = checkLDAPLogin($data['login'], $unencryptedPassword, $db);
				if ($ldapLoggedIn < 0) {
					$returnData['data'] = ['loginError' => 'ldapError'];
					die();
				} elseif ($ldapLoggedIn > 0) {
					$returnData['data'] = ['loginError' => 'invalidLogin'];
					die();
				} else {
					//login successful, now fetch student info
					$query = "SELECT info, displayName FROM logins WHERE `id`=?";
					$results = $db->fetchRow($query, [$loginId]);
					if ($results['rows'] === 0) {
						logError($db, "Invalid login after successful LDAP login", ['login' => $data['login']]);
						$returnData['data'] = ['loginError' => 'invalidLogin'];
						die();
					}
					$returnData['data']['student'] = $results['data'];
				}
			} elseif ($isSAML) {
				logError($db, "SAML login not supported in normal login page", ['login' => $data['login']]);
				$returnData['data'] = ['loginError' => 'invalidLogin'];
				die();
			} else {
				/* it's a direct login, so let's check the password */
				$query = "SELECT info, displayName FROM logins WHERE `id`=? AND `password`=?";
				$results = $db->fetchRow($query, [$loginId, $data['password']]);
				if ($results['rows'] === 0) {
					logError($db, "Invalid login", ['login' => $data['login']]);
					$returnData['data'] = ['loginError' => 'invalidLogin'];
					die();
				}
				$returnData['data']['student'] = $results['data'];
			}

			//if the student login is successful, we will fetch all tests associated with this login
			$oasysCredentials = new OasysCredentials();
			$returnData['data']['student']['id'] = $loginId;
			$returnData['data']['student']['tests'] = $oasysCredentials->getTestsForStudentLogin($loginId);
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
			$query = 'SELECT SUBSTR(MAX(name), LENGTH(?) + 1) lastIndex FROM logins WHERE name RLIKE ?';
			$params = [$loginFields['name'] . "_", "^" . $loginFields['name'] . "_[0-9]+"];
			$results = $db->fetchValue($query, $params);
			if ($results['rows'] === 0) {
				$newIdx = str_pad("1", 8, "0", STR_PAD_LEFT);
			} else {
				$newIdx = str_pad(((int)$results['data']) + 1, 8, "0", STR_PAD_LEFT);
			}

			//cloning the testee and updating return data accordingly
			unset($loginFields['id']); //autoincrement id must be removed before inserting into database
			$loginFields['name'] = $loginFields['name'] . "_$newIdx";
			$loginFields['template'] = 'cloned';

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
				$testData = getTestData($testId, $db, $returnData, $passwordId);
				$returnData['data']['test'] = $testData;
				/*
				 * Check if test is currently accessible (date/time constraints, disabled test etc.)
				 */
				if (!checkSchedule($testData)) {
					$returnData['data']['loginError'] = 'testLocked'; //date/time constraints prevent access
				} elseif ($testData['active'] !== 1) {
					$returnData['data']['loginError'] = 'testDeactivated'; //test is manually disabled
				} else {
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

				/*
				 * In this case we do not break here, so that the foreach loop will continue with the
				 * next test if there is one.
				 */
			}
		}

		if (($returnData['data']['test']['options']['saveResults'] ?? false) === false || ($returnData['data']['login']['overrides']['disableSaving'] ?? false) === true) {
			$savingDisabled = true;
		} else {
			$savingDisabled = false;
			OasysFrontendState::purge($passwordId); //clear all previous state data for this login/password combination
		}
		$state->loginId = $loginId;
		$state->passwordId = $passwordId;
		if ($savingDisabled === true) {
			$state->savingDisabled = $savingDisabled;
		}

		if (isset($testId)) {
			$state->testId = $testId;
		}

		/*
		 * If the foreach loop is over and no test has been found that is still open,
		 * $returnData['data']['loginError'] will contain the appropriate error
		 */
	}

	function checkLDAPLogin(string $username, string $password, &$db): int
	{
		global $settings;
		$app_user = $settings['ldap_appUser'];
		$app_pass = Crypt::decryptString($settings['ldap_appPass']);
		$ldap_server = $settings['ldap_server'];
		$search_base = $settings['ldap_searchBase'];

		putenv('LDAPTLS_REQCERT=never'); // this is required to ignore SSL certificate as we have not imported the chain
		$conn_status = ldap_connect($ldap_server);
		if ($conn_status === false) {
			logError($db, "Couldn't connect to LDAP server", ['server' => $ldap_server]);
			return -1; //couldn't connect to LDAP server
		}

		//set protocol version 3. Important to support passwords with certain special characters e.g. the EURO sign
		ldap_set_option($conn_status, LDAP_OPT_PROTOCOL_VERSION, 3);

		//disable referrals due to security issues
		ldap_set_option($conn_status, LDAP_OPT_REFERRALS, 0);

		$bind_status = ldap_bind($conn_status, $app_user, $app_pass);
		if ($bind_status === false) {
			logError($db, "Couldn't bind to LDAP as application user", ['error' => ldap_error($conn_status)]);
			ldap_close($conn_status);
			return -2; //couldn't bind to LDAP as application user
		}

		// variable query string - the %1 in the imported settings string is substituted with the $username value
		$settingsQuery = $settings['ldap_query'];
		$query = str_replace('%1', $username, $settingsQuery);

		$search_status = ldap_search($conn_status, $search_base, $query, array('dn', 'msds-userpasswordexpirytimecomputed'));

		//if an error occurred during search
		if ($search_status === false) {
			logError($db, "LDAP search failed", ['error' => ldap_error($conn_status), 'query' => $query, 'base' => $search_base]);
			return -3;
		}

		//pull the search results
		$result = ldap_get_entries($conn_status, $search_status);
		if ($result === false) {
			logError($db, "LDAP search failed", ['error' => ldap_error($conn_status)]);
			return -4;
		}

		//check if there is either no match or more than 1 match
		if ((int) @$result['count'] === 0) {
			logError($db, "Username not found on LDAP", ['username' => $username]);
			return 1; //Username not found on LDAP
		} else if ((int) @$result['count'] > 1) {
			logError($db, "Duplicate usernames found on LDAP", ['error' => @$result['count']]);
			return 2; //Duplicate usernames found on LDAP
		}

		//read DN and convert expiry date
		$userdn = $result[0]['dn'];
		$ms_expiry = $result[0]['msds-userpasswordexpirytimecomputed'][0] ?? null;
		if (!is_null($ms_expiry)) {
			$expiryDate = bcsub(bcdiv($ms_expiry, '10000000'), '11644473600');
		}

		// if DN entry is empty
		if (trim((string) $userdn) == '') {
			logError($db, "Empty DN found on LDAP", ['error' => ldap_error($conn_status)]);
			return -5; //Empty DN found on LDAP
		}

		// manually suppress error warning
		$prevHandler = set_error_handler(function ($severity, $message) {
			if ($severity === E_WARNING &&
				(str_contains($message, 'ldap_bind(') || str_contains($message, 'ldap_start_tls('))) {
				// swallow this specific warning
				return true; // handled
			}
			return false; // let PHP handle other warnings normally
		});

		$auth_status = @ldap_bind($conn_status, $userdn, $password);

		// Always restore the previous handler
		restore_error_handler();

		//if login fails
		if ($auth_status === false) {

			if (isset($expiryDate) && time() > $expiryDate) {
				// if password has expired
				logError($db, "LDAP password expired", ['username' => $username, 'expiryDate' => date('Y-m-d H:i:s', $expiryDate)]);
				return 3; //Password expired
			} else {
				// if login has failed due to any other reason (probably wrong password)
				logError($db, "LDAP incorrect password", ['username' => $username]);
				return 4; //Incorrect password
			}
		}

		ldap_close($conn_status);
		return 0; //login successful
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

	function preview(array $data, rixPDO &$db, array &$returnData): void
	{
		global $settings, $skins, $state, $myAuth;

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

		$state->preview = $data['previewMode'];

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
		$log = ['message' => $message, 'data' => json_encode($data)];
		$db->insert("logErrors", $log);
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
