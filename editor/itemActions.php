<?php

	/** @phan-file-suppress PhanUnusedGlobalFunctionParameter, PhanUnusedVariable, PhanRedefineFunction, PhanUnusedClosureParameter, PhanTypeArraySuspiciousNullable, PhanSuspiciousWeakTypeComparison, PhanUnusedVariableValueOfForeachWithKey, PhanUnusedPublicNoOverrideMethodParameter */

	//the JSON output will happen, even if a fatal error prevents the script from finishing
	register_shutdown_function('outputJSON');
	require_once __DIR__ . "/inc/php/initBackend.php";
	require_once 'inc/php/MediaTool.php';
	require_once 'inc/php/registerActivity.php';
	require_once 'interactions/InteractionCompiler.php';
	require_once 'inc/php/PageGroupPackage.php';

	$action = filter_input(INPUT_POST, 'action');
	if (!$action) {
		$action = "";
	}

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

	$db = $app->getDatabaseInstance();

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
				if (oasysRejectUnknownAction(__FILE__, $action, $returnData)) exit;
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

	function itemCurrentLockOwnerIds(): array
	{
		global $backendState;
		$ids = [];
		if (isset($backendState)) {
			try {
				$ids[] = (string)$backendState->getStateId();
			} catch (Throwable $e) {
				// Fall back to cookies below.
			}
		}
		if (!empty($_COOKIE['oasysStateBackend'])) $ids[] = (string)$_COOKIE['oasysStateBackend'];
		if (!empty($_COOKIE[session_name()])) $ids[] = (string)$_COOKIE[session_name()];
		return array_values(array_unique(array_filter($ids)));
	}

	function itemPrimaryLockOwnerId(): ?string
	{
		$ids = itemCurrentLockOwnerIds();
		return $ids[0] ?? null;
	}

	function itemDecodeLock(?string $rawLock): array
	{
		$lock = json_decode($rawLock ?? '', true);
		if (json_last_error() !== JSON_ERROR_NONE || !is_array($lock)) return [];
		return $lock;
	}

	function itemLockIsActive(array $lock): bool
	{
		$ownerId = isset($lock['sessionId']) ? (string)$lock['sessionId'] : '';
		if ($ownerId === '') return false;
		$timestamp = isset($lock['timestamp']) ? strtotime((string)$lock['timestamp']) : false;
		return ($timestamp === false || time() - $timestamp < 60);
	}

	function itemLockBelongsToCurrentUser(array $lock): bool
	{
		$ownerId = isset($lock['sessionId']) ? (string)$lock['sessionId'] : '';
		return ($ownerId !== '' && in_array($ownerId, itemCurrentLockOwnerIds(), true));
	}

	function itemStateDataValue(?string $rawStateData, string $property): mixed
	{
		$stateData = json_decode($rawStateData ?? '', true);
		if (json_last_error() !== JSON_ERROR_NONE || !is_array($stateData) || !isset($stateData[$property])) return null;
		$type = $stateData[$property]['type'] ?? null;
		$value = $stateData[$property]['value'] ?? null;
		return match ($type) {
			'array' => json_decode((string)$value, true),
			'object' => json_decode((string)$value, false),
			'boolean' => filter_var($value, FILTER_VALIDATE_BOOLEAN),
			default => $value,
		};
	}

	function itemLockUserName(array $lock, rixPDO &$db): string
	{
		if (!empty($lock['userName'])) return (string)$lock['userName'];
		if (!empty($lock['userId'])) {
			$name = $db->fetchValue("SELECT name FROM users WHERE id=? LIMIT 1", [(int)$lock['userId']])['data'] ?? null;
			if ($name) return (string)$name;
		}
		$ownerId = isset($lock['sessionId']) ? (string)$lock['sessionId'] : '';
		if ($ownerId !== '') {
			$stateRow = $db->fetchRow("SELECT data FROM stateBackend WHERE stateId=? LIMIT 1", [$ownerId]);
			if (($stateRow['rows'] ?? 0) > 0) {
				$username = itemStateDataValue($stateRow['data']['data'] ?? null, 'username');
				if ($username) return (string)$username;
				$userId = itemStateDataValue($stateRow['data']['data'] ?? null, 'userid');
				if ($userId) {
					$name = $db->fetchValue("SELECT name FROM users WHERE id=? LIMIT 1", [(int)$userId])['data'] ?? null;
					if ($name) return (string)$name;
				}
			}
		}
		return 'another user';
	}

	function itemBackendStateTimeLeft(?string $ownerId, rixPDO &$db): int
	{
		global $settings;
		if (!$ownerId) return 0;
		$sessionLifeTime = (int)($settings['sessionTimeout'] ?? 30) * 60;
		$stateRow = $db->fetchRow("SELECT active FROM stateBackend WHERE stateId=? LIMIT 1", [$ownerId]);
		if (($stateRow['rows'] ?? 0) > 0) {
			return max(0, strtotime((string)$stateRow['data']['active']) + $sessionLifeTime - time());
		}
		return 0;
	}

	function fetchLibrary(array $data, rixPDO &$db, array &$returnData): void
	{
		global $uiLang, $backendState;
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

		$user = $backendState->userid;
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
						if ((int)($db->fetchValue("SELECT `owner` FROM `itemFolders` WHERE id = ?", [intval($item['dbId'])])['data'] ?? 0) === $myAuth->userid) {
							$pArr[$item['dbId']][$jsFnName] = true;

							// regular permission check
						} else {
							$pArr[$item['dbId']][$jsFnName] = $permAuth->getAccessVal("itemgroup", $fnName, "itemObject", intval($item['dbId']));
						}
					}

					// button types for itemGroup objects
					if ($item['type'] === 'itemGroup') {
						// itemGroup in folder owner check
						if ((int)($db->fetchValue("SELECT `owner` FROM `itemFolders` WHERE id = ?", [intval(ltrim($item['pid'], 'f'))])['data'] ?? 0) === $myAuth->userid) {
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
			if ((in_array('superadmin', $userGroupList) || in_array('admin', $userGroupList)) || (int)($db->fetchValue("SELECT `owner` FROM `itemFolders` WHERE id = ?", [$location])['data'] ?? 0) === $myAuth->userid) {
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
		$returnData['data']['preview'] = fetchItemGroupPreview((int)$data['id'], $db);
		$lockedPages = [];
		foreach (($returnData['data']['preview']['pages'] ?? []) as $pagePreview) {
			$lockedPages[(int)$pagePreview['id']] = (bool)($pagePreview['publishedLocked'] ?? false);
		}
		foreach ($returnData['data']['items'] as &$itemRow) {
			$itemRow['publishedLocked'] = $lockedPages[(int)$itemRow['id']] ?? false;
		}
		unset($itemRow);
	}

	function fetchItemGroupPreview(int $groupId, rixPDO &$db, bool $includeTestUsage = true): array
	{
		$itemResult = $db->fetchTable(
			"SELECT id, groupId, itemCode, name, languages, blocks, fields, metadata, link FROM items WHERE groupId=? ORDER BY itemCode",
			[$groupId]
		);
		$items = $itemResult['data'] ?? [];
		$pageIds = array_map(static fn($item) => (int)$item['id'], $items);
		$usage = $includeTestUsage ? fetchPublishedTestUsageForPages($pageIds, $db) : [];
		$stimulusNames = [];
		foreach ($items as $item) {
			$stimulusNames[(int)$item['id']] = (string)$item['name'];
		}

		$pages = [];
		foreach ($items as $item) {
			$pageId = (int)$item['id'];
			$languages = json_decode($item['languages'] ?? '[]', true);
			if (!is_array($languages)) $languages = [];
			$metadata = json_decode($item['metadata'] ?? '{}', true);
			if (!is_array($metadata)) $metadata = [];
			$fields = json_decode($item['fields'] ?? '{}', true);
			if (!is_array($fields)) $fields = [];
			$blocks = json_decode($item['blocks'] ?? '[]', true);
			if (!is_array($blocks)) $blocks = [];

			$interactionCounts = [];
			$interactionDetails = [];
			foreach ($blocks as $blockIndex => $block) {
				$type = is_array($block) ? ($block['type'] ?? null) : null;
				if (!$type) continue;
				$interactionCounts[$type] = ($interactionCounts[$type] ?? 0) + 1;
				$blockId = is_array($block) ? (string)($block['id'] ?? '') : '';
				$blockFields = [];
				foreach ($fields as $fieldId => $fieldData) {
					if (!is_array($fieldData)) continue;
					$fieldBlockNumber = isset($fieldData['blockNumber']) ? (int)$fieldData['blockNumber'] : null;
					if ($fieldBlockNumber !== $blockIndex && (string)$fieldId !== $blockId) continue;
					$blockFields[] = [
						'id' => (string)$fieldId,
						'type' => (string)($fieldData['type'] ?? ''),
						'category' => (string)($fieldData['category'] ?? ''),
						'required' => !empty($fieldData['required']),
						'processing' => (string)($fieldData['processing'] ?? ''),
						'export' => (string)($fieldData['export'] ?? ''),
						'choiceCount' => isset($fieldData['choices']) && is_array($fieldData['choices']) ? count($fieldData['choices']) : 0,
						'subfieldCount' => isset($fieldData['fields']) && is_array($fieldData['fields']) ? count($fieldData['fields']) : 0,
					];
				}
				$interactionSettings = [];
				foreach (['mandatory', 'required', 'processing', 'choiceType', 'order', 'alignment', 'labelPosition', 'size', 'width', 'filter', 'case', 'limitPlayCount', 'maxPlayCount', 'navigateOnEnd', 'autoPlay', 'hidden'] as $settingKey) {
					if (!is_array($block) || !array_key_exists($settingKey, $block)) continue;
					$value = $block[$settingKey];
					if (is_bool($value)) {
						$value = $value ? 'yes' : 'no';
					} elseif (is_array($value) || is_object($value)) {
						$value = count((array)$value);
					}
					if ($value === '' || $value === null) continue;
					$interactionSettings[$settingKey] = (string)$value;
				}
				$interactionDetails[] = [
					'position' => $blockIndex + 1,
					'type' => $type,
					'id' => $blockId,
					'title' => cmPreviewInteractionTitle($block, $languages),
					'export' => is_array($block) ? (string)($block['export'] ?? '') : '',
					'visibility' => is_array($block) ? (string)($block['visibility'] ?? '') : '',
					'settings' => $interactionSettings,
					'fields' => $blockFields,
				];
			}
			ksort($interactionCounts);

			$linkedStimulus = isset($item['link']) && $item['link'] !== null ? (int)$item['link'] : null;
			$pageUsage = $usage[$pageId] ?? ['total' => 0, 'draft' => 0, 'published' => 0, 'tests' => []];
			$pages[] = [
				'id' => $pageId,
				'code' => $item['itemCode'],
				'name' => $item['name'],
				'languages' => array_values($languages),
				'interactions' => $interactionCounts,
				'interactionDetails' => $interactionDetails,
				'interactionTotal' => count($blocks),
				'fieldCount' => count($fields),
				'isStimulus' => (($metadata['useAsStimulus'] ?? false) === true),
				'linkedStimulusId' => $linkedStimulus,
				'linkedStimulusName' => $linkedStimulus !== null ? ($stimulusNames[$linkedStimulus] ?? null) : null,
				'archived' => (($metadata['archived'] ?? false) === true),
				'comments' => $metadata['comments'] ?? '',
				'testUsage' => $pageUsage,
				'publishedLocked' => ((int)($pageUsage['published'] ?? 0) > 0),
			];
		}

		return [
			'pages' => $pages,
			'media' => fetchItemGroupMediaPreview($groupId, $items, $db),
			'lastBackendEdit' => fetchPageGroupLastBackendEdit($groupId, $db),
		];
	}

	function cmImportGetPageGroup(int $groupId, rixPDO &$db): ?array
	{
		$result = $db->fetchRow("SELECT id, name, parent FROM itemGroups WHERE id=? LIMIT 1", [$groupId]);
		if (!empty($result['error']) || ($result['rows'] ?? 0) === 0) return null;
		return $result['data'];
	}

	function cmImportCanReadPageGroup(array $group, rixPDO &$db): bool
	{
		global $myAuth, $permAuth;
		if ($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin()) return true;
		$parentId = (int)($group['parent'] ?? 0);
		$ownerId = (int)($db->fetchValue("SELECT owner FROM itemFolders WHERE id=? LIMIT 1", [$parentId])['data'] ?? 0);
		if ($ownerId > 0 && $ownerId === (int)$myAuth->userid) return true;
		return $parentId > 0 && $permAuth->getAccessVal('items', 'fetchItemGroup', 'itemObject', $parentId) === true;
	}

	function cmImportCanEditPageGroup(array $group, rixPDO &$db): bool
	{
		global $myAuth, $permAuth;
		if ($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin()) return true;
		$parentId = (int)($group['parent'] ?? 0);
		$ownerId = (int)($db->fetchValue("SELECT owner FROM itemFolders WHERE id=? LIMIT 1", [$parentId])['data'] ?? 0);
		if ($ownerId > 0 && $ownerId === (int)$myAuth->userid) return true;
		return $parentId > 0 && $permAuth->getAccessVal('items', 'checkItemGroup', 'itemObject', $parentId) === true;
	}

	function cmImportTargetGroup(array $data, rixPDO &$db, array &$returnData): ?array
	{
		global $uiLang;
		$targetGroupId = (int)($data['targetGroupId'] ?? $data['groupId'] ?? 0);
		$targetGroup = cmImportGetPageGroup($targetGroupId, $db);
		if ($targetGroup === null) {
			$returnData['error'] = $uiLang->translate('The page group you are editing has been deleted by another user. The view will be refreshed.');
			$returnData['reloadFolder'] = true;
			return null;
		}
		if (!cmImportCanEditPageGroup($targetGroup, $db)) {
			$returnData['error'] = $uiLang->translate('You do not have permission to import pages into this page group.');
			return null;
		}
		return $targetGroup;
	}

	function fetchExistingPageGroups(array $data, rixPDO &$db, array &$returnData): void
	{
		$targetGroup = cmImportTargetGroup($data, $db, $returnData);
		if ($targetGroup === null) return;

		$rows = $db->fetchTable(
			"SELECT itemGroups.id, itemGroups.name, itemGroups.parent, COUNT(items.id) AS pageCount
			FROM itemGroups
			INNER JOIN items ON items.groupId = itemGroups.id
			GROUP BY itemGroups.id, itemGroups.name, itemGroups.parent
			HAVING COUNT(items.id) > 0
			ORDER BY itemGroups.name, itemGroups.id"
		)['data'] ?? [];
		$groups = [];
		foreach ($rows as $group) {
			if ((int)$group['id'] === (int)$targetGroup['id']) continue;
			if (!cmImportCanReadPageGroup($group, $db)) continue;
			$groups[] = [
				'id' => (int)$group['id'],
				'name' => (string)$group['name'],
				'pageCount' => (int)$group['pageCount'],
			];
		}
		$returnData['data']['pageGroups'] = $groups;
	}

	function fetchExistingPageGroupPages(array $data, rixPDO &$db, array &$returnData): void
	{
		$targetGroup = cmImportTargetGroup($data, $db, $returnData);
		if ($targetGroup === null) return;
		$sourceGroup = cmImportGetPageGroup((int)($data['sourceGroupId'] ?? 0), $db);
		if ($sourceGroup === null || !cmImportCanReadPageGroup($sourceGroup, $db)) {
			global $uiLang;
			$returnData['error'] = $uiLang->translate('The selected source page group is no longer available.');
			return;
		}

		$preview = fetchItemGroupPreview((int)$sourceGroup['id'], $db, false);
		$mediaByPageId = [];
		foreach (($preview['media']['used'] ?? []) as $media) {
			foreach (($media['usedPages'] ?? []) as $usedPage) {
				$pageId = (int)($usedPage['id'] ?? 0);
				if ($pageId <= 0) continue;
				$mediaByPageId[$pageId][] = [
					'id' => (int)$media['id'],
					'name' => (string)$media['name'],
					'filetype' => (string)$media['filetype'],
				];
			}
		}
		$pages = $preview['pages'] ?? [];
		foreach ($pages as &$page) {
			$page['media'] = $mediaByPageId[(int)$page['id']] ?? [];
		}
		unset($page);
		$targetMedia = $db->fetchColumn("SELECT name FROM media WHERE parent=?", [(int)$targetGroup['id']])['data'] ?? [];
		$returnData['data'] = [
			'sourceGroup' => ['id' => (int)$sourceGroup['id'], 'name' => (string)$sourceGroup['name']],
			'pages' => $pages,
			'targetMediaNames' => array_values(array_map('strval', $targetMedia)),
		];
	}

	function cmImportAssertDbResult($result, string $operation): void
	{
		if (!is_array($result) || !empty($result['error'])) {
			throw new RuntimeException($operation);
		}
	}

	function preparePageGroupExport(array $data, rixPDO &$db, array &$returnData): void
	{
		global $uiLang, $myAuth;
		if (!($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin())) {
			$returnData['error'] = $uiLang->translate('Only administrators may export page-group packages.');
			return;
		}
		try {
			$package = pgpCreateExportPackage(is_array($data['groupIds'] ?? null) ? $data['groupIds'] : [], $db);
			$returnData['data'] = [
				'groupCount' => $package['groupCount'],
				'filename' => $package['filename'],
				'downloadUrl' => 'pageGroupPackageDownload.php?token=' . rawurlencode($package['token']),
			];
		} catch (Throwable $e) {
			$returnData['error'] = $uiLang->translate($e->getMessage());
		}
	}

	function stagePageGroupPackage(array $data, rixPDO &$db, array &$returnData): void
	{
		global $uiLang, $myAuth;
		if (!($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin())) {
			$returnData['error'] = $uiLang->translate('Only administrators may import page-group packages.');
			return;
		}
		$folderId = (int)($data['location'] ?? 0);
		if ($folderId <= 0) {
			$returnData['error'] = $uiLang->translate('No destination folder was selected.');
			return;
		}
		$file = $_FILES['package'] ?? null;
		if (!is_array($file)) {
			$returnData['error'] = (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0
				? $uiLang->translate('The selected package exceeds this server\'s upload size limit.')
				: $uiLang->translate('Select a page-group package to import.');
			return;
		}
		if ((int)($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
			$returnData['error'] = match ((int)$file['error']) {
				UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => $uiLang->translate('The selected package exceeds this server\'s upload size limit.'),
				UPLOAD_ERR_PARTIAL => $uiLang->translate('The package was only partially uploaded.'),
				default => $uiLang->translate('The package upload failed.'),
			};
			return;
		}
		if (!is_uploaded_file((string)$file['tmp_name'])) {
			$returnData['error'] = $uiLang->translate('The package upload is unavailable. Please try again.');
			return;
		}
		if (strtolower(pathinfo((string)$file['name'], PATHINFO_EXTENSION)) !== 'zip') {
			$returnData['error'] = $uiLang->translate('Select an OASYS page-group ZIP package.');
			return;
		}
		if (!pgpCanCreateInFolder($folderId, $db)) {
			$returnData['error'] = $uiLang->translate('You do not have permission to create page groups in the selected folder.');
			return;
		}
		try {
			$returnData['data'] = pgpStageImportPackage((string)$file['tmp_name'], (string)$file['name'], $folderId, $db);
		} catch (Throwable $e) {
			$returnData['error'] = $e->getMessage();
		}
	}

	function importStagedPageGroupPackage(array $data, rixPDO &$db, array &$returnData): void
	{
		global $uiLang, $myAuth;
		if (!($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin())) {
			$returnData['error'] = $uiLang->translate('Only administrators may import page-group packages.');
			return;
		}
		$folderId = (int)($data['location'] ?? 0);
		$token = (string)($data['token'] ?? '');
		if ($folderId <= 0 || $token === '') {
			$returnData['error'] = $uiLang->translate('The package review has expired. Select the package again.');
			return;
		}
		if (!pgpCanCreateInFolder($folderId, $db)) {
			$returnData['error'] = $uiLang->translate('You do not have permission to create page groups in the selected folder.');
			return;
		}
		$staged = pgpReadStagedImport($token, $folderId);
		if ($staged === null) {
			$returnData['error'] = $uiLang->translate('The package review has expired. Select the package again.');
			return;
		}
		ini_set('max_execution_time', '1800');
		set_time_limit(1800);
		try {
			$returnData['data'] = pgpImportArchive($staged['zipPath'], $folderId, $db);
		} catch (Throwable $e) {
			$returnData['error'] = $e->getMessage();
		} finally {
			pgpDeleteStagedImport($token);
		}
	}

	function importExistingPages(array $data, rixPDO &$db, array &$returnData): void
	{
		global $settings, $uiLang, $myAuth;
		$targetGroup = cmImportTargetGroup($data, $db, $returnData);
		if ($targetGroup === null) return;
		$sourceGroupId = (int)($data['sourceGroupId'] ?? 0);
		$sourceGroup = cmImportGetPageGroup($sourceGroupId, $db);
		if ($sourceGroup === null || !cmImportCanReadPageGroup($sourceGroup, $db)) {
			$returnData['error'] = $uiLang->translate('The selected source page group is no longer available.');
			return;
		}
		if ((int)$sourceGroup['id'] === (int)$targetGroup['id']) {
			$returnData['error'] = $uiLang->translate('Pages cannot be imported from the page group currently being edited.');
			return;
		}

		$pageIds = array_values(array_unique(array_filter(array_map('intval', is_array($data['pageIds'] ?? null) ? $data['pageIds'] : []), static fn($id) => $id > 0)));
		if (empty($pageIds)) {
			$returnData['error'] = $uiLang->translate('Select at least one test page to import.');
			return;
		}

		$sourcePages = [];
		$loadPage = static function(int $pageId) use (&$sourcePages, $sourceGroupId, $db): void {
			if (isset($sourcePages[$pageId])) return;
			$result = $db->fetchRow("SELECT * FROM items WHERE id=? AND groupId=? LIMIT 1", [$pageId, $sourceGroupId]);
			if (!empty($result['error']) || ($result['rows'] ?? 0) === 0) {
				throw new RuntimeException('The selected source page no longer exists.');
			}
			$sourcePages[$pageId] = $result['data'];
		};

		try {
			foreach ($pageIds as $pageId) $loadPage($pageId);
			$hasNewLinkedPage = true;
			while ($hasNewLinkedPage) {
				$hasNewLinkedPage = false;
				foreach ($sourcePages as $page) {
					$linkedStimulusId = (int)($page['link'] ?? 0);
					if ($linkedStimulusId > 0 && !isset($sourcePages[$linkedStimulusId])) {
						$loadPage($linkedStimulusId);
						$hasNewLinkedPage = true;
					}
				}
			}

			// Legacy blank pages can have no stored language. The page editor normally
			// supplies the user's default language when opening them; do the same here
			// before the copied page is compiled.
			$availableLanguagesResult = $db->fetchColumn('SELECT code FROM languages ORDER BY code');
			cmImportAssertDbResult($availableLanguagesResult, 'Could not determine an import language.');
			$availableLanguages = array_values(array_map('strval', $availableLanguagesResult['data'] ?? []));
			$defaultLanguage = (string)($settings['defaultLanguage'] ?? '');
			if (!in_array($defaultLanguage, $availableLanguages, true)) $defaultLanguage = $availableLanguages[0] ?? '';
			if ($defaultLanguage === '') throw new RuntimeException('No language is available for the imported test pages.');
			foreach ($sourcePages as &$sourcePage) {
				$languages = json_decode($sourcePage['languages'] ?? '[]', true, 512, JSON_THROW_ON_ERROR);
				if (!is_array($languages)) throw new RuntimeException('A selected source page contains invalid language data.');
				if (count($languages) === 0) {
					$sourcePage['languages'] = json_encode([$defaultLanguage], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
				}
			}
			unset($sourcePage);

			$mediaTool = new MediaTool();
			if ($mediaTool->hasErrors()) throw new RuntimeException(implode('<br>', $mediaTool->getErrors()));
			$sourceMediaIds = [];
			$mediaPageNames = [];
			foreach ($sourcePages as $page) {
				$mediaData = $mediaTool->parseBlocks($page['blocks'] ?? '[]', $page['languages'] ?? '[]');
				if ($mediaTool->hasErrors()) throw new RuntimeException(implode('<br>', $mediaTool->getErrors()));
				foreach (($mediaData->mediaIds ?? []) as $mediaId) {
					$mediaId = (int)$mediaId;
					$sourceMediaIds[$mediaId] = true;
					$mediaPageNames[$mediaId][] = (string)$page['name'];
				}
			}
			$sourceMediaIds = array_keys($sourceMediaIds);
			$sourceMedia = [];
			if (!empty($sourceMediaIds)) {
				$placeholders = implode(',', array_fill(0, count($sourceMediaIds), '?'));
				$mediaRows = $db->fetchTable("SELECT id, name, filetype, created, filesize, uuid FROM media WHERE parent=? AND id IN ($placeholders)", array_merge([$sourceGroupId], $sourceMediaIds))['data'] ?? [];
				foreach ($mediaRows as $media) $sourceMedia[(int)$media['id']] = $media;
				if (count($sourceMedia) !== count($sourceMediaIds)) {
					throw new RuntimeException($uiLang->translate('One or more media files referenced by the selected pages are no longer available.'));
				}
			}

			$sourceDir = '';
			$targetDir = '';
			$mediaLocation = $settings['mediaLocation'] ?? '';
			if (!empty($sourceMedia) && !in_array($mediaLocation, ['disk', 'database'], true)) {
				throw new RuntimeException($uiLang->translate('The configured media storage location is invalid.'));
			}
			if ($mediaLocation === 'disk' && !empty($sourceMedia)) {
				$sourceDir = __DIR__ . "/../media/$sourceGroupId";
				$targetDir = __DIR__ . '/../media/' . (int)$targetGroup['id'];
				foreach ($sourceMedia as $media) {
					if (!is_file($sourceDir . '/' . (int)$media['id'] . '.dat')) {
						throw new RuntimeException($uiLang->translate('A media file referenced by the selected pages is missing from storage.'));
					}
				}
			}

			$transactionStarted = false;
			$targetDirCreated = false;
			$copiedFiles = [];
			try {
				if ($db->startTransaction() !== true) throw new RuntimeException('Could not start the import transaction.');
				$transactionStarted = true;
				$targetMediaRows = $db->fetchColumn("SELECT name FROM media WHERE parent=? FOR UPDATE", [(int)$targetGroup['id']])['data'] ?? [];
				$targetMediaNames = array_fill_keys(array_map('strval', $targetMediaRows), true);
				$conflicts = [];
				foreach ($sourceMedia as $oldMediaId => $media) {
					$name = (string)$media['name'];
					if ($name !== '' && isset($targetMediaNames[$name])) {
						$conflicts[] = [
							'name' => $name,
							'filetype' => (string)($media['filetype'] ?? ''),
							'pages' => array_values(array_unique($mediaPageNames[$oldMediaId] ?? [])),
						];
					}
				}
				if (!empty($conflicts)) {
					$conflictRows = array_map(static function(array $conflict): string {
						$name = htmlspecialchars($conflict['name'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
						$type = htmlspecialchars(strtoupper($conflict['filetype'] ?: 'unknown'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
						$pages = implode(', ', array_map(static fn($page) => htmlspecialchars($page, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'), $conflict['pages']));
						return '<li><strong>' . $name . '</strong><span>' . $type . ($pages !== '' ? ' | ' . $pages : '') . '</span></li>';
					}, $conflicts);
					throw new RuntimeException('<div class="cmImportConflictMessage"><strong>' . $uiLang->translate('Media conflicts') . '</strong><span>' . $uiLang->translate('Import was cancelled because these media files already exist in the destination page group.') . '</span><ul>' . implode('', $conflictRows) . '</ul></div>');
				}

				$mediaMap = [];
				if ($targetDir !== '' && !is_dir($targetDir)) {
					if (!mkdir($targetDir, 0775, true) && !is_dir($targetDir)) throw new RuntimeException($uiLang->translate('Creation of the media directory failed.'));
					$targetDirCreated = true;
				}
				foreach ($sourceMedia as $oldMediaId => $media) {
					$insertResult = $db->execute("INSERT INTO media (name, filetype, parent, created, filesize, uuid) SELECT name, filetype, ?, created, filesize, UUID() FROM media WHERE id=?", [(int)$targetGroup['id'], $oldMediaId]);
					cmImportAssertDbResult($insertResult, 'Could not create imported media information.');
					$newMediaId = (int)($insertResult['id'] ?? 0);
					if ($newMediaId <= 0) throw new RuntimeException('Could not create imported media information.');
					$newUuid = (string)($db->fetchValue("SELECT uuid FROM media WHERE id=?", [$newMediaId])['data'] ?? '');
					$mediaMap[$oldMediaId] = ['id' => $newMediaId, 'uuid' => $newUuid, 'oldUuid' => (string)$media['uuid'], 'oldId' => $oldMediaId];
					if ($mediaLocation === 'database') {
						$copyResult = $db->execute("INSERT INTO mediaFiles (id, data) SELECT ?, data FROM mediaFiles WHERE id=?", [$newMediaId, $oldMediaId]);
						cmImportAssertDbResult($copyResult, 'Could not copy imported media data.');
						if ((int)($copyResult['rows'] ?? 0) !== 1) throw new RuntimeException('Could not copy imported media data.');
					} elseif ($targetDir !== '') {
						$targetPath = $targetDir . '/' . $newMediaId . '.dat';
						if (!copy($sourceDir . '/' . $oldMediaId . '.dat', $targetPath)) throw new RuntimeException($uiLang->translate('Could not copy imported media data.'));
						$copiedFiles[] = $targetPath;
					}
				}

				$pageIdMap = [];
				foreach ($sourcePages as $oldPageId => $page) {
					$pageCopy = $page;
					unset($pageCopy['id']);
					$pageCopy['groupId'] = (int)$targetGroup['id'];
					$pageCopy['link'] = null;
					$pageCopy['lock'] = null;
					$insertResult = $db->insert('items', [$pageCopy]);
					cmImportAssertDbResult($insertResult, 'Could not create imported test page.');
					$newPageId = (int)($db->results()['id'] ?? 0);
					if ($newPageId <= 0) throw new RuntimeException('Could not create imported test page.');
					$pageIdMap[$oldPageId] = $newPageId;
				}

				foreach ($sourcePages as $oldPageId => $page) {
					$blocks = json_decode($page['blocks'] ?? '[]', false, 512, JSON_THROW_ON_ERROR);
					$languages = json_decode($page['languages'] ?? '[]', true, 512, JSON_THROW_ON_ERROR);
					if (!is_array($blocks)) $blocks = [];
					if (!is_array($languages)) $languages = [];
					$mediaTool->replaceMediaIds($blocks, $mediaMap);
					$compiler = new InteractionCompiler($blocks, $languages, $pageIdMap[$oldPageId], $db, []);
					$compiler->compileBlocks();
					if ($compiler->getErrors()) throw new RuntimeException((string)$compiler->getErrors());
					$metadata = json_decode($page['metadata'] ?? '{}', false, 512, JSON_THROW_ON_ERROR);
					if (!is_object($metadata)) $metadata = new stdClass();
					foreach ($compiler->getMetadata() as $key => $value) $metadata->$key = $value;
					$linkedStimulusId = (int)($page['link'] ?? 0);
					$pageData = [
						'fields' => $compiler->getFields(),
						'options' => $compiler->getOptions(),
						'parsed' => $compiler->getParsed(),
						'scripts' => $compiler->getScripts(),
						'blocks' => $compiler->getBlocks(),
						'metadata' => json_encode($metadata, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
						'link' => $linkedStimulusId > 0 ? ($pageIdMap[$linkedStimulusId] ?? null) : null,
					];
					$updateResult = $db->update('items', $pageData, 'id=?', [$pageIdMap[$oldPageId]]);
					cmImportAssertDbResult($updateResult, 'Could not finalize imported test page.');
				}
				if ($db->commit() !== true) throw new RuntimeException('Could not complete the import transaction.');
				$transactionStarted = false;
			} catch (Throwable $e) {
				if ($transactionStarted) $db->rollback();
				foreach ($copiedFiles as $path) @unlink($path);
				if ($targetDirCreated && $targetDir !== '') @rmdir($targetDir);
				throw $e;
			}
		} catch (Throwable $e) {
			$returnData['error'] = $e->getMessage();
			return;
		}

		registerActivity($db, (int)$myAuth->userid, (int)$targetGroup['id'], 'pagegroup');
		$returnData['data']['importedPageCount'] = count($sourcePages);
		fetchItemGroup(['id' => (int)$targetGroup['id']], $db, $returnData);
	}

	function cmPreviewLocalizedValue(array $data, string $key, array $languages): string
	{
		if (!isset($data[$key]) || !is_array($data[$key])) return '';
		foreach ($languages as $lang) {
			if (isset($data[$key][$lang]) && $data[$key][$lang] !== '') {
				return (string)$data[$key][$lang];
			}
		}
		foreach ($data[$key] as $value) {
			if ($value !== '') return (string)$value;
		}
		return '';
	}

	function cmPreviewTitleText(string $value): string
	{
		return trim(html_entity_decode(strip_tags($value), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
	}

	function cmPreviewInteractionTitle(array $block, array $languages): string
	{
		$type = (string)($block['type'] ?? '');
		if (in_array($type, ['audio', 'image', 'video'], true)) {
			return cmPreviewTitleText(cmPreviewLocalizedValue($block, 'filename', $languages));
		}
		if (in_array($type, ['button', 'languageswitcher'], true)) {
			return cmPreviewTitleText(cmPreviewLocalizedValue($block, 'label', $languages));
		}
		if (in_array($type, ['advanced', 'wysiwyg'], true)) {
			return cmPreviewTitleText(cmPreviewLocalizedValue($block, 'source', $languages));
		}
		return cmPreviewTitleText(cmPreviewLocalizedValue($block, 'question', $languages));
	}

	function fetchPublishedTestUsageForPages(array $pageIds, rixPDO &$db): array
	{
		$usage = [];
		foreach ($pageIds as $pageId) {
			$usage[(int)$pageId] = ['total' => 0, 'draft' => 0, 'published' => 0, 'tests' => []];
		}
		if (empty($pageIds)) return $usage;

		$poolRows = $db->fetchTable("SELECT id, structure FROM testPools", [])['data'] ?? [];
		$poolPages = [];
		foreach ($poolRows as $pool) {
			$structure = json_decode($pool['structure'] ?? '', true);
			$poolId = (int)$pool['id'];
			$poolPages[$poolId] = [];
			foreach (($structure['items'] ?? []) as $entry) {
				if (isset($entry['hiddenID'])) {
					$poolPages[$poolId][] = (int)$entry['hiddenID'];
				}
			}
		}

		$testRows = $db->fetchTable("SELECT id, name, structure FROM tests WHERE structure IS NOT NULL AND structure <> ''", [])['data'] ?? [];
		$linkRows = $db->fetchTable("SELECT id, link FROM items WHERE link IS NOT NULL", [])['data'] ?? [];
		$linkedStimulusByPage = [];
		foreach ($linkRows as $linkRow) {
			$linkedStimulusByPage[(int)$linkRow['id']] = (int)$linkRow['link'];
		}
		$testMap = [];
		foreach ($testRows as $test) {
			$structure = json_decode($test['structure'] ?? '', true);
			if (!is_array($structure)) continue;
			$testMap[(int)$test['id']] = ['row' => $test, 'structure' => $structure];
		}
		$collectPages = static function(array $structure, array $seenTests = []) use (&$collectPages, &$testMap, $poolPages): array {
			$type = $structure['type'] ?? 'linear';
			$testPageIds = [];
			foreach (($structure['items'] ?? []) as $entry) {
				if (!isset($entry['hiddenID'])) continue;
				$hiddenId = (int)$entry['hiddenID'];
				if ($type === 'fluid') {
					$testPageIds = array_merge($testPageIds, $poolPages[$hiddenId] ?? []);
				} elseif ($type === 'mutation') {
					if (isset($seenTests[$hiddenId]) || !isset($testMap[$hiddenId])) continue;
					$seenTests[$hiddenId] = true;
					$testPageIds = array_merge($testPageIds, $collectPages($testMap[$hiddenId]['structure'], $seenTests));
				} else {
					$testPageIds[] = $hiddenId;
				}
			}
			return array_values(array_unique($testPageIds));
		};
		foreach ($testMap as $testId => $testEntry) {
			$test = $testEntry['row'];
			$structure = $testEntry['structure'];
			$state = tmNormalizeContentPreviewTestState($structure['state'] ?? 'draft');
			$type = $structure['type'] ?? 'linear';
			$testPageIds = $collectPages($structure, [$testId => true]);
			$usagePageIds = [];
			foreach ($testPageIds as $pageId) {
				if (!isset($usage[$pageId])) continue;
				$usagePageIds[] = $pageId;
			}
			foreach ($testPageIds as $pageId) {
				$stimulusId = $linkedStimulusByPage[(int)$pageId] ?? null;
				if ($stimulusId !== null && isset($usage[$stimulusId])) {
					$usagePageIds[] = $stimulusId;
				}
			}
			foreach (array_values(array_unique($usagePageIds)) as $pageId) {
				$usage[$pageId]['total']++;
				$usage[$pageId][$state]++;
				$usage[$pageId]['tests'][] = [
					'id' => (int)$test['id'],
					'name' => $test['name'],
					'state' => $state,
					'type' => $type,
				];
			}
		}
		return $usage;
	}

	function fetchItemGroupMediaPreview(int $groupId, array $items, rixPDO &$db): array
	{
		$mediaRows = $db->fetchTable(
			"SELECT id, name, filetype, filesize, created, uuid FROM media WHERE parent=? ORDER BY filetype, name",
			[$groupId]
		)['data'] ?? [];
		$usedIds = [];
		$usedPagesByMediaId = [];
		$mediaTool = new MediaTool();
		foreach ($items as $item) {
			$mediaData = $mediaTool->parseBlocks($item['blocks'] ?? '[]', $item['languages'] ?? '[]');
			$pageMediaIds = array_values(array_unique(array_map('intval', $mediaData->mediaIds ?? [])));
			if (empty($pageMediaIds)) continue;
			$metadata = json_decode($item['metadata'] ?? '{}', true);
			if (!is_array($metadata)) $metadata = [];
			foreach ($pageMediaIds as $mediaId) {
				$usedIds[$mediaId] = true;
				if (!isset($usedPagesByMediaId[$mediaId])) $usedPagesByMediaId[$mediaId] = [];
				$usedPagesByMediaId[$mediaId][] = [
					'id' => (int)$item['id'],
					'name' => (string)$item['name'],
					'code' => $item['itemCode'],
					'archived' => (($metadata['archived'] ?? false) === true),
				];
			}
		}
		$byType = [];
		$used = [];
		$unused = [];
		foreach ($mediaRows as $row) {
			$type = strtolower((string)($row['filetype'] ?? 'unknown'));
			if ($type === '') $type = 'unknown';
			if (!isset($byType[$type])) $byType[$type] = ['total' => 0, 'used' => 0, 'unused' => 0];
			$entry = [
				'id' => (int)$row['id'],
				'name' => $row['name'],
				'filetype' => $type,
				'filesize' => (int)($row['filesize'] ?? 0),
				'created' => $row['created'],
				'uuid' => $row['uuid'],
				'used' => isset($usedIds[(int)$row['id']]),
				'usedPages' => $usedPagesByMediaId[(int)$row['id']] ?? [],
			];
			$byType[$type]['total']++;
			if ($entry['used']) {
				$byType[$type]['used']++;
				$used[] = $entry;
			} else {
				$byType[$type]['unused']++;
				$unused[] = $entry;
			}
		}
		$knownMediaIds = array_fill_keys(array_map(static fn($row) => (int)$row['id'], $mediaRows), true);
		$missingUsedIds = array_values(array_filter(array_keys($usedIds), static fn($id) => !isset($knownMediaIds[(int)$id])));
		ksort($byType);
		return [
			'total' => count($mediaRows),
			'usedCount' => count($used),
			'unusedCount' => count($unused),
			'byType' => $byType,
			'used' => $used,
			'unused' => $unused,
			'missingUsedIds' => $missingUsedIds,
		];
	}

	function fetchPageGroupLastBackendEdit(int $groupId, rixPDO &$db): ?array
	{
		$rows = $db->fetchTable("SELECT id, name, activity FROM users WHERE activity IS NOT NULL AND activity <> ''", [])['data'] ?? [];
		$userNames = [];
		foreach ($rows as $row) {
			$userNames[(int)$row['id']] = (string)$row['name'];
		}
		$latest = null;
		$addCandidate = static function(int $userId, ?string $userName, ?string $ts) use (&$latest): void {
			if ($userId <= 0 || !$ts) return;
			if ($latest === null || strcmp($ts, (string)$latest['ts']) > 0) {
				$latest = ['userId' => $userId, 'userName' => $userName ?: 'deleted', 'ts' => $ts];
			}
		};
		foreach ($rows as $row) {
			$activity = json_decode($row['activity'] ?? '', true);
			if (json_last_error() !== JSON_ERROR_NONE || !is_array($activity) || !is_array($activity['lastEdited'] ?? null)) continue;
			foreach ($activity['lastEdited'] as $entry) {
				if ((int)($entry['id'] ?? 0) !== $groupId || strtolower((string)($entry['type'] ?? '')) !== 'pagegroup') continue;
				$addCandidate((int)$row['id'], (string)$row['name'], isset($entry['ts']) ? (string)$entry['ts'] : null);
				foreach (($entry['others'] ?? []) as $other) {
					$otherId = (int)($other['userId'] ?? 0);
					$addCandidate($otherId, $userNames[$otherId] ?? null, isset($other['ts']) ? (string)$other['ts'] : null);
				}
				break;
			}
		}
		return $latest;
	}

	function tmNormalizeContentPreviewTestState($state): string
	{
		return $state === 'published' ? 'published' : 'draft';
	}

	function abortIfPageLockedByPublishedTest(int $pageId, rixPDO &$db, array &$returnData): void
	{
		global $uiLang;
		$usage = fetchPublishedTestUsageForPages([$pageId], $db);
		if ((int)($usage[$pageId]['published'] ?? 0) > 0) {
			$returnData['error'] = $uiLang->translate('This page is used in at least one published (locked) test and cannot be edited to secure test results. Please use the preview to view its content.');
			die();
		}
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
		$usage = fetchPublishedTestUsageForPages([(int)$data['id']], $db);
		$returnData['data']['item']['publishedLocked'] = ((int)($usage[(int)$data['id']]['published'] ?? 0) > 0);
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

		global $myAuth;
		$transactionStarted = false;
		try {
			if ($db->startTransaction() !== true) throw new RuntimeException('Could not start the folder creation transaction.');
			$transactionStarted = true;
			$parent = $db->fetchRow('SELECT id FROM itemFolders WHERE id=? FOR UPDATE', [$location]);
			if (($parent['rows'] ?? 0) !== 1) throw new RuntimeException('The target folder no longer exists.');
			$results = $db->fetchValue('SELECT COUNT(*) FROM itemFolders WHERE name=? AND parent=?', [$name, $location]);
			if ((int)($results['data'] ?? 0) !== 0) throw new DomainException('A folder with that name already exists. Try using another name.');
			cmImportAssertDbResult($db->insert('itemFolders', ['parent' => $location, 'name' => $name, 'owner' => $myAuth->userid]), 'Could not create the folder.');
			$results = $db->results();
			if ($db->commit() !== true) throw new RuntimeException('Could not complete folder creation.');
			$transactionStarted = false;
		} catch (Throwable $e) {
			if ($transactionStarted) $db->rollback();
			$returnData['error'] = $uiLang->translate($e->getMessage());
			return;
		}
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

		global $myAuth;
		$transactionStarted = false;
		try {
			if ($db->startTransaction() !== true) throw new RuntimeException('Could not start the page-group creation transaction.');
			$transactionStarted = true;
			$parent = $db->fetchRow('SELECT id FROM itemFolders WHERE id=? FOR UPDATE', [$location]);
			if (($parent['rows'] ?? 0) !== 1) throw new RuntimeException('The target folder no longer exists.');
			$results = $db->fetchValue('SELECT COUNT(*) FROM itemGroups WHERE name=? AND parent=?', [$name, $location]);
			if ((int)($results['data'] ?? 0) !== 0) throw new DomainException('A page group with that name already exists in the current folder. Try using another name.');
			cmImportAssertDbResult($db->insert('itemGroups', [['parent' => $location, 'name' => $name, 'owner' => $myAuth->userid]]), 'Could not create the page group.');
			$results = $db->results();
			if ($db->commit() !== true) throw new RuntimeException('Could not complete page-group creation.');
			$transactionStarted = false;
		} catch (Throwable $e) {
			if ($transactionStarted) $db->rollback();
			$returnData['error'] = $uiLang->translate($e->getMessage());
			return;
		}
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
		abortIfPageLockedByPublishedTest((int)$id, $db, $returnData);

		$parameters = [$id];
		$query = "SELECT `lock` FROM items WHERE id=? LIMIT 1";
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

		$lock = itemDecodeLock($result['data']['lock'] ?? null);
		if (itemLockIsActive($lock) && !itemLockBelongsToCurrentUser($lock)) {
			$returnData['error'] = $uiLang->translate("It is not possible to edit the selected page right now. It is currently being edited by another user.") . '<br />' .
				$uiLang->translate('User') . ': ' . htmlspecialchars(itemLockUserName($lock, $db), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
			die();
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

		global $uiLang, $myAuth;

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

		registerActivity($db, (int)$myAuth->userid, $groupId, 'pagegroup');

		fetchItemGroup(array('id' => $groupId, 'location' => $location), $db, $returnData);
	}

	function updateWatchList($data, &$db, &$returnData): void
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
		($type === 'folder') ? $target = 1 : $target = 2;

		if (isset($backendState)) {
			$user = $backendState->userid;
			if ($status) {
				//Check if element is still available
				($type === 'folder') ? $query = "SELECT `id` FROM itemFolders WHERE `id` = ? LIMIT 1" : $query = "SELECT `id` FROM itemGroups WHERE `id` = ? LIMIT 1";
				$parameters = array($id);
				$result = $db->fetchRow($query, $parameters);
				//Write watchlist
				if (($result['rows'] ?? 0) > 0) {
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

		global $uiLang, $myAuth;

		$type = $data['type'];
		$name = $data['name'];
		$id = $data['id'];
		$location = $data['location'];

		// preserve original name for logging purposes
		$qType = $data['type'] === 'folder' ? "itemFolders" : "itemGroups";
		/** @noinspection SqlResolve */
		$data['origName'] = $db->fetchValue("SELECT `name` FROM $qType WHERE `id` = ?", [$id])['data'];

		if ($type == 'folder') {
			$table = 'itemFolders';
			$prefix = 'f';
		} else {
			$table = 'itemGroups';
			$prefix = 'ig';
		}

		$transactionStarted = false;
		try {
			if ($db->startTransaction() !== true) throw new RuntimeException('Could not start the rename transaction.');
			$transactionStarted = true;
			$parent = $db->fetchRow('SELECT id FROM itemFolders WHERE id=? FOR UPDATE', [$location]);
			if (($parent['rows'] ?? 0) !== 1) throw new RuntimeException('The parent folder no longer exists.');
			$current = $db->fetchRow("SELECT id FROM $table WHERE id=? AND parent=? FOR UPDATE", [$id, $location]);
			if (($current['rows'] ?? 0) !== 1) throw new RuntimeException('The selected object no longer exists in this folder.');
			$duplicate = $db->fetchValue("SELECT COUNT(*) FROM $table WHERE name=? AND parent=? AND id<>?", [$name, $location, $id]);
			if ((int)($duplicate['data'] ?? 0) !== 0) {
				$message = $type === 'folder' ? 'A folder with that name already exists. Try using another name.' : 'A page group with that name already exists in the current folder. Try using another name.';
				throw new DomainException($message);
			}
			cmImportAssertDbResult($db->update($table, ['name' => $name], 'id=? AND parent=?', [$id, $location]), 'Could not rename the selected object.');
			if ($db->commit() !== true) throw new RuntimeException('Could not complete the rename.');
			$transactionStarted = false;
		} catch (Throwable $e) {
			if ($transactionStarted) $db->rollback();
			$returnData['error'] = $uiLang->translate($e->getMessage());
			return;
		}
		if ($type !== 'folder') registerActivity($db, (int)$myAuth->userid, $id, 'pagegroup');

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
		// PARAMS: name, itemCode, id, groupId
		checkParams($data, array('name', 'itemCode', 'id', 'groupId'));

		global $uiLang, $myAuth;

		//redirects to fetchItem
		$itemCode = $data['itemCode'];
		$name = $data['name'];
		$id = $data['id'];
		$groupId = $data['groupId'];
		abortIfPageLockedByPublishedTest((int)$id, $db, $returnData);

		$db->update('items', array('name' => $name, 'itemCode' => $itemCode), 'id=?', array($id));
		$results = $db->results();
		if ($results['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("The page has been deleted by another user. The view will be refreshed.");
			$returnData['action'] = 'fetchItem'; //changing the action here in order to use the fallback routines of the fetchItem action if an error like this occurs
			die();
		}

		registerActivity($db, (int)$myAuth->userid, $groupId, 'pagegroup');

		fetchItem($data, $db, $returnData);
	}

	function duplicateItemGroup(array $data, rixPDO &$db, array &$returnData): void
	{
		checkParams($data, array('location', 'sources', 'target'));
		global $uiLang, $myAuth, $settings;
		$objects = $data['sources'];
		$target = (int)$data['target'];
		$groupIds = array_values(array_unique(array_map('intval', $objects['files'] ?? [])));
		$createdDiskGroups = [];
		$transactionStarted = false;
		try {
			if ($db->startTransaction() !== true) throw new RuntimeException('Could not start the duplication transaction.');
			$transactionStarted = true;
			$targetRow = $db->fetchRow('SELECT id FROM itemFolders WHERE id=? FOR UPDATE', [$target]);
			if (($targetRow['rows'] ?? 0) !== 1) throw new RuntimeException('The target folder no longer exists.');
			foreach ($groupIds as $groupId) {
				$sourceGroup = $db->fetchRow('SELECT * FROM itemGroups WHERE id=? LIMIT 1', [$groupId]);
				if (($sourceGroup['rows'] ?? 0) === 0) throw new RuntimeException('A selected page group no longer exists.');
				$name = checkExisting('itemGroups', $groupId, $target, $db);
				$result = $db->execute(
					'INSERT INTO itemGroups (`name`, `options`, `info`, `parent`, `owner`, `permissions`) VALUES (?, ?, ?, ?, ?, ?)',
					[$name, $sourceGroup['data']['options'], $sourceGroup['data']['info'], $target, (int)$myAuth->userid, $sourceGroup['data']['permissions']]
				);
				cmImportAssertDbResult($result, 'Could not duplicate the page group.');
				$newGroupId = (int)($result['id'] ?? 0);
				if ($newGroupId <= 0) throw new RuntimeException('Could not duplicate the page group.');

				$sourcePages = $db->fetchTable('SELECT * FROM items WHERE groupId=? ORDER BY id', [$groupId])['data'] ?? [];
				$pageIdMap = [];
				foreach ($sourcePages as $sourcePage) {
					$oldPageId = (int)$sourcePage['id'];
					$pageCopy = $sourcePage;
					unset($pageCopy['id']);
					$pageCopy['groupId'] = $newGroupId;
					$pageCopy['link'] = null;
					$pageCopy['lock'] = null;
					$db->insert('items', [$pageCopy]);
					$insertResult = $db->results();
					cmImportAssertDbResult($insertResult, 'Could not duplicate a test page.');
					$pageIdMap[$oldPageId] = (int)($insertResult['id'] ?? 0);
					if ($pageIdMap[$oldPageId] <= 0) throw new RuntimeException('Could not duplicate a test page.');
				}

				$mediaMap = [];
				$sourceMedia = $db->fetchTable('SELECT * FROM media WHERE parent=? ORDER BY id', [$groupId])['data'] ?? [];
				$sourceDir = __DIR__ . '/../media/' . $groupId;
				$targetDir = __DIR__ . '/../media/' . $newGroupId;
				if (($settings['mediaLocation'] ?? '') === 'disk' && !empty($sourceMedia)) {
					if (!is_dir($targetDir) && !mkdir($targetDir, 0775, true) && !is_dir($targetDir)) throw new RuntimeException('Could not create the duplicated media directory.');
					$createdDiskGroups[] = $newGroupId;
				}
				foreach ($sourceMedia as $media) {
					$oldMediaId = (int)$media['id'];
					$result = $db->execute('INSERT INTO media (`name`, `filetype`, `parent`, `created`, `filesize`, `uuid`) VALUES (?, ?, ?, ?, ?, UUID())', [$media['name'], $media['filetype'], $newGroupId, $media['created'], $media['filesize']]);
					cmImportAssertDbResult($result, 'Could not duplicate media information.');
					$newMediaId = (int)($result['id'] ?? 0);
					$newUuid = (string)($db->fetchValue('SELECT uuid FROM media WHERE id=?', [$newMediaId])['data'] ?? '');
					$mediaMap[$oldMediaId] = ['id' => $newMediaId, 'uuid' => $newUuid, 'oldUuid' => (string)$media['uuid'], 'oldId' => $oldMediaId];
					if (($settings['mediaLocation'] ?? '') === 'disk') {
						$sourcePath = $sourceDir . '/' . $oldMediaId . '.dat';
						$targetPath = $targetDir . '/' . $newMediaId . '.dat';
						if (!is_file($sourcePath) || !copy($sourcePath, $targetPath)) throw new RuntimeException('A media file could not be duplicated from disk storage.');
					} elseif (($settings['mediaLocation'] ?? '') === 'database') {
						$result = $db->execute('INSERT INTO mediaFiles (`id`, `data`) SELECT ?, `data` FROM mediaFiles WHERE id=?', [$newMediaId, $oldMediaId]);
						cmImportAssertDbResult($result, 'Could not duplicate media data.');
						if ((int)($result['rows'] ?? 0) !== 1) throw new RuntimeException('A media file is missing from database storage.');
					} else {
						throw new RuntimeException('The configured media storage location is invalid.');
					}
				}

				$mediaTool = new MediaTool();
				if ($mediaTool->hasErrors()) throw new RuntimeException(implode('<br>', (array)$mediaTool->getErrors()));
				foreach ($sourcePages as $sourcePage) {
					$oldPageId = (int)$sourcePage['id'];
					$newPageId = $pageIdMap[$oldPageId];
					$blocks = json_decode($sourcePage['blocks'] ?? '[]', false, 512, JSON_THROW_ON_ERROR);
					$languages = json_decode($sourcePage['languages'] ?? '[]', true, 512, JSON_THROW_ON_ERROR);
					$metadata = json_decode($sourcePage['metadata'] ?? '{}', false, 512, JSON_THROW_ON_ERROR);
					if (!is_array($blocks) || !is_array($languages) || !is_object($metadata)) throw new JsonException('A duplicated page contains invalid JSON data.');
					$mediaTool->replaceMediaIds($blocks, $mediaMap);
					$compiler = new InteractionCompiler($blocks, $languages, $newPageId, $db, []);
					$compiler->compileBlocks();
					if ($compiler->getErrors()) throw new RuntimeException((string)$compiler->getErrors());
					foreach ($compiler->getMetadata() as $key => $value) $metadata->$key = $value;
					$pageData = [
						'fields' => $compiler->getFields(), 'options' => $compiler->getOptions(),
						'parsed' => $compiler->getParsed(), 'scripts' => $compiler->getScripts(),
						'blocks' => $compiler->getBlocks(),
						'metadata' => json_encode($metadata, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
						'link' => isset($pageIdMap[(int)($sourcePage['link'] ?? 0)]) ? $pageIdMap[(int)$sourcePage['link']] : null,
					];
					cmImportAssertDbResult($db->update('items', $pageData, 'id=?', [$newPageId]), 'Could not finalize a duplicated test page.');
				}
				registerActivity($db, (int)$myAuth->userid, $newGroupId, 'pagegroup');
			}
			if ($db->commit() !== true) throw new RuntimeException('Could not complete the duplication transaction.');
			$transactionStarted = false;
		} catch (Throwable $e) {
			if ($transactionStarted) $db->rollback();
			foreach ($createdDiskGroups as $createdGroupId) deleteGroupMediaFiles($createdGroupId);
			$returnData['error'] = $uiLang->translate($e->getMessage());
			return;
		}
		fetchLibrary($data, $db, $returnData);
	}

	function duplicateItem(array $data, rixPDO &$db, array &$returnData): void
	{
		global $myAuth;
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
		registerActivity($db, (int)$myAuth->userid, $groupId, 'pagegroup');

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

		$transactionStarted = false;
		try {
			if ($db->startTransaction() !== true) throw new RuntimeException('Could not start the move transaction.');
			$transactionStarted = true;
			$targetRow = $db->fetchRow('SELECT id FROM itemFolders WHERE id=? FOR UPDATE', [$target]);
			if (($targetRow['rows'] ?? 0) !== 1) throw new RuntimeException('The target folder no longer exists.');
			foreach ($folders as $folder) {
				$returnData['db'][] = ['folder' => $folder, 'target' => $target];
				$current = $db->fetchRow('SELECT parent FROM itemFolders WHERE id=? FOR UPDATE', [$folder]);
				if (($current['rows'] ?? 0) !== 1) throw new RuntimeException('A selected folder no longer exists.');
				if ((int)$current['data']['parent'] === (int)$target) continue;
				if (checkPath($target, $db, $folder) === false) throw new DomainException('You are not able to move a folder into itself!');
				$name = checkExisting('itemFolders', $folder, $target, $db);
				cmImportAssertDbResult($db->execute('UPDATE itemFolders SET parent=?, name=? WHERE id=?', [$target, $name, $folder]), 'Could not move a selected folder.');
				$hasIh = (int)($db->fetchValue('SELECT COUNT(*) FROM itemFolderAccess WHERE folderId=? AND inherited IS NOT NULL', [$folder])['data'] ?? 0);
				cmImportAssertDbResult($db->execute('UPDATE itemFolderAccess SET inherited=? WHERE folderId=?', [null, $folder]), 'Could not update inherited folder permissions.');
				if ($hasIh > 0) {
					$fldName = (string)($db->fetchValue('SELECT name FROM itemFolders WHERE id=?', [$folder])['data'] ?? '');
					$safeFldName = htmlspecialchars($fldName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
					$returnData['ihMsg'] = "Note that inheritance has been removed from the folder &quot;<strong>$safeFldName</strong>&quot; due to folder relocation.";
				}
			}
			foreach ($files as $file) {
				$current = $db->fetchRow('SELECT parent FROM itemGroups WHERE id=? FOR UPDATE', [$file]);
				if (($current['rows'] ?? 0) !== 1) throw new RuntimeException('A selected page group no longer exists.');
				if ((int)$current['data']['parent'] === (int)$target) continue;
				$name = checkExisting('itemGroups', $file, $target, $db);
				cmImportAssertDbResult($db->execute('UPDATE itemGroups SET parent=?, name=? WHERE id=?', [$target, $name, $file]), 'Could not move a selected page group.');
			}
			if ($db->commit() !== true) throw new RuntimeException('Could not complete the move.');
			$transactionStarted = false;
		} catch (Throwable $e) {
			if ($transactionStarted) $db->rollback();
			$returnData['error'] = $uiLang->translate($e->getMessage());
			return;
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

		$selectedItemIds = [];
		if (count($folders) > 0) {
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
			$selectedItemIds = array_merge($selectedItemIds, $res['data'] ?? []);
		}
		if (count($groups) > 0) {
			$query = "SELECT DISTINCT id FROM items WHERE $pageClause";
			$res = $db->fetchColumn($query, $groups);
			$selectedItemIds = array_merge($selectedItemIds, $res['data'] ?? []);
		}
		if (!empty($selectedItemIds)) {
			$usage = fetchPublishedTestUsageForPages(array_map('intval', $selectedItemIds), $db);
			foreach ($usage as $pageUsage) {
				if ((int)($pageUsage['published'] ?? 0) > 0) {
					$returnData['error'] = $uiLang->translate("One or more pages in your selection are used in at least one published (locked) test and cannot be deleted to secure test results. Please use the preview to view their content.");
					die();
				}
			}
		}

		if (!isset($data['force'])) {

			$warnings = ['locked' => false, 'results' => false, 'used' => false, 'publishedLocked' => false];

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
						$warnings['publishedLocked'] = $warnings['publishedLocked'] || ($itemWarnings['publishedLocked'] ?? false);
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
						$warnings['publishedLocked'] = $warnings['publishedLocked'] || ($itemWarnings['publishedLocked'] ?? false);
					}
				}
			}

			$returnData['location'] = $data['location'];
			$returnData['selection'] = $data['selection'];

			if ($warnings['locked'] === true) {
				$returnData['error'] = $uiLang->translate("One or more of the pages in your selection is being edited by another user at the moment. The selection cannot be deleted!");
				die();
			}
			if ($warnings['publishedLocked'] === true) {
				$returnData['error'] = $uiLang->translate("One or more pages in your selection are used in at least one published (locked) test and cannot be deleted to secure test results. Please use the preview to view their content.");
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

		$mediaGroupIds = array_map('intval', $groups);
		foreach ($folders as $folder) {
			$mediaGroupIds = array_merge($mediaGroupIds, collectFolderMediaGroupIds((int)$folder, $db));
		}
		$mediaGroupIds = array_values(array_unique($mediaGroupIds));
		$transactionStarted = false;
		try {
			if ($db->startTransaction() !== true) throw new RuntimeException('Could not start the deletion transaction.');
			$transactionStarted = true;
			if (count($folders) > 0) cmImportAssertDbResult($db->execute('DELETE FROM itemFolders WHERE ' . $folderClause, $folders), 'Could not delete the selected folders.');
			if (count($groups) > 0) cmImportAssertDbResult($db->execute('DELETE FROM itemGroups WHERE ' . $groupClause, $groups), 'Could not delete the selected page groups.');
			if ($db->commit() !== true) throw new RuntimeException('Could not complete the deletion.');
			$transactionStarted = false;
		} catch (Throwable $e) {
			if ($transactionStarted) $db->rollback();
			$returnData['error'] = $uiLang->translate($e->getMessage());
			return;
		}
		// Remove files only after the database deletion is safely committed.
		foreach ($mediaGroupIds as $groupId) deleteGroupMediaFiles($groupId);

		// log action
		global $myAuth;
		$myAuth->prepLog($data, "delSelection", $returnData);

		fetchLibrary($data, $db, $returnData);
	}

	function collectFolderMediaGroupIds(int $folderId, rixPDO &$db): array
	{
		$res = $db->fetchColumn(
			'WITH RECURSIVE path AS (
				SELECT id, parent FROM itemFolders WHERE id=?
				UNION ALL
				SELECT f.id, f.parent FROM itemFolders f JOIN path p ON f.parent=p.id
			) SELECT itemGroups.id FROM path JOIN itemGroups ON path.id=itemGroups.parent',
			[$folderId]
		);
		return array_values(array_map('intval', $res['data'] ?? []));
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

		global $uiLang, $myAuth;

		// PARAMS: id, groupId, [force]
		checkParams($data, array('id', 'groupId'));
		$returnData['data']['id'] = $data['id'];
		$groupId = $data['groupId'];
		abortIfPageLockedByPublishedTest((int)$data['id'], $db, $returnData);

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
		$myAuth->prepLog($data, 'deleteItem', $returnData);
		registerActivity($db, (int)$myAuth->userid, $groupId, 'pagegroup');
		fetchItemGroup(['id' => $data['groupId']], $db, $returnData);
	}

	function checkIfItemIsDeletable(int $id, rixPDO &$db, array &$returnData): array
	{
		$warnings = ['locked' => false, 'results' => false, 'used' => false, 'publishedLocked' => false];
		$usage = fetchPublishedTestUsageForPages([$id], $db);
		if ((int)($usage[$id]['published'] ?? 0) > 0) {
			$warnings['publishedLocked'] = true;
			return $warnings;
		}

		$query = "SELECT `lock` FROM items WHERE id=? LIMIT 1";
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

		$lock = itemDecodeLock($result['data']['lock'] ?? null);
		if (itemLockIsActive($lock) && !itemLockBelongsToCurrentUser($lock)) {
			$warnings['locked'] = true;
			return $warnings;
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
		abortIfPageLockedByPublishedTest((int)$data['id'], $db, $returnData);
		$db->update("items", ['link' => null], "link = ?", [$data['id']]);

		global $myAuth;
		registerActivity($db, (int)$myAuth->userid, $data['groupId'], 'pagegroup');
		fetchItemGroup(['id' => $data['groupId']], $db, $returnData);
	}

	function saveItemGroup(array $data, rixPDO &$db, array &$returnData): void
	{

		// PARAMS: id
		checkParams($data, array('id'));

		$id = (int)$data['id'];
		// Only editable page-group properties belong in this generic save action.
		// Parent, owner and permissions have dedicated permission-aware workflows.
		$data = array_intersect_key($data, array_flip(['options', 'info']));

		encodeObjects($data, array('options', 'info'));

		//save the item group data
		if (count($data) > 0) {
			$db->update('itemGroups', $data, 'id=?', array($id));
		}

		global $myAuth;
		registerActivity($db, (int)$myAuth->userid, $id, 'pagegroup');

		//get updated item group from database (as verification)
		$query = "SELECT *, 'itemGroup' AS type FROM itemGroups WHERE id=?";
		$parameters = array($id);
		$results = $db->fetchRow($query, $parameters);
		$returnData['data'] = $results['data'];
		$query = "SELECT id, groupId, itemCode, name, languages, fields, link, metadata FROM items WHERE groupId=? ORDER BY itemCode";
		$parameters = array($id);
		$results = $db->fetchTable($query, $parameters);
		$returnData['data']['items'] = $results['data'];
		$returnData['data']['preview'] = fetchItemGroupPreview((int)$id, $db);
		$lockedPages = [];
		foreach (($returnData['data']['preview']['pages'] ?? []) as $pagePreview) {
			$lockedPages[(int)$pagePreview['id']] = !empty($pagePreview['publishedLocked']);
		}
		foreach ($returnData['data']['items'] as &$item) {
			$item['publishedLocked'] = $lockedPages[(int)$item['id']] ?? false;
		}
		unset($item);
	}

	function saveItem(array $data, rixPDO &$db, array &$returnData): void
	{
		global $uiLang;

		// PARAMS: id
		checkParams($data, array('id', 'groupId', 'metadata', 'languages'));

		//redirects to fetchItem
		$originalData = $data;

		//remove id from fields to update
		$id = (int)$data['id'];
		abortIfPageLockedByPublishedTest((int)$id, $db, $returnData);
		$currentItem = $db->fetchRow('SELECT groupId FROM items WHERE id=? LIMIT 1', [$id]);
		if (($currentItem['rows'] ?? 0) === 0) {
			$returnData['error'] = $uiLang->translate('The page has been deleted by another user. The view will be refreshed.');
			$returnData['reloadFolder'] = true;
			return;
		}
		$groupId = (int)$currentItem['data']['groupId'];
		if ((int)$data['groupId'] !== $groupId) {
			$returnData['error'] = $uiLang->translate('The page location has changed. The view will be refreshed.');
			$returnData['reloadFolder'] = true;
			return;
		}
		// Never accept database ownership/location/lock or compiled columns from
		// this property-save endpoint.
		$data = array_intersect_key($data, array_flip(['name', 'itemCode', 'languages', 'link', 'metadata']));

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

		global $myAuth;
		registerActivity($db, (int)$myAuth->userid, $groupId, 'pagegroup');

		fetchItem($originalData, $db, $returnData);
	}

	function search(array $data, rixPDO &$db, array &$returnData): void
	{
		$searchString = oasysLikeContainsPattern((string)$data['searchString']);
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
					WHERE name LIKE ? ESCAPE '='
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
						CASE WHEN CAST(itemGroups.id AS CHAR) LIKE ? ESCAPE '=' THEN 'ID: ' ELSE NULL END AS subresult,
						CASE WHEN CAST(itemGroups.id AS CHAR) LIKE ? ESCAPE '=' THEN CAST(itemGroups.id AS CHAR) ELSE NULL END AS subresultvalue
					FROM itemGroups
					WHERE name LIKE ? ESCAPE '=' OR CAST(itemGroups.id AS CHAR) LIKE ? ESCAPE '='
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
					INNER JOIN items WHERE items.name LIKE ? ESCAPE '=' AND itemGroups.id=items.groupId
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
					INNER JOIN items WHERE items.itemCode LIKE ? ESCAPE '=' AND itemGroups.id=items.groupId
					UNION
					SELECT CONCAT('ig',itemGroups.id) AS id,
						CAST(itemGroups.id AS UNSIGNED) AS 'dbId',
						CAST(itemGroups.parent AS UNSIGNED) AS parent,
						CONCAT('f', itemGroups.parent) AS pid,
						'itemGroup' AS type,
						itemGroups.name,
						itemGroups.name AS label,
						itemGroups.name AS sortKey,
						'Page ID: ' AS subresult,
						CAST(items.id AS CHAR) AS subresultvalue
					FROM itemGroups
					INNER JOIN items WHERE CAST(items.id AS CHAR) LIKE ? ESCAPE '=' AND itemGroups.id=items.groupId
					ORDER BY name";

		$parameters = array($searchString, $searchString, $searchString, $searchString, $searchString, $searchString, $searchString, $searchString);
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

	function fetchMetaTagSuggestions(array $data, rixPDO &$db, array &$returnData): void
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
				metaSuggestionAdd($suggestions, $row['info']);
			}
		}
		metaSuggestionSort($suggestions);
		$returnData['suggestions'] = $suggestions;
	}

	function metaSearch(array $data, rixPDO &$db, array &$returnData): void
	{
		global $permAuth;
		$keyTerm = trim((string)($data['key'] ?? ''));
		$valueTerm = trim((string)($data['value'] ?? ''));
		$exact = !empty($data['exact']);
		$singleOnly = !empty($data['singleOnly']);
		$list = [];
		$rows = $db->fetchTable("SELECT id, parent, name, info FROM itemGroups WHERE info IS NOT NULL AND info <> ''")['data'] ?? [];
		foreach ($rows as $row) {
			if ($permAuth->permCheck(['remCall' => true, 'fid' => (int)$row['parent'], 'action' => 'search']) !== true) continue;
			$match = metaInfoMatch($row['info'], $keyTerm, $valueTerm, $exact, $singleOnly);
			if ($match === null) continue;
			$list[] = [
				'id' => 'ig' . $row['id'],
				'dbId' => (int)$row['id'],
				'parent' => (int)$row['parent'],
				'pid' => 'f' . $row['parent'],
				'type' => 'itemGroup',
				'name' => $row['name'],
				'label' => $row['name'],
				'sortKey' => $row['name'],
				'subresult' => $match['label'],
				'subresultvalue' => $match['value'],
				'canWrite' => $permAuth->permCheck(['remCall' => true, 'fid' => (int)$row['parent'], 'action' => 'deleteItem'])
			];
		}
		foreach ($list as $key => $row) {
			$list[$key]['path'] = pathToString(fetchPath($row['parent'], $returnData, $db));
		}
		$returnData['data']['list'] = $list;
		$returnData['data']['searchString'] = metaSearchLabel($keyTerm, $valueTerm, $singleOnly);
	}

	function metaSuggestionAdd(array &$suggestions, ?string $info): void
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

	function metaSuggestionSort(array &$suggestions): void
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

	function metaInfoMatch(?string $info, string $keyTerm, string $valueTerm, bool $exact, bool $singleOnly): ?array
	{
		$decoded = json_decode($info ?? '', true);
		if (!is_array($decoded)) return null;
		foreach ($decoded as $key => $value) {
			if (!is_scalar($value) && $value !== null) continue;
			$value = (string)($value ?? '');
			$isSingle = $value === '';
			if ($singleOnly && !$isSingle) continue;
			if ($keyTerm !== '' && !metaTextMatches($key, $keyTerm, $exact)) continue;
			if ($valueTerm !== '' && !metaTextMatches($value, $valueTerm, $exact)) continue;
			if ($keyTerm === '' && $valueTerm === '' && !$singleOnly) continue;
			return [
				'label' => $isSingle ? 'Single tag: ' : 'Meta tag: ',
				'value' => $isSingle ? $key : $key . ' = ' . $value
			];
		}
		return null;
	}

	function metaTextMatches(string $value, string $term, bool $exact): bool
	{
		return $exact ? strcasecmp($value, $term) === 0 : stripos($value, $term) !== false;
	}

	function metaSearchLabel(string $keyTerm, string $valueTerm, bool $singleOnly): string
	{
		$parts = [];
		if ($keyTerm !== '') $parts[] = $keyTerm;
		if ($valueTerm !== '') $parts[] = $valueTerm;
		if ($singleOnly) $parts[] = 'single tags';
		return implode(' / ', $parts);
	}

	function lockItem(array $data, rixPDO &$db, array &$returnData): void
	{

		// PARAMS: id, lock, update
		checkParams($data, array('id', 'lock', 'update'));

		global $backendState;

		$lockOwnerId = itemPrimaryLockOwnerId();
		if (!$lockOwnerId) {
			$returnData['sessionTimeLeft'] = 0;
			return;
		}
		$returnData['sessionTimeLeft'] = itemBackendStateTimeLeft($lockOwnerId, $db);
		if ($returnData['sessionTimeLeft'] <= 0) return;

		/*
			If user loses contact to server someone else can start editing a page after 1 minute. If the first user
			manages to reconnect to the server, the lockItem method must verify if the lock still belongs to this user
			and if not the editing session must be interrupted.
		 */
		$query = "SELECT `lock` FROM items WHERE id=?";
		$res = $db->fetchValue($query, [$data['id']]);
		if ($res['data']) {
			$existingLock = itemDecodeLock($res['data']);
			if (itemLockIsActive($existingLock) && !itemLockBelongsToCurrentUser($existingLock)) {
				// Never overwrite or clear another active editor's lock, even on the first heartbeat.
				$returnData['confirmation'] = 'lockExpired';
				return;
			}
		}

		$lock = new stdClass();
		if ($data['lock'] === true) {
			$lock->sessionId = $lockOwnerId;
			$lock->timestamp = date("Y-m-d H:i:s");
			if (isset($backendState->userid)) $lock->userId = (int)$backendState->userid;
			if (isset($backendState->username)) $lock->userName = (string)$backendState->username;
		} else {
			// if the lock is released, we set the sessionId and timestamp to null
			$lock->sessionId = null;
			$lock->timestamp = null;
			$lock->userId = null;
			$lock->userName = null;
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
		$results['data']['lock'] = null;
		$params = array($results['data']);
		$db->insert('items', $params);
		$results = $db->results();
		global $myAuth;
		registerActivity($db, (int)$myAuth->userid, $groupId, 'pagegroup');
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
