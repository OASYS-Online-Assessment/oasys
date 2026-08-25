<?php

	//the JSON output will happen, even if a fatal error prevents the script from finishing
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
	$pageName = "l10n"; // set to the related 'editor button' string name (e.g., 'items')
	$isSubMod = false; // set true if a module page in a subdirectory
	$isActionFile = true; // set true if an "xxxActions.php" file
	require_once 'inc/php/authCommonFunctions.php'; // required for authentication inclusion

	//make a connection to the database and define the log file in which database errors are to be recorded
	$db = $config->getDatabaseInstance();

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
		if (oasysRejectUnknownAction(__FILE__, $action, $returnData)) exit;
		$action($data, $db, $returnData);
	}

	/*
	 * actions
	 */
	function fetchContextAreas($data, &$db, &$returnData) {
		$contextFiles = glob('../text/*.json') ?: array();
		$contexts = array();
		foreach ($contextFiles as $file) {
			$context = new stdClass();
			$context->context = pathinfo($file, PATHINFO_FILENAME);
			$contexts[] = $context;
		}
		$returnData['data'] = $contexts;
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
        $context  = $data['clickContext'];
        $variable = $data['clickVariable'];
        $varObj   = $data['locData'];

        // Read context defaults
        $strJson = @file_get_contents("../text/" . $context . ".json");
        $ctxData = json_decode($strJson ?: '{}', true) ?: [];

        foreach ($varObj as $key => $value) {
            // Normalize language key (e.g., "en_US" -> "en")
            $langCode = explode("_", (string)$key)[0];

            // If empty value => clear any existing override (DELETE)
            if (!isset($value) || (is_string($value) && trim($value) === '')) {
                $db->prepare('DELETE FROM l10n WHERE variable=? AND language=? AND context=?');
                $db->executePrepared([$variable, $langCode, $context]);
                continue;
            }

            // If equals default => delete override, else upsert override
            $hasDefault = isset($ctxData[$variable][$langCode]);
            if ($hasDefault && $value === $ctxData[$variable][$langCode]) {
                $db->prepare('DELETE FROM l10n WHERE variable=? AND language=? AND context=?');
                $db->executePrepared([$variable, $langCode, $context]);
            } else {
                $db->prepare('INSERT INTO l10n (variable, language, context, text) VALUES(?, ?, ?, ?) 
                              ON DUPLICATE KEY UPDATE text=?');
                $db->executePrepared([$variable, $langCode, $context, $value, $value]);
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

    // Only JSON files are valid localization contexts.
    $contextFiles = glob('../text/*.json') ?: array();
    $contexts = array();
    foreach ($contextFiles as $file) {
        $ctxObj = new stdClass();
        $ctxObj->context = pathinfo($file, PATHINFO_FILENAME);
        $contexts[]     = $ctxObj;
    }
    $returnData['contextAreas'] = $contexts;

    $collectedData = new stdClass();

    foreach ($contexts as $ctx) {
        $contextName = $ctx->context;

        $strJson     = @file_get_contents("../text/" . $contextName . ".json");
        $contextCont = json_decode($strJson ?? '', true);
        if (!is_array($contextCont)) {
            $contextCont = array();
        }

        $query = "SELECT variable, language, text FROM l10n WHERE context=?";
        $res   = $db->fetchColumn($query, array($contextName), 'variable', 'language');
        if (!empty($res['data'])) {
            foreach ($res['data'] as $variable => $values) {
                foreach ($values as $lng => $value) {
                    if ($value !== '') {
                        if (!isset($contextCont[$variable])) {
                            $contextCont[$variable] = array();
                        }
                        $contextCont[$variable][$lng] = $value;
                    }
                }
            }
        }

        foreach ($contextCont as $varName => $langMap) {
            $match = false;

            if (str_contains($varName, $searchString)) {
                $match = true;
            } else {
                foreach ($langMap as $textVal) {
                    if (is_string($textVal) && str_contains($textVal, $searchString)) {
                        $match = true;
                        break;
                    }
                }
            }

            if ($match) {
                $collectedData->$varName = array(
                    'content' => $langMap,
                    'context' => $contextName
                );
            }
        }
    }

    $returnData['data']         = $collectedData;
    $returnData['searchstring'] = $searchString;
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
