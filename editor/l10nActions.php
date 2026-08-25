<?php

	//the JSON output will happen, even if a fatal error prevents the script from finishing
	register_shutdown_function('outputJSON');

	//action is a string that defines what action to perform
	$action = filter_input(INPUT_POST, 'action');
	if (!$action) {
		$action = "";
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

	require_once 'inc/php/database.php'; //contains the database connection credentials
	require_once '../inc/php/rixPDO.php'; //wrapper around PDO functions (c.f. docs folder for manual)

	//all data that is returned by this script will be put into $returnData array which is sent back in JSON encoded form
	$returnData = array();
	$returnData['action'] = $action; //when returning we must specify which action was performed
	$returnData['error'] = false; //if there is an error, this will contain a string with the error message

	# ----------------------- #
	# Authentication Includes #
	# ----------------------- #
	$pageName = "l10n"; // set to the related 'editor button' string name (e.g., 'items')
	$isSubMod = false; // set true if a module page in a subdirectory
	$isActionFile = true; // set true if an "xxxActions.php" file
	require_once 'inc/php/authCommonFunctions.php'; // required for authentication inclusion

	//make a connection to the database and define the log file in which database errors are to be recorded
	$db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, '../logs/l10nManager_errors.txt', 1, $returnData, 'error');

	# ------------------------------------------- #
	# Inclusion of permission authenticator class #
	# ------------------------------------------- #
	$permAuth = new permAuth($action, $data, $myAuth);

	# ---------------------------------------- #
	# Action permission authentication routine #
	# ---------------------------------------- #
	$letMePass = $permAuth->permCheck($data);
	$returnData = $permAuth->returnData;
	if ($letMePass === true) {
		// preset the returnData var with anything the authenticator may have alraedy loaded in prior to sending to action
		$action($data, $db, $returnData);
	}

	/*
	 * actions
	 */
	function fetchContextAreas($data, &$db, &$returnData) {
		$dir = '../text';
		$scanDir = array_diff(scandir($dir), array('..', '.'));
		foreach ($scanDir as $k => $v) {
			$value = substr($v, 0, strrpos($v, '.'));
			$scanDir[$k] = new stdClass();
			$scanDir[$k]->context = $value;
		}
		$returnData['data'] = $scanDir;
	}

	function loadLanguages($data, &$db, &$returnData) {
        $query = "SELECT * FROM languages where code NOT IN ('DE','EN','FR','LU')";
        $res = $db->fetchTable($query);
        $returnData['dbLang']=$res['data'];
    }

    function saveNewLang($data, &$db, &$returnData) {
        checkParams($data, array('langShort','langName','langFallback'));
        $langShort=$data['langShort'];
        $langName=$data['langName'];
        $langFallback=$data['langFallback'];
        //Check user permission
        global $myAuth;
        $superCheck = $myAuth->checkSA();
        $aeCheck = $myAuth->checkElevatedAdmin();

        if ($superCheck === false && $aeCheck === false) {
            $returnData['error'] = "You are not allowed to perform this operation!";
            die;
        }
        //Check if already exists
        $query = 'SELECT * FROM languages WHERE code=? LIMIT 1';
        $parameters = array($langShort);
        $result = $db->fetchRow($query, $parameters);
        if ($result['rows'] > 0) {
            $returnData['error'] = 'The language with the shortcut <strong>'.$langShort.' ('.$langName.')</strong> does already exist!';
            die();
        }
        $data = array(array('code' => $langShort, 'name' => $langName, 'fallback' => $langFallback));
        $db->insert('languages', $data);
        $insertResult = $db->results();
    }

    function editLang($data, &$db, &$returnData) {
        checkParams($data, array('langShort','langName','langFallback'));
        $langShort=$data['langShort'];
        $langName=$data['langName'];
        $langFallback=$data['langFallback'];
        //Check user permission
        global $myAuth;
        $superCheck = $myAuth->checkSA();
        $aeCheck = $myAuth->checkElevatedAdmin();

        if ($superCheck === false && $aeCheck === false) {
            $returnData['error'] = "You are not allowed to perform this operation!";
            die;
        }

        if ($langShort=='DE' || $langShort=='EN' || $langShort=='FR'){
            $returnData['error'] = "System languages cannot be modified!";
            die;
        }

        $db->prepare("Update languages set name=?, fallback=?  WHERE code=?");
        $db->executePrepared(array($langName, $langFallback, $langShort));
    }

    function deleteLang($data, &$db, &$returnData) {
        checkParams($data, array('langId'));
        $langId=$data['langId'];
        //Check user permission
        global $myAuth;
        $superCheck = $myAuth->checkSA();
        $aeCheck = $myAuth->checkElevatedAdmin();

        if ($superCheck === false) {
            $returnData['error'] = "You are not allowed to perform this operation!";
            die;
        }
        if ($langId=='DE' || $langId=='EN' || $langId=='FR'){
            $returnData['error'] = "System languages cannot be deleted!";
            die;
        }

        $db->prepare("DELETE FROM languages WHERE code=?");
        $db->executePrepared(array($langId));
    }

	function fetchLocStrings($data, &$db, &$returnData) {
		checkParams($data, array('filter'));
		$context = $data['filter'];
		//read context file
		$strJson = file_get_contents("../text/" . $context . ".json");
		$data = json_decode($strJson ?? '', true);

		if (count($data) === 0) {
			$returnData['error'] = "Context file seems to be invalid. Please contact the OASYS team!";
			die();
		}

		$query = "SELECT variable, language, text FROM l10n WHERE context=?";
		$res = $db->fetchColumn($query, [$context], 'variable', 'language');

		foreach ($res['data'] as $variable => $values) {
			foreach ($values as $lng => $value) {
				if ($value !== '') {
					$data[$variable][$lng] = $value;
				}
			}
		}

		$returnData['data'] = $data;
		$returnData['context'] = $context;
	}

	function saveLocChanges($data, &$db, &$returnData) {
		checkParams($data, array('clickVariable', 'clickContext', 'locData'));
		$context = $data['clickContext'];
		$variable = $data['clickVariable'];
		$varObj = $data['locData'];
		//read context file
		$strJson = file_get_contents("../text/" . $context . ".json");
		$data = json_decode($strJson ?? '', true);

		foreach ($varObj as $key => $value) {
			//check if string is default
			$lang = explode("_", $key);
			if (isset($data[$variable][$lang[0]]) && $value === $data[$variable][$lang[0]]) {
				//write to database
				$db->prepare('DELETE FROM l10n WHERE variable=? AND language=? AND context=?');
				$db->executePrepared(array($variable, $lang[0], $context));
			} else {
				//if not default create or update db entry
				$db->prepare('INSERT INTO l10n (variable, language, context, text) VALUES(?, ?, ?, ?) ON DUPLICATE KEY UPDATE text=?');
				$db->executePrepared(array($variable, $lang[0], $context, $value, $value));
			}
		}
	}

	function reset2Defaults($data, &$db, &$returnData) {
		checkParams($data, array('clickVariable', 'clickContext'));
		$context = $data['clickContext'];
		$variable = $data['clickVariable'];
		$db->prepare('DELETE FROM l10n WHERE variable=? AND context=?');
		$db->executePrepared(array($variable, $context));
	}

	function search($data, &$db, &$returnData) {
		checkParams($data, array('searchstring'));
		$searchString = $data['searchstring'];
		//re-fetch context areas
		$dir = '../text';
		$scanDir = array_diff(scandir($dir), array('..', '.'));

		foreach ($scanDir as $k => $v) {
			$value = substr($v, 0, strrpos($v, '.'));
			$scanDir[$k] = new stdClass();
			$scanDir[$k]->context = $value;
		}
		$returnData['contextAreas'] = $scanDir;

		$collectedData = new stdClass();
		foreach ($scanDir as $key => $value) {

			//Read json files
			$strJson = file_get_contents("../text/" . $value->context . ".json");
			$contextCont = json_decode($strJson ?? '', true);

			foreach ($contextCont as $k => $v) {
				if (str_contains($k, $searchString)) {
					$collectedData->$k = ['content' => $v, 'context' => $value->context];
				}
				foreach ($v as $vKey => $vVal) {
					//Check for override
					$searchStringDB = '%' . preg_replace('/%/', $searchString, '\\%') . '%';
					$query = "SELECT text FROM l10n WHERE variable=? AND context=? AND language=? AND text LIKE ?";
					$parameters = array($k, $value->context, $vKey, $searchStringDB);
					$res = $db->fetchRow($query, $parameters);
					if ($res['rows'] !== 0) {
						$collectedData->$k = ['content' => $v, 'context' => $value->context];
					} else {
						if (str_contains($vVal, $searchString)) {
							$collectedData->$k = ['content' => $v, 'context' => $value->context];
						}
					}
				}
			}
			//Apply override strings to results
			foreach ($collectedData as $k => $v) {
				foreach ($v['content'] as $key => $val) {
					$query = "SELECT text FROM l10n WHERE variable=? AND context=? AND language=?";
					$parameters = array($k, $value->context, $key);
					$res = $db->fetchRow($query, $parameters);
					if ($res['rows'] !== 0) {
						$collectedData->$k['content'][$key] = $res['data']['text'];
					}
				}
			}
		}

		$returnData['data'] = $collectedData;
		$returnData['searchstring'] = $data['searchstring'];
	}

	/*
	 * helper functions
	 */
	//checks if a variable is empty, also if there are just spaces or tabs
	function blank($String): bool {
		if (!isset($String)) {
			return true;
		}
		$Replace = array(' ', '&nbsp;');
		$String = trim($String);
		$String = str_replace($Replace, '', $String);

		return empty($String);
	}

	//checks if mandatory data is present
	function checkParams(&$data, $params) {
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
	function encodeData(&$data, $params) {
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
	function outputJSON() {
		global $returnData, $action;

		// updated username
		global $myAuth;
		$returnData['loggedInName'] = $myAuth->username;

		// return admin levels for UI toggling
		global $myAuth;
		$returnData['isSuper'] = $myAuth->checkSA();
		$returnData['isAE'] = $myAuth->checkElevatedAdmin();

		if (!isset($returnData['action'])) {
			$returnData['action'] = $action;
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
