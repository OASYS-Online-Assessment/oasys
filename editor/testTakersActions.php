<?php

/** @phan-file-suppress PhanUnusedGlobalFunctionParameter, PhanUnusedVariable, PhanRedefineFunction, PhanUnusedClosureParameter, PhanTypeArraySuspiciousNullable, PhanSuspiciousWeakTypeComparison, PhanUnusedVariableValueOfForeachWithKey, PhanUnusedPublicNoOverrideMethodParameter */

/** @noinspection SqlResolve */

//the JSON output will happen, even if a fatal error prevents the script from finishing
register_shutdown_function('outputJSON');
require_once "../inc/php/Crypt.php";
require_once 'inc/php/database.php'; //contains the database connection credentials
require_once '../inc/php/rixPDO.php'; //wrapper around PDO functions (c.f. docs folder for manual)


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
$db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, '../logs/testTakers_errors.txt', 1, $returnData, 'error');

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
if ((in_array($action, ['checkPath', 'checkExisting', 'plausibilityCheck']))) {
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

function fetchLibrary($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */
    checkParams($data, array('location'));
    $location = (int)$data['location'];
    $current = array('folder' => 1, 'path' => 'library');
    if (isset($data['current'])) {
        $current = $data['current'];
    }

    $user = $_SESSION['userid'];
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
        WHERE  parent = ?";

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
			case 'cloned':
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
                if (in_array($item['type'], ['testee', 'template', 'cloned'])) {
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
                    if ($db->fetchValue("SELECT `owner` FROM `loginsFolders` WHERE id = ?", [intval($item['dbId'])])['data'] === $myAuth->userid) {
                        $pArr[$item['dbId']][$jsFnName] = true;
                        if ($fnName === "deleteSelection") $pArr[$item['dbId']]["resetResultsTestee"] = $pArr[$item['dbId']]["deleteSelection"]; // the resetresults button will have the same value as delete rights

                        // regular permission check
                    } else {
                        $pArr[$item['dbId']][$jsFnName] = $permAuth->getAccessVal("itemgroup", $fnName, "itemObject", intval($item['dbId']));
                        if ($fnName === "deleteSelection") $pArr[$item['dbId']]["resetResultsTestee"] = $pArr[$item['dbId']]["deleteSelection"]; // the resetresults button will have the same value as delete rights
                    }
                }

                // button types for testee objects
                if (in_array($item['type'], ['testee', 'template', 'cloned'])) {
                    // testee in folder owner check
                    if ($db->fetchValue("SELECT `owner` FROM `loginsFolders` WHERE id = ?", [intval(ltrim($item['pid'], 'f'))])['data'] === $myAuth->userid) {
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
        if ((in_array('superadmin', $userGroupList) || in_array('admin', $userGroupList)) || $db->fetchValue("SELECT `owner` FROM `loginsFolders` WHERE id = ?", [$location])['data'] === $myAuth->userid) {
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

    $location = $data['location'];
    $name = $data['name'];

    //Check if parent folder has been deleted or removed by another user
    $query = "SELECT * FROM loginsFolders WHERE id=? LIMIT 1";
    $parameters = array($location);
    $results = $db->fetchRow($query, $parameters);

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

    $location = $data['location'];
    $name = $data['name'];
    $type = $data['type'];
    $showBlocked = $data['showBlocked'];
    if (isset($data['loginType'])) {
        $loginType = $data['loginType'];
        $password = $data['password'];
        if ($password === '') {
            $password = randomString(8);
        }
        $password = Crypt::encryptString($password);
    }

    //Check if parent folder has been deleted or removed by another user
    $query = "SELECT * FROM loginsFolders WHERE id=? LIMIT 1";
    $parameters = array($location);
    $result = $db->fetchRow($query, $parameters);

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
        $newEntry = array(array('parent' => $location, 'name' => $name, 'overrides' => '{"disableTimer":false,"disableSaving":false,"allowNavigation":false,"demoMode":false}', 'loginType' => $loginType, 'password' => $password ?? null, 'template' => $type));
        $db->insert('logins', $newEntry);
        $result = $db->results();
    } else {
        //templates and standard logins
        $newEntry = array(array('parent' => $location, 'name' => $name, 'overrides' => '{"disableTimer":false,"disableSaving":false,"allowNavigation":false,"demoMode":false}', 'template' => $type));
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

function newPassword($data, &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */
    checkParams($data, array('testee', 'name'));

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

    //verify if the new password is not existing already
    $query = "SELECT COUNT(*) FROM passwords WHERE name=? and loginID=?";
    $parameters = array($name, $testee);
    $results = $db->fetchValue($query, $parameters);

    // if the name is already in use:
    if ($results['data'] != 0) {
        $returnData['error'] = $uiLang->translate("This password does already exist. Try creating a different password.");
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

    //create random password
    $preCheck = true;
    while ($preCheck === true) {
        $pwdName = randomString(6);
        $query = "SELECT COUNT(*) FROM passwords WHERE name=? AND loginID=?";
        $parameters = array($pwdName, $testee);
        $resultsCheck = $db->fetchValue($query, $parameters);
        if ($resultsCheck['data'] == 0) {
            $preCheck = false;
        }
    }

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

    //create random password
    $preCheck = true;
    while ($preCheck == true) {
        $pwdName = randomString(6);
        $query = "SELECT COUNT(*) FROM passwords WHERE name=? AND loginID=?";
        $parameters = array($pwdName, $testee);
        $resultsCheck = $db->fetchValue($query, $parameters);
        if ($resultsCheck['data'] == 0) {
            $preCheck = false;
        }
    }

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
    $db->prepare("DELETE FROM passwords WHERE id=?");
    $db->executePrepared(array($pwId));
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
    //if password is not present anymore, throw an error message and leave edit mode
    $query = "SELECT * FROM passwords WHERE id=? LIMIT 1";
    $parameters = array($pwId);
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
            $returnData['error'] = $uiLang->translate("This password does already exist. Try renaming to a different password.");
            die();
        }
    }

    $db->update('passwords', array('name' => $newName, 'tag' => $tag), 'id=?', array($pwId));
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
    $query = "SELECT * FROM passwords WHERE id=? LIMIT 1";
    $parameters = array($pwId);
    $result = $db->fetchRow($query, $parameters);

    //Show error message if selected testee is not available anymore
    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("This label has been deleted by another user. Leaving edit mode.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }

    $db->update('passwords', array('label' => $newLabel, 'tag' => $tag), 'id=?', array($pwId));
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
    $query = "SELECT * FROM passwords WHERE id=? LIMIT 1";
    $parameters = array($pwId);
    $result = $db->fetchRow($query, $parameters);

    //Show error message if selected testee is not available anymore
    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("This label has been deleted by another user. Leaving edit mode.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }
    //Saving
    if ($pwReq === true) {
        $db->prepare("UPDATE passwords SET name=?, options=JSON_SET(COALESCE(options, '{}'), '$.pwReq', true) WHERE id=?");

    } else {
        $db->prepare("UPDATE passwords SET name=?, options=JSON_REMOVE(COALESCE(options, '{}'), '$.pwReq') WHERE id=?");
    }
    $db->executePrepared(array(Crypt::encryptString($password), $pwId));

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
    checkParams($data, array('id', 'status', 'type'));
    $id = $data['id'];
    $status = $data['status'];
    ($data['type'] === 'folder') ? $target = 5 : $target = 6;

    if (isset($_SESSION)) {
        $user = $_SESSION['userid'];
        if ($status) {
            //Check if element is still available
            ($data['type'] === 'folder') ? $query = "SELECT * FROM loginsFolders WHERE `id` = ? LIMIT 1" : $query = "SELECT * FROM logins WHERE `id` = ? LIMIT 1";
            $parameters = array($id);
            $result = $db->fetchRow($query, $parameters);
            //Write watchlist
            if ($result['rows'] >= 0) {
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
    //End check
    //Check if selected password is still present
    $query = "SELECT * FROM passwords WHERE id=? LIMIT 1";
    $parameters = array($id);
    $result = $db->fetchRow($query, $parameters);
    //Show error message if selected testee is not available anymore
    if ($result['rows'] === 0) {
        $returnData['error'] = $uiLang->translate("You are trying to add a test to a password which has been deleted by another user. Leaving edit mode.");
        $returnData['closeEditMode'] = true;
        $returnData['reloadFolder'] = true;
        die();
    }
    //End check

    for ($i = 0; $i < count($structure); $i++) {
        unset($structure[$i]['name']);
        unset($structure[$i]['ID']);
        unset($structure[$i]['actionField']);
    }
    $data['structure'] = json_encode($structure);

    if (isset($test2copyId)) {
        //save modified test-structure to active password
        $db->prepare("UPDATE passwords SET structure=? WHERE id=?");
        $db->executePrepared(array($data['structure'], $id));

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
                if ((int)$v['hiddenID'] === $test2copyId) {
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
        $db->prepare("UPDATE passwords SET structure=? WHERE id=?");
        $db->executePrepared(array($data['structure'], $id));
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

    //save modified meta-structure to db
    $db->prepare("UPDATE logins SET info=? WHERE id=?");
    $db->executePrepared(array($data['structure'], $testeeId));
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

    foreach ($collectedIds as $key => $testee) {
        //Check if testee is still present
        $query = "SELECT * FROM logins WHERE id=? LIMIT 1";
        $parameters = array($testee);
        $result = $db->fetchRow($query, $parameters);
        //Show error message if selected testee is not available anymore
        if ($result['rows'] === 0) {
            $returnData['error'] = $uiLang->translate("You are trying to delete results of a test taker which has been deleted by another user. The view will be refreshed.");
            $returnData['closeEditMode'] = true;
            $returnData['reloadFolder'] = true;
            die();
        }
        //End check
        //Delete activity of the testee
        $db->prepare("DELETE FROM activity WHERE loginId=?");
        $db->executePrepared(array($testee));

        // delete associated scoring table entry(ies), if any
        $db->fetchValue("DELETE FROM `scoring` WHERE `loginId` = ?", [$testee]);

        array_push($ttIdsAndNames, "[{$result['data']['id']}] \"{$result['data']['name']}\"");
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
    $query = "SELECT * FROM passwords WHERE id=? LIMIT 1";
    $parameters = array($password);
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

    //Check if password is still present
    $query = "SELECT * FROM passwords WHERE id=? LIMIT 1";
    $parameters = array($password);
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

    //save modified meta-structure to db
    $db->prepare("UPDATE logins SET info=? WHERE id=?");
    $db->executePrepared(array($writeStructure, $testeeId));

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
    $targetType = $data['targetType'];
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

    //save modified login type name to db
    if ($targetType === 'directPass') {
        $password = $data['password'];
        if ($password === '' && $result['data']['password'] === null) {
            $password = randomString(8);
        } else if ($password === '' && $result['data']['password'] !== null) {
            $password = Crypt::decryptString($result['data']['password']);
        }
        $password = Crypt::encryptString($password);
        $db->prepare("UPDATE logins SET loginType=?, password=? WHERE id=?");
        $db->executePrepared(array($targetType, $password, $testeeId));
    } else {
        $db->prepare("UPDATE logins SET loginType=? WHERE id=?");
        $db->executePrepared(array($targetType, $testeeId));
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
    $password = Crypt::encryptString($data['password']);

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
    $db->prepare("UPDATE logins SET password=? WHERE id=?");
    $db->executePrepared(array($password, $testeeId));
    $returnData['dp'] = $data['password'];
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
    checkParams($data, array('assignTests', 'noAutoPwds', 'pwdDigits', 'pwdMode', 'pwds', 'pwdsSameForAll', 'structure', 'pid', 'selection', 'oSetTimer', 'oAdditionalTime', 'oSetSaving', 'oSetNavLimit', 'oDemoMode', 'overrides', 'assignMtags', 'metaTags', 'deleteExistingPwds', 'deleteExistingMtags', 'sLogFlag'));
    $dataContainer['assignTests'] = $data['assignTests'];
    $dataContainer['noAutoPwds'] = $data['noAutoPwds'];
    $dataContainer['pwdDigits'] = $data['pwdDigits'];
    $dataContainer['pwdMode'] = $data['pwdMode'];
    $dataContainer['pwds'] = $data['pwds'];
    $dataContainer['pwdsSameForAll'] = $data['pwdsSameForAll'];
    $dataContainer['structure'] = $data['structure'];
    $dataContainer['pwdSet'] = array();
    $dataContainer['pwdSet'][0] = false;
    $dataContainer['assignMtags'] = $data['assignMtags'];
    $dataContainer['metaTags'] = $data['metaTags'];
    $dataContainer['deleteExistingPwds'] = $data['deleteExistingPwds'];
    $dataContainer['deleteExistingMtags'] = $data['deleteExistingMtags'];
    global $sLogFlag;
    $sLogFlag=$data['sLogFlag'];


    if ($data['overrides']) {
        if ($data['oSetTimer']) {
            $oSetTimer = 'true';
        } else {
            $oSetTimer = 'false';
        }
        $oAdditionalTime = $data['oAdditionalTime'];
        if ($data['oSetSaving']) {
            $oSetSaving = 'true';
        } else {
            $oSetSaving = 'false';
        }
        if ($data['oSetNavLimit']) {
            $oSetNavLimit = 'true';
        } else {
            $oSetNavLimit = 'false';
        }
        if ($data['oDemoMode']) {
            $oDemoMode = 'true';
        } else {
            $oDemoMode = 'false';
        }
        $options = '{"disableTimer":' . $oSetTimer . ',"disableSaving":' . $oSetSaving . ',"allowNavigation":' . $oSetNavLimit . ',"additionalTime":' . $oAdditionalTime . ',"demoMode":' . $oDemoMode . '}';
    } else {
        $options = false;
    }
    $pid = $data['pid'];
    $selection = $data['selection'];
    $warnings = array();
    $changes = array();

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
        if($sLogFlag){
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
        if($sLogFlag){
            $string = $uiLang->translate('- Assigning tests to the labels as defined.');
        } else {
            $string = $uiLang->translate('- Assigning tests to the passwords as defined.');
        }
        array_push($changes, $string);
    }
    function passwordExists($name, $testee, &$db)
    {
        /* @var $db rixPDO */
        //skip verification for student logins
        global $sLogFlag;
        if ($sLogFlag)return false;
            //verify if the new password is not existing already
        $query = "SELECT COUNT(*) FROM passwords WHERE name=? and loginID=?";
        $parameters = array(Crypt::encryptString($name), $testee);
        $results = $db->fetchValue($query, $parameters);
        // if the name is already in use:
        if ($results['data'] != 0) {
            return true;
        } else {
            return false;
        }
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
            //Testee
        } else {
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
            //Delete existing passwords if option was marked
            if ($dataContainer['deleteExistingPwds']) {
                $db->prepare("DELETE FROM passwords WHERE loginID=?");
                $db->executePrepared(array($id));
            }
            //Save auto or manual password to the testee
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
                        if ($dataContainer['assignTests']) {
                            //Assign tests if requested
                            if (passwordExists($pwdName, $id, $db)) {
                                $fullMsg = $m1 . $pwdName . $m2 . $name . $m3;
                                $warnArray = array('id' => $id, 'name' => $name, 'type' => $type, 'message' => $fullMsg);
                                array_push($warnings, $warnArray);
                            } else {
                                for ($x = 0; $x < count($dataContainer['structure'][0]); $x++) {
                                    unset($dataContainer['structure'][0][$x]['name']);
                                    unset($dataContainer['structure'][0][$x]['ID']);
                                }
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
                        //Assign tests if requested
                        foreach ($dataContainer['pwds'] as $value) {
                            $metadata = json_encode($value['metadata']);
                            if (passwordExists($value['name'], $id, $db)) {
                                $fullMsg = $m1 . $value['name'] . $m2 . $name . $m3;
                                $warnArray = array('id' => $id, 'name' => $name, 'type' => $type, 'message' => $fullMsg);
                                array_push($warnings, $warnArray);
                            } else {
                                if (array_key_exists($value['id'], $dataContainer['structure']) && is_array($dataContainer['structure'][$value['id']])) {
                                    for ($x = 0; $x < count($dataContainer['structure'][$value['id']]); $x++) {
                                        unset($dataContainer['structure'][$value['id']][$x]['name']);
                                        unset($dataContainer['structure'][$value['id']][$x]['ID']);
                                    }
                                    $jsonStructure = json_encode($dataContainer['structure'][$value['id']]);
                                    $dataListArray = array('loginID' => $id, 'structure' => $jsonStructure, 'name' => Crypt::encryptString($value['name']), 'tag' => $value['tag']);
                                    if($sLogFlag === true)$dataListArray['label']=$value['label'];
                                    if($value['metadata'] !== null)$dataListArray['options']=json_encode($value['metadata']);
                                    $dataPwd = array($dataListArray);
                                } else {
                                    $dataListArray = array('loginID' => $id, 'name' => Crypt::encryptString($value['name']), 'tag' => $value['tag']);
                                    if($sLogFlag === true)$dataListArray['label']=$value['label'];
                                    if($value['metadata'] !== null)$dataListArray['options']=json_encode($value['metadata']);
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
                                if($sLogFlag === true)$dataListArray['label']=$value['label'];
                                if($value['metadata'] !== null)$dataListArray['options']=json_encode($value['metadata']);
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
        //Check if selected testee or folder has not been deleted by another user
        $query = "SELECT COUNT(*) FROM " . $table . " WHERE id=?";
        $parameters = array($val['dbId']);
        $results = $db->fetchValue($query, $parameters);
        if ($results['data'] === 0) {
            $me2 = $uiLang->translate('"</strong> has been deleted by another user!');

            $fullMsg = $me1 . $val['name'] . $me2;
            $warnArray = array('id' => $val['dbId'], 'name' => $val['name'], 'type' => $val['type'], 'message' => $fullMsg);
            array_push($warnings, $warnArray);
        } else {
            //Save the changes
            recurSave($val['dbId'], $val['type'], $val['name'], $options, $db, $warnings, $dataContainer, $returnData);
        }
    }
    $returnData['warnings'] = $warnings;
    $returnData['changes'] = $changes;
    $returnData['id'] = $pid;
}

function exportCSV($data, &$db, &$returnData)
{
    global $uiLang;
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

    function recurFetch($id, $type, $name, &$db, &$CSVArray, &$pid, &$mTagLength)
    {
        /* @var $db rixPDO */

        // Folder
        if ($type === 'folder') {
            // Check for folders in folder
            $query = "SELECT * FROM loginsFolders WHERE parent=?";
            $parameters = array($id);
            $result = $db->fetchTable($query, $parameters);
            if (!empty($result['data'])) {
                foreach ($result['data'] as $subfolder) {
                    recurFetch($subfolder['id'], 'folder', $subfolder['name'], $db, $CSVArray, $pid, $mTagLength);
                }
            }
            // Check for logins in folder
            $query = "SELECT * FROM logins WHERE parent=?";
            $parameters = array($id);
            $result = $db->fetchTable($query, $parameters);
            if (!empty($result['data'])) {
                foreach ($result['data'] as $login) {
                    recurFetch($login['id'], 'login', $login['name'], $db, $CSVArray, $pid, $mTagLength);
                }
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
            recurFetch($val['dbId'], $val['type'], $val['name'], $db, $CSVArray, $pid, $mTagLength);
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
    checkParams($data, array('assignTests', 'leadingZeros', 'noAutoPwds', 'noTestees', 'prefix', 'pwdDigits', 'pwdMode', 'pwds', 'pwdsSameForAll', 'structure', 'suffix', 'pid', 'oSetTimer', 'oAdditionalTime', 'oSetSaving', 'oSetNavLimit', 'oDemoMode', 'overrides', 'assignMtags', 'metaTags'));

    $assignTests = $data['assignTests'];
    $leadingZeros = $data['leadingZeros'];
    $noAutoPwds = $data['noAutoPwds'];
    $noTestees = $data['noTestees'] + $data['startCount'];
    $startCount = $data['startCount'];
    $prefix = $data['prefix'];
    $pwdDigits = $data['pwdDigits'];
    $pwdMode = $data['pwdMode'];
    $pwds = $data['pwds'];
    $pwdsSameForAll = $data['pwdsSameForAll'];
    $structure = $data['structure'];
    $suffix = $data['suffix'];
    $assignMtags = $data['assignMtags'];
    $metaTags = $data['metaTags'];

    if (empty($metaTags)) {
        $metaTagsJSON = '{}';
    } else {
        $metaTagsJSON = json_encode($metaTags);
    }

    if ($data['overrides']) {
        if ($data['oSetTimer']) {
            $oSetTimer = 'true';
        } else {
            $oSetTimer = 'false';
        }
        $oAdditionalTime = $data['oAdditionalTime'];
        if ($data['oSetSaving']) {
            $oSetSaving = 'true';
        } else {
            $oSetSaving = 'false';
        }
        if ($data['oSetNavLimit']) {
            $oSetNavLimit = 'true';
        } else {
            $oSetNavLimit = 'false';
        }
        if ($data['oDemoMode']) {
            $oDemoMode = 'true';
        } else {
            $oDemoMode = 'false';
        }
        $options = '{"disableTimer":' . $oSetTimer . ',"disableSaving":' . $oSetSaving . ',"allowNavigation":' . $oSetNavLimit . ',"additionalTime":' . $oAdditionalTime . ',"demoMode":' . $oDemoMode . '}';
    } else {
        $options = '{"disableTimer":false,"disableSaving":false,"allowNavigation":false,"demoMode":false}';
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
    //Write testees to database
    for ($i = $startCount; $i < $noTestees; $i++) {
        if ($leadingZeros) {
            $name = $prefix . str_pad($i, 3, '0', STR_PAD_LEFT) . $suffix;
        } else {
            $name = $prefix . $i . $suffix;
        }
        //Create new testees
        $data = array(array('parent' => $pid, 'name' => $name, 'overrides' => $options, 'info' => $metaTagsJSON, 'template' => 'testee'));
        $db->insert('logins', $data);
        $result = $db->results();
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
                        for ($x = 0; $x < count($structure[0]); $x++) {
                            unset($structure[0][$x]['name']);
                            unset($structure[0][$x]['ID']);
                        }
                        $jsonStructure = json_encode($structure[0]);
                        $dataPwd = array(array('loginID' => $result['id'], 'structure' => $jsonStructure, 'name' => Crypt::encryptString($pwdName), 'tag' => ''));
                        $db->insert('passwords', $dataPwd);
                    } else {
                        $dataPwd = array(array('loginID' => $result['id'], 'name' => Crypt::encryptString($pwdName), 'tag' => ''));
                        $db->insert('passwords', $dataPwd);
                    }
                }
                break;
            case 'manual':
                if ($assignTests && count($structure) > 0) {
                    //Assign tests if requested
                    foreach ($pwds as $value) {
                        if (array_key_exists($value['id'], $structure) && is_array($structure[$value['id']])) {
                            for ($x = 0; $x < count($structure[$value['id']]); $x++) {
                                unset($structure[$value['id']][$x]['name']);
                                unset($structure[$value['id']][$x]['ID']);
                            }
                            $jsonStructure = json_encode($structure[$value['id']]);

                            $dataPwd = array(array('loginID' => $result['id'], 'structure' => $jsonStructure, 'name' => Crypt::encryptString($value['name']), 'tag' => $value['tag']));
                        } else {
                            $dataPwd = array(array('loginID' => $result['id'], 'name' => Crypt::encryptString($value['name']), 'tag' => $value['tag']));
                        }
                        $db->insert('passwords', $dataPwd);
                    }
                } else {
                    foreach ($pwds as $value) {
                        $dataPwd = array(array('loginID' => $result['id'], 'name' => Crypt::encryptString($value['name']), 'tag' => $value['tag']));
                        $db->insert('passwords', $dataPwd);
                    }
                }
                break;
        }
    }
    $returnData['id'] = $pid;
}

function wizardCreateFromFile($data, rixPDO &$db, &$returnData)
{
    global $uiLang;
    /* @var $db rixPDO */
    checkParams($data, array('csvFilename', 'csvData', 'fileWizardType', 'pid'));

    $csvFilename = $data['csvFilename'];
    $csvData = $data['csvData'];
    $pid = $data['pid'];
    $lid = $data['fileWizardType'];
    $existing = array();

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

    global $permAuth;

    // create array of non-null folders to pre-scan
    $csvFldArr = array_column($data['csvData'], 4);
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

            if ($csvData[$i][2] === '') {
                if ($authType === 'directPass') {
                    $password = randomString(8);
                    $password = Crypt::encryptString($password);
                } else {
                    $password = NULL;
                }
            } else {
                $password = Crypt::encryptString($csvData[$i][2]);
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
                if ($subfolder != null) {
                    $writeId = deliverParentFolder($pid, $subfolder, $db, $returnData);
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
                        $newInfo->{$csvData[$i][$j]} = $csvData[$i][$j + 1];
                    }
                }
                $writeInfo = json_encode($newInfo);
                $db->prepare("UPDATE logins SET info=? WHERE id=?");
                $db->executePrepared(array($writeInfo, $loginId));
            }

            //Add labels
            if ($label !== '') {
                //create random password for label
                $pwdName = randomString(6);
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
                if ($subfolder != null) {
                    $writeId = deliverParentFolder($pid, $subfolder, $db, $returnData);
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
                        $newInfo->{$csvData[$i][$j]} = $csvData[$i][$j + 1];
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
    $returnData['id'] = $pid;
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
    //Show error message
    $query = "SELECT * FROM passwords WHERE id=? LIMIT 1";
    $parameters = array($id);
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
                $itemArray = array('name' => $uiLang->translate('Test has been deleted!'), 'hiddenID' => $value['hiddenID'], 'ID' => $value['hiddenID'], 'actionField' => '-', 'removed' => true);
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
                $itemArray = array('name' => $queryResult['data']['name'], 'hiddenID' => $value['hiddenID'], 'ID' => $value['hiddenID'], 'actionField' => $actionField);
            }
            array_push($result['data']['structure'], $itemArray);
        }
    }
    $returnData['dataFlag'] = $dataFlag;
    $result['data']['name'] = Crypt::decryptString($result['data']['name']);
    $returnData['password'] = $result['data'];
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
    $result['data']['password'] = !is_null($result['data']['password']) ? Crypt::decryptString($result['data']['password']) : $result['data']['password'];


    $result['data']['metatags'] = $jsonData;
    $returnData['data'] = $result['data'];

    //passwords
    $query = "SELECT * FROM passwords WHERE loginID=?";
    $parameters = array($data['dbId']);
    $result = $db->fetchTable($query, $parameters);
    foreach ($result['data'] as $key => $value) {
        //decrypt password name
        $result['data'][$key]['name'] = Crypt::decryptString($result['data'][$key]['name']);
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
    $returnData['passwords'] = $result['data'];
}


function search($data, &$db, &$returnData)
{
    /* @var $db rixPDO */
    checkParams($data, array('searchString'));
    $searchString = '%' . preg_replace('/%/', $data['searchString'], '\\%') . '%';

    $query = "SELECT CONCAT('f', id) as id, id as 'dbId', parent as pathId, CONCAT('f', parent) as pid, 'folder' as type, `name`, `name` as label, `name` as sortKey, NULL as subresult, NULL as subresultvalue FROM loginsFolders WHERE name LIKE ? AND NOT ISNULL(parent) UNION SELECT CONCAT('t', id) as id, id as 'dbId', parent, CONCAT('f', parent) as pid, template as type, `name`, `name` as label, `name` as sortKey, CASE WHEN displayName IS NOT NULL THEN 'Display name: ' ELSE NULL END as subresult, displayName as subresultvalue FROM logins WHERE name LIKE ? OR displayName LIKE ? ORDER BY name";

    $parameters = array($searchString, $searchString, $searchString);
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

function testsSearch($data, &$db, &$returnData)
{
    /* @var $db rixPDO */

    checkParams($data, array('searchString'));
    $searchString = '%' . preg_replace('/%/', $data['searchString'], '\\%') . '%';

    global $permAuth;
    global $uiLang;

    $query = "SELECT CONCAT('f',id) as id, id as 'dbId', parent as pathId, CONCAT('f', parent) as pid, 'folder' as type, `name`, `name` as label, `name` as sortKey, 'folder' as testType FROM testFolders WHERE name LIKE ? AND NOT ISNULL(parent) UNION SELECT CONCAT('t',id) as id, id as 'dbId', parent, CONCAT('f', parent) as pid, 'test' as type, `name`, `name` as label, `name` as sortKey, `structure` as testType FROM tests WHERE name LIKE ? ORDER BY name";
    $parameters = array($searchString, $searchString);
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
                $query = "SELECT items.name FROM items WHERE id = ? AND name LIKE ? LIMIT 1";
                $parameters = array($r['hiddenID'], $searchString);
                $res = $db->fetchRow($query, $parameters);
                if (count($res['data']) > 0) {
                    $resParent['data']['subresult'] = $uiLang->translate('Test page name: ');
                    $resParent['data']['subresultvalue'] = $res['data']['name'];
                    array_push($returnData['data']['list'], $resParent['data']);
                }
                $query = "SELECT items.itemCode FROM items WHERE id = ? AND itemCode LIKE ? LIMIT 1";
                $parameters = array($r['hiddenID'], $searchString);
                $res = $db->fetchRow($query, $parameters);

                if (count($res['data']) > 0) {
                    $resParent['data']['subresult'] = $uiLang->translate('Test page code: ');
                    $resParent['data']['subresultvalue'] = $res['data']['itemCode'];
                    array_push($returnData['data']['list'], $resParent['data']);
                }
            }
        }
    }

    foreach ($returnData['data']['list'] as $key => $value) {

        $hasRead = false; // set default starting value for access

        if ($value['type'] === 'test') $hasRead = $permAuth->permCheck(['remCall' => true, 'fid' => $value['pathId']]);
        if ($value['type'] === 'folder' ) $hasRead = $permAuth->permCheck(['remCall' => true, 'fid' => intVal($value['dbId'])]);

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
    if (count($folders) > 0) {
        $db->prepare("DELETE FROM loginsFolders WHERE " . $folderClause);
        $db->executePrepared($folders);
    }
    if (count($groups) > 0) {
        $db->prepare("DELETE FROM logins WHERE " . $groupClause);
        $db->executePrepared($groups);
    }

    // log action
    global $myAuth;
    $myAuth->prepLog($data, "delSelection", $returnData);

    fetchLibrary($data, $db, $returnData);
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
                $db->prepare("INSERT INTO logins SELECT NULL as id, name,overrides, " . $pid . " as parent, template, loginType, password, info, displayName FROM logins WHERE id=?");
                $db->executePrepared(array($test['id']));
            }
        }
        //Folders in folder
        $query = "SELECT id FROM loginsFolders WHERE parent=?";
        $parameters = array($id);
        $result = $db->fetchTable($query, $parameters);
        if (!empty($result['data'])) {
            foreach ($result['data'] as $folder) {
                /** @noinspection SqlInsertValues */
                $db->prepare("INSERT INTO loginsFolders SELECT NULL as id, name," . $pid . " as parent, info FROM loginsFolders WHERE id=?");
                $db->executePrepared(array($folder['id']));
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

    foreach ($folders as $folder) {
        if (checkPath($target, $db, $folder) === false) {
            $returnData['error'] = 'You are not able to copy a folder into itself!';
            die();
        } else {
            $name = checkExisting('loginsFolders', $folder, $target, $db);
            $db->prepare("INSERT INTO loginsFolders SELECT NULL as id, ? as name, ? as parent FROM loginsFolders WHERE id=?");
            $db->executePrepared(array($name, $target, $folder));
            $result = $db->results();
            recursive_copyfunc($folder, $result['id'], $db);
        }
    }
    //Tests
    foreach ($tests as $test) {
        $name = checkExisting('logins', $test, $target, $db);
        $db->prepare("INSERT INTO logins SELECT NULL as id, ? as name,overrides, ? as parent, template, loginType, password, info, displayName FROM logins WHERE id=?");
        $db->executePrepared(array($name, $target, $test));
        $result = $db->results();
        //duplicating the passwords as well for the duplicated testee
        $db->prepare("INSERT INTO passwords SELECT NULL as id, ? as loginID, structure, name, tag, label, options FROM passwords WHERE loginID=?");
        $db->executePrepared(array($result['id'], $test));
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
