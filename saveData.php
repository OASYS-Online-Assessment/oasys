<?php

	//the JSON output will happen, even if a fatal error prevents the script from finishing
	register_shutdown_function('outputJSON');
	$returnData = array();

	require_once __DIR__ . '/inc/php/initSettings.php';
	require_once __DIR__ . '/inc/php/rixTools.php';
	require_once __DIR__ . '/inc/php/OasysFrontendState.php';
	require_once __DIR__ . '/inc/php/exceptions/StateExpiredException.php';
	require_once __DIR__ . '/inc/php/OasysBehaviour.php';

	use Oasys\FrontEnd\OasysFrontendState;
	use Oasys\exceptions\StateExpiredException;

	//data is a JSON encoded associative array that contains all the necessary data for the actions to be performed
	//(the array must be manually JSON encoded before sending to get past max_input_vars limitation)
	$data = file_get_contents('php://input');

	/* sanitize size of data received -> stop assessment if a package of more than 1MB (base64 encoded) data is sent */
	if (strlen($data) > 10485760) {
		$returnData['error'] = 'Allowed data size limit exceeded. Cannot proceed!';
		$timestamp = date("Y-m-d_H-i-s");
		$filename = "dataSizeError_" . $timestamp . ".txt";
		file_put_contents(__DIR__ . '/logs/' . $filename, $data);
		exit();
	}
	$data = base64_decode($data);

	if ($data) {
		$data = json_decode($data ?? '{}', true);
	}

	if (!$data['test'] || !$data['test']['serialNumber']) {
		$returnData['fatalError'] = 'Missing parameters';
		die();
	}

	$serialNumber = $data['test']['serialNumber'];
	try {
		$state = OasysFrontendState::getInstance($serialNumber);
	} catch (StateExpiredException $e) {
		$returnData['error'] = 'sessionExpired';
		exit();
	}
	$data['test']['testId'] = $state->testId ?? null;
	$data['test']['loginId'] = $state->loginId ?? null;
	$data['test']['passwordId'] = $state->passwordId ?? null;

	//security check: make sure that the ids have not been tampered with
	if ($state->preview) {
		$preview = true;
	} else if ($data['test']['testId'] === null || $data['test']['loginId'] === null || $data['test']['passwordId'] === null) {
		$returnData['error'] = 'Compromised data has been detected! Cannot proceed!';
		exit();
	}

	//all data that is returned by this script will be put into $returnData array which is sent back in JSON encoded form
	$returnData['error'] = false; //if there is an error, this will contain a string with the error message
	$returnData['fatalError'] = false; //if there is an error, this will contain a string with the error message
	$returnData['tsServer'] = round(microtime(true), 3); //this will allow to calculate the delta between local and server time
	$writeNoOutput = false;
	checkParams($data, ['challenge', 'test']);
	$response = rand(1, 1000000);
	$returnData['response'] = $response;
	$returnData['checksum'] = $response + $data['challenge'];

	if ($state->savingDisabled === true) {
		/*
		If this is a test login, that does not save to the database, all we need is the server timestamp, so we exit
		again here, right away.	We need to send the payloadId, which should always be negative for nonsaving tests, so
		that the client can recuperate from a connectivity loss properly.
		*/
		$returnData['payloadId'] = $data['payloadId'];
		exit();
	}

	//check if system is not in maintenance state
	$query = "SELECT `status` FROM systemState WHERE sys_section='frontend'";
	$results = $db->fetchValue($query);
	if ($results['rows'] === 0 || $results['data'] === 1) {
		$returnData['instructions'] = [['command' => 'maintenance']];
		exit();
	}

	//check if there are any instructions for the frontend
	$res = $db->fetchValue('SELECT instructions FROM activity WHERE passwordId = ? AND testId = ?', [$data['test']['passwordId'], $data['test']['testId']]);
	$instructions = [];
	if ($res['rows'] > 0 && $res['data'] !== null) {
		//json decode the instructions and write an empty array if the decoding fails
		$returnData['instructions'] = json_decode($res['data'], true) ?? [];
		// now erase the instructions so that they are not sent again
		$db->update('activity', ['instructions' => NULL], "passwordId = ? AND testId = ?", [$data['test']['passwordId'], $data['test']['testId']]);
		$instructions = $returnData['instructions'];
	}

	if (isset($data['metadata'])) {
		saveMetaData($data, $db, $returnData);
	}

	if ($settings['logPayload'] > 0 && $data['payloadId'] !== -1) {
		$logData = [];
		$logData['challenge'] = @$data['challenge'];
		$logData['payloadId'] = @$data['payloadId'];
		$logData['loginId'] = @$data['test']['loginId'];
		$logData['passwordId'] = @$data['test']['passwordId'];
		$logData['testId'] = @$data['test']['testId'];
		$logData['serialNumber'] = @$data['test']['serialNumber'];
		if ($settings['logPayload'] > 1) {
			$logData['data'] = json_encode($data);
		} else {
			$tmpData = $data;
			if (isset($tmpData['payload'])) unset ($tmpData['payload']);
			$logData['data'] = json_encode($tmpData);
		}
		$db->insert("logTransfers", $logData);
	}

	saveData($data, $db, $returnData);

	/* If there are instructions, depending on the command we may need to take some action on the server side as well
	   (e.g. behaviour log) */
	foreach ($instructions as $instruction) {
		if ($instruction['command'] === 'timeUp') {
			OasysBehaviour::write($data['test']['passwordId'], $data['test']['testId'], [
				'loginId' => $data['test']['loginId'],
				'timeLeft' => 0,
				'eventType' => 'behaviour',
				'subType' => $instruction['reason'] ?? 'timeUp'
			]);
		}
	}


	//the $db and $returnData variables MUST be given by reference
	function saveData($data, &$db, &$returnData): void
	{
		/* @var $db rixPDO */

		GLOBAL $writeNoOutput, $serialNumber, $state;
		checkParams($data, ['test', 'payloadId', 'challenge']);

		/*
		 	structure of data:
			integer 	challenge		random number for challenge/response system
			integer		payloadId		id of the data package (incremented automatically)
			string		action			action to perform (e.g. closeTest)
			array		options
				string		leaveAccessible		when performing closeTest this makes sure test remains accessible after leaving
			array		test
				integer		loginId				autoincrement id of the login in the database
				integer		passwordId			autoincrement id of the password in the database
				integer		testId				autoincrement id of the test in the database
				integer		requiredFieldCount	total count of items with required fields in the test
				integer		fieldsFilled			the number of items that have an answer in each required field at time of sending package
				integer		currentItem			the last item that the testee navigated to
				string		currentLanguage		the last language that the testee selected (if choice of language is given)
				integer		timeLimit			time limit in minutes for the test
				string		serialNumber		a unique id of the computer, created at login
				string		userAgent			userAgent string of the browser
				string		screenSize			screen size in "<width>x<height>" format
				boolean		saveResults			if false, this is a demo login that has no entry in the activity table and does not write to the database
			array		payload
				integer		<eventId>			each event is numbered
					integer		itemId			autoincrement id of the item in the database
					string		language		the active language when this event was created
					integer		eventId			this corresponds to the eventId (the key of this array row)
					string		type			the type of data being sent: "login", "answer", "behaviour" ... etc.
					integer		timestamp		timestamp in milliseconds when the event happened
					integer		timeleft		time in seconds left before the test is over (-1 if no time limit)

			if the data being sent is of type "answer" we will find the following additional key/value pairs:
					string		fieldType		specifies the plugin used to create the answer (e.g. oasysTextfield)
					string		fieldId			the id of the field (e.g. a textfield could be called "lastName")
					string		value			no matter what the real type of the value was it will be encoded in a string
					integer		fieldsFilled		the number of items that have an answer in each required field at time of event

			if the data being sent is of type "behaviour" we will have the following additional key/value pairs:
					string		subType			the type of behaviour (e.g. "login", "navigation", ...)
					string		data			JSON encoded field with any kind of data specific to this behaviour
		 */

		$returnData['error'] = false;
		$payloadId = $data['payloadId'];
		$returnData['payloadId'] = $payloadId;

		/*	if payloadId is neither -2 or -3 (used when client reconnects after a connection loss) we read the
			timeLeftAtLogin value and transmit it to the client. This will permit adding time to the client's timer if
			a manual intervention was necessary, for whatever reason.
		 */

		if ($payloadId !== -2 && $payloadId !== -3) {
			$res = $db->fetchValue("SELECT timeLeftAtLogin FROM activity WHERE passwordId = ? AND testId = ?", [$data['test']['passwordId'], $data['test']['testId']]);
			if ($res['data'] !== null) {
				$returnData['timeLeftAtLogin'] = $res['data'];
			}
		}

		if ($payloadId === -1) {
			/*
			 * If payloadId is -1 then there is no new data to save. It's a pure keepalive signal which updates the
			 * activity timestamp and the timeLeft information
			 */
			$activityData = calculateTimeLeft($data['test'], $db, $returnData);
			if (isset($data['action'])) {
				if ($data['action'] === 'closeApplication') {
					/* window has been closed or redirected, resp. reloaded -> clean up without sending a response */
					$activityData['clientOpen'] = 0;
					$writeNoOutput = true;
					$state->eraseState();
					unset($state);
				} elseif ($data['action'] === 'closeTest') {
					$activityData['clientOpen'] = 0;
					if (!$data['options']['leaveAccessible']) $activityData['timeLeft'] = 0;
					$returnData['testClosed'] = true;
				}
			}
			$db->update('activity', $activityData, "passwordId = ? AND testId = ?", [$data['test']['passwordId'], $data['test']['testId']]);
			exit();
		} elseif ($payloadId === -2) {
			/*
			 * In this case the client had lost connection to the server and finally managed to connect again (see payloadId === 3).
			 * Since the timer was stopped, we now need to set a new login timestamp and timeLeftAtLogin value.
			 */
			checkParams($data, ['timeLeftAtFailure']);
			$res = $db->fetchRow("SELECT tsActiveServer, timeLeftAtLogin, TIMESTAMPDIFF(SECOND, tsLoginServer, tsActiveServer) AS secondsSinceLogin FROM activity WHERE passwordId = ? AND testId = ?", [$data['test']['passwordId'], $data['test']['testId']]);
			$tsActiveServer = $res['data']['tsActiveServer'];
			$timeLeftAtLogin = $res['data']['timeLeftAtLogin'];
			$secondsSinceLogin = $res['data']['secondsSinceLogin'];

			$timeLeftAtFailure = max(0, (int)$data['timeLeftAtFailure']);
			$timeLeftAtLastContact = max(0, (int)$timeLeftAtLogin - max(0, $secondsSinceLogin));

			//sanitize timeLeftAtFailure to not be higher than what server calculates
			if ($timeLeftAtFailure > $timeLeftAtLastContact) {
				$instructions = json_encode([['command' => 'timeUp', 'reason' => 'hackingAttempt']]);

				//the following line is commented out for now until we are sure there are no false positives
				//TODO: uncomment the commented part of the next line
				$db->update('activity', [/*'timeLeftAtLogin' => 0, 'timeLeft' => 0,*/ 'instructions' => $instructions], "passwordId = ? AND testId = ?", [$data['test']['passwordId'], $data['test']['testId']]);

				$logData = [];
				$logData['loginId'] = $data['test']['loginId'];
				$logData['passwordId'] = $data['test']['passwordId'];
				$logData['testId'] = $data['test']['testId'];
				$logData['serialNumber'] = $data['test']['serialNumber'];
				$logData['tsClient'] = milliseconds2DateString($data['tsClient']);
				$logData['timeLeft'] = $timeLeftAtFailure;
				$logData['log'] = "time left hacking attempt detected: client reported $timeLeftAtFailure seconds left at failure, server calculated $timeLeftAtLastContact seconds left at last contact ($tsActiveServer)";
				$db->insert("logClient", $logData);

				$returnData = [];
				exit();
			}

			$loginData = ['timeLeftAtLogin' => $timeLeftAtFailure, 'timeLeft' => $timeLeftAtFailure, 'passwordId' => $data['test']['passwordId'], 'testId' => $data['test']['testId']];
			$query = "UPDATE activity SET timeLeftAtLogin = :timeLeftAtLogin, timeLeft = :timeLeft, tsLoginServer = NOW(3) WHERE passwordId = :passwordId AND testId = :testId";
			$db->prepare($query);
			$db->executePrepared($loginData);

			$logData = [];
			$logData['loginId'] = $data['test']['loginId'];
			$logData['passwordId'] = $data['test']['passwordId'];
			$logData['testId'] = $data['test']['testId'];
			$logData['serialNumber'] = $data['test']['serialNumber'];
			$logData['tsClient'] = milliseconds2DateString($data['tsClient']);
			$logData['timeLeft'] = $timeLeftAtFailure;
			$logData['log'] = "connection to server reestablished (last activity before failure logged at $tsActiveServer)";
			$returnData['debug'] = $logData;
			$db->insert("logClient", $logData);
			exit();
		} elseif ($payloadId === -3) {
			/*
			 * This is the case only while the client is trying to reestablish a lost connection. We won't do anything here,
			 * just return ASAP to the client to confirm the connection is working again. Afterwards the client will poll the
			 * server again to update the activity table and get new timestamps (in that case payloadId === -2).
			 *
			 * N.B. The reason why we will not immediately update the activity table is that at the moment the client gets
			 * through to the server again, the transfer may have been delayed for quite a bit of time, so the timestamps will
			 * not be accurately calculated when we return from this call ... that's why we will immediately recontact
			 * the server to get good timestamps and then only resume the paused test
			 */
			exit();
		}

		checkParams($data, ['payload']);

		/*
		 * the payload will now be analysed row after row and depending on the type of the event different
		 * things need to be done
		 */

		$lastEventId = -1;

		if (count($data['payload']) > 0) {
			ksort($data['payload'], SORT_NUMERIC);

			foreach ($data['payload'] as $eventId => $event) {
				$lastEventId = $eventId;
				if ($event['type'] === 'answer') {
					saveAnswer($event, $db, $data['test']);
				} elseif ($event['type'] === 'behaviour') {
					switch ($event['subType']) {
						case 'login':
							//use time limit specified in state if it exists
							$data['test']['timeLimit'] = $state->timeLimit ?? $data['test']['timeLimit'];
							setLogin($event, $db, $data['test'], $payloadId);
							break;
					}
				}
				saveBehaviour($event, $db, $data['test']);

			}
		}


		/*
		 * Now that the events are all saved we update the activity table before returning to the client. Depending on
		 * the type of events several updates to the activity row may have to be made (currentItem, progress or language).
		 * Since there can be several events in the payload that change the details in question, the queue already made
		 * sure to send the relevant information for this within the 'test' array.
		 */
		$activityData = calculateTimeLeft($data['test'], $db, $returnData);
		if ($lastEventId > -1) $activityData['lastEventId'] = $lastEventId;

		/*
		 * verifying progress if progress applies to the current test
		 */
		if ($data['test']['requiredFieldCount'] > 0 && isset($data['test']['fieldsFilled'])) {
			$activityData['progress'] = $data['test']['fieldsFilled'] / $data['test']['requiredFieldCount'];
		}

		/*
		 * verifying current item
		 */
		if (isset($data['test']['currentItem'])) {
			$activityData['currentItem'] = $data['test']['currentItem'];
		}

		/*
		 * verifying current language
		 */
		if (isset($data['test']['currentLanguage'])) {
			$activityData['language'] = $data['test']['currentLanguage'];
		}

		/*
		 * verifying if test window was closed
		 */
		if (isset($data['action'])) {
			if ($data['action'] === 'closeApplication') {
				$activityData['clientOpen'] = 0;
				$writeNoOutput = true;
				$state->eraseState();
				unset($state);
			} elseif ($data['action'] === 'closeTest') {
				$activityData['clientOpen'] = 0;
				if (!$data['options']['leaveAccessible']) $activityData['timeLeft'] = 0;
				$returnData['testClosed'] = true;
			}
		}
		$db->update('activity', $activityData, "passwordId = ? AND testId = ?", [$data['test']['passwordId'], $data['test']['testId']]);
	}

	function saveMetaData(array $data, rixPDO &$db, array &$returnData): void {
		if (!isset($data['metadata'])) {
			return;
		}
		$metadata = $data['metadata'];

		//read current metadata
		$query = "SELECT COALESCE(metadata, '{}') as 'metadata' FROM activity WHERE passwordId = ? AND testId = ?";
		$mdData = $db->fetchValue($query, [$data['test']['passwordId'], $data['test']['testId']]);
		if ($mdData['data'] === NULL) {
			$mdData = '{}';
		} else {
			$mdData = $mdData['data'];
		}
		$mdData = json_decode($mdData);

		//clear specific metadata keys to make sure they get deleted if the client does not send them
		$clearKeys = ['mediaProgress'];
		foreach ($clearKeys as $key) {
			if (isset($mdData->$key)) {
				unset($mdData->$key);
			}
		}

		//update metadata
		foreach ($metadata as $key => $value) {
			$mdData->$key = $value;
		}

		//write metadata back to database
		$mdData = json_encode($mdData);
		$db->update('activity', ['metadata' => $mdData], "passwordId = ? AND testId = ?", [$data['test']['passwordId'], $data['test']['testId']]);
	}

	function calculateTimeLeft($test, &$db, &$returnData) {
		/* @var $db rixPDO */
		$res = $db->fetchRow("SELECT timeLimit, CAST(NOW(3) AS CHAR) as tsActiveServer, timeLeftAtLogin - TIMESTAMPDIFF(SECOND, tsLoginServer, NOW(3)) as timeLeft FROM activity WHERE passwordId = ? AND testId = ?", [$test['passwordId'], $test['testId']]);
		if ($res['rows'] === 0) {
			$returnData['error'] = 'Login has been reset in activity table!';
			exit();
		} else {
			$activityData = $res['data'];
			if ($activityData['timeLimit'] === 0) {
				/*
				 * If this test is not on a timeLimit, we can ignore the timeLeft value and only update tsActiveServer
				 */
				unset($activityData['timeLimit']);
				unset($activityData['timeLeft']);
			} elseif ($activityData['timeLeft'] <= 0) {
				/*
				 * If server calculates that the time is over, it will send a command to the client to initiate time
				 * over sequence. Normally the client has already done this by its own accord, however since the
				 * client variables can be manipulated by the user this is a redundant way to cause the test to close
				 * even if the testee has manually increased his time limit in an attempt to cheat
				 */
				$activityData['timeLeft'] = 0;
				$returnData['instructions'] = [['command' => 'timeUp', 'reason' => 'timeLeftSanityCheckFailed']];
			}
		}

		//check if activity has been terminated by a previous admin command
		$res = $db->fetchValue("SELECT timeLeft FROM activity WHERE passwordId = ? AND testId = ?", [$test['passwordId'], $test['testId']]);
		if ($res['rows'] === 1 && $res['data'] === 0) {
			$activityData['timeLeft'] = 0;
		}

		//force logoff client if out of schedule or test manually deactivated
		$res = $db->fetchRow("SELECT `active`, `options` FROM tests WHERE id = ?", [$test['testId']]);
		$options = json_decode($res['data']['options'] ?? '', true);

		//if test options specify that the testee should be logged off if out of schedule, we need to check the schedule
		if ($options['forceLogoff'] ?? false) {
			$restrictions = $options['restrictions'];
			$forceLogoff = false;
			$restrictionType = '';

			//check date range
			if ($restrictions['dateRange'] !== false) {
				if ($restrictions['dateRange']['start'] !== false) {
					$start = strtotime($restrictions['dateRange']['start']);
					if ($start > time()) {
						$forceLogoff = true;
						$restrictionType = 'dateRange';
					}
				}
				if ($restrictions['dateRange']['end'] !== false) {
					$end = strtotime($restrictions['dateRange']['end']);
					if ($end < time()) {
						$forceLogoff = true;
						$restrictionType = 'dateRange';
					}
				}
			}

			//check time range
			$currentTime = (new DateTime())->setTimestamp(time());
			if ($restrictions['timeRestriction'] !== false) {
				if ($restrictions['timeRestriction']['start'] !== false) {
					$start = DateTime::createFromFormat('H:i', $restrictions['timeRestriction']['start']);
					if ($start > $currentTime) {
						$forceLogoff = true;
						$restrictionType = 'timeRestriction';
					}
				}
				if ($restrictions['timeRestriction']['end'] !== false) {
					$end = DateTime::createFromFormat('H:i', $restrictions['timeRestriction']['end']);
					if ($end < $currentTime) {
						$forceLogoff = true;
						$restrictionType = 'timeRestriction';
					}
				}
			}

			//check weekday
			$currentDay = date('w', time()) - 1;
			if ($restrictions['testDays'] !== false) {
				if (!preg_match("/$currentDay/", $restrictions['testDays']['days'])) {
					$forceLogoff = true;
					$restrictionType = 'testDays';
				}
			}

			if ($forceLogoff === true) {
				$returnData['forceLogoff'] = true;
				$returnData['forceLogoffReason'] = 'restriction';
				$returnData['restrictionType'] = $restrictionType;
			} else if ($res['data']['active'] === 0) {
				$returnData['forceLogoff'] = true;
				$returnData['forceLogoffReason'] = 'deactivated';
			}
		}
		return $activityData;
	}

	function saveBehaviour($e, &$db, $test): void
	{
		/* @var $db rixPDO */
		if (isset($e['skipBehaviourLog']) && $e['skipBehaviourLog'] === true) {
			return;
		}
		// sanity check: if the activity is no longer present in the database, we have to abort
		$res = $db->fetchRow("SELECT COUNT(*) FROM activity WHERE passwordId = ? AND testId = ?", [$test['passwordId'], $test['testId']]);
		if ($res['data'] === 0) {
			$returnData['error'] = 'Login has been reset in activity table!';
			exit();
		}
		$behaviourData['loginId'] = $test['loginId'];
		$behaviourData['passwordId'] = $test['passwordId'];
		$behaviourData['testId'] = $test['testId'];
		$behaviourData['tsClient'] = milliseconds2DateString($e['timestamp']);
		$behaviourData['timeLeft'] = $e['timeLeft'];
		$behaviourData['eventId'] = $e['eventId'];
		$behaviourData['itemId'] = $e['itemId'];
		$behaviourData['language'] = $e['language'];
		$behaviourData['eventType'] = $e['type'];
		if ($e['type'] === 'answer') {
			$behaviourData['subType'] = $e['fieldType'];
			$behaviourData['data'] = json_encode(['fieldId' => $e['fieldId'], 'value' => $e['value']]);
		} elseif ($e['type'] === 'behaviour') {
			$behaviourData['subType'] = $e['subType'];
			if (isset($e['data'])) {
				$behaviourData['data'] = $e['data'];
			} else if ($e['subType'] === 'login') {
				$behaviourData['data'] = ['userAgent' => @$test['userAgent'], 'screenSize' => @$test['screenSize']];
				if (@$test['mutationId'] > -1) {
					$behaviourData['data']['mutationId'] = $test['mutationId'];
				}
				$behaviourData['data'] = json_encode($behaviourData['data']);
			}
		}
		$db->insert('behaviour', $behaviourData, 'ignore');
	}

	function saveAnswer($e, &$db, $test): void
	{
		/* @var $db rixPDO */
		/*
		 * first we will log the answer as behaviour, then we'll insert or update the last answer in the answers table
		 */
		// sanity check: if the activity is no longer present in the database, we have to abort
		$res = $db->fetchRow("SELECT COUNT(*) FROM activity WHERE passwordId = ? AND testId = ?", [$test['passwordId'], $test['testId']]);
		if ($res['data'] === 0) {
			$returnData['error'] = 'Login has been reset in activity table!';
			exit();
		}
		$answerData['loginId'] = $test['loginId'];
		$answerData['testId'] = $test['testId'];
		$answerData['passwordId'] = $test['passwordId'];
		$answerData['tsClient'] = milliseconds2DateString($e['timestamp']);
		$answerData['itemId'] = $e['itemId'];
		$answerData['language'] = $e['language'];
		$answerData['fieldId'] = $e['fieldId'];
		$answerData['fieldType'] = $e['fieldType'];
		$answerData['value'] = $e['value'];
		if ($e['value'] === null) {
			$db->execute("DELETE FROM answers WHERE passwordId = ? AND testId = ? AND itemId = ? AND fieldId = ?", [$test['passwordId'], $test['testId'], $e['itemId'], $e['fieldId']]);
		} else {
			$db->insert('answers', $answerData, 'update', ['tsClient', 'language', 'value']);
		}
	}

	function setLogin($e, &$db, $test, $payloadId): void
	{
		/* @var $db rixPDO */
		global $returnData;
		$res = $db->fetchRow("SELECT * FROM activity WHERE passwordId = ? AND testId = ?", [$test['passwordId'], $test['testId']]);
		if ($res['rows'] > 0) {
			/*
			 * if there has been a previous login to this same test
			 */
			$loginData = [];
			$loginData['passwordId'] = $test['passwordId'];
			$loginData['testId'] = $test['testId'];
			if ($test['timeLimit'] > 0) {
				/*
				 * if we have a time limit on this test
				 */
				$loginData['timeLimit'] = $test['timeLimit'];
				$timeLeft = $res['data']['timeLeft'];
				if ($timeLeft > -1) {
					/*
					 * If the time limit was also enabled at the previous login, which usually is the case, we need to
					 * keep track here how much time was still left when testee was last connected
					 * $timeLeft cannot be 0 at this point, otherwise the login script would not have let the user log in
					 */
					$loginData['timeLeftAtLogin'] = $timeLeft;
					$loginData['timeLeft'] = $timeLeft;
				} else {
					/*
					 * If the time limit was previously disabled, someone has switched on between the last and the
					 * current login. The testee will now start with a completely fresh timer.
					 */
					$loginData['timeLeftAtLogin'] = $test['timeLimit'] * 60;
					$loginData['timeLeft'] = $test['timeLimit'] * 60;
				}
			} else {
				/*
				 * if there is no time limit on the test, even if there might have been one before, we can disregard
				 * any information from the previous login
				 */
				$loginData['timeLimit'] = 0;
				$loginData['timeLeftAtLogin'] = -1;
				$loginData['timeLeft'] = -1;
			}
			$loginData['serialNumber'] = $test['serialNumber'];
			$loginData['lastPayloadId'] = $payloadId;
			$loginData['language'] = $e['language'];
			$loginData['currentItem'] = $e['item'];
			$loginData['lastEventId'] = $e['eventId'];
			$query = "UPDATE activity SET timelimit = :timeLimit, timeLeftAtLogin = :timeLeftAtLogin, timeLeft = :timeLeft, serialNumber = :serialNumber, lastPayloadId = :lastPayloadId, language = :language, currentItem = :currentItem, lastEventId = :lastEventId, tsLoginServer = NOW(3), clientOpen = 1 WHERE passwordId = :passwordId AND testId = :testId";
			$db->prepare($query);
			$db->executePrepared($loginData);
			$returnData['timeLeftAtLogin'] = $loginData['timeLeftAtLogin'];
		} else {
			/*
			 * if this is the first login to this test
			 */
			$loginData = [];
			$loginData['loginId'] = $test['loginId'];
			$loginData['passwordId'] = $test['passwordId'];
			$loginData['testId'] = $test['testId'];
			if ($test['timeLimit'] > 0) {
				$loginData['timeLimit'] = $test['timeLimit'];
				$loginData['timeLeftAtLogin'] = $test['timeLimit'] * 60;
				$loginData['timeLeft'] = $test['timeLimit'] * 60;
			} else {
				$loginData['timeLimit'] = 0;
				$loginData['timeLeftAtLogin'] = -1;
				$loginData['timeLeft'] = -1;
			}
			$loginData['serialNumber'] = $test['serialNumber'];
			$loginData['lastPayloadId'] = $payloadId;
			if ($test['requiredFieldCount'] > 0) {
				$loginData['progress'] = 0;
			} else {
				$loginData['progress'] = 1;
			}
			$loginData['language'] = $e['language'];
			$loginData['currentItem'] = $e['item'];
			$loginData['lastEventId'] = $e['eventId'];
			$loginData['clientOpen'] = 1;
			$res = $db->insert("activity", $loginData);
			$returnData['timeLeftAtLogin'] = $loginData['timeLeftAtLogin'];
			if (isset($e['testCache'])) {
				/*
				 * testCache is only set if it's a non linear test. On first login we must save this to the database
				 */
				storeCachedTestData($db, $e['testCache'], $test['passwordId'], $test['testId']);
			}
		}
	}

	function storeCachedTestData(&$db, &$testData, $passwordId, $testId): void {
		if ($passwordId !== null) {
			$cachedStructure = json_encode($testData['structure']['items']);
			$cache = [
				'passwordId' => $passwordId, 'testId' => $testId, 'structure' => $cachedStructure, 'labels' => json_encode($testData['labels'], JSON_FORCE_OBJECT), 'options' => json_encode($testData['options'], JSON_FORCE_OBJECT), 'skin' => json_encode($testData['skin'], JSON_FORCE_OBJECT), 'variables' => json_encode($testData['variables'], JSON_FORCE_OBJECT)
			];
			$db->insert('testCache', $cache, 'replace');
		}
	}

	/*
	 * helper functions
	 */

	//checks if mandatory data is present
	function checkParams(&$data, $params): void
	{
		GLOBAL $returnData;
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

	/*
	 * This is used to encode associative arrays to JSON string in order to save it to the database.
	 * If an empty array is sent, PHP will not recognize that it should be an associative array
	 * and thus encode it as a normal array which will end up as an Array rather than an Object
	 * when decoded in Javascript, which will cause problems.
	 * That's why it uses the JSON_FORCE_OBJECT flag to force empty arrays to be encoded as Objects rather than Arrays.
	 *
	 * Usage example:
	 *		encodeData($data, array('options', 'settings'));
	 *
	 * In this example we are sending the $data array by reference and tell it to replace the contents of the
	 * key 'options' and the key 'settings' by their respective JSON encoded forms.
	 */
	function encodeData(&$data, $params): void
	{
		if (!$params || count($params) == 0) {
			return;
		}
		foreach ($params as $key) {
			if (isset($data[$key])) {
				$data[$key] = json_encode($data[$key], JSON_FORCE_OBJECT);
			}
		}
	}


	// this will always be called when the script ends even if a fatal error occurred
	// it encodes the $returnData to JSON and it adds an error message if a fatal PHP error occurred
	// this error message is registered under the 'fatalError' key and includes the file name of the PHP script and the line number of the error
	// all other errors (e.g. database) were registere under the 'error' key
	function outputJSON(): void
	{
		GLOBAL $returnData, $settings, $writeNoOutput;
		if ($writeNoOutput) {
			/*
			 * This flag is true only if data has been sent via sendBeacon when the browser was closed or navigated away from page
			 * In this case the PHP script is supposed not to return anything to the browser, as by w3.org specifications
			 */
			return;
		}
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