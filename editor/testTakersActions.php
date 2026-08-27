<?php

	/** @phan-file-suppress PhanUnusedGlobalFunctionParameter, PhanUnusedVariable, PhanRedefineFunction, PhanUnusedClosureParameter, PhanTypeArraySuspiciousNullable, PhanSuspiciousWeakTypeComparison, PhanUnusedVariableValueOfForeachWithKey, PhanUnusedPublicNoOverrideMethodParameter */

	/** @noinspection SqlResolve */

//the JSON output will happen, even if a fatal error prevents the script from finishing
	register_shutdown_function('outputJSON');
	require_once __DIR__ . "/inc/php/initBackend.php";
	require_once "../inc/php/Crypt.php";

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
	$pageName = "testtakers"; // set to the related 'editor button' string name (e.g., 'items')
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

//make a connection to the database and define the log file in which database errors are to be recorded
	$db = $app->getDatabaseInstance();

# ------------------------------------------- #
# Inclusion of item/folder existence checking #
# ------------------------------------------- #
	$tableName = (object)['primary' => 'loginsFolders', 'secondary' => 'logins'];
	require_once 'inc/php/objectCommonFunctions.php';

# ------------------------------------------- #
# Inclusion of permission authenticator class #
# ------------------------------------------- #
	$permAuth = new permAuth($action, $data, $myAuth);
	if ($permAuth->returnData['error'] !== false) {
		$returnData = $permAuth->returnData;
		exit;
	}

# ---------------------------------------- #
# Action permission authentication routine #
# ---------------------------------------- #
	if ((in_array($action, ['checkPath', 'checkExisting']))) {
		if (oasysRejectUnknownAction(__FILE__, $action, $returnData)) exit;
		$action($data, $db, $returnData);
	} else {
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
			$returnData = $permAuth->returnData;
		}
	}

	/*
	###############
	FUNCTIONS START
	###############
	*/

function checkForwardUrl($data, &$db, &$returnData) {
		global $uiLang;

		$minVshort = '3.6';               // current min version
		$returnData['minVshort'] = $minVshort;

		$url = rtrim(trim($data['url']), '/');
		if (!preg_match('#^https?://#i', $url)) {
			$returnData['ok'] = false;
			$returnData['reason'] = $uiLang->translate('Invalid URL');
			$returnData['statusLevel'] = 'error';
			return;
		}
		if (oasysIsOwnForwardUrl($url)) {
			$returnData['ok'] = false;
			$returnData['reason'] = $uiLang->translate('You cannot forward a login to this OASYS instance.');
			$returnData['statusLevel'] = 'error';
			return;
		}

		$verUrl = $url . '/oasys_ver.txt';

		$ch = curl_init($verUrl);
		curl_setopt_array($ch, [
			CURLOPT_RETURNTRANSFER => true,
			CURLOPT_FOLLOWLOCATION => true,
			CURLOPT_TIMEOUT => 4,
			CURLOPT_CONNECTTIMEOUT => 2,
			CURLOPT_SSL_VERIFYPEER => true,
			CURLOPT_SSL_VERIFYHOST => 2
		]);
		$txt = curl_exec($ch);
		$http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
		$effectiveUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
		$err = curl_error($ch);

		// Also check the final address because the entered URL may redirect back to this instance.
		$effectiveBaseUrl = preg_replace('~/oasys_ver\.txt(?:[?#].*)?$~i', '', (string)$effectiveUrl);
		if (is_string($effectiveBaseUrl) && $effectiveBaseUrl !== '' && oasysIsOwnForwardUrl($effectiveBaseUrl)) {
			$returnData['ok'] = false;
			$returnData['reason'] = $uiLang->translate('You cannot forward a login to this OASYS instance.');
			$returnData['statusLevel'] = 'error';
			return;
		}

		if ($txt === false || $http < 200 || $http >= 300) {
			$returnData['ok'] = false;
			if ($txt === false || $http < 200 || $http >= 300) {
				$returnData['ok'] = false;
				$returnData['reason'] = $uiLang->translate('No OASYS found!');
				$returnData['statusLevel'] = 'error';

				// Optional: keep details for logs / diagnostics without showing them in UI
				$returnData['http'] = $http;
				$returnData['curlError'] = $err;

				return;
			}
			$returnData['statusLevel'] = 'error';
			return;
		}

		$parsed = oasysParseVerFile($txt);

		if (!$parsed['version']) {
			$returnData['ok'] = false;
			$returnData['reason'] = $uiLang->translate('No OASYS found!');
			$returnData['statusLevel'] = 'error';
			return;
		}

		// OASYS found
		$returnData['ok'] = true;
		$returnData['version'] = $parsed['version'];
		$returnData['vshort'] = $parsed['vshort'] ?: null;

		// Determine support (based on vshort)
		if ($returnData['vshort']) {
			$cmp = oasysCompareMajorMinor($returnData['vshort'], $minVshort);
			$supported = ($cmp >= 0);
		} else {
			$supported = false;
			$returnData['vshortMissing'] = true;
		}

		$returnData['supported'] = $supported;

		if ($supported) {
			$returnData['statusLevel'] = 'ok';
			$returnData['statusText'] = 'OASYS ' . $returnData['version'] . ' ' . $uiLang->translate('found');
		} else {
			$returnData['statusLevel'] = 'warn';
			$returnData['statusText'] = 'OASYS ' . $returnData['version'] . ' ' . $uiLang->translate('found')
				. ', ' . $uiLang->translate('but OASYS') . ' ' . $minVshort . '.x ' . $uiLang->translate('is required');
    }
}

function oasysNormalizeForwardBaseUrl(string $url): ?string
{
	$parts = parse_url(trim($url));
	if (!is_array($parts) || empty($parts['host'])) return null;
	$scheme = strtolower((string)($parts['scheme'] ?? ''));
	if (!in_array($scheme, ['http', 'https'], true)) return null;
	$host = strtolower(rtrim((string)$parts['host'], '.'));
	$port = isset($parts['port']) ? (int)$parts['port'] : ($scheme === 'https' ? 443 : 80);
	$path = '/' . trim((string)($parts['path'] ?? ''), '/');
	if ($path === '/') $path = '';
	return $host . ':' . $port . $path;
}

function oasysCurrentBaseUrls(): array
{
	$candidates = array();
	$referer = (string)($_SERVER['HTTP_REFERER'] ?? '');
	$refererParts = parse_url($referer);
	if (is_array($refererParts) && !empty($refererParts['host'])) {
		$refererPath = (string)($refererParts['path'] ?? '');
		$editorPos = strpos($refererPath, '/editor/');
		if ($editorPos !== false) $refererPath = substr($refererPath, 0, $editorPos);
		$refererParts['path'] = $refererPath;
		unset($refererParts['query'], $refererParts['fragment']);
		$refererUrl = ($refererParts['scheme'] ?? 'https') . '://' . $refererParts['host']
			. (isset($refererParts['port']) ? ':' . $refererParts['port'] : '') . $refererPath;
		$normalized = oasysNormalizeForwardBaseUrl($refererUrl);
		if ($normalized !== null) $candidates[$normalized] = true;
	}

	$host = (string)($_SERVER['HTTP_X_FORWARDED_HOST'] ?? $_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? '');
	if (str_contains($host, ',')) $host = trim(explode(',', $host)[0]);
	if ($host !== '') {
		$forwardedProto = (string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '');
		if (str_contains($forwardedProto, ',')) $forwardedProto = trim(explode(',', $forwardedProto)[0]);
		$scheme = strtolower($forwardedProto) === 'https' || (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
		$scriptPath = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? ''));
		$editorPos = strpos($scriptPath, '/editor/');
		$basePath = $editorPos === false ? '' : substr($scriptPath, 0, $editorPos);
		$normalized = oasysNormalizeForwardBaseUrl($scheme . '://' . $host . $basePath);
		if ($normalized !== null) $candidates[$normalized] = true;
	}

	return array_keys($candidates);
}

function oasysIsOwnForwardUrl(string $url): bool
{
	$normalized = oasysNormalizeForwardBaseUrl($url);
	return $normalized !== null && in_array($normalized, oasysCurrentBaseUrls(), true);
}


function fetchLibrary($data, &$db, &$returnData)
{
		global $uiLang, $backendState;
    /* @var $db rixPDO */
    checkParams($data, array('location'));
    $location = (int)$data['location'];
    $current = array('folder' => 1, 'path' => 'library');
    if (isset($data['current'])) {
        $current = $data['current'];
    }

		$user = $backendState->userid;
    $query = "SELECT Concat('f', tf.id)     AS id,
            tf.id                  AS 'dbId',
            Concat('f', parent) AS pid,
            'folder'            AS type,
            `name`,
            `name`              AS label,
            null            AS loginType,
            (SELECT EXISTS(SELECT wl.id FROM watchList wl WHERE wl.foreign_id = tf.id AND wl.foreign_table=5 AND wl.user_id=?)) AS watchList
        FROM   loginsFolders tf
        WHERE  parent = ?
        UNION
        SELECT Concat('t', tt.id)     AS id,
            tt.id                  AS 'dbId',
            Concat('f', parent) AS pid,
            template              AS type,
            `name`,
            name                AS label,
            loginType           AS loginType,
            (SELECT EXISTS(SELECT wl.id FROM watchList wl WHERE wl.foreign_id = tt.id AND wl.foreign_table=6 AND wl.user_id=?)) AS watchList
        FROM   logins tt
        WHERE  parent = ?
        AND    template <> 'cloned'";

    $parameters = array($user, $location, $user, $location);
    $results = $db->fetchTable($query, $parameters);

    # ----------------------------------------------------------------------- #
    # Removal of results on which the user does not have at least view rights #
    # ----------------------------------------------------------------------- #
    global $permAuth, $myAuth;

    $showBlocked = false; // default mode for showing blocked items
    if (array_key_exists("select", $data) && ($permAuth->permCheck(['remCall' => true, 'fid' => intVal(ltrim($data['select'], "f")), 'action' => 'fetchLibrary']) === false)) {
        $showBlocked = true;
        $returnData['f_showBlocked'] = true;
    } else {
        $showBlocked = $data['showBlocked'] ?? false;
    }

    foreach ($results['data'] as $key => $value) {
        $hasRead = false; // set default starting value for access

        switch ($value['type']) {
            case 'testee':
            case 'template':
                if (($myAuth->checkSA()) || ($myAuth->checkAdmin())) $hasRead = true;
                if ($value['pid'] !== 'f1') $hasRead = true;
                break;

            case 'folder':
                $hasRead = $permAuth->permCheck(['remCall' => true, 'fid' => intVal($value['dbId']), 'action' => 'fetchLibrary']);
                break;

            default:
                $hasRead = false;
                break;
        }

        // handle non-accessible objects
        if ($hasRead !== true) {
            if ($showBlocked === false) {
                unset($results['data'][$key]);
            } else {
                $results['data'][$key]['isBlocked'] = true;
            }
        }
    }

    // reindex results array
    $results['data'] = array_values($results['data']);

    # -------------------------------------------------------------------- #
    # Permission value return for item selection (selective button states) #
    # -------------------------------------------------------------------- #

    // set globals and locals
    $pArr = [];

    /**
     * @var array **[phpFunc => jsButton2_name]** \
     * \
     * Holds key/value pairs of the php function name as they relate to the js function button/function names.
     */
    $ptypeArr = [
        'deleteSelection' => 'deleteSelection',
        'renameTestOrFolder' => 'rename',
        'newTest' => 'newTest',
        'wizardCreate' => 'wizard',
        'wizardCreateFromFile' => 'wizardFile',
        "newFolder" => 'newFolder',
        'duplicateObjects' => 'duplicate',
        'fetchLibrary' => 'fetchLibrary',
        'fetchIgPerm' => 'fetchIgPerm',
        'addToSelected' => 'addPwdsTests',
        'exportCSV' => 'wizardToFile',
        'saveTestAssignmentsLibrary' => 'editSelection'
    ];

    // get superadmin info
    (array)$userGroupList = $db->fetchColumn(
        "SELECT `name` FROM `userGroups` WHERE `id` IN
                    (SELECT `usergroupId` FROM `userGroupAccess` WHERE `userID` = ?)",
        [$myAuth->userid]
    )['data'];

    // item permission admin/superadmin override check
    if (in_array('superadmin', $userGroupList) || in_array('admin', $userGroupList)) {
        foreach ($ptypeArr as $fnName => $jsFnName) {
            foreach ($results['data'] as $key => $item) {

                if ($item['type'] === 'folder') {
                    if (!(in_array($fnName, ['exportCSV', 'fetchIgPerm', 'renameTestOrFolder', 'deleteSelection', 'fetchLibrary']))) continue; // these are the only folder button types which are relevant for folders
                    $pArr[$item['dbId']][$jsFnName] = true;
                }

                // button types for testee objects
                if (in_array($item['type'], ['testee', 'template'])) {
                    $pArr[$item['dbId']][$jsFnName] = true;
                }
            }
        }
    } // item permission access check
    else {
        foreach ($ptypeArr as $fnName => $jsFnName) {
            foreach ($results['data'] as $key => $item) {
                $pArr[$item['dbId']]['type'] = $item['type'];

                if ($item['type'] === 'folder') {

                    if (!(in_array($fnName, ['exportCSV', 'addToSelected', 'fetchIgPerm', 'renameTestOrFolder', 'deleteSelection', 'fetchLibrary']))) continue; // these are the only folder button types which are relevant for folders

                    // folder owner check
                    if ((int)($db->fetchValue("SELECT `owner` FROM `loginsFolders` WHERE id = ?", [intval($item['dbId'])])['data'] ?? 0) === $myAuth->userid) {
                        $pArr[$item['dbId']][$jsFnName] = true;
                        if ($fnName === "deleteSelection") $pArr[$item['dbId']]["resetResultsTestee"] = $pArr[$item['dbId']]["deleteSelection"]; // the resetresults button will have the same value as delete rights

                        // regular permission check
                    } else {
                        $pArr[$item['dbId']][$jsFnName] = $permAuth->getAccessVal("itemgroup", $fnName, "itemObject", intval($item['dbId']));
                        if ($fnName === "deleteSelection") $pArr[$item['dbId']]["resetResultsTestee"] = $pArr[$item['dbId']]["deleteSelection"]; // the resetresults button will have the same value as delete rights
                    }
                }

                // button types for testee objects
                if (in_array($item['type'], ['testee', 'template'])) {
                    // testee in folder owner check
                    if ((int)($db->fetchValue("SELECT `owner` FROM `loginsFolders` WHERE id = ?", [intval(ltrim($item['pid'], 'f'))])['data'] ?? 0) === $myAuth->userid) {
                        $pArr[$item['dbId']][$jsFnName] = true;
                        if ($fnName === "deleteSelection") $pArr[$item['dbId']]["resetResultsTestee"] = $pArr[$item['dbId']]["deleteSelection"]; // the resetresults button will have the same value as delete rights

                        // regular testee permission check
                    } else {
                        $pArr[$item['dbId']][$jsFnName] = $permAuth->getAccessVal("itemgroup", $fnName, "itemObject", intval(ltrim($item['pid'], 'f')));
                        if ($fnName === "deleteSelection") $pArr[$item['dbId']]["resetResultsTestee"] = $pArr[$item['dbId']]["deleteSelection"]; // the resetresults button will have the same value as delete rights
                    }
                }
            }
        }
    }

    // folder-level action permission access check
    foreach (['newTest', 'newFolder', 'fetchIgPerm', 'wizardCreate', 'addToSelected'] as $baseFnName) {
        // superadmin and folder owner bypass - they have full permission
        if ((in_array('superadmin', $userGroupList) || in_array('admin', $userGroupList)) || (int)($db->fetchValue("SELECT `owner` FROM `loginsFolders` WHERE id = ?", [$location])['data'] ?? 0) === $myAuth->userid) {
            $pArr['basePerm'][$ptypeArr[$baseFnName]] = true;
        } else {
            $pArr['basePerm'][$ptypeArr[$baseFnName]] = $permAuth->getAccessVal("itemgroup", $baseFnName, "itemObject", $location);
        }
    }

    $returnData['permList'] = $pArr;

    // end permission value return for button status control
    $returnData['data']['list'] = $results['data'];
    $returnData['data']['path'] = fetchPath($location, $returnData, $db);

    if ($returnData['data']['path'] === false) {
        $returnData['data']['current'] = $current;
        die();
    }

    if (isset($data['select'])) {
        if ($data['select'][0] === 'f') {
            $selectId = substr($data['select'], 1);
            $query = "SELECT COUNT(*) FROM loginsFolders WHERE id=? AND parent=?";
            $parameters = array($selectId, $location);
            $results = $db->fetchValue($query, $parameters);

            if ($results['data'] === 0) {
                $returnData['error'] = $uiLang->translate("The folder you are trying to open has been deleted by another user. The view will be refreshed.");
                $returnData['reloadFolder'] = true;
                $returnData['goToParent'] = true;
                die();
            }
        } else if ($data['select'][0] === 't') {
            $selectId = substr($data['select'], 1);

            $query = "SELECT COUNT(*) FROM logins WHERE id=? AND parent=?";
            $parameters = array($selectId, $location);
            $results = $db->fetchValue($query, $parameters);

            if ($results['data'] === 0) {
                $returnData['error'] = $uiLang->translate("The test taker you are trying to select has been deleted by another user. The view will be refreshed.");
                $returnData['reloadFolder'] = true;
                $returnData['goToParent'] = true;
                die();
            }
        }
        $returnData['data']['select'] = $data['select'];
    } else {
        $returnData['data']['select'] = null;
    }
    $returnData['data']['loc'] = $location;
}

function fetchPreSelect($data, &$db, &$returnData)
{
    /* @var $db rixPDO */
    global $uiLang;
    checkParams($data, array('id', 'type'));
    $id = $data['id'];
    $type = $data['type'];
    if ($type === 5) {
        $query = "SELECT * FROM loginsFolders WHERE `id` = ? LIMIT 1";
        $prefix = 'f';
    } else if ($type === 6) {
        $query = "SELECT * FROM logins WHERE `id` = ? LIMIT 1";
        $prefix = 't';
    } else {
        $returnData['error'] = $uiLang->translate("Invalid type specified, please contact your administrator!");
        die();
    }
    $parameters = array($id);
    $result = $db->fetchRow($query, $parameters);

    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("This folder or file has been deleted by another user. The view will be refreshed.");
        $returnData['reloadFolder'] = true;
        die();
    } else {
        $returnData = $result;
        $returnData['preFix'] = $prefix;
    }
}

function fetchTestLibrary($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */
    checkParams($data, array('location'));

    $location = $data['location'];
    $current = array('folder' => 1, 'path' => 'library');
    if (isset($data['current'])) {
        $current = $data['current'];
    }
    $query = "SELECT COUNT(*) FROM testFolders WHERE id=?";
    $parameters = array($location);
    $results = $db->fetchValue($query, $parameters);

    if ($results['data'] === 0) {
        $returnData['error'] = $uiLang->translate("The folder you are trying to open has been deleted by another user. The view will be refreshed.");
        $returnData['data']['current'] = $current;
        die();
    }

    $query = "SELECT CONCAT('f',id) as id, id as 'dbId', CONCAT('f', parent) as pid, 'folder' as type, `name`, `name` as label, '' as testStructure FROM testFolders WHERE parent=? UNION SELECT CONCAT('t',id) as id, id as 'dbId', CONCAT('f', parent) as pid, 'test' as type,`name`, name as label, structure as testStructure FROM tests WHERE parent=?";
    $parameters = array($location, $location);
    $results = $db->fetchTable($query, $parameters);

    # ----------------------------------------------------------------------- #
    # Removal of results on which the user does not have at least view rights #
    # ----------------------------------------------------------------------- #
    global $permAuth, $myAuth;

    foreach ($results['data'] as $key => $value) {

        $hasRead = false; // set default starting value for access

        if ($value['type'] === 'test' && ($myAuth->checkSA() || $myAuth->checkAdmin())) $hasRead = true;
        if ($value['type'] === 'test' && $value['pid'] !== 'f1') $hasRead = true;

        if ($value['type'] === 'folder') $hasRead = $permAuth->permCheck(['remCall' => true, 'fid' => intVal($value['dbId']), 'action' => 'fetchTestLibrary']);

        // remove any values which do not have the proper permission
        if ($hasRead !== true) {
            unset($results['data'][$key]);
        }
    }

    // reindex results array
    $results['data'] = array_values($results['data']);

    for ($i = 0; $i < count($results['data']); $i++) {
        $results['data'][$i]['testStructure'] = json_decode($results['data'][$i]['testStructure'] ?? '', true);
    };
    $returnData['data']['list'] = $results['data'];
    $returnData['data']['path'] = fetchTestsPath($location, $returnData, $db);

    if ($returnData['data']['path'] === false) {
        $returnData['data']['current'] = $current;
        die();
    }
    if (isset($data['select'])) {
        $returnData['data']['select'] = $data['select'];
    } else {
        $returnData['data']['select'] = null;
    }
}

function newFolder($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */
    checkParams($data, array('location', 'name'));

    $location = (int)$data['location'];
    $name = trim((string)$data['name']);
    if ($location < 1 || $name === '' || mb_strlen($name) > 255) {
        $returnData['error'] = $uiLang->translate("Invalid folder name or destination.");
        return;
    }

    //Check if parent folder has been deleted or removed by another user
    $query = "SELECT * FROM loginsFolders WHERE id=? LIMIT 1";
    $parameters = array($location);
    $results = $db->fetchRow($query, $parameters);
    if (($results['rows'] ?? 0) === 0) {
        $returnData['error'] = $uiLang->translate("The destination folder has been deleted. The view will be refreshed.");
        $returnData['reloadFolder'] = true;
        return;
    }

    //verify if a folder with that name already exists on the same level
    $query = "SELECT COUNT(*) FROM loginsFolders WHERE name=? and parent=?";
    $parameters = array($name, $location);
    $results = $db->fetchValue($query, $parameters);

    // if the name is already in use:
    if ($results['data'] != 0) {
        $returnData['error'] = $uiLang->translate("A folder with that name does already exist. Try using another name.");
        $returnData['reloadFolder'] = true;
        die();
    }

    // after all checks pass, insert new folder values
    global $myAuth;
    $params = array(array('parent' => $location, 'name' => $name, 'owner' => $myAuth->userid));
    $db->insert('loginsFolders', $params);
    $results = $db->results();
    $returnData['data']['id'] = 'f' . $results['id'];
    fetchLibrary($data, $db, $returnData);

    # ----------------------------------------------- #
    # Call routine to populate permission schema info #
    # ----------------------------------------------- #
    $folderId = $results['id'];
    global $permAuth;
    $permAuth->newFolderPermSet($location, $folderId);

    fetchLibrary($data, $db, $returnData);
}

function newTest($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */
    checkParams($data, array('location', 'name', 'type', 'showBlocked'));

    $location = (int)$data['location'];
    $name = trim((string)$data['name']);
    $type = (string)$data['type'];
    $showBlocked = $data['showBlocked'];
    if ($location < 1 || $name === '' || mb_strlen($name) > 255 || !in_array($type, ['testee', 'template'], true)) {
        $returnData['error'] = $uiLang->translate("Invalid test taker data or destination.");
        return;
    }
    if (!ttRequireAllowedLoginName($name, $returnData, $uiLang)) return;
    if (isset($data['loginType'])) {
        $loginType = (string)$data['loginType'];
        if (!in_array($loginType, ['local', 'directPass', 'LDAP', 'SAML'], true)) {
            $returnData['error'] = $uiLang->translate("Invalid login type.");
            return;
        }
        $password = null;
        if ($loginType === 'directPass') {
            $plainPassword = (string)($data['password'] ?? '');
            if (!ttRequireAllowedPassword($plainPassword, $returnData, $uiLang, true)) return;
            if ($plainPassword === '') $plainPassword = randomString(8);
            $password = Crypt::encryptString($plainPassword);
        }
    }

    //Check if parent folder has been deleted or removed by another user
    $query = "SELECT * FROM loginsFolders WHERE id=? LIMIT 1";
    $parameters = array($location);
    $result = $db->fetchRow($query, $parameters);
    if (($result['rows'] ?? 0) === 0) {
        $returnData['error'] = $uiLang->translate("The destination folder has been deleted. The view will be refreshed.");
        $returnData['reloadFolder'] = true;
        return;
    }

    //verify if the new login (testee) is not existing already
    $query = "SELECT COUNT(*) FROM logins WHERE name=?";
    $parameters = array($name);
    $results = $db->fetchValue($query, $parameters);

    // if the name is already in use:
    if ($results['data'] != 0) {
        $returnData['error'] = $uiLang->translate("A test taker with that name does already exist. Try using another name.");
        die();
    }


    if (isset($loginType)) {
        //student logins
        $newEntry = array(array('parent' => $location, 'name' => $name, 'overrides' => NULL, 'loginType' => $loginType, 'password' => $password ?? null, 'template' => $type));
        $db->insert('logins', $newEntry);
        $result = $db->results();
    } else {
        //templates and standard logins
        $newEntry = array(array('parent' => $location, 'name' => $name, 'overrides' => NULL, 'template' => $type));
        $db->insert('logins', $newEntry);
        $result = $db->results();
    }


    if ($result['error']) {
        $returnData['error'] = $result['errorMsg'];
        die();
    }
    $returnData['data']['id'] = 't' . $result['id'];
    fetchLibrary($data, $db, $returnData);
}

/**
 * Passwords are encrypted deterministically, so encrypted values can be compared without decrypting database rows.
 * Label passwords include active and inactive labels: options.pwReq must not affect collision checks.
 */
function ttLabelPasswordExists(rixPDO $db, int $loginId, string $encryptedPassword, ?int $excludePasswordId = null): bool
{
    return ttFindLabelUsingPassword($db, $loginId, $encryptedPassword, $excludePasswordId) !== null;
}

function ttFindLabelUsingPassword(rixPDO $db, int $loginId, string $encryptedPassword, ?int $excludePasswordId = null): ?array
{
    $query = "SELECT `id`, `label`, `options` FROM `passwords` WHERE `loginID` = ? AND `name` = ?";
    $parameters = array($loginId, $encryptedPassword);
    if ($excludePasswordId !== null) {
        $query .= " AND `id` <> ?";
        $parameters[] = $excludePasswordId;
    }
    $query .= " ORDER BY `id` LIMIT 1";
    $result = $db->fetchRow($query, $parameters);
    if (!empty($result['error'])) throw new RuntimeException('Unable to check label password uniqueness.');
    return (int)($result['rows'] ?? 0) === 1 ? $result['data'] : null;
}

function ttDirectLoginPasswordMatches(rixPDO $db, int $loginId, string $encryptedPassword): bool
{
    $result = $db->fetchValue(
        "SELECT COUNT(*) FROM `logins` WHERE `id` = ? AND `loginType` = 'directPass' AND `password` = ?",
        array($loginId, $encryptedPassword)
    );
    return (int)($result['data'] ?? 0) > 0;
}

function ttGenerateUniquePasswordForLogin(rixPDO $db, int $loginId, int $length): string
{
    for ($attempt = 0; $attempt < 100; $attempt++) {
        $password = randomString($length);
        $encryptedPassword = Crypt::encryptString($password);
        if (!ttLabelPasswordExists($db, $loginId, $encryptedPassword)
            && !ttDirectLoginPasswordMatches($db, $loginId, $encryptedPassword)) {
            return $password;
        }
    }
    throw new RuntimeException('Unable to generate a unique password.');
}

function ttPasswordForMessage(string $password): string
{
    return '<strong>"' . htmlspecialchars($password, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '"</strong>';
}

function ttPasswordUsesAllowedCharacters(string $password): bool
{
    return preg_match('/^[A-Za-z0-9_.(){}\[\]-]+$/D', $password) === 1;
}

function ttLoginNameUsesAllowedCharacters(string $name, bool $allowEmpty = false): bool
{
    if ($allowEmpty && $name === '') return true;
    return preg_match('/^[A-Za-z0-9_.(){}\[\]\- ]+$/D', $name) === 1;
}

function ttRequireAllowedLoginName(string $name, &$returnData, $uiLang, bool $allowEmpty = false): bool
{
    if (ttLoginNameUsesAllowedCharacters($name, $allowEmpty)) return true;
    $returnData['error'] = $uiLang->translate('The login name contains unsupported characters. Please use letters, numbers, spaces, and ( ) { } [ ] . _ - only.');
    return false;
}

function ttRequireAllowedPassword(string $password, &$returnData, $uiLang, bool $allowEmpty = false): bool
{
    if (($allowEmpty && $password === '') || ttPasswordUsesAllowedCharacters($password)) return true;
    $returnData['error'] = $uiLang->translate('The password contains unsupported characters. Please use letters, numbers, and ( ) { } [ ] . _ - only.');
    return false;
}

function ttDuplicateLabelPasswordMessage($uiLang, string $password, array $labelRow, ?string $loginName = null): string
{
    $label = trim((string)($labelRow['label'] ?? ''));
    if ($label === '') $label = 'Label ' . (int)($labelRow['id'] ?? 0);
    $message = $uiLang->translate("The label password") . ' ' . ttPasswordForMessage($password) . ' '
        . $uiLang->translate("is already used by label") . ' ' . ttPasswordForMessage($label);
    if ($loginName !== null && $loginName !== '') {
        $message .= ' ' . $uiLang->translate("for student login") . ' ' . ttPasswordForMessage($loginName);
    }
    return $message . '. '
        . $uiLang->translate("This password remains reserved even when password requirement is deactivated.");
}

function ttPopulateMissingStudentLabels(rixPDO $db, int $loginId): void
{
    $result = $db->fetchTable(
        "SELECT `id`, `label` FROM `passwords` WHERE `loginID` = ? ORDER BY `id`",
        array($loginId)
    );
    if (!empty($result['error'])) throw new RuntimeException('Unable to read passwords while creating label names.');

    $usedLabels = array();
    foreach ($result['data'] as $passwordRow) {
        $label = trim((string)($passwordRow['label'] ?? ''));
        if ($label !== '') $usedLabels[mb_strtolower($label)] = true;
    }

    $nextLabelNumber = 1;
    foreach ($result['data'] as $passwordRow) {
        if (trim((string)($passwordRow['label'] ?? '')) !== '') continue;
        do {
            $label = 'Label ' . $nextLabelNumber++;
        } while (isset($usedLabels[mb_strtolower($label)]));
        $usedLabels[mb_strtolower($label)] = true;

        $db->prepare("UPDATE `passwords` SET `label` = ? WHERE `id` = ? AND `loginID` = ?");
        $db->executePrepared(array($label, (int)$passwordRow['id'], $loginId));
        ttAssertDbSuccess($db, 'Unable to save an automatically generated label name.');
    }
}

function newPassword($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */
    checkParams($data, array('testee', 'name'));

    if (!ttRequireAllowedPassword((string)$data['name'], $returnData, $uiLang)) return;

    $testee = $data['testee'];
    $name = Crypt::encryptString($data['name']);
    $tag = $data['tag'];

    //Check if testee is still present
    $query = "SELECT * FROM logins WHERE id=? LIMIT 1";
    $parameters = array($testee);
    $result = $db->fetchRow($query, $parameters);

    //Show error message if selected testee is not available anymore
    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("You are trying to add a password to a test taker which has been deleted by another user. The view will be refreshed.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }
    //End check

    //Do not rely on the frontend choosing the label-specific action for student logins.
    if (ttDirectLoginPasswordMatches($db, (int)$testee, $name)) {
        $returnData['error'] = $uiLang->translate("The label password") . ' ' . ttPasswordForMessage((string)$data['name']) . ' '
            . $uiLang->translate("may not be the same as the student login password.");
        return;
    }

    //verify if the new password is not existing already
    $query = "SELECT COUNT(*) FROM passwords WHERE name=? and loginID=?";
    $parameters = array($name, $testee);
    $results = $db->fetchValue($query, $parameters);

    // if the name is already in use:
    if ($results['data'] != 0) {
        $returnData['error'] = $uiLang->translate("The password") . ' ' . ttPasswordForMessage((string)$data['name']) . ' '
            . $uiLang->translate("already exists. Try creating a different password.");
        die();
    }
    $data = array(array('loginID' => $testee, 'name' => $name, 'tag' => $tag));
    $db->insert('passwords', $data);
    $result = $db->results();
    $returnData['id'] = $result['id'];
    //re-read passwords
    $query = "SELECT * FROM passwords WHERE loginID=? order by name";
    $parameters = array($testee);
    $result = $db->fetchTable($query, $parameters);
    foreach ($result['data'] as $key => $value) {
        $result['data'][$key]['name'] = Crypt::decryptString($result['data'][$key]['name']);
    }
    $returnData['passwords'] = $result['data'];
}

function newLabel($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */
    checkParams($data, array('testee', 'label'));

    $testee = $data['testee'];
    $label = $data['label'];
    $tag = $data['tag'];

    //Check if testee is still present
    $query = "SELECT * FROM logins WHERE id=? LIMIT 1";
    $parameters = array($testee);
    $result = $db->fetchRow($query, $parameters);

    //Show error message if selected testee is not available anymore
    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("You are trying to add a password to a test taker which has been deleted by another user. The view will be refreshed.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }
    //End check

    //create a password that differs from the direct-login password and every active or inactive label password
    $pwdName = ttGenerateUniquePasswordForLogin($db, (int)$testee, 6);

    $data = array(array('loginID' => $testee, 'name' => Crypt::encryptString($pwdName ?? ""), 'label' => $label, 'tag' => $tag));
    $db->insert('passwords', $data);
    $result = $db->results();
    $returnData['id'] = $result['id'];
    //re-read passwords
    $query = "SELECT * FROM passwords WHERE loginID=? order by name";
    $parameters = array($testee);
    $result = $db->fetchTable($query, $parameters);
    foreach ($result['data'] as $key => $value) {
        $result['data'][$key]['name'] = Crypt::decryptString($result['data'][$key]['name']);
    }
    $returnData['passwords'] = $result['data'];
}

function newQuickPassword($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */
    checkParams($data, array('testee'));
    $testee = $data['testee'];
    $pwdName = null;

    //Check if testee is still present
    $query = "SELECT * FROM logins WHERE id=? LIMIT 1";
    $parameters = array($testee);
    $result = $db->fetchRow($query, $parameters);

    //Show error message if selected testee is not available anymore
    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("You are trying to add a password to a test taker which has been deleted by another user. The view will be refreshed.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }
    //End check

    //create a password that differs from the direct-login password and every active or inactive label password
    $pwdName = ttGenerateUniquePasswordForLogin($db, (int)$testee, 6);

    //write to db
    $data = array(array('loginID' => $testee, 'name' => Crypt::encryptString($pwdName), 'tag' => ''));
    $db->insert('passwords', $data);
    $result = $db->results();
    $returnData['id'] = $result['id'];
    //re-read passwords
    $query = "SELECT * FROM passwords WHERE loginID=? order by name";
    $parameters = array($testee);
    $result = $db->fetchTable($query, $parameters);
    foreach ($result['data'] as $key => $value) {
        $result['data'][$key]['name'] = Crypt::decryptString($result['data'][$key]['name']);
    }
    $returnData['passwords'] = $result['data'];
}

function deletePassword($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */
    checkParams($data, array('testee', 'pwId'));

    $testee = $data['testee'];
    $pwId = $data['pwId'];

    //Check if testee is still present
    $query = "SELECT * FROM logins WHERE id=? LIMIT 1";
    $parameters = array($testee);
    $result = $db->fetchRow($query, $parameters);
    //Show error message if selected testee is not available anymore
    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("You are trying to delete a password of a test taker which has been deleted by another user. The view will be refreshed.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }
    //End check
    $db->prepare("DELETE FROM passwords WHERE id=? AND loginID=?");
    $db->executePrepared(array($pwId, $testee));
    //re-read passwords
    $query = "SELECT * FROM passwords WHERE loginID=? order by name";
    $parameters = array($testee);
    $result = $db->fetchTable($query, $parameters);
    foreach ($result['data'] as $key => $value) {
        $result['data'][$key]['name'] = Crypt::decryptString($result['data'][$key]['name']);
    }
    $returnData['passwords'] = $result['data'];
}

function checkTestee($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */
    checkParams($data, array('testee', 'location'));

    $location = (int)$data['location'];
    $id = (int)$data['testee'];
    $query = "SELECT * FROM logins WHERE id=? LIMIT 1";
    $parameters = array($id);
    $result = $db->fetchRow($query, $parameters);
    //Show error message if selected testee is not available anymore
    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("The test taker you are trying to select has been deleted by another user. The view will be refreshed.");
        $returnData['reloadFolder'] = true;
        die();
    }
    //Show error message if selected testee has been moved to another folder
    if ($result['data']['parent'] !== $location) {
        $returnData['error'] = $uiLang->translate("The test taker you are trying to select has been moved to a different folder by another user. The new location will be opened.");
        $returnData['reloadFolder'] = true;
        $returnData['openNewLocation'] = true;
        $returnData['openNewLocationId'] = $result['data']['parent'];
        die();
    }
}

function editPassword($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */
    checkParams($data, array('id', 'name', 'testee', 'tag'));

    if (!ttRequireAllowedPassword((string)$data['name'], $returnData, $uiLang)) return;

    $newName = Crypt::encryptString($data['name']);
    $pwId = $data['id'];
    $tag = $data['tag'];
    $testee = $data['testee'];

    //Check if Testee is still present
    $query = "SELECT * FROM logins WHERE id=? LIMIT 1";
    $parameters = array($testee);
    $result = $db->fetchRow($query, $parameters);

    //Show error message if selected testee is not available anymore
    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("The test taker you are trying to edit has been deleted by another user. The view will be refreshed.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }
    if (ttDirectLoginPasswordMatches($db, (int)$testee, $newName)) {
        $returnData['error'] = $uiLang->translate("The label password") . ' ' . ttPasswordForMessage((string)$data['name']) . ' '
            . $uiLang->translate("may not be the same as the student login password.");
        return;
    }
    //if password is not present anymore, throw an error message and leave edit mode
    $query = "SELECT * FROM passwords WHERE id=? AND loginID=? LIMIT 1";
    $parameters = array($pwId, $testee);
    $result = $db->fetchRow($query, $parameters);

    //Show error message if selected testee is not available anymore
    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("This password has been deleted by another user. Leaving edit mode.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }

    //verify if a password with that name already exists
    $query = "SELECT COUNT(*) as isPresent,id FROM passwords WHERE name=? and loginID=? AND `id` !=?";
    $parameters = array($newName, $testee, $pwId);
    $results = $db->fetchRow($query, $parameters);

    // if the name is already in use:
    if ($results['data']['isPresent'] != 0) {
        //allow cosmetic renaming
        if ($results['data']['id'] !== $pwId) {
            $returnData['error'] = $uiLang->translate("The password") . ' ' . ttPasswordForMessage((string)$data['name']) . ' '
                . $uiLang->translate("already exists. Try using a different password.");
            die();
        }
    }

    $db->update('passwords', array('name' => $newName, 'tag' => $tag), 'id=? AND loginID=?', array($pwId, $testee));
    //re-read passwords
    $query = "SELECT * FROM passwords WHERE loginID=? order by name";
    $parameters = array($testee);
    $result = $db->fetchTable($query, $parameters);
    foreach ($result['data'] as $key => $value) {
        $result['data'][$key]['name'] = Crypt::decryptString($result['data'][$key]['name']);
    }
    $returnData['passwords'] = $result['data'];
    $returnData['id'] = $pwId;
}

function editLabel($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */
    checkParams($data, array('id', 'label', 'testee', 'tag'));

    $newLabel = $data['label'];
    $pwId = $data['id'];
    $tag = $data['tag'];
    $testee = $data['testee'];

    //Check if Testee is still present
    $query = "SELECT * FROM logins WHERE id=? LIMIT 1";
    $parameters = array($testee);
    $result = $db->fetchRow($query, $parameters);

    //Show error message if selected testee is not available anymore
    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("The test taker you are trying to edit has been deleted by another user. The view will be refreshed.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }
    //if label is not present anymore, throw an error message and leave edit mode
    $query = "SELECT * FROM passwords WHERE id=? AND loginID=? LIMIT 1";
    $parameters = array($pwId, $testee);
    $result = $db->fetchRow($query, $parameters);

    //Show error message if selected testee is not available anymore
    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("This label has been deleted by another user. Leaving edit mode.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }

    $db->update('passwords', array('label' => $newLabel, 'tag' => $tag), 'id=? AND loginID=?', array($pwId, $testee));
    //re-read passwords
    $query = "SELECT * FROM passwords WHERE loginID=? order by name";
    $parameters = array($testee);
    $result = $db->fetchTable($query, $parameters);
    foreach ($result['data'] as $key => $value) {
        $result['data'][$key]['name'] = Crypt::decryptString($result['data'][$key]['name']);
    }
    $returnData['passwords'] = $result['data'];
    $returnData['id'] = $pwId;
}

function setPassword($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */
    checkParams($data, array('id', 'password', 'pwReq', 'testee'));

    if (!ttRequireAllowedPassword((string)$data['password'], $returnData, $uiLang)) return;

    $pwId = $data['id'];
    $password = $data['password'];
    $pwReq = $data['pwReq'];
    $testee = $data['testee'];

    //Check if Testee is still present
    $query = "SELECT * FROM logins WHERE id=? LIMIT 1";
    $parameters = array($testee);
    $result = $db->fetchRow($query, $parameters);

    //Show error message if selected testee is not available anymore
    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("The test taker you are trying to edit has been deleted by another user. The view will be refreshed.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }
    //if label is not present anymore, throw an error message and leave edit mode
    $query = "SELECT * FROM passwords WHERE id=? AND loginID=? LIMIT 1";
    $parameters = array($pwId, $testee);
    $result = $db->fetchRow($query, $parameters);

    //Show error message if selected testee is not available anymore
    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("This label has been deleted by another user. Leaving edit mode.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }
    $transactionStarted = false;
    if ($db->startTransaction() !== true) {
        $returnData['error'] = $uiLang->translate('Unable to start password update transaction.');
        return;
    }
    $transactionStarted = true;
    $lockedLogin = $db->fetchRow(
        "SELECT `id`, `loginType`, `password` FROM `logins` WHERE `id` = ? LIMIT 1 FOR UPDATE",
        array((int)$testee)
    );
    $lockedLabel = $db->fetchRow(
        "SELECT `id` FROM `passwords` WHERE `id` = ? AND `loginID` = ? LIMIT 1 FOR UPDATE",
        array((int)$pwId, (int)$testee)
    );
    if (($lockedLogin['rows'] ?? 0) !== 1 || ($lockedLabel['rows'] ?? 0) !== 1) {
        $db->rollback();
        $returnData['error'] = $uiLang->translate('The student login or label changed while it was being edited. Please reload and try again.');
        return;
    }

    $encryptedPassword = Crypt::encryptString($password);
    if (ttDirectLoginPasswordMatches($db, (int)$testee, $encryptedPassword)) {
        $db->rollback();
        $returnData['error'] = $uiLang->translate("The label password") . ' ' . ttPasswordForMessage((string)$password) . ' '
            . $uiLang->translate("may not be the same as the student login password.");
        return;
    }
    $duplicateLabel = ttFindLabelUsingPassword($db, (int)$testee, $encryptedPassword, (int)$pwId);
    if ($duplicateLabel !== null) {
        $db->rollback();
        $returnData['error'] = ttDuplicateLabelPasswordMessage($uiLang, (string)$password, $duplicateLabel);
        return;
    }

    //Saving
    if ($pwReq === true) {
        $db->prepare("UPDATE passwords SET name=?, options=JSON_SET(COALESCE(options, '{}'), '$.pwReq', true) WHERE id=? AND loginID=?");

    } else {
        $db->prepare("UPDATE passwords SET name=?, options=JSON_REMOVE(COALESCE(options, '{}'), '$.pwReq') WHERE id=? AND loginID=?");
    }
    $db->executePrepared(array($encryptedPassword, $pwId, $testee));
    ttAssertDbSuccess($db, 'Unable to save the label password.');
    if ($db->commit() !== true) {
        if ($transactionStarted) $db->rollback();
        $returnData['error'] = $uiLang->translate('Unable to commit the password update.');
        return;
    }

    //re-read passwords
    $query = "SELECT * FROM passwords WHERE loginID=? order by name";
    $parameters = array($testee);
    $result = $db->fetchTable($query, $parameters);
    foreach ($result['data'] as $key => $value) {
        $result['data'][$key]['name'] = Crypt::decryptString($result['data'][$key]['name']);
    }
    $returnData['passwords'] = $result['data'];
    $returnData['id'] = $pwId;
}

function updateWatchList($data, &$db, &$returnData)
{
		global $backendState;
    checkParams($data, array('id', 'status', 'type'));
    $id = intVal($data['id']);
    $status = $data['status'];
	$type = (string)$data['type'];
	if (!in_array($type, ['folder', 'file'], true)) {
		$returnData['error'] = 'Invalid watchlist entry type.';
		return;
	}
    ($type === 'folder') ? $target = 5 : $target = 6;

		if (isset($backendState)) {
			$user = $backendState->userid;
        if ($status) {
            //Check if element is still available
            ($type === 'folder') ? $query = "SELECT `id` FROM loginsFolders WHERE `id` = ? LIMIT 1" : $query = "SELECT `id` FROM logins WHERE `id` = ? LIMIT 1";
            $parameters = array($id);
            $result = $db->fetchRow($query, $parameters);
            //Write watchlist
            if (($result['rows'] ?? 0) > 0) {
                $db->prepare("INSERT INTO watchList (foreign_id, foreign_table, user_id) SELECT ?,?,? WHERE NOT EXISTS (SELECT * FROM watchList WHERE foreign_id = ? AND foreign_table = ? AND user_id = ?  LIMIT 1)");
                $db->executePrepared(array($id, $target, $user, $id, $target, $user));
            }
        } else {
            $db->prepare("DELETE FROM watchList WHERE user_id=? AND foreign_id=? AND foreign_table=?");
            $db->executePrepared(array($user, $id, $target));
        }
    }
}

function saveTestAssignmentsLibrary($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */
    checkParams($data, array('id', 'structure', 'testeeId'));

    if (isset($data['test2copy'])) {
        $test2copyId = $data['test2copy'];
    }
    if (isset($data['deleteId'])) {
        $deleteId = $data['deleteId'];
    }
    $structure = $data['structure'];
    $id = $data['id'];
    $testeeId = $data['testeeId'];
    //Check if testee is still present
    $query = "SELECT * FROM logins WHERE id=? LIMIT 1";
    $parameters = array($testeeId);
    $result = $db->fetchRow($query, $parameters);
    //Show error message if selected testee is not available anymore
    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("You are trying to add a test for a test taker which has been deleted by another user. Leaving edit mode.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }
    $testeeData = $result['data'];
    //End check
    //Check if selected password is still present
    $query = "SELECT * FROM passwords WHERE id=? AND loginID=? LIMIT 1";
    $parameters = array($id, $testeeId);
    $result = $db->fetchRow($query, $parameters);
    //Show error message if selected testee is not available anymore
    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("You are trying to add a test to a password which has been deleted by another user. Leaving edit mode.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }
    $passwordData = $result['data'];
    //End check

    $structure = ttPreparePasswordAssignmentStructure($structure);
    if (isset($test2copyId) && !ttValidateAssignedTestAccess(array(array('hiddenID' => $test2copyId)), array(), $db, $returnData)) return;
    $existingStructure = json_decode($passwordData['structure'] ?? '', true);
    if (!is_array($existingStructure)) $existingStructure = array();
    if (!ttValidateAssignedTestAccess($structure, $existingStructure, $db, $returnData)) return;
    $data['structure'] = json_encode($structure);

    if (isset($test2copyId)) {
        //save modified test-structure to active password
        $db->prepare("UPDATE passwords SET structure=? WHERE id=? AND loginID=?");
        $db->executePrepared(array($data['structure'], $id, $testeeId));

        //add the chosen test also to the other passwords of the testee
        $query = "SELECT * FROM passwords WHERE loginID=? AND id !=?";
        $parameters = array($testeeId, $id);
        $result = $db->fetchTable($query, $parameters);

        foreach ($result['data'] as $value) {
            $jsonData = json_decode($value['structure'] ?? '', true);
            if ($jsonData == null) {
                $jsonData = array();
            }
            //check if test is not already present for that password
            $exist = false;
            foreach ($jsonData as $k => $v) {
                if ((int)$v['hiddenID'] === (int)$test2copyId) {
                    $exist = true;
                }
            }
            if ($exist === false) {
                array_push($jsonData, array('hiddenID' => (string)$test2copyId));
                $jsonWrite = json_encode($jsonData);
                $db->prepare("UPDATE passwords SET structure=? WHERE id=?");
                $db->executePrepared(array($jsonWrite, $value['id']));
            }
        }
    } else {
        //save modified test-structure to db
        $db->prepare("UPDATE passwords SET structure=? WHERE id=? AND loginID=?");
        $db->executePrepared(array($data['structure'], $id, $testeeId));
    }

    //Delete activity if test was removed from structure
    if (isset($deleteId)) {
        //delete activity of the removed test
        $db->prepare("DELETE FROM activity WHERE loginId=? AND passwordId=? AND testId=?");
        $db->executePrepared(array($testeeId, $id, $deleteId));

        // delete associated scoring table entry(ies), if any
        $db->fetchValue("DELETE FROM `scoring` WHERE `loginId` = ? AND `passwordId` = ? AND `testId` = ?", [$testeeId, $id, $deleteId]);
    }
}

function saveMetaInfoAndSyncTemplateClones(int $testeeId, string $info, bool $isTemplate, rixPDO &$db): void
{
    $transactionStarted = false;
    try {
        if ($db->startTransaction() !== true) {
            throw new RuntimeException('Unable to start meta-tag update transaction.');
        }
        $transactionStarted = true;

        $db->prepare("UPDATE logins SET info=? WHERE id=?");
        $db->executePrepared(array($info, $testeeId));

        if ($isTemplate) {
            $db->prepare("UPDATE logins SET info=? WHERE template='cloned' AND parentTemplateId=?");
            $db->executePrepared(array($info, $testeeId));
        }

        if ($db->commit() !== true) {
            throw new RuntimeException('Unable to commit meta-tag update transaction.');
        }
        $transactionStarted = false;
    } catch (Throwable $e) {
        if ($transactionStarted) $db->rollback();
        throw $e;
    }
}

function saveMetaTagsChange($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */
    checkParams($data, array('metaStructure', 'testeeId'));

    $structure = $data['metaStructure'];
    $testeeId = $data['testeeId'];

    //Check if testee is still present
    $query = "SELECT * FROM logins WHERE id=? LIMIT 1";
    $parameters = array($testeeId);
    $result = $db->fetchRow($query, $parameters);
    //Show error message if selected testee is not available anymore
    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("You are trying to edit a test taker which has been deleted by another user. Leaving edit mode.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }
    //End check

    if (empty($structure)) {
        $data['structure'] = '{}';
    } else {
        $data['structure'] = json_encode($structure);
    }

    // Keep datasets generated from a template synchronized with the template metadata.
    try {
        saveMetaInfoAndSyncTemplateClones(
            (int)$testeeId,
            $data['structure'],
            ($result['data']['template'] ?? '') === 'template',
            $db
        );
    } catch (Throwable $e) {
        $returnData['error'] = $uiLang->translate('The meta tags could not be saved.');
        return;
    }
    $query = "SELECT * FROM logins WHERE id=? LIMIT 1";
    $parameters = array($testeeId);
    $result = $db->fetchRow($query, $parameters);
    $structure = json_decode($result['data']['info'] ?? '');
    if ($structure == null) {
        $returnData['meta'] = new stdClass();
    } else {
        $returnData['meta'] = $structure;
    }
}

function resetResultsTestee($data, &$db, &$returnData)
{
    global $uiLang, $action;
    /* @var $db rixPDO */
    checkParams($data, array('selection'));

    $selection = $data['selection'];
    $resetMode = $data['resetMode'] ?? 'all';
    $resetCutoff = $data['resetCutoff'] ?? null;
    if (!in_array($resetMode, array('all', 'before', 'after'), true)) {
        $returnData['error'] = $uiLang->translate('The selected date filter is invalid.');
        return;
    }
    if ($resetMode !== 'all' && (!is_numeric($resetCutoff) || (int)$resetCutoff <= 0)) {
        $returnData['error'] = $uiLang->translate('Please enter a valid date and time.');
        return;
    }
    $resetCutoff = $resetMode === 'all' ? null : (int)$resetCutoff;

    // Start our call into recursive permission checking function
    foreach ($selection as $key => $selItem) {
        if ($selItem['type'] === "folder") {
            recurs_perm_check([$selItem], $db, $action);
        }
    }

    $collectedIds = [];
    foreach ($selection as $key => $selItem) {
        if ($selItem['type'] === 'folder') {
            $fileIds = recursiveCollectTtFileIds($selItem['dbId'], $db, $action);
            $collectedIds = array_merge($collectedIds, $fileIds);
        } else {
            $collectedIds[] = $selItem['dbId'];
        }
    }

    $ttIdsAndNames = [];
    $deletedRecords = 0;

    $transactionStarted = false;
    try {
        if ($db->startTransaction() !== true) throw new RuntimeException('Unable to start result reset transaction.');
        $transactionStarted = true;
        foreach ($collectedIds as $key => $testee) {
            //Check if testee is still present
            $query = "SELECT * FROM logins WHERE id=? LIMIT 1";
            $parameters = array($testee);
            $result = $db->fetchRow($query, $parameters);
            if ($result['rows'] === 0) {
                throw new RuntimeException('The selected test taker is no longer available.');
            }
            if (($result['data']['template'] ?? '') === 'template') {
                $deletedRecords += ttDeleteTemplateClones(array((int)$testee), $db, $resetMode, $resetCutoff);
                ttAssertDbSuccess($db, 'Unable to delete template datasets.');
            } else if ($resetMode === 'all') {
                $db->prepare("DELETE FROM activity WHERE loginId=?");
                $db->executePrepared(array($testee));
                ttAssertDbSuccess($db, 'Unable to delete test-taker activity.');
                $deletedRecords += (int)($db->results()['rows'] ?? 0);
                $db->fetchValue("DELETE FROM `scoring` WHERE `loginId` = ?", [$testee]);
                ttAssertDbSuccess($db, 'Unable to delete test-taker scoring.');
                $deletedRecords += (int)($db->results()['rows'] ?? 0);
            } else {
                $comparison = $resetMode === 'before' ? '<' : '>=';
                $db->prepare(
                    "DELETE scoring FROM scoring
                     INNER JOIN activity ON activity.loginId=scoring.loginId
                        AND activity.passwordId=scoring.passwordId
                        AND activity.testId=scoring.testId
                     WHERE activity.loginId=?
                     AND activity.tsActiveServer $comparison FROM_UNIXTIME(?)"
                );
                $db->executePrepared(array($testee, $resetCutoff));
                ttAssertDbSuccess($db, 'Unable to delete filtered test-taker scoring.');
                $deletedRecords += (int)($db->results()['rows'] ?? 0);
                $db->prepare(
                    "DELETE FROM activity WHERE loginId=?
                     AND tsActiveServer $comparison FROM_UNIXTIME(?)"
                );
                $db->executePrepared(array($testee, $resetCutoff));
                ttAssertDbSuccess($db, 'Unable to delete filtered test-taker activity.');
                $deletedRecords += (int)($db->results()['rows'] ?? 0);
            }

            array_push($ttIdsAndNames, "[{$result['data']['id']}] \"{$result['data']['name']}\"");
        }
        if ($db->commit() !== true) throw new RuntimeException('Unable to commit result reset.');
        $transactionStarted = false;
        $returnData['deletedRecords'] = $deletedRecords;
        $returnData['resetMode'] = $resetMode;
    } catch (Throwable $e) {
        if ($transactionStarted) $db->rollback();
        $returnData['error'] = $uiLang->translate('The selected results could not be reset.');
        $returnData['reloadFolder'] = true;
        return;
    }

    // log action
    global $myAuth;
    $myAuth->prepLog($ttIdsAndNames, "resetTTakers", $returnData);
}

function resetResultsPassword($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */
    checkParams($data, array('testee', 'password'));

    $testee = $data['testee'];
    $password = $data['password'];

    //Check if password is still present
    $query = "SELECT * FROM passwords WHERE id=? AND loginID=? LIMIT 1";
    $parameters = array($password, $testee);
    $result = $db->fetchRow($query, $parameters);
    //Show error message if selected testee is not available anymore
    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("You are trying to delete results of a password which has been deleted by another user. The view will be refreshed.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }
    //End check
    //Delete activity of the testee
    $db->prepare("DELETE FROM activity WHERE loginId=? AND passwordId=?");
    $db->executePrepared(array($testee, $password));

    // delete associated scoring table entry(ies), if any
    $db->fetchValue("DELETE FROM `scoring` WHERE `passwordId` = ? AND `loginId` = ?", [$password, $testee]);

    // log action
    $data["ttname"] = $db->fetchValue("SELECT `name` FROM `logins` WHERE `id` = ?", [$testee])['data'];
    global $myAuth;
    $myAuth->prepLog($data, "resetResPass", $returnData);
}

function resetResultsTest($data, rixPDO &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */
    checkParams($data, array('testee', 'password', 'test'));

    $testee = $data['testee'];
    $password = $data['password'];
    $test = $data['test'];
    $login = $db->fetchRow("SELECT * FROM logins WHERE id=? LIMIT 1", [$testee]);
    if (($login['rows'] ?? 0) === 0) {
        $returnData['error'] = $uiLang->translate("You are trying to delete results of a test taker which has been deleted by another user. The view will be refreshed.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }
    //Check if password is still present
    $query = "SELECT * FROM passwords WHERE id=? AND loginID=? LIMIT 1";
    $parameters = array($password, $testee);
    $result = $db->fetchRow($query, $parameters);
    //Show error message if selected testee is not available anymore
    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("You are trying to delete results of a tests belonging to a password which has been deleted by another user. The view will be refreshed.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }
    //End check
    //Delete activity of the testee
    $db->prepare("DELETE FROM activity WHERE loginId=? AND passwordId=? and testId=?");
    $db->executePrepared(array($testee, $password, $test));

    // delete associated scoring table entry(ies), if any
    $db->fetchValue("DELETE FROM `scoring` WHERE `passwordId` = ? AND `loginId` = ? AND `testId` = ?", [$password, $testee, $test]);

    // log action
    $data["testName"] = $db->fetchValue("SELECT `name` FROM `tests` WHERE `id` = ?", [$test])['data'];
    $data["ttname"] = $db->fetchValue("SELECT `name` FROM `logins` WHERE `id` = ?", [$testee])['data'];
    global $myAuth;
    $myAuth->prepLog($data, "resetResTestPass", $returnData);
}


function newMetaTag($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */
    checkParams($data, array('testee', 'mkey', 'mvalue'));

    $testeeId = $data['testee'];
    $mkey = $data['mkey'];
    $mvalue = $data['mvalue'];

    //Check if testee is still present in db
    $query = "SELECT * FROM logins WHERE id=? LIMIT 1";
    $parameters = array($testeeId);
    $result = $db->fetchRow($query, $parameters);
    //Show error message if selected testee is not available anymore
    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("You are trying to edit a test taker which has been deleted by another user. Leaving edit mode.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }

    if ($result['data']['info'] === null) {
        $newStructure = new stdClass();
    } else {
        $newStructure = json_decode($result['data']['info'] ?? '');
    }

    $newStructure->$mkey = $mvalue;
    $writeStructure = json_encode($newStructure);

    // Keep datasets generated from a template synchronized with the template metadata.
    try {
        saveMetaInfoAndSyncTemplateClones(
            (int)$testeeId,
            $writeStructure,
            ($result['data']['template'] ?? '') === 'template',
            $db
        );
    } catch (Throwable $e) {
        $returnData['error'] = $uiLang->translate('The meta tags could not be saved.');
        return;
    }

    if ($newStructure === null) {
        $returnData['meta'] = new stdClass();
    } else {
        $returnData['meta'] = $newStructure;
    }
}

function editDisplayName($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */
    checkParams($data, array('testee', 'displayName'));

    $testeeId = $data['testee'];
    $displayName = $data['displayName'];

    //Check if testee is still present in db
    $query = "SELECT * FROM logins WHERE id=? LIMIT 1";
    $parameters = array($testeeId);
    $result = $db->fetchRow($query, $parameters);
    //Show error message if selected testee is not available anymore
    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("You are trying to edit a test taker which has been deleted by another user. Leaving edit mode.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }

    //save modified display name to db
    $db->prepare("UPDATE logins SET displayName=? WHERE id=?");
    $db->executePrepared(array($displayName, $testeeId));
    $returnData['dn'] = $displayName;
}

function changeLoginType($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */
    checkParams($data, array('testee', 'targetType', 'location'));

    $testeeId = $data['testee'];
    $targetType = (string)$data['targetType'];
    $location = $data['location'];

    //Check if testee is still present in db
    $query = "SELECT * FROM logins WHERE id=? LIMIT 1";
    $parameters = array($testeeId);
    $result = $db->fetchRow($query, $parameters);
    //Show error message if selected testee is not available anymore
    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("You are trying to edit a test taker which has been deleted by another user. Leaving edit mode.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }

    if (!in_array($targetType, array('local', 'directPass', 'LDAP', 'SAML'), true)) {
        $returnData['error'] = $uiLang->translate("Invalid login type.");
        return;
    }

    $currentType = (string)$result['data']['loginType'];
    $targetIsStudent = in_array($targetType, array('directPass', 'LDAP', 'SAML'), true);
    $transactionStarted = false;
    try {
        if ($db->startTransaction() !== true) throw new RuntimeException('Unable to start login type change transaction.');
        $transactionStarted = true;

        $lockedLogin = $db->fetchRow(
            "SELECT * FROM `logins` WHERE `id` = ? LIMIT 1 FOR UPDATE",
            array((int)$testeeId)
        );
        if (!empty($lockedLogin['error']) || ($lockedLogin['rows'] ?? 0) !== 1) {
            throw new RuntimeException('The student login changed while it was being edited.');
        }
        $result = $lockedLogin;
        $currentType = (string)$result['data']['loginType'];

        //Standard-login passwords become student labels. Persist the names that were previously only UI fallbacks.
        if ($currentType === 'local' && $targetIsStudent) {
            ttPopulateMissingStudentLabels($db, (int)$testeeId);
        }

        //save modified login type name to db
        if ($targetType === 'directPass') {
            if (in_array($currentType, array('LDAP', 'SAML'), true)) {
                //External authentication has no reusable password. Generate a fresh, non-conflicting direct password.
                $password = ttGenerateUniquePasswordForLogin($db, (int)$testeeId, 8);
                $returnData['generatedPassword'] = $password;
            } else {
                $password = (string)($data['password'] ?? '');
                if ($password === '' && $result['data']['password'] !== null) {
                    $password = Crypt::decryptString($result['data']['password']);
                }
                if ($password === '') {
                    $password = ttGenerateUniquePasswordForLogin($db, (int)$testeeId, 8);
                    $returnData['generatedPassword'] = $password;
                }
                if (!ttPasswordUsesAllowedCharacters($password)) {
                    throw new DomainException($uiLang->translate('The password contains unsupported characters. Please use letters, numbers, and ( ) { } [ ] . _ - only.'));
                }
                if (ttLabelPasswordExists($db, (int)$testeeId, Crypt::encryptString($password))) {
                    throw new DomainException(
                        $uiLang->translate("The student login password") . ' ' . ttPasswordForMessage($password) . ' '
                        . $uiLang->translate("may not be the same as a label password.")
                    );
                }
            }
            $password = Crypt::encryptString($password);
            $db->prepare("UPDATE logins SET loginType=?, password=? WHERE id=?");
            $db->executePrepared(array($targetType, $password, $testeeId));
        } else {
            //SAML, LDAP and standard logins must not retain a direct student-login password.
            $db->prepare("UPDATE logins SET loginType=?, password=NULL WHERE id=?");
            $db->executePrepared(array($targetType, $testeeId));
        }
        ttAssertDbSuccess($db, 'Unable to change the login type.');
        if ($db->commit() !== true) throw new RuntimeException('Unable to commit the login type change.');
        $transactionStarted = false;
    } catch (Throwable $e) {
        if ($transactionStarted) $db->rollback();
        $returnData['error'] = $e instanceof DomainException
            ? $e->getMessage()
            : $uiLang->translate('The login type could not be changed.');
        if (!($e instanceof DomainException)) {
            $returnData['errorDetails'] = htmlspecialchars($e->getMessage(), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        }
        return;
    }
    $returnData['id'] = $location;
    $returnData['testee'] = $testeeId;
}

function editDirPass($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */
    checkParams($data, array('testee', 'password'));

    $testeeId = $data['testee'];
    $plainPassword = (string)$data['password'];
    if ($plainPassword === '') {
        $returnData['error'] = $uiLang->translate("The student login password may not be empty.");
        return;
    }
    if (!ttRequireAllowedPassword($plainPassword, $returnData, $uiLang)) return;
    $password = Crypt::encryptString($plainPassword);

    if ($db->startTransaction() !== true) {
        $returnData['error'] = $uiLang->translate('Unable to start direct-password update transaction.');
        return;
    }

    // Lock the login row shared by every direct/label password mutation. This
    // serializes concurrent editors before the cross-table uniqueness check.
    $result = $db->fetchRow(
        "SELECT * FROM logins WHERE id=? LIMIT 1 FOR UPDATE",
        array($testeeId)
    );
    //Show error message if selected testee is not available anymore
    if ($result['rows'] === 0) {
        $db->rollback();
        $returnData['error'] = $uiLang->translate("You are trying to edit a test taker which has been deleted by another user. Leaving edit mode.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }

    if ((string)$result['data']['loginType'] !== 'directPass') {
        $db->rollback();
        $returnData['error'] = $uiLang->translate("Only direct student logins can have a login password.");
        return;
    }
    if (ttLabelPasswordExists($db, (int)$testeeId, $password)) {
        $db->rollback();
        $returnData['error'] = $uiLang->translate("The student login password") . ' ' . ttPasswordForMessage($plainPassword) . ' '
            . $uiLang->translate("may not be the same as a label password.");
        return;
    }

    //save modified display name to db
    $db->prepare("UPDATE logins SET password=? WHERE id=?");
    $db->executePrepared(array($password, $testeeId));
    ttAssertDbSuccess($db, 'Unable to save the direct student-login password.');
    if ($db->commit() !== true) {
        $db->rollback();
        $returnData['error'] = $uiLang->translate('Unable to commit the direct-password update.');
        return;
    }
    $returnData['dp'] = $plainPassword;
}

function saveOverrides($data, &$db, &$returnData)
{
    /* @var $db rixPDO */
    checkParams($data, array('id', 'overrides'));

    $overrides = $data['overrides'];
    $id = $data['id'];

    if (count($overrides) == 0) {
        $overrides = NULL;
    } else {
        $overrides = json_encode($overrides);
    }
    //save modified overrides to db
    $db->prepare("UPDATE logins SET overrides=? WHERE id=?");
    $db->executePrepared(array($overrides, $id));
    $returnData['overrides'] = $data['overrides'];
}

function addToSelected($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */

    checkParams($data, array(
        'assignTests', 'noAutoPwds', 'pwdDigits', 'pwdMode', 'pwds', 'pwdsSameForAll', 'structure', 'pid', 'selection',
        'oSetTimer', 'oAdditionalTime', 'oSetSaving', 'oSetNavLimit', 'oDemoMode', 'overrides',
        'assignMtags', 'metaTags', 'deleteExistingPwds', 'deleteExistingMtags', 'sLogFlag',
        'oLoginForwarding', 'oForwardUrl'
    ));

    $dataContainer['assignTests'] = $data['assignTests'];
    $dataContainer['noAutoPwds'] = $data['noAutoPwds'];
    $dataContainer['pwdDigits'] = $data['pwdDigits'];
    $dataContainer['pwdMode'] = $data['pwdMode'];
    $dataContainer['pwds'] = $data['pwds'];
    $dataContainer['pwdsSameForAll'] = $data['pwdsSameForAll'];
    $dataContainer['structure'] = is_array($data['structure']) ? $data['structure'] : array();
    $dataContainer['pwdSet'] = array();
    $dataContainer['pwdSet'][0] = false;
    $dataContainer['assignMtags'] = $data['assignMtags'];
    $dataContainer['metaTags'] = $data['metaTags'];
    $dataContainer['deleteExistingPwds'] = $data['deleteExistingPwds'];
    $dataContainer['deleteExistingMtags'] = $data['deleteExistingMtags'];

    global $sLogFlag;
    $sLogFlag = $data['sLogFlag'];

    if ((string)$dataContainer['pwdMode'] === 'manual') {
        foreach ($dataContainer['pwds'] as $passwordData) {
            if (!is_array($passwordData)
                || !ttRequireAllowedPassword((string)($passwordData['name'] ?? ''), $returnData, $uiLang)) return;
        }
    }

    // ---- Overrides JSON ----
    if ($data['overrides']) {

        $oSetTimer = ($data['oSetTimer']) ? 'true' : 'false';
        $oAdditionalTime = $data['oAdditionalTime'];
        $oSetSaving = ($data['oSetSaving']) ? 'true' : 'false';
        $oSetNavLimit = ($data['oSetNavLimit']) ? 'true' : 'false';
        $oDemoMode = ($data['oDemoMode']) ? 'true' : 'false';

        // NEW: loginForwarding + forwardUrl
        $oLoginForwarding = ($data['oLoginForwarding']) ? 'true' : 'false';

        $oForwardUrl = '';
        if (isset($data['oForwardUrl']) && $data['oForwardUrl'] !== null) {
            $oForwardUrl = trim((string)$data['oForwardUrl']);
        }
        $oForwardUrlJSON = json_encode($oForwardUrl); // safely quoted JSON string

        $options = '{"disableTimer":' . $oSetTimer
            . ',"disableSaving":' . $oSetSaving
            . ',"allowNavigation":' . $oSetNavLimit
            . ',"additionalTime":' . $oAdditionalTime
            . ',"demoMode":' . $oDemoMode
            . ',"loginForwarding":' . $oLoginForwarding
            . ',"forwardUrl":' . $oForwardUrlJSON
            . '}';
    } else {
        $options = false;
    }

    $pid = $data['pid'];
    $selection = $data['selection'];
    $warnings = array();
    $changes = array();

    if ($dataContainer['assignTests'] && !ttValidateAssignedTestAccessMap($dataContainer['structure'], $db, $returnData)) return;

    // Start our call into recursive permission checking function
    foreach ($selection as $key => $selItem) {
        if ($selItem['type'] === "folder") {
            global $action;
            recurs_perm_check([$selItem], $db, $action);
        }
    }

    //Create change info
    if ($data['pwdMode'] == 'auto') {
        $string = $uiLang->translate('- Adding automatic <strong>password(s)</strong>.');
        if ($data['noAutoPwds'] > 0) array_push($changes, $string);
    } else if ($data['pwdMode'] == 'manual') {
        $passwordArray = array();
        foreach ($dataContainer['pwds'] as $val) {
            array_push($passwordArray, $val['name']);
        }
        if ($sLogFlag) {
            $string = $uiLang->translate('- Adding <strong>label(s)</strong>.');
        } else {
            $string = $uiLang->translate('- Adding <strong>password(s)</strong>.');
        }
        if (count($passwordArray) > 0) array_push($changes, $string);
    }

    if ($dataContainer['deleteExistingPwds']) {
        $string = $uiLang->translate('- Deleting existing <strong>password(s)</strong>.');
        array_push($changes, $string);
    }

    if ($data['overrides']) {
        $string = $uiLang->translate('- Saving specified <strong>override settings</strong>.');
        array_push($changes, $string);
    }

    if ($data['assignMtags']) {
        $string = $uiLang->translate('- Saving specified <strong>meta tag(s)</strong>.');
        array_push($changes, $string);
    }

    if ($dataContainer['deleteExistingMtags']) {
        $string = $uiLang->translate('- Deleting existing <strong>meta tags</strong>.');
        array_push($changes, $string);
    }

    //Create set of random passwords when all testees are supposed to have the same
    if ($dataContainer['pwdsSameForAll']) {
        $dataContainer['pwdSet'][0] = true;
        for ($j = 1; $j <= $dataContainer['noAutoPwds']; $j++) {
            $dataContainer['pwdSet'][$j] = randomString($dataContainer['pwdDigits']);
        }
        $pwdString = implode(', ', $dataContainer['pwdSet']);
        $pwdString = substr($pwdString, 3);
        $string = $uiLang->translate('- Using same <strong>password(s)</strong> for all test takers.');
        array_push($changes, $string);
    }

    if ($dataContainer['assignTests']) {
        if ($sLogFlag) {
            $string = $uiLang->translate('- Assigning tests to the labels as defined.');
        } else {
            $string = $uiLang->translate('- Assigning tests to the passwords as defined.');
        }
        array_push($changes, $string);
    }

    function passwordExists($name, $testee, &$db)
    {
        /* @var $db rixPDO */
        global $sLogFlag;
        $encryptedPassword = Crypt::encryptString($name);
        if ($sLogFlag && ttDirectLoginPasswordMatches($db, (int)$testee, $encryptedPassword)) return true;
        return ttLabelPasswordExists($db, (int)$testee, $encryptedPassword);
    }

    function recurSave($id, $type, $name, $options, &$db, &$warnings, &$dataContainer, &$returnData)
    {
        /* @var $db rixPDO */
        global $sLogFlag;

        //Folder
        if ($type === 'folder') {
            //Check for folders in folder
            $query = "SELECT * FROM loginsFolders WHERE parent=?";
            $parameters = array($id);
            $result = $db->fetchTable($query, $parameters);
            if (!empty($result['data'])) {
                foreach ($result['data'] as $subfolder) {
                    recurSave($subfolder['id'], 'folder', $subfolder['name'], $options, $db, $warnings, $dataContainer, $returnData);
                }
            }
            //Check for testees in folder
            $query = "SELECT * FROM logins WHERE parent=?";
            $parameters = array($id);
            $result = $db->fetchTable($query, $parameters);
            if (!empty($result['data'])) {
                foreach ($result['data'] as $testeesinfolder) {
                    recurSave($testeesinfolder['id'], 'test', $testeesinfolder['name'], $options, $db, $warnings, $dataContainer, $returnData);
                }
            }
        } else {
            //Testee

            //Update options
            if ($options != false) {
                $db->prepare("UPDATE logins SET overrides=? WHERE id=?");
                $db->executePrepared(array($options, $id));
            }

            //Update meta tags
            if ($dataContainer['assignMtags']) {
                $query = "SELECT info FROM logins WHERE id=?";
                $parameters = array($id);
                $results = $db->fetchValue($query, $parameters);
                $metaJsonData = json_decode($results['data'] ?? '');
                if ($metaJsonData == null) {
                    $metaJsonData = new stdClass();
                }
                if ($dataContainer['deleteExistingMtags']) {
                    $metaJsonData = new stdClass();
                }
                $metaTags = $dataContainer['metaTags'];

                foreach ($metaTags as $k => $v) {
                    $metaJsonData->$k = $v;
                }
                $combinedMetaTagsJSON = json_encode($metaJsonData);
                $db->prepare("UPDATE logins SET info=? WHERE id=?");
                $db->executePrepared(array($combinedMetaTagsJSON, $id));
            }

            //Add passwords to testee (optional tests)
            if ($dataContainer['deleteExistingPwds']) {
                $db->prepare("DELETE FROM passwords WHERE loginID=?");
                $db->executePrepared(array($id));
            }

            global $uiLang;
            $m1 = $uiLang->translate('The password <strong>"');
            $m2 = $uiLang->translate('"</strong> does already exist for test taker <strong>"');
            $m3 = $uiLang->translate('"</strong>. Please check manually!');

            switch ($dataContainer['pwdMode']) {

                case 'auto':
                    for ($j = 1; $j <= $dataContainer['noAutoPwds']; $j++) {
                        $preCheck = true;
                        $pwdName = null;
                        while ($preCheck == true) {
                            if ($dataContainer['pwdSet'][0]) {
                                $pwdName = $dataContainer['pwdSet'][$j];
                            } else {
                                $pwdName = randomString($dataContainer['pwdDigits']);
                            }
                            if (!passwordExists($pwdName, $id, $db)) $preCheck = false;
                        }

                        if ($dataContainer['assignTests'] && array_key_exists(0, $dataContainer['structure']) && is_array($dataContainer['structure'][0])) {
                            if (passwordExists($pwdName, $id, $db)) {
                                $fullMsg = $m1 . $pwdName . $m2 . $name . $m3;
                                $warnArray = array('id' => $id, 'name' => $name, 'type' => $type, 'message' => $fullMsg);
                                array_push($warnings, $warnArray);
                            } else {
                                $dataContainer['structure'][0] = ttPreparePasswordAssignmentStructure($dataContainer['structure'][0]);
                                $jsonStructure = json_encode($dataContainer['structure'][0]);
                                $dataPwd = array(array('loginID' => $id, 'structure' => $jsonStructure, 'name' => Crypt::encryptString($pwdName), 'tag' => ''));
                                $db->insert('passwords', $dataPwd);
                            }
                        } else {
                            if (passwordExists($pwdName, $id, $db)) {
                                $fullMsg = $m1 . $pwdName . $m2 . $name . $m3;
                                $warnArray = array('id' => $id, 'name' => $name, 'type' => $type, 'message' => $fullMsg);
                                array_push($warnings, $warnArray);
                            } else {
                                $dataPwd = array(array('loginID' => $id, 'name' => Crypt::encryptString($pwdName), 'tag' => ''));
                                $db->insert('passwords', $dataPwd);
                            }
                        }
                    }
                    break;

                case 'manual':
                    if ($dataContainer['assignTests'] && count($dataContainer['structure']) > 0) {
                        foreach ($dataContainer['pwds'] as $value) {
                            $metadata = json_encode($value['metadata']);
                            if (passwordExists($value['name'], $id, $db)) {
                                $fullMsg = $m1 . $value['name'] . $m2 . $name . $m3;
                                $warnArray = array('id' => $id, 'name' => $name, 'type' => $type, 'message' => $fullMsg);
                                array_push($warnings, $warnArray);
                            } else {
                                if (array_key_exists($value['id'], $dataContainer['structure']) && is_array($dataContainer['structure'][$value['id']])) {
                                    $dataContainer['structure'][$value['id']] = ttPreparePasswordAssignmentStructure($dataContainer['structure'][$value['id']]);
                                    $jsonStructure = json_encode($dataContainer['structure'][$value['id']]);
                                    $dataListArray = array('loginID' => $id, 'structure' => $jsonStructure, 'name' => Crypt::encryptString($value['name']), 'tag' => $value['tag']);
                                    if ($sLogFlag === true) $dataListArray['label'] = $value['label'];
                                    if ($value['metadata'] !== null) $dataListArray['options'] = json_encode($value['metadata']);
                                    $dataPwd = array($dataListArray);
                                } else {
                                    $dataListArray = array('loginID' => $id, 'name' => Crypt::encryptString($value['name']), 'tag' => $value['tag']);
                                    if ($sLogFlag === true) $dataListArray['label'] = $value['label'];
                                    if ($value['metadata'] !== null) $dataListArray['options'] = json_encode($value['metadata']);
                                    $dataPwd = array($dataListArray);
                                }
                                $db->insert('passwords', $dataPwd);
                            }
                        }
                    } else {
                        foreach ($dataContainer['pwds'] as $value) {
                            if (passwordExists($value['name'], $id, $db)) {
                                $fullMsg = $m1 . $value['name'] . $m2 . $name . $m3;
                                $warnArray = array('id' => $id, 'name' => $name, 'type' => $type, 'message' => $fullMsg);
                                array_push($warnings, $warnArray);
                            } else {
                                $dataListArray = array('loginID' => $id, 'name' => Crypt::encryptString($value['name']), 'tag' => $value['tag']);
                                if ($sLogFlag === true) $dataListArray['label'] = $value['label'];
                                if ($value['metadata'] !== null) $dataListArray['options'] = json_encode($value['metadata']);
                                $dataPwd = array($dataListArray);
                                $db->insert('passwords', $dataPwd);
                            }
                        }
                    }
                    break;
            }
        }
    }

    foreach ($selection as $val) {
        if ($val['type'] === 'folder') {
            $table = 'loginsFolders';
            $me1 = $uiLang->translate('The folder <strong>"');
        } else {
            $table = 'logins';
            $me1 = $uiLang->translate('The test taker <strong>"');
        }

        $query = "SELECT COUNT(*) FROM " . $table . " WHERE id=?";
        $parameters = array($val['dbId']);
        $results = $db->fetchValue($query, $parameters);

        if ($results['data'] === 0) {
            $me2 = $uiLang->translate('"</strong> has been deleted by another user!');
            $fullMsg = $me1 . $val['name'] . $me2;
            $warnArray = array('id' => $val['dbId'], 'name' => $val['name'], 'type' => $val['type'], 'message' => $fullMsg);
            array_push($warnings, $warnArray);
        } else {
            recurSave($val['dbId'], $val['type'], $val['name'], $options, $db, $warnings, $dataContainer, $returnData);
        }
    }

    $returnData['warnings'] = $warnings;
    $returnData['changes'] = $changes;
    $returnData['id'] = $pid;
}

function bulkModifyExisting($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */

    checkParams($data, array('phase', 'selection'));
    $phase = (string)$data['phase'];
    if (!in_array($phase, array('analyze', 'preview', 'apply'), true)) {
        $returnData['error'] = $uiLang->translate('Invalid bulk modification request.');
        return;
    }

    $loginIds = array();
    foreach ($data['selection'] as $selected) {
        if (!is_array($selected) || !in_array($selected['type'] ?? '', array('testee', 'template', 'cloned'), true)) continue;
        $loginId = (int)($selected['dbId'] ?? 0);
        if ($loginId > 0) $loginIds[$loginId] = $loginId;
    }
    $loginIds = array_values($loginIds);
    if (empty($loginIds)) {
        $returnData['error'] = $uiLang->translate('No test takers were selected.');
        return;
    }

    $logins = array();
    $loginKind = null;
    foreach ($loginIds as $loginId) {
        $loginResult = $db->fetchRow("SELECT `id`, `name`, `loginType`, `password` FROM `logins` WHERE `id` = ? LIMIT 1", array($loginId));
        if (!empty($loginResult['error']) || ($loginResult['rows'] ?? 0) !== 1) {
            $returnData['error'] = $uiLang->translate('One or more selected test takers no longer exist.');
            return;
        }
        $login = $loginResult['data'];
        $kind = ($login['loginType'] === 'local') ? 'standard' : 'student';
        if ($loginKind !== null && $loginKind !== $kind) {
            $returnData['error'] = $uiLang->translate('Standard logins and student logins cannot be modified together.');
            return;
        }
        $loginKind = $kind;
        $logins[$loginId] = $login;
    }
    $rowsByLogin = array();
    foreach ($loginIds as $loginId) {
        $passwordResult = $db->fetchTable(
            "SELECT `id`, `loginID`, `structure`, `name`, `tag`, `label`, `options` FROM `passwords` WHERE `loginID` = ? ORDER BY `id`",
            array($loginId)
        );
        if (!empty($passwordResult['error'])) {
            $returnData['error'] = $loginKind === 'student'
                ? $uiLang->translate('The selected labels could not be read.')
                : $uiLang->translate('The selected passwords could not be read.');
            return;
        }
        $rowsByLogin[$loginId] = array();
        foreach ($passwordResult['data'] as $passwordRow) {
            $visibleName = $loginKind === 'student'
                ? (string)($passwordRow['label'] ?? '')
                : (string)Crypt::decryptString($passwordRow['name']);
            $passwordRow['_visibleName'] = $visibleName;
            $passwordRow['_tag'] = (string)($passwordRow['tag'] ?? '');
            $passwordRow['_structure'] = json_decode($passwordRow['structure'] ?? '', true);
            if (!is_array($passwordRow['_structure'])) $passwordRow['_structure'] = array();
            $passwordOptions = json_decode($passwordRow['options'] ?? '', true);
            $passwordRow['_passwordRequired'] = is_array($passwordOptions) && ($passwordOptions['pwReq'] ?? false) === true;
            $rowsByLogin[$loginId][] = $passwordRow;
        }
    }

    if ($phase === 'analyze') {
        $signatures = array();
        foreach ($rowsByLogin as $loginId => $passwordRows) {
            foreach ($passwordRows as $passwordRow) {
                $key = json_encode(array($passwordRow['_visibleName'], $passwordRow['_tag']));
                if (!isset($signatures[$key])) {
                    $signatures[$key] = array(
                        'name' => $passwordRow['_visibleName'],
                        'tag' => $passwordRow['_tag'],
                        'perLogin' => array(),
                        'assignmentVariants' => array(),
                        'assignedIds' => array(),
                        'passwordRequired' => 0,
                        'passwordNotRequired' => 0
                    );
                }
                if (!isset($signatures[$key]['perLogin'][$loginId])) $signatures[$key]['perLogin'][$loginId] = 0;
                $signatures[$key]['perLogin'][$loginId]++;
                $assignedIds = ttExtractAssignedTestIds($passwordRow['_structure']);
                sort($assignedIds, SORT_NUMERIC);
                $variantKey = implode(',', $assignedIds);
                $signatures[$key]['assignmentVariants'][$variantKey] = true;
                foreach ($assignedIds as $assignedId) $signatures[$key]['assignedIds'][$assignedId] = $assignedId;
                if ($passwordRow['_passwordRequired']) {
                    $signatures[$key]['passwordRequired']++;
                } else {
                    $signatures[$key]['passwordNotRequired']++;
                }
            }
        }

        $candidates = array();
        foreach ($signatures as $signature) {
            $unique = 0;
            $ambiguous = 0;
            foreach ($loginIds as $loginId) {
                $count = (int)($signature['perLogin'][$loginId] ?? 0);
                if ($count === 1) $unique++;
                if ($count > 1) $ambiguous++;
            }
            $assignedTests = array();
            foreach ($signature['assignedIds'] as $assignedId) {
                $testInfo = $db->fetchRow(
                    "SELECT `name`, JSON_UNQUOTE(JSON_EXTRACT(`structure`, '$.type')) AS `type` FROM `tests` WHERE `id` = ? LIMIT 1",
                    array($assignedId)
                );
                $assignedTests[] = array(
                    'id' => (int)$assignedId,
                    'name' => ($testInfo['rows'] ?? 0) > 0 ? (string)$testInfo['data']['name'] : $uiLang->translate('Deleted test'),
                    'type' => ($testInfo['rows'] ?? 0) > 0 ? (string)($testInfo['data']['type'] ?? 'linear') : 'linear'
                );
            }
            usort($assignedTests, static function ($a, $b) {
                return strcasecmp($a['name'], $b['name']);
            });
            $candidates[] = array(
                'name' => $signature['name'],
                'tag' => $signature['tag'],
                'unique' => $unique,
                'missing' => count($loginIds) - $unique - $ambiguous,
                'ambiguous' => $ambiguous,
                'assignmentVariants' => count($signature['assignmentVariants']),
                'assignedTests' => $assignedTests,
                'passwordRequired' => $signature['passwordRequired'],
                'passwordNotRequired' => $signature['passwordNotRequired']
            );
        }
        usort($candidates, static function ($a, $b) {
            if ($a['unique'] !== $b['unique']) return $b['unique'] <=> $a['unique'];
            $nameOrder = strcasecmp($a['name'], $b['name']);
            return $nameOrder !== 0 ? $nameOrder : strcasecmp($a['tag'], $b['tag']);
        });
        $returnData['bulkAnalysis'] = array(
            'kind' => $loginKind,
            'selected' => count($loginIds),
            'candidates' => $candidates
        );
        return;
    }

    checkParams($data, array(
        'matchName', 'matchTag', 'newName', 'newTag', 'passwordMode', 'newPassword', 'assignmentMode', 'structure'
    ));
    $matchName = (string)$data['matchName'];
    $matchTag = (string)$data['matchTag'];
    $newName = trim((string)$data['newName']);
    $newTag = trim((string)$data['newTag']);
    $passwordMode = (string)$data['passwordMode'];
    $newPassword = trim((string)$data['newPassword']);
    $assignmentMode = (string)$data['assignmentMode'];
    if ($newName === '') {
        $returnData['error'] = $loginKind === 'student'
            ? $uiLang->translate('The new label may not be empty.')
            : $uiLang->translate('The new password may not be empty.');
        return;
    }
    if (!in_array($assignmentMode, array('keep', 'add', 'remove', 'replace'), true)) {
        $returnData['error'] = $uiLang->translate('Invalid test assignment operation.');
        return;
    }
    if (!in_array($passwordMode, array('keep', 'set', 'remove'), true)
        || ($loginKind !== 'student' && $passwordMode !== 'keep')) {
        $returnData['error'] = $uiLang->translate('Invalid label password operation.');
        return;
    }
    if ($passwordMode === 'set' && $newPassword === '') {
        $returnData['error'] = $uiLang->translate('The new label password may not be empty.');
        return;
    }
    if ($loginKind === 'standard' && !ttRequireAllowedPassword($newName, $returnData, $uiLang)) return;
    if ($loginKind === 'student' && $passwordMode === 'set'
        && !ttRequireAllowedPassword($newPassword, $returnData, $uiLang)) return;

    $selectedStructure = ttPreparePasswordAssignmentStructure(is_array($data['structure']) ? $data['structure'] : array());
    if (in_array($assignmentMode, array('add', 'replace'), true)
        && !ttValidateAssignedTestAccess($selectedStructure, array(), $db, $returnData)) return;
    $selectedIds = array_flip(ttExtractAssignedTestIds($selectedStructure));

    $matches = array();
    $missing = 0;
    $ambiguous = 0;
    foreach ($loginIds as $loginId) {
        $loginMatches = array_values(array_filter($rowsByLogin[$loginId], static function ($passwordRow) use ($matchName, $matchTag) {
            return $passwordRow['_visibleName'] === $matchName && $passwordRow['_tag'] === $matchTag;
        }));
        if (count($loginMatches) === 0) {
            $missing++;
        } elseif (count($loginMatches) > 1) {
            $ambiguous++;
        } else {
            $matches[] = $loginMatches[0];
        }
    }
    if ($ambiguous > 0) {
        $returnData['error'] = $loginKind === 'student'
            ? $uiLang->translate('The selected label is ambiguous for one or more test takers.')
            : $uiLang->translate('The selected password is ambiguous for one or more test takers.');
        $returnData['errorDetails'] = $uiLang->translate('Refine the current name and tag before applying changes.');
        return;
    }
    if ($loginKind === 'standard') {
        $encryptedNewName = Crypt::encryptString($newName);
        foreach ($matches as $passwordRow) {
            $collision = $db->fetchValue(
                "SELECT COUNT(*) FROM `passwords` WHERE `loginID` = ? AND `name` = ? AND `id` <> ?",
                array((int)$passwordRow['loginID'], $encryptedNewName, (int)$passwordRow['id'])
            );
            if ((int)($collision['data'] ?? 0) > 0) {
                $returnData['error'] = $uiLang->translate('The new password already exists for one of the selected test takers.');
                return;
            }
        }
    }
    if ($loginKind === 'student' && $passwordMode === 'set') {
        $encryptedNewPassword = Crypt::encryptString($newPassword);
        foreach ($matches as $passwordRow) {
            if ((string)($logins[(int)$passwordRow['loginID']]['loginType'] ?? '') === 'directPass'
                && hash_equals((string)($logins[(int)$passwordRow['loginID']]['password'] ?? ''), $encryptedNewPassword)) {
                $returnData['error'] = $uiLang->translate('The label password') . ' ' . ttPasswordForMessage($newPassword) . ' '
                    . $uiLang->translate('may not be the same as the student login password.');
                return;
            }
            $duplicateLabel = ttFindLabelUsingPassword(
                $db, (int)$passwordRow['loginID'], $encryptedNewPassword, (int)$passwordRow['id']
            );
            if ($duplicateLabel !== null) {
                $loginName = (string)($logins[(int)$passwordRow['loginID']]['name'] ?? '');
                $returnData['error'] = ttDuplicateLabelPasswordMessage($uiLang, $newPassword, $duplicateLabel, $loginName);
                return;
            }
        }
    }
    if ($loginKind === 'student') {
        foreach ($matches as $passwordRow) {
            $collision = $db->fetchValue(
                "SELECT COUNT(*)
                 FROM `passwords`
                 WHERE `loginID` = ?
                 AND `label` = ?
                 AND `id` <> ?",
                array((int)$passwordRow['loginID'], $newName, (int)$passwordRow['id'])
            );
            if ((int)($collision['data'] ?? 0) > 0) {
                $returnData['error'] = $uiLang->translate('The new label already exists for one of the selected test takers.');
                return;
            }
        }
    }

    $plan = array();
    $removedAssignments = 0;
    $affectedActivity = 0;
    $affectedScoring = 0;
    foreach ($matches as $passwordRow) {
        $existingById = array();
        foreach ($passwordRow['_structure'] as $item) {
            if (is_array($item) && isset($item['hiddenID'])) $existingById[(int)$item['hiddenID']] = $item;
        }
        $nextById = $existingById;
        if ($assignmentMode === 'add') {
            foreach ($selectedStructure as $item) $nextById[(int)$item['hiddenID']] = $item;
        } elseif ($assignmentMode === 'remove') {
            foreach ($selectedIds as $testId => $_unused) unset($nextById[(int)$testId]);
        } elseif ($assignmentMode === 'replace') {
            $nextById = array();
            foreach ($selectedStructure as $item) $nextById[(int)$item['hiddenID']] = $item;
        }

        $removedIds = array_values(array_diff(array_keys($existingById), array_keys($nextById)));
        $removedAssignments += count($removedIds);
        foreach ($removedIds as $removedTestId) {
            $affectedActivity += (int)($db->fetchValue(
                "SELECT COUNT(*) FROM `activity` WHERE `loginId` = ? AND `passwordId` = ? AND `testId` = ?",
                array((int)$passwordRow['loginID'], (int)$passwordRow['id'], (int)$removedTestId)
            )['data'] ?? 0);
            $affectedScoring += (int)($db->fetchValue(
                "SELECT COUNT(*) FROM `scoring` WHERE `loginId` = ? AND `passwordId` = ? AND `testId` = ?",
                array((int)$passwordRow['loginID'], (int)$passwordRow['id'], (int)$removedTestId)
            )['data'] ?? 0);
        }
        $plan[] = array(
            'row' => $passwordRow,
            'structure' => array_values($nextById),
            'removedIds' => $removedIds
        );
    }

    $summary = array(
        'selected' => count($loginIds),
        'matched' => count($matches),
        'missing' => $missing,
        'ambiguous' => $ambiguous,
        'removedAssignments' => $removedAssignments,
        'affectedActivity' => $affectedActivity,
        'affectedScoring' => $affectedScoring,
        'passwordsChanged' => $passwordMode === 'keep' ? 0 : count($matches)
    );
    if ($phase === 'preview') {
        $returnData['bulkPreview'] = $summary;
        return;
    }
    if (($affectedActivity > 0 || $affectedScoring > 0) && empty($data['confirmDestructive'])) {
        $returnData['error'] = $uiLang->translate('Removing these test assignments also removes linked result data. Confirmation is required.');
        return;
    }

    $transactionStarted = false;
    try {
        if ($db->startTransaction() !== true) throw new RuntimeException('Unable to start bulk modification transaction.');
        $transactionStarted = true;

        $loginIdsToLock = array_values(array_unique(array_map(
            static fn($change) => (int)$change['row']['loginID'],
            $plan
        )));
        sort($loginIdsToLock, SORT_NUMERIC);
        foreach ($loginIdsToLock as $loginIdToLock) {
            $lockedLogin = $db->fetchRow(
                "SELECT `id` FROM `logins` WHERE `id` = ? LIMIT 1 FOR UPDATE",
                array($loginIdToLock)
            );
            if (!empty($lockedLogin['error']) || ($lockedLogin['rows'] ?? 0) !== 1) {
                throw new RuntimeException('A selected test taker changed while the bulk modification was being applied.');
            }
        }

        foreach ($plan as $change) {
            $passwordRow = $change['row'];
            $locked = $db->fetchRow(
                "SELECT `id`, `loginID`, `structure`, `name`, `tag`, `label`, `options` FROM `passwords` WHERE `id` = ? AND `loginID` = ? LIMIT 1 FOR UPDATE",
                array((int)$passwordRow['id'], (int)$passwordRow['loginID'])
            );
            if (!empty($locked['error']) || ($locked['rows'] ?? 0) !== 1) {
                throw new RuntimeException(
                    $loginKind === 'student'
                        ? 'A label changed while the bulk modification was being applied.'
                        : 'A password changed while the bulk modification was being applied.'
                );
            }
            $lockedVisibleName = $loginKind === 'student'
                ? (string)($locked['data']['label'] ?? '')
                : (string)Crypt::decryptString($locked['data']['name']);
            if ($lockedVisibleName !== $matchName
                || (string)($locked['data']['tag'] ?? '') !== $matchTag
                || (string)($locked['data']['structure'] ?? '') !== (string)($passwordRow['structure'] ?? '')
                || ($loginKind === 'student' && (
                    (string)($locked['data']['name'] ?? '') !== (string)($passwordRow['name'] ?? '')
                    || (string)($locked['data']['options'] ?? '') !== (string)($passwordRow['options'] ?? '')
                ))) {
                throw new RuntimeException(
                    $loginKind === 'student'
                        ? 'A label or test assignment changed after the preview. Please review the selection again.'
                        : 'A password or test assignment changed after the preview. Please review the selection again.'
                );
            }

            if ($loginKind === 'standard') {
                $collision = $db->fetchValue(
                    "SELECT COUNT(*) FROM `passwords` WHERE `loginID` = ? AND `name` = ? AND `id` <> ?",
                    array((int)$passwordRow['loginID'], Crypt::encryptString($newName), (int)$passwordRow['id'])
                );
                if ((int)($collision['data'] ?? 0) > 0) {
                    throw new RuntimeException('The new password already exists for one of the selected test takers.');
                }
                $db->prepare("UPDATE `passwords` SET `name` = ?, `tag` = ?, `structure` = ? WHERE `id` = ? AND `loginID` = ?");
                $db->executePrepared(array(
                    Crypt::encryptString($newName), $newTag, json_encode($change['structure']),
                    (int)$passwordRow['id'], (int)$passwordRow['loginID']
                ));
            } else {
                $labelCollision = $db->fetchRow(
                    "SELECT `id`
                     FROM `passwords`
                     WHERE `loginID` = ?
                     AND `label` = ?
                     AND `id` <> ?
                     LIMIT 1
                     FOR UPDATE",
                    array((int)$passwordRow['loginID'], $newName, (int)$passwordRow['id'])
                );
                if (!empty($labelCollision['error'])) {
                    throw new RuntimeException('The selected labels could not be checked for duplicates.');
                }
                if (($labelCollision['rows'] ?? 0) > 0) {
                    throw new RuntimeException('The new label already exists for one of the selected test takers.');
                }
                $passwordName = $locked['data']['name'];
                $passwordOptions = $locked['data']['options'];
                if ($passwordMode === 'set') {
                    $passwordName = Crypt::encryptString($newPassword);
                    $loginPasswordCollision = $db->fetchValue(
                        "SELECT COUNT(*) FROM `logins` WHERE `id` = ? AND `loginType` = 'directPass' AND `password` = ?",
                        array((int)$passwordRow['loginID'], $passwordName)
                    );
                    if ((int)($loginPasswordCollision['data'] ?? 0) > 0) {
                        throw new RuntimeException(
                            'The label password ' . strip_tags(ttPasswordForMessage($newPassword))
                            . ' may not be the same as the student login password.'
                        );
                    }
                    $duplicateLabel = ttFindLabelUsingPassword(
                        $db, (int)$passwordRow['loginID'], $passwordName, (int)$passwordRow['id']
                    );
                    if ($duplicateLabel !== null) {
                        $loginName = (string)($logins[(int)$passwordRow['loginID']]['name'] ?? '');
                        throw new DomainException(
                            ttDuplicateLabelPasswordMessage($uiLang, $newPassword, $duplicateLabel, $loginName)
                        );
                    }
                    $decodedOptions = json_decode($passwordOptions ?? '', true);
                    if (!is_array($decodedOptions)) $decodedOptions = array();
                    $decodedOptions['pwReq'] = true;
                    $passwordOptions = json_encode($decodedOptions);
                } elseif ($passwordMode === 'remove') {
                    $decodedOptions = json_decode($passwordOptions ?? '', true);
                    if (!is_array($decodedOptions)) $decodedOptions = array();
                    unset($decodedOptions['pwReq']);
                    $passwordOptions = empty($decodedOptions) ? null : json_encode($decodedOptions);
                }
                $db->prepare("UPDATE `passwords` SET `label` = ?, `tag` = ?, `structure` = ?, `name` = ?, `options` = ? WHERE `id` = ? AND `loginID` = ?");
                $db->executePrepared(array(
                    $newName, $newTag, json_encode($change['structure']), $passwordName, $passwordOptions,
                    (int)$passwordRow['id'], (int)$passwordRow['loginID']
                ));
            }
            ttAssertDbSuccess(
                $db,
                $loginKind === 'student'
                    ? 'Unable to update a selected label.'
                    : 'Unable to update a selected password.'
            );

            foreach ($change['removedIds'] as $removedTestId) {
                $db->prepare("DELETE FROM `activity` WHERE `loginId` = ? AND `passwordId` = ? AND `testId` = ?");
                $db->executePrepared(array((int)$passwordRow['loginID'], (int)$passwordRow['id'], (int)$removedTestId));
                ttAssertDbSuccess($db, 'Unable to remove linked activity data.');
                $db->prepare("DELETE FROM `scoring` WHERE `loginId` = ? AND `passwordId` = ? AND `testId` = ?");
                $db->executePrepared(array((int)$passwordRow['loginID'], (int)$passwordRow['id'], (int)$removedTestId));
                ttAssertDbSuccess($db, 'Unable to remove linked scoring data.');
            }
        }
        if ($db->commit() !== true) throw new RuntimeException('Unable to commit bulk modification.');
        $transactionStarted = false;
    } catch (Throwable $e) {
        if ($transactionStarted) $db->rollback();
        $returnData['error'] = $e instanceof DomainException
            ? $e->getMessage()
            : $uiLang->translate('The bulk modification could not be completed.');
        if (!($e instanceof DomainException)) {
            $returnData['errorDetails'] = htmlspecialchars($e->getMessage(), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        }
        return;
    }

    $returnData['bulkResult'] = $summary;
    $returnData['id'] = (int)($data['pid'] ?? 1);
}


function exportCSV($data, &$db, &$returnData)
{
    global $uiLang, $permAuth;

    /* @var $db rixPDO */
    checkParams($data, array('pid', 'selection'));

    $pid = $data['pid'];
    $selection = $data['selection'];
    $mTagLength = 0;
    $CSVArray = array();

    function createFolderPath($parentFolder, $testeeId, &$db)
    {
        /* @var $db rixPDO */
        //Read folder id of testee
        $query = "SELECT parent FROM logins WHERE id=?";
        $parameters = array($testeeId);
        $result = $db->fetchValue($query, $parameters);
        $tmpID = $result['data'];
        $pathOutput = '';

        if ($tmpID != 1) {
            while ($tmpID != $parentFolder) {
                $query = "SELECT parent,name FROM loginsFolders WHERE id=?";
                $parameters = array($tmpID);
                $result = $db->fetchTable($query, $parameters);
                $tmpID = $result['data'][0]['parent'];
                $pathOutput = '\\' . $result['data'][0]['name'] . $pathOutput;
            }
        }
        return $pathOutput = substr($pathOutput, 1);
    }

    function mapLoginType($loginType, $template)
    {
        switch ($loginType) {
            case 'LDAP':
                return 'LDAP';
            case 'directPass':
                return 'Direct Password';
            case 'SAML':
                return 'SAML';
            case 'local':
                if ($template === 'testee') {
                    return 'standard';
                } elseif ($template === 'template') {
                    return 'template';
                } elseif ($template === 'cloned') {
                    return 'cloned';
                }
                break;
        }
        return 'Unknown';
    }

    function recurFetch($id, $type, $name, &$db, &$CSVArray, &$pid, &$mTagLength, $permAuth)
    {
        /* @var $db rixPDO */

        // Folder
        if ($type === 'folder') {

            $canAccess = $permAuth->permCheck([
                'remCall' => true,
                'fid'     => $id
            ]);

            if (!$canAccess) {
                return;
            }

            $result = $db->fetchTable("SELECT * FROM loginsFolders WHERE parent=?", [$id]);
            foreach (($result['data'] ?? []) as $subfolder) {
                recurFetch($subfolder['id'], 'folder', $subfolder['name'], $db, $CSVArray, $pid, $mTagLength, $permAuth);
            }

            $result = $db->fetchTable("SELECT * FROM logins WHERE parent=?", [$id]);
            foreach (($result['data'] ?? []) as $login) {
                recurFetch($login['id'], 'login', $login['name'], $db, $CSVArray, $pid, $mTagLength, $permAuth);
            }

        } else { // Login
            // Reading displayName, loginType, and template from login
            $query = "SELECT displayName, loginType, template, info FROM logins WHERE id=?";
            $parameters = array($id);
            $res = $db->fetchTable($query, $parameters);
            $loginData = $res['data'][0];

            // Map loginType based on template
            $loginType = mapLoginType($loginData['loginType'], $loginData['template']);

            // Reading meta tags from login
            $metaTags = json_decode($loginData['info'] ?? '', true);
            $metaEscaped = [];

            if (is_array($metaTags)) {
                if (count($metaTags) > $mTagLength) $mTagLength = count($metaTags);
                foreach ($metaTags as $key => $value) {
                    $metaEscaped[prepField($key)] = prepField($value);
                }
            }

            // Read folder path
            $sfolder = createFolderPath($pid, $id, $db);

            // Add to CSV array
            array_push($CSVArray, array(
                'name' => prepField($name),
                'displayName' => prepField($loginData['displayName']),
                'folderPath' => prepField($sfolder),
                'loginType' => prepField($loginType),
                'metaTags' => $metaEscaped
            ));
        }
    }

    foreach ($selection as $val) {
        if ($val['type'] === 'folder') {
            $table = 'loginsFolders';
        } else {
            $table = 'logins';
        }
        // Check if selected login or folder has not been deleted by another user
        $query = "SELECT COUNT(*) FROM " . $table . " WHERE id=?";
        $parameters = array($val['dbId']);
        $results = $db->fetchValue($query, $parameters);
        if ($results['data'] === 0) {
            $returnData['error'] = $uiLang->translate("At least one of the logins you are trying to export has been deleted by another user. Please try a new selection!");
            $returnData['reloadFolder'] = true;
            die();
        } else {
            // Save the changes
            recurFetch($val['dbId'], $val['type'], $val['name'], $db, $CSVArray, $pid, $mTagLength, $permAuth);
        }
    }
    $returnData['mTagLength'] = $mTagLength;
    $returnData['CSVArray'] = $CSVArray;
    $returnData['id'] = $pid;
}

function wizardCreate($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */

    checkParams($data, array(
        'assignTests', 'leadingZeros', 'noAutoPwds', 'noTestees', 'prefix', 'pwdDigits', 'pwdMode', 'pwds',
        'pwdsSameForAll', 'structure', 'suffix', 'pid',
        'oSetTimer', 'oAdditionalTime', 'oSetSaving', 'oSetNavLimit', 'oDemoMode',
        'overrides', 'assignMtags', 'metaTags',
        'oLoginForwarding', 'oForwardUrl'
    ));

    $assignTests = $data['assignTests'];
    $leadingZeros = $data['leadingZeros'];
    $noAutoPwds = $data['noAutoPwds'];
    $requestedCount = filter_var($data['noTestees'], FILTER_VALIDATE_INT);
    $startCount = filter_var($data['startCount'], FILTER_VALIDATE_INT);
    $prefix = (string)$data['prefix'];
    $suffix = (string)$data['suffix'];
    $pwdDigits = filter_var($data['pwdDigits'], FILTER_VALIDATE_INT);
    $pwdMode = (string)$data['pwdMode'];
    // "off" is the value used by the wizard when no passwords are requested.
    // Also accept "none" as a backwards-compatible alias for API callers.
    if ($pwdMode === 'none') $pwdMode = 'off';

    if ($requestedCount === false || $requestedCount < 1 || $requestedCount > 10000) {
        $returnData['error'] = $uiLang->translate('The number of test takers must be between 1 and 10000.');
        return;
    }
    if ($startCount === false || $startCount < 0) {
        $returnData['error'] = $uiLang->translate('The starting number must be zero or greater.');
        return;
    }
    if (!in_array($pwdMode, ['auto', 'manual', 'off'], true)) {
        $returnData['error'] = $uiLang->translate('The selected password creation mode is invalid.');
        return;
    }
    if ($pwdMode === 'auto' && ($pwdDigits === false || $pwdDigits < 1 || $pwdDigits > 255)) {
        $returnData['error'] = $uiLang->translate('The password length must be between 1 and 255 characters.');
        return;
    }
    if (mb_strlen($prefix) > 255 || mb_strlen($suffix) > 255) {
        $returnData['error'] = $uiLang->translate('The test taker name prefix and suffix must not exceed 255 characters.');
        return;
    }
    if (!ttRequireAllowedLoginName($prefix, $returnData, $uiLang, true)
        || !ttRequireAllowedLoginName($suffix, $returnData, $uiLang, true)) return;
    $noTestees = $requestedCount + $startCount;
    $pwds = $data['pwds'];
    $pwdsSameForAll = $data['pwdsSameForAll'];
    $structure = $data['structure'];
    $assignMtags = $data['assignMtags'];
    $metaTags = $data['metaTags'];

    if ($pwdMode === 'manual') {
        foreach ($pwds as $passwordData) {
            if (!is_array($passwordData)
                || !ttRequireAllowedPassword((string)($passwordData['name'] ?? ''), $returnData, $uiLang)) return;
        }
    }

    if ($assignTests && !ttValidateAssignedTestAccessMap($structure, $db, $returnData)) return;

    if (empty($metaTags)) {
        $metaTagsJSON = '{}';
    } else {
        $metaTagsJSON = json_encode($metaTags);
    }

    // ---- Overrides JSON ----
    if ($data['overrides']) {

        $oSetTimer = ($data['oSetTimer']) ? 'true' : 'false';
        $oAdditionalTime = $data['oAdditionalTime'];
        $oSetSaving = ($data['oSetSaving']) ? 'true' : 'false';
        $oSetNavLimit = ($data['oSetNavLimit']) ? 'true' : 'false';
        $oDemoMode = ($data['oDemoMode']) ? 'true' : 'false';

        // NEW: loginForwarding + forwardUrl
        $oLoginForwarding = ($data['oLoginForwarding']) ? 'true' : 'false';

        // forwardUrl must be JSON-escaped string; keep empty string if not provided
        $oForwardUrl = '';
        if (isset($data['oForwardUrl']) && $data['oForwardUrl'] !== null) {
            $oForwardUrl = trim((string)$data['oForwardUrl']);
        }
        $oForwardUrlJSON = json_encode($oForwardUrl); // produces quoted JSON string, safely escaped

        $options = '{"disableTimer":' . $oSetTimer
            . ',"disableSaving":' . $oSetSaving
            . ',"allowNavigation":' . $oSetNavLimit
            . ',"additionalTime":' . $oAdditionalTime
            . ',"demoMode":' . $oDemoMode
            . ',"loginForwarding":' . $oLoginForwarding
            . ',"forwardUrl":' . $oForwardUrlJSON
            . '}';
    } else {
        // Ensure defaults include the new fields as well
        $options = '{"disableTimer":false,"disableSaving":false,"allowNavigation":false,"demoMode":false,"loginForwarding":false,"forwardUrl":""}';
    }

    $pid = $data['pid'];
    $samePwds = array();

    //Check if destination folder has not been deleted by another user
    $query = "SELECT COUNT(*) FROM loginsFolders WHERE id=?";
    $parameters = array($pid);
    $results = $db->fetchValue($query, $parameters);
    if ($results['data'] === 0) {
        if (isset($data['rebuild'])) {
            $location = 1;
        } else {
            $returnData['error'] = $uiLang->translate("The folder where you are trying to create the test takers has been deleted by another user. Operation aborted.");
            $returnData['closeEditMode'] = true;
            $returnData['reloadFolder'] = true;
            $returnData['goToParent'] = true;
            die();
        }
    }

    //Check if there are existing testees with the specified name range
    for ($i = $startCount; $i < $noTestees; $i++) {
        if ($leadingZeros) {
            $name = $prefix . str_pad($i, 3, '0', STR_PAD_LEFT) . $suffix;
        } else {
            $name = $prefix . $i . $suffix;
        }
        $query = "SELECT COUNT(*) FROM logins WHERE name=?";
        $parameters = array($name);
        $results = $db->fetchValue($query, $parameters);
        // if the name is already in use:
        if ($results['data'] != 0) {
            $returnData['error'] = $uiLang->translate('Please choose another naming! Logins (Test takers) within your chosen name range do already exist:');
            $returnData['errorDetails'] = $name;
            die();
        }
    }

    if ($db->startTransaction() !== true) {
        $returnData['error'] = $uiLang->translate('Unable to start bulk creation transaction.');
        return;
    }
    try {
    //Write testees to database
    for ($i = $startCount; $i < $noTestees; $i++) {
        if ($leadingZeros) {
            $name = $prefix . str_pad($i, 3, '0', STR_PAD_LEFT) . $suffix;
        } else {
            $name = $prefix . $i . $suffix;
        }

        //Create new testees
        $dataInsert = array(array(
            'parent' => $pid,
            'name' => $name,
            'overrides' => $options,
            'info' => $metaTagsJSON,
            'template' => 'testee'
        ));
        $db->insert('logins', $dataInsert);
        $result = $db->results();
        ttAssertDbSuccess($db, 'Unable to create a test taker.');

        //Add passwords
        switch ($pwdMode) {
            case 'auto':
                for ($j = 1; $j <= $noAutoPwds; $j++) {
                    $preCheck = true;
                    $pwdName = null;
                    while ($preCheck == true) {
                        if ($pwdsSameForAll) {
                            if ($i == $startCount) $samePwds[$j] = randomString($pwdDigits);
                            $pwdName = $samePwds[$j];
                        } else {
                            $pwdName = randomString($pwdDigits);
                        }
                        $query = "SELECT COUNT(*) FROM passwords WHERE name=? AND loginID=?";
                        $parameters = array(Crypt::encryptString($pwdName), $result['id']);
                        $resultsCheck = $db->fetchValue($query, $parameters);
                        if ($resultsCheck['data'] == 0) {
                            $preCheck = false;
                        }
                    }

                    if ($assignTests && count($structure) > 0) {
                        //Assign tests if requested
                        $structure[0] = ttPreparePasswordAssignmentStructure($structure[0]);
                        $jsonStructure = json_encode($structure[0]);
                        $dataPwd = array(array(
                            'loginID' => $result['id'],
                            'structure' => $jsonStructure,
                            'name' => Crypt::encryptString($pwdName),
                            'tag' => ''
                        ));
                        $db->insert('passwords', $dataPwd);
                        ttAssertDbSuccess($db, 'Unable to create a password.');
                    } else {
                        $dataPwd = array(array(
                            'loginID' => $result['id'],
                            'name' => Crypt::encryptString($pwdName),
                            'tag' => ''
                        ));
                        $db->insert('passwords', $dataPwd);
                        ttAssertDbSuccess($db, 'Unable to create a password.');
                    }
                }
                break;

            case 'manual':
                if ($assignTests && count($structure) > 0) {
                    //Assign tests if requested
                    foreach ($pwds as $value) {
                        if (array_key_exists($value['id'], $structure) && is_array($structure[$value['id']])) {
                            $structure[$value['id']] = ttPreparePasswordAssignmentStructure($structure[$value['id']]);
                            $jsonStructure = json_encode($structure[$value['id']]);

                            $dataPwd = array(array(
                                'loginID' => $result['id'],
                                'structure' => $jsonStructure,
                                'name' => Crypt::encryptString($value['name']),
                                'tag' => $value['tag']
                            ));
                        } else {
                            $dataPwd = array(array(
                                'loginID' => $result['id'],
                                'name' => Crypt::encryptString($value['name']),
                                'tag' => $value['tag']
                            ));
                        }
                        $db->insert('passwords', $dataPwd);
                        ttAssertDbSuccess($db, 'Unable to create a password.');
                    }
                } else {
                    foreach ($pwds as $value) {
                        $dataPwd = array(array(
                            'loginID' => $result['id'],
                            'name' => Crypt::encryptString($value['name']),
                            'tag' => $value['tag']
                        ));
                        $db->insert('passwords', $dataPwd);
                        ttAssertDbSuccess($db, 'Unable to create a password.');
                    }
                }
                break;
        }
    }

    if ($db->commit() !== true) throw new RuntimeException('Unable to commit bulk creation.');
    } catch (Throwable $e) {
        $db->rollback();
        $returnData['error'] = $e->getMessage();
        return;
    }

    $returnData['id'] = $pid;
}


function wizardCreateFromFile($data, rixPDO &$db, &$returnData)
{
    global $uiLang, $myAuth, $permAuth;
    /* @var $db rixPDO */
    checkParams($data, array('csvFilename', 'csvData', 'fileWizardType', 'pid'));

    $csvFilename = $data['csvFilename'];
    $csvData = $data['csvData'];
    $pid = (int)$data['pid'];
    $lid = (string)$data['fileWizardType'];
    $existing = array();
    if (!is_array($csvData) || count($csvData) < 1 || count($csvData) > 10000 || !in_array($lid, ['student', 'standard'], true)) {
        $returnData['error'] = $uiLang->translate('Invalid CSV import data or import type.');
        return;
    }
    $minimumColumns = ($lid === 'student') ? 8 : 6;
    foreach ($csvData as $rowIndex => $row) {
        if (!is_array($row) || count($row) < $minimumColumns || count($row) > 208) {
            $returnData['error'] = $uiLang->translate('Invalid column count in CSV import.') . ' ' . ($rowIndex + 2);
            return;
        }
        foreach ($row as $field) {
            if (!is_scalar($field) && $field !== null) {
                $returnData['error'] = $uiLang->translate('Invalid value in CSV import.') . ' ' . ($rowIndex + 2);
                return;
            }
            if (mb_strlen((string)$field) > 4096) {
                $returnData['error'] = $uiLang->translate('CSV value is too long.') . ' ' . ($rowIndex + 2);
                return;
            }
        }
        $name = trim((string)($row[0] ?? ''));
        if ($name === '' || mb_strlen($name) > 255) {
            $returnData['error'] = $uiLang->translate('Invalid login name in CSV import.') . ' ' . ($rowIndex + 2);
            return;
        }
        if (!ttRequireAllowedLoginName($name, $returnData, $uiLang)) {
            $returnData['error'] .= ' ' . $uiLang->translate('CSV row') . ' ' . ($rowIndex + 2) . ', ' . $uiLang->translate('login name column') . '.';
            return;
        }
        $folderValue = (string)($row[$lid === 'student' ? 6 : 4] ?? '');
        $folderParts = array_values(array_filter(explode('\\', trim($folderValue, '\\')), static fn($part) => $part !== ''));
        if (count($folderParts) > 32) {
            $returnData['error'] = $uiLang->translate('CSV folder path is too deep.') . ' ' . ($rowIndex + 2);
            return;
        }
        foreach ($folderParts as $part) {
            if (mb_strlen($part) > 255 || $part === '.' || $part === '..') {
                $returnData['error'] = $uiLang->translate('Invalid folder name in CSV import.') . ' ' . ($rowIndex + 2);
                return;
            }
        }
        if ($lid === 'student') {
            $authType = strtolower(trim((string)($row[1] ?? '')));
            if (!in_array($authType, ['direct', 'ldap', 'saml'], true)) {
                $returnData['error'] = $uiLang->translate('Invalid authentication type in CSV import.') . ' ' . ($rowIndex + 2);
                return;
            }
            if (mb_strlen((string)($row[2] ?? '')) > 128
                || mb_strlen((string)($row[3] ?? '')) > 255
                || mb_strlen((string)($row[4] ?? '')) > 255
                || mb_strlen((string)($row[7] ?? '')) > 255) {
                $returnData['error'] = $uiLang->translate('CSV login value is too long.') . ' ' . ($rowIndex + 2);
                return;
            }
            if (!ttRequireAllowedPassword((string)($row[2] ?? ''), $returnData, $uiLang, true)) {
                $returnData['error'] .= ' ' . $uiLang->translate('CSV row') . ' ' . ($rowIndex + 2) . ', ' . $uiLang->translate('password column') . '.';
                return;
            }
        } elseif (mb_strlen((string)($row[1] ?? '')) > 128
            || mb_strlen((string)($row[2] ?? '')) > 255
            || mb_strlen((string)($row[5] ?? '')) > 255) {
            $returnData['error'] = $uiLang->translate('CSV login value is too long.') . ' ' . ($rowIndex + 2);
            return;
        } elseif (!ttRequireAllowedPassword((string)($row[1] ?? ''), $returnData, $uiLang, true)) {
            $returnData['error'] .= ' ' . $uiLang->translate('CSV row') . ' ' . ($rowIndex + 2) . ', ' . $uiLang->translate('password column') . '.';
            return;
        }
    }

    //Check if destination folder has not been deleted by another user
    $query = "SELECT COUNT(*) FROM loginsFolders WHERE id=?";
    $parameters = array($pid);
    $results = $db->fetchValue($query, $parameters);
    if ($results['data'] === 0) {
        if (isset($data['rebuild'])) {
            $location = 1;
        } else {
            $returnData['error'] = $uiLang->translate("The folder where you are trying to create the test takers has been deleted by another user. Operation aborted.");
            $returnData['closeEditMode'] = true;
            $returnData['reloadFolder'] = true;
            $returnData['goToParent'] = true;
            die();
        }
    }

    $parseTestIds = static function ($testIdField): array {
        $testIdField = trim((string)$testIdField, '\\');
        if ($testIdField === '') return [];
        $ids = [];
        foreach (explode('\\', $testIdField) as $singleId) {
            if ($singleId === '') continue;
            $ids[] = (int)$singleId;
        }
        return array_values(array_unique($ids));
    };

    $testIdIndex = ($lid === 'student') ? 5 : 3;
    $referencedTestIds = [];
    foreach ($csvData as $row) {
        foreach ($parseTestIds($row[$testIdIndex] ?? '') as $testId) {
            if ($testId > 0) $referencedTestIds[$testId] = $testId;
        }
    }

    $testsById = [];
    if (!empty($referencedTestIds)) {
        $testIds = array_values($referencedTestIds);
        $placeholders = implode(',', array_fill(0, count($testIds), '?'));
        $testRows = $db->fetchTable(
            "SELECT `id`, `parent` FROM `tests` WHERE `id` IN ($placeholders)",
            $testIds
        );
        if (!empty($testRows['error'])) {
            $returnData['error'] = $uiLang->translate('Referenced tests could not be checked.');
            return;
        }
        foreach ($testRows['data'] as $testRow) {
            $testsById[(int)$testRow['id']] = (int)$testRow['parent'];
        }
    }

    $hasElevatedTestAccess = $myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin();
    $folderAccessCache = [];
    $canReadTest = function (int $testId) use (
        &$db, &$myAuth, &$permAuth, &$testsById, &$folderAccessCache, $hasElevatedTestAccess
    ): array {
        if ($testId <= 0 || !array_key_exists($testId, $testsById)) return [false, 'missing'];
        if ($hasElevatedTestAccess) return [true, 'ok'];

        $parentId = $testsById[$testId];
        if (!array_key_exists($parentId, $folderAccessCache)) {
            $owner = $db->fetchValue("SELECT `owner` FROM `testFolders` WHERE `id` = ? LIMIT 1", [$parentId]);
            $isOwner = empty($owner['error']) && (int)($owner['data'] ?? 0) === (int)$myAuth->userid;
            $folderAccessCache[$parentId] = $permAuth->getAccessVal("tests", "fetchLibrary", "itemObject", $parentId) || $isOwner;
        }
        return $folderAccessCache[$parentId] ? [true, 'ok'] : [false, 'denied'];
    };

    $skipByName = [];
    foreach ($csvData as $i => $row) {
        $name = (string)($row[0] ?? '');
        foreach ($parseTestIds($row[$testIdIndex] ?? '') as $testId) {
            [$hasAccess, $reason] = $canReadTest($testId);
            if ($hasAccess) continue;

            if (!isset($skipByName[$name])) {
                $skipByName[$name] = [
                    'name' => $name,
                    'lines' => [],
                    'missing' => [],
                    'denied' => []
                ];
            }
            $skipByName[$name]['lines'][] = $i + 2;
            if ($reason === 'missing') {
                $skipByName[$name]['missing'][] = $testId;
            } else {
                $skipByName[$name]['denied'][] = $testId;
            }
        }
    }

    if (!empty($skipByName)) {
        foreach ($skipByName as &$skipInfo) {
            $skipInfo['lines'] = array_values(array_unique($skipInfo['lines']));
            $skipInfo['missing'] = array_values(array_unique($skipInfo['missing']));
            $skipInfo['denied'] = array_values(array_unique($skipInfo['denied']));
        }
        unset($skipInfo);

        $csvData = array_values(array_filter($csvData, function ($row) use ($skipByName) {
            return !isset($skipByName[(string)($row[0] ?? '')]);
        }));

        $returnData['importSummary'] = [
            'skipped' => count($skipByName),
            'skippedDetails' => array_values($skipByName)
        ];
    }

    if (empty($csvData)) {
        if (!isset($returnData['importSummary'])) {
            $returnData['importSummary'] = ['skipped' => 0, 'skippedDetails' => []];
        }
        $returnData['importSummary']['imported'] = 0;
        $returnData['id'] = $pid;
        return;
    }

    //Check already existing testee
    for ($i = 0; $i < count($csvData); $i++) {
        $name = $csvData[$i][0];
        $query = "SELECT COUNT(*) FROM logins WHERE name=?";
        $parameters = array($name);
        $results = $db->fetchValue($query, $parameters);
        //if the name is already in use:
        if ($results['data'] != 0) {
            if (!in_array($name, $existing)) {
                array_push($existing, $name);
            }
        }
    }

    //Exit if at least one of the testees is already existing
    if (count($existing) > 0) {
        $existingTestees = implode(", ", $existing);
        $returnData['error'] = $uiLang->translate('Import aborted. The following logins (Test takers) do already exist:');
        $returnData['errorDetails'] = $existingTestees;

        die();
    }

    # -------------------------------------------------- #
    # PRE-TEST TAKER ADDING FOLDER PERMISSION VALIDATION #
    # -------------------------------------------------- #

    // create array of non-null folders to pre-scan
    $subfolderIndex = ($lid === 'student') ? 6 : 4;
    $csvFldArr = array_column($csvData, $subfolderIndex);
    $csvFldArr = array_filter($csvFldArr);

    foreach ($csvFldArr as $pathLine) {

        $pathLine = trim($pathLine, '\\');
        $pathArr = explode('\\', $pathLine);

        $startPar = $data['pid'];
        $startId = $db->fetchValue("SELECT `id` FROM `loginsFolders` WHERE name = ? AND parent = ?", [$pathArr[0], $startPar])['data'];
        if (empty($startId)) continue;

        for ($i = 0; $i < count($pathArr); $i++) {
            $pathId = $db->fetchValue("SELECT `id` FROM `loginsFolders` WHERE name = ? AND parent = ?", [$pathArr[$i], $startPar])['data'];
            if (empty($pathId)) continue;

            // permission check - exit completely if failed
            $hasFldWrite = $permAuth->permCheck(['remCall' => true, 'fid' => $pathId]);
            if (!$hasFldWrite) {
                $returnData['error'] = $uiLang->translate("<br>A target subfolder already exists on which you do not have write permissions.");
                exit;
            }
            $startPar = $pathId; // update our starting parent var to last found id
        }
    }

    //Function to deliver a parent folder ID from a path string and to create folders not existing yet
    function deliverParentFolder($startFolder, $pathString, rixPDO &$db, &$returnData)
    {
        global $myAuth;

        /* @var $db rixPDO */
        $pathString = trim($pathString, '\\');
        $pathStringArray = explode('\\', $pathString);
        $returnFolderID = null;

        for ($i = 0; $i < count($pathStringArray); $i++) {
            //Check if target folder already exists
            $query = "SELECT id FROM loginsFolders WHERE name=? and parent=?";
            $parameters = array($pathStringArray[$i], $startFolder);
            $res = $db->fetchValue($query, $parameters);

            //Create folders if they do not exist with the current user being the owner of the new folders
            if (empty($res['data'])) {
                $params = array(array('parent' => $startFolder, 'name' => $pathStringArray[$i], 'owner' => $myAuth->userid));
                $db->insert('loginsFolders', $params);
                $res2 = $db->results();

                // get parent ID accessDef values
                $parAcDefs = $db->fetchTable("SELECT `userGroupId`,`accessDef` FROM `loginsFolderAccess` WHERE `folderId` = ?", [$startFolder])['data'];

                // change folder ID to newly created value
                $acStartFolder = $res2['id'];
                $returnFolderID = $res2['id'];

                if ($startFolder === 1) {
                    // when importing into root folder, set all disabled access for new import
                    global $permAuth;
                    $permAuth->newFolderPermSet($startFolder, $res2['id']);
                } else {
                    // insert accessDef values into newly created folder using the parent permission set as the source values
                    foreach ($parAcDefs as $key => $value) {
                        $db->insert("loginsFolderAccess", ["folderId" => $acStartFolder, "userGroupId" => $value['userGroupId'], "accessDef" => $value['accessDef']]);
                    }
                }
                $startFolder = $res2['id'];
            } else {
                $acStartFolder = $res['data'];
                $returnFolderID = $res['data'];
                $startFolder = $res['data'];
            }

        }
        //return new parentID
        return $returnFolderID;
    }

    // Resolve and create import folders before opening the login transaction.
    // Root-folder permission setup may use its own database operation; doing that
    // while the new folder is still uncommitted can cause a lock wait until timeout.
    $resolvedImportFolders = [];
    foreach ($csvData as $row) {
        $subfolder = trim((string)($row[$subfolderIndex] ?? ''), '\\');
        if ($subfolder === '' || array_key_exists($subfolder, $resolvedImportFolders)) continue;
        $resolvedFolderId = deliverParentFolder($pid, $subfolder, $db, $returnData);
        if ($resolvedFolderId === null) {
            $returnData['error'] = $uiLang->translate('Unable to create or locate a CSV import subfolder.');
            return;
        }
        $resolvedImportFolders[$subfolder] = (int)$resolvedFolderId;
    }

    if ($db->startTransaction() !== true) {
        $returnData['error'] = $uiLang->translate('Unable to start CSV import transaction.');
        return;
    }
    try {
    //Import lines from CSV into database
    if($lid === 'student'){
        //student logins
        for ($i = 0; $i < count($csvData); $i++) {
            //Setting up variables
            $name = $csvData[$i][0];
            $authType = strtolower($csvData[$i][1]);

            switch ($authType){
                case 'direct':
                    $authType = 'directPass';
                    break;
                case 'ldap':
                    $authType = 'LDAP';
                    break;
                case 'saml':
                    $authType = 'SAML';
                    break;
            }

            if ($authType === 'directPass') {
                $plainLoginPassword = $csvData[$i][2] === '' ? randomString(8) : (string)$csvData[$i][2];
                $password = Crypt::encryptString($plainLoginPassword);
            } else {
                //External authentication credentials are never stored as OASYS direct-login passwords.
                $password = NULL;
            }
            $label = $csvData[$i][3];
            $tag = $csvData[$i][4];
            if ($tag === null) $tag = '';
            $testId = $csvData[$i][5];
            $subfolder = $csvData[$i][6];
            if ($csvData[$i][5] === '') {
                $displayname = null;
            } else {
                $displayname = $csvData[$i][7];
            }
            //Check if testee has already been created within this run
            $query = "SELECT COUNT(*) FROM logins WHERE name=?";
            $parameters = array($name);
            $results = $db->fetchValue($query, $parameters);
            //Create new testees
            if ($results['data'] == 0) {
                //Determine the parent folder id for the new testee
                if (trim((string)$subfolder, '\\') !== '') {
                    $writeId = $resolvedImportFolders[trim((string)$subfolder, '\\')];
                } else {
                    $writeId = $pid;
                }
                //Create testee
                $insertdata = array(array('parent' => $writeId, 'name' => $name, 'overrides' => '{"disableTimer":false,"disableSaving":false,"allowNavigation":false,"demoMode":false}', 'info' => NULL, 'template' => 'testee', 'loginType' => $authType, 'password' => $password, 'displayName' => $displayname));
                $db->insert('logins', $insertdata);
            }
            //Read testee
            $query = "SELECT id,info FROM logins WHERE name=?";
            $parameters = array($name);
            $results = $db->fetchRow($query, $parameters);
            $loginId = $results['data']['id'];
            $info = $results['data']['info'];

            //Write meta tags if not yet present
            if ($info === null && count($csvData[$i]) > 8) {
                $newInfo = new stdClass();
                for ($j = 8; $j < count($csvData[$i]); $j++) {
                    if (($j % 2 === 0) && $csvData[$i][$j] != null) {
                        $newInfo->{$csvData[$i][$j]} = $csvData[$i][$j + 1] ?? '';
                    }
                }
                $writeInfo = json_encode($newInfo);
                $db->prepare("UPDATE logins SET info=? WHERE id=?");
                $db->executePrepared(array($writeInfo, $loginId));
            }

            //Add labels
            if ($label !== '') {
                //create a label password distinct from the login password and all other labels
                $pwdName = ttGenerateUniquePasswordForLogin($db, (int)$loginId, 6);
                $data = array(array('loginID' => $loginId, 'name' => Crypt::encryptString($pwdName), 'label' => $label, 'tag' => $tag));
                $db->insert('passwords', $data);
                $result = $db->results();
                $passId = $result['id'];

                //Add or modify structure of password
                if ($testId !== '') {
                    $jsonData = array();
                    $testId = trim($testId, '\\');
                    $testIdArray = explode('\\', $testId);
                    foreach ($testIdArray as $singleId) {
                        array_push($jsonData, array('hiddenID' => (int)$singleId));
                    }
                    $jsonWrite = json_encode($jsonData);
                    $db->prepare("UPDATE passwords SET structure=? WHERE id=?");
                    $db->executePrepared(array($jsonWrite, $passId));
                }
            }
        }
    } else {
        //standard logins
        for ($i = 0; $i < count($csvData); $i++) {
            //Setting up variables
            $name = $csvData[$i][0];
            $password = $csvData[$i][1];
            $tag = $csvData[$i][2];
            if ($tag === null) $tag = '';
            $testId = $csvData[$i][3];
            $subfolder = $csvData[$i][4];
            if ($csvData[$i][5] === '') {
                $displayname = null;
            } else {
                $displayname = $csvData[$i][5];
            }
            //Check if testee has already been created within this run
            $query = "SELECT COUNT(*) FROM logins WHERE name=?";
            $parameters = array($name);
            $results = $db->fetchValue($query, $parameters);
            //Create new testees
            if ($results['data'] == 0) {
                //Determine the parent folder id for the new testee
                if (trim((string)$subfolder, '\\') !== '') {
                    $writeId = $resolvedImportFolders[trim((string)$subfolder, '\\')];
                } else {
                    $writeId = $pid;
                }
                //Create testee
                $insertdata = array(array('parent' => $writeId, 'name' => $name, 'overrides' => '{"disableTimer":false,"disableSaving":false,"allowNavigation":false,"demoMode":false}', 'info' => NULL, 'template' => 'testee', 'displayName' => $displayname));
                $db->insert('logins', $insertdata);
            }
            //Read testee
            $query = "SELECT id,info FROM logins WHERE name=?";
            $parameters = array($name);
            $results = $db->fetchRow($query, $parameters);
            $loginId = $results['data']['id'];
            $info = $results['data']['info'];

            //Write meta tags if not yet present
            if ($info === null && count($csvData[$i]) > 6) {
                $newInfo = new stdClass();
                for ($j = 6; $j < count($csvData[$i]); $j++) {
                    if (($j % 2 === 0) && $csvData[$i][$j] != null) {
                        $newInfo->{$csvData[$i][$j]} = $csvData[$i][$j + 1] ?? '';
                    }
                }
                $writeInfo = json_encode($newInfo);
                $db->prepare("UPDATE logins SET info=? WHERE id=?");
                $db->executePrepared(array($writeInfo, $loginId));
            }

            //Add passwords
            if ($password !== '') {
                //Check if password has already been created already
                $query = "SELECT COUNT(*) FROM passwords WHERE name=? AND loginID=?";
                $parameters = array(Crypt::encryptString($password), $loginId);
                $results = $db->fetchValue($query, $parameters);

                if ($results['data'] == 0) {
                    $dataPwd = array(array('loginID' => $loginId, 'name' => Crypt::encryptString($password), 'tag' => $tag));
                    $db->insert('passwords', $dataPwd);
                }
                //Add or modify structure of password
                if ($testId !== '') {

                    //Determine the passwordID
                    $query = "SELECT id, structure FROM passwords WHERE name=? AND loginID=?";
                    $parameters = array(Crypt::encryptString($password), $loginId);
                    $results = $db->fetchRow($query, $parameters);
                    $passId = $results['data']['id'];

                    //Save modified structure to password`
                    $jsonData = json_decode($results['data']['structure'] ?? '', true);
                    if ($jsonData == null) {
                        $jsonData = array();
                    }
                    $testId = trim($testId, '\\');
                    $testIdArray = explode('\\', $testId);
                    foreach ($testIdArray as $singleId) {
                        array_push($jsonData, array('hiddenID' => (int)$singleId));
                    }
                    $jsonWrite = json_encode($jsonData);
                    $db->prepare("UPDATE passwords SET structure=? WHERE id=?");
                    $db->executePrepared(array($jsonWrite, $passId));
                }
            }
        }
    }
    if (!isset($returnData['importSummary'])) {
        $returnData['importSummary'] = ['skipped' => 0, 'skippedDetails' => []];
    }
    $returnData['importSummary']['imported'] = count(array_unique(array_column($csvData, 0)));
    $returnData['id'] = $pid;
    ttAssertDbSuccess($db, 'Unable to complete the CSV import.');
    if ($db->commit() !== true) throw new RuntimeException('Unable to commit CSV import.');
    } catch (Throwable $e) {
        $db->rollback();
        $returnData['error'] = $e->getMessage();
        return;
    }
}


function fetchTestsAssigned($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */
    checkParams($data, array('id', 'testee'));

    $id = $data['id'];
    $testee = $data['testee'];
    $dataFlag = false;
    //Check if Testee is still present
    $query = "SELECT * FROM logins WHERE id=? LIMIT 1";
    $parameters = array($testee);
    $result = $db->fetchRow($query, $parameters);

    //Show error message if selected testee is not available anymore
    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("The test taker you are trying to edit has been deleted by another user. The view will be refreshed.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }
    $testeeData = $result['data'];
    //Show error message
    $query = "SELECT * FROM passwords WHERE id=? AND loginID=? LIMIT 1";
    $parameters = array($id, $testee);
    $result = $db->fetchRow($query, $parameters);
    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("This password has been deleted by another user. Leaving edit mode.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }
    //json block for structure
    $jsonData = json_decode($result['data']['structure'] ?? '', true);
    if ($jsonData == null) {
        $result['data']['structure'] = array();
    } else {
        $result['data']['structure'] = array();
        foreach ($jsonData as $value) {
            $query = "SELECT * FROM tests WHERE id=? LIMIT 1";
            $parameters = array($value['hiddenID']);
            $queryResult = $db->fetchRow($query, $parameters);
            if ($queryResult['rows'] === 0) {
                $itemArray = array('testType' => '', 'name' => $uiLang->translate('Test has been deleted!'), 'hiddenID' => $value['hiddenID'], 'ID' => $value['hiddenID'], 'actionField' => '-', 'removed' => true);
            } else {
                $testStructure = json_decode($queryResult['data']['structure'] ?? '', true);
                $testType = $testStructure['type'] ?? 'linear';
                if (!in_array($testType, array('linear', 'fluid', 'mutation'), true)) {
                    $testType = 'linear';
                }
                if (($testeeData['template'] ?? '') === 'template') {
                    $actionField = '-';
                } else {
                    $subQuery = "SELECT * FROM activity WHERE loginId=? AND passwordId=? AND testId=?  LIMIT 1";
                    $subParameters = array($testee, $id, $value['hiddenID']);
                    $subQueryResult = $db->fetchRow($subQuery, $subParameters);
                    $actionFieldData = new stdClass();
                    if (!empty($subQueryResult['data'])) {
                        $actionFieldData->hiddenData = $subQueryResult['data'];
                        $dataFlag = true;
                    }
                    $actionField = $actionFieldData;
                }
                $itemArray = array(
                    'testType' => $testType,
                    'name' => $queryResult['data']['name'],
                    'hiddenID' => $value['hiddenID'],
                    'ID' => $value['hiddenID'],
                    'actionField' => $actionField
                );
            }
            array_push($result['data']['structure'], $itemArray);
        }
    }
    $returnData['dataFlag'] = $dataFlag;
    $anyActivity = $db->fetchValue("SELECT EXISTS(SELECT 1 FROM activity WHERE loginId=? LIMIT 1)", array($testee));
    $returnData['hasAnyResults'] = !empty($anyActivity['data']);
    if (($testeeData['template'] ?? '') === 'template') {
        $cloneIds = ttFetchTemplateCloneIds((int)$testee, $db);
        $returnData['templateCloneSummary'] = ttFetchTemplateCloneSummary((int)$testee, $db);
        $returnData['previewResultStats'] = ttFetchPreviewResultStats($cloneIds, $db, $uiLang, ttFetchTemplateAssignedTestIds((int)$testee, $db));
    }
    $decryptedName = Crypt::decryptString($result['data']['name']);
    if ($decryptedName === false) {
        testTakersPasswordHandlingError($returnData, $uiLang);
        return;
    }
    $result['data']['name'] = $decryptedName;
    $returnData['password'] = $result['data'];
}

function ttResolvePasswordPreviewStructures(array &$passwords, rixPDO &$db, $uiLang): void
{
    $testIds = array();
    foreach ($passwords as $key => $password) {
        $structure = json_decode($password['structure'] ?? '', true);
        if (!is_array($structure)) $structure = array();
        $passwords[$key]['previewStructureRaw'] = $structure;
        foreach ($structure as $item) {
            $testId = (int)($item['hiddenID'] ?? $item['ID'] ?? 0);
            if ($testId > 0) $testIds[$testId] = $testId;
        }
    }

    $testMap = array();
    if (count($testIds) > 0) {
        $placeholders = implode(',', array_fill(0, count($testIds), '?'));
        $rows = $db->fetchTable("SELECT id, name, structure FROM tests WHERE id IN ($placeholders)", array_values($testIds));
        foreach (($rows['data'] ?? array()) as $row) {
            $testStructure = json_decode($row['structure'] ?? '', true);
            $testType = $testStructure['type'] ?? 'linear';
            if (!in_array($testType, array('linear', 'fluid', 'mutation'), true)) {
                $testType = 'linear';
            }
            $testMap[(int)$row['id']] = array(
                'name' => $row['name'],
                'type' => $testType
            );
        }
    }

    foreach ($passwords as $key => $password) {
        $resolved = array();
        foreach (($password['previewStructureRaw'] ?? array()) as $item) {
            $testId = (int)($item['hiddenID'] ?? $item['ID'] ?? 0);
            if ($testId <= 0) continue;
            $resolved[] = array(
                'id' => $testId,
                'name' => $testMap[$testId]['name'] ?? $uiLang->translate('Test has been deleted!'),
                'type' => $testMap[$testId]['type'] ?? '',
                'removed' => !isset($testMap[$testId])
            );
        }
        $passwords[$key]['structureResolved'] = $resolved;
        unset($passwords[$key]['previewStructureRaw']);
    }
}

function ttFetchTesteeActivityData(int $loginId, rixPDO &$db): array
{
    $rows = $db->fetchTable(
        "SELECT testId, passwordId, progress, tsActiveServer FROM activity WHERE loginId=? ORDER BY tsActiveServer DESC",
        array($loginId)
    );
    return $rows['data'] ?? array();
}

function ttFetchTemplateCloneIds(int $templateId, rixPDO &$db): array
{
    $rows = $db->fetchColumn(
        "SELECT id FROM logins WHERE template='cloned' AND parentTemplateId=? ORDER BY id",
        array($templateId)
    );
    return array_map('intval', $rows['data'] ?? array());
}

function ttDeleteTemplateClones(array $templateIds, rixPDO &$db, string $resetMode = 'all', ?int $resetCutoff = null): int
{
    $templateIds = array_values(array_unique(array_map('intval', $templateIds)));
    $templateIds = array_values(array_filter($templateIds, static fn($id) => $id > 0));
    if (count($templateIds) === 0) return 0;
    $placeholders = implode(',', array_fill(0, count($templateIds), '?'));
    $query = "DELETE FROM logins WHERE template='cloned' AND parentTemplateId IN ($placeholders)";
    $parameters = $templateIds;
    if ($resetMode === 'before' || $resetMode === 'after') {
        $comparison = $resetMode === 'before' ? '<' : '>=';
        $query .= " AND createdAt $comparison FROM_UNIXTIME(?)";
        $parameters[] = $resetCutoff;
    }
    $db->prepare($query);
    $db->executePrepared($parameters);
    return (int)($db->results()['rows'] ?? 0);
}

function ttFetchTemplateCloneSummary(int $templateId, rixPDO &$db): array
{
    $rows = $db->fetchTable(
        "SELECT
             l.id,
             l.name,
             l.displayName,
             l.createdAt,
             COUNT(a.testId) AS activityRows,
             COUNT(DISTINCT a.testId) AS testsWithData,
             MAX(a.tsActiveServer) AS lastActivity,
             COALESCE(MAX(a.progress), 0) AS maxProgress,
             COALESCE(AVG(a.progress), 0) AS avgProgress,
             GROUP_CONCAT(DISTINCT CASE WHEN a.timeLeft = 0 THEN a.testId END) AS submittedTestIds,
             SUM(CASE WHEN a.timeLeft = 0 THEN 1 ELSE 0 END) AS submittedRows
         FROM logins l
         LEFT JOIN activity a ON a.loginId = l.id
         WHERE l.template='cloned'
         AND l.parentTemplateId=?
         GROUP BY l.id, l.name, l.displayName, l.createdAt
         ORDER BY l.id DESC",
        array($templateId)
    );

    $expectedTestsByClone = array();
    $cloneTests = array();
    $cloneIds = array_map(static fn($row) => (int)($row['id'] ?? 0), $rows['data'] ?? array());
    $cloneIds = array_values(array_filter($cloneIds, static fn($id) => $id > 0));
    if (count($cloneIds) > 0) {
        $placeholders = implode(',', array_fill(0, count($cloneIds), '?'));
        $activityRows = $db->fetchTable(
            "SELECT
                 a.loginId,
                 a.testId,
                 t.name AS testName,
                 MAX(a.progress) AS maxProgress,
                 MAX(a.tsActiveServer) AS lastActivity
             FROM activity a
             LEFT JOIN tests t ON t.id = a.testId
             WHERE a.loginId IN ($placeholders)
             GROUP BY a.loginId, a.testId, t.name
             ORDER BY lastActivity DESC",
            $cloneIds
        );
        foreach (($activityRows['data'] ?? array()) as $activityRow) {
            $cloneId = (int)($activityRow['loginId'] ?? 0);
            $testId = (int)($activityRow['testId'] ?? 0);
            if ($cloneId <= 0 || $testId <= 0) continue;
            if (!isset($cloneTests[$cloneId])) $cloneTests[$cloneId] = array();
            $cloneTests[$cloneId][] = array(
                'id' => $testId,
                'name' => $activityRow['testName'] ?? 'Test has been deleted!',
                'maxProgress' => round(((float)($activityRow['maxProgress'] ?? 0)) * 100),
                'lastActivity' => $activityRow['lastActivity'] ?? null
            );
        }

        $passwordRows = $db->fetchTable("SELECT loginID, structure FROM passwords WHERE loginID IN ($placeholders)", $cloneIds);
        $passwordRowsData = $passwordRows['data'] ?? array();
        foreach ($passwordRowsData as $passwordRow) {
            $cloneId = (int)($passwordRow['loginID'] ?? 0);
            if (!isset($expectedTestsByClone[$cloneId])) $expectedTestsByClone[$cloneId] = array();
            $passwordTestIds = ttExtractTestIdsFromPasswordStructure($passwordRow['structure'] ?? null);
            foreach ($passwordTestIds as $testId) {
                $expectedTestsByClone[$cloneId][$testId] = $testId;
            }
        }
    }

    $clones = array();
    $started = 0;
    $completed = 0;
    $lastActivity = null;
    $progressSum = 0;
    $progressCount = 0;
    foreach (($rows['data'] ?? array()) as $row) {
        $cloneId = (int)($row['id'] ?? 0);
        $activityRows = (int)($row['activityRows'] ?? 0);
        $submittedRows = (int)($row['submittedRows'] ?? 0);
        $avgProgress = round(((float)($row['avgProgress'] ?? 0)) * 100);
        $submittedTestIds = array_filter(array_map('intval', explode(',', (string)($row['submittedTestIds'] ?? ''))));
        $submittedTestIds = array_flip($submittedTestIds);
        $expectedTestIds = $expectedTestsByClone[$cloneId] ?? array();
        if ($activityRows > 0) $started++;
        if (count($expectedTestIds) > 0) {
            if (count(array_diff_key($expectedTestIds, $submittedTestIds)) === 0) $completed++;
        } else if ($activityRows > 0 && $submittedRows >= $activityRows) {
            $completed++;
        }
        if (!empty($row['lastActivity']) && ($lastActivity === null || $row['lastActivity'] > $lastActivity)) {
            $lastActivity = $row['lastActivity'];
        }
        if ($activityRows > 0) {
            $progressSum += $avgProgress;
            $progressCount++;
        }
        $clones[] = array(
            'id' => $cloneId,
            'name' => $row['name'],
            'displayName' => $row['displayName'],
            'createdAt' => $row['createdAt'] ?? null,
            'activityRows' => $activityRows,
            'testsWithData' => (int)($row['testsWithData'] ?? 0),
            'tests' => $cloneTests[$cloneId] ?? array(),
            'lastActivity' => $row['lastActivity'],
            'maxProgress' => round(((float)($row['maxProgress'] ?? 0)) * 100),
            'avgProgress' => $avgProgress,
            'submittedRows' => $submittedRows
        );
    }

    return array(
        'total' => count($clones),
        'started' => $started,
        'completed' => $completed,
        'avgProgress' => $progressCount > 0 ? round($progressSum / $progressCount) : 0,
        'lastActivity' => $lastActivity,
        'clones' => $clones
    );
}

function ttFetchTemplateAssignedTestIds(int $templateId, rixPDO &$db): array
{
    $rows = $db->fetchColumn("SELECT structure FROM passwords WHERE loginID=?", array($templateId));
    $testIds = array();
    foreach (($rows['data'] ?? array()) as $structure) {
        foreach (ttExtractTestIdsFromPasswordStructure($structure) as $testId) {
            $testIds[$testId] = $testId;
        }
    }
    return $testIds;
}

function ttExtractTestIdsFromPasswordStructure(?string $structure): array
{
    $decoded = json_decode($structure ?? '', true);
    if (!is_array($decoded)) return array();
    $testIds = array();
    foreach ($decoded as $item) {
        $testId = (int)($item['hiddenID'] ?? $item['ID'] ?? 0);
        if ($testId > 0) $testIds[$testId] = $testId;
    }
    return array_values($testIds);
}

function ttFetchPreviewResultStats(array $loginIds, rixPDO &$db, $uiLang, ?array $templateAssignedTestIds = null): array
{
    $loginIds = array_values(array_unique(array_map('intval', $loginIds)));
    $loginIds = array_values(array_filter($loginIds, static fn($id) => $id > 0));
    if (count($loginIds) === 0) {
        return array(
            'total_result_tests' => 0,
            'total_datasets' => 0,
            'resultTests' => array(),
            'testActivity' => array()
        );
    }
    $placeholders = implode(',', array_fill(0, count($loginIds), '?'));
    $result = $db->fetchTable(
        "SELECT
             CONCAT(a.passwordId,'_',a.testId) AS hiddenID,
             a.loginId,
             l.name AS loginName,
             l.displayName,
             a.testId,
             t.name AS testName,
             a.passwordId,
             p.name AS passwordName,
             p.label AS passwordLabel,
             p.tag AS passwordTag,
             a.progress AS progressField,
             a.tsActiveServer
         FROM activity a
         LEFT JOIN logins l ON l.id = a.loginId
         LEFT JOIN tests t ON t.id = a.testId
         LEFT JOIN passwords p ON p.id = a.passwordId
         WHERE a.loginId IN ($placeholders)
         ORDER BY a.tsActiveServer DESC",
        $loginIds
    );

    $activityRows = array();
    $tests = array();
    $datasets = array();
    foreach (($result['data'] ?? array()) as $row) {
        $loginId = (int)($row['loginId'] ?? 0);
        if ($loginId > 0) $datasets[$loginId] = $loginId;
        $passwordName = '';
        if (isset($row['passwordName']) && $row['passwordName'] !== null) {
            $decryptedName = Crypt::decryptString($row['passwordName']);
            $passwordName = ($decryptedName === false) ? '' : $decryptedName;
        }
        $displayPassword = $row['passwordLabel'] ?: $passwordName;
        if (!empty($row['passwordTag'])) $displayPassword .= ' [' . $row['passwordTag'] . ']';
        $progress = round(((float)($row['progressField'] ?? 0)) * 100);
        $testId = (int)($row['testId'] ?? 0);
        $testName = $row['testName'] ?? $uiLang->translate('Test has been deleted!');
        $activityRow = array(
            'hiddenID' => $row['hiddenID'],
            'loginId' => $loginId,
            'loginName' => $row['displayName'] ?: ($row['loginName'] ?? ''),
            'testId' => $testId,
            'testName' => $testName,
            'passwordId' => (int)($row['passwordId'] ?? 0),
            'passwordName' => $displayPassword,
            'progressField' => $progress,
            'tsActiveServer' => $row['tsActiveServer'] ?? null
        );
        $activityRows[] = $activityRow;

        if ($testId <= 0) continue;
        if (!isset($tests[$testId])) {
            $tests[$testId] = array(
                'testId' => $testId,
                'testName' => $testName,
                'lastActivity' => $row['tsActiveServer'] ?? null,
                'maxProgress' => $progress,
                'avgProgress' => 0,
                'progressSum' => 0,
                'progressCount' => 0,
                'datasetCount' => 0,
                'deletedFromTemplate' => is_array($templateAssignedTestIds) && !isset($templateAssignedTestIds[$testId]),
                'datasets' => array(),
                'passwords' => array()
            );
        }
        if ($loginId > 0) $tests[$testId]['datasets'][$loginId] = $loginId;
        $tests[$testId]['progressSum'] += $progress;
        $tests[$testId]['progressCount']++;
        if (($row['tsActiveServer'] ?? '') > ($tests[$testId]['lastActivity'] ?? '')) {
            $tests[$testId]['lastActivity'] = $row['tsActiveServer'];
        }
        if ($progress > $tests[$testId]['maxProgress']) $tests[$testId]['maxProgress'] = $progress;
        if ($displayPassword !== '') $tests[$testId]['passwords'][$displayPassword] = $displayPassword;
    }

    foreach ($tests as $key => $test) {
        $tests[$key]['passwords'] = array_values($test['passwords']);
        $tests[$key]['avgProgress'] = $test['progressCount'] > 0 ? round($test['progressSum'] / $test['progressCount']) : 0;
        $tests[$key]['datasetCount'] = count($test['datasets']);
        unset($tests[$key]['progressSum'], $tests[$key]['progressCount']);
        unset($tests[$key]['datasets']);
    }
    uasort($tests, static function($a, $b) {
        return strcmp((string)($b['lastActivity'] ?? ''), (string)($a['lastActivity'] ?? ''));
    });

    return array(
        'total_result_tests' => count($tests),
        'total_datasets' => count($datasets),
        'resultTests' => array_values($tests),
        'testActivity' => $activityRows
    );
}

function ttFetchTesteePreviewResultStats(int $loginId, rixPDO &$db, $uiLang): array
{
    return ttFetchPreviewResultStats(array($loginId), $db, $uiLang);
}


function fetchTest($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */
    checkParams($data, array('dbId', 'location'));

    $data['location'] = (int)$data['location'];
    $query = "SELECT * FROM logins WHERE id=? LIMIT 1";
    $parameters = array($data['dbId']);
    $result = $db->fetchRow($query, $parameters);

    //json block for options
    $jsonData = json_decode($result['data']['overrides'] ?? '', true);
    if ($jsonData == null) {
        $jsonData = array();
    }
    $result['data']['overrides'] = $jsonData;

    //json block for meta tags
    $jsonData = json_decode($result['data']['info'] ?? '', true);
    if ($jsonData == null) {
        $jsonData = new stdClass();
    }

    //decrypt password column
    if (!is_null($result['data']['password'])) {
        $decryptedPassword = Crypt::decryptString($result['data']['password']);
        if ($decryptedPassword === false) {
            testTakersPasswordHandlingError($returnData, $uiLang);
            return;
        }
        $result['data']['password'] = $decryptedPassword;
    }


    $result['data']['metatags'] = $jsonData;
    $returnData['data'] = $result['data'];

    //passwords
    $query = "SELECT * FROM passwords WHERE loginID=?";
    $parameters = array($data['dbId']);
    $result = $db->fetchTable($query, $parameters);
    foreach ($result['data'] as $key => $value) {
        //decrypt password name
        $decryptedName = Crypt::decryptString($result['data'][$key]['name']);
        if ($decryptedName === false) {
            testTakersPasswordHandlingError($returnData, $uiLang);
            return;
        }
        $result['data'][$key]['name'] = $decryptedName;
        $metadata = json_decode($result['data'][$key]['options'] ?? '', true);
        $result['data'][$key]['metadata'] = is_array($metadata) ? $metadata : new stdClass();
        //check if activity has been logged
        $subQuery = "SELECT * FROM activity WHERE passwordId=?";
        $subParameters = array($result['data'][$key]['id']);
        $subQueryResult = $db->fetchRow($subQuery, $subParameters);
        if (($subQueryResult['rows'] > 0)) {
            $result['data'][$key]['dataPresent'] = true;
        } else {
            $result['data'][$key]['dataPresent'] = false;
        }
    }
    ttResolvePasswordPreviewStructures($result['data'], $db, $uiLang);
    $returnData['passwords'] = $result['data'];
    $returnData['activityData'] = ttFetchTesteeActivityData((int)$data['dbId'], $db);
    if (($returnData['data']['template'] ?? '') === 'template') {
        $cloneIds = ttFetchTemplateCloneIds((int)$data['dbId'], $db);
        $returnData['templateCloneSummary'] = ttFetchTemplateCloneSummary((int)$data['dbId'], $db);
        $returnData['previewResultStats'] = ttFetchPreviewResultStats($cloneIds, $db, $uiLang, ttFetchTemplateAssignedTestIds((int)$data['dbId'], $db));
    } else {
        $returnData['templateCloneSummary'] = null;
        $returnData['previewResultStats'] = ttFetchTesteePreviewResultStats((int)$data['dbId'], $db, $uiLang);
    }
}


function search($data, &$db, &$returnData)
{
    /* @var $db rixPDO */
    checkParams($data, array('searchString'));
	    $searchString = oasysLikeContainsPattern((string)$data['searchString']);

	    $query = "SELECT CONCAT('f', id) as id, id as 'dbId', parent as pathId, CONCAT('f', parent) as pid, 'folder' as type, NULL as loginType, `name`, `name` as label, `name` as sortKey, NULL as subresult, NULL as subresultvalue FROM loginsFolders WHERE name LIKE ? ESCAPE '=' AND NOT ISNULL(parent) UNION SELECT CONCAT('t', id) as id, id as 'dbId', parent as pathId, CONCAT('f', parent) as pid, template as type, loginType as loginType, `name`, `name` as label, `name` as sortKey, CASE WHEN CAST(id AS CHAR) LIKE ? ESCAPE '=' THEN 'ID: ' WHEN displayName IS NOT NULL THEN 'Display name: ' ELSE NULL END as subresult, CASE WHEN CAST(id AS CHAR) LIKE ? ESCAPE '=' THEN CAST(id AS CHAR) ELSE displayName END as subresultvalue FROM logins WHERE template <> 'cloned' AND parent IS NOT NULL AND (name LIKE ? ESCAPE '=' OR displayName LIKE ? ESCAPE '=' OR CAST(id AS CHAR) LIKE ? ESCAPE '=') ORDER BY name";

		$parameters = array($searchString, $searchString, $searchString, $searchString, $searchString, $searchString);
		$result = $db->fetchTable($query, $parameters);

		// permission checking and filtering
		global $permAuth, $myAuth;
		foreach ($result['data'] as $key => &$value) {

			$hasRead = false; // set default starting value for access

        if ($value['type'] === 'testee' || $value['type'] === 'template') $hasRead = $permAuth->permCheck(['remCall' => true, 'fid' => $value['pathId'], 'action' => 'search']);
			if ($value['type'] === 'folder') $hasRead = $permAuth->permCheck(['remCall' => true, 'fid' => intVal($value['dbId']), 'action' => 'search']);

        if ($value['type'] === 'testee' || $value['type'] === 'template') $canwrite = $permAuth->permCheck(['remCall' => true, 'fid' => $value['pathId'], 'action' => 'deleteItem']);
        if ($value['type'] === 'folder' ) $canwrite = $permAuth->permCheck(['remCall' => true, 'fid' => intVal($value['dbId']), 'action' => 'deleteItem']);

			$value['canWrite'] = $canwrite ?? false;

			// remove any values which do not have the proper permission
			if ($hasRead !== true) {
				unset($result['data'][$key]);
			}
		}

		// reindex results array
		$result['data'] = array_values($result['data']);

		$returnData['data']['list'] = $result['data'];
		if (count($returnData['data']['list']) > 0) {
			foreach ($returnData['data']['list'] as $key => $row) {
				$returnData['data']['list'][$key]['path'] = pathToString(fetchPath($row['pathId'], $returnData, $db));
			}
		}
		$returnData['data']['searchString'] = $data['searchString'];
	}

function fetchMetaTagSuggestions(array $data, rixPDO &$db, array &$returnData): void
{
    $returnData['suggestions'] = ttCollectMetaTagSuggestions($db);
}

function metaSearch(array $data, rixPDO &$db, array &$returnData): void
{
    global $permAuth;
    $keyTerm = trim((string)($data['key'] ?? ''));
    $valueTerm = trim((string)($data['value'] ?? ''));
    $exact = !empty($data['exact']);
    $singleOnly = !empty($data['singleOnly']);
    $list = [];
    $rows = $db->fetchTable("SELECT id, parent, name, displayName, template, loginType, info FROM logins WHERE info IS NOT NULL AND info <> '' AND parent IS NOT NULL AND template <> 'cloned'")['data'] ?? [];
    foreach ($rows as $row) {
        if ($permAuth->permCheck(['remCall' => true, 'fid' => (int)$row['parent'], 'action' => 'search']) !== true) continue;
        $match = ttMetaInfoMatch($row['info'], $keyTerm, $valueTerm, $exact, $singleOnly);
        if ($match === null) continue;
        $list[] = [
            'id' => 't' . $row['id'],
            'dbId' => (int)$row['id'],
            'pathId' => (int)$row['parent'],
            'pid' => 'f' . $row['parent'],
            'type' => $row['template'],
            'loginType' => $row['loginType'],
            'name' => $row['name'],
            'label' => $row['name'],
            'sortKey' => $row['name'],
            'subresult' => $match['label'],
            'subresultvalue' => $match['value'],
            'canWrite' => $permAuth->permCheck(['remCall' => true, 'fid' => (int)$row['parent'], 'action' => 'deleteItem'])
        ];
    }
    foreach ($list as $key => $row) {
        $list[$key]['path'] = pathToString(fetchPath($row['pathId'], $returnData, $db));
    }
    $returnData['data']['list'] = $list;
    $returnData['data']['searchString'] = ttMetaSearchLabel($keyTerm, $valueTerm, $singleOnly);
}

function ttCollectMetaTagSuggestions(rixPDO &$db): array
{
    global $permAuth, $myAuth;
    $suggestions = ['keys' => [], 'values' => [], 'singleTags' => []];
    $sources = [
        ['query' => "SELECT parent, info FROM tests WHERE info IS NOT NULL AND info <> ''", 'module' => 'tests', 'folderTable' => 'testFolders'],
        ['query' => "SELECT parent, info FROM logins WHERE info IS NOT NULL AND info <> '' AND parent IS NOT NULL AND template <> 'cloned'", 'module' => 'testTakers', 'folderTable' => 'loginsFolders'],
        ['query' => "SELECT parent, info FROM itemGroups WHERE info IS NOT NULL AND info <> ''", 'module' => 'items', 'folderTable' => 'itemFolders']
    ];
    foreach ($sources as $source) {
        $rows = $db->fetchTable($source['query'])['data'] ?? [];
        foreach ($rows as $row) {
            $oldSrcRef = $permAuth->srcRef;
            $permAuth->srcRef = $source['module'];
            $hasRead = $myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin();
            if (!$hasRead) {
                $owner = $db->fetchValue("SELECT `owner` FROM `{$source['folderTable']}` WHERE id = ?", [(int)$row['parent']])['data'] ?? null;
                $hasRead = ((int)$owner === (int)$myAuth->userid) || $permAuth->getAccessVal($source['module'], 'fetchLibrary', 'itemObject', (int)$row['parent']);
            }
            $permAuth->srcRef = $oldSrcRef;
            if ($hasRead !== true) continue;
            ttMetaSuggestionAdd($suggestions, $row['info']);
        }
    }
    ttMetaSuggestionSort($suggestions);
    return $suggestions;
}

function ttMetaSuggestionAdd(array &$suggestions, ?string $info): void
{
    $decoded = json_decode($info ?? '', true);
    if (!is_array($decoded)) return;
    foreach ($decoded as $key => $value) {
        if (!is_scalar($value) && $value !== null) continue;
        $value = (string)($value ?? '');
        $suggestions['keys'][$key] = true;
        if ($value === '') {
            $suggestions['singleTags'][$key] = true;
        } else {
            if (!isset($suggestions['values'][$key])) $suggestions['values'][$key] = [];
            $suggestions['values'][$key][$value] = true;
        }
    }
}

function ttMetaSuggestionSort(array &$suggestions): void
{
    $suggestions['keys'] = array_keys($suggestions['keys']);
    $suggestions['singleTags'] = array_keys($suggestions['singleTags']);
    sort($suggestions['keys']);
    sort($suggestions['singleTags']);
    foreach ($suggestions['values'] as $key => $values) {
        $suggestions['values'][$key] = array_keys($values);
        sort($suggestions['values'][$key]);
    }
}

function ttMetaInfoMatch(?string $info, string $keyTerm, string $valueTerm, bool $exact, bool $singleOnly): ?array
{
    $decoded = json_decode($info ?? '', true);
    if (!is_array($decoded)) return null;
    foreach ($decoded as $key => $value) {
        if (!is_scalar($value) && $value !== null) continue;
        $value = (string)($value ?? '');
        $isSingle = $value === '';
        if ($singleOnly && !$isSingle) continue;
        if ($keyTerm !== '' && !ttMetaTextMatches($key, $keyTerm, $exact)) continue;
        if ($valueTerm !== '' && !ttMetaTextMatches($value, $valueTerm, $exact)) continue;
        if ($keyTerm === '' && $valueTerm === '' && !$singleOnly) continue;
        return [
            'label' => $isSingle ? 'Single tag: ' : 'Meta tag: ',
            'value' => $isSingle ? $key : $key . ' = ' . $value
        ];
    }
    return null;
}

function ttMetaTextMatches(string $value, string $term, bool $exact): bool
{
    return $exact ? strcasecmp($value, $term) === 0 : stripos($value, $term) !== false;
}

function ttMetaSearchLabel(string $keyTerm, string $valueTerm, bool $singleOnly): string
{
    $parts = [];
    if ($keyTerm !== '') $parts[] = $keyTerm;
    if ($valueTerm !== '') $parts[] = $valueTerm;
    if ($singleOnly) $parts[] = 'single tags';
    return implode(' / ', $parts);
}

	function testsSearch($data, &$db, &$returnData)
	{
		/* @var $db rixPDO */
		if (($data['searchMode'] ?? '') === 'meta') {
			ttTestsMetaSearch($data, $db, $returnData);
			return;
		}

		checkParams($data, array('searchString'));
			$searchString = oasysLikeContainsPattern((string)$data['searchString']);

		global $permAuth;
		global $uiLang;

			$query = "SELECT CONCAT('f',id) as id, id as 'dbId', parent as pathId, CONCAT('f', parent) as pid, 'folder' as type, `name`, `name` as label, `name` as sortKey, 'folder' as testType, NULL AS subresult, NULL AS subresultvalue FROM testFolders WHERE name LIKE ? ESCAPE '=' AND NOT ISNULL(parent) UNION SELECT CONCAT('t',id) as id, id as 'dbId', parent, CONCAT('f', parent) as pid, 'test' as type, `name`, `name` as label, `name` as sortKey, `structure` as testType, CASE WHEN CAST(id AS CHAR) LIKE ? ESCAPE '=' THEN 'ID: ' ELSE NULL END AS subresult, CASE WHEN CAST(id AS CHAR) LIKE ? ESCAPE '=' THEN CAST(id AS CHAR) ELSE NULL END AS subresultvalue FROM tests WHERE name LIKE ? ESCAPE '=' OR CAST(id AS CHAR) LIKE ? ESCAPE '=' ORDER BY name";
		$parameters = array($searchString, $searchString, $searchString, $searchString, $searchString);
		$result = $db->fetchTable($query, $parameters);
		$returnData['data']['list'] = $result['data'];

		///check the items & stimuli for matches
		$query = "SELECT id, structure FROM tests";
		$parameters = array();
		$result = $db->fetchTable($query, $parameters);

		foreach ($result['data'] as $key => $row) {
			$jsonData = json_decode($row['structure'] ?? '', true);
			if ($jsonData != null) {
				//fetching parent data (Test)
				$query = "SELECT CONCAT('t',id) as id, id as 'dbId', parent as pathId, CONCAT('f', parent) as pid, 'test' as type, `name`, `name` as label, `name` as sortKey, `structure` as testType FROM tests WHERE id = ? LIMIT 1";
				$parameters = array($row['id']);
				$resParent = $db->fetchRow($query, $parameters);
				foreach ($jsonData['items'] as $k => $r) {
					$query = "SELECT items.name FROM items WHERE id = ? AND name LIKE ? ESCAPE '=' LIMIT 1";
					$parameters = array($r['hiddenID'], $searchString);
					$res = $db->fetchRow($query, $parameters);
					if (count($res['data']) > 0) {
						$resParent['data']['subresult'] = $uiLang->translate('Test page name: ');
						$resParent['data']['subresultvalue'] = $res['data']['name'];
						array_push($returnData['data']['list'], $resParent['data']);
					}
					$query = "SELECT items.itemCode FROM items WHERE id = ? AND itemCode LIKE ? ESCAPE '=' LIMIT 1";
					$parameters = array($r['hiddenID'], $searchString);
					$res = $db->fetchRow($query, $parameters);

					if (count($res['data']) > 0) {
						$resParent['data']['subresult'] = $uiLang->translate('Test page code: ');
						$resParent['data']['subresultvalue'] = $res['data']['itemCode'];
						array_push($returnData['data']['list'], $resParent['data']);
					}
					$query = "SELECT items.id FROM items WHERE id = ? AND CAST(id AS CHAR) LIKE ? ESCAPE '=' LIMIT 1";
					$parameters = array($r['hiddenID'], $searchString);
					$res = $db->fetchRow($query, $parameters);
					if (count($res['data']) > 0) {
						$resParent['data']['subresult'] = $uiLang->translate('Test page ID: ');
						$resParent['data']['subresultvalue'] = (string)$res['data']['id'];
						array_push($returnData['data']['list'], $resParent['data']);
					}
				}
			}
		}

		foreach ($returnData['data']['list'] as $key => $value) {

			$hasRead = false; // set default starting value for access

			if ($value['type'] === 'test') $hasRead = $permAuth->permCheck(['remCall' => true, 'fid' => $value['pathId']]);
			if ($value['type'] === 'folder') $hasRead = $permAuth->permCheck(['remCall' => true, 'fid' => intVal($value['dbId'])]);

			// remove any values which do not have the proper permission
			if ($hasRead !== true) {
				unset($returnData['data']['list'][$key]);
			}
		}

		// reindex results array
		$returnData['data']['list'] = array_values($returnData['data']['list']);


		for ($i = 0; $i < count($returnData['data']['list']); $i++) {
			$decodedType = json_decode($returnData['data']['list'][$i]['testType'] ?? '', true);

			if (is_array($decodedType) && isset($decodedType['type'])) {
				$returnData['data']['list'][$i]['testType'] = $decodedType['type'];
			} //else keep original value
		}

		if (count($returnData['data']['list']) > 0) {
			foreach ($returnData['data']['list'] as $key => $row) {
				$returnData['data']['list'][$key]['path'] = pathToString(fetchTestsPath($row['pathId'], $returnData, $db));
			}
		}
		$returnData['data']['searchString'] = $data['searchString'];
	}

function ttTestsMetaSearch(array $data, rixPDO &$db, array &$returnData): void
{
    global $permAuth;
    $keyTerm = trim((string)($data['key'] ?? ''));
    $valueTerm = trim((string)($data['value'] ?? ''));
    $exact = !empty($data['exact']);
    $singleOnly = !empty($data['singleOnly']);
    $list = [];
    $rows = $db->fetchTable("SELECT id, parent, name, structure, info FROM tests WHERE info IS NOT NULL AND info <> ''")['data'] ?? [];
    foreach ($rows as $row) {
        if ($permAuth->permCheck(['remCall' => true, 'fid' => (int)$row['parent']]) !== true) continue;
        $match = ttMetaInfoMatch($row['info'], $keyTerm, $valueTerm, $exact, $singleOnly);
        if ($match === null) continue;
        $structure = json_decode($row['structure'] ?? '', true);
        $list[] = [
            'id' => 't' . $row['id'],
            'dbId' => (int)$row['id'],
            'pathId' => (int)$row['parent'],
            'pid' => 'f' . $row['parent'],
            'type' => 'test',
            'name' => $row['name'],
            'label' => $row['name'],
            'sortKey' => $row['name'],
            'testType' => is_array($structure) && !empty($structure['type']) ? $structure['type'] : 'linear',
            'subresult' => $match['label'],
            'subresultvalue' => $match['value']
        ];
    }
    foreach ($list as $key => $row) {
        $list[$key]['path'] = pathToString(fetchTestsPath($row['pathId'], $returnData, $db));
    }
    $returnData['data']['list'] = $list;
    $returnData['data']['searchString'] = ttMetaSearchLabel($keyTerm, $valueTerm, $singleOnly);
}

# ------------------------------------------------------ #
# Recursive folder checking for various action functions #
# ------------------------------------------------------ #
	function recurs_perm_check(array $obj, rixPDO &$db, string $action)
	{
		global $permAuth;
		global $uiLang;
		$movTarg = 0;
		foreach ($obj as $fItem) {
			if (isset($fItem['target'])) $movTarg = intval($fItem['target']);
			$fPermRes = $permAuth->permCheck(["remCall" => true, "fid" => $fItem['dbId'], 'target' => $movTarg ?? ""]);
			if ($fPermRes !== true) {
				global $myAuth, $returnData;
				$returnData['error'] = $uiLang->translate("You do not have permission to perform the requested function on this or these object(s). An item or items within this path were found which you may not remove.");
				$myAuth->writeLogEntry("ACCOUNT RESTRICTION: Attempted operation without item rights on entry:[" . basename(__FILE__) . "🡆{$action}]");
				exit;
			}

			$res = $db->fetchTable("SELECT `id` AS `dbId`, `owner`, $movTarg AS 'target' FROM `loginsFolders` WHERE `parent` = ? ", [$fItem['dbId']]);
			if (!($res['rows'] === 0)) {
				recurs_perm_check($res['data'], $db, $action);
			}

			// FYI: this section not in use while we have folder based permission checking only
			// post-recursion itemgroup checking code (loops on all itemgroups in folder)
			/* $res2 = $db->fetchTable("SELECT `id`, `owner` FROM `itemGroups` WHERE `parent` = ?", [$fItem['dbId']]);

				foreach ($res2['data'] as $key => $igItem) {
					if (!$permAuth->permCheck(["type" => "itemGroup", "iid" => $igItem['id']])) {
						global $myAuth, $returnData;
						$returnData['error'] = "<br>You do not have permission to perform the requested function on this or these object(s). An item within this path were found which you may not remove.";
						$myAuth->writeLogEntry("ACCOUNT RESTRICTION: Attempted operation without item rights on entry:[" . basename(__FILE__) . "🡆{$action}]");
						exit;
					}
				} */
		}
	}

# -------------------------------------------------------------- #
# Recursive folder checking collecting all file IDs (test taker) #
# -------------------------------------------------------------- #
	function recursiveCollectTtFileIds($folder, rixPDO &$db, string $action)
	{

		$fileIds = [];
		// Retrieve all files in the current folder
		$query = "SELECT * FROM logins WHERE parent=?";
		$parameters = array($folder);
		$result = $db->fetchTable($query, $parameters);

		if (!empty($result['data'])) {
			foreach ($result['data'] as $item) {
				$fileIds[] = $item['id'];
			}
		}

		// Retrieve all subfolders of the current folder
		$query = "SELECT * FROM loginsFolders WHERE parent=?";
		$parameters = array($folder);
		$result = $db->fetchTable($query, $parameters);
		if (!empty($result['data'])) {
			foreach ($result['data'] as $subfolder) {
				$subfolderId = $subfolder['id'];
				$subfolderFileIds = recursiveCollectTtFileIds($subfolderId, $db, $action);
				$fileIds = array_merge($fileIds, $subfolderFileIds);
			}
		}
		return $fileIds;
	}


	function deleteSelection($data, &$db, &$returnData)
	{
		/* @var $db rixPDO */
		checkParams($data, array('location', 'selection'));
		$location = $data['location'];
		$selection = $data['selection'];
		$groupClause = '';
		$folderClause = '';
		$folders = array();
		$groups = array();

		// Start our call into recursive permission checking function
		foreach ($selection as $key => $selItem) {
			if ($selItem['type'] === "folder") {
				global $action;
				recurs_perm_check([$selItem], $db, $action);
			}
		}

		foreach ($selection as $row) {
			if ($row['type'] == 'folder') {
				$folders[] = $row['dbId'];
				if ($folderClause != '') {
					$folderClause .= ' OR ';
				}
				$folderClause .= 'id=?';
			} else {
				$groups[] = $row['dbId'];
				if ($groupClause != '') {
					$groupClause .= ' OR ';
				}
				$groupClause .= 'id=?';
			}
		}
        $templateIds = array();
        foreach ($groups as $groupId) {
            $template = $db->fetchRow("SELECT id FROM logins WHERE id=? AND template='template' LIMIT 1", [$groupId]);
            if (($template['rows'] ?? 0) > 0) $templateIds[] = (int)$groupId;
        }
        foreach ($folders as $folderId) {
            foreach (recursiveCollectTtFileIds((int)$folderId, $db, 'deleteSelection') as $fileId) {
                $template = $db->fetchRow("SELECT id FROM logins WHERE id=? AND template='template' LIMIT 1", [$fileId]);
                if (($template['rows'] ?? 0) > 0) $templateIds[] = (int)$fileId;
            }
        }
        if ($db->startTransaction() !== true) {
            $returnData['error'] = 'Unable to start deletion transaction.';
            return;
        }
        try {
            ttDeleteTemplateClones($templateIds, $db);
            ttAssertDbSuccess($db, 'Unable to delete template datasets.');
		    if (count($folders) > 0) {
			    $db->prepare("DELETE FROM loginsFolders WHERE " . $folderClause);
			    $db->executePrepared($folders);
                ttAssertDbSuccess($db, 'Unable to delete the selected folders.');
		    }
		    if (count($groups) > 0) {
			    $db->prepare("DELETE FROM logins WHERE " . $groupClause);
			    $db->executePrepared($groups);
                ttAssertDbSuccess($db, 'Unable to delete the selected test takers.');
		    }
            if ($db->commit() !== true) throw new RuntimeException('Unable to commit deletion.');
        } catch (Throwable $e) {
            $db->rollback();
            $returnData['error'] = $e->getMessage();
            return;
        }

		// log action
		global $myAuth;
		$myAuth->prepLog($data, "delSelection", $returnData);

		fetchLibrary($data, $db, $returnData);
	}

    function deleteTemplateClone($data, &$db, &$returnData)
    {
        global $uiLang, $myAuth;
        /* @var $db rixPDO */
        checkParams($data, array('id', 'cloneId', 'location'));

        $templateId = (int)$data['id'];
        $cloneId = (int)$data['cloneId'];

        $clone = $db->fetchRow(
            "SELECT id, name FROM logins WHERE id=? AND template='cloned' AND parentTemplateId=? LIMIT 1",
            [$cloneId, $templateId]
        );
        if (($clone['rows'] ?? 0) === 0) {
            $returnData['error'] = $uiLang->translate("The recorded dataset has already been deleted. The view will be refreshed.");
            return;
        }

        $db->prepare("DELETE FROM logins WHERE id=?");
        $db->executePrepared(array($cloneId));

        $myAuth->prepLog([
            "templateId" => $templateId,
            "selection" => [[
                "id" => "t" . $cloneId,
                "dbId" => $cloneId,
                "name" => $clone['data']['name']
            ]]
        ], "delSelection", $returnData);
        fetchTest(array('dbId' => $templateId, 'location' => (int)$data['location']), $db, $returnData);
    }

	function moveObjects($data, &$db, &$returnData)
	{
		global $uiLang;
		/* @var $db rixPDO */
		checkParams($data, array('location', 'sources', 'target'));
		$location = $data['location'];
		$objects = $data['sources'];
		$target = $data['target'];
		$folders = $objects['folders'];
		$tests = $objects['tests'];
		$updates = array('parent' => $target);

		/* log original source data before update for logging purposes; */

		$data['origInfo'] = '';
		$targName = $db->fetchValue("SELECT `name` FROM `loginsFolders` WHERE `id` = ?", [$target])['data'];

		foreach ($data['sources']['folders'] as $k0 => $v0) {
			$origInfo = $db->fetchRow("SELECT `parent`, `name` FROM `loginsFolders` WHERE `id` = ?", [$v0])['data'];
			$origFldName = $db->fetchValue("SELECT `name` FROM `loginsFolders` WHERE `id` = ?", [$origInfo['parent']])['data'];
			$data['origInfo'] .= "\tFolder ID [{$v0}] ({$origInfo['name']}) original location: [{$origInfo['parent']}] ({$origFldName}) TO: Folder ID [{$target}] ({$targName})\n";
		}

		foreach ($data['sources']['tests'] as $k1 => $v1) {
			$origInfo = $db->fetchRow("SELECT `parent`, `name` FROM `logins` WHERE `id` = ?", [$v1])['data'];
			$origFldName = $db->fetchValue("SELECT `name` FROM `loginsFolders` WHERE `id` = ?", [$origInfo['parent']])['data'];
			$data['origInfo'] .= "\tLogin ID [{$v1}] ({$origInfo['name']}) original location: [{$origInfo['parent']}] ({$origFldName}) TO: Folder ID [{$target}] ({$targName})\n";
		}

		// strip last linebreak char from string
		$data['origInfo'] = rtrim($data['origInfo'], "\n");

		/* end logging routine */


		// If we're moving an entire folder branch, we have to perform a recursive check to ensure subfolders have move rights for the user
		if (isset($data['sources']['folders'])) {
			foreach ($data['sources']['folders'] as $key => $selItem) {
				global $action;
				recurs_perm_check([['dbId' => $selItem, 'target' => $target]], $db, $action);
			}
		}

		//Check if the target folder has been deleted by another user
		$query = "SELECT * FROM loginsFolders WHERE id=? LIMIT 1";
		$parameters = array($target);
		$result = $db->fetchRow($query, $parameters);

		//Show error message if target folder is not availabe anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("The target folder you are trying to move/copy objects to has been deleted by another user. The view will be refreshed.");
			$returnData['reloadFolder'] = true;
			die();
		}

		//Check if one or more of the selected objects have been deleted by another user
		foreach ($folders as $folder) {
			$query = "SELECT * FROM loginsFolders WHERE id=? LIMIT 1";
			$parameters = array($folder);
			$result = $db->fetchRow($query, $parameters);
			//Show error message if a folder is not availabe anymore
			if ($result['rows'] === 0) {
				$returnData['error'] = $uiLang->translate("One or more folders you are trying to move have been deleted by another user. The view will be refreshed.");
				$returnData['reloadFolder'] = true;
				die();
			}
		}
		foreach ($tests as $test) {
			$query = "SELECT * FROM logins WHERE id=? LIMIT 1";
			$parameters = array($test);
			$result = $db->fetchRow($query, $parameters);
			//Show error message if a testee is not availabe anymore
			if ($result['rows'] === 0) {
				$returnData['error'] = $uiLang->translate("One or more test takers you are trying to move have been deleted by another user. The view will be refreshed.");
				$returnData['reloadFolder'] = true;
				die();
			}
		}

		if (count($folders) > 0) {
			foreach ($folders as $folder) {
				$returnData['db'][] = array('folder' => $folder, 'target' => $target);
				if (checkPath($target, $db, $folder) === false) {
					$returnData['error'] = $uiLang->translate('You are not able to move a folder into itself!');
					die();
				} else {
					$name = checkExisting('loginsFolders', $folder, $target, $db);
					$db->prepare("UPDATE loginsFolders SET parent=?, name=? WHERE id=?");
					$db->executePrepared(array($target, $name, $folder));
				}
			}
		}
		if (count($tests) > 0) {
			foreach ($tests as $test) {
				$name = fetchName('logins', $test, $target, $db);
				$db->prepare("UPDATE logins SET parent=?, name=? WHERE id=?");
				$db->executePrepared(array($target, $name, $test));
			}
		}

		// log action
		global $myAuth;
		$myAuth->prepLog($data, 'moveObjects', $returnData);

		fetchLibrary($data, $db, $returnData);
	}

	function duplicateObjects($data, &$db, &$returnData)
	{
		global $uiLang;
		/* @var $db rixPDO */
		checkParams($data, array('location', 'sources', 'target'));
		$location = $data['location'];
		$objects = $data['sources'];
		$target = $data['target'];
		$folders = $objects['folders'];
		$tests = $objects['tests'];

		// recursive copy (folder)
		function recursive_copyfunc($id, $pid, &$db)
		{
			/* @var $db rixPDO */
			//Tests in folder
			$id = (int)$id;
			$pid = (int)$pid;
			$query = "SELECT id FROM logins WHERE parent=?";
			$parameters = array($id);
			$result = $db->fetchTable($query, $parameters);
			if (!empty($result['data'])) {
				foreach ($result['data'] as $test) {
					$db->prepare("INSERT INTO logins (`name`, `overrides`, `parent`, `template`, `loginType`, `parentTemplateId`, `password`, `info`, `displayName`) SELECT `name`, `overrides`, " . $pid . " as parent, `template`, `loginType`, NULL, `password`, `info`, `displayName` FROM logins WHERE id=?");
					$db->executePrepared(array($test['id']));
                    ttAssertDbSuccess($db, 'Unable to duplicate a nested test taker.');
                    $newLoginId = (int)$db->results()['id'];
                    $db->prepare("INSERT INTO passwords (`loginID`, `structure`, `name`, `tag`, `label`, `options`) SELECT ?, `structure`, `name`, `tag`, `label`, `options` FROM passwords WHERE loginID=?");
                    $db->executePrepared(array($newLoginId, $test['id']));
                    ttAssertDbSuccess($db, 'Unable to duplicate nested passwords.');
				}
			}
			//Folders in folder
			$query = "SELECT id FROM loginsFolders WHERE parent=?";
			$parameters = array($id);
			$result = $db->fetchTable($query, $parameters);
			if (!empty($result['data'])) {
				foreach ($result['data'] as $folder) {
					/** @noinspection SqlInsertValues */
					global $myAuth;
					$db->prepare("INSERT INTO loginsFolders (`name`, `parent`, `owner`) SELECT `name`, ?, ? FROM loginsFolders WHERE id=?");
					$db->executePrepared(array($pid, $myAuth->userid, $folder['id']));
                    ttAssertDbSuccess($db, 'Unable to duplicate a nested folder.');
					$result = $db->results();
					recursive_copyfunc($folder['id'], $result['id'], $db);
				}
			}
		}

		//Folders
		/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
		/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
		// Recursive folder duplication currently not used due to filer settings, leaving it in until final decisions are made
		/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
		/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

		if ($db->startTransaction() !== true) {
            $returnData['error'] = 'Unable to start duplication transaction.';
            return;
        }
        try {
		foreach ($folders as $folder) {
			if (checkPath($target, $db, $folder) === false) {
				$returnData['error'] = 'You are not able to copy a folder into itself!';
				die();
			} else {
				$name = checkExisting('loginsFolders', $folder, $target, $db);
				global $myAuth;
				$db->prepare("INSERT INTO loginsFolders (`name`, `parent`, `owner`) VALUES (?, ?, ?)");
				$db->executePrepared(array($name, $target, $myAuth->userid));
                ttAssertDbSuccess($db, 'Unable to duplicate the selected folder.');
				$result = $db->results();
				recursive_copyfunc($folder, $result['id'], $db);
			}
		}
		//Tests
		foreach ($tests as $test) {
			$name = checkExisting('logins', $test, $target, $db);
			$db->prepare("INSERT INTO logins (`name`, `overrides`, `parent`, `template`, `loginType`, `parentTemplateId`, `password`, `info`, `displayName`) SELECT ? as name, `overrides`, ? as parent, `template`, `loginType`, NULL, `password`, `info`, `displayName` FROM logins WHERE id=?");
			$db->executePrepared(array($name, $target, $test));
			ttAssertDbSuccess($db, 'Unable to duplicate the selected test taker.');
			$result = $db->results();
			//duplicating the passwords as well for the duplicated testee
			$db->prepare("INSERT INTO passwords SELECT NULL as id, ? as loginID, structure, name, tag, label, options FROM passwords WHERE loginID=?");
			$db->executePrepared(array($result['id'], $test));
			ttAssertDbSuccess($db, 'Unable to duplicate passwords.');
		}
		if ($db->commit() !== true) throw new RuntimeException('Unable to commit duplication.');
        } catch (Throwable $e) {
            $db->rollback();
            $returnData['error'] = $e->getMessage();
            return;
        }
		fetchLibrary($data, $db, $returnData);
	}

	function fetchTestStructure($data, &$db, &$returnData)
	{
		global $uiLang;
		/* @var $db rixPDO */
		checkParams($data, array('dbId'));
		$query = "SELECT * FROM tests WHERE id=? LIMIT 1";
		$parameters = array($data['dbId']);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if test is not availabe anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("The test you have selected has been deleted by another user. Please select another test.");
			$returnData['reloadFolder'] = true;
			die();
		}

		//json block for structure
		$jsonData = json_decode($result['data']['structure'] ?? '', true);
		if ($jsonData == null) {
			$returnData['error'] = $uiLang->translate("There is a problem with your database structure. Please contact the administrator!");
			die();
		} else {
			$result['data']['structure'] = array('type' => $jsonData['type'], 'items' => array());
			foreach ($jsonData['items'] as $value) {
				if ($jsonData['type'] == 'fluid') {
					$query = "SELECT testPools.`name` AS name, testFluidStructure.numberOfItems FROM testFluidStructure INNER JOIN testPools ON testPools.id = testFluidStructure.poolID WHERE testFluidStructure.id=? LIMIT 1";
					$parameters = array($value['hiddenID']);
					$queryResult = $db->fetchRow($query, $parameters);
					if ($queryResult['rows'] === 0) {
						$itemArray = array('name' => 'Invalid testblock!', 'hiddenID' => $value['hiddenID'], 'numberOfItems' => '-');
					} else {
						$itemArray = array('name' => $queryResult['data']['name'], 'hiddenID' => $value['hiddenID'], 'numberOfItems' => $queryResult['data']['numberOfItems']);
					}
					array_push($result['data']['structure']['items'], $itemArray);
				} else if ($jsonData['type'] == 'mutation') {
					$query = "SELECT tests.`name` AS name, JSON_LENGTH(JSON_EXTRACT(structure, '$.items')) as structCount FROM tests WHERE tests.id=? LIMIT 1";
					$parameters = array($value['hiddenID']);
					$queryResult = $db->fetchRow($query, $parameters);
					if ($queryResult['rows'] === 0) {
						$itemArray = array('name' => 'Invalid test!', 'hiddenID' => $value['hiddenID'], 'structCount' => '-');
					} else {
						$itemArray = array('name' => $queryResult['data']['name'], 'hiddenID' => $value['hiddenID'], 'structCount' => $queryResult['data']['structCount']);
					}
					array_push($result['data']['structure']['items'], $itemArray);
				} else {
					$query = "SELECT * FROM items WHERE id=? LIMIT 1";
					$parameters = array($value['hiddenID']);
					$queryResult = $db->fetchRow($query, $parameters);
					if ($queryResult['rows'] === 0) {
						$itemArray = array('name' => 'Invalid test page!', 'hiddenID' => $value['hiddenID'], 'code' => '-');
					} else {
						$itemArray = array('name' => $queryResult['data']['name'], 'hiddenID' => $value['hiddenID'], 'code' => $queryResult['data']['itemCode']);
					}
					array_push($result['data']['structure']['items'], $itemArray);
				}
			}
		}
		$returnData['data'] = $result['data'];
	}

	function renameTestOrFolder($data, &$db, &$returnData)
	{
		global $uiLang;
		/* @var $db rixPDO */
		checkParams($data, array('name', 'type', 'id', 'location'));

		$location = $data['location'];
		$id = $data['id'];
		$newName['name'] = $data['name'];

		// preserve original name for logging purposes
		$qType = $data['type'] === 'folder' ? "loginsFolders" : "logins";
		$data['origName'] = $db->fetchValue("SELECT `name` FROM {$qType} WHERE `id` = ?", [$id])['data'];

		if ($data['type'] == 'folder') {
			$table = "loginsFolders";
			//Check if folder has been deleted or removed by another user
			$query = "SELECT * FROM loginsFolders WHERE id=? LIMIT 1";
			$parameters = array($id);
			$result = $db->fetchRow($query, $parameters);
			//Show error message if selected folder is not availabe anymore
			if ($result['rows'] === 0) {
				$returnData['error'] = $uiLang->translate("The folder you are trying to rename has been deleted by another user. The view will be refreshed.");
				$returnData['reloadFolder'] = true;
				die();
			}
			//Show error message if selected folder has been moved to another folder
			if ($result['data']['parent'] !== $location) {
				$returnData['error'] = $uiLang->translate("The folder you are trying to rename has been moved to a different folder by another user. The new location will be opened.");
				$returnData['reloadFolder'] = true;
				$returnData['openNewLocation'] = true;
				$returnData['openNewLocationId'] = $result['data']['parent'];
				die();
			}

			//verify if a folder with that name already exists on the same level
			$query = "SELECT COUNT(*) as isPresent, id FROM loginsFolders WHERE name=? and parent=?";
			$parameters = array($newName['name'], $location);
			$results = $db->fetchRow($query, $parameters);
			// if the name is already in use:
			if ($results['data']['isPresent'] != 0) {
				//allow cosmetic renaming
				if ($results['data']['id'] !== $id) {
					$returnData['error'] = $uiLang->translate("A folder with that name does already exist. Try using another name.") . $id;
					die();
				};
			}
		} else {
			$table = "logins";
			if (!ttRequireAllowedLoginName(trim((string)$newName['name']), $returnData, $uiLang)) return;
			//Check if testee has been deleted or removed by another user
			$query = "SELECT * FROM logins WHERE id=? LIMIT 1";
			$parameters = array($id);
			$result = $db->fetchRow($query, $parameters);
			//Show error message if selected testee is not availabe anymore
			if ($result['rows'] === 0) {
				$returnData['error'] = $uiLang->translate("The test taker you are trying to rename has been deleted by another user. The view will be refreshed.");
				$returnData['reloadFolder'] = true;
				die();
			}
			//Show error message if selected testee has been moved to another folder
			if ($result['data']['parent'] !== $location) {
				$returnData['error'] = $uiLang->translate("The test taker you are trying to rename has been moved to a different folder by another user. The new location will be opened.");
				$returnData['reloadFolder'] = true;
				$returnData['openNewLocation'] = true;
				$returnData['openNewLocationId'] = $result['data']['parent'];
				die();
			}

			//verify if a login with that name already exists
			$query = "SELECT COUNT(*) as isPresent, id FROM logins WHERE name=?";
			$parameters = array($newName['name']);
			$results = $db->fetchRow($query, $parameters);
			// if the name is already in use:
			if ($results['data']['isPresent'] != 0) {
				//allow cosmetic renaming
				if ($results['data']['id'] !== $id) {
					$returnData['error'] = $uiLang->translate("A test taker with that name does already exist. Try using another name.");
					die();
				}
			}
		}

		$db->update($table, $newName, 'id=?', array($id));
		if ($data['type'] == 'folder') {
			$data['select'] = 'f' . $id;
		} else {
			$data['select'] = 't' . $id;
		}

		// log action
		global $myAuth;
		$myAuth->prepLog($data, "rename", $returnData);

		fetchLibrary($data, $db, $returnData);
	}

	function plausibilityCheck($data, &$db, &$returnData)
	{
		global $uiLang;
		/* @var $db rixPDO */
		checkParams($data, array('id'));

		$id = $data['id'];

		//Check if Testee is still present
		$query = "SELECT * FROM logins WHERE id=? LIMIT 1";
		$parameters = array($id);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if selected testee is not available anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("The test taker you are trying to check has been deleted by another user. The view will be refreshed.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
		}

		//check if there is no password yet
		$query = "SELECT count(*) FROM passwords WHERE loginID=?";
		$parameters = array($id);
		$result = $db->fetchRow($query, $parameters);
		if ($result['data']['count(*)'] == 0) $returnData['noPws'] = true;

		//check if there are passwords with no tests assigned
		$query = "SELECT count(*) FROM passwords WHERE loginID=? AND structure IS NULL";
		$parameters = array($id);
		$result = $db->fetchRow($query, $parameters);
		if ($result['data']['count(*)'] > 0) $returnData['pwsWithoutTests'] = true;

		// check if there are assigned tests which have been deleted
		$query = "SELECT * FROM passwords WHERE loginID=? AND structure IS NOT NULL";
		$parameters = array($id);
		$result = $db->fetchTable($query, $parameters);

		if (count($result['data']) > 0) {

			foreach ($result['data'] as $value) {
				$jsonData = json_decode($value['structure'] ?? '', true);
				foreach ($jsonData as $key => $jsonDataItem) {
					$query = "SELECT count(*) FROM tests WHERE id=?";
					$parameters = array($jsonDataItem['hiddenID']);
					$result = $db->fetchRow($query, $parameters);
					if ($result['data']['count(*)'] < 1) $returnData['pwsWithDeletedTests'] = true;
				}
			}
		}
	}

	/*
	 * helper functions
	 */

function testTakersPasswordHandlingError(&$returnData, $uiLang)
{
    $returnData['error'] = $uiLang->translate("Please contact your system administrator. There is a problem with password handling.");
}

function ttAssertDbSuccess(rixPDO &$db, string $message): void
{
    $result = $db->results();
    if (!empty($result['error'])) {
        throw new RuntimeException($message);
    }
}

function ttPreparePasswordAssignmentStructure($structure): array
{
    if (!is_array($structure)) return array();
    $prepared = array();
    foreach ($structure as $item) {
        if (!is_array($item)) continue;
        unset($item['name']);
        unset($item['ID']);
        unset($item['actionField']);
        unset($item['testType']);
        $prepared[] = $item;
    }
    return $prepared;
}

function ttExtractAssignedTestIds($structure): array
{
    if (!is_array($structure)) return array();
    $ids = array();
    foreach ($structure as $item) {
        if (!is_array($item) || !isset($item['hiddenID'])) continue;
        $testId = (int)$item['hiddenID'];
        if ($testId > 0) $ids[$testId] = $testId;
    }
    return array_values($ids);
}

function ttUserOwnsTestFolder(int $folderId, rixPDO &$db): bool
{
    global $myAuth;
    if ($folderId <= 0) return false;
    $row = $db->fetchRow("SELECT `owner` FROM `testFolders` WHERE `id` = ? LIMIT 1", array($folderId));
    if (!empty($row['error']) || ($row['rows'] ?? 0) === 0) return false;
    return (int)($row['data']['owner'] ?? 0) === (int)$myAuth->userid;
}

function ttCanReadAssignedTest(int $testId, rixPDO &$db): array
{
    global $myAuth, $permAuth;
    static $cache = array();

    if ($testId <= 0) return array(false, 'missing');
    if (!array_key_exists($testId, $cache)) {
        $row = $db->fetchRow("SELECT `parent` FROM `tests` WHERE `id` = ? LIMIT 1", array($testId));
        if (!empty($row['error']) || ($row['rows'] ?? 0) === 0) {
            $cache[$testId] = array(false, 'missing');
        } else {
            $parentId = (int)($row['data']['parent'] ?? 0);
            $hasAccess = ($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin())
                ? true
                : (
                    $permAuth->getAccessVal('tests', 'fetchLibrary', 'itemObject', $parentId)
                    || ttUserOwnsTestFolder($parentId, $db)
                );
            $cache[$testId] = array($hasAccess, $hasAccess ? 'ok' : 'denied');
        }
    }
    return $cache[$testId];
}

function ttValidateAssignedTestAccess($newStructure, $existingStructure, rixPDO &$db, array &$returnData): bool
{
    global $uiLang;
    $newIds = ttExtractAssignedTestIds($newStructure);
    $existingIds = array_flip(ttExtractAssignedTestIds($existingStructure));
    $missing = array();
    $denied = array();

    foreach ($newIds as $testId) {
        if (isset($existingIds[$testId])) continue;
        [$allowed, $reason] = ttCanReadAssignedTest($testId, $db);
        if ($allowed) continue;
        if ($reason === 'missing') {
            $missing[] = $testId;
        } else {
            $denied[] = $testId;
        }
    }

    if (empty($missing) && empty($denied)) return true;

    if (!empty($denied)) {
        $returnData['error'] = $uiLang->translate('One or more selected tests cannot be assigned because you do not have read access.');
        $returnData['errorDetails'] = 'Test ID(s): ' . implode(', ', array_values(array_unique($denied)));
    } else {
        $returnData['error'] = $uiLang->translate('One or more selected tests cannot be assigned because they no longer exist.');
        $returnData['errorDetails'] = 'Test ID(s): ' . implode(', ', array_values(array_unique($missing)));
    }
    return false;
}

function ttValidateAssignedTestAccessMap($structureMap, rixPDO &$db, array &$returnData): bool
{
    if (!is_array($structureMap)) return true;
    if (!empty(ttExtractAssignedTestIds($structureMap))) {
        return ttValidateAssignedTestAccess($structureMap, array(), $db, $returnData);
    }
    foreach ($structureMap as $structure) {
        if (!is_array($structure)) continue;
        if (!ttValidateAssignedTestAccess($structure, array(), $db, $returnData)) return false;
    }
    return true;
}


function prepField($field)
{
    $delimiter = ',';
    $field = $field ?? ''; // Ensure $field is always a string

		if (preg_match("/[\"$delimiter\n]/", $field)) {
			$field = preg_replace('/\"/', '""', $field);
			$field = '"' . $field . '"';
		}
		return $field;
	}

function oasysParseVerFile($txt) {
		$out = [
			'version' => null,
			'vshort' => null,
			'info' => null
		];

		if (preg_match('/^\s*v\s*=\s*([0-9]+(?:\.[0-9]+){1,3})\s*$/mi', $txt, $m)) {
			$out['version'] = $m[1];
		}
		if (preg_match('/^\s*vshort\s*=\s*([0-9]+(?:\.[0-9]+){1,2})\s*$/mi', $txt, $m)) {
			$out['vshort'] = $m[1];
		}
		if (preg_match('/^\s*info\s*=\s*(.*)\s*$/mi', $txt, $m)) {
			$out['info'] = $m[1]; // optional; contains HTML in your example
		}

		return $out;
	}

	/**
	 * Compare major.minor only (vshort semantics), e.g.
	 * 3.5 < 3.6, 3.6 == 3.6, 3.10 > 3.6
	 */
	function oasysCompareMajorMinor($a, $b) {
		$pa = array_map('intval', explode('.', trim((string)$a)));
		$pb = array_map('intval', explode('.', trim((string)$b)));
   		$amaj = $pa[0] ?? 0; $amin = $pa[1] ?? 0;
    	$bmaj = $pb[0] ?? 0; $bmin = $pb[1] ?? 0;

		if ($amaj !== $bmaj) return ($amaj < $bmaj) ? -1 : 1;
		if ($amin !== $bmin) return ($amin < $bmin) ? -1 : 1;
		return 0;
	}


// add "copy X" to already existing tests or testfolders
	function checkExisting($table, $tobecopied, $target, &$db)
	{
		/* @var $db rixPDO */
		$cond = true;
		$i = 1;
		$query = "SELECT name FROM " . $table . " WHERE id=?";
		$parameters = array($tobecopied);
		$result = $db->fetchRow($query, $parameters);
		$nameorigin = $result['data']['name'];
		$name = $nameorigin;
		while ($cond) {
			if ($table == 'logins') {
				$query = "SELECT id FROM " . $table . " WHERE name=?";
				$parameters = array($name);
			} else {
				$query = "SELECT id FROM " . $table . " WHERE parent=? and name=?";
				$parameters = array($target, $name);
			}
			$result = $db->fetchTable($query, $parameters);
			if (!empty($result['data'])) {
				$name = $nameorigin . ' copy ' . $i;
				$i++;
			} else {
				$cond = false;
			}
		}
		return $name;
	}

	function randomString($length)
	{
		$chars = '23456789bcdfghjkmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ';
		$charLength = strlen($chars);
		$randomString = '';
		for ($i = 0; $i < $length; $i++) {
			$randomString .= $chars[rand(0, $charLength - 1)];
		}
		return $randomString;
	}

	function fetchName($table, $tobecopied, $target, &$db)
	{
		/* @var $db rixPDO */
		$query = "SELECT name FROM " . $table . " WHERE id=?";
		$parameters = array($tobecopied);
		$result = $db->fetchRow($query, $parameters);
		$name = $result['data']['name'];
		return $name;
	}

	function fetchPath($location, &$returnData, &$db)
	{
		global $uiLang;
		/* @var $db rixPDO */
		$query = "SELECT name, parent FROM loginsFolders WHERE id=?";
		$parameters = array($location);
		$results = $db->fetchRow($query, $parameters);

		if ($results['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("There was a problem retrieving this path. Please refresh your browser!");
			$returnData['debug']['line'] = __LINE__;
			$returnData['debug']['function'] = __FUNCTION__;
			$returnData['debug']['file'] = __FILE__;
			$returnData['debug']['arguments'] = func_get_args();
			$returnData['debug']['results'] = $results;
			return false;
		}
		if ($results['data']['parent'] !== null) {
			$path = fetchPath($results['data']['parent'], $returnData, $db);
			if ($path === false) {
				return false;
			}
			$path[] = array('name' => $results['data']['name'], 'id' => $location, 'fullname' => $results['data']['name']);
		} else {
			$path = array();
			$path[] = array('name' => $results['data']['name'], 'id' => $location, 'fullname' => $results['data']['name']);
		}
		return $path;
	}

	function fetchTestsPath($location, &$returnData, &$db)
	{
		global $uiLang;
		/* @var $db rixPDO */
		$query = "SELECT name, parent FROM testFolders WHERE id=?";
		$parameters = array($location);
		$results = $db->fetchRow($query, $parameters);

		if ($results['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("There was a problem retrieving this path. Please refresh your browser! If this error message persists inform your administrator.");
			$returnData['debug']['line'] = __LINE__;
			$returnData['debug']['function'] = __FUNCTION__;
			$returnData['debug']['file'] = __FILE__;
			$returnData['debug']['arguments'] = func_get_args();
			$returnData['debug']['results'] = $results;
			return false;
		}
		if ($results['data']['parent'] !== null) {
			$path = fetchTestsPath($results['data']['parent'], $returnData, $db);
			if ($path === false) {
				return false;
			}
			$path[] = array('name' => $results['data']['name'], 'id' => $location);
		} else {
			$path = array();
			$path[] = array('name' => $results['data']['name'], 'id' => $location);
		}
		return $path;
	}

	function pathToString($path)
	{
		if ($path === false) return null;
		if (count($path) == 0) {
			return '/';
		}
		$s = '';
		foreach ($path as $folder) {
			$s .= '/' . $folder['name'];
		}
		return $s;
	}


	/* check if folder with id '$id' is among the parents of $location
		return false if $location is a child of $id or if an error occurs, else return true */
	function checkPath($location, &$db, $id)
	{
		/* @var $db rixPDO */
		$location = (int)$location;
		if ($location === 1) {
			//if we are at the top level we can send back true
			return true;
		}
		if ($location === $id) {
			//if $id === $location return false
			return false;
		}
		$query = "SELECT parent FROM loginsFolders WHERE id=?";
		$parameters = array($location);
		$results = $db->fetchValue($query, $parameters);

		if ($results['rows'] === 0) {
			//if parent does not exist we send false back => error
			return false;
		}
		if ($results['data'] === null) {
			//if we have no parent, but we are not at id===1, this is an orphan => we report an error
			$path = false;
		} else {
			//if there is a parent, we will recursively check that one, too
			$path = checkPath($results['data'], $db, $id);
		}
		return $path;
	}


//checks if mandatory data is present
	function checkParams(&$data, $params)
	{
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
	function encodeData(&$data, $params)
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
	function outputJSON()
	{
		global $returnData, $action;

		// updated username
		global $myAuth;
		$returnData['loggedInName'] = $myAuth->username;

		// always return superadmin and admin permisison values
		$returnData['isSuper'] = $myAuth->checkSA();
		$returnData['isAdmin'] = $myAuth->checkAdmin();

		if (!isset($returnData['action'])) $returnData['action'] = $action;
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
