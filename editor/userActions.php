<?php

	register_shutdown_function('outputJSON');

	require_once __DIR__ . '/inc/php/initBackend.php';
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
	$db = $app->getDatabaseInstance();

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

		if (oasysRejectUnknownAction(__FILE__, $action, $returnData)) exit;
		$action($data, $db, $returnData);
	} else {
		// forward on the fail message from the auth class
		$returnData = $permAuth->returnData;
	}

# --------------------- #
# Search group function #
# --------------------- #
	function searchManager($data, rixPDO &$db, &$returnData)
	{
		global $myAuth;

		checkParams($data, ['searchTerm']);
		$searchTerm = trim((string)$data['searchTerm']);
		if ($searchTerm === '') {
			$returnData['data'] = ['users' => [], 'groups' => []];
			return;
		}

		$likeTerm = oasysLikeContainsPattern($searchTerm);
		$canSeeSuperadmins = $myAuth->checkSA();
		$hideSuperUsers = $canSeeSuperadmins ? '' : "
			AND u.id NOT IN (
				SELECT uga.userId FROM userGroupAccess uga
				JOIN userGroups hiddenGroup ON hiddenGroup.id = uga.usergroupId
				WHERE hiddenGroup.name = 'superadmin'
			)";

		$users = $db->fetchTable(
			"SELECT u.id, u.name, u.email
			 FROM users u
			 WHERE (u.name LIKE ? ESCAPE '=' OR u.email LIKE ? ESCAPE '=')
			 $hideSuperUsers
			 ORDER BY u.name",
			[$likeTerm, $likeTerm]
		)['data'];

		$groupVisibility = $canSeeSuperadmins ? '' : "AND name <> 'superadmin'";
		$groups = $db->fetchTable(
			"SELECT id, name FROM userGroups WHERE name LIKE ? ESCAPE '=' $groupVisibility ORDER BY name",
			[$likeTerm]
		)['data'];

		$userResults = [];
		$userIndexes = [];
		foreach ($users as $index => $user) {
			$userResults[] = [
				'id' => $user['id'],
				'name' => $user['name'],
				'email' => $user['email'],
				'groups' => []
			];
			$userIndexes[(string)$user['id']] = $index;
		}

		if ($userIndexes) {
			$placeholders = implode(',', array_fill(0, count($userIndexes), '?'));
			$visibleGroupSql = $canSeeSuperadmins ? '' : "AND g.name <> 'superadmin'";
			$memberships = $db->fetchTable(
				"SELECT uga.userId, g.id, g.name
				 FROM userGroupAccess uga
				 JOIN userGroups g ON g.id = uga.usergroupId
				 WHERE uga.userId IN ($placeholders) $visibleGroupSql
				 ORDER BY g.name",
				array_keys($userIndexes)
			)['data'];
			foreach ($memberships as $membership) {
				$userResults[$userIndexes[(string)$membership['userId']]]['groups'][] = [
					'id' => $membership['id'],
					'name' => $membership['name']
				];
			}
		}

		$groupResults = [];
		$groupIndexes = [];
		foreach ($groups as $index => $group) {
			$groupResults[] = [
				'id' => $group['id'],
				'name' => $group['name'],
				'users' => []
			];
			$groupIndexes[(string)$group['id']] = $index;
		}

		if ($groupIndexes) {
			$placeholders = implode(',', array_fill(0, count($groupIndexes), '?'));
			$members = $db->fetchTable(
				"SELECT uga.usergroupId, u.id, u.name
				 FROM userGroupAccess uga
				 JOIN users u ON u.id = uga.userId
				 WHERE uga.usergroupId IN ($placeholders)
				 $hideSuperUsers
				 ORDER BY u.name",
				array_keys($groupIndexes)
			)['data'];
			foreach ($members as $member) {
				$groupResults[$groupIndexes[(string)$member['usergroupId']]]['users'][] = [
					'id' => $member['id'],
					'name' => $member['name']
				];
			}
		}

		$returnData['data'] = ['users' => $userResults, 'groups' => $groupResults];
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

function fetchImportUserGroups(array $data, rixPDO &$db, array &$returnData)
{
	global $myAuth;

	if (!$myAuth->checkAdmin() && !$myAuth->checkSA()) {
		$returnData['error'] = "Unauthorized operation.";
		return;
	}

	$returnData['groups'] = $db->fetchTable(
		"SELECT `id`, `name` FROM `userGroups` WHERE `name` NOT IN ('admin', 'superadmin') ORDER BY `name`",
		[]
	)['data'];
}

function importUsers(array $data, rixPDO &$db, array &$returnData)
{
	global $myAuth, $settings;

	if (!$myAuth->checkAdmin() && !$myAuth->checkSA()) {
		$returnData['error'] = "Unauthorized operation.";
		return;
	}

	if (!isset($data['users']) || !is_array($data['users']) || count($data['users']) === 0) {
		$returnData['error'] = "No users were submitted for import.";
		return;
	}

	$options = $data['options'] ?? [];
	$userGroupId = intVal($options['userGroupId'] ?? 0);
	$createHomeFolder = !empty($options['createHomeFolder']);
	$grantGroupRead = !empty($options['grantGroupRead']);

	$targetGroup = $db->fetchRow(
		"SELECT `id`, `name` FROM `userGroups` WHERE `id` = ? AND `name` NOT IN ('admin', 'superadmin')",
		[$userGroupId]
	);
	if ($targetGroup['rows'] === 0) {
		$returnData['error'] = "Please select a regular user group. The admin and superadmin groups are not allowed for CSV import.";
		return;
	}

	$validAcctTypes = array_unique(array_merge(['LOCAL', 'LDAP', 'SSO'], array_values($settings['authMethods'] ?? [])));
	$preparedUsers = [];
	$usernames = [];
	$emails = [];

	foreach ($data['users'] as $idx => $user) {
		$line = $idx + 1;
		$username = trim($user['username'] ?? '');
		$email = trim($user['email'] ?? '');
		$acctType = strtoupper(trim($user['login_type'] ?? ''));
		$password = strval($user['password'] ?? '');

		if ($username === '' || preg_match('/[^.A-Za-z0-9@+_-]/', $username) || strlen($username) > 64) {
			$returnData['error'] = "Invalid username on import row {$line}.";
			return;
		}

		if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
			$returnData['error'] = "Invalid email address on import row {$line}.";
			return;
		}

		if (!in_array($acctType, $validAcctTypes, true)) {
			$returnData['error'] = "Invalid login type on import row {$line}. Allowed values are LOCAL, LDAP or SSO.";
			return;
		}

		if ($acctType === "LOCAL" && $password === '') {
			$returnData['error'] = "LOCAL users require a password on import row {$line}.";
			return;
		}

		if ($acctType !== "LOCAL" && $password !== '') {
			$returnData['error'] = "Password must be blank for LDAP and SSO users on import row {$line}.";
			return;
		}

		if (strlen($password) > 50) {
			$returnData['error'] = "Password exceeds 50 characters on import row {$line}.";
			return;
		}

		$usernameKey = strtolower($username);
		if (isset($usernames[$usernameKey])) {
			$returnData['error'] = "Duplicate username '{$username}' found in the CSV import.";
			return;
		}
		$usernames[$usernameKey] = $username;

		$emailKey = strtolower($email);
		if (isset($emails[$emailKey])) {
			$returnData['error'] = "Duplicate email '{$email}' found in the CSV import.";
			return;
		}
		$emails[$emailKey] = $email;

		$preparedUsers[] = [
			'username' => $username,
			'email' => $email,
			'acctType' => $acctType,
			'password' => $password
		];
	}

	$existingUsers = importUsersFetchExisting($db, "SELECT `name` FROM `users` WHERE LOWER(`name`) IN ", array_keys($usernames));
	if (!empty($existingUsers)) {
		$returnData['error'] = "Import aborted. The following username(s) already exist: " . implode(', ', $existingUsers);
		return;
	}

	$existingEmails = importUsersFetchExisting($db, "SELECT `email` FROM `users` WHERE LOWER(`email`) IN ", array_keys($emails));
	if (!empty($existingEmails)) {
		$returnData['error'] = "Import aborted. The following email address(es) already exist: " . implode(', ', $existingEmails);
		return;
	}

	if ($createHomeFolder) {
		$folderConflicts = importUsersFindHomeFolderConflicts($db, array_values($usernames));
		if (!empty($folderConflicts)) {
			$returnData['error'] = importUsersFormatFolderConflictError($folderConflicts);
			return;
		}
	}

	if (!empty($options['dryRun'])) {
		$returnData['summary'] = [
			'validatedUsers' => count($preparedUsers),
			'createHomeFolder' => $createHomeFolder,
			'grantGroupRead' => $grantGroupRead
		];
		return;
	}

	$db->startTransaction();
	try {
		$createdUsers = 0;
		$createdHomeFolders = 0;

		foreach ($preparedUsers as $user) {
			$finalPass = $user['acctType'] === "LOCAL" ? password_hash($user['password'], PASSWORD_DEFAULT) : "";
			$userAccessDef = importUsersBuildUserAccessDef();

			$db->insert('users', [
				'id' => null,
				'name' => $user['username'],
				'password' => $finalPass,
				'email' => $user['email'],
				'accessDef' => $userAccessDef,
				'homeaccess' => $createHomeFolder ? 1 : null,
				'status' => 1,
				'acct_type' => $user['acctType']
			]);
			importUsersAssertDb($db, "Failed to create user '{$user['username']}'.");
			$newUserId = $db->results()['id'];

			$db->insert('userGroupAccess', [
				'userId' => $newUserId,
				'usergroupId' => $userGroupId
			]);
			importUsersAssertDb($db, "Failed to assign user group for '{$user['username']}'.");

			if ($createHomeFolder) {
				importUsersCreateHomeFolders($db, $user['username'], $newUserId, $userGroupId, $grantGroupRead);
				$createdHomeFolders++;
			}

			$createdUsers++;
		}

		$db->commit();

		$returnData['summary'] = [
			'createdUsers' => $createdUsers,
			'createdHomeFolders' => $createdHomeFolders,
			'grantGroupRead' => $grantGroupRead
		];
		$returnData['logMsg'] = "CSV user import completed. {$createdUsers} users created.";
	} catch (Throwable $e) {
		$db->rollback();
		$returnData['error'] = $e->getMessage();
	}
}

function importUsersFetchExisting(rixPDO &$db, string $queryPrefix, array $values): array
{
	if (empty($values)) return [];
	$params = array_map('strtolower', $values);
	$res = $db->fetchColumn($queryPrefix . $db->variableString(count($params)), $params);
	return array_values(array_filter($res['data'] ?? [], fn($v) => $v !== null && $v !== ''));
}

function importUsersFindHomeFolderConflicts(rixPDO &$db, array $usernames): array
{
	$conflicts = [];
	$folderChecks = [
		'Content Manager' => 'itemFolders',
		'Test Manager' => 'testFolders',
		'Test Taker Manager' => 'loginsFolders'
	];

	foreach ($folderChecks as $label => $table) {
		foreach ($usernames as $username) {
			$count = $db->fetchValue("SELECT COUNT(*) FROM `{$table}` WHERE `parent` = 1 AND `name` = ?", [$username])['data'];
			if (intVal($count) > 0) {
				$conflicts[$label][] = $username;
			}
		}
	}

	return $conflicts;
}

function importUsersFormatFolderConflictError(array $folderConflicts): string
{
	$out = "<div style='max-width:520px;'>";
	$out .= "<strong>Import aborted.</strong><br>";
	$out .= "Home folders already exist for the following imported users. No users or folders were created.";
	$out .= "<ul style='margin:10px 0 0 18px; padding:0;'>";

	foreach ($folderConflicts as $manager => $usernames) {
		$cleanManager = htmlspecialchars($manager, ENT_QUOTES, 'UTF-8');
		$cleanNames = array_map(
			fn($name) => htmlspecialchars($name, ENT_QUOTES, 'UTF-8'),
			array_unique($usernames)
		);
		$out .= "<li><strong>{$cleanManager}:</strong> " . implode(', ', $cleanNames) . "</li>";
	}

	$out .= "</ul></div>";
	return $out;
}

function importUsersBuildUserAccessDef(): string
{
	$permFile = 'inc/js/perm_items_generic.json';
	$cPermItems = file_exists($permFile) ? json_decode(file_get_contents($permFile) ?: '{}', true) : [];

	$jArr = ['c_items' => [], 'items' => []];
	foreach ($cPermItems as $k1 => $v1) {
		$jArr['c_items'][$k1] = false;
		foreach ($v1 as $v2) {
			$jArr['items'][$v2] = false;
		}
	}

	return json_encode($jArr);
}

function importUsersBuildFolderAccessDef(bool $readAccess): string
{
	$permFile = 'inc/js/perm_items.json';
	$permItems = file_exists($permFile) ? json_decode(file_get_contents($permFile) ?: '{}', true) : [];

	$jArr = ['c_items' => [], 'items' => []];
	foreach ($permItems as $k1 => $v1) {
		$jArr['c_items'][$k1] = false;
		foreach ($v1 as $v2) {
			$jArr['items'][$v2] = false;
		}
	}

	if ($readAccess) {
		$jArr['c_items']['Read'] = true;
		foreach (($permItems['Read'] ?? []) as $readPerm) {
			$jArr['items'][$readPerm] = true;
		}
	}

	return json_encode($jArr);
}

function importUsersCreateHomeFolders(rixPDO &$db, string $folderName, int $ownerId, int $targetGroupId, bool $grantGroupRead): void
{
	$folderSets = [
		['folderTable' => 'itemFolders', 'accessTable' => 'itemFolderAccess'],
		['folderTable' => 'testFolders', 'accessTable' => 'testFolderAccess'],
		['folderTable' => 'loginsFolders', 'accessTable' => 'loginsFolderAccess']
	];

	$regularGroupIds = $db->fetchColumn("SELECT `id` FROM `userGroups` WHERE `name` NOT IN ('admin', 'superadmin')", [])['data'];

	foreach ($folderSets as $folderSet) {
		$db->insert($folderSet['folderTable'], [
			'id' => null,
			'name' => $folderName,
			'parent' => 1,
			'owner' => $ownerId
		]);
		importUsersAssertDb($db, "Failed to create home folder '{$folderName}' in {$folderSet['folderTable']}.");
		$folderId = $db->results()['id'];

		foreach ($regularGroupIds as $groupId) {
			$readAccess = $grantGroupRead && intVal($groupId) === $targetGroupId;
			$db->insert($folderSet['accessTable'], [
				'id' => null,
				'folderId' => $folderId,
				'userGroupId' => $groupId,
				'inherited' => null,
				'accessDef' => importUsersBuildFolderAccessDef($readAccess)
			]);
			importUsersAssertDb($db, "Failed to create folder access entries for '{$folderName}'.");
		}
	}
}

function importUsersAssertDb(rixPDO &$db, string $message): void
{
	$res = $db->results();
	if (($res['error'] ?? false) !== false) {
		throw new Exception($message);
	}
}

# ------------------------ #
# Begin standard functions #
# ------------------------ #

	function updateGroupSettings(array $data, rixPDO &$db, array &$returnData)
	{
		global $myAuth, $languages, $skins;

		$returnData['forceReload'] = false;
		checkParams($data, ['editData', 'userGroup']);

		$userGroupId = $data['userGroup'];
		$userGroupName = $db->fetchValue("SELECT `name` FROM `userGroups` WHERE id=?", [$userGroupId])['data'];

		/* -----update module editor access and enforce core editor sets---------------------------- */

		// integrate updated module values
		$editorData = $data['editData'];
		foreach ($editorData as $sKey => $sVals) {
			if (!is_array($sVals)) continue;
			foreach ($sVals as $k2 => $v2) {
				$editorData[$sKey][$k2] = (isset($v2['value'])) ? $v2['value'] : $v2;
			}
		}

		$user_access_level = 0; // default standard user
		if ($userGroupName === "admin") $user_access_level = 50; // regular admin
		// System Settings editor removed for non-elevated admins in the authcommonfunctions include
		if ($userGroupName === "superadmin") $user_access_level = 150; // superadmin

		global $config;
		$full_edt_list = $config->getDefaults()['editorButtons']['choices']; // fetch core editor list sans modules
		//remove all buttons that have a property 'module' => true
		foreach ($full_edt_list as $button => $properties) {
			if (isset($properties['module']) && $properties['module'] === true) {
				unset($full_edt_list[$button]);
			}
		}

		// add standard editors and set value based on access level of target group
		foreach ($full_edt_list as $el_key => $el_val) {
			$editorData['editorButtons'][$el_key] = $el_val['accesslevel'] <= $user_access_level;
		}

		/* ----------------------------------------------------------------------------------------- */

		$editorData["updateStamp"] = (new DateTime())->format(DateTime::ATOM);
		$db->update("userGroups", ["accessDef" => json_encode($editorData, JSON_PRETTY_PRINT)], "`id`=?", [$userGroupId]);

		// sent reload request if editing own group
		if (in_array($userGroupId, $myAuth->usergroup)) $returnData['forceReload'] = true;
	}

	function fetchGroupSettings(array $data, rixPDO &$db, array &$returnData)
	{
		checkParams($data, ['groupId']);

		global $myAuth, $config;
		$settingsDefaults = $config->getDefaults();

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

	// foreach ($settingsDefaults as $usFilterKey => $value) {
	// 	if ($value['scope'] === SETTINGS_USERGROUP) {

	// 		if (!isset($acDefArr[$usFilterKey])) {
	// 			$db->execute("UPDATE `userGroups` SET `accessDef` = JSON_SET(`accessDef`, '$.{$usFilterKey}', JSON_OBJECT()) WHERE `id` = ?", [$targetID]);
	// 		}

	// 		foreach (array_keys($value['choices']) as $choice) {
	// 			if (!isset($acDefArr[$usFilterKey][$choice])) {
	// 				// $db->prepare("UPDATE `userGroups` SET `accessDef` = JSON_SET(`accessDef`, CONCAT('$.{$usFilterKey}.', ?), true) WHERE `id` = ?");
	// 				$db->prepare("UPDATE `userGroups` SET `accessDef` = JSON_SET(`accessDef`, CONCAT('$.{$usFilterKey}.', ?), false) WHERE `id` = ?");
	// 				$db->executePrepared([$choice, $targetID]);
	// 			}
	// 		}
	// 	}
	// }

	# --------------------------------------------------------- #
	# REMOVED SETTINGS -> ACCESSDEF JSON SCHEMA SYNCHRONIZATION #
	# --------------------------------------------------------- #

	// foreach ($acDefArr as $settingName => $acKey) {
	// 	// if top level setting is removed, remove the json db entry as well
	// 	if (!isset($userSettings[$settingName])) {
	// 		$db->prepare("UPDATE `userGroups` SET `accessDef` = JSON_REMOVE(`accessDef`, CONCAT('$.', ?)) WHERE `id` = ?");
	// 		$db->executePrepared([$settingName, $targetID]);
	// 		unset($acDefArr[$settingName]);
	// 		continue;
	// 	}

	// 	// if sub-level setting (choice) is removed from settings key, remove the json db entry as well
	// 	foreach (array_keys($acKey) as $acEntry) {
	// 		if (!in_array($acEntry, array_keys($settingsDefaults[$settingName]['choices']))) {
	// 			$db->prepare("UPDATE `userGroups` SET `accessDef` = JSON_REMOVE(`accessDef`, CONCAT('$.{$settingName}.', ?)) WHERE `id` = ?");
	// 			$db->executePrepared([$acEntry, $targetID]);
	// 			unset($acDefArr[$settingName][$acEntry]);
	// 		}
	// 	}
	// }

		# -------------------------------------------------------- #
		# CUSTOM EDITORBUTTONS FILTERING AND MODIFICATION ROUTINES #
		# -------------------------------------------------------- #

		$modEditors = \Oasys\OasysSettings::findMods();

		// transform module editor array structure to keep compatible with old processing code below
		$modEditors = array_merge(
			...array_map(
				fn($mod) => $mod['editor_sections'] ?? [],
				$modEditors
			)
		);

		// get standard non-editorButton value
		$returnSettingValues = json_decode($db->fetchValue("SELECT `accessdef` FROM `userGroups` WHERE `id` = ?", [$targetID])['data'] ?? '[]', true);

		// if the standard accessDef set is empty/corrupt/invalid, recreate
		if (empty($returnSettingValues)) {
			$returnSettingValues['editorButtons'] = [];
		}

		// get access level of target group
		$group_access_level = 0;
		if ($adminID === $targetID) $group_access_level = 50;
		if ($superID === $targetID) $group_access_level = 150;

		// editor buttons - add friendly label to return array and insert keys in order according to system settings keys
		$ebArr = [];

		foreach ($modEditors as $mKey => $mVal) {
			if ($group_access_level < $mVal['accesslevel']) {
				$ebArr[$mKey]['value'] = false;
				$ebArr[$mKey]['ro'] = true;
			} else {
				$ebArr[$mKey]['value'] = $returnSettingValues['editorButtons'][$mKey] ?? false;
			}
			$ebArr[$mKey]['name'] = $mVal['name'];
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
		global $myAuth;

		$origUgId = $data['origUgId'] ?? -1;

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
				$allowedAccountFields = ['userGroups', 'bad_logins', 'last_bad_pass', 'name', 'email', 'status', 'homeaccess', 'defLang'];
				if (!isset($data['fieldName']) || !in_array($data['fieldName'], $allowedAccountFields, true)) {
					$returnData['error'] = "Invalid account field requested.";
					return;
				}
				if (in_array($data['fieldName'], ['status', 'homeaccess'], true) && !in_array($data['newVal'], [0, 1, '0', '1', false, true], true)) {
					$returnData['error'] = "Invalid boolean account value.";
					return;
				}
				if ($data['fieldName'] === 'defLang' && !in_array($data['newVal'], ['DE', 'EN', 'FR'], true)) {
					$returnData['error'] = "Invalid editor language.";
					return;
				}
				if ($data['fieldName'] === 'bad_logins' && intval($data['newVal']) !== 0) {
					$returnData['error'] = "Invalid bad-login reset value.";
					return;
				}
				if ($data['fieldName'] === 'last_bad_pass' && $data['newVal'] !== '') {
					$returnData['error'] = "Invalid bad-password timestamp reset value.";
					return;
				}

				// get the id of the superadmin group
				$saGroupId = $db->fetchValue("SELECT `id` FROM `userGroups` WHERE `name` = 'superadmin'")['data'];
				$admGroupId = $db->fetchValue("SELECT `id` FROM `userGroups` WHERE `name` = 'admin'")['data'];

				// get number of superadmins
				$saCount = $db->fetchValue("SELECT COUNT(*) FROM `userGroupAccess` WHERE `usergroupId` = ?", [$saGroupId])['data'];

				switch ($data['fieldName']) {

					case 'userGroups':
						$newUgArr = $data['newVal'];
						if (!is_array($newUgArr) || !isset($data['oldVal']) || !is_array($data['oldVal'])) {
							$returnData['error'] = "Invalid user-group data.";
							return;
						}

						$validGroupIds = array_map('intval', $db->fetchColumn("SELECT `id` FROM `userGroups`")['data']);
						foreach ($newUgArr as $requestedGroupId => $enabled) {
							$requestedGroupId = intval($requestedGroupId);
							if (!in_array($requestedGroupId, $validGroupIds, true) || !is_bool($enabled)) {
								$returnData['error'] = "Invalid user-group data.";
								return;
							}
							if ($requestedGroupId === intval($saGroupId) && !$myAuth->checkSA()) {
								$returnData['error'] = "Only superadmins may change superadmin membership.";
								return;
							}
							if ($requestedGroupId === intval($admGroupId) && !$myAuth->checkElevatedAdmin() && !$myAuth->checkSA()) {
								$returnData['error'] = "Only elevated administrators and superadmins may change admin membership.";
								return;
							}
						}

						// if the target user is trying to have both superadmin and admin groups included, block
						if (($newUgArr[$admGroupId] ?? false) === true && ($newUgArr[$saGroupId] ?? false) === true) {
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
									if (intval($grpId) === intval($saGroupId)) {
										$isSuperAdmin = true;
										break;
									}
								}


								// Removing superadmin membership must leave another enabled superadmin.
								$removingSuperadmin = intval($ugId) === intval($saGroupId) && $isSuperAdmin;
								$remainingEnabledSa = $removingSuperadmin ? $db->fetchValue(
									"SELECT COUNT(*) FROM users
									 WHERE id IN (SELECT userId FROM userGroupAccess WHERE usergroupId = ?)
									 AND status = 1 AND id <> ?",
									[$saGroupId, $data['userId']]
								)['data'] : 1;
								if ($removingSuperadmin && intval($remainingEnabledSa) < 1) {
									$returnData['logMsg'] = "<br>At least one enabled superadmin user must exist at all times. <br><br><strong>User was NOT REMOVED from superadmin group.</strong>";
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

							if (intval($data['userId']) === intval($myAuth->userid) && intval($data['newVal']) === 0 && (in_array($admGroupId, $targetGroupList) || in_array($saGroupId, $targetGroupList))) {
								$returnData['error'] = "<br>Administrators and superadmins cannot deactivate their own account.";
								return;
							}

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
				if (($data['perm'] ?? '') === 'Elevated Administrator' && !$myAuth->checkSA()) {
					$returnData['error'] = "Only superadmins may change elevated-administrator status.";
					return;
				}
				if ($data['section'] !== 'c_items' || !is_bool($data['newVal'])) {
					$returnData['error'] = "Invalid permission update requested.";
					return;
				}

				// load up our global permisison schema
				$section = $data['section']; // conceptual permission group
				$g_section = substr($section, 2); // granular permission item
				$newPermVal = $data['newVal']; // the value which all associated values of the concept permission will receive

				// load and process permission schema
				$c_permItems = json_decode(file_get_contents("inc/js/perm_items_generic.json") ?? '', true);
				if ((isset($c_permItems[$data['perm']]))) {
					$updPermArr = $c_permItems[$data['perm']]; // crossreferenced array list of granular permission entries to update
				} else {
					$returnData['error'] = "<br>Unable to find permission '{$data['perm']}' in the current permission schema.";
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
