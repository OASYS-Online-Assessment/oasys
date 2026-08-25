<?php

register_shutdown_function('outputJSON');

require_once 'inc/php/database.php'; //contains the database connection credentials
require_once '../inc/php/rixPDO.php'; //wrapper around PDO functions (c.f. docs folder for manual)
require_once "../inc/php/helperRoutines.php";
require_once 'inc/php/userHandling.php';

include_once 'userMgmtActions.php';

# ----------------------- #
# Authentication Includes #
# ----------------------- #
$pageName = "users"; // set to the related 'editor button' string name (e.g., 'items')
$isSubMod = false; // set true if a module page in a subdirectory
$isActionFile = true; // set true if an "xxxActions.php" file
require_once 'inc/php/authCommonFunctions.php'; // required for authentication inclusion


# ----------------------- #
# Translation Include #
# ----------------------- #
require_once 'inc/php/uiLang.php'; // required for translation inclusion
$uiLang = new uiLang($settings['interfaceLanguage']);

//action is a string that defines what action to perform
$action = filter_input(INPUT_POST, 'action');
if (!$action) {
	$action = "";
}

//all data that is returned by this script will be put into $returnData array which is sent back in JSON encoded form
$returnData = array();
$returnData['action'] = $action; //when returning we must specify which action was performed
$returnData['error'] = false; //if there is an error, this will contain a string with the error message

// if the auth constructor results in an error, we want to immediately exit and report said error
if ($myAuth->returnData['error'] !== false) {
	$returnData['error'] = $myAuth->returnData['error'];
	exit;
}

$auth = $myAuth->getAuthResult(true);

//the JSON output will happen, even if a fatal error prevents the script from finishing
require_once "../inc/php/Crypt.php";

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
$db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, '../logs/usersManager_errors.txt', 1, $returnData, 'error');

# ------------------------------------------- #
# Inclusion of permission authenticator class #
# ------------------------------------------- #
$permAuth = new permAuth($action, $data, $myAuth);

# ---------------------------------------- #
# Action permission authentication routine #
# ---------------------------------------- #
$letMePass = $permAuth->permCheck($data);
if ($letMePass === true) {
	// preset the returnData var with anything the authenticator may have alraedy loaded in prior to sending to action
	$returnData = $permAuth->returnData;

	# -------------------------------------------------------------- #
	# We always need these values returned to the user editor module #
	# -------------------------------------------------------------- #

	$returnData['isAdmin'] = $myAuth->checkAdmin();
	$returnData['isAE'] = $myAuth->checkElevatedAdmin();
	$returnData['isSuper'] = $myAuth->checkSA();

	$action($data, $db, $returnData);
} else {
	// forward on the fail message from the auth class
	$returnData = $permAuth->returnData;
}

# --------------------- #
# Search group function #
# --------------------- #

function searchGroup($data, rixPDO &$db, &$returnData)
{
	global $myAuth;

	checkParams($data, ['sTerm']);
	$sTerm = $data['sTerm'];

	$sTerm = str_replace("*", "%", $sTerm); // replace stars with % for wildcard search
	$res = $db->fetchTable("SELECT `id`, `name` FROM `userGroups` WHERE `name` LIKE ?", ["{$sTerm}"])['data'];

	// filter out superadmin if operator is only admin level
	if ($myAuth->checkAdmin()) {
		unset($res[array_search('superadmin', array_column($res, 'name'))]);
		$res = array_values($res);
	}

	$returnData['data'] = $res;
}

# -------------------- #
# Search user function #
# -------------------- #

function searchUser($data, rixPDO &$db, &$returnData)
{
	global $myAuth;

	checkParams($data, ['sTerm']);
	$sTerm = $data['sTerm'];

	$sTerm = str_replace("*", "%", $sTerm); // replace stars with % for wildcard search
	$res = $db->fetchTable("SELECT `id`, `name` FROM `users` WHERE `name` LIKE ?", ["{$sTerm}"])['data'];

	// filter out users belonging to superadmin group
	if ($myAuth->checkAdmin()) {
		// get superadmin group id val
		$saGroupId = $db->fetchValue("SELECT `id` FROM `userGroups` WHERE `name` = 'superadmin'")['data'];

		foreach ($res as $key => $value) {
			$gList = $db->fetchColumn("SELECT `usergroupId` FROM `userGroupAccess` WHERE `userId` = ?", [$value['id']])['data'];
			if (in_array($saGroupId, $gList)) unset($res[$key]);
		}

		$res = array_values($res);
	}

	$returnData['data'] = $res;
}

# ------------------------------------------- #
# Permission (accessDef) consistency routines #
# ------------------------------------------- #

function startConstCheck($data, rixPDO &$db, &$returnData)
{
	global $myAuth;
	// when structure is updated, synchronize the new schema into the accessDef tables
	if ($myAuth->syncSchema($returnData) !== true) {
		// $returnData .= $myAuth->returnData;
		$returnData = $myAuth->returnData;
		return;
	}

	// when gperm is moved laterally, sync the new perm based on new cperm parent
	if ($myAuth->forceGSync($returnData) !== true) {
		$returnData = $myAuth->returnData;
		return;
	}

	// when master editor list is updated, synchronize the new schema into the group editor list table
	if ($myAuth->forceEditorSync() !== true) {
		$returnData = $myAuth->returnData;
		return;
	}

	// return message
	$returnData['logMsg'] = "Completed database consistency synchronization routine.";
}

# ------------------------ #
# Begin standard functions #
# ------------------------ #

function updateGroupSettings(array $data, rixPDO &$db, array &$returnData)
{
	global $myAuth;
	$returnData['forceReload'] = false;
	checkParams($data, ['editData', 'userGroup']);

	$userGroupId = $data['userGroup'];
	$editorData = $data['editData'];

	foreach ($editorData as $sKey => $sVals) {
		foreach ($sVals as $k2 => $v2) {
			$editorData[$sKey][$k2] = (isset($v2['value'])) ? $v2['value'] : $v2;
		}
	}

	$db->prepare("UPDATE `userGroups` SET `accessDef` = ? WHERE `id` = ?");
	$db->executePrepared([json_encode($editorData), $userGroupId]);

	// sent reload request if editing own group
	if (in_array($userGroupId, $myAuth->usergroup)) $returnData['forceReload'] = true;
}

function fetchGroupSettings(array $data, rixPDO &$db, array &$returnData)
{
	checkParams($data, ['groupId']);

	global $settingsDefaults, $myAuth;

	$returnSettingValues = []; // the value(s) to return to requesting client

	# --------------------------------- #
	# Define target is admin/superadmin #
	# --------------------------------- #
	$isAtLeastAdmin = $myAuth->checkAdmin() || $myAuth->checkSA();

	$targetID = $data['groupId'];
	$superID = $db->fetchValue("SELECT `id` FROM `userGroups` WHERE `name` = ?", ['superadmin'])['data'];
	$adminID = $db->fetchValue("SELECT `id` FROM `userGroups` WHERE `name` = 'admin'")['data'];

	# --------------------------------------------------------------- #
	# If user is only admin level, and trying to modify itself, block #
	# --------------------------------------------------------------- #
	if ($myAuth->checkAdmin()) {
		if ($targetID === $adminID) {
			$returnData['error'] = "Unauthorized operation. You may not edit the admin editor access list.";
			exit;
		};
	}

	// extract just user settings scoped values
	$userSettings = array_filter($settingsDefaults, function ($defaultKey) {
		if ($defaultKey['scope'] === 2) return $defaultKey; // filter out all except usergroup scope
	});

	// obtain our master and group specific editor lists
	$adRes = $db->fetchValue("SELECT `accessdef` FROM `userGroups` WHERE `id` = ?", [$targetID])['data'];

	// if the accessDef column is null, setup JSON shell
	if (is_null($adRes)) {
		$db->update("userGroups", ["accessDef" => "{}"], "id = ?", [$targetID]);
		$adRes = $db->fetchValue("SELECT `accessdef` FROM `userGroups` WHERE `id` = ?", [$targetID])['data'];
	}

	// JSONify our result for processing
	$acDefArr = json_decode($adRes ?? '', true);

	# ------------------------------------------------------- #
	# ADDED SETTINGS -> ACCESSDEF JSON SCHEMA SYNCHRONIZATION #
	# ------------------------------------------------------- #

	foreach ($settingsDefaults as $usFilterKey => $value) {
		if ($value['scope'] === SETTINGS_USERGROUP) {

			if (!isset($acDefArr[$usFilterKey])) {
				$db->execute("UPDATE `userGroups` SET `accessDef` = JSON_SET(`accessDef`, '$.{$usFilterKey}', JSON_OBJECT()) WHERE `id` = ?", [$targetID]);
			}

			foreach (array_keys($value['choices']) as $choice) {
				if (!isset($acDefArr[$usFilterKey][$choice])) {
					$db->prepare("UPDATE `userGroups` SET `accessDef` = JSON_SET(`accessDef`, CONCAT('$.{$usFilterKey}.', ?), true) WHERE `id` = ?");
					$db->executePrepared([$choice, $targetID]);
				}
			}
		}
	}

	# --------------------------------------------------------- #
	# REMOVED SETTINGS -> ACCESSDEF JSON SCHEMA SYNCHRONIZATION #
	# --------------------------------------------------------- #

	foreach ($acDefArr as $settingName => $acKey) {
		// if top level setting is removed, remove the json db entry as well
		if (!isset($userSettings[$settingName])) {
			$db->prepare("UPDATE `userGroups` SET `accessDef` = JSON_REMOVE(`accessDef`, CONCAT('$.', ?)) WHERE `id` = ?");
			$db->executePrepared([$settingName, $targetID]);
			unset($acDefArr[$settingName]);
			continue;
		}

		// if sub-level setting (choice) is removed from settings key, remove the json db entry as well
		foreach (array_keys($acKey) as $acEntry) {
			if (!in_array($acEntry, array_keys($settingsDefaults[$settingName]['choices']))) {
				$db->prepare("UPDATE `userGroups` SET `accessDef` = JSON_REMOVE(`accessDef`, CONCAT('$.{$settingName}.', ?)) WHERE `id` = ?");
				$db->executePrepared([$acEntry, $targetID]);
				unset($acDefArr[$settingName][$acEntry]);
			}
		}
	}

	# -------------------------------------------------------- #
	# CUSTOM EDITORBUTTONS FILTERING AND MODIFICATION ROUTINES #
	# -------------------------------------------------------- #

	// editorButtons accessLevel filtering for non-admins (utilization of accesslevel setting in settings default entry)
	foreach ($userSettings['editorButtons']['choices'] as $usFilterKey => $_x) {
		if (in_array($targetID, [$superID, $adminID]) === false && $settingsDefaults['editorButtons']['choices'][$usFilterKey]['accesslevel'] > 0) {
			unset($acDefArr['editorButtons'][$usFilterKey]);
			$db->prepare("UPDATE `userGroups` SET `accessDef` = JSON_REMOVE(`accessDef`, CONCAT('$.editorButtons.', ?)) WHERE `id` = ?");
			$db->executePrepared([$usFilterKey, $targetID]);
		}
	}

	// editorButtons force superadmin to always have 'users' enabled for editorButtons, no matter the db entry
	if ($targetID === $superID) {
		$db->prepare("UPDATE `userGroups` SET `accessDef` = JSON_SET(`accessDef`, '$.editorButtons.users', true) WHERE `id` = ?");
		$db->executePrepared([$superID]);
	}

	// get standard non-editorButton value
	$returnSettingValues = json_decode($db->fetchValue("SELECT `accessdef` FROM `userGroups` WHERE `id` = ?", [$targetID])['data'] ?? '', true);

	// editor buttons - add friendly label to return array and insert keys in order according to system settings keys
	$ebArr = [];

	foreach ($settingsDefaults['editorButtons']['choices'] as $mKey => &$mVal) {

		if (!array_key_exists($mKey, $returnSettingValues['editorButtons'])) continue;
		$ebArr[$mKey]['name'] = $mVal['name'];
		$ebArr[$mKey]['value'] = $returnSettingValues['editorButtons'][$mKey];
	}

	$returnSettingValues['editorButtons'] = $ebArr;

	$returnData['userSettings'] = $returnSettingValues;
}

function fetchPerms(array $data, rixPDO &$db, array &$returnData)
{
	checkParams($data, ['id', 'selectedUg']);
	global $myAuth;

	// get group ids of user being loaded to pass to fetchUsers function
	$data['userGroupIds'] = $db->fetchColumn("SELECT `usergroupId` FROM `userGroupAccess` WHERE `userId` = ?", [$data['id']])['data'];

	// get refreshed list of users on every call to fetch permissions to avoid race conditions with sessions (calling multiple AJAX queries simultaneously)
	$data['userGroupId'] = $data['selectedUg'];
	$uData = fetchUsers($data, $db, $returnData);
	$returnData['uData'] = $uData;

	// permission values
	$res = $db->fetchRow(("SELECT
            `id`,
            `name`,
            `accessDef`,
            `homeaccess`,
            `status`,
            `bad_logins`,
            `last_bad_pass`,
            `email`,
            `defLang`,
            `acct_type`
        FROM `users`
        WHERE `id`=?"), [$data['id']]);

	// first validate the user exists
	if ($res['rows'] === 0) {
		$returnData['error'] = "This user has been deleted! Click OK to refresh page.";
		$returnData['forceReload'] = true;
		return;
	}

	// Separate query to obtain array of usergroups to which the user belongs
	$resUgroups = $db->fetchColumn("SELECT `usergroupId` FROM `userGroupAccess` WHERE `userId` = ?", [$data['id']])['data'];
	$res['data']['userGroups'] = $resUgroups;

	// make account status value human readable
	$res['data']['status'] = ($res['data']['status'] === 1) ? "Enabled" : "Disabled"; // @phan-suppress-current-line PhanTypeInvalidDimOffset

	// make home access value human readable
	$res['data']['homeaccess'] = ($res['data']['homeaccess'] === 1) ? "Enabled" : "Disabled"; // @phan-suppress-current-line PhanTypeInvalidDimOffset

	// get unique user group list for dropdown restriction on UI select list
	$resUg = $db->fetchTable("SELECT DISTINCT `id`, `name` FROM `userGroups` order by `name`", [])['data'];

	// set the standard data array to send back
	$returnData['data'] = $res['data'];

	// For each posible usergroup value, split out into id and value keys for use in jsDropList in JS UI
	foreach ($resUg as $key => $value) { // @phan-suppress-current-line PhanUnusedVariable
		if ($value['name'] === 'superadmin' && $myAuth->checkAdmin()) continue; // do not return superadmin as a group option if not superadmin requsting
		if ($value['name'] === 'admin' && $myAuth->checkElevatedAdmin() === false && !$myAuth->checkSA()) continue; // do not return admin as group option if not elevated admin requesting
		$returnData['dataOpts']['ugList'][$key]['value'] = $value['id'];
		$returnData['dataOpts']['ugList'][$key]['label'] = $value['name'];
	}

	$returnData['dataOpts']['langs'] = ['DE' => 'German', 'EN' => 'English', 'FR' => 'French'];

	// special condition if the request came in to switch userGroup list in the UI
	if (isset($data['loadUg'])) $returnData['loadUg'] = $data['loadUg'];
}

function updatePerms(array $data, rixPDO &$db, array &$returnData)
{
	checkParams($data, ['section', 'perm', 'newVal', 'userId', 'updateType']);

	$origUgId = $data['origUgId'];

	# -------------------- #
	# Check if user exists #
	# -------------------- #
	$userThere = $db->fetchValue("SELECT `id` FROM `users` WHERE `id` = ?", [$data['userId']]);
	if ($userThere['rows'] === 0) {
		$returnData['error'] = "This user has been deleted! Click OK to refresh page.";
		$returnData['forceReload'] = true;
		return;
	}

	switch ($data['updateType']) {

		# ------------------------------- #
		# UPDATE ACCOUNT PROPERTY SECTION #
		# ------------------------------- #
		case 'account':

			// get the id of the superadmin group
			$saGroupId = $db->fetchValue("SELECT `id` FROM `userGroups` WHERE `name` = 'superadmin'")['data'];
			$admGroupId = $db->fetchValue("SELECT `id` FROM `userGroups` WHERE `name` = 'admin'")['data'];

			// get number of superadmins
			$saCount = $db->fetchValue("SELECT COUNT(*) FROM `userGroupAccess` WHERE `usergroupId` = ?", [$saGroupId])['data'];

			switch ($data['fieldName']) {

				case 'userGroups':
					$newUgArr = $data['newVal'];

					// if the target user is trying to have both superadmin and admin groups included, block
					if ((in_array($admGroupId, $newUgArr) && (isset($newUgArr[$admGroupId]) && $newUgArr[$admGroupId] === true)) && in_array($saGroupId, $newUgArr) && (isset($newUgArr[$saGroupId]) && $newUgArr[$saGroupId] === true)) {
						$returnData['logMsg'] = "<br>Cannot assign both superadmin and admin groups to a user. No group membership changes have been made.";
						$returnData['forceReload'] = true;
						$returnData['loadUg'] = $data['origUgId'];
						$returnData['data']['userId'] = $data['userId'];
						return;
					}

					foreach ($newUgArr as $ugId => $enabled) {
						$query = "";
						if ($enabled === true) { // try to insert entry, and even if there, it will not throw an error
							$query = "INSERT IGNORE INTO `userGroupAccess` VALUES (NULL, ?, ?)";
						} elseif ($enabled === false) { // delete entry if the new data array indicates to do so

							// check that user was in superadmin group in the first place
							$isSuperAdmin = false;
							foreach ($data['oldVal'] as $key => $grpId) {
								if ($grpId === $saGroupId) {
									$isSuperAdmin = true;
									break;
								}
							}


							// if there's only one superadmin and they are being removed, skip the operation but continue with the rest of the usergroup changes
							if (($ugId === $saGroupId) && ($saCount === 1) && ($isSuperAdmin)) {
								$returnData['logMsg'] = "<br>At least one superadmin user must exist at all times. <br><br><strong>User was NOT REMOVED from superadmin group.</strong>";
							} else {
								$query = "DELETE FROM `userGroupAccess` WHERE (`userId` = ? AND `usergroupId` = ?)";
							}
						}

						// prepare with same params and execute the query (either insert or remove entry), assuming there's a query to execute
						if (!(empty($query))) {
							$db->prepare($query);
							$db->executePrepared([$data['userId'], $ugId]);
						}
					}

					$returnData['reload'] = true;
					$returnData['data'] = $data;

					break;

				// fallthrough to standard query routine
				case 'bad_logins':
				case 'last_bad_pass':
				case 'name':
				case 'email':
				case 'status':
					// Check for username already in use condition, however allow case changing of same name
					// validate input
					if (($data['fieldName']) === 'name') {
						if (preg_match('/[^.A-Za-z0-9@+_-]/', $data['newVal']) || strlen($data['newVal']) > 64) {
							$returnData['error'] = "<br>Illegal input detected! Aborting Request.";
							return;
						}

						$tmpNameCheck = $db->fetchValue("SELECT `name` FROM `users` WHERE `name` = ?", [$data['newVal']]);
						if (($tmpNameCheck)['rows'] !== 0) {
							if (!(strtolower($tmpNameCheck['data']) === strtolower($data['oldVal']))) {
								$returnData['error'] = "<br>This username is already in use. Please select another value.";
								return;
							}
						}
					}

					if (($data['fieldName']) === 'email') {
						$em = $data['newVal'];

						// validate input
						if ((filter_var($em, FILTER_VALIDATE_EMAIL) === false || strlen($em) > 320) && strlen($em) !== 0) {
							$returnData['error'] = "<br>Illegal input detected! Aborting Request.";
							return;
						}

						// check for duplicates, but do not consider blank as duplicate
						$emDupRes = $db->fetchValue("SELECT COUNT(*) FROM `users` WHERE `email` = ?", [$em])['data'];
						if ($emDupRes > 0 && $em !== "") {
							$returnData['error'] = "<br>Email address is already in use! Please select another email address.";
							return;
						}
					}

					if (($data['fieldName']) === 'status') {
						global $myAuth;

						// get group(s) to which the target user belongs
						$targetGroupList = $db->fetchColumn("SELECT `usergroupId` FROM `userGroupAccess` WHERE `userId` = ?", [$data['userId']])['data'];

						if ($myAuth->checkSA() && $data['newVal'] === 0) {

							$saDisCount = $db->fetchValue("SELECT COUNT(`status`) FROM users WHERE id IN (SELECT userId FROM userGroupAccess WHERE usergroupId = ?) AND `status` = 0", [$saGroupId])['data'];

							if (($saDisCount + 1) === $saCount && in_array($saGroupId, $targetGroupList)) {
								$returnData['error'] = "<br>At least one superadmin user must be enabled at all times. <br><br><strong>User was NOT DISABLED.</strong>";
								return;
							}
						}
					}


				default:
					// execute SQL update on inputted fields for update (non-usergroup type)
					$data['newVal'] = $data['newVal'] === "" ? null : $data['newVal'];
					$db->update('users', [$data['fieldName'] => $data['newVal']], "id = ?", [$data['userId']]);

					$returnData['data'] = $data;

					break;
			}

			break;

		# -------------------------------- #
		# UPDATE PERMISSION OBJECT SECTION #
		# -------------------------------- #

		case 'permission':

			// load up our global permisison schema
			$section = $data['section']; // conceptual permission group
			$g_section = substr($section, 2); // granular permission item
			$newPermVal = $data['newVal']; // the value which all associated values of the concept permission will receive

			// load and process permission schema
			$c_permItems = json_decode(file_get_contents("inc/js/perm_items_generic.json") ?? '', true);
			if ((isset($c_permItems[$data['perm']]))) {
				$updPermArr = $c_permItems[$data['perm']]; // crossreferenced array list of granular permission entries to update
			} else {
				$returnData['error'] = "<br>Unable to find permisison '{$data['perm']}' to update! <br><br>This permisison value may have been removed from the official schema. Removing entry from user's permisison set.";

				// FYI: We will be removing the offending property from ALL USERS to ensure all permission sets are as valid as possible.
				// remove the offending stale JSON value out of the concept group list
				$db->prepare("UPDATE `users` SET `accessDef` = JSON_REMOVE(`accessDef`, CONCAT('$.', ?, '.', ?))");
				$db->executePrepared([$data['section'], $data['perm']]);

				// set vars to reload the same user with updated permission view
				$returnData['reload'] = true;
				$returnData['data']['userId'] = $data['userId'];

				return;
			}

			foreach ($updPermArr as $g_permKey) {
				// FYI: We have to use an inline bool -> string conversion via ternary operator sans SQL preparation b/c using a substitute '?' will wrap a quote around the argument and force to string (we want an actual BOOL sent through JSON_SET's 3rd param).
				$db->prepare("UPDATE `users` SET `accessDef` = JSON_SET(`accessDef`, CONCAT('$.', ?, '.', ?), " . ($newPermVal === true ? 'true' : 'false') . ") WHERE `id` = ?");
				$db->executePrepared([$g_section, $g_permKey, $data['userId']]);
			}

			// finally update the actual master 'concept' permission with the new value
			$db->prepare("UPDATE `users` SET `accessDef` = JSON_SET(`accessDef`, CONCAT('$.', ?, '.', ?), " . ($newPermVal === true ? 'true' : 'false') . ") WHERE `Id` = ?");
			$db->executePrepared([$data['section'], $data['perm'], $data['userId']]);

			$returnData['data'] = $data;

			break;

		default:
			$returnData['error'] = "<br>Invalid request detected.";
			break;
	}

	// return vars for screen loading/checking/etc.
	$gIdLoad = $db->fetchColumn("SELECT `userGroupId` FROM `userGroupAccess` WHERE `userId` = ? ORDER BY `userGroupId` DESC", [$data['userId']])['data'];

	// return original usergroup id unless that doesn't exist anymore, then return first entryfrom array

	// Group load logic, returning groupd ID/name to reload
	if ($origUgId === -1) {
		$returnData['loadUg'] = -1;
	} elseif (empty($gIdLoad)) {
		$returnData['loadUg'] = $origUgId;
	} elseif (in_array($origUgId, $gIdLoad)) {
		$returnData['loadUg'] = $origUgId;
	} else {
		$returnData['loadUg'] = $gIdLoad[0];
	}

	// get usergroup name
	if ($returnData['loadUg'] > 0) $returnData['ugName'] = $db->fetchValue('SELECT `name` FROM `userGroups` WHERE `id` = ?', [$returnData['loadUg']])['data'];

	$res_uname = $db->fetchValue("SELECT `name` FROM `users` WHERE `id` = ?", [$data['userId']])['data'];

	$returnData['data']['userId'] = $data['userId'];
	$returnData['data']['name'] = $res_uname;
}

function getGroupOnlyList(array $data, rixPDO &$db, array &$returnData)
{
	checkParams($data, ['groupId']);

	// get instances of username with no other group associations except the one being queried
	$resOnlyGr = $db->fetchColumn("SELECT NAME 
	FROM
		users 
	WHERE
		id IN (
		SELECT
			userId 
		FROM
			( SELECT userId, usergroupId, COUNT(*) FROM userGroupAccess GROUP BY userId HAVING COUNT( userId ) = 1 ) AS UGC 
		WHERE
		userGroupId = ?)", [$data['groupId']])['data'];

	$returnData['naData'] = $resOnlyGr;
}

function groupPermView(array $data, rixPDO &$db, array &$returnData)
{
	checkParams($data, ['ugId']);
	extract($data);

	// setup loop for each of the 3 file manager-based editors and their associated table names and related access table pairings
	foreach (['itemFolderAccess' => 'itemFolders', 'loginsFolderAccess' => 'loginsFolders', 'testFolderAccess' => 'testFolders'] as $acName => $fldName) {

		// get the individual folder access permissions for the requested group ID being queried. We use a JOIN simply to return the name of the folders.
		$q = <<<SQL
		SELECT fAc.`folderId`, `fRoot`.`name`, `usRoot`.`name` AS owner, JSON_EXTRACT(fAc.`accessDef`, '$.c_items') AS `acPerms`
		FROM `{$acName}` AS `fAc`
		INNER JOIN `{$fldName}` AS `fRoot` ON
				`fAc`.`folderId` = `fRoot`.`id`
		LEFT JOIN users AS usRoot ON 
				`fRoot`.`owner` = `usRoot`.`id`
		WHERE `fAc`.`userGroupId` = ?;
		SQL;

		// execute the query
		$fPermSet[$fldName] = $db->fetchTable($q, [$ugId], "folderId")['data'];

		// recursive function to get the nested folder structure all the way up to 'home'. We have to use an anonymous function style since we cannot redeclare the function since we're inside a foreach.
		$fstruct_recurs = function ($baseFid, $fId, &$fpVar, &$db, $fnVar, &$fstruct_recurs) {
			$parId = $db->fetchValue("SELECT `parent` FROM `{$fnVar}` WHERE `id` = ?", [$fId])['data'];
			$parName = $db->fetchValue("SELECT `name` FROM `{$fnVar}` WHERE `id` = ?", [$parId])['data'];

			if ($parId === 1) {
				array_unshift($fpVar[$baseFid]["parents"], [$parId => $parName]);
				return;
			} else {
				array_unshift($fpVar[$baseFid]["parents"], [$parId => $parName]);
				$fstruct_recurs($baseFid, $parId, $fpVar, $db, $fnVar, $fstruct_recurs);
			}
		};

		// launch recursive operation to get nested folder list
		foreach (array_keys($fPermSet[$fldName]) as $fId) {
			$fPermSet[$fldName][$fId]["parents"] = [];
			$fstruct_recurs($fId, $fId, $fPermSet[$fldName], $db, $fldName, $fstruct_recurs);
		}

		// convert the JSON permission sets into arrays so we can handle them in the JS part easier
		array_walk($fPermSet[$fldName], function (&$val, $key) {
			$val['acPerms'] = json_decode($val['acPerms'], true);
		});
	}

	// apply the collected data for all 3 file manager editors and place them into the return variable to return to JS
	$returnData['fPermSet'] = $fPermSet;
}

function logView(array $data, rixPDO &$db, array &$returnData)
{

	if (!file_exists('../logs/operation_actions.log')) touch('../logs/operation_actions.log');

	$oper_log_raw = file_get_contents('../logs/operation_actions.log');
	$oper_log = explode("\n\n", $oper_log_raw);

	$output = [];
	foreach ($oper_log as $k => $log_entry) {

		if ($log_entry === "") continue;
		if ($log_entry[0] !== "[") continue;

		$pRes = preg_match('/(?<=\[)(.+?)(?=\]).+?(?<=\[)(.+?)(?=\]).+?(?<=\[)(.+?)(?=\])(?:.\t|\t\n)(.*)/sm', $log_entry, $matches);
		$operVals = explode(":", $matches[2]);
		$actVals = explode("|", $matches[3]);
		// $matches[3] = str_replace("\t", "~", $matches[3]);

		array_push($output, [
			'date' => trim($matches[1]),
			'operatorName' => $operVals[0],
			'operatorId' => $operVals[1],
			'location' => $actVals[0],
			'action' => $actVals[1],
			'body' => trim($matches[4])
		]);
	}

	$output = array_reverse($output); // show newest entries on top
	$returnData['data'] = $output;
}

function logMaint(array $data, rixPDO &$db, array &$returnData)
{
	global $myAuth;
	if ($myAuth->checkSA() === false) {
		$returnData['error'] = "Unauthorized operation attempt.";
		return;
	}

	checkParams($data, ['lmType']);

	# Set date comparison value based on log maintenance input #
	switch ($data['lmType']) {
		case '1m': // remove > 1 month
			$compDate = date("Y-m-d", strtotime("-1 month"));
			break;

		case '1w': // remove > 1 week
			$compDate = date("Y-m-d", strtotime("-1 week"));
			break;

		case '1d': // remove > 1 day
			$compDate = date("Y-m-d", strtotime("-1 day"));
			break;

		case 'c': // remove by custom date
			$compDate = $data['lmCustDate'];
			break;

		case 'a': // remove all
			file_put_contents('../logs/operation_actions.log', "");
			return;

		default:
			$returnData['error'] = "Invalid log maintenance type.";
			return;
	}

	# ------------------------------- #
	# Get existing oper log and parse #
	# ------------------------------- #

	$operLog = file_get_contents('../logs/operation_actions.log');
	preg_match_all('/\[\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\][\s\S]*?(?=\n\n)/', $operLog, $matches, PREG_SET_ORDER);
	$logEntries = array_column($matches, 0);

	# Filter out older than comp date entries #
	foreach ($logEntries as $key => $value) {
		$lDateMatch = preg_match('/\d{4}-\d{2}-\d{2}/', $value, $lMatch);
		$lDate = $lMatch[0];

		if ($lDate < $compDate) unset($logEntries[$key]);
	}

	$logEntries = array_values($logEntries); //reindex new log entries array

	# --------------------------------------------------- #
	# Overwrite existing operations log with filtered one #
	# --------------------------------------------------- #

	$newLog = "";

	if (!empty($logEntries)) {
		foreach ($logEntries as $k => $v) {
			$newLog .= $v . "\n\n";
		}

		file_put_contents('../logs/operation_actions.log', $newLog, LOCK_EX);
	} else {
		file_put_contents('../logs/operation_actions.log', "", LOCK_EX);
	}
}

function getLangStats(array $data, rixPDO &$db, array &$returnData): void
{
	$statData = $db->fetchTable("SELECT `defLang` as 'sLang', COUNT(*) as 'userCt' FROM `users` GROUP BY `defLang`")['data'];
	$returnData['statData'] = $statData;
}

// this will always be called when the script ends even if a fatal error occurred
// it encodes the $returnData to JSON and it adds an error message if a fatal PHP error occurred
// this error message is registered under the 'fatalError' key and includes the file name of the PHP script and the line number of the error
// all other errors (e.g. database) were registere under the 'error' key
function outputJSON()
{
	global $returnData, $action;
	if (!isset($returnData['action'])) {
		$returnData['action'] = $action;
	}

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
