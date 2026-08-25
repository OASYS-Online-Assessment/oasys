<?Php

	require_once __DIR__ . "/../../../inc/php/OasysBehaviour.php";

/** @noinspection SqlResolve */
function fetchLibrary($data, &$db, &$returnData): void
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
	 */
	$ptypeArr = [
		'deleteSelection' => 'deleteSelection',
		'renameTestOrFolder' => 'rename',
		'preview' => 'preview',
		'saveTest' => 'editSelection',
		'duplicateObjects' => 'duplicate',
		'fetchLibrary' => 'fetchLibrary',
		'newTest' => 'newTest',
		"newFolder" => 'newFolder',
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
					if ($db->fetchValue("SELECT `owner` FROM `testFolders` WHERE id = ?", [intval($item['dbId'])])['data'] === $myAuth->userid) {
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
					if ($db->fetchValue("SELECT `owner` FROM `testFolders` WHERE id = ?", [intval(ltrim($item['pid'], 'f'))])['data'] === $myAuth->userid) {
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
	foreach (['newTest', 'newFolder', 'fetchIgPerm'] as $baseFnName) {
		// superadmin and folder owner bypass - they have full permission
		if ((in_array('superadmin', $userGroupList) || in_array('admin', $userGroupList)) || $db->fetchValue("SELECT `owner` FROM `testFolders` WHERE id = ?", [$location])['data'] === $myAuth->userid) {
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

	//verify if a folder with that name already exists on the same level
	$query = "SELECT COUNT(*) FROM testFolders WHERE name=? and parent=?";
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
	$db->insert('testFolders', $params);
	$results = $db->results();
	$returnData['data']['id'] = 'f' . $results['id'];

	# ----------------------------------------------- #
	# Call routine to populate permission schema info #
	# ----------------------------------------------- #
	$folderId = $results['id'];
	global $permAuth;
	$permAuth->newFolderPermSet($location, $folderId);

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
	if ($testType === 'mutation') $structure->pointer = 0;
	$structure->items = array();
	$structure = json_encode($structure);
	//verify if the test exits already
	$query = "SELECT COUNT(*) FROM tests WHERE name=? AND parent=?";
	$parameters = array($name, $location);
	$results = $db->fetchValue($query, $parameters);
	// if the name is already in use:
	if ($results['data'] != 0) {
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
	$returnData['data']['id'] = 't' . $result['id'];

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
		if ($testType !== 'mutation') {
			$labelObject = json_decode($result['data']['labels'] ?? '');
			//Find default label
			foreach ($labelObject as $key => $value) {
				if ($value->default === 'yes') {
					$labelDefault = $key;
				}
			}
		}
		$result['data']['structure'] = array('type' => $testType, 'items' => array());
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
					$query = "SELECT items.itemCode AS iCode, items.`name` AS name1, itemGroups.`name` AS name2  FROM items INNER JOIN itemGroups ON itemGroups.id = items.groupId WHERE items.id=? LIMIT 1";
					$parameters = array($value['hiddenID']);
					$queryResult = $db->fetchRow($query, $parameters);
					if ($queryResult['rows'] === 0) {
						$itemArray = array('name' => $uiLang->translate('Test page has been deleted!'), 'hiddenID' => $value['hiddenID'], 'code' => '-', 'itemGroup' => '-', 'label' => '-', 'actionField' => '-', 'actionButton' => '-', 'removed' => true);
					} else {
						$itemArray = array('name' => $queryResult['data']['name1'], 'hiddenID' => $value['hiddenID'], 'code' => $queryResult['data']['iCode'], 'itemGroup' => $queryResult['data']['name2'], 'label' => $labels, 'actionField' => $actionField, 'actionButton' => $scripts);
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

        $skins = getSkins();
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
	checkParams($data, array('id', 'status', 'type'));
	$id = $data['id'];
	$status = $data['status'];
	($data['type'] === 'folder') ? $target = 3 : $target = 4;

	if (isset($_SESSION)) {
		$user = $_SESSION['userid'];
		if ($status) {
			//Check if element is still available
			($data['type'] === 'folder') ? $query = "SELECT * FROM testFolders WHERE `id` = ? LIMIT 1" : $query = "SELECT * FROM tests WHERE `id` = ? LIMIT 1";
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
	global $uiLang;
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
	if ($newStructure == null) {
		$returnData['meta'] = new stdClass();
	} else {
		$returnData['meta'] = $newStructure;
	}
}

function testsSearch($data, &$db, &$returnData): void
{
	/* @var $db rixPDO */

	checkParams($data, array('searchString'));
	$searchString = '%' . preg_replace('/%/', $data['searchString'], '\\%') . '%';

	global $permAuth;
	global $uiLang;

	$query = "SELECT CONCAT('f',id) as id, id as 'dbId', parent as pathId, CONCAT('f', parent) as pid, 'folder' as type, `name`, `name` as label, `name` as sortKey, 'folder' as testType FROM testFolders WHERE name LIKE ? AND NOT ISNULL(parent) UNION SELECT CONCAT('t',id) as id, id as 'dbId', parent, CONCAT('f', parent) as pid, 'test' as type, `name`, `name` as label, `name` as sortKey, `structure` as testType FROM tests WHERE name LIKE ? AND JSON_EXTRACT(structure, '$.type') = ? ORDER BY name";
	$parameters = array($searchString, $searchString, 'linear');
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
	global $uiLang;
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
	$query = "SELECT * FROM tests WHERE id=? LIMIT 1";
	$parameters = array($testId);
	$result = $db->fetchRow($query, $parameters);
	$structure = json_decode($result['data']['info'] ?? '');
	if ($structure == null) {
		$returnData['meta'] = new stdClass();
	} else {
		$returnData['meta'] = $structure;
	}
}

// end meta tags -----------------------------------

function search($data, &$db, &$returnData): void
{
	/* @var $db rixPDO */
	checkParams($data, array('searchString'));
	$searchString = '%' . preg_replace('/%/', $data['searchString'], '\\%') . '%';

	global $permAuth; // init permAuth object for perm result checks

	$query = "SELECT CONCAT('f',id) as id, id as 'dbId', parent as pathId, CONCAT('f', parent) as pid, 'folder' as type, `name`, `name` as label, `name` as sortKey, 'folder' as testType FROM testFolders WHERE name LIKE ? AND NOT ISNULL(parent) UNION SELECT CONCAT('t',id) as id, id as 'dbId', parent, CONCAT('f', parent) as pid, 'test' as type, `name`, `name` as label, `name` as sortKey, `structure` as testType FROM tests WHERE name LIKE ? ORDER BY name";
	$parameters = array($searchString, $searchString);
	$result = $db->fetchTable($query, $parameters);
	$returnData['data']['list'] = $result['data'];

	//check the items & stimuli for matches
	$query = "SELECT id, structure FROM tests";
	$parameters = array();
	$result = $db->fetchTable($query, $parameters);

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

	foreach ($result['data'] as $key => $row) {
		$jsonData = json_decode($row['structure'] ?? '', true);

		if ($jsonData != null) {
			//fetching parent data (Test)
			$query = "SELECT CONCAT('t',id) as id, id as 'dbId', parent as pathId, CONCAT('f', parent) as pid, 'test' as type, `name`, `name` as label, `name` as sortKey, `structure` as testType FROM tests WHERE id = ? LIMIT 1";
			$parameters = array($row['id']);
			$resParent = $db->fetchRow($query, $parameters);

			/* Permission check on each iteration -- short-circuit iteration if the associated folder ID does not have read rights */
			$subHasRead = false;
			if ($resParent['data']['type'] === 'test') $subHasRead = $permAuth->permCheck(['remCall' => true, 'fid' => $resParent['data']['pathId'], 'action' => 'search']);
			if ($resParent['data']['type'] === 'folder') $subHasRead = $permAuth->permCheck(['remCall' => true, 'fid' => intVal($resParent['data']['dbId']), 'action' => 'search']);
			if ($subHasRead !== true) continue;

			foreach ($jsonData['items'] as $k => $r) {

				$query = "SELECT items.name FROM items WHERE id = ? AND name LIKE ? LIMIT 1";
				$parameters = array($r['hiddenID'], $searchString);
				$res = $db->fetchRow($query, $parameters);

				if (count($res['data']) > 0) {
					$resParent['data']['subresult'] = 'Test page name: ';
					$resParent['data']['subresultvalue'] = $res['data']['name'];
					array_push($returnData['data']['list'], $resParent['data']);
				}

				$query = "SELECT items.itemCode FROM items WHERE id = ? AND itemCode LIKE ? LIMIT 1";
				$parameters = array($r['hiddenID'], $searchString);
				$res = $db->fetchRow($query, $parameters);

				if (count($res['data']) > 0) {
					$resParent['data']['subresult'] = 'Test page code: ';
					$resParent['data']['subresultvalue'] = $res['data']['itemCode'];
					array_push($returnData['data']['list'], $resParent['data']);
				}
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
	checkParams($data, array('searchString'));
	$searchString = '%' . preg_replace('/%/', $data['searchString'], '\\%') . '%';
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
					WHERE name LIKE ?
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
						   NULL AS subresult,
						   NULL AS subresultvalue
					FROM itemGroups
					WHERE name LIKE ?
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
					INNER JOIN items WHERE items.name LIKE ? AND itemGroups.id=items.groupId
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
					INNER JOIN items WHERE items.itemCode LIKE ? AND itemGroups.id=items.groupId
					ORDER BY name";

	$parameters = array($searchString, $searchString, $searchString, $searchString);
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

function deleteSelection($data, &$db, &$returnData): void
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
		$db->prepare("DELETE FROM testFolders WHERE " . $folderClause);
		$db->executePrepared($folders);
	}
	if (count($groups) > 0) {
		$db->prepare("DELETE FROM tests WHERE " . $groupClause);
		$db->executePrepared($groups);
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

	$logIdsAndNames = [];

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
			die();
		}
		//End check
		//Delete activity of the testee
		$db->prepare("DELETE FROM activity WHERE  testId=?");
		$db->executePrepared(array($test));

		// delete associated scoring table entry(ies), if any
		$db->fetchValue("DELETE FROM `scoring` WHERE `testId` = ?", [$test]);

		array_push($logIdsAndNames, "[{$result['data']['id']}] (\"{$result['data']['name']}\")");
	}

	// log action
	global $myAuth;
	$myAuth->prepLog($logIdsAndNames, "testResResults", $returnData);
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
			}
		}
	}
	if (count($tests) > 0) {
		foreach ($tests as $test) {
			$name = fetchName('tests', $test, $target, $db);
			$db->prepare("UPDATE tests SET parent=?, name=? WHERE id=?");
			$db->executePrepared(array($target, $name, $test));
		}
	}

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


	//Folders
	//////////////////////////////////////////////////////////////////////////////////////////////////////////
	// Folder duplication currently not used due to filer settings, leaving it in until final decisions are made
	// Caution: Recursive copy function has not yet been modified to match the needs of the test manager
	//////////////////////////////////////////////////////////////////////////////////////////////////////////
	foreach ($folders as $folder) {
		if (checkPath($target, $db, $folder) === false) {
			$returnData['error'] = $uiLang->translate('You are not able to copy a folder into itself!');
			die();
		} else {
			$name = checkExisting('testFolders', $folder, $target, $db);
			$db->prepare("INSERT INTO testFolders SELECT NULL as id, ? as name, ? as parent FROM testFolders WHERE id=?");
			$db->executePrepared(array($name, $target, $folder));
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
			$structureSaveComplete = array('type' => 'fluid', 'items' => $structureSave);
			$structureSaveComplete = json_encode($structureSaveComplete);

			//save test-structure to db
			$db->prepare("UPDATE tests SET structure=? WHERE id=?");
			$db->executePrepared(array($structureSaveComplete, $newTest));
			$result = $db->results();
			if ($result['error']) {
				$returnData['error'] = $result['errorMsg'];
				$returnData['closeEditMode'] = true;
				$returnData['reloadFolder'] = true;
				die();
			}
		}
	}
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
	global $uiLang;
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
	}

	// log action
	global $myAuth;
	$myAuth->prepLog($data, "rename", $returnData);

	fetchLibrary($data, $db, $returnData);
}

function saveFluidPoolOrder($data, &$db, &$returnData): void
{
	global $uiLang;
	/* @var $db rixPDO */
	checkParams($data, array('id'));

	//Check if the pool assignment is still present and fetch order value
	$query = 'SELECT random FROM testFluidStructure WHERE id=? LIMIT 1';
	$parameters = array($data['id']);
	$result = $db->fetchRow($query, $parameters);
	//Show error message if selected test is not available anymore
	if ($result['rows'] === 0) {
		$returnData['error'] = $uiLang->translate("This pool assignment has been deleted. Test Manager will be closed.");
		$returnData['closeEditMode'] = true;
		die();
	}
	$orderVal = (int)$result['data']['random'];
	$db->prepare("UPDATE testFluidStructure SET random=? WHERE id=?");
	if ($orderVal === 0) {
		$db->executePrepared(array(1, $data['id']));
	} else {
		$db->executePrepared(array(0, $data['id']));
	}
}

function saveFluidPageUsage($data, &$db, &$returnData): void
{
	global $uiLang;
	/* @var $db rixPDO */
	checkParams($data, array('id', 'pageUsage'));

	//Check if the pool assignment is still present and fetch order value
	$query = 'SELECT random FROM testFluidStructure WHERE id=? LIMIT 1';
	$parameters = array($data['id']);
	$result = $db->fetchRow($query, $parameters);
	//Show error message if selected test is not available anymore
	if ($result['rows'] === 0) {
		$returnData['error'] = $uiLang->translate("This pool assignment has been deleted. Test Manager will be closed.");
		$returnData['closeEditMode'] = true;
		die();
	}
	$db->prepare("UPDATE testFluidStructure SET numberOfItems=? WHERE id=?");
	$db->executePrepared(array($data['pageUsage'], $data['id']));
}

function saveTest($data, &$db, &$returnData): void
{
	global $uiLang;
	/* @var $db rixPDO */
	checkParams($data, array('id'));
	$mSave = $data['mSave'] ?? false;
	//Check if the test is still present
	$query = 'SELECT * FROM tests WHERE id=? LIMIT 1';
	$parameters = array($data['id']);
	$result = $db->fetchRow($query, $parameters);
	//Show error message if selected test is not available anymore
	if ($result['rows'] === 0) {
		$returnData['error'] = $uiLang->translate("You are trying to save a test which has been deleted by another user. The view will be refreshed.");
		$returnData['closeEditMode'] = true;
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
	}

	if (isset($data['structure'])) {
		$structureSave = $data['structure'];
		if ($mSave === false) {
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
			$structureSaveComplete = array('type' => $data['testtype'], 'items' => $structureSave);
		} else {
			for ($i = 0; $i < count($structureSave); $i++) {
				unset($structureSave[$i]['actionButtons']);
				unset($structureSave[$i]['id']);
				unset($structureSave[$i]['maxScore']);
				unset($structureSave[$i]['name']);
				unset($structureSave[$i]['pages']);
			}
			$structureSaveComplete = array('type' => 'mutation', 'pointer' => 0, 'items' => $structureSave);
		}
		$data['structure'] = json_encode($structureSaveComplete);

		//save modified test-structure to db
		$db->prepare("UPDATE tests SET structure=? WHERE id=?");
		$db->executePrepared(array($data['structure'], $data['id']));
	}

	if (isset($data['metaData'])) {
		checkParams($data, array('metaType'));
		$metaType = $data['metaType'];
		$metadata = $result['data']['metadata'] ?? '';
		$decodedMetadata = json_decode($metadata, false);
		$write = (json_last_error() === JSON_ERROR_NONE) ? $decodedMetadata : new stdClass();
		$write->$metaType = $data['metaData'];
		//save modified meta data to db
		$db->prepare("UPDATE tests SET metadata=? WHERE id=?");
		$db->executePrepared(array(json_encode($write), $data['id']));
	}

	if (isset($data['startPreview']) && $data['startPreview'] === true) {
		$returnData['startPreview'] = true;
	}
}

function saveSkinAssignment($data, &$db, &$returnData): void
{
    global $uiLang;
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

                if (isset($structureData['items'][$key]['overrides'][$k]) &&
                    $structureData['items'][$key]['overrides'][$k] === $valueToCheck) {
                    unset($structureData['items'][$key]['overrides'][$k]);
                }
            }
        }
        $structureDataJson = json_encode($structureData);
        $db->prepare("UPDATE tests SET structure=? WHERE id=?");
        $db->executePrepared(array($structureDataJson, $id));
    }
}


function saveNewFluidBlock($data, &$db, &$returnData): void
{
	global $uiLang;
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

	//Save new fluid test block
	$data = array(array('testID' => $testId, 'poolID' => $poolId, 'numberOfitems' => $itemsUsed, 'random' => $random));
	$db->insert('testFluidStructure', $data);
	$insertResult = $db->results();
	//update structure of the test
	$latestID = $insertResult['id'];

	$jsonData = json_decode($result['data']['structure'] ?? '', true);
	$structureSave = $jsonData['items'];
	array_push($structureSave, array('hiddenID' => $latestID, 'labelID' => $labelDefault, 'fixedPosition' => false, 'overrides' => new stdClass(), 'scripts' => new stdClass()));
	$structureSaveComplete = array('type' => 'fluid', 'items' => $structureSave);
	$structureSaveComplete = json_encode($structureSaveComplete);

	//save modified test-structure to db
	$db->setAdditionalErrorData(array('closeEditMode' => true, 'reloadFolder' => true));
	$db->prepare("UPDATE tests SET structure=? WHERE id=?");
	$db->executePrepared(array($structureSaveComplete, $testId));
	$db->clearAdditionalErrorData();
}

function updateFluidBlocks($data, &$db, &$returnData): void
{
	global $uiLang;
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

	$structureSave = array('type' => 'fluid', 'items' => $newStructure);
	$structureSave = json_encode($structureSave);
	//save modified test-structure to db
	$db->setAdditionalErrorData(array('closeEditMode' => true, 'reloadFolder' => true));
	$db->prepare("UPDATE tests SET structure=? WHERE id=?");
	$db->executePrepared(array($structureSave, $testId));
	$db->clearAdditionalErrorData();
}

function createLabel($data, &$db, &$returnData): void
{
	global $uiLang;
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
}

function saveLabel($data, &$db, &$returnData): void
{
	global $uiLang;
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
}

function updateLabels($data, &$db, &$returnData): void
{
	global $uiLang;
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
}

function setDefaultLabel($data, &$db, &$returnData): void
{
	global $uiLang;
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
}

function plausibilityFluidCheck($data, &$db, &$returnData): void
{
	global $uiLang;
	/* @var $db rixPDO */
	checkParams($data, array('id', 'languages', 'structure'));
	$id = $data['id'];
	//Check if Test is still present & fetch data
	$query = '
    SELECT 
        t.*, 
        CASE 
            WHEN JSON_EXTRACT(t.skin, "$.skinOptions.privacyPolicy.value") IS NOT NULL 
                 AND JSON_EXTRACT(t.skin, "$.skinOptions.privacyPolicy.value") = "true" 
            THEN TRUE 
            ELSE FALSE
        END AS activePn,
        t.metadata
    FROM 
        tests t
    WHERE 
        t.id = ? 
    LIMIT 1';
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
	if ($result['data']['activePn'] === 1) {
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
    $query = '
    SELECT 
        t.*, 
        CASE 
            WHEN JSON_EXTRACT(t.skin, "$.skinOptions.privacyPolicy.value") IS NOT NULL 
                 AND JSON_EXTRACT(t.skin, "$.skinOptions.privacyPolicy.value") = "true" 
            THEN TRUE 
            ELSE FALSE
        END AS activePn,
        t.metadata
    FROM 
        tests t
    WHERE 
        t.id = ? 
    LIMIT 1';

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
    if ($result['data']['activePn'] === 1) {
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
	global $uiLang;
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
}

function editTestpool($data, &$db, &$returnData): void
{
	global $uiLang;
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
	global $uiLang;
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
}

function fetchTestResultOverview($data, rixPDO &$db, &$returnData): void
{
	/* @var $db rixPDO */
	checkParams($data, ['selectedTest', 'location']);
	$selectedTest = $data['selectedTest'];

	//check activity data
	$query = "select count(*) as pwdUsingTest, loginId as testee from activity where testId=? group by loginId ";
	$parameters = array($selectedTest);
	$result = $db->fetchTable($query, $parameters);
	$returnData['activityData'] = $result['data'];
	$returnData['testId'] = $data['selectedTest'];

	if (!empty($result['data'])) {

		$query = "SELECT CONCAT(passwordId,'_',testId) AS hiddenID,
        (SELECT name from logins where logins.id=activity.loginId) AS testeename,
        (SELECT name from passwords where passwords.id=activity.passwordId) AS testeepass,
        (SELECT tag from passwords where passwords.id=activity.passwordId) AS passtag,
        progress AS progressField
        FROM    activity
        WHERE activity.testId =?
        order by testeename";
		$parameters = array($selectedTest);
		$result = $db->fetchTable($query, $parameters);

		//Prepare Data
		foreach ($result['data'] as $k => $v) {
			$result['data'][$k]['progressField'] = round($v['progressField'] * 100);
			$result['data'][$k]['testeepass'] = Crypt::decryptString($v['testeepass']);
		}

		$scoreQ = $db->fetchColumn("SELECT `passwordId` FROM `scoring` WHERE `testId` = ?", [$selectedTest])['data'];
		$pwdQ = $db->fetchColumn("SELECT `id` FROM (SELECT `id`, JSON_CONTAINS(JSON_EXTRACT(`structure`, '$[*].hiddenID'), ?) AS `a1` FROM `passwords`) `a0` WHERE `a1` = 1;", [$selectedTest])['data'];
		$noLoginCount = count(array_diff($pwdQ, $scoreQ));
		$returnData['noLogins'] = $noLoginCount;
		$returnData['testActivity'] = $result['data'];
	}
}

function fetchTestResults($data, &$db, &$returnData): void
{
	/* @var $db rixPDO */
	checkParams($data, array('selectedTest', 'mode', 'format', 'startDate', 'endDate'));

	$testId = $data['selectedTest'];
	$mode = $data['mode'];
	$fmt = $data['format'];
	$delim = $data['delimiter'];
	$s_date = $data['startDate'];
	$e_date = $data['endDate'];

	$activity = getActivity($testId, $returnData, $db, $s_date, $e_date);
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
	buildTestData($testId, $db, $testData, $testType, $structure);

	if ($mode === 'nojson') {
		$headers = ['legend' => ['', 'login', 'tag', 'progress', 'lastActivity'], 'itemId' => ['page id', '', '', '', ''], 'itemName' => ['page name', '', '', '', ''], 'itemCode' => ['page code', '', '', '', ''], 'field' => ['variable', '', '', '', ''], 'subvalue' => ['subvalue', '', '', '', ''], 'type' => ['type', '', '', '', '']];
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
		$headers = ['legend' => ['', 'login', 'tag', 'progress', 'lastActivity', 'metainfo'], 'itemId' => ['page id', '', '', '', '', ''], 'itemName' => ['page name', '', '', '', '', ''], 'itemCode' => ['page code', '', '', '', '', ''], 'field' => ['variable', '', '', '', '', ''], 'type' => ['type', '', '', '', '', '']];
	}

	foreach ($structure as $itemId) {
		if (isset($testData['items'][$itemId])) {
			continue;
		}
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
		$set = ['', $row['login'], $row['tag'], $row['progress'], $row['tsActiveServer']];
		if ($mode === 'nojson') {
			if ($row['info']) {
				$info = json_decode($row['info'] ?? '', true);
			} else {
				$info = [];
			}
			foreach ($metaKeys as $metaKey) {
				if (isset($info[$metaKey])) {
					$set[] = $info[$metaKey];
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

	$returnData['testData'] = $testData;
	$returnData['csvHeaders'] = $headers;
	$returnData['csvRows'] = $exportData;
	$returnData['format'] = $fmt;
	$returnData['mode'] = $mode;

	if (in_array($fmt, ['excel', 'openoffice'])) {
		require_once __DIR__ . '/../../../inc/results_reporter/report_processor.php';
	}
}

function fetchBehaviourTiming(array $data, rixPDO &$db, array &$returnData): void
{
	checkParams($data, array('selectedTest', 'format', 'startDate', 'endDate'));

	$testId = $data['selectedTest'];
	$fmt = $data['format'];
	$delim = $data['delimiter'];
	$s_date = $data['startDate'] !== '' ? $data['startDate'] : null;
	$e_date = $data['endDate'] !== '' ? $data['endDate'] : null;

	$headers = ['legend' => ['', 'login', 'tag'], 'itemId' => ['page id', '', ''], 'itemName' => ['page name', '', ''], 'itemCode' => ['page code', '', '']];
	$behaviour = new OasysBehaviour($testId, $s_date, $e_date);
	$structure = $behaviour->getStructure();
	$testData = $behaviour->getTestData();
	$timeSpent = $behaviour->getTimeSpentOnItems();
	$csvRows = [];
	foreach ($structure as $itemId) {
		$headers['legend'][] = '';
		$headers['itemId'][] = $itemId;
		$headers['itemName'][] = $testData['pages'][$itemId]['name'] ?? '';
		$headers['itemCode'][] = $testData['pages'][$itemId]['code'] ?? '';
	}
	foreach ($timeSpent as $timeData) {
		$set = ['', $timeData['login'], $timeData['tag']];
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

	if (in_array($fmt, ['excel', 'openoffice'])) {
		require_once __DIR__ . '/../../../inc/results_reporter/report_processor.php';
	}
}

function fetchDetailedTestScore($data, rixPDO &$db, &$returnData): void
{
	/* @var $db rixPDO */
	checkParams($data, array('selectedTest', 'detail', 'format', 'startDate', 'endDate'));
	$testId = $data['selectedTest'];
	$detail = $data['detail'];
	$fmt = $data['format'];
	$delimiter = $data['delimiter'];
	$s_date = $data['startDate'];
	$e_date = $data['endDate'];

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

	// modify report score string contents to show man corr items which have not been touched
	foreach ($returnData['csvRows'] as $pwdId => &$scoreVals) {
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

	// special include which parses scoring data and produces XLSX or ODS output for download
	if (in_array($fmt, ['excel', 'openoffice'])) {
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
	global $uiLang;
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
}

function createNewVariable($data, &$db, &$returnData): void
{
	global $uiLang;
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
}

function deleteVariable($data, &$db, &$returnData): void
{
	global $uiLang;
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
	//delete variable
	$variables = json_decode($result['data']['variables'] ?? '');
	unset($variables->$var2delete);
	$write = json_encode($variables);
	$db->prepare("UPDATE tests SET variables=? WHERE id=?");
	$db->executePrepared(array($write, $test));
	$returnData['refreshData'] = $variables;
}

/*
		 * helper functions
		 */

function prepXp($field, $fmt, $delim)
{

	if (in_array($fmt, ['excel', 'openoffice'])) return $field;
	if ($fmt !== 'csv') return $field;
	if (preg_match("/[\"$delim\n]/", $field)) {
		$field = preg_replace('/\"/', '""', $field);
		$field = '"' . $field . '"';
	}
	return $field;
}

//extract test data from database and build up structure correctly for fluid tests (including all possible pages)
function buildTestData(int $testId, rixPDO &$db, array &$testData, string &$testType, array &$structure): void
{
	$query = "SELECT id,`name`,JSON_EXTRACT(structure,'$.type') AS type,JSON_EXTRACT(structure,'$.items[*].hiddenID') AS structure FROM tests WHERE id=?";
	$results = $db->fetchRow($query, [$testId]);

	decodeData($results['data'], ['structure', 'type']);
	$testData = $results['data'];
	$testType = $testData['type'];

	/* the $structure produced in the following code is simply an array of all ids used in the test */
	if ($testType === 'fluid') {
		//find all possible pages for a fluid test
		if (count($results['data']['structure']) === 0) {
			$testData['structure'] = [];
		} else {
			$query = <<<query
						SELECT DISTINCT
							f_pages.pageId 
						FROM
							( SELECT f_structure.* FROM tests t1, JSON_TABLE ( t1.structure, '$.items[*]' COLUMNS ( f_structureId INT path '$.hiddenID' )) f_structure WHERE t1.id = ? ) t2
							INNER JOIN testFluidStructure tfs ON t2.f_structureId = tfs.id
							INNER JOIN testPools tp ON tfs.poolID = tp.id,
							JSON_TABLE (
								tp.structure,
								'$.items[*]' COLUMNS ( pageId INT path '$.hiddenID' )
							) f_pages
			query;
			$results = $db->fetchColumn($query, [$testId]);
			$testData['structure'] = $results['data'];
		}
	} elseif ($testType === 'mutation') {
		$query = <<<query
					SELECT DISTINCT
						m_pages.* 
					FROM
						( SELECT m_struct.* FROM tests, JSON_TABLE ( tests.structure, '$.items[*]' COLUMNS ( testId INT path '$.hiddenID' )) AS m_struct WHERE tests.id = ? ) t1
						INNER JOIN tests t2 ON t1.testId = t2.id,
						JSON_TABLE (
							t2.structure,
							'$.items[*]' COLUMNS ( pageId INT path '$.hiddenID' )
						) AS m_pages
					UNION
					SELECT
						DISTINCT cached_pages.* 
					FROM
						testCache,
						JSON_TABLE (
							structure,
						'$[*]' COLUMNS ( pageId INT PATH '$.hiddenID' )) AS cached_pages
					WHERE
						testId = ?
		query;
		$results = $db->fetchColumn($query, [$testId, $testId]);
		$testData['structure'] = $results['data'];
	}

	//get names and codes for all pages in test
	if (count($testData['structure']) > 0) {
		$variableString = $db->variableString($testData['structure']);
		$query = "SELECT id,`name`,`itemCode` as code FROM items WHERE id IN " . $variableString;
		$results = $db->fetchTable($query, $testData['structure'], 'id');
		$testData['pages'] = $results['data'];
	} else {
		$testData['pages'] = [];
	}

	//this applies to all types of tests
	$structure = $testData['structure'];
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
			passwordId,
			logins.NAME AS login,
			passwords.tag,
			progress,
			logins.info,
			tsActiveServer
		FROM
			activity
			JOIN logins ON logins.id = loginID
			JOIN passwords ON passwords.id = passwordId
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
		$result['data']['structure'] = array('type' => $jsonData['type'], 'items' => array());
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
