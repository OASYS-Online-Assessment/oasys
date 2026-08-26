<?Php

	require_once __DIR__ . "/../../../inc/php/OasysBehaviour.php";
	require_once __DIR__ . "/../../../inc/php/OasysTest.php";
	require_once __DIR__ . "/registerActivity.php";
	require_once __DIR__ . "/resultsExportFiles.php";

	/** @noinspection SqlResolve */
	function fetchLibrary($data, &$db, &$returnData): void
	{
		global $pageName;
		if ($pageName === 'testresults' && function_exists('fetchResultsLibrary')) {
			fetchResultsLibrary($data, $db, $returnData);
			return;
		}

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
            ''                  AS testStructure,
            (SELECT EXISTS(SELECT wl.id FROM watchList wl WHERE wl.foreign_id = tf.id AND wl.foreign_table=3 AND wl.user_id=?)) AS watchList
        FROM   testFolders tf
        WHERE  parent = ?
        UNION
        SELECT Concat('t', tt.id)     AS id,
            tt.id                  AS 'dbId',
            Concat('f', parent) AS pid,
            'test'              AS type,
            `name`,
            name                AS label,
            structure           AS testStructure,
            (SELECT EXISTS(SELECT wl.id FROM watchList wl WHERE wl.foreign_id = tt.id AND wl.foreign_table=4 AND wl.user_id=?)) AS watchList
        FROM   tests tt
        WHERE  parent = ?";

		$parameters = array($user, $location, $user, $location);
		$results = $db->fetchTable($query, $parameters);

		for ($i = 0; $i < count($results['data']); $i++) {
			$results['data'][$i]['testStructure'] = json_decode($results['data'][$i]['testStructure'] ?? '', true);
		}

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
				case 'test':
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
		 * @var array $ptypeArr Holds key/value pairs of the php function name as they relate to the js function button/function names.
		 * Note that the key in this array is the BUTTON NAME value found in the tests.js file for the button!
		 */
		$ptypeArr = [
			'deleteSelection' => 'deleteSelection',
			'renameTestOrFolder' => 'rename',
			'preview' => 'preview',
			'saveTest' => 'editSelection',
			'bulkEdit' => 'bulkEdit',
			'duplicateObjects' => 'duplicate',
			'fetchLibrary' => 'fetchLibrary',
			'newTest' => 'newTest',
			'newFolder' => 'newFolder',
			'fetchIgPerm' => 'fetchIgPerm'
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
						if (!(in_array($fnName, ['fetchIgPerm', 'renameTestOrFolder', 'deleteSelection', 'fetchLibrary']))) continue; // these are the only folder button types which are relevant for folders
						$pArr[$item['dbId']][$jsFnName] = true;
					}

					// button types for test objects
					if ($item['type'] === 'test') {
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

						if (!(in_array($fnName, ['fetchIgPerm', 'renameTestOrFolder', 'deleteSelection', 'fetchLibrary']))) continue; // these are the only folder button types which are relevant for folders

						// folder owner check
						if ((int)($db->fetchValue("SELECT `owner` FROM `testFolders` WHERE id = ?", [intval($item['dbId'])])['data'] ?? 0) === $myAuth->userid) {
							$pArr[$item['dbId']][$jsFnName] = true;
							if ($fnName === "deleteSelection") $pArr[$item['dbId']]["resetTestResults"] = $pArr[$item['dbId']]["deleteSelection"]; // the resetresults button will have the same value as delete rights

							// regular permission check
						} else {
							$pArr[$item['dbId']][$jsFnName] = $permAuth->getAccessVal("itemgroup", $fnName, "itemObject", intval($item['dbId']));
							if ($fnName === "deleteSelection") $pArr[$item['dbId']]["resetTestResults"] = $pArr[$item['dbId']]["deleteSelection"]; // the resetresults button will have the same value as delete rights
						}
					}

					// button types for test objects
					if ($item['type'] === 'test') {
						// test in folder owner check
						if ((int)($db->fetchValue("SELECT `owner` FROM `testFolders` WHERE id = ?", [intval(ltrim($item['pid'], 'f'))])['data'] ?? 0) === $myAuth->userid) {
							$pArr[$item['dbId']][$jsFnName] = true;
							if ($fnName === "deleteSelection") $pArr[$item['dbId']]["resetTestResults"] = $pArr[$item['dbId']]["deleteSelection"]; // the resetresults button will have the same value as delete rights


							// regular test permission check
						} else {
							$pArr[$item['dbId']][$jsFnName] = $permAuth->getAccessVal("itemgroup", $fnName, "itemObject", intval(ltrim($item['pid'], 'f')));
							if ($fnName === "deleteSelection") $pArr[$item['dbId']]["resetTestResults"] = $pArr[$item['dbId']]["deleteSelection"]; // the resetresults button will have the same value as delete rights
						}
					}
				}
			}
		}

		// folder-level action permission access check
		foreach (['newTest', 'newFolder', 'fetchIgPerm', 'bulkEdit'] as $baseFnName) {
			// superadmin and folder owner bypass - they have full permission
			if ((in_array('superadmin', $userGroupList) || in_array('admin', $userGroupList)) || (int)($db->fetchValue("SELECT `owner` FROM `testFolders` WHERE id = ?", [$location])['data'] ?? 0) === $myAuth->userid) {
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
			if ($data['select'][0] === 'f') {
				$selectId = substr($data['select'], 1);
				$query = "SELECT COUNT(*) FROM testFolders WHERE id=? AND parent=?";
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

				$query = "SELECT COUNT(*) FROM tests WHERE id=? AND parent=?";
				$parameters = array($selectId, $location);
				$results = $db->fetchValue($query, $parameters);

				if ($results['data'] === 0) {
					$returnData['error'] = $uiLang->translate("The test you are trying to select has been deleted by another user. The view will be refreshed.");
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

	function fetchPreSelect($data, &$db, &$returnData): void
	{
		/* @var $db rixPDO */
		global $uiLang;
		checkParams($data, array('id', 'type'));
		$id = $data['id'];
		$type = $data['type'];
		if ($type === 3) {
			$query = "SELECT * FROM testFolders WHERE `id` = ? LIMIT 1";
			$prefix = 'f';
		} else if ($type === 4) {
			$query = "SELECT * FROM tests WHERE `id` = ? LIMIT 1";
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


	function fetchItemLibrary($data, &$db, &$returnData): void
	{
		global $uiLang;
		/* @var $db rixPDO */
		checkParams($data, array('location'));

		$location = $data['location'];
		$current = array('folder' => 1, 'path' => 'library');
		if (isset($data['current'])) {
			$current = $data['current'];
		}
		$query = "SELECT COUNT(*) FROM itemFolders WHERE id=?";
		$parameters = array($location);
		$results = $db->fetchValue($query, $parameters);

		if ($results['data'] === 0) {
			$returnData['error'] = $uiLang->translate("The folder has been deleted by somebody else. Press OK to refresh the item group list!");
			$returnData['data']['current'] = $current;
			die();
		}

		$query = "SELECT CONCAT('f',id) as id, id as 'dbId', CONCAT('f', parent) as pid, 'folder' as type, `name`, `name` as label, `name` as sortKey FROM itemFolders WHERE parent=? UNION SELECT CONCAT('t',id) as id, id as 'dbId', CONCAT('f', parent) as pid, 'itemGroup' as type, `name`, `name` as label, `name` as sortKey FROM itemGroups WHERE parent=? ORDER BY name";
		$parameters = array($location, $location);
		$results = $db->fetchTable($query, $parameters);

		# ----------------------------------------------------------------------- #
		# Removal of results on which the user does not have at least view rights #
		# ----------------------------------------------------------------------- #
		global $permAuth, $myAuth;

		foreach ($results['data'] as $key => $value) {

			$hasRead = false; // set default starting value for access

			if ($value['type'] === 'itemGroup' && ($myAuth->checkAdmin() || $myAuth->checkElevatedAdmin() || $myAuth->checkSA() === true)) $hasRead = true;
			if ($value['type'] === 'itemGroup' && $value['pid'] !== 'f1') $hasRead = true;

			if ($value['type'] === 'folder') $hasRead = $permAuth->permCheck(['remCall' => true, 'fid' => intVal($value['dbId']), 'action' => 'fetchItemLibrary']);

			// remove any values which do not have the proper permission
			if ($hasRead !== true) {
				unset($results['data'][$key]);
			}
		}

		// reindex results array
		$results['data'] = array_values($results['data']);


		$returnData['data']['list'] = $results['data'];
		$returnData['data']['path'] = fetchItemPath($location, $returnData, $db);

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

	function checkTest($data, &$db, &$returnData): void
	{
		global $uiLang;
		/* @var $db rixPDO */
		checkParams($data, array('test', 'location'));

		$location = (int)$data['location'];
		$id = (int)$data['test'];

		$query = "SELECT * FROM tests WHERE id=? LIMIT 1";
		$parameters = array($id);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if selected test is not availabe anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("The test you are trying to edit has been deleted by another user. The view will be refreshed.");
			$returnData['reloadFolder'] = true;
			die();
		}
		//Show error message if selected test has been moved to another folder
		if ($result['data']['parent'] !== $location) {
			$returnData['error'] = $uiLang->translate("The test you are trying to edit has been moved to a different folder by another user. The new location will be opened.");
			$returnData['reloadFolder'] = true;
			$returnData['openNewLocation'] = true;
			$returnData['openNewLocationId'] = $result['data']['parent'];
			die();
		}
	}

	function newFolder($data, &$db, &$returnData): void
	{
		global $uiLang;
		/* @var $db rixPDO */
		checkParams($data, ['location', 'name']);

		$location = $data['location'];
		$name = $data['name'];

		// Serialize creates within the same parent so the existence check and insert
		// cannot race with another request using the same name.
		$db->startTransaction();
		$db->fetchRow("SELECT id FROM testFolders WHERE id=? FOR UPDATE", [$location]);
		//verify if a folder with that name already exists on the same level
		$query = "SELECT COUNT(*) FROM testFolders WHERE name=? and parent=?";
		$parameters = array($name, $location);
		$results = $db->fetchValue($query, $parameters);
		// if the name is already in use:
		if ($results['data'] != 0) {
			$db->rollback();
			$returnData['error'] = $uiLang->translate("A folder with that name does already exist. Try using another name.");
			$returnData['reloadFolder'] = true;
			die();
		}

		// after all checks pass, insert new folder values
		global $myAuth;
		$params = array(array('parent' => $location, 'name' => $name, 'owner' => $myAuth->userid));
		$db->insert('testFolders', $params);
		$results = $db->results();
		if (!empty($results['error'])) {
			$db->rollback();
			$returnData['error'] = $uiLang->translate('The folder could not be created.');
			return;
		}
		$returnData['data']['id'] = 'f' . $results['id'];
		$db->commit();

		# ----------------------------------------------- #
		# Call routine to populate permission schema info #
		# ----------------------------------------------- #
		$folderId = $results['id'];
		global $permAuth;
		$permAuth->newFolderPermSet($location, $folderId);
		if (!empty($permAuth->returnData['error'])) {
			$db->prepare('DELETE FROM testFolders WHERE id=?');
			$db->executePrepared(array($folderId));
			$returnData['error'] = $permAuth->returnData['error'];
			return;
		}

		fetchLibrary($data, $db, $returnData);
	}

	function newTest($data, &$db, &$returnData): void
	{
		global $uiLang;
		/* @var $db rixPDO */
		checkParams($data, array('location', 'name', 'defaultOptions', 'defaultSkin', 'testType', 'showBlocked'));

		// redirects to fetchLibrary and selects newly created test
		$location = $data['location'];
		$name = $data['name'];
		$defaultOptions = $data['defaultOptions'];
		$defaultSkin = $data['defaultSkin'];
		$testType = $data['testType'];

		$structure = new stdClass();
		$structure->type = $testType;
		$structure->state = 'draft';
		if ($testType === 'mutation') $structure->pointer = 0;
		$structure->items = array();
		$structure = json_encode($structure);
		// Serialize creates within the same parent so the existence check and insert
		// cannot race with another request using the same name.
		$db->startTransaction();
		$db->fetchRow("SELECT id FROM testFolders WHERE id=? FOR UPDATE", [$location]);
		//verify if the test exits already
		$query = "SELECT COUNT(*) FROM tests WHERE name=? AND parent=?";
		$parameters = array($name, $location);
		$results = $db->fetchValue($query, $parameters);
		// if the name is already in use:
		if ($results['data'] != 0) {
			$db->rollback();
			$returnData['error'] = $uiLang->translate("This test does already exist in the current folder. Try using another name for the test.");
			die();
		}
		//Default set of labels
		if ($testType === 'mutation') {
			$labels = null;
			$skinString = null;
		} else {
			$labels = '{"Introduction":{"default":"no","headline": {"EN":"Introduction","DE":"Einleitung","FR":"Introduction","LU":"Aleedung"},"button": {"EN":"Intro","DE":"Intro","FR":"Intro","LU":"Intro"}},"Page":{"default":"yes","headline": {"EN":"Page [@counter_labelgroup] of [@total_labelgroup]","DE":"Seite [@counter_labelgroup] von [@total_labelgroup]","FR":"Page [@counter_labelgroup] sur [@total_labelgroup]","LU":"Säit [@counter_labelgroup] vun [@total_labelgroup]"},"button": {"EN":"[@counter_total]","DE":"[@counter_total]","FR":"[@counter_total]","LU":"[@counter_total]"}},"Test-Index":{"default":"no","headline": {"EN":"Index","DE":"Verzeichnis","FR":"Index","LU":"Index"},"button": {"EN":"Index","DE":"Index","FR":"Index","LU":"Index"}},"Closing Screen":{"default":"no","headline": {"EN":"End","DE":"Ende","FR":"Fin","LU":"Enn"},"button": {"EN":"End","DE":"Ende","FR":"Fin","LU":"Enn"}}}';
			$skinString = '{"skin":"' . $defaultSkin . '","skinOptions":[]}';
		}

		if ($testType !== 'mutation') unset($defaultOptions['mutationMethod']);
		$defaultOptions = json_encode($defaultOptions);
		$newEntry = array(array('parent' => $location, 'name' => $name, 'options' => $defaultOptions, 'skin' => $skinString, 'structure' => $structure, 'labels' => $labels));
		$db->insert('tests', $newEntry);
		$result = $db->results();
		if (!empty($result['error'])) {
			$db->rollback();
			$returnData['error'] = $uiLang->translate('The test could not be created.');
			return;
		}
		$returnData['data']['id'] = 't' . $result['id'];
		$db->commit();

		fetchLibrary($data, $db, $returnData);
	}

	function fetchTest($data, &$db, &$returnData): void
	{
		global $uiLang;
		/* @var $db rixPDO */
		checkParams($data, array('dbId', 'location'));

		$data['location'] = (int)$data['location'];
		$defaultSkin = $data['defaultSkin'] ?? '';
		if (isset($data['preSelect'])) $returnData['select'] = 't' . $data['dbId'];
		$query = "SELECT * FROM tests WHERE id=? LIMIT 1";
		$parameters = array($data['dbId']);
		$result = $db->fetchRow($query, $parameters);
		$returnData['editRevision'] = tmTestEditRevision($result['data'] ?? array());
		//json block for structure
		$jsonData = json_decode($result['data']['structure'] ?? '', true);
		$testType = $jsonData['type'];
		if ($jsonData == null) {
			$returnData['error'] = $uiLang->translate("There is an error in the database. Please contact the administrator!");
			$returnData['reloadFolder'] = true;
			die();
		} else {
			$returnData['acldata'] = array();
			$writeAclData = false;
			$labelDefault = null;
			$testState = $jsonData['state'] ?? 'draft';
			if ($testType !== 'mutation') {
				$labelObject = json_decode($result['data']['labels'] ?? '');
				//Find default label
				foreach ($labelObject as $key => $value) {
					if ($value->default === 'yes') {
						$labelDefault = $key;
					}
				}
			}
			$result['data']['structure'] = array('type' => $testType, 'state' => $testState, 'items' => array());
			switch ($testType) {
				case 'fluid':
					foreach ($jsonData['items'] as $value) {
						$labeldata = new stdClass();
						$labels = '-';
						if (isset($value['labelID'])) {
							//Use default label if label is not present anymore
							if (!isset($labelObject->{$value['labelID']})) {
								$labeldata->id = $labelDefault;
								$labeldata->data = $labelDefault;
								$labeldata->hiddenData = $labelDefault;
								$labels = $labeldata;
								$returnData['acl'] = true;
								$writeAclData = true;
							} else {
								$labeldata->id = $value['labelID'];
								$labeldata->data = $value['labelID'];
								$labeldata->hiddenData = $value['labelID'];
								$labels = $labeldata;
							}
						}
						$actionFieldData = new stdClass();
						$actionField = '-';
						$scriptsData = new stdClass();
						$scripts = '';
						if (isset($value['overrides'])) {
							if (!empty($value['overrides'])) $actionFieldData->hiddenData = $value['overrides'];
							$actionField = $actionFieldData;
						}
						if (isset($value['scripts'])) {
							if (!empty($value['scripts'])) {
								$scriptsData->hiddenData = $value['scripts'];
							}
							$scripts = $scriptsData;
						}
						$query = "SELECT testPools.`name` AS name, testPools.`structure` AS itemStructure, testFluidStructure.numberOfItems AS itemsUsed, testFluidStructure.random as itemOrder   FROM testFluidStructure INNER JOIN testPools ON testPools.id = testFluidStructure.poolID WHERE testFluidStructure.id=? LIMIT 1";
						$parameters = array($value['hiddenID']);
						$queryResult = $db->fetchRow($query, $parameters);
						if ($queryResult['rows'] === 0) {
							$itemArray = array('name' => $uiLang->translate('Testpool has been deleted!'), 'hiddenID' => $value['hiddenID'], 'itemsUsed' => '-', 'itemsTotal' => '-', 'itemOrder' => '-', 'label' => '-', 'actionField' => '-', 'actionButton' => '-', 'fixedPosition' => '-', 'removed' => true);
						} else {
							$jsonValue = json_decode($queryResult['data']['itemStructure'] ?? '', true);
							$itemCount = count($jsonValue['items']);
							$itemOrder = new stdClass();
							if ($queryResult['data']['itemOrder'] == 0) {
								$itemOrder->id = $value['hiddenID'];
								$itemOrder->data = 'as defined';
								$itemOrder->hiddenData = 'as defined';
							} else {
								$itemOrder->id = $value['hiddenID'];
								$itemOrder->data = 'random';
								$itemOrder->hiddenData = 'random';
							}
							if ($itemCount > 0) {
								$itemsUsed = new stdClass();
								$itemsUsed->id = $value['hiddenID'];
								$itemsUsed->data = $queryResult['data']['itemsUsed'];
								$itemsUsed->hiddenData['used'] = (int)$queryResult['data']['itemsUsed'];
								$itemsUsed->hiddenData['total'] = $itemCount;
							} else {
								$itemsUsed = $queryResult['data']['itemsUsed'];
							}
							$fixedPosition = $value['fixedPosition'] ?? false;
							$itemArray = array('name' => $queryResult['data']['name'], 'hiddenID' => $value['hiddenID'], 'itemsUsed' => $itemsUsed, 'itemsTotal' => $itemCount, 'itemOrder' => $itemOrder, 'label' => $labels, 'actionField' => $actionField, 'actionButton' => $scripts, 'fixedPosition' => $fixedPosition);
						}
						array_push($result['data']['structure']['items'], $itemArray);
						//writing items with auto changed labels
						if ($writeAclData) {
							$aclArray = array('name' => $queryResult['data']['name']);
							array_push($returnData['acldata'], $aclArray);
						}
						$writeAclData = false;
						$labeldata = null;
						$actionField = null;
						$scripts = null;
					}
					//testpools
					$query = "SELECT * FROM testPools WHERE testID=? order by name";
					$parameters = array($data['dbId']);
					$r = $db->fetchTable($query, $parameters);
					$returnData['testpools'] = $r['data'];
					break;
				case 'linear':
					foreach ($jsonData['items'] as $value) {
						$labeldata = new stdClass();
						$labels = '-';
						if (isset($value['labelID'])) {
							//Use default label if label is not present anymore
							if (!isset($labelObject->{$value['labelID']})) {
								$labeldata->id = $labelDefault;
								$labeldata->data = $labelDefault;
								$labeldata->hiddenData = $labelDefault;
								$labels = $labeldata;
								$returnData['acl'] = true;
								$writeAclData = true;
							} else {
								$labeldata->id = $value['labelID'];
								$labeldata->data = $value['labelID'];
								$labeldata->hiddenData = $value['labelID'];
								$labels = $labeldata;
							}
						}
						$actionFieldData = new stdClass();
						$actionField = '';
						$scriptsData = new stdClass();
						$scripts = '';

						if (isset($value['overrides'])) {
							if (!empty($value['overrides'])) {
								$actionFieldData->hiddenData = $value['overrides'];
							}
							$actionField = $actionFieldData;
						}
						if (isset($value['scripts'])) {
							if (!empty($value['scripts'])) {
								$scriptsData->hiddenData = $value['scripts'];
							}
							$scripts = $scriptsData;
						}
						$query = "SELECT items.itemCode AS iCode, items.`name` AS name1, itemGroups.`name` AS name2, itemGroups.id AS itemGroupId FROM items INNER JOIN itemGroups ON itemGroups.id = items.groupId WHERE items.id=? LIMIT 1";
						$parameters = array($value['hiddenID']);
						$queryResult = $db->fetchRow($query, $parameters);
						if ($queryResult['rows'] === 0) {
							$itemArray = array('name' => $uiLang->translate('Test page has been deleted!'), 'hiddenID' => $value['hiddenID'], 'code' => '-', 'itemGroup' => '-', 'label' => '-', 'actionField' => '-', 'actionButton' => '-', 'removed' => true);
						} else {
							$itemArray = array('name' => $queryResult['data']['name1'], 'hiddenID' => $value['hiddenID'], 'code' => $queryResult['data']['iCode'], 'itemGroup' => $queryResult['data']['name2'], 'itemGroupId' => $queryResult['data']['itemGroupId'], 'label' => $labels, 'actionField' => $actionField, 'actionButton' => $scripts);
						}
						array_push($result['data']['structure']['items'], $itemArray);
						//writing items with auto changed labels
						if ($writeAclData) {
							$aclArray = array('name' => $queryResult['data']['name1']);
							array_push($returnData['acldata'], $aclArray);
						}
						$writeAclData = false;
						$labeldata = null;
						$actionField = null;
						$scripts = null;
					}
					break;
				case 'mutation':
					foreach ($jsonData['items'] as $value) {
						$query = "SELECT tests.`name` AS name, JSON_LENGTH(JSON_EXTRACT(structure, '$.items')) as structCount FROM tests WHERE tests.id=? LIMIT 1";
						$parameters = array($value['hiddenID']);
						$queryResult = $db->fetchRow($query, $parameters);
						if ($queryResult['rows'] === 0) {
							$itemArray = array('name' => $uiLang->translate('Test has been deleted!'), 'hiddenID' => $value['hiddenID'], 'structCount' => 0, 'scoring' => 0, 'removed' => true);
						} else {
							try {
								$testScoring = new OasysScoring($value['hiddenID'], $db);
							} catch (Exception $e) {
								$returnData['error'] = $e->getMessage();
								die();
							}
							$scoreSummary = $testScoring->getMaxPageScoreSummary();
							$itemArray = array('name' => $queryResult['data']['name'], 'hiddenID' => $value['hiddenID'], 'structCount' => $queryResult['data']['structCount'], 'scoring' => $scoreSummary);
						}
						array_push($result['data']['structure']['items'], $itemArray);
					}
					break;
			}
		}
		//json block for options
		$jsonData = json_decode($result['data']['options'] ?? '', true);
		if ($jsonData == null) {
			$jsonData = array();
		}
		if ($result['data']['active'] === 0) {
			$jsonData['onOffSwitch'] = false;
		} else {
			$jsonData['onOffSwitch'] = true;
		}
		$result['data']['options'] = $jsonData;

		if ($testType !== 'mutation') {
			//json block for variables
			$jsonData = json_decode($result['data']['variables'] ?? '', true);
			if ($jsonData == null) {
				$jsonData = array();
			}
			$result['data']['variables'] = $jsonData;

			//json block for labels
			$jsonData = json_decode($result['data']['labels'] ?? '', true);
			if ($jsonData == null) {
				$jsonData = array();
			}
			$returnData['labels'] = $jsonData;

			$skins = \Oasys\OasysSettings::findSkins();
			$defaultSkin = 'Default Responsive';

			//Load skin data from DB
			$jsonData = json_decode($result['data']['skin'] ?? '');

			$skinNeedsUpdate = false;
			if (!is_object($jsonData) || !isset($jsonData->skin) || !isset($skins[$jsonData->skin])) {
				$jsonData = (object)[
					'skin' => $defaultSkin,
					'skinOptions' => (object)[]
				];
				$returnData['skinChanged2Default'] = true;
				$skinNeedsUpdate = true;
			}

			$skinId = $jsonData->skin;
			$skinDefinition = $skins[$skinId]['options'];
			$userOptions = (array)($jsonData->skinOptions ?? []);

			if ($skinNeedsUpdate) {
				$skinData = [
					'skin' => $skinId,
					'skinOptions' => $skinDefinition
				];
				saveSkinAssignment(['id' => $data['dbId'], 'skinData' => $skinData, 'skinSwitch' => true, 'resetSkinOptions' => true], $db, $returnData);
			}
			unset($skinNeedsUpdate);

			// helper function to clean up legacy format
			function extractScalarValue($val, $default) {
				while (is_array($val) && isset($val['value'])) {
					$val = $val['value'];
				}
				return (is_scalar($val) || is_bool($val)) ? $val : $default;
			}
			$finalOptions = [];

			foreach ($skinDefinition as $key => $definition) {
				$userValue = $definition['defaultValue'];
				if (array_key_exists($key, $userOptions)) {
					$userValue = extractScalarValue($userOptions[$key], $definition['defaultValue']);
				}
				$finalOptions[$key] = [
					'name' => $definition['name'],
					'type' => $definition['type'],
					'perItem' => $definition['perItem'] ?? [],
					'defaultValue' => $definition['defaultValue'],
					'value' => $userValue
				];
			}

			$result['data']['skin'] = [
				'skin' => $skinId,
				'skinOptions' => $finalOptions
			];

			try {
				$testScoring = new OasysScoring($data['dbId'], $db);
			} catch (Exception $e) {
				$returnData['error'] = $e->getMessage();
				die();
			}
			$scoreSummary = $testScoring->getMaxPageScoreSummary();
			$returnData['scoring'] = $scoreSummary;
		}
		//json block for meta tags
		$jsonData = json_decode($result['data']['info'] ?? '', true);
		if ($jsonData == null) {
			$jsonData = new stdClass();
		}
		$result['data']['metatags'] = $jsonData;

		//writing collected data to returndata
		$returnData['data'] = $result['data'];

		//providing language fallbacks
		$query = "select code as langcode, fallback from languages";
		$parameters = array();
		$result = $db->fetchTable($query, $parameters);
		$returnData['languageFallbacks'] = $result['data'];

		//check activity data
		$query = "select count(*) as pwdUsingTest, loginId as testee from activity where testId=? group by loginId ";
		$parameters = array($data['dbId']);
		$result = $db->fetchTable($query, $parameters);
		$returnData['activityData'] = $result['data'];
		$returnData['activityAccess'] = tmTestActivityAccessSummary((int)$data['dbId'], $db);
		$returnData['previewResultStats'] = tmFetchTestPreviewResultStats((int)$data['dbId'], $db);
		$returnData['lastBackendEdit'] = tmFetchTestLastBackendEdit((int)$data['dbId'], $db);
	}

	function tmFetchTestPreviewResultStats(int $testId, rixPDO &$db): array
	{
		$summary = tmTestActivityAccessSummary($testId, $db);
		$result = $db->fetchTable(
			"SELECT
			 CONCAT(a.passwordId,'_',a.testId) AS hiddenID,
			 l.name AS testeename,
			 " . tmLoginAccessParentSql('l', 'templateLogin') . " AS loginParent,
			 p.name AS testeepass,
			 p.tag AS passtag,
			 a.progress AS progressField,
			 a.tsActiveServer
		 FROM activity a
		 LEFT JOIN logins l ON l.id = a.loginId
		 LEFT JOIN logins templateLogin ON templateLogin.id = l.parentTemplateId
		 LEFT JOIN passwords p ON p.id = a.passwordId
		 WHERE a.testId = ?
		 ORDER BY a.tsActiveServer DESC, l.name",
			[$testId]
		);

		$rows = $result['data'] ?? [];
		$accessCache = [];
		$accessibleRows = [];
		foreach ($rows as $row) {
			if (!tmCanReadTestTakerFolder((int)($row['loginParent'] ?? 0), $db, $accessCache)) {
				continue;
			}
			$row['progressField'] = round(((float)($row['progressField'] ?? 0)) * 100);
			if (isset($row['testeepass'])) {
				$row['testeepass'] = Crypt::decryptString($row['testeepass']);
			}
			unset($row['loginParent']);
			$accessibleRows[] = $row;
		}

		return [
			'total_results' => (int)($summary['total'] ?? 0),
			'accessible_results' => (int)($summary['accessible'] ?? 0),
			'restricted_results' => (int)($summary['restricted'] ?? 0),
			'testActivity' => array_values($accessibleRows),
		];
	}

	function tmFetchTestLastBackendEdit(int $testId, rixPDO &$db): ?array
	{
		$rows = $db->fetchTable(
			"SELECT id, name, activity FROM users WHERE activity IS NOT NULL AND activity <> ''",
			[]
		)['data'] ?? [];

		$userNames = [];
		foreach ($rows as $row) {
			$userNames[(int)$row['id']] = (string)$row['name'];
		}

		$latest = null;
		$addCandidate = static function(int $userId, ?string $userName, ?string $ts) use (&$latest): void {
			if ($userId <= 0 || !$ts) return;
			if ($latest === null || strcmp($ts, (string)$latest['ts']) > 0) {
				$latest = [
					'userId' => $userId,
					'userName' => $userName ?: 'deleted',
					'ts' => $ts,
				];
			}
		};

		foreach ($rows as $row) {
			$activity = json_decode($row['activity'] ?? '', true);
			if (json_last_error() !== JSON_ERROR_NONE || !is_array($activity) || !is_array($activity['lastEdited'] ?? null)) {
				continue;
			}
			foreach ($activity['lastEdited'] as $entry) {
				if ((int)($entry['id'] ?? 0) !== $testId || strtolower((string)($entry['type'] ?? '')) !== 'test') {
					continue;
				}
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

	function fetchPoolData($data, &$db, &$returnData): void
	{
		global $uiLang;
		/* @var $db rixPDO */
		checkParams($data, array('testId', 'selectedPool'));

		$test = $data['testId'];
		$pool = $data['selectedPool'];

		//Check if Test is still present
		$query = "SELECT * FROM tests WHERE id=? LIMIT 1";
		$parameters = array($test);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if selected test is not available anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("The test you are trying to edit has been deleted by another user. The view will be refreshed.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			$returnData['closeNxdPoolchooser'] = true;
			die();
		}
		//read testpool
		$query = "SELECT * FROM testPools WHERE id=? LIMIT 1";
		$parameters = array($pool);
		$result = $db->fetchRow($query, $parameters);

		//Show error message if testpool is not present anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("This testpool has been deleted by another user. Leaving edit mode.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			$returnData['closeNxdPoolchooser'] = true;
			die();
		}

		//Read items/stimuli in testpool
		$jsonData = json_decode($result['data']['structure'] ?? '', true);
		if ($jsonData == null) {
			$returnData['error'] = $uiLang->translate("There is an error in the database. Please contact the administrator!");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			$returnData['closeNxdPoolchooser'] = true;
			die();
		} else {
			$result['data']['structure'] = array('items' => array());
			foreach ($jsonData['items'] as $value) {
				$query = "SELECT items.itemCode AS iCode, items.`name` AS name1, itemGroups.`name` AS name2  FROM items INNER JOIN itemGroups ON itemGroups.id = items.groupId WHERE items.id=? LIMIT 1";
				$parameters = array($value['hiddenID']);
				$queryResult = $db->fetchRow($query, $parameters);
				if ($queryResult['rows'] === 0) {
					$itemArray = array('name' => $uiLang->translate('Test page has been deleted. Please remove!'), 'hiddenID' => $value['hiddenID'], 'code' => '-', 'itemGroup' => '-');
				} else {
					$itemArray = array('name' => $queryResult['data']['name1'], 'hiddenID' => $value['hiddenID'], 'code' => $queryResult['data']['iCode'], 'itemGroup' => $queryResult['data']['name2']);
				}
				array_push($result['data']['structure']['items'], $itemArray);
			}
		}
		//writing collected data to returndata
		$returnData['data'] = $result['data'];
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
		$target = ($type === 'folder') ? 3 : 4;

		if (isset($backendState)) {
			$user = $backendState->userid;
			if ($status) {
				//Check if element is still available
				($type === 'folder') ? $query = "SELECT `id` FROM testFolders WHERE `id` = ? LIMIT 1" : $query = "SELECT `id` FROM tests WHERE `id` = ? LIMIT 1";
				$parameters = array($id);
				$result = $db->fetchRow($query, $parameters);
				//Write watchlist
				if ($result['rows'] > 0) {
					$db->prepare("INSERT INTO watchList (foreign_id, foreign_table, user_id) SELECT ?,?,? WHERE NOT EXISTS (SELECT * FROM watchList WHERE foreign_id = ? AND foreign_table = ? AND user_id = ?  LIMIT 1)");
					$db->executePrepared(array($id, $target, $user, $id, $target, $user));
				}
			} else {
				$db->prepare("DELETE FROM watchList WHERE user_id=? AND foreign_id=? AND foreign_table=?");
				$db->executePrepared(array($user, $id, $target));
			}
		}
	}


	function fetchTestsAssigned($data, &$db, &$returnData): void
	{
		global $uiLang;
		/* @var $db rixPDO */
		checkParams($data, array('id', 'test'));

		$tpId = $data['id'];
		$test = $data['test'];

		//Check if Test is still present
		$query = "SELECT * FROM tests WHERE id=? LIMIT 1";
		$parameters = array($test);
		$result = $db->fetchRow($query, $parameters);

		//Show error message if selected test is not available anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("The test has been deleted by another user. The view will be refreshed.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			die();
		}
		//if testpool is not present anymore, throw an error message and leave edit mode
		$query = "SELECT * FROM testPools WHERE id=? LIMIT 1";
		$parameters = array($tpId);
		$result = $db->fetchRow($query, $parameters);

		//Show error message
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("This testpool has been deleted by another user. Leaving edit mode.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			die();
		}

		//read structure from testpool
		$query = "SELECT *, 'test' as type FROM testPools WHERE id=?";
		$parameters = array($tpId);
		$result = $db->fetchRow($query, $parameters);

		//json block for structure
		$jsonData = json_decode($result['data']['structure'] ?? '', true);
		if ($jsonData == null) {
			$returnData['error'] = $uiLang->translate("There is an error in the database. Please contact the administrator!");
			$returnData['reloadFolder'] = true;
			die();
		} else {
			$result['data']['structure'] = array('items' => array());
			foreach ($jsonData['items'] as $value) {

				$scriptsData = new stdClass();
				$scripts = null;
				if (isset($value['scripts'])) {
					if (!empty($value['scripts'])) {
						$scriptsData->hiddenData = $value['scripts'];
					}
					$scripts = $scriptsData;
				}

				$query = "SELECT items.itemCode AS iCode, items.`name` AS name1, itemGroups.`name` AS name2  FROM items INNER JOIN itemGroups ON itemGroups.id = items.groupId WHERE items.id=? LIMIT 1";
				$parameters = array($value['hiddenID']);
				$queryResult = $db->fetchRow($query, $parameters);

				if ($queryResult['rows'] === 0) {
					$itemArray = array('name' => $uiLang->translate('Test page has been deleted. Please remove!'), 'hiddenID' => $value['hiddenID'], 'code' => '-', 'itemGroup' => '-', 'actionButton' => '-');
				} else {
					$itemArray = array('name' => $queryResult['data']['name1'], 'hiddenID' => $value['hiddenID'], 'code' => $queryResult['data']['iCode'], 'itemGroup' => $queryResult['data']['name2'], 'actionButton' => $scripts);
				}
				array_push($result['data']['structure']['items'], $itemArray);
			}
		}

		//writing collected data to returndata
		$returnData['data'] = $result['data'];
	}

	// meta tags --------------------------------------
	function newMetaTag($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth;
		/* @var $db rixPDO */
		checkParams($data, array('test', 'mkey', 'mvalue'));

		$testId = $data['test'];
		$mkey = $data['mkey'];
		$mvalue = $data['mvalue'];

		//Check if testee is still present in db
		$query = "SELECT * FROM tests WHERE id=? LIMIT 1";
		$parameters = array($testId);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if selected testee is not available anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("The test you are trying to edit has been deleted by another user. The view will be refreshed.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			die();
		}

		if ($result['data']['info'] == null) {
			$newStructure = new stdClass();
		} else {
			$newStructure = json_decode($result['data']['info'] ?? '');
		}

		$newStructure->$mkey = $mvalue;
		$writeStructure = json_encode($newStructure);

		//save modified meta-structure to db
		$db->prepare("UPDATE tests SET info=? WHERE id=?");
		$db->executePrepared(array($writeStructure, $testId));
		registerActivity($db, (int)$myAuth->userid, $testId, 'test');
		if ($newStructure == null) {
			$returnData['meta'] = new stdClass();
		} else {
			$returnData['meta'] = $newStructure;
		}
		$saved = $db->fetchRow('SELECT * FROM tests WHERE id=? LIMIT 1', array($testId));
		$returnData['editRevision'] = tmTestEditRevision($saved['data'] ?? array());
	}

	function testsSearch($data, &$db, &$returnData): void
	{
		/* @var $db rixPDO */
		if (($data['searchMode'] ?? '') === 'meta') {
			metaSearch($data, $db, $returnData);
			$returnData['data']['list'] = array_values(array_filter(
				$returnData['data']['list'] ?? [],
				static fn(array $row): bool => ($row['testType'] ?? '') === 'linear'
			));
			return;
		}

		checkParams($data, array('searchString'));
			$searchString = oasysLikeContainsPattern((string)$data['searchString']);

		global $permAuth;
		global $uiLang;

			$query = "SELECT CONCAT('f',id) as id, id as 'dbId', parent as pathId, CONCAT('f', parent) as pid, 'folder' as type, `name`, `name` as label, `name` as sortKey, 'folder' as testType, NULL AS subresult, NULL AS subresultvalue FROM testFolders WHERE name LIKE ? ESCAPE '=' AND NOT ISNULL(parent) UNION SELECT CONCAT('t',id) as id, id as 'dbId', parent, CONCAT('f', parent) as pid, 'test' as type, `name`, `name` as label, `name` as sortKey, `structure` as testType, CASE WHEN CAST(id AS CHAR) LIKE ? ESCAPE '=' THEN 'ID: ' ELSE NULL END AS subresult, CASE WHEN CAST(id AS CHAR) LIKE ? ESCAPE '=' THEN CAST(id AS CHAR) ELSE NULL END AS subresultvalue FROM tests WHERE (name LIKE ? ESCAPE '=' OR CAST(id AS CHAR) LIKE ? ESCAPE '=') AND JSON_EXTRACT(structure, '$.type') = ? ORDER BY name";
		$parameters = array($searchString, $searchString, $searchString, $searchString, $searchString, 'linear');
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
			} // else keep original value
		}

		if (count($returnData['data']['list']) > 0) {
			foreach ($returnData['data']['list'] as $key => $row) {
				$returnData['data']['list'][$key]['path'] = pathToString(fetchPath($row['pathId'], $returnData, $db));
			}
		}
		$returnData['data']['searchString'] = $data['searchString'];
	}

	function fetchTestLibraryInt($data, &$db, &$returnData): void
	{
		global $permAuth, $myAuth;
		fetchTestLibrary($data, $db, $returnData);
	}

	function fetchTestLibrary($data, &$db, &$returnData): void
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

		$query = "SELECT CONCAT('f',id) as id, id as 'dbId', CONCAT('f', parent) as pid, 'folder' as type, `name`, `name` as label, '' as testStructure FROM testFolders WHERE parent=? UNION SELECT CONCAT('t',id) as id, id as 'dbId', CONCAT('f', parent) as pid, 'test' as type,`name`, name as label, structure as testStructure FROM tests WHERE parent=? AND JSON_EXTRACT(structure, '$.type') = ?";
		$parameters = array($location, $location, 'linear');
		$results = $db->fetchTable($query, $parameters);


		$query = "SELECT COUNT(*) FROM tests WHERE parent=? AND JSON_EXTRACT(structure, '$.type') = ?;";
		$parameters = array($location, 'linear');
		$res2 = $db->fetchRow($query, $parameters);

		$returnData['tCounts'] = $res2['data']['COUNT(*)'];
		# ----------------------------------------------------------------------- #
		# Removal of results on which the user does not have at least view rights #
		# ----------------------------------------------------------------------- #
		global $permAuth, $myAuth;

		foreach ($results['data'] as $key => $value) {

			$hasRead = false; // set default starting value for access

			if ($value['type'] === 'test' && ($myAuth->checkSA() || $myAuth->checkAdmin())) $hasRead = true;
			if ($value['type'] === 'test' && $value['pid'] !== 'f1') $hasRead = true;

			if ($value['type'] === 'folder') $hasRead = $permAuth->permCheck(['remCall' => true, 'fid' => intVal($value['dbId']), 'action' => 'fetchTestLibraryInt']);

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
	}

	function saveMetaTagsChange($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth;
		/* @var $db rixPDO */
		checkParams($data, array('metaStructure', 'testId'));

		$structure = $data['metaStructure'];
		$testId = $data['testId'];

		//Check if testee is still present
		$query = "SELECT * FROM tests WHERE id=? LIMIT 1";
		$parameters = array($testId);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if selected testee is not available anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("The test you are trying to edit has been deleted by another user. The view will be refreshed.");
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
		$db->prepare("UPDATE tests SET info=? WHERE id=?");
		$db->executePrepared(array($data['structure'], $testId));
		registerActivity($db, (int)$myAuth->userid, $testId, 'test');
		$query = "SELECT * FROM tests WHERE id=? LIMIT 1";
		$parameters = array($testId);
		$result = $db->fetchRow($query, $parameters);
		$structure = json_decode($result['data']['info'] ?? '');
		if ($structure == null) {
			$returnData['meta'] = new stdClass();
		} else {
			$returnData['meta'] = $structure;
		}
		$returnData['editRevision'] = tmTestEditRevision($result['data'] ?? array());
	}

	// end meta tags -----------------------------------

	function fetchMetaTagSuggestions(array $data, rixPDO &$db, array &$returnData): void
	{
		$returnData['suggestions'] = tmCollectMetaTagSuggestions($db);
	}

	function metaSearch(array $data, rixPDO &$db, array &$returnData): void
	{
		global $permAuth;
		$keyTerm = trim((string)($data['key'] ?? ''));
		$valueTerm = trim((string)($data['value'] ?? ''));
		$exact = !empty($data['exact']);
		$singleOnly = !empty($data['singleOnly']);
		$list = [];
		$rows = $db->fetchTable("SELECT id, parent, name, structure, info FROM tests WHERE info IS NOT NULL AND info <> ''")['data'] ?? [];
		foreach ($rows as $row) {
			if ($permAuth->permCheck(['remCall' => true, 'fid' => (int)$row['parent'], 'action' => 'search']) !== true) continue;
			$match = tmMetaInfoMatch($row['info'], $keyTerm, $valueTerm, $exact, $singleOnly);
			if ($match === null) continue;
			$list[] = [
				'id' => 't' . $row['id'],
				'dbId' => (int)$row['id'],
				'pathId' => (int)$row['parent'],
				'pid' => 'f' . $row['parent'],
				'type' => 'test',
				'name' => $row['name'],
				'label' => $row['name'],
				'sortKey' => $row['name'],
				'testType' => $row['structure'],
				'subresult' => $match['label'],
				'subresultvalue' => $match['value'],
				'canWrite' => $permAuth->permCheck(['remCall' => true, 'fid' => (int)$row['parent'], 'action' => 'deleteItem'])
			];
		}
		foreach ($list as $key => $row) {
			$list[$key]['path'] = pathToString(fetchPath($row['pathId'], $returnData, $db));
			$decodedType = json_decode($row['testType'] ?? '', true);
			if (is_array($decodedType) && isset($decodedType['type'])) $list[$key]['testType'] = $decodedType['type'];
		}
		$returnData['data']['list'] = $list;
		$returnData['data']['searchString'] = tmMetaSearchLabel($keyTerm, $valueTerm, $singleOnly);
	}

	function tmCollectMetaTagSuggestions(rixPDO &$db): array
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
				tmMetaSuggestionAdd($suggestions, $row['info']);
			}
		}
		tmMetaSuggestionSort($suggestions);
		return $suggestions;
	}

	function tmMetaSuggestionAdd(array &$suggestions, ?string $info): void
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

	function tmMetaSuggestionSort(array &$suggestions): void
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

	function tmMetaInfoMatch(?string $info, string $keyTerm, string $valueTerm, bool $exact, bool $singleOnly): ?array
	{
		$decoded = json_decode($info ?? '', true);
		if (!is_array($decoded)) return null;
		foreach ($decoded as $key => $value) {
			if (!is_scalar($value) && $value !== null) continue;
			$value = (string)($value ?? '');
			$isSingle = $value === '';
			if ($singleOnly && !$isSingle) continue;
			if ($keyTerm !== '' && !tmMetaTextMatches($key, $keyTerm, $exact)) continue;
			if ($valueTerm !== '' && !tmMetaTextMatches($value, $valueTerm, $exact)) continue;
			if ($keyTerm === '' && $valueTerm === '' && !$singleOnly) continue;
			return [
				'label' => $isSingle ? 'Single tag: ' : 'Meta tag: ',
				'value' => $isSingle ? $key : $key . ' = ' . $value
			];
		}
		return null;
	}

	function tmMetaTextMatches(string $value, string $term, bool $exact): bool
	{
		return $exact ? strcasecmp($value, $term) === 0 : stripos($value, $term) !== false;
	}

	function tmMetaSearchLabel(string $keyTerm, string $valueTerm, bool $singleOnly): string
	{
		$parts = [];
		if ($keyTerm !== '') $parts[] = $keyTerm;
		if ($valueTerm !== '') $parts[] = $valueTerm;
		if ($singleOnly) $parts[] = 'single tags';
		return implode(' / ', $parts);
	}

	function search($data, &$db, &$returnData): void
	{
		global $pageName;
		if ($pageName === 'testresults' && function_exists('searchResultsLibrary')) {
			searchResultsLibrary($data, $db, $returnData);
			return;
		}

		/* @var $db rixPDO */
		checkParams($data, array('searchString'));
		$searchString = oasysLikeContainsPattern((string)$data['searchString']);

		global $permAuth; // init permAuth object for perm result checks

		$query = "SELECT CONCAT('f',id) as id, id as 'dbId', parent as pathId, CONCAT('f', parent) as pid, 'folder' as type, `name`, `name` as label, `name` as sortKey, 'folder' as testType, NULL AS subresult, NULL AS subresultvalue FROM testFolders WHERE name LIKE ? ESCAPE '=' AND NOT ISNULL(parent) UNION SELECT CONCAT('t',id) as id, id as 'dbId', parent, CONCAT('f', parent) as pid, 'test' as type, `name`, `name` as label, `name` as sortKey, `structure` as testType, CASE WHEN CAST(id AS CHAR) LIKE ? ESCAPE '=' THEN 'ID: ' ELSE NULL END AS subresult, CASE WHEN CAST(id AS CHAR) LIKE ? ESCAPE '=' THEN CAST(id AS CHAR) ELSE NULL END AS subresultvalue FROM tests WHERE name LIKE ? ESCAPE '=' OR CAST(id AS CHAR) LIKE ? ESCAPE '=' ORDER BY name";
		$parameters = array($searchString, $searchString, $searchString, $searchString, $searchString);
		$result = $db->fetchTable($query, $parameters);
		$returnData['data']['list'] = $result['data'];

		// permission checking and filtering
		foreach ($returnData['data']['list'] as $key => &$value) {

			$hasRead = false; // set default starting value for access

			if ($value['type'] === 'test') $hasRead = $permAuth->permCheck(['remCall' => true, 'fid' => $value['pathId'], 'action' => 'search']);
			if ($value['type'] === 'folder') $hasRead = $permAuth->permCheck(['remCall' => true, 'fid' => intVal($value['dbId']), 'action' => 'search']);

			if ($value['type'] === 'test') $canwrite = $permAuth->permCheck(['remCall' => true, 'fid' => $value['pathId'], 'action' => 'deleteItem']);
			if ($value['type'] === 'folder') $canwrite = $permAuth->permCheck(['remCall' => true, 'fid' => intVal($value['dbId']), 'action' => 'deleteItem']);

			$value['canWrite'] = $canwrite ?? false;

			// remove any values which do not have the proper permission
			if ($hasRead !== true) {
				unset($returnData['data']['list'][$key]);
			}
		}

		// reindex results array
		$returnData['data']['list'] = array_values($returnData['data']['list']);

		// Page-name and page-code matches are shared by the Test and Results managers.
		// Check test access before collecting page IDs, then fetch all matching pages in
		// bounded set-based queries instead of issuing two queries for every test page.
		$testRows = $db->fetchTable("SELECT CONCAT('t', id) AS id, id AS dbId, parent AS pathId, CONCAT('f', parent) AS pid, 'test' AS type, `name`, `name` AS label, `name` AS sortKey, `structure` AS testType FROM tests")['data'];
		$readableTests = [];
		$pageIds = [];
		foreach ($testRows as $testRow) {
			if ($permAuth->permCheck(['remCall' => true, 'fid' => $testRow['pathId'], 'action' => 'search']) !== true) continue;
			$structure = json_decode($testRow['testType'] ?? '', true);
			if (!is_array($structure) || !isset($structure['items']) || !is_array($structure['items'])) continue;

			$testPageIds = [];
			foreach ($structure['items'] as $structureItem) {
				$pageId = intVal($structureItem['hiddenID'] ?? 0);
				if ($pageId <= 0) continue;
				$testPageIds[] = $pageId;
				$pageIds[$pageId] = $pageId;
			}
			if ($testPageIds !== []) {
				$readableTests[] = ['test' => $testRow, 'pageIds' => array_values(array_unique($testPageIds))];
			}
		}

		$matchingPages = [];
		foreach (array_chunk(array_values($pageIds), 500) as $pageIdChunk) {
			$placeholders = implode(',', array_fill(0, count($pageIdChunk), '?'));
			$params = array_merge([$searchString, $searchString, $searchString], $pageIdChunk, [$searchString, $searchString, $searchString]);
			$pageRows = $db->fetchTable("SELECT id, `name`, itemCode, (`name` LIKE ? ESCAPE '=') AS nameMatch, (itemCode LIKE ? ESCAPE '=') AS codeMatch, (CAST(id AS CHAR) LIKE ? ESCAPE '=') AS idMatch FROM items WHERE id IN ($placeholders) AND (`name` LIKE ? ESCAPE '=' OR itemCode LIKE ? ESCAPE '=' OR CAST(id AS CHAR) LIKE ? ESCAPE '=')", $params)['data'];
			foreach ($pageRows as $pageRow) {
				$matchingPages[(int)$pageRow['id']] = $pageRow;
			}
		}

		foreach ($readableTests as $readableTest) {
			foreach ($readableTest['pageIds'] as $pageId) {
				if (!isset($matchingPages[$pageId])) continue;
				$page = $matchingPages[$pageId];
				if ((int)$page['nameMatch'] === 1) {
					$match = $readableTest['test'];
					$match['subresult'] = 'Test page name: ';
					$match['subresultvalue'] = $page['name'];
					$returnData['data']['list'][] = $match;
				}
				if ((int)$page['codeMatch'] === 1) {
					$match = $readableTest['test'];
					$match['subresult'] = 'Test page code: ';
					$match['subresultvalue'] = $page['itemCode'];
					$returnData['data']['list'][] = $match;
				}
				if ((int)$page['idMatch'] === 1) {
					$match = $readableTest['test'];
					$match['subresult'] = 'Test page ID: ';
					$match['subresultvalue'] = (string)$page['id'];
					$returnData['data']['list'][] = $match;
				}
			}
		}

		for ($i = 0; $i < count($returnData['data']['list']); $i++) {
			$returnData['data']['list'][$i]['testType'] = json_decode($returnData['data']['list'][$i]['testType'] ?? '', true);
			if (!empty($returnData['data']['list'][$i]['testType']['type'])) {
				$returnData['data']['list'][$i]['testType'] = $returnData['data']['list'][$i]['testType']['type'];
			}
		}

		if (count($returnData['data']['list']) > 0) {
			foreach ($returnData['data']['list'] as $key => $row) {
				$returnData['data']['list'][$key]['path'] = pathToString(fetchPath($row['pathId'], $returnData, $db));
			}
		}
		$returnData['data']['searchString'] = $data['searchString'];
	}

	function igSearch($data, &$db, &$returnData): void
	{
		/* @var $db rixPDO */
		if (($data['searchMode'] ?? '') === 'meta') {
			igMetaSearch($data, $db, $returnData);
			return;
		}
		checkParams($data, array('searchString'));
		$searchString = oasysLikeContainsPattern((string)$data['searchString']);
		$query = "SELECT CONCAT('f',itemFolders.id) AS id,
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
					SELECT CONCAT('t',itemGroups.id) AS id,
						   itemGroups.id AS 'dbId',
						   itemGroups.parent,
						   CONCAT('f', itemGroups.parent) AS pid,
						   'itemGroup' AS type,
						   itemGroups.name,
						   itemGroups.name AS label,
						   itemGroups.name AS sortKey,
						   CASE WHEN CAST(itemGroups.id AS CHAR) LIKE ? ESCAPE '=' THEN 'ID: ' ELSE NULL END AS subresult,
						   CASE WHEN CAST(itemGroups.id AS CHAR) LIKE ? ESCAPE '=' THEN CAST(itemGroups.id AS CHAR) ELSE NULL END AS subresultvalue
					FROM itemGroups
					WHERE name LIKE ? ESCAPE '=' OR CAST(itemGroups.id AS CHAR) LIKE ? ESCAPE '='
					UNION SELECT CONCAT('t',itemGroups.id) AS id,
						   itemGroups.id AS 'dbId',
						   itemGroups.parent,
						   CONCAT('f', itemGroups.parent) AS pid,
						   'itemGroup' AS type,
						   itemGroups.name,
						   itemGroups.name AS label,
						   itemGroups.name AS sortKey,
						   'Test Page Name: ' AS subresult,
						   items.name AS subresultvalue
					FROM itemGroups
					INNER JOIN items WHERE items.name LIKE ? ESCAPE '=' AND itemGroups.id=items.groupId
					UNION SELECT CONCAT('t',itemGroups.id) AS id,
						   itemGroups.id AS 'dbId',
						   itemGroups.parent,
						   CONCAT('f', itemGroups.parent) AS pid,
						   'itemGroup' AS type,
						   itemGroups.name,
						   itemGroups.name AS label,
						   itemGroups.name AS sortKey,
						   'Test Page Code: ' AS subresult,
						   items.itemCode AS subresultvalue
					FROM itemGroups
					INNER JOIN items WHERE items.itemCode LIKE ? ESCAPE '=' AND itemGroups.id=items.groupId
					UNION SELECT CONCAT('t',itemGroups.id) AS id,
						   itemGroups.id AS 'dbId',
						   itemGroups.parent,
						   CONCAT('f', itemGroups.parent) AS pid,
						   'itemGroup' AS type,
						   itemGroups.name,
						   itemGroups.name AS label,
						   itemGroups.name AS sortKey,
						   'Test page ID: ' AS subresult,
						   CAST(items.id AS CHAR) AS subresultvalue
					FROM itemGroups
					INNER JOIN items WHERE CAST(items.id AS CHAR) LIKE ? ESCAPE '=' AND itemGroups.id=items.groupId
					ORDER BY name";

		$parameters = array($searchString, $searchString, $searchString, $searchString, $searchString, $searchString, $searchString, $searchString);
		$results = $db->fetchTable($query, $parameters);

		global $permAuth; // init permAuth object for perm result checks

		// permission checking and filtering
		foreach ($results['data'] as $key => $value) {

			$hasRead = false; // set default starting value for access
			if ($value['type'] === 'itemGroup') $hasRead = $permAuth->permCheck(['remCall' => true, 'fid' => $value['parent']]);
			if ($value['type'] === 'folder') $hasRead = $permAuth->permCheck(['remCall' => true, 'fid' => intVal($value['dbId'])]);

			// remove any values which do not have the proper permission
			if ($hasRead !== true) {
				unset($results['data'][$key]);
			}
		}

		// reindex results array
		$results['data'] = array_values($results['data']);

		$returnData['data']['list'] = $results['data'];
		if (count($returnData['data']['list']) > 0) {
			foreach ($returnData['data']['list'] as $key => $row) {
				$returnData['data']['list'][$key]['path'] = pathToString(fetchItemPath($row['parent'], $returnData, $db));
			}
		}
		$returnData['data']['searchString'] = $data['searchString'];
	}

	function igMetaSearch(array $data, rixPDO &$db, array &$returnData): void
	{
		global $permAuth;
		$keyTerm = trim((string)($data['key'] ?? ''));
		$valueTerm = trim((string)($data['value'] ?? ''));
		$exact = !empty($data['exact']);
		$singleOnly = !empty($data['singleOnly']);
		$list = [];
		$rows = $db->fetchTable("SELECT id, parent, name, info FROM itemGroups WHERE info IS NOT NULL AND info <> ''")['data'] ?? [];
		foreach ($rows as $row) {
			if ($permAuth->permCheck(['remCall' => true, 'fid' => (int)$row['parent']]) !== true) continue;
			$match = tmMetaInfoMatch($row['info'], $keyTerm, $valueTerm, $exact, $singleOnly);
			if ($match === null) continue;
			$list[] = [
				'id' => 't' . $row['id'],
				'dbId' => (int)$row['id'],
				'parent' => (int)$row['parent'],
				'pid' => 'f' . $row['parent'],
				'type' => 'itemGroup',
				'name' => $row['name'],
				'label' => $row['name'],
				'sortKey' => $row['name'],
				'subresult' => $match['label'],
				'subresultvalue' => $match['value']
			];
		}
		foreach ($list as $key => $row) {
			$list[$key]['path'] = pathToString(fetchItemPath($row['parent'], $returnData, $db));
		}
		$returnData['data']['list'] = $list;
		$returnData['data']['searchString'] = tmMetaSearchLabel($keyTerm, $valueTerm, $singleOnly);
	}

	# ------------------------------------------------------ #
	# Recursive folder checking for various action functions #
	# ------------------------------------------------------ #
	function recurs_perm_check(array $obj, rixPDO &$db, string $action): void
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

			$res = $db->fetchTable("SELECT `id` AS `dbId`, `owner`, $movTarg AS 'target' FROM `testFolders` WHERE `parent` = ? ", [$fItem['dbId']]);
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

	function tmOwnsLoginFolder(int $folderId, rixPDO &$db): bool
	{
		global $myAuth;
		if ($folderId <= 0) return false;
		$row = $db->fetchRow("SELECT `owner` FROM `loginsFolders` WHERE `id` = ? LIMIT 1", [$folderId]);
		if (!empty($row['error']) || ($row['rows'] ?? 0) === 0) return false;
		$ownerId = (int)($row['data']['owner'] ?? 0);
		return $ownerId > 0 && $ownerId === (int)$myAuth->userid;
	}

	function tmCanReadTestTakerFolder(int $folderId, rixPDO &$db, array &$cache): bool
	{
		global $myAuth;
		if ($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin()) return true;
		if ($folderId <= 0) return false;
		if (!array_key_exists($folderId, $cache)) {
			$hasFolderRead = false;
			$ugList = $myAuth->usergroup ?? [];
			if (is_array($ugList) && count($ugList) > 0) {
				$ph = implode(',', array_fill(0, count($ugList), '?'));
				$params = [$folderId];
				foreach ($ugList as $ug) $params[] = $ug;
				$res = $db->fetchValue(
					"SELECT EXISTS(
						SELECT 1
						FROM loginsFolderAccess lfa
						WHERE lfa.folderId = ?
						AND lfa.userGroupId IN ($ph)
						AND (
							JSON_EXTRACT(lfa.accessDef, '$.c_items.Read') IN ('true', true)
							OR JSON_EXTRACT(lfa.accessDef, '$.c_items.Write') IN ('true', true)
							OR JSON_EXTRACT(lfa.accessDef, '$.items.fetchLibrary') IN ('true', true)
							OR JSON_EXTRACT(lfa.accessDef, '$.items.fetchItem') IN ('true', true)
							OR JSON_EXTRACT(lfa.accessDef, '$.items.search') IN ('true', true)
							OR JSON_EXTRACT(lfa.accessDef, '$.items.deleteItem') IN ('true', true)
							OR JSON_EXTRACT(lfa.accessDef, '$.items.editPassword') IN ('true', true)
						)
					)",
					$params
				);
				$hasFolderRead = ($res['data'] === 1 || $res['data'] === true || $res['data'] === "1");
			}

			$cache[$folderId] = $hasFolderRead
				|| tmOwnsLoginFolder($folderId, $db);
		}
		return $cache[$folderId];
	}

	function tmLoginAccessParentSql(string $loginAlias, string $templateAlias): string
	{
		return "COALESCE($templateAlias.parent, $loginAlias.parent)";
	}

	function tmFetchLoginAccessParentByLoginName(string $loginName, rixPDO &$db): int
	{
		$result = $db->fetchValue(
			"SELECT " . tmLoginAccessParentSql('logins', 'templateLogin') . "
			FROM logins
			LEFT JOIN logins templateLogin ON templateLogin.id = logins.parentTemplateId
			WHERE logins.name = ?
			LIMIT 1",
			[$loginName]
		);
		return (int)($result['data'] ?? 0);
	}

	function tmFetchLoginAccessParentByPassword(int $passwordId, rixPDO &$db, ?int $testId = null): int
	{
		if ($testId !== null && $testId > 0) {
			$result = $db->fetchValue(
				"SELECT " . tmLoginAccessParentSql('logins', 'templateLogin') . "
				FROM passwords
				LEFT JOIN activity ON activity.passwordId = passwords.id AND activity.testId = ?
				LEFT JOIN scoring ON scoring.passwordId = passwords.id AND scoring.testId = ?
				JOIN logins ON logins.id = COALESCE(activity.loginId, scoring.loginId, passwords.loginID)
				LEFT JOIN logins templateLogin ON templateLogin.id = logins.parentTemplateId
				WHERE passwords.id = ?
				LIMIT 1",
				[$testId, $testId, $passwordId]
			);
			$parent = (int)($result['data'] ?? 0);
			if ($parent > 0) return $parent;
		}

		$result = $db->fetchValue(
			"SELECT " . tmLoginAccessParentSql('logins', 'templateLogin') . "
			FROM passwords
			JOIN logins ON logins.id = passwords.loginID
			LEFT JOIN logins templateLogin ON templateLogin.id = logins.parentTemplateId
			WHERE passwords.id = ?
			LIMIT 1",
			[$passwordId]
		);
		return (int)($result['data'] ?? 0);
	}

	function tmGetTestResultAccessInfo(int $testId, rixPDO &$db): array
	{
		$rows = $db->fetchTable(
			"SELECT rr.loginId, rr.passwordId, " . tmLoginAccessParentSql('logins', 'templateLogin') . " AS loginParent
		FROM (
			SELECT COALESCE(activity.loginId, passwords.loginID) AS loginId, activity.passwordId
			FROM activity
			JOIN passwords ON passwords.id = activity.passwordId
			WHERE activity.testId = ?
			UNION
			SELECT COALESCE(scoring.loginId, passwords.loginID) AS loginId, scoring.passwordId
			FROM scoring
			JOIN passwords ON passwords.id = scoring.passwordId
			WHERE scoring.testId = ?
		) rr
		JOIN logins ON logins.id = rr.loginId
		LEFT JOIN logins templateLogin ON templateLogin.id = logins.parentTemplateId",
			[$testId, $testId]
		)['data'] ?? [];

		$accessCache = [];
		$accessibleLogins = [];
		$restrictedLogins = [];
		$accessiblePasswordIds = [];
		$restrictedPasswordIds = [];

		foreach ($rows as $row) {
			$loginId = (int)$row['loginId'];
			$passwordId = (int)$row['passwordId'];
			$hasAccess = tmCanReadTestTakerFolder((int)$row['loginParent'], $db, $accessCache);

			if ($hasAccess) {
				$accessibleLogins[$loginId] = true;
				$accessiblePasswordIds[$passwordId] = $passwordId;
			} else {
				$restrictedLogins[$loginId] = true;
				$restrictedPasswordIds[$passwordId] = $passwordId;
			}
		}

		return [
			'totalLoginCount' => count($accessibleLogins) + count($restrictedLogins),
			'accessibleLoginCount' => count($accessibleLogins),
			'restrictedLoginCount' => count($restrictedLogins),
			'accessiblePasswordIds' => array_values($accessiblePasswordIds),
			'restrictedPasswordIds' => array_values($restrictedPasswordIds),
		];
	}

	function tmTestActivityAccessSummary(int $testId, rixPDO &$db): array
	{
		$rows = $db->fetchTable(
			"SELECT activity.loginId, " . tmLoginAccessParentSql('logins', 'templateLogin') . " AS loginParent
		FROM activity
		JOIN logins ON logins.id = activity.loginId
		LEFT JOIN logins templateLogin ON templateLogin.id = logins.parentTemplateId
		WHERE activity.testId = ?
		GROUP BY activity.loginId, loginParent",
			[$testId]
		)['data'] ?? [];

		$accessCache = [];
		$total = 0;
		$accessible = 0;
		foreach ($rows as $row) {
			$total++;
			if (tmCanReadTestTakerFolder((int)$row['loginParent'], $db, $accessCache)) {
				$accessible++;
			}
		}

		return [
			'total' => $total,
			'accessible' => $accessible,
			'restricted' => max(0, $total - $accessible),
		];
	}

	function deleteSelection($data, &$db, &$returnData): void
	{
		global $uiLang, $action;
		/* @var $db rixPDO */
		checkParams($data, array('location', 'selection'));
		$location  = $data['location'];
		$selection = $data['selection'];
		$groupClause  = '';
		$folderClause = '';
		$folders = array();
		$groups  = array();

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
			$groups[] = $row['dbId'];   // <- these are your test IDs
			if ($groupClause != '') {
				$groupClause .= ' OR ';
			}
			$groupClause .= 'id=?';
		}
	}

	$testsToDelete = $groups;
	foreach ($folders as $folderId) {
		$testsToDelete = array_merge($testsToDelete, recursiveCollectTestFileIds($folderId, $db, $action));
	}
	$testsToDelete = array_values(array_unique(array_map('intval', $testsToDelete)));

	foreach ($testsToDelete as $testId) {
		$accessInfo = tmGetTestResultAccessInfo($testId, $db);
		if ($accessInfo['restrictedLoginCount'] > 0) {
			$testName = $db->fetchValue("SELECT `name` FROM `tests` WHERE `id` = ?", [$testId])['data'] ?? $testId;
			$returnData['error'] = sprintf(
				$uiLang->translate('The test "%s" cannot be deleted because it still contains recorded results from test takers you do not have access to.'),
				$testName
			);
			$returnData['reloadFolder'] = true;
			die();
		}
	}

	$db->startTransaction();
	if (count($folders) > 0) {
		$db->prepare("DELETE FROM testFolders WHERE " . $folderClause);
		$db->executePrepared($folders);
		if (!empty($db->results()['error'])) {
			$db->rollback();
			$returnData['error'] = $uiLang->translate('The selection could not be deleted.');
			return;
		}
	}

	if (count($groups) > 0) {
		$db->prepare("DELETE FROM tests WHERE " . $groupClause);
		$db->executePrepared($groups);
		if (!empty($db->results()['error'])) {
			$db->rollback();
			$returnData['error'] = $uiLang->translate('The selection could not be deleted.');
			return;
		}
	}
	$dbResult = $db->results();
	if (!empty($dbResult['error'])) {
		$db->rollback();
		$returnData['error'] = $uiLang->translate('The selection could not be deleted.');
		return;
	}
	$db->commit();

	// Include tests removed through a folder cascade, not only directly selected tests.
	foreach ($testsToDelete as $testId) {
		deleteTestCustomContentDir((int)$testId);
	}


	// log action
	global $myAuth;
	$myAuth->prepLog($data, "delSelection", $returnData);

	fetchLibrary($data, $db, $returnData);
}


function resetResults($data, &$db, &$returnData)
{
	global $uiLang, $action;
	/* @var $db rixPDO */
	checkParams($data, array('selection'));

	$selection = $data['selection'];
	$resetMode = $data['resetMode'] ?? 'all';
	$resetCutoff = $data['resetCutoff'] ?? null;
	if (!in_array($resetMode, ['all', 'before', 'after'], true)) {
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
			$fileIds = recursiveCollectTestFileIds($selItem['dbId'], $db, $action);
			$collectedIds = array_merge($collectedIds, $fileIds);
		} else {
			$collectedIds[] = $selItem['dbId'];
		}
	}
	$collectedIds = array_values(array_unique(array_map('intval', $collectedIds)));

	$logIdsAndNames = [];
	$resetAccessible = 0;
	$keptRestricted = 0;
	$transactionStarted = false;

	try {
		if ($db->startTransaction() !== true) throw new RuntimeException('Unable to start test-result reset transaction.');
		$transactionStarted = true;
		foreach ($collectedIds as $key => $test) {
		//Check if testee is still present
		$query = "SELECT * FROM tests WHERE id=? LIMIT 1";
		$parameters = array($test);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if selected testee is not available anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("You are trying to delete results of a test which has been deleted by another user. The view will be refreshed.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			throw new RuntimeException('Selected test no longer exists.');
		}
		//End check
		$accessInfo = tmGetTestResultAccessInfo((int)$test, $db);
		$accessiblePasswordIds = $accessInfo['accessiblePasswordIds'];
		$restrictedPasswordIds = $accessInfo['restrictedPasswordIds'];
		if ($resetMode === 'all') {
			$keptRestricted += $accessInfo['restrictedLoginCount'];
		} else if (!empty($restrictedPasswordIds)) {
			$comparison = $resetMode === 'before' ? '<' : '>=';
			$restrictedPlaceholders = implode(',', array_fill(0, count($restrictedPasswordIds), '?'));
			$restrictedParams = array_merge([(int)$test], $restrictedPasswordIds, [$resetCutoff]);
			$restrictedResult = $db->fetchValue(
				"SELECT COUNT(DISTINCT loginId) FROM activity
				 WHERE testId=? AND passwordId IN ($restrictedPlaceholders)
				 AND tsActiveServer $comparison FROM_UNIXTIME(?)",
				$restrictedParams
			);
			$keptRestricted += (int)($restrictedResult['data'] ?? 0);
		}

		if (!empty($accessiblePasswordIds)) {
			$placeholders = implode(',', array_fill(0, count($accessiblePasswordIds), '?'));
			$params = array_merge([(int)$test], $accessiblePasswordIds);

			if ($resetMode === 'all') {
				// Delete activity of accessible test takers. Answers and testCache entries cascade from activity.
				$db->prepare("DELETE FROM activity WHERE testId=? AND passwordId IN ($placeholders)");
				$db->executePrepared($params);
				$dbResult = $db->results();
				if (!empty($dbResult['error'])) throw new RuntimeException('Unable to delete accessible activity.');
				$resetAccessible += (int)($dbResult['rows'] ?? 0);

				$db->fetchValue("DELETE FROM `scoring` WHERE `testId` = ? AND `passwordId` IN ($placeholders)", $params);
				$dbResult = $db->results();
				if (!empty($dbResult['error'])) throw new RuntimeException('Unable to delete accessible scoring.');
				$resetAccessible += (int)($dbResult['rows'] ?? 0);
			} else {
				$comparison = $resetMode === 'before' ? '<' : '>=';
				$filteredParams = array_merge($params, [$resetCutoff]);
				// Select scoring through the matching activity before activity is removed.
				$db->prepare(
					"DELETE scoring FROM scoring
					 INNER JOIN activity ON activity.loginId=scoring.loginId
					  AND activity.passwordId=scoring.passwordId AND activity.testId=scoring.testId
					 WHERE activity.testId=? AND activity.passwordId IN ($placeholders)
					 AND activity.tsActiveServer $comparison FROM_UNIXTIME(?)"
				);
				$db->executePrepared($filteredParams);
				$dbResult = $db->results();
				if (!empty($dbResult['error'])) throw new RuntimeException('Unable to delete filtered accessible scoring.');
				$resetAccessible += (int)($dbResult['rows'] ?? 0);

				$db->prepare(
					"DELETE FROM activity WHERE testId=? AND passwordId IN ($placeholders)
					 AND tsActiveServer $comparison FROM_UNIXTIME(?)"
				);
				$db->executePrepared($filteredParams);
				$dbResult = $db->results();
				if (!empty($dbResult['error'])) throw new RuntimeException('Unable to delete filtered accessible activity.');
				$resetAccessible += (int)($dbResult['rows'] ?? 0);
			}
		}

			array_push($logIdsAndNames, "[{$result['data']['id']}] (\"{$result['data']['name']}\")");
		}
		if ($db->commit() !== true) throw new RuntimeException('Unable to commit test-result reset.');
		$transactionStarted = false;
	} catch (Throwable $e) {
		if ($transactionStarted) $db->rollback();
		if (empty($returnData['error'])) {
			$returnData['error'] = $uiLang->translate('The selected test results could not be reset.');
		}
		return;
	}

	// log action
	global $myAuth;
	$myAuth->prepLog($logIdsAndNames, "testResResults", $returnData);
	$returnData['resetAccessible'] = $resetAccessible;
	$returnData['keptRestricted'] = $keptRestricted;
	$returnData['resetMode'] = $resetMode;
	if ($keptRestricted > 0) {
		$returnData['warning'] = sprintf(
			$uiLang->translate("%d test taker result(s) were not reset because you do not have access to those test takers."),
			$keptRestricted
			);
		}
	}

	# -------------------------------------------------------------- #
	# Recursive folder checking collecting all file IDs (tests)      #
	# -------------------------------------------------------------- #
	function recursiveCollectTestFileIds($folder, rixPDO &$db, string $action)
	{

		$fileIds = [];
		// Retrieve all files in the current folder
		$query = "SELECT * FROM tests WHERE parent=?";
		$parameters = array($folder);
		$result = $db->fetchTable($query, $parameters);

		if (!empty($result['data'])) {
			foreach ($result['data'] as $item) {
				$fileIds[] = $item['id'];
			}
		}

		// Retrieve all subfolders of the current folder
		$query = "SELECT * FROM testFolders WHERE parent=?";
		$parameters = array($folder);
		$result = $db->fetchTable($query, $parameters);
		if (!empty($result['data'])) {
			foreach ($result['data'] as $subfolder) {
				$subfolderId = $subfolder['id'];
				$subfolderFileIds = recursiveCollectTestFileIds($subfolderId, $db, $action);
				$fileIds = array_merge($fileIds, $subfolderFileIds);
			}
		}
		return $fileIds;
	}


	function moveObjects($data, &$db, &$returnData): void
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
		$targName = $db->fetchValue("SELECT `name` FROM `testFolders` WHERE `id` = ?", [$target])['data'];

		foreach ($data['sources']['folders'] as $k0 => $v0) {
			$origInfo = $db->fetchRow("SELECT `parent`, `name` FROM `testFolders` WHERE `id` = ?", [$v0])['data'];
			$origFldName = $db->fetchValue("SELECT `name` FROM `testFolders` WHERE `id` = ?", [$origInfo['parent']])['data'];
			$data['origInfo'] .= "\tFolder ID [{$v0}] ({$origInfo['name']}) original location: [{$origInfo['parent']}] ({$origFldName}) TO: Folder ID [{$target}] ({$targName})\n";
		}

		foreach ($data['sources']['tests'] as $k1 => $v1) {
			$origInfo = $db->fetchRow("SELECT `parent`, `name` FROM `tests` WHERE `id` = ?", [$v1])['data'];
			$origFldName = $db->fetchValue("SELECT `name` FROM `testFolders` WHERE `id` = ?", [$origInfo['parent']])['data'];
			$data['origInfo'] .= "\tTest ID [{$v1}] ({$origInfo['name']}) original location: [{$origInfo['parent']}] ({$origFldName}) TO: Folder ID [{$target}] ({$targName})\n";
		}

		/* end logging routine */

		// If we're moving an entire folder branch, we have to perform a recursive check to ensure subfolders have move rights for the user
		if (isset($data['sources']['folders'])) {
			foreach ($data['sources']['folders'] as $key => $selItem) {
				global $action;
				recurs_perm_check([['dbId' => $selItem, 'target' => $target]], $db, $action);
			}
		}

		//Check if the target folder has been deleted by another user
		$query = "SELECT * FROM testFolders WHERE id=? LIMIT 1";
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
			$query = "SELECT * FROM testFolders WHERE id=? LIMIT 1";
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
			$query = "SELECT * FROM tests WHERE id=? LIMIT 1";
			$parameters = array($test);
			$result = $db->fetchRow($query, $parameters);
			//Show error message if a test is not availabe anymore
			if ($result['rows'] === 0) {
				$returnData['error'] = $uiLang->translate("One or more tests you are trying to move have been deleted by another user. The view will be refreshed.");
				$returnData['reloadFolder'] = true;
				die();
			}
		}

		$db->startTransaction();
		if (count($folders) > 0) {
			foreach ($folders as $folder) {
				$returnData['db'][] = array('folder' => $folder, 'target' => $target);
				if (checkPath($target, $db, $folder) === false) {
					$returnData['error'] = $uiLang->translate('You are not able to move a folder into itself!');
					die();
				} else {
					$name = checkExisting('testFolders', $folder, $target, $db);
					$db->prepare("UPDATE testFolders SET parent=?, name=? WHERE id=?");
					$db->executePrepared(array($target, $name, $folder));
					if (!empty($db->results()['error'])) {
						$db->rollback();
						$returnData['error'] = $uiLang->translate('The selected objects could not be moved.');
						return;
					}
				}
			}
		}
		if (count($tests) > 0) {
			foreach ($tests as $test) {
				$name = fetchName('tests', $test, $target, $db);
				$db->prepare("UPDATE tests SET parent=?, name=? WHERE id=?");
				$db->executePrepared(array($target, $name, $test));
				if (!empty($db->results()['error'])) {
					$db->rollback();
					$returnData['error'] = $uiLang->translate('The selected objects could not be moved.');
					return;
				}
			}
		}
		$dbResult = $db->results();
		if (!empty($dbResult['error'])) {
			$db->rollback();
			$returnData['error'] = $uiLang->translate('The selected objects could not be moved.');
			return;
		}
		$db->commit();

		// log action
		global $myAuth;
		$myAuth->prepLog($data, 'moveObjects', $returnData);

		fetchLibrary($data, $db, $returnData);
	}

	function duplicateObjects($data, &$db, &$returnData): void
	{
		global $uiLang;
		/* @var $db rixPDO */
		checkParams($data, array('location', 'sources', 'target'));
		$returnData['db_data'] = $data;
		$location = $data['location'];
		$objects = $data['sources'];
		$target = $data['target'];
		$folders = $objects['folders'];
		$tests = $objects['tests'];


		// recursive copy (folder) --- commented out as it seems deprecated; to be verified (???)
		//    function recursive_copyfunc($id, $pid, &$db)
		//    {
		//
		//        /* @var $db rixPDO */
		//        //Tests in folder
		//        $id = (int)$id;
		//        $pid = (int)$pid;
		//        $db->prepare('SELECT id FROM tests WHERE parent=?');
		//        $db->fetchPrepared(array($id), "table");
		//        $result = $db->results();
		//        if ($result['error']) {
		//            $returnData['error'] = $result['errorMsg'];
		//            die();
		//        }
		//        if (!empty($result['data'])) {
		//            foreach ($result['data'] as $test) {
		//                $db->prepare("INSERT INTO tests SELECT NULL as id, name,structure,options, " . $pid . " as parent,owner,userGroup,permissions,lockstate FROM tests WHERE id=?");
		//                $db->executePrepared(array($test['id']));
		//            }
		//        }
		//        //Folders in folder
		//        $query = "SELECT id FROM testFolders WHERE parent=?";
		//        $parameters = array($test);
		//        $result = $db->fetchTable($query, $parameters);
		//
		//        if (!empty($result['data'])) {
		//            foreach ($result['data'] as $folder) {
		//                $db->prepare("INSERT INTO testFolders SELECT NULL as id, name," . $pid . " as parent FROM testFolders WHERE id=?");
		//                $db->executePrepared(array($folder['id']));
		//                recursive_copyfunc($folder['id'], $result['id'], $db);
		//            }
		//        }
		//    }


		$db->startTransaction();
		$createdCustomContentIds = array();
		//Folders
		//////////////////////////////////////////////////////////////////////////////////////////////////////////
		// Folder duplication currently not used due to filer settings, leaving it in until final decisions are made
		// Caution: Recursive copy function has not yet been modified to match the needs of the test manager
		//////////////////////////////////////////////////////////////////////////////////////////////////////////
		foreach ($folders as $folder) {
			if (checkPath($target, $db, $folder) === false) {
				$db->rollback();
				$returnData['error'] = $uiLang->translate('You are not able to copy a folder into itself!');
				return;
			} else {
				$name = checkExisting('testFolders', $folder, $target, $db);
				global $myAuth;
				$db->prepare("INSERT INTO testFolders (`name`, `parent`, `owner`) SELECT ?, ?, ? FROM testFolders WHERE id=?");
				$db->executePrepared(array($name, $target, (int)$myAuth->userid, $folder));
				$result = $db->results();
				//recursive_copyfunc($folder, $result['id'], $db);
			}
		}
		//Tests
		foreach ($tests as $test) {
			$name = checkExisting('tests', $test, $target, $db);
			$db->prepare("INSERT INTO tests SELECT NULL as id, ? as name, active, structure,labels,options,info,skin,variables,metadata,? as parent,owner,userGroup,permissions,lockstate FROM tests WHERE id=?");
			$db->executePrepared(array($name, $target, $test));
			$result = $db->results();
			$newTest = $result['id'];
			if (!$newTest) {
				$db->rollback();
				$returnData['error'] = $uiLang->translate('The selected tests could not be duplicated.');
				return;
			}

			// A duplicate owns its custom content. Copy the directory and rewrite all
			// metadata references so it never depends on the source test afterwards.
			$createdCustomContentIds[] = (int)$newTest;
			if (!duplicateTestCustomContentDir((int)$test, (int)$newTest)) {
				$db->rollback();
				foreach ($createdCustomContentIds as $createdTestId) {
					deleteTestCustomContentDir($createdTestId);
				}
				$returnData['error'] = $uiLang->translate('The custom content of the selected test could not be duplicated.');
				return;
			}
			$metadataResult = $db->fetchValue('SELECT metadata FROM tests WHERE id=?', array($newTest));
			$metadata = $metadataResult['data'] ?? null;
			if (is_string($metadata) && $metadata !== '') {
				$decodedMetadata = json_decode($metadata, true);
				if (is_array($decodedMetadata)) {
					foreach ($decodedMetadata as $metaType => $metaData) {
						if (is_array($metaData)) {
							$decodedMetadata[$metaType] = normalizeMetaUploadsForTest((int)$newTest, $metaData);
						}
					}
					$db->prepare('UPDATE tests SET metadata=? WHERE id=?');
					$db->executePrepared(array(json_encode($decodedMetadata), $newTest));
				}
			}

			$query = "SELECT structure FROM tests WHERE id=? LIMIT 1";
			$parameters = array($newTest);
			$res = $db->fetchTable($query, $parameters);

			$jsonData = json_decode($res['data']['0']['structure'] ?? '', true);
			$testType = $jsonData['type'];

			if ($testType == 'fluid') {
				//test type fluid
				$createArray = array();
				$structureSave = array();
				$usedTestPools = array();

				foreach ($jsonData['items'] as $key => $structureItem) {

					$oldFluidBlock = $structureItem['hiddenID'];
					array_push($usedTestPools, $oldFluidBlock);
					//read Pool ID
					$query = "SELECT poolID FROM testFluidStructure WHERE id=? LIMIT 1";
					$parameters = array($oldFluidBlock);
					$res2 = $db->fetchTable($query, $parameters);

					$oldPoolId = $res2['data']['0']['poolID'];
					//Check if pool is still available
					$query = "SELECT id FROM testPools WHERE id=?";
					$parameters = array($oldPoolId);
					$res2 = $db->fetchTable($query, $parameters);

					if ($res2['rows'] > 0) {
						if (!isset($createArray[$oldPoolId])) {
							//copy Pool
							$db->prepare("INSERT INTO testPools SELECT NULL as id, ? as testID,structure,name FROM testPools WHERE id=?");
							$db->executePrepared(array($newTest, $oldPoolId));
							$res3 = $db->results();
							$createArray[$oldPoolId] = $res3['id'];
						}
						$newPoolId = $createArray[$oldPoolId];

						//copy fluid structure with new PoolID
						$db->prepare("INSERT INTO testFluidStructure SELECT NULL as id, ? as testID, ? as poolID, numberOfItems, random FROM testFluidStructure WHERE id=?");
						$db->executePrepared(array($newTest, $newPoolId, $oldFluidBlock));
						$res4 = $db->results();
						//copy labels
						$oldLabelId = $structureItem['labelID'];

						//create new structure string
						array_push($structureSave, array('hiddenID' => $res4['id'], 'labelID' => $oldLabelId, 'overrides' => $structureItem['overrides'], 'scripts' => $structureItem['scripts']));
					} else {
						$returnData['poolError'] = true;
					}
				}
				//Copy unused testpools as well
				if (count($usedTestPools) > 0) {
					$questionMarks = str_repeat('?,', count($usedTestPools) - 1) . '?';
					$query = "SELECT poolID FROM testFluidStructure WHERE id IN (" . $questionMarks . ")";
					$parameters = $usedTestPools;
					$res5 = $db->fetchTable($query, $parameters);
					$usedTestPools = $res5['data'];
					$queryArray = array();
					array_push($queryArray, $newTest);
					array_push($queryArray, $test);
					foreach ($usedTestPools as $key => $pool) {
						array_push($queryArray, $pool['poolID']);
					}
					$questionMarks = str_repeat('?,', count($usedTestPools) - 1) . '?';
					$db->prepare('INSERT INTO testPools SELECT NULL as id, ? as testID,structure,name FROM testPools WHERE testID=? AND id NOT IN (' . $questionMarks . ')');
					$db->executePrepared($queryArray);
				}

				//write structure to new test
				$structureSaveComplete = array('type' => 'fluid', 'state' => tmNormalizeTestState($jsonData['state'] ?? 'draft'), 'items' => $structureSave);
				$structureSaveComplete = json_encode($structureSaveComplete);

				//save test-structure to db
				$db->prepare("UPDATE tests SET structure=? WHERE id=?");
				$db->executePrepared(array($structureSaveComplete, $newTest));
				$result = $db->results();
				if ($result['error']) {
					$db->rollback();
					foreach ($createdCustomContentIds as $createdTestId) {
						deleteTestCustomContentDir($createdTestId);
					}
					$returnData['error'] = $result['errorMsg'];
					$returnData['closeEditMode'] = true;
					$returnData['reloadFolder'] = true;
					return;
				}
			}
		}
		$dbResult = $db->results();
		if (!empty($dbResult['error'])) {
			$db->rollback();
			foreach ($createdCustomContentIds as $createdTestId) {
				deleteTestCustomContentDir($createdTestId);
			}
			$returnData['error'] = $uiLang->translate('The selected tests could not be duplicated.');
			return;
		}
		$db->commit();
		fetchLibrary($data, $db, $returnData);
	}


	function saveTestFolder($data, &$db, &$returnData): void
	{
		/* @var $db rixPDO */
		checkParams($data, array('id', 'name', 'location'));

		$id = $data['id'];
		$newName['name'] = $data['name'];

		$db->update('testFolders', $newName, 'id=?', array($id));
		//get updated item folder from database (as verification)
		$query = "SELECT *, 'folder' as type FROM testFolders WHERE id=?";
		$parameters = array($id);
		$result = $db->fetchRow($query, $parameters);
		$returnData['data'] = $result['data'];

		fetchLibrary($data, $db, $returnData);
	}

	function fetchItemsStimuli($data, &$db, &$returnData): void
	{
		/* @var $db rixPDO */
		checkParams($data, array('dbId', 'source'));
		$source = $data['source'];

		$query = 'SELECT items.id AS id, items.itemCode AS itemCode, items.`name` AS name, itemGroups.`name` AS igName, CASE WHEN JSON_CONTAINS(metadata, \'{"useAsStimulus":true}\') THEN true ELSE false END AS stimulus  FROM items INNER JOIN itemGroups ON itemGroups.id = items.groupId WHERE items.groupId=? order by name';
		$parameters = array($data['dbId']);
		$result = $db->fetchTable($query, $parameters);
		foreach ($result['data'] as $k => $v) {
			$result['data'][$k]['maxScore'] = OasysScoring::fetchPageMaxScore($v['id'], $db);
		}
		$returnData['data'] = $result['data'];
		$returnData['source'] = $source;
	}

	function renameTestOrFolder($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth;
		/* @var $db rixPDO */
		checkParams($data, array('name', 'type', 'id', 'location'));

		$location = $data['location'];
		$id = $data['id'];
		$newName['name'] = $data['name'];

		// preserve original name for logging purposes
		$qType = $data['type'] === 'folder' ? "testFolders" : "tests";
		$data['origName'] = $db->fetchValue("SELECT `name` FROM {$qType} WHERE `id` = ?", [$id])['data'];

		if ($data['type'] == 'folder') {
			$table = "testFolders";

			//Check if folder has been deleted or removed by another user
			$query = 'SELECT * FROM testFolders WHERE id=? LIMIT 1';
			$parameters = array($id);
			$result = $db->fetchRow($query, $parameters);
			//Show error message if selected testee is not available anymore
			if ($result['rows'] === 0) {
				$returnData['error'] = $uiLang->translate("The folder you are trying to rename has been deleted by another user. The view will be refreshed.");
				$returnData['reloadFolder'] = true;
				die();
			}
			//Show error message if selected testee has been moved to another folder
			if ($result['data']['parent'] !== $location) {
				$returnData['error'] = $uiLang->translate("The folder you are trying to rename has been moved to a different folder by another user. The new location will be opened.");
				$returnData['reloadFolder'] = true;
				$returnData['openNewLocation'] = true;
				$returnData['openNewLocationId'] = $result['data']['parent'];
				die();
			}

			//verify if a folder with that name already exists on the same level
			$query = 'SELECT COUNT(*) as isPresent, id FROM testFolders WHERE name=? and parent=?';
			$parameters = array($newName['name'], $location);
			$results = $db->fetchRow($query, $parameters);
			// if the name is already in use:
			if ($results['data']['isPresent'] != 0) {
				//allow cosmetic renaming
				if ($results['data']['id'] !== $id) {
					$returnData['error'] = $uiLang->translate("A folder with that name does already exist. Try using another name.");
					die();
				}
			}
		} else {
			$table = "tests";

			//Check if test has been deleted or removed by another user
			$query = 'SELECT * FROM tests WHERE id=? LIMIT 1';
			$parameters = array($id);
			$result = $db->fetchRow($query, $parameters);
			//Show error message if selected test is not available anymore
			if ($result['rows'] === 0) {
				$returnData['error'] = $uiLang->translate("The test you are trying to rename has been deleted by another user. The view will be refreshed.");
				$returnData['reloadFolder'] = true;
				die();
			}
			//Show error message if selected test has been moved to another folder
			if ($result['data']['parent'] !== $location) {
				$returnData['error'] = $uiLang->translate("The test you are trying to rename has been moved to a different folder by another user. The new location will be opened.");
				$returnData['reloadFolder'] = true;
				$returnData['openNewLocation'] = true;
				$returnData['openNewLocationId'] = $result['data']['parent'];
				die();
			}

			//verify if a login with that name already exists
			$query = 'SELECT COUNT(*) as isPresent, id FROM tests WHERE name=?';
			$parameters = array($newName['name']);
			$results = $db->fetchRow($query, $parameters);
			// if the name is already in use:
			if ($results['data']['isPresent'] != 0) {
				//allow cosmetic renaming
				if ($results['data']['id'] !== $id) {
					$returnData['error'] = $uiLang->translate("A test with that name does already exist. Try using another name.");
					die();
				}
			}
		}
		//update the name if the previous checks were successful
		$db->update($table, $newName, 'id=?', array($id));
		if ($data['type'] == 'folder') {
			$data['select'] = 'f' . $id;
		} else {
			$data['select'] = 't' . $id;
			registerActivity($db, (int)$myAuth->userid, $id, 'test');
		}

		// log action
		global $myAuth;
		$myAuth->prepLog($data, "rename", $returnData);

		fetchLibrary($data, $db, $returnData);
	}

	function saveFluidPoolOrder($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth;
		/* @var $db rixPDO */
		checkParams($data, array('id'));

		//Check if the pool assignment is still present and fetch order value
		$query = 'SELECT random, testID FROM testFluidStructure WHERE id=? LIMIT 1';
		$parameters = array($data['id']);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if selected test is not available anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("This pool assignment has been deleted. Test Manager will be closed.");
			$returnData['closeEditMode'] = true;
			die();
		}
		tmAbortIfPublishedTestId((int)$result['data']['testID'], $db, $returnData, 'This test is Published (Locked). The fluid test structure cannot be changed while the test is locked.');
		$orderVal = (int)$result['data']['random'];
		$db->prepare("UPDATE testFluidStructure SET random=? WHERE id=?");
		if ($orderVal === 0) {
			$db->executePrepared(array(1, $data['id']));
		} else {
			$db->executePrepared(array(0, $data['id']));
		}
		registerActivity($db, (int)$myAuth->userid, $data['testId'], 'test');
	}

	function saveFluidPageUsage($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth;
		/* @var $db rixPDO */
		checkParams($data, array('id', 'pageUsage'));

		//Check if the pool assignment is still present and fetch order value
		$query = 'SELECT random, testID FROM testFluidStructure WHERE id=? LIMIT 1';
		$parameters = array($data['id']);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if selected test is not available anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("This pool assignment has been deleted. Test Manager will be closed.");
			$returnData['closeEditMode'] = true;
			die();
		}
		tmAbortIfPublishedTestId((int)$result['data']['testID'], $db, $returnData, 'This test is Published (Locked). The fluid test structure cannot be changed while the test is locked.');
		$db->prepare("UPDATE testFluidStructure SET numberOfItems=? WHERE id=?");
		$db->executePrepared(array($data['pageUsage'], $data['id']));
		registerActivity($db, (int)$myAuth->userid, $data['testId'], 'test');
	}

	function tmNormalizeTestState($state): string
	{
		return $state === 'published' ? 'published' : 'draft';
	}

	function tmAbortIfPublishedTestRow(array $testRow, array &$returnData, string $message): void
	{
		global $uiLang;
		$structure = json_decode($testRow['structure'] ?? '', true);
		if (!is_array($structure)) {
			$structure = [];
		}
		if (tmNormalizeTestState($structure['state'] ?? 'draft') === 'published') {
			$returnData['error'] = $uiLang->translate($message);
			die();
		}
	}

	function tmAbortIfPublishedTestId(int $testId, rixPDO &$db, array &$returnData, string $message): void
	{
		$result = $db->fetchRow("SELECT structure FROM tests WHERE id=? LIMIT 1", [$testId]);
		if ($result['rows'] === 0) return;
		tmAbortIfPublishedTestRow($result['data'], $returnData, $message);
	}

	function tmSetStructureState(int $testId, string $state, rixPDO &$db, ?string $requiredType = null): void
	{
		$result = $db->fetchRow("SELECT structure FROM tests WHERE id=? LIMIT 1", [$testId]);
		if ($result['rows'] === 0) return;

		$structure = json_decode($result['data']['structure'] ?? '', true);
		if (!is_array($structure)) return;
		if ($requiredType !== null && ($structure['type'] ?? null) !== $requiredType) return;

		$structure['state'] = tmNormalizeTestState($state);
		$db->prepare("UPDATE tests SET structure=? WHERE id=?");
		$db->executePrepared([json_encode($structure), $testId]);
	}

	function tmCanSwitchStructureStateToDraft(int $testId, rixPDO &$db): bool
	{
		global $myAuth;
		if ($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin()) return true;

		$access = tmTestActivityAccessSummary($testId, $db);
		return ((int)$access['total'] === 0 || (int)$access['restricted'] === 0);
	}

	function tmPublishedToDraftError(int $testId, rixPDO &$db): string
	{
		global $uiLang;
		$access = tmTestActivityAccessSummary($testId, $db);

		return '<div class="tmDraftRestriction">' .
			'<div class="tmDraftRestrictionIntro">' .
			'<strong>' . $uiLang->translate('Draft mode is unavailable') . '</strong>' .
			'<span>' . $uiLang->translate('This test has recorded results, and your account does not have access to every test taker with results.') . '</span>' .
			'</div>' .
			'<div class="tmDraftRestrictionGuidance">' .
			$uiLang->translate('Only Superadmins, Elevated Admins and Admins may switch this test back to Draft in this situation. Regular users need access to every test taker with results.') .
			'</div>' .
			'<div class="tmDraftRestrictionStats">' .
			'<div class="tmDraftRestrictionStat tmDraftRestrictionStatTotal"><span>' . $uiLang->translate('Recorded test takers') . '</span><strong>' . (int)$access['total'] . '</strong></div>' .
			'<div class="tmDraftRestrictionStat tmDraftRestrictionStatAccessible"><span>' . $uiLang->translate('Accessible') . '</span><strong>' . (int)$access['accessible'] . '</strong></div>' .
			'<div class="tmDraftRestrictionStat tmDraftRestrictionStatRestricted"><span>' . $uiLang->translate('Restricted') . '</span><strong>' . (int)$access['restricted'] . '</strong></div>' .
			'</div>' .
			'</div>';
	}

	function tmPublishMutationChildren(array $structure, rixPDO &$db): void
	{
		if (($structure['type'] ?? null) !== 'mutation') return;
		foreach (($structure['items'] ?? []) as $item) {
			if (isset($item['hiddenID'])) {
				tmSetStructureState((int)$item['hiddenID'], 'published', $db, 'linear');
			}
		}
	}

	function tmIncludeLinkedStimuliForPages(array $pageIds, rixPDO &$db): array
	{
		$pageIds = array_values(array_unique(array_filter(array_map('intval', $pageIds))));
		if (empty($pageIds)) return [];
		$placeholders = implode(',', array_fill(0, count($pageIds), '?'));
		$rows = $db->fetchColumn("SELECT DISTINCT link FROM items WHERE id IN ($placeholders) AND link IS NOT NULL", $pageIds)['data'] ?? [];
		return array_values(array_unique(array_merge($pageIds, array_map('intval', $rows))));
	}

	function tmExtractPageIdsForPublishLockCheck(array $structure, rixPDO &$db, array &$seenTests = []): array
	{
		$type = $structure['type'] ?? 'linear';
		$pageIds = [];
		if ($type === 'linear') {
			foreach (($structure['items'] ?? []) as $item) {
				if (isset($item['hiddenID'])) $pageIds[] = (int)$item['hiddenID'];
			}
		} elseif ($type === 'fluid') {
			$poolIds = [];
			foreach (($structure['items'] ?? []) as $item) {
				if (isset($item['hiddenID'])) $poolIds[] = (int)$item['hiddenID'];
			}
			$poolIds = array_values(array_unique(array_filter($poolIds)));
			foreach ($poolIds as $poolId) {
				$row = $db->fetchRow("SELECT structure FROM testPools WHERE id=? LIMIT 1", [$poolId]);
				if (($row['rows'] ?? 0) === 0) continue;
				$poolStructure = json_decode($row['data']['structure'] ?? '', true);
				if (!is_array($poolStructure)) continue;
				foreach (($poolStructure['items'] ?? []) as $item) {
					if (isset($item['hiddenID'])) $pageIds[] = (int)$item['hiddenID'];
				}
			}
		} elseif ($type === 'mutation') {
			foreach (($structure['items'] ?? []) as $item) {
				if (!isset($item['hiddenID'])) continue;
				$testId = (int)$item['hiddenID'];
				if (isset($seenTests[$testId])) continue;
				$seenTests[$testId] = true;
				$row = $db->fetchRow("SELECT structure FROM tests WHERE id=? LIMIT 1", [$testId]);
				if (($row['rows'] ?? 0) === 0) continue;
				$childStructure = json_decode($row['data']['structure'] ?? '', true);
				if (!is_array($childStructure)) continue;
				$pageIds = array_merge($pageIds, tmExtractPageIdsForPublishLockCheck($childStructure, $db, $seenTests));
			}
		}
		return tmIncludeLinkedStimuliForPages($pageIds, $db);
	}

	function tmDecodeSessionUserId(?string $sessionData): ?int
	{
		if (!$sessionData) return null;
		if (preg_match('/userid\|i:(\d+);/', $sessionData, $match)) return (int)$match[1];
		if (preg_match('/userid\|s:\d+:"(\d+)";/', $sessionData, $match)) return (int)$match[1];
		return null;
	}

	function tmCurrentPageLockOwnerIds(): array
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

	function tmStateDataValue(?string $rawStateData, string $property): mixed
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

	function tmPageLockUserName(array $lock, rixPDO &$db): string
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
				$username = tmStateDataValue($stateRow['data']['data'] ?? null, 'username');
				if ($username) return (string)$username;
				$userId = tmStateDataValue($stateRow['data']['data'] ?? null, 'userid');
				if ($userId) {
					$name = $db->fetchValue("SELECT name FROM users WHERE id=? LIMIT 1", [(int)$userId])['data'] ?? null;
					if ($name) return (string)$name;
				}
			}
			$sessionRow = $db->fetchRow("SELECT data FROM sessions WHERE id=? LIMIT 1", [$ownerId]);
			$userId = (($sessionRow['rows'] ?? 0) > 0) ? tmDecodeSessionUserId($sessionRow['data']['data'] ?? null) : null;
			if ($userId !== null) {
				$name = $db->fetchValue("SELECT name FROM users WHERE id=? LIMIT 1", [$userId])['data'] ?? null;
				if ($name) return (string)$name;
			}
		}
		return 'another user';
	}

	function tmActivePageEditLocks(array $pageIds, rixPDO &$db): array
	{
		$pageIds = array_values(array_unique(array_filter(array_map('intval', $pageIds))));
		if (empty($pageIds)) return [];

		$placeholders = implode(',', array_fill(0, count($pageIds), '?'));
		$query = "SELECT id, name, itemCode, `lock` FROM items WHERE id IN ($placeholders)";
		$rows = $db->fetchTable($query, $pageIds)['data'] ?? [];
		$currentLockOwnerIds = tmCurrentPageLockOwnerIds();
		$locks = [];
		foreach ($rows as $row) {
			$lock = json_decode($row['lock'] ?? '', true);
			if (json_last_error() !== JSON_ERROR_NONE || !is_array($lock)) continue;
			$sessionId = isset($lock['sessionId']) ? (string)$lock['sessionId'] : '';
			if ($sessionId === '' || in_array($sessionId, $currentLockOwnerIds, true)) continue;
			$timestamp = isset($lock['timestamp']) ? strtotime((string)$lock['timestamp']) : false;
			if ($timestamp !== false && time() - $timestamp >= 60) continue;

			$locks[] = [
				'id' => (int)$row['id'],
				'name' => (string)$row['name'],
				'code' => (string)($row['itemCode'] ?? ''),
				'userName' => tmPageLockUserName($lock, $db),
			];
		}
		return $locks;
	}

	function tmAbortIfPublishingPagesInEdit(array $structure, rixPDO &$db, array &$returnData): void
	{
		global $uiLang;
		$pageIds = tmExtractPageIdsForPublishLockCheck($structure, $db);
		$locks = tmActivePageEditLocks($pageIds, $db);
		if (empty($locks)) return;

		$rows = [];
		foreach ($locks as $lock) {
			$pageName = htmlspecialchars((string)$lock['name'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
			$pageCode = htmlspecialchars((string)$lock['code'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
			$editorName = htmlspecialchars((string)$lock['userName'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
			$codeHtml = $pageCode !== '' ? '<span style="display:block;color:#60758a;font-size:12px;margin-top:2px;">' . $uiLang->translate('Code') . ': ' . $pageCode . '</span>' : '';
			$rows[] = '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(130px,.45fr);gap:10px;align-items:stretch;margin-top:8px;padding:9px 10px;border:1px solid #d6e1ea;border-radius:6px;background:#f7fbfe;">' .
				'<div><span style="display:block;color:#60758a;font-size:11px;font-weight:bold;text-transform:uppercase;">' . $uiLang->translate('Page name') . '</span><strong style="display:block;color:#102f45;">' . $pageName . '</strong>' . $codeHtml . '</div>' .
				'<div><span style="display:block;color:#60758a;font-size:11px;font-weight:bold;text-transform:uppercase;">' . $uiLang->translate('Editor') . '</span><strong style="display:block;color:#102f45;">' . $editorName . '</strong></div>' .
				'</div>';
		}
		$returnData['error'] = '<p>' . $uiLang->translate('This test cannot be published because at least one page is currently being edited.') . '</p>' .
			'<p>' . $uiLang->translate('Please ask the editor to close the page first and try publishing again.') . '</p>' .
			'<div style="margin-top:10px;">' . implode('', $rows) . '</div>';
		$returnData['reloadTest'] = true;
		die();
	}

	function tmInvalidCompiledPages(array $structure, rixPDO &$db): array
	{
		$pageIds = tmExtractPageIdsForPublishLockCheck($structure, $db);
		if (empty($pageIds)) return [];

		$placeholders = implode(',', array_fill(0, count($pageIds), '?'));
		return $db->fetchTable(
			"SELECT id, name, itemCode FROM items WHERE id IN ($placeholders) AND (`parsed` IS NULL OR `fields` IS NULL OR `options` IS NULL OR `scripts` IS NULL) ORDER BY name, id",
			$pageIds
		)['data'] ?? [];
	}

	function tmAbortIfPublishingInvalidPages(array $structure, rixPDO &$db, array &$returnData): void
	{
		global $uiLang;
		$invalidPages = tmInvalidCompiledPages($structure, $db);
		if (empty($invalidPages)) return;

		$rows = [];
		foreach ($invalidPages as $page) {
			$pageName = htmlspecialchars((string)$page['name'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
			$pageCode = htmlspecialchars((string)($page['itemCode'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
			$codeHtml = $pageCode !== '' ? '<span style="display:block;color:#60758a;font-size:12px;margin-top:2px;">' . $uiLang->translate('Code') . ': ' . $pageCode . '</span>' : '';
			$rows[] = '<div style="margin-top:8px;padding:9px 10px;border:1px solid #d6e1ea;border-radius:6px;background:#f7fbfe;">' .
				'<strong style="display:block;color:#102f45;">' . $pageName . '</strong>' . $codeHtml .
				'</div>';
		}
		$returnData['error'] = '<p><strong>' . $uiLang->translate('Empty content') . '</strong></p>' .
			'<p>' . $uiLang->translate('Content is missing.') . '</p>' .
			'<div style="margin-top:10px;">' . implode('', $rows) . '</div>';
		$returnData['reloadTest'] = true;
		die();
	}

	function saveTest($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth;
		/* @var $db rixPDO */
		checkParams($data, array('id'));
		$mSave = $data['mSave'] ?? false;
		$db->startTransaction();
		// Lock the row for the complete multi-column save.
		$query = 'SELECT * FROM tests WHERE id=? LIMIT 1 FOR UPDATE';
		$parameters = array($data['id']);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if selected test is not available anymore
		if ($result['rows'] === 0) {
			$db->rollback();
			$returnData['error'] = $uiLang->translate("You are trying to save a test which has been deleted by another user. The view will be refreshed.");
			$returnData['closeEditMode'] = true;
			die();
		}
		$currentRevision = tmTestEditRevision($result['data']);
		if (isset($data['editRevision']) && !hash_equals($currentRevision, (string)$data['editRevision'])) {
			$db->rollback();
			$returnData['error'] = $uiLang->translate('This test has been changed by another user. Your changes were not saved; the current version will be reloaded.');
			$returnData['reloadFolder'] = true;
			$returnData['closeEditMode'] = true;
			return;
		}
		$currentStructure = json_decode($result['data']['structure'] ?? '', true);
		if (!is_array($currentStructure)) {
			$currentStructure = [];
		}
		$currentState = tmNormalizeTestState($currentStructure['state'] ?? 'draft');
		$requestedState = isset($data['structureState']) ? tmNormalizeTestState($data['structureState']) : $currentState;
		if ($currentState !== 'published' && $requestedState === 'published') {
			$structureForLockCheck = $currentStructure;
			if (isset($data['structure']) && is_array($data['structure'])) {
				$structureForLockCheck = [
					'type' => $mSave === false ? ($data['testtype'] ?? ($currentStructure['type'] ?? 'linear')) : 'mutation',
					'items' => $data['structure'],
				];
			}
			tmAbortIfPublishingInvalidPages($structureForLockCheck, $db, $returnData);
			tmAbortIfPublishingPagesInEdit($structureForLockCheck, $db, $returnData);
		}
		if ($currentState === 'published' && $requestedState === 'draft' && !tmCanSwitchStructureStateToDraft((int)$data['id'], $db)) {
			$returnData['error'] = tmPublishedToDraftError((int)$data['id'], $db);
			die();
		}
		if ($mSave === false) {
			$labels = json_decode($result['data']['labels'] ?? '');
			$labelDefault = null;
			//Find default label
			foreach ($labels as $key => $value) {
				if ($value->default === 'yes') {
					$labelDefault = $key;
				}
			}
			//Show error message if skin has been changed
			$skinJson = json_decode($result['data']['skin'] ?? '', true);
			$returnData['q1'] = $skinJson['skin'];
			$returnData['q2'] = $data['currentSkin'];
			if ($skinJson['skin'] != $data['currentSkin']) {
				$returnData['error'] = $uiLang->translate("You are trying to edit a test where another user has just changed the skin settings. The view will be refreshed.");
				$returnData['closeEditMode'] = true;
				$returnData['reloadFolder'] = true;
				die();
			}
			//End check
		}
		if (isset($data['name'])) {
			if ($data['name'] == '') {
				$returnData['error'] = $uiLang->translate('Please enter at least one character for the name.');
				die();
			}
			//save modified name to db
			$db->prepare("UPDATE tests SET name=? WHERE id=?");
			$db->executePrepared(array($data['name'], $data['id']));
			if (!empty($db->results()['error'])) {
				$db->rollback();
				$returnData['error'] = $uiLang->translate('The test could not be saved. No changes were applied.');
				return;
			}
		}

		if (isset($data['options'])) {
			//extract active switch from options
			if ($data['options']['onOffSwitch']) {
				$activeSwitch = 1;
			} else {
				$activeSwitch = 0;
			}
			unset($data['options']['onOffSwitch']);
			$data['options'] = json_encode($data['options']);
			//save modified options to db
			$db->prepare("UPDATE tests SET options=?, active=? WHERE id=?");
			$db->executePrepared(array($data['options'], $activeSwitch, $data['id']));
			if (!empty($db->results()['error'])) {
				$db->rollback();
				$returnData['error'] = $uiLang->translate('The test could not be saved. No changes were applied.');
				return;
			}
		}

		if (isset($data['structure'])) {
			if ($mSave === false && $currentState === 'published') {
				$returnData['error'] = $uiLang->translate('This test is Published (Locked). The test structure cannot be changed while the test is locked.');
				die();
			}
			$structureSave = $data['structure'];
			if ($mSave === false) {
				$incomingTestType = $data['testtype'] ?? ($currentStructure['type'] ?? 'linear');
				if ($incomingTestType === 'linear' && !tmValidateLinearStructurePageAccess($structureSave, $db, $returnData)) {
					die();
				}
				for ($i = 0; $i < count($structureSave); $i++) {
					unset($structureSave[$i]['name']);
					unset($structureSave[$i]['code']);
					unset($structureSave[$i]['type']);
					unset($structureSave[$i]['itemGroup']);
					unset($structureSave[$i]['maxScore']);

					//Handling label, using default label if not specified
					if (isset($structureSave[$i]['tdid'])) {
						$structureSave[$i]['labelID'] = $structureSave[$i]['tdid'];
						unset($structureSave[$i]['tdid']);
						unset($structureSave[$i]['label']);
					} else {
						$structureSave[$i]['labelID'] = $labelDefault;
					}
					//ActionField (Overrides)
					$structureSave[$i]['overrides'] = $structureSave[$i]['actionField'];
					unset($structureSave[$i]['actionField']);
					//ActionButton (Scripts)
					$structureSave[$i]['scripts'] = $structureSave[$i]['actionButton'];
					unset($structureSave[$i]['actionButton']);
				}
				$structureSaveComplete = array('type' => $data['testtype'], 'state' => $requestedState, 'items' => $structureSave);
			} else {
				for ($i = 0; $i < count($structureSave); $i++) {
					unset($structureSave[$i]['actionButtons']);
					unset($structureSave[$i]['id']);
					unset($structureSave[$i]['maxScore']);
					unset($structureSave[$i]['name']);
					unset($structureSave[$i]['pages']);
				}
				$structureSaveComplete = array('type' => 'mutation', 'state' => $requestedState, 'pointer' => 0, 'items' => $structureSave);
			}
			$data['structure'] = json_encode($structureSaveComplete);

			//save modified test-structure to db
			$db->prepare("UPDATE tests SET structure=? WHERE id=?");
			$db->executePrepared(array($data['structure'], $data['id']));
			if (!empty($db->results()['error'])) {
				$db->rollback();
				$returnData['error'] = $uiLang->translate('The test could not be saved. No changes were applied.');
				return;
			}
			if (($data['publishMutationChildren'] ?? false) && $requestedState === 'published') {
				tmPublishMutationChildren($structureSaveComplete, $db);
			}
		} elseif (isset($data['structureState'])) {
			$currentStructure['state'] = $requestedState;
			$db->prepare("UPDATE tests SET structure=? WHERE id=?");
			$db->executePrepared(array(json_encode($currentStructure), $data['id']));
			if (!empty($db->results()['error'])) {
				$db->rollback();
				$returnData['error'] = $uiLang->translate('The test could not be saved. No changes were applied.');
				return;
			}
			if (($data['publishMutationChildren'] ?? false) && $requestedState === 'published') {
				tmPublishMutationChildren($currentStructure, $db);
			}
		}

		if (isset($data['metaData'])) {

			$metaType = $data['metaType'];
			$metadata = $result['data']['metadata'] ?? '';
			$decodedMetadata = json_decode($metadata, false);

			$write = (json_last_error() === JSON_ERROR_NONE && is_object($decodedMetadata))
				? $decodedMetadata
				: new stdClass();

			$metaData = $data['metaData'];

			// For meta pages, normalize custom content and copy media into the current test folder
			if (
				in_array($metaType, ['privacy_policy', 'score_screen', 'landing_page', 'finish_screen'], true)
				&& is_array($metaData)
			) {
				$metaData = normalizeMetaUploadsForTest((int)$data['id'], $metaData);
			}

			$write->$metaType = $metaData;

			$db->prepare("UPDATE tests SET metadata=? WHERE id=?");
			$db->executePrepared(array(json_encode($write), $data['id']));
			if (!empty($db->results()['error'])) {
				$db->rollback();
				$returnData['error'] = $uiLang->translate('The test could not be saved. No changes were applied.');
				return;
			}
		}


		if (isset($data['startPreview']) && $data['startPreview'] === true) {
			$returnData['startPreview'] = true;
		}
		registerActivity($db, (int)$myAuth->userid, $data['id'], 'test');
		$dbResult = $db->results();
		if (!empty($dbResult['error'])) {
			$db->rollback();
			$returnData['error'] = $uiLang->translate('The test could not be saved. No changes were applied.');
			return;
		}
		$db->commit();
		$saved = $db->fetchRow('SELECT * FROM tests WHERE id=? LIMIT 1', array($data['id']));
		$returnData['editRevision'] = tmTestEditRevision($saved['data'] ?? array());
	}

	function clearTestStructure($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth;
		/* @var $db rixPDO */
		checkParams($data, array('testId'));

		$testId = (int)$data['testId'];
		$result = $db->fetchRow('SELECT id, parent, structure, skin FROM tests WHERE id=? LIMIT 1', array($testId));
		if (($result['rows'] ?? 0) === 0) {
			$returnData['error'] = $uiLang->translate('The test you are trying to edit has been deleted by another user. The view will be refreshed.');
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			return;
		}

		$test = $result['data'];
		if (!tmCanModifyTest($test, $db)) {
			$returnData['error'] = $uiLang->translate('You do not have permission to change this test.');
			return;
		}

		$structure = json_decode($test['structure'] ?? '', true);
		$testType = is_array($structure) ? ($structure['type'] ?? '') : '';
		if (!in_array($testType, array('linear', 'fluid', 'mutation'), true)) {
			$returnData['error'] = $uiLang->translate('The test structure could not be cleared because its type is invalid.');
			return;
		}

		$state = tmNormalizeTestState($structure['state'] ?? 'draft');
		if ($state === 'published' && $testType !== 'mutation') {
			$returnData['error'] = $uiLang->translate('This test is Published (Locked). The test structure cannot be changed while the test is locked.');
			return;
		}

		if ($testType !== 'mutation') {
			$currentSkin = $data['currentSkin'] ?? null;
			$skin = json_decode($test['skin'] ?? '', true);
			if ($currentSkin === null || !is_array($skin) || ($skin['skin'] ?? null) !== $currentSkin) {
				$returnData['error'] = $uiLang->translate('You are trying to edit a test where another user has just changed the skin settings. The view will be refreshed.');
				$returnData['closeEditMode'] = true;
				$returnData['reloadFolder'] = true;
				return;
			}
		}

		$emptyStructure = array('type' => $testType, 'state' => $state, 'items' => array());
		if ($testType === 'mutation') {
			$emptyStructure['pointer'] = 0;
		}
		$db->prepare('UPDATE tests SET structure=? WHERE id=?');
		$db->executePrepared(array(json_encode($emptyStructure), $testId));

		$returnData['clearedStructureType'] = $testType;
		registerActivity($db, (int)$myAuth->userid, $testId, 'test');
	}

	/**
	 * AJAX: Normalize meta custom content and copy files into the current test folder,
	 * but do NOT save anything to the DB.
	 *
	 * Expects:
	 * - id       (current test id)
	 * - metaType (privacy_policy|score_screen|landing_page|finish_screen)
	 * - metaData (array: languages + optional config keys)
	 */
	function normalizeMetaUploads($data, &$db, &$returnData): void
	{
		if (empty($data['id']) || empty($data['metaType']) || empty($data['metaData']) || !is_array($data['metaData'])) {
			$returnData['error'] = 'Invalid parameters for normalizeMetaUploads.';
			return;
		}

		$metaType = $data['metaType'];
		if (!in_array($metaType, ['privacy_policy', 'score_screen', 'landing_page', 'finish_screen'], true)) {
			$returnData['error'] = 'Unsupported metaType for normalizeMetaUploads.';
			return;
		}

		$copyErrors = array();
		$normalized = normalizeMetaUploadsForTest((int)$data['id'], $data['metaData'], $copyErrors);
		if (!empty($copyErrors)) {
			$returnData['error'] = 'One or more custom-content files could not be copied: ' . implode(', ', array_unique($copyErrors));
			return;
		}
		$returnData['metaData'] = $normalized;
	}


	function saveTestBulk($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth, $permAuth;
		/* @var $db rixPDO */

		// ---- validate input ----
		if (empty($data['targets']) || !is_array($data['targets'])) {
			$returnData['error'] = 'No targets provided.';
			return;
		}
		if (empty($data['changes']) || !is_array($data['changes'])) {
			$returnData['error'] = 'No changes provided.';
			return;
		}

		$targets = array_map('intval', $data['targets']);
		$changes = $data['changes'];
		$bulkStructureState = null;
		if (array_key_exists('testState', $changes)) {
			if (!($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin())) {
				$returnData['error'] = $uiLang->translate('Only Superadmins, Elevated Admins and Admins may change the test state in bulk edit.');
				return;
			}
			if (!in_array($changes['testState'], ['draft', 'published'], true)) {
				$returnData['error'] = $uiLang->translate('Invalid test state selected.');
				return;
			}
			$bulkStructureState = tmNormalizeTestState($changes['testState']);
		}

		// small helpers (same semantics as single edit)
		$asBool = static function ($v) {
			if (is_bool($v)) return $v;
			if ($v === 1 || $v === '1' || $v === 'true' || $v === 'TRUE') return true;
			if ($v === 0 || $v === '0' || $v === 'false' || $v === 'FALSE') return false;
			return (bool)$v;
		};
		$asInt = static function ($v, $min = 0, $max = 999) {
			$n = (int)$v;
			if ($n < $min) $n = $min;
			if ($n > $max) $n = $max;
			return $n;
		};

		$canEditNow = function (int $testId) use ($db, $myAuth, $permAuth, $uiLang): array {
			// test still there?
			$row = $db->fetchRow('SELECT id, parent FROM tests WHERE id=? LIMIT 1', [$testId]);
			if (($row['rows'] ?? 0) === 0) {
				return [false, 'Test no longer exists.'];
			}
			$parent = (int)($row['data']['parent'] ?? 0);

			// SA/Admin/Elevated Admin: full access
			if ($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin()) {
				return [true, null];
			}

			// folder owner?
			$owner = (int)($db->fetchValue("SELECT `owner` FROM `testFolders` WHERE id = ?", [$parent])['data'] ?? 0);
			if ($owner === (int)$myAuth->userid) {
				return [true, null];
			}

			// regular permission: same capability as single-edit (“saveTest” → “editSelection”)
			// permAuth API matches what you’re already using
			$ok = $permAuth ? $permAuth->getAccessVal("itemgroup", "saveTest", "itemObject", $parent) : false;
			if ($ok) return [true, null];

			return [false, $uiLang ? $uiLang->translate('You are not allowed to edit this test (it may have been moved).') : 'You are not allowed to edit this test.'];
		};

		$updated = 0;
		$perId = [];

		$db->startTransaction();


		foreach ($targets as $testId) {
			$testId = (int)$testId;

			// live permission check
			[$allowed, $denyMsg] = $canEditNow($testId);
			if (!$allowed) {
				$perId[$testId] = ['ok' => false, 'msg' => $denyMsg];
				continue;
			}
			$row = $db->fetchRow('SELECT id, active, options, skin, structure FROM tests WHERE id=? LIMIT 1', [$testId]);
			if (($row['rows'] ?? 0) === 0) {
				$perId[$testId] = ['ok' => false, 'msg' => $uiLang->translate('Test no longer exists.')];
				continue;
			}

			// Current state
			$cur = $row['data'];
			$optJson = $cur['options'] ?? '';
			$optArr = json_decode($optJson, true);
			if (!is_array($optArr)) $optArr = [];

			// Ensure sub-objects exist for safe merge
			if (!isset($optArr['restrictions']) || !is_array($optArr['restrictions'])) $optArr['restrictions'] = [];
			if (!array_key_exists('dateRange', $optArr['restrictions'])) $optArr['restrictions']['dateRange'] = false;
			if (!array_key_exists('timeRestriction', $optArr['restrictions'])) $optArr['restrictions']['timeRestriction'] = false;
			if (!array_key_exists('testDays', $optArr['restrictions'])) $optArr['restrictions']['testDays'] = false;

			$skinJson = $cur['skin'] ?? '';
			$skinArr = json_decode($skinJson, true);
			if (!is_array($skinArr)) $skinArr = [];

			// Build modifications
			$updates = [];
			$params = [];

			$optionsTouched = false;
			$skinTouched = false;
			$activeNew = null; // null = keep

			if ($bulkStructureState !== null) {
				$structureArr = json_decode($cur['structure'] ?? '', true);
				if (!is_array($structureArr)) {
					$perId[$testId] = ['ok' => false, 'msg' => $uiLang->translate('The test structure could not be read.')];
					continue;
				}
				$currentStructureState = tmNormalizeTestState($structureArr['state'] ?? 'draft');
				if ($currentStructureState !== $bulkStructureState) {
					if ($bulkStructureState === 'published') {
						$invalidPages = tmInvalidCompiledPages($structureArr, $db);
						if (!empty($invalidPages)) {
							$page = $invalidPages[0];
							$pageLabel = $page['name'] . (($page['itemCode'] ?? '') !== '' ? ' [' . $page['itemCode'] . ']' : '');
							$perId[$testId] = ['ok' => false, 'msg' => $uiLang->translate('Content is missing.') . ' ' . htmlspecialchars($pageLabel, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')];
							continue;
						}
						$locks = tmActivePageEditLocks(tmExtractPageIdsForPublishLockCheck($structureArr, $db), $db);
						if (!empty($locks)) {
							$lock = $locks[0];
							$pageLabel = $lock['name'] . (($lock['code'] ?? '') !== '' ? ' [' . $lock['code'] . ']' : '');
							$perId[$testId] = ['ok' => false, 'msg' => $uiLang->translate('This test cannot be published because a page is currently being edited.') . ' ' . htmlspecialchars($pageLabel, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . ' - ' . htmlspecialchars($lock['userName'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')];
							continue;
						}
					}
					$structureArr['state'] = $bulkStructureState;
					$updates[] = 'structure=?';
					$params[] = json_encode($structureArr, JSON_UNESCAPED_UNICODE);
					if ($bulkStructureState === 'published') {
						tmPublishMutationChildren($structureArr, $db);
					}
				}
			}

			// VALIDITY
			if (isset($changes['validity']) && is_array($changes['validity'])) {
				$v = $changes['validity'];

				if (array_key_exists('onOffSwitch', $v)) {
					$activeNew = $asBool($v['onOffSwitch']) ? 1 : 0;
				}
				if (array_key_exists('dateRange', $v)) {
					$dr = $v['dateRange'];
					if ($dr === false) {
						$optArr['restrictions']['dateRange'] = false;
					} else {
						$optArr['restrictions']['dateRange'] = [
							'start' => (string)$dr['start'],
							'end' => ($dr['end'] === false ? false : (string)$dr['end'])
						];
					}
					$optionsTouched = true;
				}
				if (array_key_exists('timeRestriction', $v)) {
					$tr = $v['timeRestriction'];
					if ($tr === false) {
						$optArr['restrictions']['timeRestriction'] = false;
					} else {
						$optArr['restrictions']['timeRestriction'] = [
							'start' => (string)$tr['start'],
							'end' => (string)$tr['end']
						];
					}
					$optionsTouched = true;
				}
				if (array_key_exists('testDays', $v)) {
					$td = $v['testDays'];
					if ($td === false) {
						$optArr['restrictions']['testDays'] = false;
					} else {
						$optArr['restrictions']['testDays'] = [
							'days' => (string)$td['days']
						];
					}
					$optionsTouched = true;
				}
				if (array_key_exists('forceLogoff', $v)) {
					$optArr['forceLogoff'] = $asBool($v['forceLogoff']);
					$optionsTouched = true;
				}
			}

			// TIMER
			if (isset($changes['timer']) && is_array($changes['timer'])) {
				$t = $changes['timer'];
				if (array_key_exists('useTimer', $t)) {
					$optArr['useTimer'] = $asBool($t['useTimer']);
					$optionsTouched = true;
				}
				if (array_key_exists('timeLimit', $t)) {
					$optArr['timeLimit'] = $asInt($t['timeLimit'], 0, 999);
					$optionsTouched = true;
				}
			}

			// MISC
			if (isset($changes['misc']) && is_array($changes['misc'])) {
				foreach ($changes['misc'] as $k => $val) {
					$optArr[$k] = $asBool($val);
				}
				$optionsTouched = true;
			}

			// LANGUAGES
			if (isset($changes['languages']) && is_array($changes['languages'])) {
				foreach ($changes['languages'] as $k => $val) {
					$optArr[$k] = $asBool($val); // add/overwrite DE/EN/FR/LU...
				}
				$optionsTouched = true;
			}

			// SKIN (separate column)
			if (isset($changes['skin']) && is_array($changes['skin'])) {
				$s = $changes['skin'];
				$name = $s['name'] ?? null;
				$opts = $s['options'] ?? [];

				if ($name !== null) {
					$skinArr['skin'] = (string)$name;
				}
				if (!isset($skinArr['skinOptions']) || !is_array($skinArr['skinOptions'])) {
					$skinArr['skinOptions'] = [];
				}
				foreach ($opts as $k => $val) {
					$skinArr['skinOptions'][$k] = $val; // overwrite/add
				}
				$skinTouched = true;
			}

			// Collect UPDATE parts (write only what changed)
			if ($optionsTouched) {
				$updates[] = 'options=?';
				$params[] = json_encode($optArr, JSON_UNESCAPED_UNICODE);
			}
			if ($skinTouched) {
				$updates[] = 'skin=?';
				$params[] = json_encode($skinArr, JSON_UNESCAPED_UNICODE);
			}
			if ($activeNew !== null) {
				$updates[] = 'active=?';
				$params[] = $activeNew;
			}

			if (!empty($updates)) {
				$params[] = $testId;
				$sql = 'UPDATE tests SET ' . implode(', ', $updates) . ' WHERE id=?';
				$db->prepare($sql);
				$db->executePrepared($params);

				$updated++;
				registerActivity($db, (int)$myAuth->userid, $testId, 'test');
				$perId[$testId] = ['ok' => true];
			} else {
				// nothing to do (e.g., all sections omitted by payload)
				$perId[$testId] = ['ok' => true, 'msg' => 'no-op'];
			}
		}

		$db->commit();

		$returnData['ok'] = true;
		$returnData['action']  = 'saveTestBulk';
		$returnData['updated'] = $updated;
		$returnData['perId']   = $perId;
		$returnData['reloadFolder'] = true; // lets ajaxSuccess reload if you want to keep that path

		// Build human-readable “changes” lines
		$targetCount = count($targets);
		$failCount   = 0;
		foreach ($perId as $id => $r) {
			if (isset($r['ok']) && $r['ok'] === false) $failCount++;
		}

		$chg = [];
		$chg[] = sprintf($uiLang->translate('Selected tests: %d'), $targetCount);
		$chg[] = sprintf($uiLang->translate('Successfully updated: %d'), $updated);
		$chg[] = sprintf($uiLang->translate('Skipped/failed: %d'), $failCount);

		// Optional: show which sections were present in this batch (just a high-level echo)
		$sections = array_keys($changes);
		if (!empty($sections)) {
			$chg[] = $uiLang->translate('Changed sections: ') . implode(', ', $sections);
		}
		$returnData['changes'] = $chg;

		// Build warnings list from failures
		$warn = [];
		foreach ($perId as $id => $r) {
			if (isset($r['ok']) && $r['ok'] === false) {
				$msg = !empty($r['msg']) ? $r['msg'] : $uiLang->translate('Could not update.');
				$warn[] = ['message' => sprintf('#%d — %s', $id, $msg)];
			}
		}
		$returnData['warnings'] = $warn;
	}


	function fetchMetaTemplates(array $data, rixPDO &$db, array &$returnData, string $metaKey, string $returnIndex): void
	{
		global $permAuth, $myAuth;
		/* @var $db rixPDO */

		checkParams($data, array('languages'));

		$languages = $data['languages'];
		$excludeTestId = max(0, (int)($data['targetTestId'] ?? 0));
		if (!is_array($languages)) {
			$languages = array();
		}

		$templates = array();

		// Only tests that have some metadata at all
		$query = "SELECT id, name, metadata, parent
              FROM tests
              WHERE metadata IS NOT NULL AND (? = 0 OR id <> ?)";
		$results = $db->fetchTable($query, array($excludeTestId, $excludeTestId));

		if ($results['rows'] > 0) {

			foreach ($results['data'] as $row) {

				// --- Permission check: same logic as dashboard for tests ---
				$hasAccess = false;

				if ($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin()) {
					$hasAccess = true;
				} else {
					$parentFolderId = (int)$row['parent'];

					$hasAccess =
						$permAuth->getAccessVal("tests", "fetchLibrary", "itemObject", $parentFolderId)
						|| ownsFolder('testFolders', $parentFolderId, $db, $myAuth); // owner override on folder
				}

				if (!$hasAccess) {
					continue;
				}

				// --- Metadata / block presence check ---
				$metaRaw = $row['metadata'] ?? '';
				$meta = json_decode($metaRaw, true);
				if (json_last_error() !== JSON_ERROR_NONE || !is_array($meta)) {
					continue;
				}

				if (!isset($meta[$metaKey]) || !is_array($meta[$metaKey])) {
					continue;
				}

				// Require at least one non-empty language among the requested languages
				$hasContent = false;
				foreach ($languages as $langKey) {
					$val = $meta[$metaKey][$langKey] ?? '';
					if (is_string($val) && trim($val) !== '') {
						$hasContent = true;
						break;
					}
				}
				if (!$hasContent) {
					continue;
				}

				// Build subset for requested languages
				$block = array();
				foreach ($languages as $langKey) {
					$block[$langKey] = $meta[$metaKey][$langKey] ?? '';
				}

				// pass through customCSS, if present
				if (isset($meta[$metaKey]['customCSS'])) {
					$block['customCSS'] = $meta[$metaKey]['customCSS'];
				}

				$templates[] = array(
					'id'   => (int)$row['id'],
					'name' => $row['name'],
					$metaKey => $block
				);
			}
		}

		// Alphabetical order by test name (case-insensitive)
		usort($templates, static function ($a, $b) {
			return strcasecmp($a['name'], $b['name']);
		});

		$returnData['data'][$returnIndex] = $templates;
	}

	function tmCanAccessEditorEntryTemplate(array $testRow, rixPDO &$db): bool
	{
		global $permAuth, $myAuth;

		if ($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin()) {
			return true;
		}

		$parentFolderId = (int)($testRow['parent'] ?? 0);
		return $parentFolderId > 0 && (
			$permAuth->getAccessVal('tests', 'fetchLibrary', 'itemObject', $parentFolderId)
			|| ownsFolder('testFolders', $parentFolderId, $db, $myAuth)
		);
	}

	function tmCanModifyTest(array $testRow, rixPDO &$db): bool
	{
		global $permAuth, $myAuth;

		if ($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin()) {
			return true;
		}

		$parentFolderId = (int)($testRow['parent'] ?? 0);
		return $parentFolderId > 0 && (
			$permAuth->getAccessVal('tests', 'saveTest', 'itemObject', $parentFolderId)
			|| ownsFolder('testFolders', $parentFolderId, $db, $myAuth)
		);
	}

	function tmCanReadItemGroup(array $groupRow, rixPDO &$db): bool
	{
		global $myAuth;

		if ($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin()) {
			return true;
		}

		$groupId = (int)($groupRow['groupId'] ?? $groupRow['id'] ?? 0);
		$groupOwner = (int)($groupRow['groupOwner'] ?? $groupRow['owner'] ?? 0);
		if ($groupId > 0 && $groupOwner > 0 && $groupOwner === (int)$myAuth->userid) {
			return true;
		}

		$parentFolderId = (int)($groupRow['groupParent'] ?? $groupRow['parent'] ?? 0);
		if ($parentFolderId <= 0) {
			return false;
		}

		$folderOwner = (int)($db->fetchValue('SELECT owner FROM itemFolders WHERE id=? LIMIT 1', [$parentFolderId])['data'] ?? 0);
		if ($folderOwner > 0 && $folderOwner === (int)$myAuth->userid) {
			return true;
		}

		foreach ($myAuth->usergroup as $userGroupId) {
			$canOpenFolder = $db->fetchValue(
				"SELECT JSON_EXTRACT(accessDef, '$.items.fetchItemLibrary') FROM itemFolderAccess WHERE userGroupId=? AND folderId=?",
				[$userGroupId, $parentFolderId]
			)['data'] ?? false;
			$canOpenGroup = $db->fetchValue(
				"SELECT JSON_EXTRACT(accessDef, '$.items.fetchItemGroup') FROM itemFolderAccess WHERE userGroupId=? AND folderId=?",
				[$userGroupId, $parentFolderId]
			)['data'] ?? false;
			if ($canOpenFolder === true || $canOpenFolder === 'true' || $canOpenGroup === true || $canOpenGroup === 'true') {
				return true;
			}
		}

		return false;
	}

	function tmValidateLinearStructurePageAccess(array $structureItems, rixPDO &$db, array &$returnData): bool
	{
		global $uiLang;

		$pageIds = array_values(array_unique(array_filter(array_map(static function ($item): int {
			return (int)($item['hiddenID'] ?? 0);
		}, $structureItems))));

		if (empty($pageIds)) {
			return true;
		}

		$placeholders = implode(',', array_fill(0, count($pageIds), '?'));
		$pageRows = $db->fetchTable(
			"SELECT items.id, itemGroups.id AS groupId, itemGroups.parent AS groupParent, itemGroups.owner AS groupOwner FROM items INNER JOIN itemGroups ON itemGroups.id = items.groupId WHERE items.id IN ($placeholders)",
			$pageIds
		)['data'] ?? array();

		$pageMap = array();
		foreach ($pageRows as $pageRow) {
			$pageMap[(int)$pageRow['id']] = $pageRow;
		}

		foreach ($pageIds as $pageId) {
			if (!isset($pageMap[$pageId])) {
				continue;
			}
			if (!tmCanReadItemGroup($pageMap[$pageId], $db)) {
				$returnData['error'] = $uiLang->translate('The test structure contains at least one test page you do not have read access to. The structure was not saved.');
				$returnData['reloadTest'] = true;
				return false;
			}
		}

		return true;
	}

	function fetchLinearStructureTemplates($data, &$db, &$returnData): void
	{
		/* @var $db rixPDO */
		$targetTestId = isset($data['targetTestId']) ? (int)$data['targetTestId'] : 0;
		$rows = $db->fetchTable('SELECT id, name, parent, structure FROM tests ORDER BY name');
		$templates = array();

		foreach (($rows['data'] ?? array()) as $row) {
			$testId = (int)$row['id'];
			if ($testId === $targetTestId || !tmCanAccessEditorEntryTemplate($row, $db)) {
				continue;
			}

			$structure = json_decode($row['structure'] ?? '', true);
			if (!is_array($structure) || ($structure['type'] ?? 'linear') !== 'linear') {
				continue;
			}

			$structureItems = is_array($structure['items'] ?? null) ? $structure['items'] : array();
			if (empty($structureItems)) {
				continue;
			}

			$pageIds = array_values(array_unique(array_filter(array_map(static function ($item): int {
				return (int)($item['hiddenID'] ?? 0);
			}, $structureItems))));
			$pageMap = array();
			if (!empty($pageIds)) {
				$placeholders = implode(',', array_fill(0, count($pageIds), '?'));
				$pageRows = $db->fetchTable(
					"SELECT items.id, items.name, items.itemCode, itemGroups.id AS groupId, itemGroups.name AS itemGroup, itemGroups.parent AS groupParent, itemGroups.owner AS groupOwner FROM items INNER JOIN itemGroups ON itemGroups.id = items.groupId WHERE items.id IN ($placeholders)",
					$pageIds
				)['data'] ?? array();
				foreach ($pageRows as $pageRow) {
					$pageMap[(int)$pageRow['id']] = $pageRow;
				}
			}

			$scoreSummary = array();
			try {
				$testScoring = new OasysScoring($testId, $db);
				$scoreSummary = $testScoring->getMaxPageScoreSummary();
			} catch (Exception $e) {
				$scoreSummary = array();
			}

			$templatePages = array();
			foreach ($structureItems as $item) {
				$pageId = (int)($item['hiddenID'] ?? 0);
				if ($pageId <= 0) {
					continue;
				}
				if (isset($pageMap[$pageId])) {
					$page = $pageMap[$pageId];
					$canReadPage = tmCanReadItemGroup($page, $db);
					$templatePages[] = array(
						'hiddenID' => $pageId,
						'name' => $canReadPage ? (string)$page['name'] : '',
						'code' => $canReadPage ? (string)($page['itemCode'] ?? '') : '',
						'itemGroup' => $canReadPage ? (string)($page['itemGroup'] ?? '') : '',
						'maxScore' => $canReadPage ? ($scoreSummary[$pageId] ?? 0) : 0,
						'exists' => true,
						'canRead' => $canReadPage
					);
				} else {
					$templatePages[] = array(
						'hiddenID' => $pageId,
						'name' => '',
						'code' => '',
						'itemGroup' => '',
						'maxScore' => 0,
						'exists' => false,
						'canRead' => false
					);
				}
			}

			$templates[] = array(
				'id' => $testId,
				'name' => (string)$row['name'],
				'pages' => $templatePages
			);
		}

		$returnData['data']['linearStructureTemplates'] = $templates;
	}

	function importLinearStructureFromTemplate($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth;
		/* @var $db rixPDO */
		checkParams($data, array('targetTestId', 'sourceTestId', 'pageIds'));

		if (!is_array($data['pageIds'])) {
			$returnData['error'] = $uiLang->translate('Invalid structure import request.');
			return;
		}

		$targetTestId = (int)$data['targetTestId'];
		$sourceTestId = (int)$data['sourceTestId'];
		if ($targetTestId <= 0 || $sourceTestId <= 0 || $targetTestId === $sourceTestId) {
			$returnData['error'] = $uiLang->translate('Please select a different source test.');
			return;
		}

		$targetResult = $db->fetchRow('SELECT id, parent, structure, labels, skin FROM tests WHERE id=? LIMIT 1', [$targetTestId]);
		$sourceResult = $db->fetchRow('SELECT id, parent, structure FROM tests WHERE id=? LIMIT 1', [$sourceTestId]);
		if (($targetResult['rows'] ?? 0) === 0 || ($sourceResult['rows'] ?? 0) === 0) {
			$returnData['error'] = $uiLang->translate('The selected test is no longer available.');
			return;
		}

		$target = $targetResult['data'];
		$source = $sourceResult['data'];
		if (!tmCanModifyTest($target, $db) || !tmCanAccessEditorEntryTemplate($source, $db)) {
			$returnData['error'] = $uiLang->translate('You do not have permission to import this test structure.');
			return;
		}

		$targetStructure = json_decode($target['structure'] ?? '', true);
		$sourceStructure = json_decode($source['structure'] ?? '', true);
		if (!is_array($targetStructure) || ($targetStructure['type'] ?? 'linear') !== 'linear' || !is_array($sourceStructure) || ($sourceStructure['type'] ?? 'linear') !== 'linear') {
			$returnData['error'] = $uiLang->translate('Only linear test structures can be imported here.');
			return;
		}
		if (tmNormalizeTestState($targetStructure['state'] ?? 'draft') === 'published') {
			$returnData['error'] = $uiLang->translate('This test is Published (Locked). The test structure cannot be changed while the test is locked.');
			return;
		}

		$requestedPageIds = array_values(array_unique(array_filter(array_map('intval', $data['pageIds']))));
		if (empty($requestedPageIds)) {
			$returnData['error'] = $uiLang->translate('No test pages were selected.');
			return;
		}

		$sourceItemsById = array();
		foreach (($sourceStructure['items'] ?? array()) as $item) {
			$pageId = (int)($item['hiddenID'] ?? 0);
			if ($pageId > 0) {
				$sourceItemsById[$pageId] = $item;
			}
		}
		foreach ($requestedPageIds as $pageId) {
			if (!isset($sourceItemsById[$pageId])) {
				$returnData['error'] = $uiLang->translate('The structure import contains a page that is not part of the selected source test.');
				return;
			}
		}

		$existingIds = array();
		foreach (($targetStructure['items'] ?? array()) as $item) {
			$pageId = (int)($item['hiddenID'] ?? 0);
			if ($pageId > 0) {
				$existingIds[$pageId] = true;
			}
		}

		$placeholders = implode(',', array_fill(0, count($requestedPageIds), '?'));
		$pageRows = $db->fetchTable(
			"SELECT items.id, itemGroups.id AS groupId, itemGroups.parent AS groupParent, itemGroups.owner AS groupOwner FROM items INNER JOIN itemGroups ON itemGroups.id = items.groupId WHERE items.id IN ($placeholders)",
			$requestedPageIds
		)['data'] ?? array();
		$pageMap = array();
		foreach ($pageRows as $pageRow) {
			$pageMap[(int)$pageRow['id']] = $pageRow;
		}

		$labels = json_decode($target['labels'] ?? '', true);
		$defaultLabel = null;
		if (is_array($labels)) {
			foreach ($labels as $labelId => $labelData) {
				if (($labelData['default'] ?? 'no') === 'yes') {
					$defaultLabel = $labelId;
					break;
				}
			}
		}

		$imported = 0;
		$skippedMissing = 0;
		$skippedDuplicate = 0;
		foreach ($requestedPageIds as $pageId) {
			if (isset($existingIds[$pageId])) {
				$skippedDuplicate++;
				continue;
			}
			if (!isset($pageMap[$pageId])) {
				$skippedMissing++;
				continue;
			}
			if (!tmCanReadItemGroup($pageMap[$pageId], $db)) {
				$returnData['error'] = $uiLang->translate('One or more selected test pages cannot be imported because you do not have read access to them.');
				return;
			}

			$newEntry = array(
				'hiddenID' => $pageId,
				'overrides' => new stdClass(),
				'scripts' => new stdClass()
			);
			if ($defaultLabel !== null) {
				$newEntry['labelID'] = $defaultLabel;
			}
			$targetStructure['items'][] = $newEntry;
			$existingIds[$pageId] = true;
			$imported++;
		}

		if ($imported === 0) {
			$returnData['error'] = $uiLang->translate('No test pages were imported. Missing pages and pages already in the test were skipped.');
			return;
		}

		$db->prepare('UPDATE tests SET structure=? WHERE id=?');
		$db->executePrepared([json_encode($targetStructure), $targetTestId]);
		registerActivity($db, (int)$myAuth->userid, $targetTestId, 'test');

		$returnData['importedCount'] = $imported;
		$returnData['skippedMissing'] = $skippedMissing;
		$returnData['skippedDuplicate'] = $skippedDuplicate;
		$returnData['reloadTest'] = true;
	}

	function tmDecodeTestpoolItems(?string $json): array
	{
		$structure = json_decode($json ?? '', true);
		return is_array($structure) && is_array($structure['items'] ?? null) ? $structure['items'] : array();
	}

	function tmTestpoolPageDetails(array $poolItems, rixPDO &$db): array
	{
		$pageIds = array_values(array_unique(array_filter(array_map(static function ($item): int {
			return (int)($item['hiddenID'] ?? 0);
		}, $poolItems))));

		$pageMap = array();
		if (!empty($pageIds)) {
			$placeholders = implode(',', array_fill(0, count($pageIds), '?'));
			$pageRows = $db->fetchTable(
				"SELECT items.id, items.name, items.itemCode, itemGroups.id AS groupId, itemGroups.name AS itemGroup, itemGroups.parent AS groupParent, itemGroups.owner AS groupOwner FROM items INNER JOIN itemGroups ON itemGroups.id = items.groupId WHERE items.id IN ($placeholders)",
				$pageIds
			)['data'] ?? array();
			foreach ($pageRows as $pageRow) {
				$pageMap[(int)$pageRow['id']] = $pageRow;
			}
		}

		$pages = array();
		$importableItems = array();
		$importablePageCount = 0;
		$missingPageCount = 0;
		$blockedPageCount = 0;
		foreach ($poolItems as $item) {
			$pageId = (int)($item['hiddenID'] ?? 0);
			if ($pageId <= 0) {
				continue;
			}
			if (!isset($pageMap[$pageId])) {
				$missingPageCount++;
				$pages[] = array(
					'hiddenID' => $pageId,
					'name' => '',
					'code' => '',
					'itemGroup' => '',
					'exists' => false,
					'canRead' => false
				);
				continue;
			}

			$page = $pageMap[$pageId];
			$canRead = tmCanReadItemGroup($page, $db);
			$pages[] = array(
				'hiddenID' => $pageId,
				'name' => $canRead ? (string)$page['name'] : '',
				'code' => $canRead ? (string)($page['itemCode'] ?? '') : '',
				'itemGroup' => $canRead ? (string)($page['itemGroup'] ?? '') : '',
				'exists' => true,
				'canRead' => $canRead
			);
			if (!$canRead) {
				$blockedPageCount++;
				continue;
			}

			$cleanItem = $item;
			$cleanItem['hiddenID'] = $pageId;
			unset($cleanItem['name'], $cleanItem['code'], $cleanItem['type'], $cleanItem['itemGroup']);
			if (isset($cleanItem['actionButton'])) {
				if (!isset($cleanItem['scripts'])) {
					$cleanItem['scripts'] = $cleanItem['actionButton'];
				}
				unset($cleanItem['actionButton']);
			}
			$importableItems[] = $cleanItem;
			$importablePageCount++;
		}

		return array(
			'pages' => $pages,
			'importableItems' => $importableItems,
			'importablePageCount' => $importablePageCount,
			'missingPageCount' => $missingPageCount,
			'blockedPageCount' => $blockedPageCount
		);
	}

	function fetchFluidTestpoolTemplates($data, &$db, &$returnData): void
	{
		/* @var $db rixPDO */
		$targetTestId = isset($data['targetTestId']) ? (int)$data['targetTestId'] : 0;
		$rows = $db->fetchTable('SELECT id, name, parent, structure FROM tests ORDER BY name');
		$templates = array();

		foreach (($rows['data'] ?? array()) as $row) {
			$testId = (int)$row['id'];
			if ($testId === $targetTestId || !tmCanAccessEditorEntryTemplate($row, $db)) {
				continue;
			}
			$structure = json_decode($row['structure'] ?? '', true);
			if (!is_array($structure) || ($structure['type'] ?? 'linear') !== 'fluid') {
				continue;
			}

			$poolRows = $db->fetchTable('SELECT id, name, structure FROM testPools WHERE testID=? ORDER BY name', array($testId))['data'] ?? array();
			if (empty($poolRows)) {
				continue;
			}

			$templatePools = array();
			foreach ($poolRows as $poolRow) {
				$details = tmTestpoolPageDetails(tmDecodeTestpoolItems($poolRow['structure'] ?? ''), $db);
				$templatePools[] = array(
					'id' => (int)$poolRow['id'],
					'name' => (string)$poolRow['name'],
					'pages' => $details['pages'],
					'importablePageCount' => $details['importablePageCount'],
					'missingPageCount' => $details['missingPageCount'],
					'blockedPageCount' => $details['blockedPageCount']
				);
			}

			$templates[] = array(
				'id' => $testId,
				'name' => (string)$row['name'],
				'pools' => $templatePools
			);
		}

		$returnData['data']['fluidTestpoolTemplates'] = $templates;
	}

	function importFluidTestpoolsFromTemplate($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth;
		/* @var $db rixPDO */
		checkParams($data, array('targetTestId', 'sourceTestId', 'poolIds'));

		if (!is_array($data['poolIds'])) {
			$returnData['error'] = $uiLang->translate('Invalid testpool import request.');
			return;
		}

		$targetTestId = (int)$data['targetTestId'];
		$sourceTestId = (int)$data['sourceTestId'];
		if ($targetTestId <= 0 || $sourceTestId <= 0 || $targetTestId === $sourceTestId) {
			$returnData['error'] = $uiLang->translate('Please select a different source test.');
			return;
		}

		$poolIds = array_values(array_unique(array_filter(array_map('intval', $data['poolIds']))));
		if (empty($poolIds)) {
			$returnData['error'] = $uiLang->translate('No testpools were selected.');
			return;
		}

		$targetResult = $db->fetchRow('SELECT id, parent, structure FROM tests WHERE id=? LIMIT 1', array($targetTestId));
		$sourceResult = $db->fetchRow('SELECT id, parent, structure FROM tests WHERE id=? LIMIT 1', array($sourceTestId));
		if (($targetResult['rows'] ?? 0) === 0 || ($sourceResult['rows'] ?? 0) === 0) {
			$returnData['error'] = $uiLang->translate('The selected test is no longer available.');
			return;
		}

		$target = $targetResult['data'];
		$source = $sourceResult['data'];
		if (!tmCanModifyTest($target, $db) || !tmCanAccessEditorEntryTemplate($source, $db)) {
			$returnData['error'] = $uiLang->translate('You do not have permission to import testpools from the selected test.');
			return;
		}

		$targetStructure = json_decode($target['structure'] ?? '', true);
		$sourceStructure = json_decode($source['structure'] ?? '', true);
		if (!is_array($targetStructure) || ($targetStructure['type'] ?? 'linear') !== 'fluid' || !is_array($sourceStructure) || ($sourceStructure['type'] ?? 'linear') !== 'fluid') {
			$returnData['error'] = $uiLang->translate('Only fluid testpools can be imported here.');
			return;
		}
		tmAbortIfPublishedTestRow($target, $returnData, 'This test is Published (Locked). Test pools cannot be changed while the test is locked.');

		$targetPoolRows = $db->fetchTable('SELECT name FROM testPools WHERE testID=?', array($targetTestId))['data'] ?? array();
		$targetPoolNames = array();
		foreach ($targetPoolRows as $targetPoolRow) {
			$targetPoolNames[mb_strtolower((string)$targetPoolRow['name'])] = true;
		}

		$placeholders = implode(',', array_fill(0, count($poolIds), '?'));
		$params = array_merge(array($sourceTestId), $poolIds);
		$sourcePools = $db->fetchTable(
			"SELECT id, name, structure FROM testPools WHERE testID=? AND id IN ($placeholders) ORDER BY name",
			$params
		)['data'] ?? array();
		if (count($sourcePools) !== count($poolIds)) {
			$returnData['error'] = $uiLang->translate('One or more selected testpools are no longer available.');
			return;
		}

		$importedCount = 0;
		$skippedConflict = 0;
		$skippedUnavailable = 0;
		$skippedMissingPages = 0;
		$skippedBlockedPages = 0;
		$firstImportedId = null;
		foreach ($sourcePools as $sourcePool) {
			$poolName = (string)$sourcePool['name'];
			$nameKey = mb_strtolower($poolName);
			if (isset($targetPoolNames[$nameKey])) {
				$skippedConflict++;
				continue;
			}

			$details = tmTestpoolPageDetails(tmDecodeTestpoolItems($sourcePool['structure'] ?? ''), $db);
			$skippedMissingPages += $details['missingPageCount'];
			$skippedBlockedPages += $details['blockedPageCount'];
			if (empty($details['importableItems'])) {
				$skippedUnavailable++;
				continue;
			}

			$db->insert('testPools', array(array(
				'testID' => $targetTestId,
				'name' => $poolName,
				'structure' => json_encode(array('items' => $details['importableItems']))
			)));
			$result = $db->results();
			$newPoolId = (int)($result['id'] ?? 0);
			if ($firstImportedId === null && $newPoolId > 0) {
				$firstImportedId = $newPoolId;
			}
			$targetPoolNames[$nameKey] = true;
			$importedCount++;
		}

		if ($importedCount === 0) {
			$returnData['error'] = $uiLang->translate('No testpools were imported. Testpools with the same name, missing pages or inaccessible pages were skipped.');
			return;
		}

		$result = $db->fetchTable('SELECT * FROM testPools WHERE testID=? ORDER BY name', array($targetTestId));
		$returnData['testpools'] = $result['data'] ?? array();
		$returnData['id'] = $firstImportedId;
		$returnData['importedCount'] = $importedCount;
		$returnData['skippedConflict'] = $skippedConflict;
		$returnData['skippedUnavailable'] = $skippedUnavailable;
		$returnData['skippedMissingPages'] = $skippedMissingPages;
		$returnData['skippedBlockedPages'] = $skippedBlockedPages;

		registerActivity($db, (int)$myAuth->userid, $targetTestId, 'test');
	}

	function tmLinearTestPreviewPages(array $structureItems, rixPDO &$db): array
	{
		$pageIds = array_values(array_unique(array_filter(array_map(static function ($item): int {
			return (int)($item['hiddenID'] ?? 0);
		}, $structureItems))));

		$pageMap = array();
		if (!empty($pageIds)) {
			$placeholders = implode(',', array_fill(0, count($pageIds), '?'));
			$pageRows = $db->fetchTable(
				"SELECT items.id, items.name, items.itemCode, itemGroups.name AS itemGroup FROM items INNER JOIN itemGroups ON itemGroups.id = items.groupId WHERE items.id IN ($placeholders)",
				$pageIds
			)['data'] ?? array();
			foreach ($pageRows as $pageRow) {
				$pageMap[(int)$pageRow['id']] = $pageRow;
			}
		}

		$pages = array();
		$missingPageCount = 0;
		foreach ($structureItems as $item) {
			$pageId = (int)($item['hiddenID'] ?? 0);
			if ($pageId <= 0) {
				continue;
			}
			if (!isset($pageMap[$pageId])) {
				$missingPageCount++;
				$pages[] = array(
					'hiddenID' => $pageId,
					'name' => '',
					'code' => '',
					'itemGroup' => '',
					'exists' => false
				);
				continue;
			}

			$page = $pageMap[$pageId];
			$pages[] = array(
				'hiddenID' => $pageId,
				'name' => (string)$page['name'],
				'code' => (string)($page['itemCode'] ?? ''),
				'itemGroup' => (string)($page['itemGroup'] ?? ''),
				'exists' => true
			);
		}

		return array(
			'pages' => $pages,
			'missingPageCount' => $missingPageCount
		);
	}

	function tmMutationLinearTestDetails(array $structureItems, array $targetIds, rixPDO &$db): array
	{
		$testIds = array_values(array_unique(array_filter(array_map(static function ($item): int {
			return (int)($item['hiddenID'] ?? 0);
		}, $structureItems))));

		$testMap = array();
		if (!empty($testIds)) {
			$placeholders = implode(',', array_fill(0, count($testIds), '?'));
			$testRows = $db->fetchTable(
				"SELECT id, name, parent, structure FROM tests WHERE id IN ($placeholders)",
				$testIds
			)['data'] ?? array();
			foreach ($testRows as $testRow) {
				$testMap[(int)$testRow['id']] = $testRow;
			}
		}

		$linearTests = array();
		foreach ($structureItems as $item) {
			$testId = (int)($item['hiddenID'] ?? 0);
			if ($testId <= 0) {
				continue;
			}

			if (!isset($testMap[$testId])) {
				$linearTests[] = array(
					'hiddenID' => $testId,
					'name' => '',
					'type' => '',
					'pages' => array(),
					'pageCount' => 0,
					'missingPageCount' => 0,
					'exists' => false,
					'canRead' => false,
					'canEdit' => false,
					'alreadyInTarget' => isset($targetIds[$testId])
				);
				continue;
			}

			$test = $testMap[$testId];
			$canRead = tmCanAccessEditorEntryTemplate($test, $db);
			$canEdit = tmCanModifyTest($test, $db);
			$structure = json_decode($test['structure'] ?? '', true);
			$type = is_array($structure) ? (string)($structure['type'] ?? '') : '';
			$items = is_array($structure['items'] ?? null) ? $structure['items'] : array();
			$pageDetails = ($canRead && $type === 'linear') ? tmLinearTestPreviewPages($items, $db) : array('pages' => array(), 'missingPageCount' => 0);

			$linearTests[] = array(
				'hiddenID' => $testId,
				'name' => (string)$test['name'],
				'type' => $type,
				'pages' => $pageDetails['pages'],
				'pageCount' => $canRead ? count($items) : 0,
				'missingPageCount' => $pageDetails['missingPageCount'],
				'exists' => true,
				'canRead' => $canRead,
				'canEdit' => $canEdit,
				'alreadyInTarget' => isset($targetIds[$testId])
			);
		}

		return $linearTests;
	}

	function fetchMutationStructureTemplates($data, &$db, &$returnData): void
	{
		/* @var $db rixPDO */
		$targetTestId = isset($data['targetTestId']) ? (int)$data['targetTestId'] : 0;
		$targetIds = array();
		if ($targetTestId > 0) {
			$targetResult = $db->fetchRow('SELECT structure FROM tests WHERE id=? LIMIT 1', array($targetTestId));
			if (($targetResult['rows'] ?? 0) > 0) {
				$targetStructure = json_decode($targetResult['data']['structure'] ?? '', true);
				foreach (($targetStructure['items'] ?? array()) as $item) {
					$childId = (int)($item['hiddenID'] ?? 0);
					if ($childId > 0) {
						$targetIds[$childId] = true;
					}
				}
			}
		}

		$rows = $db->fetchTable('SELECT id, name, parent, structure FROM tests ORDER BY name');
		$templates = array();

		foreach (($rows['data'] ?? array()) as $row) {
			$testId = (int)$row['id'];
			if ($testId === $targetTestId || !tmCanAccessEditorEntryTemplate($row, $db)) {
				continue;
			}

			$structure = json_decode($row['structure'] ?? '', true);
			if (!is_array($structure) || ($structure['type'] ?? 'linear') !== 'mutation') {
				continue;
			}

			$structureItems = is_array($structure['items'] ?? null) ? $structure['items'] : array();
			if (empty($structureItems)) {
				continue;
			}

			$templates[] = array(
				'id' => $testId,
				'name' => (string)$row['name'],
				'linearTests' => tmMutationLinearTestDetails($structureItems, $targetIds, $db)
			);
		}

		$returnData['data']['mutationStructureTemplates'] = $templates;
	}

	function importMutationStructureFromTemplate($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth;
		/* @var $db rixPDO */
		checkParams($data, array('targetTestId', 'sourceTestId', 'testIds'));

		if (!is_array($data['testIds'])) {
			$returnData['error'] = $uiLang->translate('Invalid mutation structure import request.');
			return;
		}

		$targetTestId = (int)$data['targetTestId'];
		$sourceTestId = (int)$data['sourceTestId'];
		if ($targetTestId <= 0 || $sourceTestId <= 0 || $targetTestId === $sourceTestId) {
			$returnData['error'] = $uiLang->translate('Please select a different source mutation test.');
			return;
		}

		$requestedTestIds = array_values(array_unique(array_filter(array_map('intval', $data['testIds']))));
		if (empty($requestedTestIds)) {
			$returnData['error'] = $uiLang->translate('No linear tests were selected.');
			return;
		}

		$targetResult = $db->fetchRow('SELECT id, parent, structure FROM tests WHERE id=? LIMIT 1', array($targetTestId));
		$sourceResult = $db->fetchRow('SELECT id, parent, structure FROM tests WHERE id=? LIMIT 1', array($sourceTestId));
		if (($targetResult['rows'] ?? 0) === 0 || ($sourceResult['rows'] ?? 0) === 0) {
			$returnData['error'] = $uiLang->translate('The selected test is no longer available.');
			return;
		}

		$target = $targetResult['data'];
		$source = $sourceResult['data'];
		if (!tmCanModifyTest($target, $db) || !tmCanAccessEditorEntryTemplate($source, $db)) {
			$returnData['error'] = $uiLang->translate('You do not have permission to import linear tests from the selected mutation test.');
			return;
		}

		$targetStructure = json_decode($target['structure'] ?? '', true);
		$sourceStructure = json_decode($source['structure'] ?? '', true);
		if (!is_array($targetStructure) || ($targetStructure['type'] ?? 'linear') !== 'mutation' || !is_array($sourceStructure) || ($sourceStructure['type'] ?? 'linear') !== 'mutation') {
			$returnData['error'] = $uiLang->translate('Only mutation test structures can be imported here.');
			return;
		}

		$sourceIds = array();
		foreach (($sourceStructure['items'] ?? array()) as $item) {
			$childId = (int)($item['hiddenID'] ?? 0);
			if ($childId > 0) {
				$sourceIds[$childId] = true;
			}
		}
		foreach ($requestedTestIds as $testId) {
			if (!isset($sourceIds[$testId])) {
				$returnData['error'] = $uiLang->translate('The import contains a linear test that is not part of the selected source mutation test.');
				return;
			}
		}

		$existingIds = array();
		foreach (($targetStructure['items'] ?? array()) as $item) {
			$childId = (int)($item['hiddenID'] ?? 0);
			if ($childId > 0) {
				$existingIds[$childId] = true;
			}
		}

		$placeholders = implode(',', array_fill(0, count($requestedTestIds), '?'));
		$linearRows = $db->fetchTable(
			"SELECT id, name, parent, structure FROM tests WHERE id IN ($placeholders)",
			$requestedTestIds
		)['data'] ?? array();
		$linearMap = array();
		foreach ($linearRows as $linearRow) {
			$linearMap[(int)$linearRow['id']] = $linearRow;
		}

		$importedCount = 0;
		$skippedDuplicate = 0;
		$skippedMissing = 0;
		$skippedBlocked = 0;
		$skippedInvalidType = 0;
		foreach ($requestedTestIds as $testId) {
			if (isset($existingIds[$testId])) {
				$skippedDuplicate++;
				continue;
			}
			if (!isset($linearMap[$testId])) {
				$skippedMissing++;
				continue;
			}
			if (!tmCanAccessEditorEntryTemplate($linearMap[$testId], $db) || !tmCanModifyTest($linearMap[$testId], $db)) {
				$skippedBlocked++;
				continue;
			}
			$linearStructure = json_decode($linearMap[$testId]['structure'] ?? '', true);
			if (!is_array($linearStructure) || ($linearStructure['type'] ?? '') !== 'linear') {
				$skippedInvalidType++;
				continue;
			}

			$targetStructure['items'][] = array('hiddenID' => $testId);
			$existingIds[$testId] = true;
			$importedCount++;
		}

		if ($importedCount === 0) {
			$returnData['error'] = $uiLang->translate('No linear tests were imported. Missing, inaccessible, invalid or already assigned tests were skipped.');
			return;
		}

		$targetStructure['pointer'] = (int)($targetStructure['pointer'] ?? 0);
		$db->prepare('UPDATE tests SET structure=? WHERE id=?');
		$db->executePrepared(array(json_encode($targetStructure), $targetTestId));
		if (tmNormalizeTestState($targetStructure['state'] ?? 'draft') === 'published') {
			tmPublishMutationChildren($targetStructure, $db);
		}

		$returnData['importedCount'] = $importedCount;
		$returnData['skippedDuplicate'] = $skippedDuplicate;
		$returnData['skippedMissing'] = $skippedMissing;
		$returnData['skippedBlocked'] = $skippedBlocked;
		$returnData['skippedInvalidType'] = $skippedInvalidType;
		$returnData['reloadTest'] = true;

		registerActivity($db, (int)$myAuth->userid, $targetTestId, 'test');
	}

	function tmDecodeEditorEntries(?string $json): array
	{
		$entries = json_decode($json ?? '', true);
		return is_array($entries) ? $entries : array();
	}

	function tmEditorEntryPreview(array $entry, string $entryType): string
	{
		$property = $entryType === 'labels' ? 'button' : 'text';
		$values = $entry[$property] ?? array();
		if (!is_array($values)) {
			return '';
		}

		foreach ($values as $value) {
			if (is_string($value) && trim($value) !== '') {
				return $value;
			}
		}

		return '';
	}

	function tmNormalizeImportedEditorEntry(array $entry, string $entryType): array
	{
		if ($entryType === 'labels') {
			$button = is_array($entry['button'] ?? null) ? $entry['button'] : array();
			$headline = is_array($entry['headline'] ?? null) ? $entry['headline'] : array();
			return array(
				'button' => array_map(static function ($value): string {
					return is_scalar($value) ? (string)$value : '';
				}, $button),
				'headline' => array_map(static function ($value): string {
					return is_scalar($value) ? (string)$value : '';
				}, $headline),
				'default' => 'no'
			);
		}

		$text = is_array($entry['text'] ?? null) ? $entry['text'] : array();
		return array(
			'text' => array_map(static function ($value): string {
				return is_scalar($value) ? (string)$value : '';
			}, $text),
			'global' => !empty($entry['global'])
		);
	}

	function fetchEditorEntryTemplates($data, &$db, &$returnData): void
	{
		global $uiLang;
		/* @var $db rixPDO */
		checkParams($data, array('entryType'));

		$entryType = $data['entryType'];
		if (!in_array($entryType, array('labels', 'variables'), true)) {
			$returnData['error'] = $uiLang->translate('Unsupported editor entry type.');
			return;
		}

		$targetTestId = isset($data['targetTestId']) ? (int)$data['targetTestId'] : 0;
		$rows = $db->fetchTable('SELECT id, name, parent, labels, variables FROM tests ORDER BY name');
		$templates = array();

		foreach (($rows['data'] ?? array()) as $row) {
			if ((int)$row['id'] === $targetTestId || !tmCanAccessEditorEntryTemplate($row, $db)) {
				continue;
			}

			$entries = tmDecodeEditorEntries($row[$entryType] ?? '');
			if (empty($entries)) {
				continue;
			}

			$templateEntries = array();
			foreach ($entries as $name => $entry) {
				if (!is_string($name) || !is_array($entry)) {
					continue;
				}
				$templateEntries[] = array(
					'name' => $name,
					'preview' => tmEditorEntryPreview($entry, $entryType)
				);
			}

			if (empty($templateEntries)) {
				continue;
			}

			usort($templateEntries, static function ($a, $b): int {
				return strcasecmp($a['name'], $b['name']);
			});
			$templates[] = array(
				'id' => (int)$row['id'],
				'name' => (string)$row['name'],
				'entries' => $templateEntries
			);
		}

		$returnData['data']['editorEntryTemplates'] = $templates;
	}

	function importEditorEntries($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth;
		/* @var $db rixPDO */
		checkParams($data, array('testId', 'sourceTestId', 'entryType', 'names'));

		$entryType = $data['entryType'];
		if (!in_array($entryType, array('labels', 'variables'), true) || !is_array($data['names'])) {
			$returnData['error'] = $uiLang->translate('Invalid editor entry import request.');
			return;
		}

		$targetTestId = (int)$data['testId'];
		$sourceTestId = (int)$data['sourceTestId'];
		if ($targetTestId <= 0 || $sourceTestId <= 0 || $targetTestId === $sourceTestId) {
			$returnData['error'] = $uiLang->translate('Please select a different source test.');
			return;
		}

		$targetResult = $db->fetchRow('SELECT id, parent, structure, labels, variables FROM tests WHERE id=? LIMIT 1', array($targetTestId));
		$sourceResult = $db->fetchRow('SELECT id, parent, labels, variables FROM tests WHERE id=? LIMIT 1', array($sourceTestId));
		if (($targetResult['rows'] ?? 0) === 0 || ($sourceResult['rows'] ?? 0) === 0) {
			$returnData['error'] = $uiLang->translate('The selected test is no longer available.');
			return;
		}

		$target = $targetResult['data'];
		$source = $sourceResult['data'];
		if (!tmCanModifyTest($target, $db) || !tmCanAccessEditorEntryTemplate($source, $db)) {
			$returnData['error'] = $uiLang->translate('You do not have permission to use the selected test entries.');
			return;
		}

		$lockMessage = $entryType === 'labels'
			? 'This test is Published (Locked). Labels cannot be changed while the test is locked.'
			: 'This test is Published (Locked). Test variables cannot be changed while the test is locked.';
		tmAbortIfPublishedTestRow($target, $returnData, $lockMessage);

		$sourceEntries = tmDecodeEditorEntries($source[$entryType] ?? '');
		$targetEntries = tmDecodeEditorEntries($target[$entryType] ?? '');
		$replaceExisting = !empty($data['replaceExisting']);
		$names = array_values(array_unique(array_filter($data['names'], static function ($name): bool {
			return is_string($name) && trim($name) !== '' && mb_strlen($name) <= 200;
		})));
		$importedCount = 0;

		foreach ($names as $name) {
			if (!array_key_exists($name, $sourceEntries) || !is_array($sourceEntries[$name])) {
				continue;
			}
			if (array_key_exists($name, $targetEntries) && !$replaceExisting) {
				continue;
			}
			$importedEntry = tmNormalizeImportedEditorEntry($sourceEntries[$name], $entryType);
			if ($entryType === 'labels' && isset($targetEntries[$name]['default'])) {
				$importedEntry['default'] = $targetEntries[$name]['default'] === 'yes' ? 'yes' : 'no';
			}
			$targetEntries[$name] = $importedEntry;
			$importedCount++;
		}

		if ($importedCount === 0) {
			$returnData['error'] = $uiLang->translate('No entries were loaded. Entries with the same name were kept.');
			return;
		}

		$db->prepare('UPDATE tests SET ' . $entryType . '=? WHERE id=?');
		$db->executePrepared(array(json_encode($targetEntries), $targetTestId));
		registerActivity($db, (int)$myAuth->userid, $targetTestId, 'test');

		$returnData['entryType'] = $entryType;
		$returnData['importedCount'] = $importedCount;
		if ($entryType === 'labels') {
			$returnData['labels'] = $targetEntries;
		} else {
			$returnData['refreshData'] = $targetEntries;
		}
	}

	/**
	 * Fetch tests that have a privacy_policy block.
	 */
	function fetchPrivacyTemplates($data, &$db, &$returnData): void
	{
		fetchMetaTemplates(
			is_array($data) ? $data : array(),
			$db,
			$returnData,
			'privacy_policy',
			'privacyTemplates'
		);
	}

	/**
	 * Fetch tests that have a score_screen block.
	 */
	function fetchScoreTemplates($data, &$db, &$returnData): void
	{
		fetchMetaTemplates(
			is_array($data) ? $data : array(),
			$db,
			$returnData,
			'score_screen',
			'scoreTemplates'
		);
	}

	/**
	 * Fetch tests that have a landing_page block.
	 * We include only those with mode=custom and at least one non-empty language
	 * as usable templates for the "Load existing" function.
	 */
	function fetchLandingTemplates($data, &$db, &$returnData): void
	{
		global $permAuth, $myAuth;
		/* @var $db rixPDO */

		checkParams($data, array('languages'));

		$languages = $data['languages'];
		$excludeTestId = max(0, (int)($data['targetTestId'] ?? 0));
		if (!is_array($languages)) {
			$languages = array();
		}

		$templates = array();

		$query = "SELECT id, name, metadata, parent
              FROM tests
              WHERE metadata IS NOT NULL AND (? = 0 OR id <> ?)";
		$results = $db->fetchTable($query, array($excludeTestId, $excludeTestId));

		if (($results['rows'] ?? 0) > 0) {
			foreach ($results['data'] as $row) {

				// --- Permission check: same logic as dashboard for tests ---
				$hasAccess = false;

				if ($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin()) {
					$hasAccess = true;
				} else {
					$parentFolderId = (int)$row['parent'];

					$hasAccess =
						$permAuth->getAccessVal("tests", "fetchLibrary", "itemObject", $parentFolderId)
						|| ownsFolder('testFolders', $parentFolderId, $db, $myAuth);
				}

				if (!$hasAccess) {
					continue;
				}

				// --- Metadata decoding ---
				$metaRaw = $row['metadata'] ?? '';
				$meta = json_decode($metaRaw, true);
				if (json_last_error() !== JSON_ERROR_NONE || !is_array($meta)) {
					continue;
				}

				if (!isset($meta['landing_page']) || !is_array($meta['landing_page'])) {
					continue;
				}

				$landing = $meta['landing_page'];

				$mode = $landing['mode'] ?? 'default';

				// require at least one non-empty language for this to be a useful template
				$hasContent = false;
				foreach ($languages as $langKey) {
					$val = $landing[$langKey] ?? '';
					if (is_string($val) && trim($val) !== '') {
						$hasContent = true;
						break;
					}
				}

				if (!$hasContent || $mode !== 'custom') {
					continue;
				}

				// subset for requested languages
				$page = array();
				foreach ($languages as $langKey) {
					$page[$langKey] = $landing[$langKey] ?? '';
				}

				// include customCSS if present
				if (isset($landing['customCSS'])) {
					$page['customCSS'] = $landing['customCSS'];
				}

				$templates[] = array(
					'id'           => (int)$row['id'],
					'name'         => $row['name'],
					'landing_mode' => $mode,
					'landing_page' => $page
				);
			}
		}

		usort($templates, static function ($a, $b) {
			return strcasecmp($a['name'], $b['name']);
		});

		$returnData['data']['landingTemplates'] = $templates;
	}


	/**
	 * Fetch tests that have a finish_screen or URL block.
	 */
	function fetchFinishTemplates($data, &$db, &$returnData): void
	{
		global $permAuth, $myAuth;
		/* @var $db rixPDO */

		checkParams($data, array('languages'));

		$languages = $data['languages'];
		$excludeTestId = max(0, (int)($data['targetTestId'] ?? 0));
		if (!is_array($languages)) {
			$languages = array();
		}

		$templates = array();

		// Only tests that have some metadata at all
		$query = "SELECT id, name, metadata, parent
              FROM tests
              WHERE metadata IS NOT NULL AND (? = 0 OR id <> ?)";
		$results = $db->fetchTable($query, array($excludeTestId, $excludeTestId));

		if ($results['rows'] > 0) {

			foreach ($results['data'] as $row) {

				// --- Permission check: same logic as dashboard for tests ---
				$hasAccess = false;

				if ($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin()) {
					$hasAccess = true;
				} else {
					$parentFolderId = (int)$row['parent'];

					$hasAccess =
						$permAuth->getAccessVal("tests", "fetchLibrary", "itemObject", $parentFolderId)
						|| ownsFolder('testFolders', $parentFolderId, $db, $myAuth); // owner override on folder
				}

				if (!$hasAccess) {
					continue;
				}

				// --- Metadata decoding ---
				$metaRaw = $row['metadata'] ?? '';
				$meta = json_decode($metaRaw, true);
				if (json_last_error() !== JSON_ERROR_NONE || !is_array($meta)) {
					continue;
				}

				if (!isset($meta['finish_screen']) || !is_array($meta['finish_screen'])) {
					continue;
				}

				$finishScreen = $meta['finish_screen'];

				// options now live directly in finish_screen
				$mode = $finishScreen['mode'] ?? 'default';
				$url  = isset($finishScreen['url']) ? trim((string)$finishScreen['url']) : '';

				// Decide if this test is relevant as a template:
				// - include tests with a custom URL (mode = url and URL not empty)
				// - include tests that have at least one non-empty finish_screen language
				$hasContent = false;

				if (!empty($languages)) {
					foreach ($languages as $langKey) {
						$val = $finishScreen[$langKey] ?? '';
						if (is_string($val) && trim($val) !== '') {
							$hasContent = true;
							break;
						}
					}
				}

				$hasUrlTemplate = ($mode === 'url' && $url !== '');

				if (!$hasContent && !$hasUrlTemplate) {
					continue;
				}

				// Build finish_screen subset for requested languages
				$screen = array();
				foreach ($languages as $langKey) {
					$screen[$langKey] = $finishScreen[$langKey] ?? '';
				}

				if (isset($finishScreen['customCSS'])) {
					$screen['customCSS'] = $finishScreen['customCSS'];
				}

				$templates[] = array(
					'id'            => (int)$row['id'],
					'name'          => $row['name'],
					'finish_mode'   => $mode,
					'finish_url'    => $url,
					'finish_screen' => $screen
				);
			}
		}

		// Alphabetical order by test name (case-insensitive)
		usort($templates, static function ($a, $b) {
			return strcasecmp($a['name'], $b['name']);
		});

		$returnData['data']['finishTemplates'] = $templates;
	}



	function saveSkinAssignment($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth;
		/* @var $db rixPDO */
		checkParams($data, array('id', 'skinData'));

		$id = $data['id'];
		$skinData = $data['skinData'];
		$currentSkin = $skinData['skin'] ?? null;

		// Check if the test is still present
		$query = 'SELECT * FROM tests WHERE id=? LIMIT 1';
		$parameters = array($id);
		$result = $db->fetchRow($query, $parameters);

		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("You are trying to modify a test which has been deleted by another user. The view will be refreshed.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			die();
		}

		// Check for skin conflict
		$skinJson = json_decode($result['data']['skin'] ?? '', true);
		if (empty($data['skinSwitch'])) {
			$oldSkinInDb = $skinJson['skin'] ?? null;
			$currentSkin = $skinData['skin'] ?? null;
			if ($oldSkinInDb !== $currentSkin) {
				$returnData['error'] = $uiLang->translate("You are trying to edit a test where another user has just changed the skin settings. The view will be refreshed.");
				$returnData['closeEditMode'] = true;
				$returnData['reloadFolder'] = true;
				die();
			}
		}

		//Convert skinData to reduced format for storage
		$cleanSkinData = [
			'skin' => $skinData['skin'] ?? null,
			'skinOptions' => []
		];

		if (isset($skinData['skinOptions']) && is_array($skinData['skinOptions'])) {
			foreach ($skinData['skinOptions'] as $key => $option) {
				if (is_array($option) && isset($option['value'])) {
					$cleanSkinData['skinOptions'][$key] = $option['value'];
				} else {
					$cleanSkinData['skinOptions'][$key] = $option;
				}
			}
		}

		$skinDataJson = json_encode($cleanSkinData);
		$db->prepare("UPDATE tests SET skin=? WHERE id=?");
		$db->executePrepared(array($skinDataJson, $id));

		// Delete per-item settings if requested
		if (isset($data['resetSkinOptions']) && $data['resetSkinOptions'] == true) {
			$structureData = json_decode($result['data']['structure'] ?? '', true);
			foreach ($structureData['items'] as $key => $value) {
				$structureData['items'][$key]['overrides'] = [];
			}
			$structureDataJson = json_encode($structureData);
			$db->prepare("UPDATE tests SET structure=? WHERE id=?");
			$db->executePrepared(array($structureDataJson, $id));
		}

		// Re-check default overrides if requested
		if (isset($data['recheckDefaults']) && $data['recheckDefaults'] === true) {
			$structureData = json_decode($result['data']['structure'] ?? '', true);
			foreach ($structureData['items'] as $key => $value) {
				foreach ($skinData['skinOptions'] as $k => $v) {
					$valueToCheck = is_array($v) && isset($v['value']) ? $v['value'] : $v;

					if (
						isset($structureData['items'][$key]['overrides'][$k]) &&
						$structureData['items'][$key]['overrides'][$k] === $valueToCheck
					) {
						unset($structureData['items'][$key]['overrides'][$k]);
					}
				}
			}
			$structureDataJson = json_encode($structureData);
			$db->prepare("UPDATE tests SET structure=? WHERE id=?");
			$db->executePrepared(array($structureDataJson, $id));
		}
		registerActivity($db, (int)$myAuth->userid, $data['id'], 'test');
	}


	function saveNewFluidBlock($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth;
		/* @var $db rixPDO */
		checkParams($data, array('testId', 'itemsUsed', 'itemsOrder', 'poolId'));

		$testId = $data['testId'];
		$poolId = $data['poolId'];
		$itemsUsed = $data['itemsUsed'];
		if ($data['itemsOrder'] == 'random') {
			$random = 1;
		} else {
			$random = 0;
		}

		//Check if the test is still present
		$query = 'SELECT * FROM tests WHERE id=? LIMIT 1';
		$parameters = array($testId);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if selected test is not available anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("You are trying to add a fluid test block to a test which has been deleted by another user. The view will be refreshed.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			die();
		}
		$labelObject = json_decode($result['data']['labels'] ?? '');
		$labelDefault = null;
		//Find default label
		foreach ($labelObject as $key => $value) {
			if ($value->default === 'yes') {
				$labelDefault = $key;
			}
		}
		//End check

		$jsonData = json_decode($result['data']['structure'] ?? '', true);
		if (tmNormalizeTestState($jsonData['state'] ?? 'draft') === 'published') {
			$returnData['error'] = $uiLang->translate('This test is Published (Locked). The fluid test structure cannot be changed while the test is locked.');
			die();
		}

		//Save new fluid test block
		$data = array(array('testID' => $testId, 'poolID' => $poolId, 'numberOfitems' => $itemsUsed, 'random' => $random));
		$db->insert('testFluidStructure', $data);
		$insertResult = $db->results();
		//update structure of the test
		$latestID = $insertResult['id'];

		$structureSave = $jsonData['items'];
		array_push($structureSave, array('hiddenID' => $latestID, 'labelID' => $labelDefault, 'fixedPosition' => false, 'overrides' => new stdClass(), 'scripts' => new stdClass()));
		$structureSaveComplete = array('type' => 'fluid', 'state' => tmNormalizeTestState($jsonData['state'] ?? 'draft'), 'items' => $structureSave);
		$structureSaveComplete = json_encode($structureSaveComplete);

		//save modified test-structure to db
		$db->setAdditionalErrorData(array('closeEditMode' => true, 'reloadFolder' => true));
		$db->prepare("UPDATE tests SET structure=? WHERE id=?");
		$db->executePrepared(array($structureSaveComplete, $testId));
		$db->clearAdditionalErrorData();

		registerActivity($db, (int)$myAuth->userid, $testId, 'test');
	}

	function updateFluidBlocks($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth;
		/* @var $db rixPDO */
		checkParams($data, array('newStructure', 'testId'));

		$newStructure = $data['newStructure'];
		$testId = $data['testId'];

		//Check if the test is still present
		$query = 'SELECT * FROM tests WHERE id=? LIMIT 1';
		$parameters = array($testId);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if selected test is not available anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("You are trying to update a test which has been deleted by another user. The view will be refreshed.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			die();
		}
		$currentStructure = json_decode($result['data']['structure'] ?? '', true);
		$currentState = is_array($currentStructure) ? tmNormalizeTestState($currentStructure['state'] ?? 'draft') : 'draft';
		if ($currentState === 'published') {
			$returnData['error'] = $uiLang->translate('This test is Published (Locked). The fluid test structure cannot be changed while the test is locked.');
			die();
		}
		//Show error message if skin has been changed
		$skinJson = json_decode($result['data']['skin'] ?? '', true);
		$returnData['q1'] = $skinJson['skin'];
		$returnData['q2'] = $data['currentSkin'];
		if ($skinJson['skin'] != $data['currentSkin']) {
			$returnData['error'] = $uiLang->translate("You are trying to edit a test where another user has just changed the skin settings. The view will be refreshed.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			die();
		}
		//End check
		$labelObject = json_decode($result['data']['labels'] ?? '');
		$labelDefault = null;
		//Find default label
		foreach ($labelObject as $key => $value) {
			if ($value->default === 'yes') {
				$labelDefault = $key;
			}
		}

		//Delete fluid block in db if update was a deletion
		if (isset($data['deletedFluidBlock'])) {
			$db->prepare("DELETE FROM testFluidStructure WHERE id=?");
			$db->executePrepared(array($data['deletedFluidBlock']));
		}

		//Save new structure to the test
		for ($i = 0; $i < count($newStructure); $i++) {
			unset($newStructure[$i]['name']);
			unset($newStructure[$i]['itemsUsed']);
			unset($newStructure[$i]['itemsTotal']);
			unset($newStructure[$i]['itemOrder']);
			//Handling label, using default label if not specified
			if (isset($newStructure[$i]['tdid'])) {
				$newStructure[$i]['labelID'] = $newStructure[$i]['tdid'];
				unset($newStructure[$i]['tdid']);
				unset($newStructure[$i]['label']);
			} else {
				$newStructure[$i]['labelID'] = $labelDefault;
			}
			//ActionField (Overrides)
			$newStructure[$i]['overrides'] = $newStructure[$i]['actionField'];
			unset($newStructure[$i]['actionField']);
			//ActionButton (Scripts)
			$newStructure[$i]['scripts'] = $newStructure[$i]['actionButton'];
			unset($newStructure[$i]['actionButton']);
		}

		$structureSave = array('type' => 'fluid', 'state' => $currentState, 'items' => $newStructure);
		$structureSave = json_encode($structureSave);
		//save modified test-structure to db
		$db->setAdditionalErrorData(array('closeEditMode' => true, 'reloadFolder' => true));
		$db->prepare("UPDATE tests SET structure=? WHERE id=?");
		$db->executePrepared(array($structureSave, $testId));
		$db->clearAdditionalErrorData();

		registerActivity($db, (int)$myAuth->userid, $testId, 'test');
	}

	function createLabel($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth;
		/* @var $db rixPDO */
		checkParams($data, array('testId', 'newLabelData'));

		$testId = $data['testId'];
		$newLabelData = $data['newLabelData'];

		//Check if the test is still present
		$query = 'SELECT * FROM tests WHERE id=? LIMIT 1';
		$parameters = array($testId);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if selected test is not available anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("You are trying to add a label to a test which has been deleted by another user. The view will be refreshed.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			die();
		}
		tmAbortIfPublishedTestRow($result['data'], $returnData, 'This test is Published (Locked). Labels cannot be changed while the test is locked.');
		//End check

		$oldLabelObject = json_decode($result['data']['labels'] ?? '');

		$writeName = '';
		$writeButton = new stdClass();
		$writeHeadline = new stdClass();

		foreach ($newLabelData as $key => $value) {
			if ($key === 'labelname') {
				$writeName = $value;
			} else {
				$key = explode("_", $key);
				if ($key[1] === 'button') {
					$writeButton->{$key[0]} = $value;
				} else {
					$writeHeadline->{$key[0]} = $value;
				}
			}
		}

		$oldLabelObject->{$writeName} = new stdClass();
		$oldLabelObject->{$writeName}->headline = $writeHeadline;
		$oldLabelObject->{$writeName}->button = $writeButton;
		$oldLabelObject->{$writeName}->default = 'no';

		$writeJson = json_encode($oldLabelObject);

		//Write udated label to database
		$db->prepare("Update tests set labels=? WHERE id=?");
		$db->executePrepared(array($writeJson, $testId));
		//Re-read labels
		$query = 'SELECT * FROM tests WHERE id=? LIMIT 1';
		$parameters = array($testId);
		$result = $db->fetchRow($query, $parameters);
		$returnData['labels'] = json_decode($result['data']['labels'] ?? '');

		registerActivity($db, (int)$myAuth->userid, $testId, 'test');
	}

	function saveLabel($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth;
		/* @var $db rixPDO */
		checkParams($data, array('testId', 'newLabelData'));

		$labelId = $data['labelId'];
		$testId = $data['testId'];
		$newLabelData = $data['newLabelData'];

		//Check if the test is still present
		$query = 'SELECT * FROM tests WHERE id=? LIMIT 1';
		$parameters = array($testId);
		$result = $db->fetchRow($query, $parameters);

		//Show error message if selected test is not available anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("You are trying to add a label to a test which has been deleted by another user. The view will be refreshed.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			die();
		}
		tmAbortIfPublishedTestRow($result['data'], $returnData, 'This test is Published (Locked). Labels cannot be changed while the test is locked.');
		//End check

		$oldLabelObject = json_decode($result['data']['labels'] ?? '');

		$writeName = '';
		$writeButton = new stdClass();
		$writeHeadline = new stdClass();

		foreach ($newLabelData as $key => $value) {
			if ($key === 'labelname') {
				$writeName = $value;
			} else {
				$key = explode("_", $key);
				if ($key[1] === 'button') {
					$writeButton->{$key[0]} = $value;
				} else {
					$writeHeadline->{$key[0]} = $value;
				}
			}
		}

		if ($writeName !== $labelId) {
			$oldLabelObject->{$writeName} = new stdClass();
			$oldLabelObject->{$writeName} = $oldLabelObject->{$labelId};
			unset($oldLabelObject->{$labelId});
		}

		$oldLabelObject->{$writeName}->headline = $writeHeadline;
		$oldLabelObject->{$writeName}->button = $writeButton;

		$writeJson = json_encode($oldLabelObject);

		//Write udated label to database
		$db->prepare("Update tests set labels=? WHERE id=?");
		$db->executePrepared(array($writeJson, $testId));
		//Re-read labels
		$query = 'SELECT * FROM tests WHERE id=? LIMIT 1';
		$parameters = array($testId);
		$result = $db->fetchRow($query, $parameters);
		$returnData['labels'] = json_decode($result['data']['labels'] ?? '');

		registerActivity($db, (int)$myAuth->userid, $testId, 'test');
	}

	function updateLabels($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth;
		//for labels in the test manager this is only used for deletion1
		/* @var $db rixPDO */
		checkParams($data, array('testId'));

		$testId = $data['testId'];
		$delLabel = $data['deletedLabel'];

		//Check if the test is still present
		$query = 'SELECT * FROM tests WHERE id=? LIMIT 1';
		$parameters = array($testId);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if selected test is not available anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("You are trying to update a test which has been deleted by another user. The view will be refreshed.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			die();
		}
		tmAbortIfPublishedTestRow($result['data'], $returnData, 'This test is Published (Locked). Labels cannot be changed while the test is locked.');
		//End check

		$oldLabelObject = json_decode($result['data']['labels'] ?? '');

		//check if label to be deleted is a default label
		if ($oldLabelObject->{$delLabel}->default === 'yes') {
			$returnData['error'] = $uiLang->translate("You cannot delete a label which is set to default!");
			$returnData['labelDeleteDefaultError'] = true;
			$returnData['labels'] = json_decode($result['data']['labels'] ?? '');
			die();
		}

		unset($oldLabelObject->{$delLabel});
		$writeJson = json_encode($oldLabelObject);

		//Write udated label to database
		$db->prepare("Update tests set labels=? WHERE id=?");
		$db->executePrepared(array($writeJson, $testId));
		//Re-read labels
		$query = 'SELECT * FROM tests WHERE id=? LIMIT 1';
		$parameters = array($testId);
		$result = $db->fetchRow($query, $parameters);
		$returnData['labels'] = json_decode($result['data']['labels'] ?? '');

		registerActivity($db, (int)$myAuth->userid, $testId, 'test');
	}

	function setDefaultLabel($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth;
		/* @var $db rixPDO */
		checkParams($data, array('label', 'testId'));

		$testId = $data['testId'];
		$label = $data['label'];

		//Check if the test is still present
		$query = 'SELECT * FROM tests WHERE id=? LIMIT 1';
		$parameters = array($testId);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if selected test is not available anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("You are trying to update a test which has been deleted by another user. The view will be refreshed.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			die();
		}
		tmAbortIfPublishedTestRow($result['data'], $returnData, 'This test is Published (Locked). Labels cannot be changed while the test is locked.');
		//End check

		$oldLabelObject = json_decode($result['data']['labels'] ?? '');

		foreach ($oldLabelObject as $key => $value) {
			if ($key === $label) {
				$oldLabelObject->{$key}->default = 'yes';
			} else {
				$oldLabelObject->{$key}->default = 'no';
			}
		}

		$writeJson = json_encode($oldLabelObject);

		//Write udated label to database
		$db->prepare("Update tests set labels=? WHERE id=?");
		$db->executePrepared(array($writeJson, $testId));
		//Re-read labels
		$query = 'SELECT * FROM tests WHERE id=? LIMIT 1';
		$parameters = array($testId);
		$result = $db->fetchRow($query, $parameters);
		$returnData['labels'] = json_decode($result['data']['labels'] ?? '');

		registerActivity($db, (int)$myAuth->userid, $testId, 'test');
	}

	function plausibilityFluidCheck($data, &$db, &$returnData): void
	{
		global $uiLang;
		/* @var $db rixPDO */
		checkParams($data, array('id', 'languages', 'structure'));
		$id = $data['id'];
		//Check if Test is still present & fetch data
		$query = "
    SELECT 
        t.*, 
        CASE 
            WHEN JSON_EXTRACT(t.skin, '$.skinOptions.privacyPolicy') = TRUE
            THEN TRUE
            ELSE FALSE
        END AS activePn,
        t.metadata
    FROM 
        tests t
    WHERE 
        t.id = ?
    LIMIT 1";
		$parameters = array($id);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if selected test is not available anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("The test you are trying to check has been deleted by another user. The view will be refreshed.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			die();
		}
		$languages = $data['languages'];
		$structure = $data['structure'];

		//Check if pn is active and available in active languages
		if ((int)$result['data']['activePn'] === 1) {
			if ($result['data']['metadata'] !== null) {
				$metadata = json_decode($result['data']['metadata'], true);
				if (isset($metadata['privacy_policy']) && is_array($metadata['privacy_policy'])) {
					foreach ($languages as $lang) {
						if (!isset($metadata['privacy_policy'][$lang]) || empty($metadata['privacy_policy'][$lang])) {
							$returnData['pnNoContent'] = true;
						}
					}
				}
			} else {
				$returnData['pnNoContent'] = true;
			}
		}

		//Check structure
		if (count($structure) > 0) {
			foreach ($structure as $key => $structureItem) {
				//reading fluid block info from DB
				$query = 'SELECT * FROM testFluidStructure WHERE id=?';
				$parameters = array($structureItem['hiddenID']);
				$result = $db->fetchTable($query, $parameters);
				//Check if the items to be used are available in the testpool
				$query = 'SELECT * FROM testPools WHERE id=?';
				$parameters = array($result['data']['0']['poolID']);
				$queryResult = $db->fetchTable($query, $parameters);
				$pageUsage = [];
				$name = '';
				if ($queryResult['rows'] > 0) {
					$name = $queryResult['data']['0']['name'];
					$jsonValue = json_decode($queryResult['data']['0']['structure'] ?? '', true);
					$itemCount = count($jsonValue['items']);
					if (isset($structureItem['itemsUsed']['data'])) {
						$itemsUsed = (int)$structureItem['itemsUsed']['data'];
					} else {
						$itemsUsed = (int)$structureItem['itemsUsed'];
					}
					if ($itemsUsed > $itemCount) {
						$returnData['itemsAmountError'][$structureItem['hiddenID']]['hiddenID'] = $structureItem['hiddenID'];
						$returnData['itemsAmountError'][$structureItem['hiddenID']]['itemsUsed'] = $itemsUsed;
						$returnData['itemsAmountError'][$structureItem['hiddenID']]['itemsTotal'] = $itemCount;
						$returnData['itemsAmountError'][$structureItem['hiddenID']]['name'] = $name;
					}

					// Duplicate tracking array for pages in this pool
					$pageUsage = [];

					foreach ($jsonValue['items'] as $key2 => $poolStructureItem) {
						//reading item data from db
						$query = 'SELECT * FROM items WHERE id=?';
						$parameters = array($poolStructureItem['hiddenID']);
						$itemResult = $db->fetchTable($query, $parameters);
						if (count($itemResult['data']) > 0) {
							foreach ($itemResult['data'] as $key3 => $poolItemData) {
								// Track duplicate usage
								$pageKey = $poolItemData['id'];
								$pageName = $poolItemData['name'];
								$pageUsage[$pageKey]['count'] = ($pageUsage[$pageKey]['count'] ?? 0) + 1;
								$pageUsage[$pageKey]['name'] = $pageName;
								//No Content and lang checks
								$jsonData = json_decode($poolItemData['parsed'] ?? '', true);
								if ($jsonData == null) {
									$typer = 'noContentError';
									$returnData[$typer][$structureItem['hiddenID']]['poolname'] = $structureItem['name'];
									$returnData[$typer][$structureItem['hiddenID']]['hiddenID'] = $structureItem['hiddenID'];
									$returnData[$typer][$structureItem['hiddenID']]['data'][$poolItemData['id']]['name'] = $poolItemData['name'];
									$returnData[$typer][$structureItem['hiddenID']]['data'][$poolItemData['id']]['itemCode'] = $poolItemData['itemCode'];
								} else {
									$i = 0;
									$typer = 'langError';

									//now check against languages...
									foreach ($languages as $k => $activelanguage) {
										if (!array_key_exists($activelanguage, $jsonData)) {
											$returnData[$typer][$structureItem['hiddenID']]['poolname'] = $structureItem['name'];
											$returnData[$typer][$structureItem['hiddenID']]['data'][$poolItemData['id']]['languages'][$i] = $activelanguage;
											$returnData[$typer][$structureItem['hiddenID']]['hiddenID'] = $structureItem['hiddenID'];
											$returnData[$typer][$structureItem['hiddenID']]['data'][$poolItemData['id']]['name'] = $poolItemData['name'];
											$returnData[$typer][$structureItem['hiddenID']]['data'][$poolItemData['id']]['itemCode'] = $poolItemData['itemCode'];
										}
										$i++;
									}
								}
							}
						} else {
							$errordata['hiddenID'] = $structureItem['hiddenID'];
							$errordata['name'] = $structureItem['name'];

							$returnData['missing_items'][$key] = $errordata;
						}
					}
				} else {
					$errordata['hiddenID'] = $structureItem['hiddenID'];
					$returnData['deletedPool'][$key] = $errordata;
				}
				foreach ($pageUsage as $pageKey => $usageData) {
					if ($usageData['count'] > 1) {
						$returnData['duplicates'][$queryResult['data']['0']['id']]['poolName'] = $name;
						$returnData['duplicates'][$queryResult['data']['0']['id']]['pages'][$pageKey] = [
							'name' => $usageData['name'],
							'dupeCount' => $usageData['count'],
						];
					}
				}
			}
		} else {
			$returnData['noItems'] = true;
		}
	}

	function plausibilityCheck($data, &$db, &$returnData): void
	{
		global $uiLang;
		/* @var $db rixPDO */
		checkParams($data, array('id', 'languages', 'structure'));
		$id = $data['id'];
		//Check if Test is still present & fetch data
		$query = "
    SELECT 
        t.*, 
        CASE 
            WHEN JSON_EXTRACT(t.skin, '$.skinOptions.privacyPolicy') = TRUE
            THEN TRUE
            ELSE FALSE
        END AS activePn,
        t.metadata
    FROM 
        tests t
    WHERE 
        t.id = ?
    LIMIT 1";

		$parameters = array($id);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if selected testee is not available anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("The test you are trying to check has been deleted by another user. The view will be refreshed.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			die();
		}

		$languages = $data['languages'];
		$structure = $data['structure'];

		//Check if pn is active and available in active languages
		if ((int)$result['data']['activePn'] === 1) {
			if ($result['data']['metadata'] !== null) {
				$metadata = json_decode($result['data']['metadata'], true);
				if (isset($metadata['privacy_policy']) && is_array($metadata['privacy_policy'])) {
					foreach ($languages as $lang) {
						if (!isset($metadata['privacy_policy'][$lang]) || empty($metadata['privacy_policy'][$lang])) {
							$returnData['pnNoContent'] = true;
						}
					}
				}
			} else {
				$returnData['pnNoContent'] = true;
			}
		}

		//Checking structure
		if (count($structure) > 0) {
			$idCount = []; // Array to count occurrences of each ID

			foreach ($structure as $key => $structureItem) {
				// Increment the count for each hiddenID
				$idCount[$structureItem['hiddenID']] = ($idCount[$structureItem['hiddenID']] ?? 0) + 1;

				// Checking db for all IDs in the test structure
				$query = 'SELECT * FROM items WHERE id=?';
				$parameters = array($structureItem['hiddenID']);
				$result = $db->fetchTable($query, $parameters);

				if (count($result['data']) > 0) {
					$jsonData = json_decode($result['data']['0']['parsed'] ?? '', true);
					if ($jsonData == null) {
						$typer = 'noContentError';
						$returnData[$typer][$structureItem['hiddenID']]['hiddenID'] = $structureItem['hiddenID'];
						$returnData[$typer][$structureItem['hiddenID']]['itemCode'] = $structureItem['code'];
						$returnData[$typer][$structureItem['hiddenID']]['name'] = $structureItem['name'];
					} else {
						$i = 0;
						$typer = 'langError';

						// Now check against languages
						foreach ($languages as $k => $activelanguage) {
							if (!array_key_exists($activelanguage, $jsonData)) {
								$returnData[$typer][$structureItem['hiddenID']]['languages'][$i] = $activelanguage;
								$returnData[$typer][$structureItem['hiddenID']]['hiddenID'] = $structureItem['hiddenID'];
								$returnData[$typer][$structureItem['hiddenID']]['itemCode'] = $structureItem['code'];
								$returnData[$typer][$structureItem['hiddenID']]['name'] = $structureItem['name'];
							}
							$i++;
						}
					}
				} else {
					$errordata['hiddenID'] = $structureItem['hiddenID'];
					$returnData['missing_items'][$key] = $errordata;
				}
			}

			// Add duplicates to returnData, using hiddenID as keys and name + dupeCount as values
			foreach ($idCount as $id => $count) {
				if ($count > 1) {
					// Find the corresponding name for the duplicate ID
					foreach ($structure as $structureItem) {
						if ($structureItem['hiddenID'] === $id) {
							$returnData['duplicates'][$id] = [
								'name' => $structureItem['name'],
								'dupeCount' => $count
							];
							break;
						}
					}
				}
			}
		} else {
			$returnData['noItems'] = true;
		}
	}

	function quickFluidCheck($data, &$db, &$returnData): void
	{
		/* @var $db rixPDO */
		checkParams($data, array('id', 'languages', 'structure'));
		$id = $data['id'];
		$languages = $data['languages'];
		$structure = $data['structure'];
		if (count($structure) > 0) {
			foreach ($structure as $key => $structureItem) {
				//reading fluid block info from DB
				$query = 'SELECT * FROM testFluidStructure WHERE id=?';
				$parameters = array($structureItem['hiddenID']);
				$result = $db->fetchTable($query, $parameters);
				//Check if the items to be used are available in the testpool
				$query = 'SELECT * FROM testPools WHERE id=?';
				$parameters = array($result['data']['0']['poolID']);
				$queryResult = $db->fetchTable($query, $parameters);
				if ($queryResult['rows'] > 0) {
					$jsonValue = json_decode($queryResult['data']['0']['structure'] ?? '', true);
					$itemCount = count($jsonValue['items']);
					if (isset($structureItem['itemsUsed']['data'])) {
						$itemsUsed = (int)$structureItem['itemsUsed']['data'];
					} else {
						$itemsUsed = (int)$structureItem['itemsUsed'];
					}
					if ($itemsUsed > $itemCount) {
						$returnData['itemsAmountError'][$structureItem['hiddenID']]['hiddenID'] = $structureItem['hiddenID'];
						$returnData['itemsAmountError'][$structureItem['hiddenID']]['itemsUsed'] = $itemsUsed;
						$returnData['itemsAmountError'][$structureItem['hiddenID']]['itemsTotal'] = $itemCount;
					}
					foreach ($jsonValue['items'] as $key2 => $poolStructureItem) {
						//reading item data from db
						$query = 'SELECT * FROM items WHERE id=?';
						$parameters = array($poolStructureItem['hiddenID']);
						$itemResult = $db->fetchTable($query, $parameters);
						if (count($itemResult['data']) > 0) {
							$jsonData = json_decode($itemResult['data']['0']['parsed'] ?? '', true);
							if ($jsonData == null) {
								$returnData['noContentError'][$structureItem['hiddenID']]['hiddenID'] = $structureItem['hiddenID'];
							} else {
								//now check against languages...
								foreach ($languages as $k => $activelanguage) {
									if (!array_key_exists($activelanguage, $jsonData)) {
										$returnData['langError'][$structureItem['hiddenID']]['hiddenID'] = $structureItem['hiddenID'];
									}
								}
							}
						} else {
							$errordata['hiddenID'] = $structureItem['hiddenID'];
							$returnData['missing_items'][$key] = $errordata;
						}
					}
				} else {
					$errordata['hiddenID'] = $structureItem['hiddenID'];
					$returnData['deletedPool'][$key] = $errordata;
				}
			}
		} else {
			$returnData['noItems'] = true;
		}
	}

	function quickCheck($data, &$db, &$returnData): void
	{
		checkParams($data, array('id', 'languages', 'structure'));
		/* @var $db rixPDO */
		$id = $data['id'];
		$languages = $data['languages'];
		$structure = $data['structure'];

		if (count($structure) > 0) {
			foreach ($structure as $key => $structureItem) {
				//checking db for all IDs in the test structure
				$query = 'SELECT * FROM items WHERE id=?';
				$parameters = array($structureItem['hiddenID']);
				$result = $db->fetchTable($query, $parameters);
				if (count($result['data']) > 0) {
					$jsonData = json_decode($result['data']['0']['parsed'] ?? '', true);
					if ($jsonData == null) {
						$typer = 'noContentError';
						$returnData[$typer][$structureItem['hiddenID']]['hiddenID'] = $structureItem['hiddenID'];
					} else {
						$i = 0;
						$typer = 'langError';
						foreach ($languages as $k => $activelanguage) {
							if (!array_key_exists($activelanguage, $jsonData)) {
								$returnData[$typer][$structureItem['hiddenID']]['languages'][$i] = $activelanguage;
								$returnData[$typer][$structureItem['hiddenID']]['hiddenID'] = $structureItem['hiddenID'];
							}
							$i++;
						}
					}
				} else {
					$errordata['hiddenID'] = $structureItem['hiddenID'];
					$returnData['missing_items'][$key] = $errordata;
				}
			}
		} else {
			$returnData['noItems'] = true;
		}
	}

	function newTestpool($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth;
		/* @var $db rixPDO */
		checkParams($data, array('test', 'name'));

		$test = $data['test'];
		$name = $data['name'];

		//Check if test is still present
		$query = 'SELECT * FROM tests WHERE id=? LIMIT 1';
		$parameters = array($test);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if selected test is not available anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("You are trying to add a testpool to a test which has been deleted by another user. The view will be refreshed.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			die();
		}
		tmAbortIfPublishedTestRow($result['data'], $returnData, 'This test is Published (Locked). Test pools cannot be changed while the test is locked.');
		//End check

		//verify if the new testpool is not existing already
		$query = 'SELECT COUNT(*) FROM testPools WHERE name=? and testID=?';
		$parameters = array($name, $test);
		$results = $db->fetchValue($query, $parameters);
		// if the name is already in use:
		if ($results['data'] != 0) {
			$returnData['error'] = $uiLang->translate("This testpool does already exist. Try using a different name.");
			die();
		}

		$data = array(array('testID' => $test, 'name' => $name, 'structure' => '{"items":[]}'));
		$db->insert('testPools', $data);
		$result = $db->results();
		$returnData['id'] = $result['id'];
		//re-read testpools
		$query = 'SELECT * FROM testPools WHERE testID=? order by name';
		$parameters = array($test);
		$result = $db->fetchTable($query, $parameters);
		$returnData['testpools'] = $result['data'];

		registerActivity($db, (int)$myAuth->userid, $test, 'test');
	}

	function editTestpool($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth;
		/* @var $db rixPDO */
		checkParams($data, array('id', 'name', 'test'));

		$newName = $data['name'];
		$tpId = $data['id'];
		$test = $data['test'];

		//Check if Test is still present
		$query = 'SELECT * FROM tests WHERE id=? LIMIT 1';
		$parameters = array($test);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if selected test is not available anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("The test you are trying to edit has been deleted by another user. The view will be refreshed.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			die();
		}
		tmAbortIfPublishedTestRow($result['data'], $returnData, 'This test is Published (Locked). Test pools cannot be changed while the test is locked.');
		//if testpool is not present anymore, throw an error message and leave edit mode
		$query = 'SELECT * FROM testPools WHERE id=? LIMIT 1';
		$parameters = array($tpId);
		$result = $db->fetchRow($query, $parameters);
		//Show error message
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("This testpool has been deleted by another user. Leaving edit mode.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			die();
		}

		//verify if a testpool with that name already exists
		$query = 'SELECT COUNT(*) as isPresent, id FROM testPools WHERE name=? and testID=?';
		$parameters = array($newName, $test);
		$results = $db->fetchRow($query, $parameters);
		// if the name is already in use:
		if ($results['data']['isPresent'] != 0) {
			//allow cosmetic renaming
			if ($results['data']['id'] !== $tpId) {
				$returnData['error'] = $uiLang->translate("This testpool does already exist. Try using a different name.");
				die();
			}
		}

		$db->update('testPools', array('name' => $newName), 'id=?', array($tpId));
		//re-read testpools
		$query = 'SELECT * FROM testPools WHERE testID=? order by name';
		$parameters = array($test);
		$result = $db->fetchTable($query, $parameters);
		$returnData['testpools'] = $result['data'];
		$returnData['id'] = $tpId;

		registerActivity($db, (int)$myAuth->userid, $test, 'test');
	}

	function deleteTestpool($data, &$db, &$returnData): void
	{
		global $uiLang;
		/* @var $db rixPDO */
		checkParams($data, array('test', 'tbId'));

		$test = $data['test'];
		$tbId = $data['tbId'];

		//Check if test is still present
		$query = 'SELECT * FROM tests WHERE id=? LIMIT 1';
		$parameters = array($test);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if selected test is not available anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("You are trying to delete a testpool of a test which has been deleted by another user. The view will be refreshed.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			die();
		}
		tmAbortIfPublishedTestRow($result['data'], $returnData, 'This test is Published (Locked). Test pools cannot be changed while the test is locked.');
		//End check
		$db->prepare("DELETE FROM testPools WHERE id=?");
		$db->executePrepared(array($tbId));
		//re-read testpools
		$query = 'SELECT * FROM testPools WHERE testID=? order by name';
		$parameters = array($test);
		$result = $db->fetchTable($query, $parameters);
		$returnData['testpools'] = $result['data'];
	}

	function saveTestpoolAssignment($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth;
		/* @var $db rixPDO */
		checkParams($data, array('tpId', 'testId', 'structure'));

		$tpId = $data['tpId'];
		$test = $data['testId'];
		$structure = $data['structure'];

		//Check if Test is still present
		$query = 'SELECT * FROM tests WHERE id=? LIMIT 1';
		$parameters = array($test);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if selected test is not available anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("The test you are trying to edit has been deleted by another user. The view will be refreshed.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			die();
		}
		tmAbortIfPublishedTestRow($result['data'], $returnData, 'This test is Published (Locked). Test pools cannot be changed while the test is locked.');
		//if testpool is not present anymore, throw an error message and leave edit mode
		$query = 'SELECT * FROM testPools WHERE id=? LIMIT 1';
		$parameters = array($tpId);
		$result = $db->fetchRow($query, $parameters);
		//Show error message
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("This testpool has been deleted by another user. Leaving edit mode.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			die();
		}

		//saving modified structure to testpool
		for ($i = 0; $i < count($structure); $i++) {
			unset($structure[$i]['name']);
			unset($structure[$i]['code']);
			unset($structure[$i]['type']);
			unset($structure[$i]['itemGroup']);
			//ActionButton (Scripts)
			$structure[$i]['scripts'] = $structure[$i]['actionButton'];
			unset($structure[$i]['actionButton']);
		}
		$structureSave = array('items' => $structure);
		$structureSave = json_encode($structureSave);
		$db->prepare("UPDATE testPools SET structure=? WHERE id=?");
		$db->executePrepared(array($structureSave, $tpId));

		registerActivity($db, (int)$myAuth->userid, $test, 'test');
	}

	function fetchTestResultOverview($data, rixPDO &$db, &$returnData): void
	{
		global $permAuth;
		/* @var $db rixPDO */
		checkParams($data, ['selectedTest', 'location']);
		$selectedTest = $data['selectedTest'];
		$returnData['activityAccess'] = tmTestActivityAccessSummary((int)$selectedTest, $db);
		$testTakerAccess = [];
		$hasTestTakerAccess = static function ($loginParent) use ($db, &$testTakerAccess): bool {
			$loginParent = intval($loginParent);
			return tmCanReadTestTakerFolder($loginParent, $db, $testTakerAccess);
		};

		//check activity data
		$query = "SELECT COUNT(*) AS pwdUsingTest, activity.loginId AS testee, " . tmLoginAccessParentSql('logins', 'templateLogin') . " AS loginParent
        FROM activity
        JOIN logins ON logins.id = activity.loginId
        LEFT JOIN logins templateLogin ON templateLogin.id = logins.parentTemplateId
        WHERE activity.testId=?
        GROUP BY activity.loginId, loginParent";
		$parameters = array($selectedTest);
		$result = $db->fetchTable($query, $parameters);
		foreach ($result['data'] as $k => $v) {
			if ($hasTestTakerAccess($v['loginParent']) !== true) {
				unset($result['data'][$k]);
				continue;
			}
			unset($result['data'][$k]['loginParent']);
		}
		$result['data'] = array_values($result['data']);
		$returnData['activityData'] = $result['data'];
		$returnData['testId'] = $data['selectedTest'];

		if (!empty($result['data'])) {

			$query = "SELECT passwordId,
	        " . tmLoginAccessParentSql('logins', 'templateLogin') . " AS loginParent,
	        progress AS progressField
        FROM    activity
        JOIN logins ON logins.id = activity.loginId
        LEFT JOIN logins templateLogin ON templateLogin.id = logins.parentTemplateId
        WHERE activity.testId =?
	        ORDER BY activity.passwordId";
			$parameters = array($selectedTest);
			$result = $db->fetchTable($query, $parameters);

			//Prepare Data
			foreach ($result['data'] as $k => $v) {
				if ($hasTestTakerAccess($v['loginParent']) !== true) {
					unset($result['data'][$k]);
					continue;
				}
				$result['data'][$k]['progressField'] = round($v['progressField'] * 100);
				unset($result['data'][$k]['loginParent']);
			}
			$result['data'] = array_values($result['data']);

			$activePasswordIds = array_values(array_unique(array_map('intval', array_column($result['data'], 'passwordId'))));
			foreach ($result['data'] as &$activityRow) {
				unset($activityRow['passwordId']);
			}
			unset($activityRow);
			$pwdRes = $db->fetchTable("SELECT `id`, `loginParent` FROM (SELECT passwords.`id`, " . tmLoginAccessParentSql('logins', 'templateLogin') . " AS `loginParent`, JSON_CONTAINS(JSON_EXTRACT(passwords.`structure`, '$[*].hiddenID'), ?) AS `a1` FROM `passwords` JOIN `logins` ON logins.`id` = passwords.`loginID` LEFT JOIN logins templateLogin ON templateLogin.id = logins.parentTemplateId) `a0` WHERE `a1` = 1;", [$selectedTest])['data'];
			$pwdQ = [];
			foreach ($pwdRes as $pwdData) {
				if ($hasTestTakerAccess($pwdData['loginParent']) === true) {
					$pwdQ[] = intval($pwdData['id']);
				}
			}
			$noLoginCount = count(array_diff($pwdQ, $activePasswordIds));
			$returnData['noLogins'] = $noLoginCount;
			$returnData['testActivity'] = $result['data'];
		}
	}

	function validateResultsExportDate(string $value, string $label): ?DateTimeImmutable
	{
		if ($value === '') return null;
		$date = DateTimeImmutable::createFromFormat('!d-m-Y', $value);
		$errors = DateTimeImmutable::getLastErrors();
		if ($date === false || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))
			|| $date->format('d-m-Y') !== $value) {
			throw new InvalidArgumentException($label . ' must be a valid date in DD-MM-YYYY format.');
		}
		return $date;
	}

	function validateResultsExportOptions(array $data, bool $withMode = false, bool $withDetail = false): array
	{
		$testId = filter_var($data['selectedTest'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
		if ($testId === false) throw new InvalidArgumentException('Invalid test selection.');
		$format = (string)($data['format'] ?? '');
		if (!in_array($format, ['csv', 'excel', 'openoffice'], true)) throw new InvalidArgumentException('Unsupported export format.');
		$delimiter = (string)($data['delimiter'] ?? '');
		resultsExportDelimiter($delimiter);
		$start = (string)($data['startDate'] ?? '');
		$end = (string)($data['endDate'] ?? '');
		$startDate = validateResultsExportDate($start, 'Start date');
		$endDate = validateResultsExportDate($end, 'End date');
		if ($startDate !== null && $endDate !== null && $startDate > $endDate) {
			throw new InvalidArgumentException('Start date must not be later than end date.');
		}
		$options = compact('testId', 'format', 'delimiter', 'start', 'end');
		if ($withMode) {
			$mode = (string)($data['mode'] ?? '');
			if (!in_array($mode, ['json', 'nojson'], true)) throw new InvalidArgumentException('Unsupported data mode.');
			$options['mode'] = $mode;
		}
		if ($withDetail) {
			$detail = (string)($data['detail'] ?? '');
			if (!in_array($detail, ['all', 'total'], true)) throw new InvalidArgumentException('Unsupported score detail level.');
			$options['detail'] = $detail;
		}
		return $options;
	}

	function fetchTestResults($data, &$db, &$returnData): void
	{
		global $uiLang, $permAuth;

		/* @var $db rixPDO */
		try {
			$options = validateResultsExportOptions($data, true);
		} catch (InvalidArgumentException $e) {
			$returnData['error'] = $uiLang->translate($e->getMessage());
			return;
		}
		$testId = $options['testId'];
		$mode = $options['mode'];
		$fmt = $options['format'];
		$delim = $options['delimiter'];
		$s_date = $options['start'];
		$e_date = $options['end'];
		$testTakerAccess = [];
		$hasTestTakerAccess = static function ($loginParent) use ($db, &$testTakerAccess): bool {
			return tmCanReadTestTakerFolder((int)$loginParent, $db, $testTakerAccess);
		};

		$activity = getActivity($testId, $returnData, $db, $s_date, $e_date);
		foreach ($activity as $passwordId => $activityRow) {
			if ($hasTestTakerAccess(tmFetchLoginAccessParentByPassword((int)$passwordId, $db, (int)$testId)) !== true) {
				unset($activity[$passwordId]);
			}
		}

		$metaKeys = [];
		if ($mode === 'nojson') {
			foreach ($activity as $row) {
				$info = $row['info'];
				if ($info !== null && $info !== "") {
					$info = json_decode($info ?? '', true);
					$keys = array_keys($info);
					$metaKeys = array_merge($metaKeys, $keys);
				}
			}
			$metaKeys = array_unique($metaKeys);
			sort($metaKeys);
		}

		$testData = [];
		$testType = '';
		$structure = [];
		OasysTest::buildTestData($testId, $db, $testData, $testType, $structure);

		if ($mode === 'nojson') {
			$headers = ['legend' => ['', 'login', 'tag', 'name', 'progress', 'lastActivity'], 'itemId' => ['page id', '', '', '', '', ''], 'itemName' => ['page name', '', '', '', '', ''], 'itemCode' => ['page code', '', '', '', '', ''], 'field' => ['variable', '', '', '', '', ''], 'subvalue' => ['subvalue', '', '', '', '', ''], 'type' => ['type', '', '', '', '', '']];
			if (count($metaKeys)) {
				foreach ($metaKeys as $metaKey) {
					$headers['legend'][] = $metaKey;
					$headers['itemId'][] = '';
					$headers['itemName'][] = '';
					$headers['itemCode'][] = '';
					$headers['field'][] = '';
					$headers['subvalue'][] = '';
					$headers['type'][] = '';
				}
			}
		} else {
			$headers = ['legend' => ['', 'login', 'tag', 'name', 'progress', 'lastActivity', 'metainfo'], 'itemId' => ['page id', '', '', '', '', '', ''], 'itemName' => ['page name', '', '', '', '', '', ''], 'itemCode' => ['page code', '', '', '', '', '', ''], 'field' => ['variable', '', '', '', '', '', ''], 'type' => ['type', '', '', '', '', '', '']];
		}

		foreach ($structure as $itemId) {
			if (isset($testData['items'][$itemId])) {
				continue;
			}

			// permission filtering
			// $itemGroupParent = $db->fetchValue("SELECT `parent` FROM `itemGroups` WHERE `id` = (SELECT `groupId` FROM `items` WHERE `id` = ?)", [$itemId])['data'];
			// $itemPass = $permAuth->permCheck(['remCall' => true, 'fid' => $itemGroupParent, 'action' => 'fetchItem'], "items");
			// if ($itemPass !== true) continue;

			$itemData = getItemData($itemId, $db, $returnData);
			$testData['items'][$itemId] = $itemData;
			if (!isset($itemData) || !is_array($itemData['fields'])) {
				continue;
			}
			if (count($itemData['fields']) === 0) {
				continue;
			}
			foreach ($itemData['fields'] as $field) {
				if ($field['category'] !== 'fields') {
					continue;
				}
				if ($mode !== 'nojson' || ($field['format'] ?? '') !== 'array') {
					$headers['legend'][] = '';
					$headers['itemName'][] = prepXp($itemData['name'], $fmt, $delim);
					$headers['itemCode'][] = prepXp($itemData['itemCode'], $fmt, $delim);
					$headers['itemId'][] = $itemData['id'];
					$headers['field'][] = $field['id'];
					if ($mode === 'nojson') {
						$headers['subvalue'][] = "";
					}
					$headers['type'][] = str_replace("oasys", "", $field['type']);
				} else {
					foreach ($field['values'] as $value) {
						$headers['legend'][] = '';
						$headers['itemName'][] = prepXp($itemData['name'], $fmt, $delim);
						$headers['itemCode'][] = prepXp($itemData['itemCode'], $fmt, $delim);
						$headers['itemId'][] = $itemData['id'];
						$headers['field'][] = $field['id'];
						$headers['subvalue'][] = hex2bin($value);
						$headers['type'][] = str_replace("oasys", "", $field['type']);
					}
				}
			}
		}

		$exportData = [];

		foreach ($activity as $passwordId => $row) {

			$answers = getAnswersData($passwordId, $testId, $db);
			if ($testType === 'fluid' || $testType === 'mutation') {
				$testCache = getTestCache($passwordId, $testId, $db);
			}
			$set = ['', $row['login'], $row['tag'], ($row['name'] ?? ''), $row['progress'], $row['tsActiveServer']];
			if ($mode === 'nojson') {
				if ($row['info']) {
					$info = json_decode($row['info'] ?? '', true);
				} else {
					$info = [];
				}
				foreach ($metaKeys as $metaKey) {
					if (isset($info[$metaKey])) {
						$metaValue = $info[$metaKey];
						$set[] = is_array($metaValue) || is_object($metaValue)
							? json_encode($metaValue, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
							: $metaValue;
					} else {
						$set[] = '';
					}
				}
			} else {
				if (!empty($row['info'])) {
					$set[] = json_encode(json_decode($row['info'] ?? '', true), JSON_UNESCAPED_UNICODE);
				} else {
					$set[] = '';
				}
			}
			$startIterator = count($set);
			for ($i = $startIterator; $i < count($headers['legend']); $i++) {
				$itemId = $headers['itemId'][$i];
				$field = $headers['field'][$i];
				if (isset($headers['subvalue'])) {
					$subvalue = $headers['subvalue'][$i];
				}
				if (isset($answers[$itemId][$field])) {
					if (!isset($subvalue) || !$subvalue) {
						$set[$i] = $answers[$itemId][$field];
					} else {
						$a = json_decode($answers[$itemId][$field] ?? '', true);
						if (is_array($a) && in_array($subvalue, $a)) {
							$set[$i] = 1;
						} else {
							$set[$i] = 0;
						}
					}
				} else {
					if ($testType === 'fluid' || $testType === 'mutation') {
						if (in_array($itemId, $testCache ?? [])) {
							if (!isset($subvalue) || !$subvalue) {
								$set[$i] = '';
							} else {
								$set[$i] = 0;
							}
						} else {
							$set[$i] = '__N/A__';
						}
					} else {
						if (!isset($subvalue) || !$subvalue) {
							$set[$i] = '';
						} else {
							$set[$i] = 0;
						}
					}
				}
			}
			foreach ($set as $k => $v) {
				$set[$k] = prepXp($v, $fmt, $delim);
			}
			$exportData[$passwordId] = $set;
		}

		if (empty($exportData)) {
			$returnData['error'] = $uiLang->translate("No data found for the given test.");
			return;
		}

		$returnData['testData'] = $testData;
		$returnData['csvHeaders'] = $headers;
		$returnData['csvRows'] = $exportData;
		$returnData['format'] = $fmt;
		$returnData['mode'] = $mode;

		if ($fmt === 'csv') {
			resultsExportStageCsv($returnData, $delim);
		} elseif (in_array($fmt, ['excel', 'openoffice'], true)) {
			require_once __DIR__ . '/../../../inc/results_reporter/report_processor.php';
		}
	}

	function fetchBehaviourTiming(array $data, rixPDO &$db, array &$returnData): void
	{
		global $uiLang;
		try {
			$options = validateResultsExportOptions($data);
		} catch (InvalidArgumentException $e) {
			$returnData['error'] = $uiLang->translate($e->getMessage());
			return;
		}
		$testId = $options['testId'];
		$fmt = $options['format'];
		$delim = $options['delimiter'];
		$s_date = $options['start'] !== '' ? $options['start'] : null;
		$e_date = $options['end'] !== '' ? $options['end'] : null;

		$headers = ['legend' => ['', 'login', 'tag', 'name'], 'itemId' => ['page id', '', '', ''], 'itemName' => ['page name', '', '', ''], 'itemCode' => ['page code', '', '', '']];
		$behaviour = new OasysBehaviour($testId, $s_date, $e_date);
		$structure = $behaviour->getStructure();
		$testData = $behaviour->getTestData();
		$timeSpent = $behaviour->getTimeSpentOnItems();
		$csvRows = [];

		global $permAuth;
		$testTakerAccess = [];
		$hasTestTakerAccess = static function ($loginParent) use ($db, &$testTakerAccess): bool {
			return tmCanReadTestTakerFolder((int)$loginParent, $db, $testTakerAccess);
		};

		// permisison filtering
		foreach ($timeSpent as $tsIdx => $tsData) {
			if ($hasTestTakerAccess(tmFetchLoginAccessParentByPassword((int)($tsData['passwordId'] ?? 0), $db, (int)$testId)) !== true) {
				unset($timeSpent[$tsIdx]);
				continue;
			}
			unset($timeSpent[$tsIdx]['passwordId']);
		}

		$timeSpent = array_values($timeSpent); //re-index $timeSpent

		$item2Rem = [];
		foreach ($structure as $itemId) {
			// // permission filtering
			// $itemGroupParent = $db->fetchValue("SELECT `parent` FROM `itemGroups` WHERE `id` = (SELECT `groupId` FROM `items` WHERE `id` = ?)", [$itemId])['data'];
			// $itemPass = $permAuth->permCheck(['remCall' => true, 'fid' => $itemGroupParent, 'action' => 'fetchItem'], "items");
			// if ($itemPass !== true) {

			// 	$item2Rem[] = $itemId; // build list to use for $timeSpent entry removal
			// 	continue; // skip adding item header value to spreadsheet
			// }

			$headers['legend'][] = '';
			$headers['itemId'][] = $itemId;
			$headers['itemName'][] = $testData['pages'][$itemId]['name'] ?? '';
			$headers['itemCode'][] = $testData['pages'][$itemId]['code'] ?? '';
		}

		// Remove items from timeSpent that are in item2Rem, and update structure
		// foreach ($timeSpent as &$timeData) {
		// 	foreach ($item2Rem as $itemId) {
		// 		unset($timeData[$itemId]);
		// 		$idx = array_search($itemId, $structure, true);
		// 		if ($idx !== false) {
		// 			unset($structure[$idx]);
		// 		}
		// 	}
		// }
		$structure = array_values($structure); // reindex structure
		unset($timeData); // break the reference

		foreach ($timeSpent as $timeData) {
			$set = ['', $timeData['login'], $timeData['tag'], ($timeData['name'] ?? '')];
			foreach ($structure as $itemId) {
				if (isset($timeData[$itemId])) {
					$set[] = round($timeData[$itemId], 3);
				} else {
					$set[] = 0;
				}
			}
			foreach ($set as $k => $v) {
				$set[$k] = prepXp($v, $fmt, $delim);
			}
			$csvRows[] = $set;
		}

		if (empty($timeSpent)) {
			$returnData['error'] = 'No data found for the given test and date range.';
			return;
		}
		$returnData['testData'] = $testData;
		$returnData['csvHeaders'] = $headers;
		$returnData['csvRows'] = $csvRows;
		$returnData['format'] = $fmt;

		if ($fmt === 'csv') {
			resultsExportStageCsv($returnData, $delim);
		} elseif (in_array($fmt, ['excel', 'openoffice'], true)) {
			require_once __DIR__ . '/../../../inc/results_reporter/report_processor.php';
		}
	}

	function fetchDetailedTestScore($data, rixPDO &$db, &$returnData): void
	{
		/* @var $db rixPDO */
		global $uiLang;
		try {
			$options = validateResultsExportOptions($data, false, true);
		} catch (InvalidArgumentException $e) {
			$returnData['error'] = $uiLang->translate($e->getMessage());
			return;
		}
		$testId = $options['testId'];
		$detail = $options['detail'];
		$fmt = $options['format'];
		$delimiter = $options['delimiter'];
		$s_date = $options['start'];
		$e_date = $options['end'];

		try {
			$settings = new stdClass();
			$settings->fmt = $fmt;
			$settings->delimiter = $delimiter;
			$settings->detail = $detail;
			$testScoring = new OasysScoring(testId: $testId, db: $db, settings: $settings);
			$testScoring->populateAnswers($s_date, $e_date);
		} catch (Exception $e) {
			$returnData['error'] = $e->getMessage();
			die();
		}

		$returnData['testData'] = $testScoring->getTestData();
		$returnData['csvHeaders'] = $testScoring->getHeaders();
		$returnData['csvRows'] = $testScoring->getScoreData();
		$returnData['format'] = $fmt;

		global $permAuth, $uiLang;
		$testTakerAccess = [];
		$hasTestTakerAccess = static function ($loginParent) use ($db, &$testTakerAccess): bool {
			return tmCanReadTestTakerFolder((int)$loginParent, $db, $testTakerAccess);
		};

		// permission filtering
		// $col2Remove = [];
		// for ($z = $testScoring->getHeaderColumnOffset(); $z < count($returnData['csvHeaders']['itemId']); $z++) {
		// 	$itemIdVal = $returnData['csvHeaders']['itemId'][$z];
		// 	$itemGroupParent = $db->fetchValue("SELECT `parent` FROM `itemGroups` WHERE `id` = (SELECT `groupId` FROM `items` WHERE `id` = ?)", [$itemIdVal])['data'];
		// 	$itemPass = $permAuth->permCheck(['remCall' => true, 'fid' => $itemGroupParent, 'action' => 'fetchItem'], "items");
		// 	if ($itemPass !== true) {
		// 		array_push($col2Remove, $z);
		// 	}
		// }

		// foreach ($col2Remove as $colIdx => $colTarg) {
		// 	unset($returnData['csvHeaders']['legend'][$colTarg]);
		// 	unset($returnData['csvHeaders']['itemId'][$colTarg]);
		// 	unset($returnData['csvHeaders']['itemName'][$colTarg]);
		// 	unset($returnData['csvHeaders']['itemCode'][$colTarg]);
		// 	unset($returnData['csvHeaders']['field'][$colTarg]);
		// 	unset($returnData['csvHeaders']['type'][$colTarg]);
		// 	foreach ($returnData['csvRows'] as $cr_pwd => $cr_colVal) {
		// 		unset($returnData['csvRows'][$cr_pwd][$colTarg]);
		// 	}
		// }

		// re-index all filtered values
		$returnData['csvHeaders']['legend'] = array_values($returnData['csvHeaders']['legend']);
		$returnData['csvHeaders']['itemId'] = array_values($returnData['csvHeaders']['itemId']);
		$returnData['csvHeaders']['itemName'] = array_values($returnData['csvHeaders']['itemName']);
		$returnData['csvHeaders']['itemCode'] = array_values($returnData['csvHeaders']['itemCode']);
		$returnData['csvHeaders']['field'] = array_values($returnData['csvHeaders']['field']);
		$returnData['csvHeaders']['type'] = array_values($returnData['csvHeaders']['type']);
		foreach ($returnData['csvRows'] as $cr_pwd_0 => $cr_colVal_0) {
			$returnData['csvRows'][$cr_pwd_0] = array_values($returnData['csvRows'][$cr_pwd_0]);
		}

		// modify report score string contents to show man corr items which have not been touched
		foreach ($returnData['csvRows'] as $pwdId => &$scoreVals) {
			// permission filtering
			if ($hasTestTakerAccess(tmFetchLoginAccessParentByPassword((int)$pwdId, $db, (int)$testId)) !== true) {
				unset($returnData['csvRows'][$pwdId]);
				continue;
			}

			$results = $db->fetchRow("SELECT `givenScoringData`, `scoringData` FROM `scoring` WHERE `passwordId` = ? AND `testId` = ?", [$pwdId, $testId]);
			if ($results['rows'] === 0) {
				// no scoring data for this passwordId
				continue;
			}
			$gsd = json_decode($results['data']['givenScoringData'] ?? '{}', true);
			$sd = json_decode($results['data']['scoringData'] ?? '{}', true)['scoringAnswerList'];
			$itemsShown = $testScoring->getItemsShown($pwdId);

			if ($detail === 'all') {
				for ($iPos = $testScoring->getHeaderColumnOffset(); $iPos < count($returnData['csvHeaders']['itemId']); $iPos++) {
					$pageVal = $returnData['csvHeaders']['itemId'][$iPos];
					if (!in_array($pageVal, $itemsShown)) {
						// this item was not shown to the user
						continue;
					}
					$scoreType = $sd[$pageVal][$returnData['csvHeaders']['field'][$iPos]]['itemScoreType'] ?? null;

					// find man corr items with no human interaction and mark them as not scored (i.e., "N/A")
					if ($scoreVals[$iPos] === "0" && $scoreType === "manual") {
						$scoredEntry = $gsd[$pageVal][$returnData['csvHeaders']['field'][$iPos]]['score']['scoreById'] ?? null;
						if ($scoredEntry === 0) {
							$scoreVals[$iPos] = "N/A";
						}
						if (is_null($scoredEntry)) {
							$scoreVals[$iPos] = "N/A";
						}
					}
				}
			}
		}

		if (empty($returnData['csvRows'])) {
			$returnData = [];
			$returnData['error'] = $uiLang->translate("No data found for the given test.");
			return;
		}

		// special include which parses scoring data and produces XLSX or ODS output for download
		if ($fmt === 'csv') {
			resultsExportStageCsv($returnData, $delimiter);
		} elseif (in_array($fmt, ['excel', 'openoffice'], true)) {
			require_once __DIR__ . '/../../../inc/results_reporter/report_processor.php';
		}
	}

	/* once more scoring models are supported this should move to a separate file (or class) */
	function score($answer, $correction): int
	{
		if ($answer === null) return 0;
		$score = 1;
		switch ($correction['format']) {
			case VALUES_INT:
				if ((int)$answer !== $correction['data']) {
					$score = 0;
				}
				break;
			case VALUES_DOUBLE:
				if ((float)$answer !== $correction['data']) {
					$score = 0;
				}
				break;
			case VALUES_STRING:
				if (isset($correction['ignoreCase']) && $correction['ignoreCase'] === true) {
					if (mb_strtolower($answer) !== mb_strtolower($correction['data'])) {
						$score = 0;
					}
				} elseif ($answer !== $correction['data']) {
					$score = 0;
				}
				break;
			case VALUES_STRING_ARRAY:
				if (empty($answer)) {
					$score = 0;
					break;
				} else {
					$answer = json_decode($answer ?? '');
					if (json_last_error() !== JSON_ERROR_NONE) {
						$score = 0;
						break;
					}
				}
				//if the answer has a different amount of values than the correction it is definitely wrong
				if (count($correction['data']) !== count($answer)) {
					$score = 0;
					break;
				}
				/*
                If the amount of values is correct we need verify if all values from the answer match ar also found
                in the correction array. If this is the case we do not have to check if all values from the correction
                are also in the answer, as we already confirmed that both arrays have the same number of values.
            */
				foreach ($answer as $v) {
					if (!in_array($v, $correction['data'])) {
						$score = 0;
					}
				}
				break;
		}
		return $score;
	}

	/*
		 * maxScore must the highest possible score of a specific field so that a percentage can be calculated in the end.
		 * Currently with only the right = 1 & wrong = 0 scoring model implemented this will always return 1
		 * Once more complex scoring models are implemented this will change.
		 */
	function maxScore($correction): int
	{
		return 1;
	}

	/* Variables */
	function saveLocChanges($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth;
		/* @var $db rixPDO */
		checkParams($data, array('id', 'clickVariable', 'locData'));

		$variable = $data['clickVariable'];
		$locData = $data['locData'];
		$test = $data['id'];

		//Check if Test is still present
		$query = 'SELECT * FROM tests WHERE id=? LIMIT 1';
		$parameters = array($test);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if selected test is not available anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("The test you are trying to edit has been deleted by another user. The view will be refreshed.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			die();
		}
		if (!tmCanModifyTest($result['data'], $db)) {
			$returnData['error'] = $uiLang->translate('You do not have permission to change this test.');
			return;
		}
		tmAbortIfPublishedTestRow($result['data'], $returnData, 'This test is Published (Locked). Test variables cannot be changed while the test is locked.');

		//update test variables
		$variables = json_decode($result['data']['variables'] ?? '');
		foreach ($locData as $k => $row) {
			$lang = explode("_", $k);
			$variables->$variable->text->{$lang[0]} = $row;
		}
		$write = json_encode($variables);
		$db->prepare("UPDATE tests SET variables=? WHERE id=?");
		$db->executePrepared(array($write, $test));

		$returnData['refreshData'] = $variables;

		registerActivity($db, (int)$myAuth->userid, $test, 'test');
	}

	function createNewVariable($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth;
		/* @var $db rixPDO */
		checkParams($data, array('testId', 'locData'));

		$locData = $data['locData'];
		$test = $data['testId'];

		//Check if Test is still present
		$query = 'SELECT * FROM tests WHERE id=? LIMIT 1';
		$parameters = array($test);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if selected test is not available anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("The test you are trying to edit has been deleted by another user. The view will be refreshed.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			die();
		}
		tmAbortIfPublishedTestRow($result['data'], $returnData, 'This test is Published (Locked). Test variables cannot be changed while the test is locked.');

		//Check if variable already exists
		$variables = json_decode($result['data']['variables'] ?? '');
		if ($variables === null) $variables = new stdClass();
		if (property_exists($variables, $locData['newVariableName'])) {
			$returnData['error'] = $uiLang->translate("A variable with that name does already exist. Please use a different name.");
			$returnData['locData'] = $locData;
			die();
		}

		//write new variable to db
		foreach ($locData as $k => $row) {
			if ($k != 'newVariableName') {
				$lang = explode("_", $k);
				if (!property_exists($variables, $locData['newVariableName'])) {
					$variables->{$locData['newVariableName']} = new stdClass();
					$variables->{$locData['newVariableName']}->text = new stdClass();
				}
				$variables->{$locData['newVariableName']}->text->{$lang[0]} = $row;
			}
		}
		$variables->{$locData['newVariableName']}->global = false;
		$write = json_encode($variables);
		$db->prepare("UPDATE tests SET variables=? WHERE id=?");
		$db->executePrepared(array($write, $test));
		$returnData['refreshData'] = $variables;

		registerActivity($db, (int)$myAuth->userid, $test, 'test');
	}

	function deleteVariable($data, &$db, &$returnData): void
	{
		global $uiLang, $myAuth;
		/* @var $db rixPDO */
		checkParams($data, array('var2delete', 'id'));
		$test = $data['id'];
		$var2delete = $data['var2delete'];

		//Check if Test is still present
		$query = 'SELECT * FROM tests WHERE id=? LIMIT 1';
		$parameters = array($test);
		$result = $db->fetchRow($query, $parameters);
		//Show error message if selected test is not available anymore
		if ($result['rows'] === 0) {
			$returnData['error'] = $uiLang->translate("The test you are trying to edit has been deleted by another user. The view will be refreshed.");
			$returnData['closeEditMode'] = true;
			$returnData['reloadFolder'] = true;
			die();
		}
		tmAbortIfPublishedTestRow($result['data'], $returnData, 'This test is Published (Locked). Test variables cannot be changed while the test is locked.');
		//delete variable
		$variables = json_decode($result['data']['variables'] ?? '');
		unset($variables->$var2delete);
		$write = json_encode($variables);
		$db->prepare("UPDATE tests SET variables=? WHERE id=?");
		$db->executePrepared(array($write, $test));
		$returnData['refreshData'] = $variables;

		registerActivity($db, (int)$myAuth->userid, $test, 'test');
	}

	/*
		 * helper functions
		 */
	function deleteTestCustomContentDir(int $testId): void
	{
		// testsCommonFunctions.php lives in <OASYS_ROOT>/editor/inc/php
		// Move 3 levels up to reach <OASYS_ROOT>
		$rootDir = realpath(__DIR__ . '/../../..');
		$dir     = $rootDir . DIRECTORY_SEPARATOR . 'customContent' . DIRECTORY_SEPARATOR . $testId;

		if (!is_dir($dir)) {
			return;
		}

		$it = new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS);
		$ri = new RecursiveIteratorIterator($it, RecursiveIteratorIterator::CHILD_FIRST);

		foreach ($ri as $file) {
			if ($file->isDir()) {
				@rmdir($file->getPathname());
			} else {
				@unlink($file->getPathname());
			}
		}

		@rmdir($dir);
	}

	function duplicateTestCustomContentDir(int $sourceTestId, int $targetTestId): bool
	{
		$rootDir = realpath(__DIR__ . '/../../..');
		$source = $rootDir . DIRECTORY_SEPARATOR . 'customContent' . DIRECTORY_SEPARATOR . $sourceTestId;
		$target = $rootDir . DIRECTORY_SEPARATOR . 'customContent' . DIRECTORY_SEPARATOR . $targetTestId;
		if (!is_dir($source)) {
			return true;
		}

		$iterator = new RecursiveIteratorIterator(
			new RecursiveDirectoryIterator($source, FilesystemIterator::SKIP_DOTS),
			RecursiveIteratorIterator::SELF_FIRST
		);
		if (!is_dir($target) && !mkdir($target, 0777, true) && !is_dir($target)) {
			return false;
		}
		foreach ($iterator as $entry) {
			$relative = $iterator->getSubPathName();
			$destination = $target . DIRECTORY_SEPARATOR . $relative;
			if ($entry->isDir()) {
				if (!is_dir($destination) && !mkdir($destination, 0777, true) && !is_dir($destination)) {
					deleteTestCustomContentDir($targetTestId);
					return false;
				}
			} elseif (!copy($entry->getPathname(), $destination)) {
				deleteTestCustomContentDir($targetTestId);
				return false;
			}
		}
		return true;
	}

	function tmTestEditRevision(array $testRow): string
	{
		$fields = array('name', 'active', 'structure', 'labels', 'options', 'info', 'skin', 'variables', 'metadata', 'parent');
		$revisionData = array();
		foreach ($fields as $field) {
			$revisionData[$field] = $testRow[$field] ?? null;
		}
		return hash('sha256', json_encode($revisionData, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
	}

	function prepXp($field, $fmt, $delim)
	{
		if (is_array($field) || is_object($field)) {
			return json_encode($field, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		}
		return $field ?? '';
	}

	function getItemData($itemId, &$db, &$returnData)
	{
		/* @var $db rixPDO */
		$query = "SELECT * FROM items WHERE id=?";
		$results = $db->fetchRow($query, [$itemId]);
		if ($results['rows'] === 0) {
			return null;
		}
		decodeData($results['data'], ['languages', 'fields', 'blocks', 'parsed', 'options']);
		$draggableValues = [];
		foreach ($results['data']['fields'] as $k => $field) {
			if ($field['type'] === 'oasysChoice' && $field['choiceType'] === 'multiple') {
				//retrofit choice interactions of type multiple with all possible values for non json export
				$results['data']['fields'][$k]['format'] = 'array';
				foreach ($field['choices'] as $choice) {
					$results['data']['fields'][$k]['values'][] = bin2hex($choice['value']);
				}
			} elseif ($field['type'] === 'oasysCheckBox') {
				$results['data']['fields'][$k]['format'] = 'array';
			} elseif ($field['type'] === 'oasysDND') {
				if ($field['objectType'] === 'dz') {
					$results['data']['fields'][$k]['format'] = 'array';
					$results['data']['fields'][$k]['values'] = $draggableValues;
				} elseif ($field['objectType'] === 'dg') {
					$draggableValues[] = bin2hex($results['data']['fields'][$k]['data']['value']);
				}
			} elseif ($field['type'] === 'oasysChoiceMatrix') {
				//retrofit choice matrix checkbox groups with all possible values for non json export
				$prefix = $field['id'];
				$values = [];
				foreach ($field['labels'] as $choice) {
					$values[] = bin2hex($choice['value']);
				}
				foreach ($results['data']['fields'] as $idx => $subField) {
					//if type fits and id has the correct prefix
					if ($subField['type'] === 'oasysCheckBox' && str_starts_with($subField['id'], $prefix)) {
						$results['data']['fields'][$idx]['format'] = 'array';
						$results['data']['fields'][$idx]['values'] = $values;
					}
				}
			}
		}

		return ($results['data']);
	}

	function getAnswersData($passwordId, $testId, &$db)
	{
		/** @var rixPDO $db */
		$query = "SELECT itemId, fieldId, value FROM answers WHERE passwordId=? AND testId=?";
		$results = $db->fetchColumn($query, [$passwordId, $testId], 'itemId', 'fieldId');
		return $results['data'];
	}

	function getTestCache($passwordId, $testId, &$db): array
	{
		/** @var rixPDO $db */
		$query = "SELECT JSON_EXTRACT(structure,'$[*].hiddenID') AS structure FROM testCache WHERE passwordId=? AND testId=?";
		$results = $db->fetchColumn($query, [$passwordId, $testId]);

		$structure = [];
		foreach ($results['data'] as $arr) {
			$row = json_decode($arr ?? '', true);
			$structure = array_merge($structure, $row);
		}

		return $structure;
	}

	function getActivity($testId, &$returnData, rixPDO &$db, string $s_date = "", string $e_date = "")
	{
		global $uiLang;

		if (empty($s_date)) $s_date = "01-01-1900";
		if (empty($e_date)) $e_date = "01-01-2100";

		// final check of submitted date values
		if (preg_match('/^\d{1,2}-\d{1,2}-\d{4}$/', $s_date) !== 1 || preg_match('/^\d{1,2}-\d{1,2}-\d{4}$/', $e_date) !== 1) {
			$returnData['error'] = $uiLang->translate("Date format not valid! Please use DD-MM-YYYY only.");
			exit;
		}

		// flip date around to conform to ISO 8601 which MariaDB uses for comparison, and how our dates are stored
		$s_date = date("Y-m-d", strtotime(date($s_date)));
		$e_date = date("Y-m-d", strtotime(date($e_date)));
		$e_date .= " 23:59:59"; // makes the end date value INCLUSIVE instead of EXCLUSIVE of the date itself

		$query = "SELECT
			activity.passwordId AS passwordId,
			activity.loginId,
			logins.NAME AS login,
			passwords.tag,
			logins.displayname AS name,
			progress,
			logins.info,
			tsActiveServer
		FROM
			activity
			JOIN logins ON logins.id = activity.loginId
			JOIN passwords ON passwords.id = activity.passwordId
		WHERE
			testId = ? AND activity.tsActiveServer > ? AND activity.tsActiveServer < ?";

		$results = $db->fetchTable($query, [$testId, $s_date, $e_date], 'passwordId');
		return $results['data'];
	}

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
			if ($table == 'tests') {
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

	function fetchName($table, $tobecopied, $target, &$db)
	{
		/* @var $db rixPDO */
		$query = "SELECT name FROM " . $table . " WHERE id=?";
		$parameters = array($tobecopied);
		$result = $db->fetchRow($query, $parameters);
		$name = $result['data']['name'];
		return $name;
	}

	function fetchPath($location, &$returnData, &$db): mixed
	{
		global $uiLang;
		/* @var $db rixPDO */
		$query = "SELECT name, parent FROM testFolders WHERE id=?";
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
			$path[] = array('name' => $results['data']['name'], 'id' => $location);
		} else {
			$path = array();
			$path[] = array('name' => $results['data']['name'], 'id' => $location);
		}
		return $path;
	}

	function fetchLinearTestStructure($data, &$db, &$returnData): void
	{
		global $uiLang;
		/* @var $db rixPDO */
		checkParams($data, array('dbId'));
		$subTestView = $data['subTestView'] ?? false;
		$returnData['subTestView'] = $subTestView;
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
			$result['data']['structure'] = array('type' => $jsonData['type'], 'state' => tmNormalizeTestState($jsonData['state'] ?? 'draft'), 'items' => array());
			$result['data']['options'] = json_decode($result['data']['options'] ?? '', true);
			$result['data']['skin'] = json_decode($result['data']['skin'] ?? '', true);
			$result['data']['labels'] = json_decode($result['data']['labels'] ?? '', true);
			$result['data']['info'] = json_decode($result['data']['info'] ?? '', true);
			foreach ($jsonData['items'] as $value) {
				if ($jsonData['type'] == 'linear') {
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

	function fetchItemPath($location, &$returnData, &$db): bool|array
	{
		global $uiLang;
		/* @var $db rixPDO */
		$query = "SELECT name, parent FROM itemFolders WHERE id=?";
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
			$path = fetchItemPath($results['data']['parent'], $returnData, $db);
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

	function pathToString($path): ?string
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
	function checkPath($location, &$db, $id): bool
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
		$query = "SELECT parent FROM testFolders WHERE id=?";
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

	function ownsFolder(string $table, int $folderId, rixPDO $db, $myAuth): bool
	{
		if ($folderId <= 0) {
			return false;
		}

		$allowed = ['testFolders'];
		if (!in_array($table, $allowed, true)) {
			return false;
		}

		$row = $db->fetchRow("SELECT owner FROM {$table} WHERE id=? LIMIT 1", [$folderId]);

		if (!empty($row['error']) || ($row['rows'] ?? 0) === 0) {
			return false;
		}

		$ownerId = (int)($row['data']['owner'] ?? 0);
		return $ownerId > 0 && $ownerId === (int)$myAuth->userid;
	}

	/**
	 * Normalize custom content references in meta HTML and copy files into the
	 * current test's custom content folder.
	 *
	 * @param int   $currentTestId
	 * @param array $metaData       metaData array (language keys + possible config keys)
	 * @return array                adjusted metaData
	 */
	function normalizeMetaUploadsForTest(int $currentTestId, array $metaData, ?array &$copyErrors = null): array
	{
		// testsCommonFunctions.php is in <OASYS_ROOT>/editor/inc/php
		$rootDir = realpath(__DIR__ . '/../../..');

		foreach ($metaData as $key => $value) {
			// keys that are NOT HTML content
			if (in_array($key, ['customCSS', 'mode', 'url'], true)) {
				continue;
			}

			if (!is_string($value) || trim($value) === '') {
				continue;
			}

			$metaData[$key] = rewriteMetaUploadsHtml($value, $currentTestId, $rootDir, $copyErrors);
		}

		return $metaData;
	}

	/**
	 * Rewrite [@ OASYSROOT @]/customContent/<srcId>/... to use the current test id
	 * and copy the corresponding files into /customContent/<currentTestId>/...
	 *
	 * @param string $html
	 * @param int    $currentTestId
	 * @param string $rootDir
	 * @return string
	 */
	function rewriteMetaUploadsHtml(string $html, int $currentTestId, string $rootDir, ?array &$copyErrors = null): string
	{
		// Support canonical placeholders, absolute URLs from older editor content,
		// and root-relative URLs. Query strings are preserved but excluded from the
		// physical filename used for copying.
		$pattern = '~(?:(?:\.\./)+|\.\.)?(?:\[@\s*OASYSROOT\s*@\]|https?://[^"\'<>\s]*|)/customContent/(\d+)/([^"\'<>?\s]+)(\?[^"\'<>\s]*)?~i';

		return preg_replace_callback($pattern, static function (array $m) use ($currentTestId, $rootDir, &$copyErrors) {
			$srcTestId    = (int)$m[1];
			$relativePath = $m[2]; // e.g. 'image.svg' or 'subdir/img.png'
			$queryString = $m[3] ?? '';

			$srcBase = $rootDir . DIRECTORY_SEPARATOR . 'customContent' . DIRECTORY_SEPARATOR . $srcTestId;
			$dstBase = $rootDir . DIRECTORY_SEPARATOR . 'customContent' . DIRECTORY_SEPARATOR . $currentTestId;

			$srcFile = $srcBase . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
			$dstFile = $dstBase . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);

			if (is_file($srcFile)) {
				$dstDir = dirname($dstFile);
				if (!is_dir($dstDir) && !mkdir($dstDir, 0777, true) && !is_dir($dstDir)) {
					$copyErrors[] = $relativePath;
					return $m[0];
				}
				if (!is_file($dstFile) && !copy($srcFile, $dstFile)) {
					$copyErrors[] = $relativePath;
					return $m[0];
				}
			} elseif ($srcTestId !== $currentTestId) {
				$copyErrors[] = $relativePath;
				return $m[0];
			}

			// Always rewrite to point to the current test id
			return '[@ OASYSROOT @]/customContent/' . $currentTestId . '/' . $relativePath . $queryString;
		}, $html);
	}



	// this will always be called when the script ends even if a fatal error occurred
	// it encodes the $returnData to JSON and it adds an error message if a fatal PHP error occurred
	// this error message is registered under the 'fatalError' key and includes the file name of the PHP script and the line number of the error
	// all other errors (e.g. database) were registere under the 'error' key
	function outputJSON(): void
	{
		global $myAuth, $returnData, $action;

		// always return superadmin and admin permisison values
		$returnData['isSuper'] = $myAuth->checkSA();
		$returnData['isAdmin'] = $myAuth->checkAdmin();
		$returnData['isAE'] = $myAuth->checkElevatedAdmin();

		// updated username
		global $myAuth;
		$returnData['loggedInName'] = $myAuth->username;

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
