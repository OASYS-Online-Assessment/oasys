<?php

	/** @phan-file-suppress PhanUnusedGlobalFunctionParameter, PhanUnusedVariable, PhanRedefineFunction, PhanUnusedClosureParameter, PhanTypeArraySuspiciousNullable, PhanSuspiciousWeakTypeComparison, PhanUnusedVariableValueOfForeachWithKey, PhanUnusedPublicNoOverrideMethodParameter */

//the JSON output will happen, even if a fatal error prevents the script from finishing
	register_shutdown_function('outputJSON');
	require_once 'inc/php/database.php';
	require_once '../inc/php/rixPDO.php';
	require_once 'inc/php/MediaTool.php';
	require_once 'interactions/InteractionCompiler.php';

	$action = filter_input(INPUT_POST, 'action');
	if (!$action) {
		$action = "";
	}

	if ($action === 'lockItem') {
		// special case for the lockItem action, which must use filtered settings
		global $filterSettings;
		$filterSettings = true;
	}

	require_once '../inc/php/settings.php';

	$returnData = [];
	$returnData['action'] = $action;
	$returnData['error'] = false;

	$data = filter_input(INPUT_POST, 'data');
	if ($data) {
		$data = json_decode($data ?? '', true);
	}
	if (!$data) {
		$data = array();
	}
//data field must be separately JSON encoded before sending to get past max_input_vars limitation

	$db = new rixPDO($sql_db, $sql_user, $sql_password, $sql_host, '../logs/contentManager_errors.txt', 1, $returnData, 'error');

//special case for the lockItem action … it must not include anything that would cause the session to be updated
	if ($action === 'lockItem') {
		// do not update session
		lockItem($data, $db, $returnData);
		return;
	}
# ----------------------- #
# Authentication Includes #
# ----------------------- #
	$pageName = "content"; // set to the related 'editor button' string name (i.e., 'items')
	$isSubMod = false; // set true if a module page in a subdirectory
	$isActionFile = true; // set true if an "xxxActions.php" file

	require_once 'inc/php/authCommonFunctions.php'; // required for authentication inclusion

# ----------------------- #
# Translation Include 	  #
# ----------------------- #
	require_once 'inc/php/uiLang.php'; // required for translation inclusion
	$uiLang = new uiLang($settings['interfaceLanguage']);


# ------------------------------------------- #
# Inclusion of item/folder existence checking #
# ------------------------------------------- #
	$tableName = (object)['primary' => 'itemFolders', 'secondary' => 'itemGroups'];

	require_once 'inc/php/objectCommonFunctions.php';

# ------------------------------------------- #
# Inclusion of permission authenticator class #
# ------------------------------------------- #
	$permAuth = new permAuth($action, $data, $myAuth);

# ---------------------------------------- #
# Action permission authentication routine #
# ---------------------------------------- #
	$letMePass = $permAuth->permCheck($data);
	if ($letMePass === true) {
		switch ($action) {
			// the following action calls are in the permAuth class, and require redirection to said class
			case 'updatePerm':
			case 'fetchIgPerm':
				$permAuth->$action($data, $db, $permAuth->returnData, $myAuth);
				$returnData = $permAuth->returnData;
				break;

			// standard actions found in this contentActions file
			default:
				// preset the returnData var with anything the authenticator may have alraedy loaded in prior to sending to action
				$returnData = $permAuth->returnData;
				$action($data, $db, $returnData);
				break;
		}
	} else {
		// forward on the fail message from the auth class
		$returnData = $permAuth->returnData;
	}

	/*
				###############
				FUNCTIONS START
				###############
				*/

	function fetchLibrary(array $data, rixPDO &$db, array &$returnData): void
	{
		global $uiLang;
		// PARAMS:location, current
		checkParams($data, array('location'));

		// RETURNS: list, path, select, current
		// list = folder contents
		// path = complete path for breadcrumbs
		// select = selected itemgroup or folder (default = null)
		// current = the old location before fetching the library (e.g. on navigating)

		$location = $data['location'];

		$current = array('folder' => 1, 'path' => 'library');
		if (isset($data['current'])) {
			$current = $data['current'];
		}

		$user = $_SESSION['userid'];
		$query = "SELECT Concat('f', tf.id)     AS id,
            CAST(tf.id as UNSIGNED) AS 'dbId',
            Concat('f', parent) AS pid,
            'folder'            AS type,
            `name`,
            `name`              AS label,
            (SELECT EXISTS(SELECT wl.id FROM watchList wl WHERE wl.foreign_id = tf.id AND wl.foreign_table=1 AND wl.user_id=?)) AS watchList
        FROM   itemFolders tf
        WHERE  parent = ?
        UNION
        SELECT Concat('ig', tt.id)     AS id,
            CAST(tt.id as UNSIGNED) AS 'dbId',
            Concat('f', parent) AS pid,
            'itemGroup'                AS type,
            `name`,
            name                AS label,
            (SELECT EXISTS(SELECT wl.id FROM watchList wl WHERE wl.foreign_id = tt.id AND wl.foreign_table=2 AND wl.user_id=?)) AS watchList
        FROM   itemGroups tt
        WHERE  parent = ? ORDER BY LEFT(id, 1), `name`";

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
				case 'itemGroup':
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
		$pArr = [];

		/**
		 * @var array $ptypeArr Holds key/value pairs of the php function name as they relate to the js function button/function names.
		 */
		$ptypeArr = [
			'deleteSelection' => 'deleteSelection',
			'renameGroupOrFolder' => 'rename',
			'preview' => 'preview',
			'checkItem' => 'editSelection',
			'duplicateItemGroup' => 'duplicate',
			'fetchLibrary' => 'fetchLibrary',
			'newItemGroup' => 'newItemGroup',
			'newFolder' => 'newFolder',
			'fetchIgPerm' => 'fetchIgPerm'
		];

		// get group info for operating user
		$userGroupList = $db->fetchColumn("SELECT `name` FROM `userGroups` WHERE `id` IN
                    (SELECT `usergroupId` FROM `userGroupAccess` WHERE `userID` = ?)", [$myAuth->userid])['data'];

		// item permission admin/superadmin override check
		if (in_array('superadmin', $userGroupList) || in_array('admin', $userGroupList)) {
			foreach ($ptypeArr as $fnName => $jsFnName) {
				foreach ($results['data'] as $key => $item) {

					if ($item['type'] === 'folder') {
						if (!(in_array($fnName, ['fetchIgPerm', 'renameGroupOrFolder', 'deleteSelection', 'fetchLibrary']))) {
							continue;
						} // these are the only folder button types which are relevant for folders
						$pArr[$item['dbId']][$jsFnName] = true;
					}

					// button types for itemGroup objects
					if ($item['type'] === 'itemGroup') {
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
						if (!(in_array($fnName, ['fetchIgPerm', 'renameGroupOrFolder', 'deleteSelection', 'fetchLibrary']))) {
							continue;
						} // these are the only folder button types which are relevant for folders

						// folder owner check
						if ($db->fetchValue("SELECT `owner` FROM `itemFolders` WHERE id = ?", [intval($item['dbId'])])['data'] === $myAuth->userid) {
							$pArr[$item['dbId']][$jsFnName] = true;

							// regular permission check
						} else {
							$pArr[$item['dbId']][$jsFnName] = $permAuth->getAccessVal("itemgroup", $fnName, "itemObject", intval($item['dbId']));
						}
					}

					// button types for itemGroup objects
					if ($item['type'] === 'itemGroup') {
						// itemGroup in folder owner check
						if ($db->fetchValue("SELECT `owner` FROM `itemFolders` WHERE id = ?", [intval(ltrim($item['pid'], 'f'))])['data'] === $myAuth->userid) {
							$pArr[$item['dbId']][$jsFnName] = true;

							// regular itemGroup permission check
						} else {
							$pArr[$item['dbId']][$jsFnName] = $permAuth->getAccessVal("itemgroup", $fnName, "itemObject", intval(ltrim($item['pid'], 'f')));
						}
					}
				}
			}
		}

		// folder-level action permission access check
		foreach (['newItemGroup', 'newFolder', 'fetchIgPerm'] as $baseFnName) {
			// superadmin and folder owner bypass - they have full permission
			if ((in_array('superadmin', $userGroupList) || in_array('admin', $userGroupList)) || $db->fetchValue("SELECT `owner` FROM `itemFolders` WHERE id = ?", [$location])['data'] === $myAuth->userid) {
				$pArr['basePerm'][$baseFnName] = true;
			} else {
				$pArr['basePerm'][$baseFnName] = $permAuth->getAccessVal("itemgroup", $baseFnName, "itemObject", $location);
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
			$returnData['data']['select'] = $data['select'];
		} else {
			$returnData['data']['select'] = null;
		}
		$returnData['data']['loc'] = $location;
	}

	function fetchPreSelect($data, &$db, &$returnData): void
	{
		/* @var $db rixPDO */
		global $uiLang;
		checkParams($data, array('id', 'type'));
		$id = $data['id'];
		$type = $data['type'];
		if ($type === 1) {
			$query = "SELECT * FROM itemFolders WHERE `id` = ? LIMIT 1";
			$prefix = 'f';
		} else if ($type === 2) {
			$query = "SELECT * FROM itemGroups WHERE `id` = ? LIMIT 1";
			$prefix = 'ig';
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

	function fetchItemGroup(array $data, rixPDO &$db, array &$returnData): void
	{
		global $uiLang;

		// PARAMS: id
		checkParams($data, array('id'));
		if (isset($data['location'])) {
			$data['location'] = (int)$data['location'];
		} else {
			$data['location'] = false;
		}
		// RETURNS: group, items
		// group = all data from database concerning this item group
		// items = list of items in the group
		$query = "SELECT * FROM itemGroups WHERE id=?";
		$parameters = [$data['id']];
		$results = $db->fetchRow($query, $parameters);

		$returnData['data']['group'] = $results['data'];
		$query = "SELECT id, groupId, itemCode, name, languages, fields, link, metadata FROM items WHERE groupId=? ORDER BY itemCode";
		$results = $db->fetchTable($query, $parameters);

		$returnData['data']['items'] = $results['data'];
	}

	function fetchItem(array $data, rixPDO &$db, array &$returnData): void
	{

		// PARAMS: id
		checkParams($data, array('id'));

		global $uiLang;

		// RETURNS: item
		// item = all data from database concerning this item
		$query = "SELECT id, groupId, itemCode, name, languages, link, metadata FROM items WHERE id=?";
		$parameters = array($data['id']);
		$results = $db->fetchRow($query, $parameters);

		if ($results['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("The page has been deleted by another user. The view will be refreshed.");
			die();
		}
		$returnData['data']['item'] = $results['data'];
	}

	function newFolder(array $data, rixPDO &$db, array &$returnData): void
	{
		/* @var $db rixPDO; */
		// PARAMS: location, name
		checkParams($data, ['location', 'name']);

		global $uiLang;

		// redirects to fetchLibrary and selects newly created folder

		$location = $data['location'];
		$name = $data['name'];

		//verify if a folder with that name already exists on the same level
		$query = "SELECT COUNT(*) FROM itemFolders WHERE name=? AND parent=?";
		$parameters = array($name, $location);
		$results = $db->fetchValue($query, $parameters);

		// duplicate folder name checking
		if ($results['data'] != 0) {
			$returnData['error'] = $uiLang->translate("A folder with that name already exists. Try using another name.");
			die();
		}

		// after all checks pass, insert new folder values
		global $myAuth;
		$db->insert('itemFolders', ['parent' => $location, 'name' => $name, 'owner' => $myAuth->userid]);
		$results = $db->results();
		$data['select'] = 'f' . $results['id'];

		$folderId = $results['id'];

		# ----------------------------------------------- #
		# Call routine to populate permission schema info #
		# ----------------------------------------------- #
		global $permAuth;
		$permAuth->newFolderPermSet($location, $folderId);

		fetchLibrary($data, $db, $returnData);
	}

	function newItemGroup(array $data, rixPDO &$db, array &$returnData): void
	{

		// PARAMS: location, name
		checkParams($data, array('location', 'name'));

		global $uiLang;

		$location = $data['location'];
		$name = $data['name'];

		//verify if a folder with that name already exists on the same level
		$query = "SELECT COUNT(*) FROM itemGroups WHERE name=? AND parent=?";
		$parameters = array($name, $location);
		$results = $db->fetchValue($query, $parameters);

		// if the name is already in use:
		if ($results['data'] != 0) {
			$returnData['error'] = $uiLang->translate("A page group with that name already exists in the current folder. Try using another name.");
			die();
		}

		// new itemgroup sql

		global $myAuth;
		$params = array(array('parent' => $location, 'name' => $name, 'owner' => $myAuth->userid));
		$db->insert('itemGroups', $params);
		$results = $db->results();
		$data['select'] = 'ig' . $results['id'];
		fetchLibrary($data, $db, $returnData);
	}

	function checkItemGroup(array $data, rixPDO &$db, array &$returnData): void
	{

		checkParams($data, array('itemgroup', 'location'));

		global $uiLang;

		$location = (int)$data['location'];
		$id = (int)$data['itemgroup'];
	}

	function checkItem(array $data, rixPDO &$db, array &$returnData): void
	{

		checkParams($data, array('item'));

		global $uiLang;

		$id = $data['item'];
		$sessionId = $_COOKIE[session_name()] ?? null;

		$query = <<<'SQL'
		SELECT
		NULLIF(JSON_UNQUOTE(JSON_EXTRACT(`lock`, '$.sessionId')), 'null') AS sessionId,
		TIMESTAMPDIFF(
			SECOND,
			NULLIF(JSON_UNQUOTE(JSON_EXTRACT(`lock`, '$.timestamp')), 'null'),
			NOW()
		) AS delta_t
		FROM items
		WHERE id = ?
		LIMIT 1;
	SQL;

		$parameters = [$id];
		$result = $db->fetchRow($query, $parameters);

		if ($result['error']) {
			$returnData['error'] = $result['errorMsg'];
			die();
		}
		//Show error message if selected item group is not availabe anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("The page you are trying to edit has been deleted by another user. The view will be refreshed.");
			$returnData['reloadFolder'] = true;
			die();
		}

		if ($result['data']['sessionId'] !== null && $result['data']['sessionId'] !== $sessionId) {
			if ($result['data']['delta_t'] < 60) {
				$returnData['error'] = $uiLang->translate("It is not possible to edit the selected page right now. It is currently being edited by another user.");
			}
		}

		$query = "SELECT COUNT(*) FROM answers WHERE itemId=?";
		$result = $db->fetchValue($query, $parameters);

		if ($result['data'] > 0) {
			$returnData['confirmation'] = "existingResults";
		}
	}

	function newItem(array $data, rixPDO &$db, array &$returnData): void
	{

		// PARAMS: groupId, itemCode
		checkParams($data, array('groupId', 'itemCode', 'location'));

		global $uiLang;

		// redirects to fetchItemGroup and selects newly created item and its item group
		$groupId = $data['groupId'];
		$location = $data['location'];
		//Check if item group is still available
		$query = "SELECT * FROM itemGroups WHERE id=?";
		$parameters = array($groupId);
		$results = $db->fetchRow($query, $parameters);
		//Show error message if selected item group is not availabe anymore
		if ($results['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("The page group has been deleted by another user. The view will be refreshed.");
			$returnData['reloadFolder'] = true;
			die();
		}
		//Show error message if selected item group has been moved to another folder
		if ($results['data']['parent'] !== $data['location']) {
			$returnData['error'] = $uiLang->translate("The page group has been moved to a different folder by another user. The view will be refreshed.");
			$returnData['reloadFolder'] = true;
			$returnData['openNewLocation'] = true;
			$returnData['openNewLocationId'] = $results['data']['parent'];
			die();
		}
		/////
		$itemCode = $data['itemCode'];
		$name = $data['name'];

		$itemData = array(array('groupId' => $groupId, 'itemCode' => $itemCode, 'name' => $name));
		$db->insert('items', $itemData);
		$results = $db->results();
		$returnData['data']['id'] = (int)$results['id'];

		fetchItemGroup(array('id' => $groupId, 'location' => $location), $db, $returnData);
	}

	function updateWatchList($data, &$db, &$returnData): void
	{
		checkParams($data, array('id', 'status', 'type'));
		$id = $data['id'];
		$status = $data['status'];
		($data['type'] === 'folder') ? $target = 1 : $target = 2;

		if (isset($_SESSION)) {
			$user = $_SESSION['userid'];
			if ($status) {
				//Check if element is still available
				($data['type'] === 'folder') ? $query = "SELECT * FROM itemFolders WHERE `id` = ? LIMIT 1" : $query = "SELECT * FROM itemGroups WHERE `id` = ? LIMIT 1";
				$parameters = array($id);
				$result = $db->fetchRow($query, $parameters);
				//Write watchlist
				if ($result['rows'] >= 0) {
					$db->prepare("INSERT INTO watchList (foreign_id, foreign_table, user_id) SELECT ?,?,? WHERE NOT EXISTS (SELECT * FROM watchList WHERE foreign_id = ? AND foreign_table = ? AND user_id = ?)");
					$db->executePrepared(array($id, $target, $user, $id, $target, $user));
				}
			} else {
				$db->prepare("DELETE FROM watchList WHERE user_id=? AND foreign_id=? AND foreign_table=?");
				$db->executePrepared(array($user, $id, $target));
			}
		}
	}

	function renameGroupOrFolder(array $data, rixPDO &$db, array &$returnData): void
	{

		// PARAMS: name, type, id
		checkParams($data, array('name', 'type', 'id', 'location'));

		global $uiLang;

		$type = $data['type'];
		$name = $data['name'];
		$id = $data['id'];
		$location = $data['location'];

		// preserve original name for logging purposes
		$qType = $data['type'] === 'folder' ? "itemFolders" : "itemGroups";
		/** @noinspection SqlResolve */
		$data['origName'] = $db->fetchValue("SELECT `name` FROM $qType WHERE `id` = ?", [$id])['data'];

		if ($type == 'folder') {
			//verify if a folder with that name already exists on the same level
			$query = "SELECT COUNT(*) AS isPresent, id FROM itemFolders WHERE name=? AND parent=?";
			$parameters = array($name, $location);
			$results = $db->fetchRow($query, $parameters);

			// if the name is already in use:
			if ($results['data']['isPresent'] != 0) {
				//allow cosmetic renaming
				if ($results['data']['id'] !== $id) {
					$returnData['error'] = $uiLang->translate("A folder with that name already exists. Try using another name.");
					die();
				}
			}
		} else {

			//verify if a item group mediafile with that name already exists
			$query = "SELECT COUNT(*) AS isPresent, id FROM itemGroups WHERE name=? AND parent=?";
			$parameters = array($name, $location);
			$results = $db->fetchRow($query, $parameters);

			// if the name is already in use:
			if ($results['data']['isPresent'] != 0) {
				//allow cosmetic renaming
				if ($results['data']['id'] !== $id) {
					$returnData['error'] = $uiLang->translate("A page group with that name already exists in the current folder. Try using another name.");
					die();
				}
			}
		}

		if ($type == 'folder') {
			$table = 'itemFolders';
			$prefix = 'f';
		} else {
			$table = 'itemGroups';
			$prefix = 'ig';
		}

		$db->update($table, array('name' => $name), 'id=?', array($id));

		/** @noinspection SqlResolve */
		$query = "SELECT CONCAT(?,id) as id, id as 'dbId', CONCAT('f', parent) as pid, ? as type, `name`, `name` as label, `name` as sortKey FROM $table WHERE id=?";
		$parameters = array($prefix, $type, $id);
		$results = $db->fetchRow($query, $parameters);

		// log action
		global $myAuth;
		$myAuth->prepLog($data, "rename", $returnData);

		$returnData['data']['libraryUpdate'] = $results['data'];
	}

	function renameItem(array $data, rixPDO &$db, array &$returnData): void
	{

		// PARAMS: name, itemCode, id
		checkParams($data, array('name', 'itemCode', 'id'));

		global $uiLang;

		//redirects to fetchItem
		$itemCode = $data['itemCode'];
		$name = $data['name'];
		$id = $data['id'];

		$db->update('items', array('name' => $name, 'itemCode' => $itemCode), 'id=?', array($id));
		$results = $db->results();
		if ($results['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("The page has been deleted by another user. The view will be refreshed.");
			$returnData['action'] = 'fetchItem'; //changing the action here in order to use the fallback routines of the fetchItem action if an error like this occurs
			die();
		}
		fetchItem($data, $db, $returnData);
	}

	function duplicateItemGroup(array $data, rixPDO &$db, array &$returnData): void
	{

		checkParams($data, array('location', 'sources', 'target'));

		global $uiLang;

		$objects = $data['sources'];
		$target = $data['target'];
		$groupIds = $objects['files'];

		////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
		// Recursive folder duplication currently not implemented due to filer settings
		////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

		global $myAuth;

		//Item groups
		foreach ($groupIds as $groupId) {
			global $settings;

			$name = checkExisting('itemGroups', $groupId, $target, $db);

			// FYI: duplicating itemgroup, but now we are stamping the owner id with the current logged in user's owner id so they have full control of the new itemgroup
			$db->prepare("INSERT INTO `itemGroups` SELECT NULL AS `id`, ? AS `name`, `options`,  ? AS `parent`, ? as `owner`, `permissions` FROM `itemGroups` WHERE id=?");
			$db->executePrepared([$name, $target, $myAuth->userid, $groupId]);
			$result = $db->results();
			$newGroupId = $result['id'];

			//duplicating the items as well for the duplicated itemgroup
			$db->prepare("INSERT INTO items SELECT NULL AS id, ? AS groupId, itemCode, name, languages, blocks, parsed, fields, options, scripts, metadata, link, NULL FROM items WHERE groupId=?");
			$db->executePrepared([$newGroupId, $groupId]);

			//fetching media to be copied from old item group
			$query = "SELECT id FROM media WHERE parent=?";
			$parameters = [$groupId];
			$results = $db->fetchTable($query, $parameters);
			$idTable = [];

			//if there are media files they need to be duplicated as well
			if ($results['rows'] > 0) {

				$sourceDir = '';
				$targetDir = '';

				if ($settings['mediaLocation'] === 'disk') {
					//create new media folder
					$sourceDir = __DIR__ . "/../media/$groupId";
					$targetDir = __DIR__ . "/../media/$newGroupId";
					if (!is_dir($targetDir)) {
						$res = mkdir($targetDir, 0775, true);

						if ($res === false) {
							$error = error_get_last();
							$returnData['error'] = $uiLang->translate("Creation of directory failed:") . " $targetDir<br><br>{$error['message']}";
							die();
						}
					}
				}

				//loop through, duplicate media and create information on old vs new media id
				foreach ($results['data'] as $id2copy) {
					$res = $db->execute("INSERT INTO media SELECT NULL AS id, name, filetype, ? AS parent, created, filesize, UUID() as uuid FROM media WHERE media.id=?", [$newGroupId, $id2copy['id']]);
					$oldId = $id2copy['id'];
					$newId = $res['id'];
					$idString = (string)$newId;
					$res = $db->fetchValue("SELECT uuid FROM media WHERE id=?", [$newId]);
					$newUuid = $res['data'];
					$res = $db->fetchValue("SELECT uuid FROM media WHERE id=?", [$id2copy['id']]);
					$oldUuid = $res['data'];
					//store old vs new media id and uuid for later replacement in items
					$idTable[$oldId] = ['id' => $newId, 'uuid' => $newUuid, 'oldUuid' => $oldUuid, 'oldId' => $oldId];

					//copy file
					if ($settings['mediaLocation'] === 'disk') {
						$sourcePath = "$sourceDir/{$id2copy['id']}.dat";
						$targetPath = "$targetDir/$idString.dat";

						if (file_exists($sourcePath)) {
							copy($sourcePath, $targetPath);
						}
					} elseif ($settings['mediaLocation'] === 'database') {
						$res = $db->execute("INSERT INTO mediaFiles SELECT ? AS id, `data` FROM mediaFiles WHERE id=?", [$newId, $id2copy['id']]);
					}
				}

				//initialize media tool
				$mediaTool = new MediaTool();
				if ($mediaTool->hasErrors()) {
					$returnData['error'] = $mediaTool->getErrors();
					die();
				}

				$results = $db->fetchTable("SELECT id, blocks, languages, metadata FROM items WHERE groupId=?", [$newGroupId]);
				//loop through all media and replace old media ids with new media ids in items of the new item group
				foreach ($results['data'] as $page) {
					try {
						$id = $page['id'];
						$blocks = json_decode($page['blocks'], false, 512, JSON_THROW_ON_ERROR);
						$languages = json_decode($page['languages'], true, 512, JSON_THROW_ON_ERROR);
						$mediaTool->replaceMediaIds($blocks, $idTable);
						$compiler = new InteractionCompiler($blocks, $languages, $id, $db, []);
						$compiler->compileBlocks();
						$error = $compiler->getErrors();
						if ($error) {
							$returnData['error'] = $error;
							die();
						}
						$pageData['fields'] = $compiler->getFields();
						$pageData['options'] = $compiler->getOptions();
						$pageData['parsed'] = $compiler->getParsed();
						$pageData['scripts'] = $compiler->getScripts();
						$pageData['blocks'] = $compiler->getBlocks();
						$pageData['metadata'] = json_decode($page['metadata'], false, 512, JSON_THROW_ON_ERROR);
						$newMetaData = $compiler->getMetadata();
						// Merge new metadata with existing metadata
						foreach ($newMetaData as $key => $value) {
							$pageData['metadata']->$key = $value;
						}
						$pageData['metadata'] = json_encode($pageData['metadata'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
						$db->update('items', $pageData, 'id=?', [$page['id']]);
					} catch (JsonException $e) {
						continue; //ignore and do not update if json is invalid
					}
				}

				//look for media links in items and stimuli of the new item group and replace the media ids
//			foreach ($w as $newM => $mediaInfo) {

//				$db->prepare("UPDATE items SET blocks = REPLACE(blocks, 'fetchMediaFile.php?fileid=" . $oldM . "&','fetchMediaFile.php?fileid=" . $newM . "&'), parsed = REPLACE(parsed, 'fetchMediaFile.php?fileid=" . $oldM . "&','fetchMediaFile.php?fileid=" . $newM . "&'), `fields` = REPLACE(`fields`, 'fetchMediaFile.php?fileid=" . $oldM . "&','fetchMediaFile.php?fileid=" . $newM . "&') WHERE groupId=" . $result['id'] . ";");
//				$db->executePrepared(array());
//			}

				//load blocks and meta data for each page
//			$sql = "SELECT id, blocks, languages, fields, parsed, metadata FROM items WHERE groupId=?";
//			$pages = $db->fetchTable($sql, [$newGroupId]);
//			foreach ($pages['data'] as $page) {
//				$blocks = json_decode($page['blocks'], true);
//				$languages = json_decode($page['languages'], true);
//				$meta = json_decode($page['metadata'], true);
//
//				if (count($blocks) === 0 || count($languages) === 0) {
//					continue;
//				}
//
//				$mediaData = $mediaTool->parseBlocks($blocks, $languages);
//				$meta['mediaIds'] = $mediaData->mediaIds ?? [];
//
//				if (count($meta['mediaIds']) === 0) {
//					//if no media ids are found, no need to update them
//					continue;
//				}
//
//				$db->update("items", ["metadata" => json_encode($meta)], "id=?", [$page['id']]);
//			}
			}
		}
		fetchLibrary($data, $db, $returnData);
	}

	function duplicateItem(array $data, rixPDO &$db, array &$returnData): void
	{

		// PARAMS: name, itemCode, id, groupId
		checkParams($data, array('name', 'itemCode', 'id', 'groupId', 'location'));

		// redirects to fetchItemGroup;
		$itemCode = $data['itemCode'];
		$name = $data['name'];
		$id = $data['id'];
		$groupId = $data['groupId'];
		$location = $data['location'];

		$returnData = duplicateItemSubroutine($groupId, $itemCode, $name, $id, $db);
		if ($returnData['error']) {
			die();
		}

		fetchItemGroup(array('id' => $groupId, 'location' => $location), $db, $returnData);
	}

	function moveObjects(array $data, rixPDO &$db, array &$returnData): void
	{

		// PARAMS: location, sources, target
		// redirects to fetchLibrary

		checkParams($data, array('location', 'sources', 'target'));

		global $uiLang;

		$returnData['db_data'] = $data;
		$objects = $data['sources'];
		$target = $data['target'];
		$folders = $objects['folders'];
		$files = $objects['files'];

		/* log original source data before update for logging purposes; */

		$data['origInfo'] = '';
		$origInfo = [];
		$targName = $db->fetchValue("SELECT `name` FROM `itemFolders` WHERE `id` = ?", [$target])['data'];

		foreach ($data['sources']['folders'] as $k0 => $v0) {
			$origInfo = $db->fetchRow("SELECT `parent`, `name` FROM `itemFolders` WHERE `id` = ?", [$v0])['data'];
			$origFldName = $db->fetchValue("SELECT `name` FROM `itemFolders` WHERE `id` = ?", [$origInfo['parent']])['data'];
			$data['origInfo'] .= "\tFolder ID [$v0] ({$origInfo['name']}) original location: [{$origInfo['parent']}] ($origFldName) TO: Folder ID [$target] ($targName)\n";
		}

		foreach ($data['sources']['files'] as $k1 => $v1) {
			$origInfo = $db->fetchRow("SELECT `parent`, `name` FROM `itemGroups` WHERE `id` = ?", [$v1])['data'];
			$origFldName = $db->fetchValue("SELECT `name` FROM `itemFolders` WHERE `id` = ?", [$origInfo['parent']])['data'];
			$data['origInfo'] .= "\tFile ID [$v1] ({$origInfo['name']}) original location: [{$origInfo['parent']}] ($origFldName) TO: Folder ID [$target] ($targName)\n";
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

		if ($origInfo['parent'] !== $target) {
			if (count($folders) > 0) {
				foreach ($folders as $folder) {
					$returnData['db'][] = array('folder' => $folder, 'target' => $target);
					if (checkPath($target, $db, $folder) === false) {
						$returnData['error'] = $uiLang->translate("You are not able to move a folder into itself!");
						die();
					} else {
						$name = checkExisting('itemFolders', $folder, $target, $db);
						$db->prepare("UPDATE itemFolders SET parent=?, name=? WHERE id=?");
						$db->executePrepared(array($target, $name, $folder));

						// Check for any inheritance prior to removal so that we may set a message to send back to the JS caller
						$hasIh = $db->fetchValue("SELECT COUNT(*) FROM `itemFolderAccess` WHERE `folderId` = ? AND `inherited` IS NOT NULL", [$folder])['data'];

						$db->prepare("UPDATE `itemFolderAccess` SET `inherited` = ? WHERE `folderId` = ?");
						$db->executePrepared([null, $folder]);

						// set inheritance removal message if it is applicable
						if ($hasIh) {
							$fldName = $db->fetchValue("SELECT `name` FROM `itemFolders` WHERE `id` = ?", [$folder])['data'];
							$returnData['ihMsg'] = "Note that inheritance has been removed from the folder &quot;<strong>$fldName</strong>&quot; due to folder relocation.";
						}
					}
				}
			}
			if (count($files) > 0) {
				foreach ($files as $file) {
					$name = checkExisting('itemGroups', $file, $target, $db);
					$db->prepare("UPDATE itemGroups SET parent=?, name=? WHERE id=?");
					$db->executePrepared(array($target, $name, $file));
				}
			}
		}

		// log action
		global $myAuth;
		$myAuth->prepLog($data, 'moveObjects', $returnData);

		fetchLibrary($data, $db, $returnData);
	}

# ------------------------------------------------------ #
# Recursive folder checking for various action functions #
# ------------------------------------------------------ #
	function recurs_perm_check(array $obj, rixPDO &$db, string $action): void
	{
		global $permAuth, $uiLang;
		$movTarg = 0;
		foreach ($obj as $fItem) {
			if (isset($fItem['target'])) {
				$movTarg = intval($fItem['target']);
			}
			$fPermRes = $permAuth->permCheck(["remCall" => true, "fid" => $fItem['dbId'], 'target' => $movTarg ?? ""]);
			if ($fPermRes !== true) {
				global $myAuth, $returnData;
				$returnData['error'] = $uiLang->translate("You do not have permission to perform the requested function on this or these object(s). A page or pages within this path were found which you may not remove.");
				$myAuth->writeLogEntry("ACCOUNT RESTRICTION: Attempted operation without page rights on entry:[" . basename(__FILE__) . " -> $action]");
				exit;
			}

			$res = $db->fetchTable("SELECT CAST(`id` AS UNSIGNED) AS `dbId`, `owner`, $movTarg AS 'target' FROM `itemFolders` WHERE `parent` = ? ", [$fItem['dbId']]);
			if (!($res['rows'] === 0)) {
				recurs_perm_check($res['data'], $db, $action);
			}

			// FYI: this section not in use while we have folder based permission checking only
			// post-recursion itemgroup checking code (loops on all itemgroups in folder)
			/* $res2 = $db->fetchTable("SELECT `id`, `owner` FROM `itemGroups` WHERE `parent` = ?", [$fItem['dbId']]);

							foreach ($res2['data'] as $key => $igItem) {
								if (!$permAuth->permCheck(["type" => "itemGroup", "iid" => $igItem['id']])) {
									global $myAuth, $returnData;
									$returnData['error'] = "You do not have permission to perform the requested function on this or these object(s). A item within this path were found which you may not remove.";
									$myAuth->writeLogEntry("ACCOUNT RESTRICTION: Attempted operation without item rights on entry:[" . basename(__FILE__) . "�{$action}]");
									exit;
								}
							} */
		}
	}

	function deleteSelection(array $data, rixPDO &$db, array &$returnData): void
	{

		global $uiLang;

		// PARAMS: location, selection, [force]
		checkParams($data, array('location', 'selection'));

		// redirects to fetchLibrary
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

		// build SQL deletion clause
		foreach ($selection as $row) {
			if ($row['type'] == 'folder') {
				$folders[] = $row['dbId'];
				if ($folderClause != '') {
					$folderClause .= ',';
				}
				$folderClause .= '?';
			} else {
				$groups[] = $row['dbId'];
				if ($groupClause != '') {
					$groupClause .= ',';
				}
				$groupClause .= '?';
			}
		}
		$folderClause = "id IN ($folderClause)";
		$pageClause = "groupId IN ($groupClause)";
		$groupClause = "id IN ($groupClause)";

		if (!isset($data['force'])) {

			$warnings = ['locked' => false, 'results' => false, 'used' => false];

			if (count($folders) > 0) {
				//find ids of all the pages that will be deleted along with the selected folders
				$query = "	SELECT DISTINCT id FROM items WHERE groupId IN (
						SELECT DISTINCT id FROM itemGroups WHERE parent IN (
							WITH recursive path AS (
								SELECT
									id,
									`name`,
									parent,
									1 AS hlevel 
								FROM
									itemFolders 
								WHERE
									$folderClause UNION
								SELECT
									f.id,
									f.`name`,
									f.parent,
									hlevel + 1 
								FROM
									itemFolders AS f,
									path AS p 
								WHERE
									f.parent = p.id 
								) SELECT DISTINCT id 
							FROM
								path
						)
    				)";
				$res = $db->fetchColumn($query, $folders);

				if (!empty($res['data'])) {
					foreach ($res['data'] as $itemId) {
						$itemWarnings = checkIfItemIsDeletable($itemId, $db, $returnData);
						$warnings['locked'] = $warnings['locked'] || $itemWarnings['locked'];
						$warnings['results'] = $warnings['results'] || $itemWarnings['results'];
						$warnings['used'] = $warnings['used'] || $itemWarnings['used'];
					}
				}
			}

			if (count($groups) > 0) {
				//find ids of all the pages that will be deleted along with the selected groups
				$query = "SELECT DISTINCT id FROM items WHERE $pageClause";
				$res = $db->fetchColumn($query, $groups);

				if (!empty($res['data'])) {
					foreach ($res['data'] as $itemId) {
						$itemWarnings = checkIfItemIsDeletable($itemId, $db, $returnData);
						$warnings['locked'] = $warnings['locked'] || $itemWarnings['locked'];
						$warnings['results'] = $warnings['results'] || $itemWarnings['results'];
						$warnings['used'] = $warnings['used'] || $itemWarnings['used'];
					}
				}
			}

			$returnData['location'] = $data['location'];
			$returnData['selection'] = $data['selection'];

			if ($warnings['locked'] === true) {
				$returnData['error'] = $uiLang->translate("One or more of the pages in your selection is being edited by another user at the moment. The selection cannot be deleted!");
				die();
			}
			if ($warnings['results'] === true) {
				$returnData['confirmation'] = $uiLang->translate("Results have already been collected for one or more page groups in your selection. All concerned results will be removed as well upon deletion. Do you want to proceed?");
				die();
			}
			if ($warnings['used'] === true) {
				$returnData['confirmation'] = $uiLang->translate("Some of the selected page groups are in use in one or more tests. Any test which uses deleted pages will become non functional. Do you want to proceed?");
				die();
			}
		}

		if (count($folders) > 0) {
			//delete media files from groups within folder hierarchy before deleting folders from database
			foreach ($folders as $folder) {
				deleteFolderMediaFiles($folder, $db);
			}
			$db->prepare("DELETE FROM itemFolders WHERE " . $folderClause);
			$db->executePrepared($folders);
		}
		if (count($groups) > 0) {
			foreach ($groups as $group) {
				deleteGroupMediaFiles($group);
			}
			$db->prepare("DELETE FROM itemGroups WHERE " . $groupClause);
			$db->executePrepared($groups);
		}

		// log action
		global $myAuth;
		$myAuth->prepLog($data, "delSelection", $returnData);

		fetchLibrary($data, $db, $returnData);
	}

	function deleteFolderMediaFiles($folderId, &$db): void
	{
		//get ids of all page groups inside folder or one of its child folders
		$query = "	WITH recursive path AS (
					SELECT
						id,
						parent 
					FROM
						itemFolders 
					WHERE
						id = ? UNION ALL
					SELECT
						f.id,
						f.parent 
					FROM
						itemFolders AS f,
						path AS p 
					WHERE
						f.parent = p.id 
					) SELECT
					itemGroups.id
				FROM
					path JOIN itemGroups ON path.id = itemGroups.parent";
		$res = $db->fetchColumn($query, [$folderId]);

		//iterate through groups and delete media files
		if ($res['rows'] > 0) {
			foreach ($res['data'] as $groupId) {
				deleteGroupMediaFiles($groupId);
			}
		}
	}

	function deleteGroupMediaFiles($groupId): void
	{
		$targetDir = __DIR__ . "/../media/$groupId";
		if (file_exists($targetDir)) {
			array_map('unlink', glob("$targetDir/*.*"));
			if (file_exists("$targetDir/.htaccess")) {
				unlink("$targetDir/.htaccess");
			}
			rmdir($targetDir);
		}
	}

	function deleteItem(array $data, rixPDO &$db, array &$returnData): void
	{

		global $uiLang;

		// PARAMS: id, groupId, [force]
		checkParams($data, array('id', 'groupId'));
		$returnData['data']['id'] = $data['id'];

		//optional parameter force will allow deleting without checking if page is deletable
		if (!isset($data['force'])) {
			$warnings = checkIfItemIsDeletable($data['id'], $db, $returnData);
			if ($warnings['locked']) {
				$returnData['error'] = $uiLang->translate("This page is being edited by another user at the moment and cannot be deleted!");
				die();
			}
			if ($warnings['results']) {
				$returnData['confirmation'] = $uiLang->translate("Results have already been collected for this page. If you delete it, the results will be removed as well. Do you want to proceed?");
				die();
			}
			if ($warnings['used']) {
				$returnData['confirmation'] = $uiLang->translate("This page is already in use in one or more tests. Any test which uses a deleted page will become non functional. Do you want to proceed?");
				die();
			}
		}

		// preserve original item info prior to deletion
		$origData = $db->fetchRow("SELECT `name`,`groupId` FROM `items` WHERE `id` = ?", [$data['id']])['data'];
		$data['origName'] = $origData['name'] ?? "<REMOVED PRIOR TO DELETION ATTEMPT>";
		$data['groupId'] = $origData['groupId'] ?? "<REMOVED PRIOR TO DELETION ATTEMPT>";
		$data['groupName'] = $db->fetchValue("SELECT `name` FROM `itemGroups` WHERE `id` = ?", [$data['groupId']])['data'];
		if (empty($data['groupName'])) {
			$data['groupName'] = "<REMOVED PRIOR TO DELETION ATTEMPT>";
		}

		$query = "DELETE FROM items WHERE id=?";
		$db->prepare($query);
		$db->executePrepared(array($data['id']));

		// log action
		global $myAuth;
		$myAuth->prepLog($data, 'deleteItem', $returnData);
		fetchItemGroup(['id' => $data['groupId']], $db, $returnData);
	}

	function checkIfItemIsDeletable(int $id, rixPDO &$db, array &$returnData): array
	{
		$warnings = ['locked' => false, 'results' => false, 'used' => false];

		$sessionId = $_COOKIE[session_name()] ?? null;
		$query = <<<'SQL'
		SELECT
		NULLIF(JSON_UNQUOTE(JSON_EXTRACT(`lock`, '$.sessionId')), 'null') AS sessionId,
		TIMESTAMPDIFF(
			SECOND,
			NULLIF(JSON_UNQUOTE(JSON_EXTRACT(`lock`, '$.timestamp')), 'null'),
			NOW()
		) AS delta_t
		FROM items
		WHERE id = ?
		LIMIT 1;
	SQL;
		$parameters = array($id);
		$result = $db->fetchRow($query, $parameters);

		if ($result['error']) {
			$returnData['error'] = $result['errorMsg'];
			die();
		}

		//if selected page has already been deleted by someone else
		if ($result['rows'] === 0) {
			return $warnings;
		}

		if ($result['data']['sessionId'] !== null && $result['data']['sessionId'] !== $sessionId) {
			if ($result['data']['delta_t'] < 60) {
				$warnings['locked'] = true;
				return $warnings;
			}
		}

		$query = "SELECT COUNT(*) FROM answers WHERE itemId=?";
		$parameters = [$id];
		$result = $db->fetchValue($query, $parameters);

		if ($result['data'] > 0) {
			$warnings['results'] = true;
			return $warnings;
		}

		$query = "SELECT COUNT(*) FROM tests WHERE JSON_CONTAINS(JSON_EXTRACT(structure, '$.items[*].hiddenID'), ?)";
		$parameters = [$id];
		$result = $db->fetchValue($query, $parameters);

		if ($result['data'] > 0) {
			$warnings['used'] = true;
			return $warnings;
		}

		return $warnings;
	}

	function removeLinks(array $data, rixPDO &$db, array &$returnData): void
	{
		/*
		 * Remove all links to the page with the given id
		 * This is used when a page is defined not to be used as a stimulus anymore
		 * P.S.: On deletion of a page, the links to it are set to NULL automatically by foreign key constraints
		 */
		checkParams($data, ['id', 'groupId']);
		$db->update("items", ['link' => null], "link = ?", [$data['id']]);

		fetchItemGroup(['id' => $data['groupId']], $db, $returnData);
	}

	function saveItemGroup(array $data, rixPDO &$db, array &$returnData): void
	{

		// PARAMS: id
		checkParams($data, array('id'));

		//these fields should not exist at this stage, but as a safety precaution, we'll unset them as they would break the update process
		unset($data['items']);

		//remove id from fields to update
		$id = $data['id'];
		unset($data['id']);

		encodeObjects($data, array('options'));

		//save the item group data
		if (count($data) > 0) {
			$db->update('itemGroups', $data, 'id=?', array($id));
		}

		//get updated item group from database (as verification)
		$query = "SELECT *, 'itemGroup' AS type FROM itemGroups WHERE id=?";
		$parameters = array($id);
		$results = $db->fetchRow($query, $parameters);
		$returnData['data'] = $results['data'];
		$query = "SELECT id, groupId, itemCode, name, options, blocks, fields FROM items WHERE groupId=? ORDER BY itemCode";
		$parameters = array($id);
		$results = $db->fetchTable($query, $parameters);
		$returnData['data']['items'] = $results['data'];
	}

	function saveItem(array $data, rixPDO &$db, array &$returnData): void
	{

		// PARAMS: id
		checkParams($data, array('id', 'metadata', 'languages'));

		//redirects to fetchItem
		$originalData = $data;

		//remove id from fields to update
		$id = $data['id'];
		unset($data['id']);

		if (isset($data['link']) && $data['link'] === -1) {
			$data['link'] = null;
		}

		//encode data
		encodeObjects($data, array('metadata'));
		encodeArrays($data, array('languages'));

		//prevent user to set an empty name
		if (isset($data['name']) && $data['name'] === '') {
			unset($data['name']);
			$returnData['warnings'][] = 'A page may not have a blank name. The name has not been updated.';
		}

		//save the item
		if (count($data) > 0) {
			$db->update('items', $data, 'id=?', array($id));
		}

		fetchItem($originalData, $db, $returnData);
	}

	function search(array $data, rixPDO &$db, array &$returnData): void
	{
		$searchString = '%' . preg_replace('/%/', '\\%', $data['searchString']) . '%';
		$query = "	SELECT CONCAT('f',itemFolders.id) AS id,
						itemFolders.id AS 'dbId',
						itemFolders.parent,
						CONCAT('f', itemFolders.parent) AS pid,
						'folder' AS type,
						itemFolders.name,
						itemFolders.name AS label,
						itemFolders.name AS sortKey,
						NULL AS subresult,
						NULL AS subresultvalue
					FROM itemFolders
					WHERE name LIKE ?
					  AND NOT ISNULL(itemFolders.parent)
					UNION
					SELECT CONCAT('ig',itemGroups.id) AS id,
						CAST(itemGroups.id AS UNSIGNED) AS 'dbId',
						CAST(itemGroups.parent AS UNSIGNED) AS parent,
						CONCAT('f', itemGroups.parent) AS pid,
						'itemGroup' AS type,
						itemGroups.name,
						itemGroups.name AS label,
						itemGroups.name AS sortKey,
						NULL AS subresult,
						NULL AS subresultvalue
					FROM itemGroups
					WHERE name LIKE ?
					UNION
					SELECT CONCAT('ig',itemGroups.id) AS id,
						CAST(itemGroups.id AS UNSIGNED) AS 'dbId',
						CAST(itemGroups.parent AS UNSIGNED) AS parent,
						CONCAT('f', itemGroups.parent) AS pid,
						'itemGroup' AS type,
						itemGroups.name,
						itemGroups.name AS label,
						itemGroups.name AS sortKey,
						'Page Name: ' AS subresult,
						items.name AS subresultvalue
					FROM itemGroups
					INNER JOIN items WHERE items.name LIKE ? AND itemGroups.id=items.groupId
					UNION
					SELECT CONCAT('ig',itemGroups.id) AS id,
						CAST(itemGroups.id AS UNSIGNED) AS 'dbId',
						CAST(itemGroups.parent AS UNSIGNED) AS parent,
						CONCAT('f', itemGroups.parent) AS pid,
						'itemGroup' AS type,
						itemGroups.name,
						itemGroups.name AS label,
						itemGroups.name AS sortKey,
						'Page Code: ' AS subresult,
						items.itemCode AS subresultvalue
					FROM itemGroups
					INNER JOIN items WHERE items.itemCode LIKE ? AND itemGroups.id=items.groupId
					ORDER BY name";

		$parameters = array($searchString, $searchString, $searchString, $searchString);
		$results = $db->fetchTable($query, $parameters);

		// permission checking and filtering
		global $permAuth;
		foreach ($results['data'] as $key => &$value) {

			$hasRead = false; // set default starting value for access
			$canwrite = false;

			if ($value['type'] === 'itemGroup') {
				$hasRead = $permAuth->permCheck(['remCall' => true, 'fid' => $value['parent'], 'action' => 'search']);
			}
			if ($value['type'] === 'folder') {
				$hasRead = $permAuth->permCheck(['remCall' => true, 'fid' => intVal($value['dbId']), 'action' => 'search']);
			}

			if ($value['type'] === 'itemGroup') {
				$canwrite = $permAuth->permCheck(['remCall' => true, 'fid' => $value['parent'], 'action' => 'deleteItem']);
			}
			if ($value['type'] === 'folder') {
				$canwrite = $permAuth->permCheck(['remCall' => true, 'fid' => intVal($value['dbId']), 'action' => 'deleteItem']);
			}

			$value['canWrite'] = $canwrite;

			// remove any values which do not have the proper permission
			if ($hasRead !== true) {
				unset($results['data'][$key]);
			}
		}

		// reindex results array
		$results['data'] = array_values($results['data']);

		// return data population
		$returnData['data']['list'] = $results['data'];
		if (count($returnData['data']['list']) > 0) {
			foreach ($returnData['data']['list'] as $key => $row) {
				$returnData['data']['list'][$key]['path'] = pathToString(fetchPath($row['parent'], $returnData, $db));
			}
		}
		$returnData['data']['searchString'] = $data['searchString'];
	}

	function lockItem(array $data, rixPDO &$db, array &$returnData): void
	{

		// PARAMS: id, lock, update
		checkParams($data, array('id', 'lock', 'update'));

		global $settings;

		$sessionId = $_COOKIE[session_name()] ?? null;
		$sessionLifeTime = $settings['sessionTimeout'] * 60; // session timeout in seconds

		if ($sessionId) {
			$query = "SELECT modified FROM sessions WHERE id=?";
			$res = $db->fetchValue($query, [$sessionId]);
			if ($res['error']) {
				$returnData['sessionTimeLeft'] = 0;
				return;
			} else {
				// the value returned is the time of the last modification of the session as a string
				$sessionTimeLeft = strtotime($res['data']) + $sessionLifeTime - time();
				if ($sessionTimeLeft < 0) {
					$returnData['sessionTimeLeft'] = 0;
					return;
				}
				$returnData['sessionTimeLeft'] = $sessionTimeLeft;
			}
		} else {
			$returnData['sessionTimeLeft'] = 0;
			return;
		}

		/*
			If user loses contact to server someone else can start editing a page after 1 minute. If the first user
			manages to reconnect to the server, the lockItem method must verify if the lock still belongs to this user
			and if not the editing session must be interrupted.
		 */
		if ($data['update'] === true) {
			$query = "SELECT `lock` FROM items WHERE id=?";
			$res = $db->fetchValue($query, [$data['id']]);
			if ($res['data']) {
				$lock = json_decode($res['data']);
				if (json_last_error() === JSON_ERROR_NONE) {
					// if the lock is a valid JSON object, we check if it belongs to the current user
					if (isset($lock->sessionId) && $lock->sessionId !== $sessionId) {
						// if the lock does not belong to the current user any longer, it has expired
						$returnData['confirmation'] = 'lockExpired';
						return;
					}
				}
			}
		}

		$lock = new stdClass();
		if ($data['lock'] === true) {
			$lock->sessionId = $sessionId;
			$lock->timestamp = date("Y-m-d H:i:s");
		} else {
			// if the lock is released, we set the sessionId and timestamp to null
			$lock->sessionId = null;
			$lock->timestamp = null;
		}

		$db->update('items', ['lock' => json_encode($lock)], 'id=?', array($data['id']));
	}

	function errorLog(array $data, rixPDO &$db, array &$returnData): void
	{

		global $uiLang;

		if (!isset($data['messages'])) {
			$returnData['error'] = $uiLang->translate("No error message found to log!");
			die();
		}
		$returnData['error'] = false;
		foreach ($data['messages'] as $message) {
			$db->insert('logErrors', array(array('message' => $message)));
		}
	}

	/*
			 * helper functions
			 */

	function checkExisting($table, $tobecopied, $target, &$db): string
	{

		$cond = true;
		$i = 1;
		/** @noinspection SqlResolve */
		$query = "SELECT name FROM " . $table . " WHERE id=?";
		$parameters = array($tobecopied);
		$result = $db->fetchRow($query, $parameters);
		$nameorigin = $result['data']['name'];

		$name = $nameorigin;
		while ($cond) {
			/** @noinspection SqlResolve */
			$query = "SELECT id FROM " . $table . " WHERE parent=? AND name=?";
			$parameters = array($target, $name);
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

	function pathToString($path): ?string
	{
		if ($path === false) {
			return null;
		}

		if (count($path) === 0) {
			return '/';
		}
		$s = '';
		foreach ($path as $folder) {
			$s .= '/' . $folder['name'];
		}
		return $s;
	}

	function fetchPath($location, &$returnData, &$db)
	{
		$query = "	WITH recursive path AS (
							SELECT
							id, `name`,	parent, 1 AS hlevel
						FROM
							itemFolders 
						WHERE
							id = ? UNION
						SELECT
							f.id, f.`name`, f.parent, hlevel + 1 
						FROM
							itemFolders AS f, path AS p 
						WHERE
							f.id = p.parent 
						)
					SELECT
						`name`, id 
					FROM
						path
					ORDER BY
						hlevel DESC";
		$res = $db->fetchTable($query, [$location]);
		return $res['data'];
	}

	/* check if folder with id '$id' is among the parents of $location
				return false if $location is a child of $id else return true */
	function checkPath($location, &$db, $id): bool
	{
		$query = "	WITH recursive path AS (
						SELECT
							id,	`name`, parent
						FROM
							itemFolders 
						WHERE
							id = ? UNION ALL
						SELECT
							f.id,	f.`name`,	f.parent
						FROM
							itemFolders AS f, path AS p 
						WHERE
							f.id = p.parent 
					)
					SELECT
						COUNT(*) AS n 
					FROM
						path 
					WHERE
						id = ?";
		$res = $db->fetchValue($query, [$location, $id]);
		return ($res['data'] < 1);
	}

	function duplicateItemSubroutine($groupId, $itemCode, $name, $id, &$db): array
	{
		$localData = array();
		$localData['error'] = false;
		//get original data from item to be duplicated
		$query = "SELECT * FROM items WHERE id=? LIMIT 1";
		$parameters = array($id);
		$results = $db->fetchRow($query, $parameters);
		//insert update group id, item code and name into data and create new item
		$results['data']['groupId'] = $groupId;
		$results['data']['itemCode'] = $itemCode;
		$results['data']['name'] = $name;
		unset($results['data']['id']);
		$params = array($results['data']);
		$db->insert('items', $params);
		$results = $db->results();
		$localData['data']['id'] = (int)$results['id'];
		return $localData;
	}

	function checkParams(&$data, $params): void
	{
		global $returnData, $uiLang;
		if (!$params || count($params) == 0) {
			return;
		}
		foreach ($params as $key) {
			if (!isset($data[$key])) {
				$returnData['error'] = $uiLang->translate("Error: missing parameter") . "'$key'!";
				die();
			}
		}
	}

	function encodeObjects(&$data, $params): void
	{
		if (!$params || count($params) == 0) {
			return;
		}
		foreach ($params as $key) {
			if (isset($data[$key])) {
				$data[$key] = json_encode($data[$key], JSON_FORCE_OBJECT + JSON_UNESCAPED_UNICODE);
			}
		}
	}

	function encodeArrays(&$data, $params): void
	{
		if (!$params || count($params) == 0) {
			return;
		}
		foreach ($params as $key) {
			if (isset($data[$key])) {
				$data[$key] = json_encode($data[$key], JSON_UNESCAPED_UNICODE);
			}
		}
	}

	function outputJSON(): void
	{
		global $returnData, $action;

		// updated username
		global $myAuth;
		if (isset($myAuth)) {
			$returnData['loggedInName'] = $myAuth->username;

			/* return admin level(s) */
			$returnData['isSuper'] = $myAuth->checkSA();
			$returnData['isAdmin'] = $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin();
		}

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
