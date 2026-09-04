<?php

	/** @phan-file-suppress PhanUnusedGlobalFunctionParameter, PhanUnusedVariable, PhanRedefineFunction, PhanUnusedClosureParameter, PhanTypeArraySuspiciousNullable, PhanSuspiciousWeakTypeComparison, PhanUnusedVariableValueOfForeachWithKey, PhanUnusedPublicNoOverrideMethodParameter */

	//the JSON output will happen, even if a fatal error prevents the script from finishing
	register_shutdown_function('outputJSON');
	require_once __DIR__ . '/../../inc/php/initBackend.php';

	$action = filter_input(INPUT_POST, 'action');
	if (!$action) {
		$action = "";
	}

	$returnData = [];
	$returnData['data'] = [];
	$returnData['action'] = $action;
	$returnData['error'] = false;

	# ----------------------- #
	# Authentication Includes #
	# ----------------------- #
	$pageName = "dashboard"; // set to the related 'editor button' string name (e.g., 'items')
	$isSubMod = true;        // set true if a module page in a subdirectory
	$isActionFile = true;      // set true if an "xxxActions.php" file
	require_once '../../inc/php/authCommonFunctions.php'; // required for authentication inclusion

	$returnData = (array)$myAuth->returnData;

	// if the auth constructor results in an error, we want to immediately exit and report said error
	if ($myAuth->returnData['error'] !== false) {
		exit;
	}

	$data = filter_input(INPUT_POST, 'data');
	if ($data) {
		$data = json_decode($data ?? '', true);
	}
	if (!$data) {
		$data = array();
	}
	//data field must be separately JSON encoded before sending to get past max_input_vars limitation

	/**
	 * Owner override helper:
	 * - Admins/Elevated/SA are always allowed
	 * - If the object (or its parent folder) owner equals current user, grant access even if group lacks it
	 */
	function hasOwnerAccess(bool $isAdminish, $ownerId, userAuth $myAuth): bool {
		if ($isAdminish) return true;
		if ($ownerId !== null && (int)$ownerId === (int)$myAuth->userid) return true;
		return false;
	}

	function wlLoginAccessParentSql(string $loginAlias, string $templateAlias): string {
		return "COALESCE($templateAlias.parent, $loginAlias.parent)";
	}

	function wlCanReadLoginFolder(int $folderId, rixPDO &$db, userAuth &$myAuth): bool {
		if ($folderId <= 0) return false;
		$ugList = $myAuth->usergroup ?? [];
		if (!is_array($ugList) || count($ugList) === 0) return false;

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

		return ($res['data'] === 1 || $res['data'] === true || $res['data'] === "1");
	}

	if (oasysRejectUnknownAction(__FILE__, $action, $returnData)) exit;
	$action($data, $db, $returnData, $myAuth);

	/*
	###############
	FUNCTIONS START
	###############
	*/

	function getContent($data, rixPDO &$db, &$returnData, userAuth &$myAuth)
	{
		if (!isset($returnData['data'])) {
			$returnData['data'] = [];
		}
		$permAuth = new permAuth("fetchLibrary", $data, $myAuth);
		$isAdmin = ($myAuth->checkAdmin() || $myAuth->checkElevatedAdmin() || $myAuth->checkSA());

		$query = "SELECT w.*,
				CASE WHEN w.foreign_table = 1 THEN f.name ELSE g.name END AS objectName,
				CASE WHEN w.foreign_table = 1 THEN f.parent ELSE g.parent END AS objectParent,
				CASE WHEN w.foreign_table = 1 THEN f.owner ELSE pf.owner END AS accessOwner,
				COALESCE(u.name, '-') AS ownerName
			FROM watchList w
			LEFT JOIN itemFolders f ON w.foreign_table = 1 AND f.id = w.foreign_id
			LEFT JOIN itemGroups g ON w.foreign_table = 2 AND g.id = w.foreign_id
			LEFT JOIN itemFolders pf ON pf.id = g.parent
			LEFT JOIN users u ON u.id = f.owner
			WHERE w.user_id = ? AND w.foreign_table IN (1,2)";
		$res = $db->fetchTable($query, [$myAuth->userid]);

		foreach ($res['data'] as $r) {
			if ($r['foreign_table'] == 1) {
				// --- CONTENT FOLDER ---
				$name = $r['objectName'] ?? ('#' . $r['foreign_id']);
				$ownerId = $r['accessOwner'] ?? null;

				$accessVal = hasOwnerAccess($isAdmin, $ownerId, $myAuth)
					? true
					: $permAuth->getAccessVal("items", "fetchLibrary", "itemObject", $r['foreign_id']);

				if ($accessVal === false) {
					$returnData['data'][] = [
						'type' => 'folder',
						'id' => (int)$r['foreign_id'],
						'name' => $name,
						'watchid' => (int)$r['id'],
						'access' => false,
					];
					continue;
				}

				$path = pathToString(fetchPath('itemFolders', $r['objectParent']));

				$returnData['data'][] = [
					'type' => 'folder',
					'id' => (int)$r['foreign_id'],
					'name' => $name,
					'owner' => $r['ownerName'],
					'message' => '',
					'watchid' => (int)$r['id'],
					'path' => $path . '/' . $name,
					'access' => true,
				];
			} else {
				// --- PAGE GROUP ---
				$parentId = $r['objectParent'] ?? null;
				$name = $r['objectName'] ?? ('#' . $r['foreign_id']);
				$ownerId = $r['accessOwner'] ?? null;

				$accessVal = hasOwnerAccess($isAdmin, $ownerId, $myAuth)
					? true
					: $permAuth->getAccessVal("items", "fetchLibrary", "itemObject", $parentId);

				if ($accessVal === false) {
					$returnData['data'][] = [
						'type' => 'group',
						'id' => (int)$r['foreign_id'],
						'name' => $name,
						'watchid' => (int)$r['id'],
						'access' => false,
						'pagesCount' => 0,
						'pages' => [],
					];
					continue;
				}

				// Details
				$path = pathToString(fetchPath('itemFolders', $parentId));

				$pagesTbl = $db->fetchTable(
					"SELECT id, name, itemCode, languages
                   FROM items
                  WHERE groupId = ?
               ORDER BY name ASC",
					[$r['foreign_id']]
				);

				$pagesOut = [];
				foreach ($pagesTbl['data'] as $row) {
					$langsRaw = $row['languages'] ?? null;
					$langsStr = '';
					if ($langsRaw !== null) {
						$decoded = json_decode($langsRaw, true);
						if (is_array($decoded)) $langsStr = implode(',', $decoded);
						else $langsStr = trim((string)$langsRaw);
					}
					$pagesOut[] = [
						'id' => (int)$row['id'],
						'name' => (string)$row['name'],
						'itemCode' => (string)($row['itemCode'] ?? ''),
						'langs' => $langsStr,
					];
				}

				$returnData['data'][] = [
					'type' => 'group',
					'id' => (int)$r['foreign_id'],
					'name' => $name,
					'owner' => '',
					'message' => '',
					'watchid' => (int)$r['id'],
					'path' => $path . '/' . $name,
					'access' => true,
					'pagesCount' => count($pagesOut),
					'pages' => $pagesOut,
				];
			}

		}

		// Sort: unlocked first, then by name (if present)
		usort($returnData['data'], function ($a, $b) {
			if (($a['access'] ?? true) !== ($b['access'] ?? true)) {
				return ($a['access'] ?? true) ? -1 : 1;
			}
			return strcasecmp($a['name'] ?? '', $b['name'] ?? '');
		});
	}


	function getTests($data, rixPDO &$db, &$returnData, userAuth &$myAuth)
	{
		if (!isset($returnData['data'])) {
			$returnData['data'] = [];
		}
		$permAuth = new permAuth("fetchLibrary", $data, $myAuth);
		$isAdmin = ($myAuth->checkAdmin() || $myAuth->checkElevatedAdmin() || $myAuth->checkSA());

		$query = "SELECT w.*,
				CASE WHEN w.foreign_table = 3 THEN f.name ELSE t.name END AS objectName,
				CASE WHEN w.foreign_table = 3 THEN f.parent ELSE t.parent END AS objectParent,
				CASE WHEN w.foreign_table = 3 THEN f.owner ELSE pf.owner END AS accessOwner,
				COALESCE(u.name, '-') AS ownerName,
				t.active AS testActive,
				JSON_EXTRACT(t.structure, '$.type') AS testType,
				t.options AS testOptions
			FROM watchList w
			LEFT JOIN testFolders f ON w.foreign_table = 3 AND f.id = w.foreign_id
			LEFT JOIN tests t ON w.foreign_table = 4 AND t.id = w.foreign_id
			LEFT JOIN testFolders pf ON pf.id = t.parent
			LEFT JOIN users u ON u.id = f.owner
			WHERE w.user_id = ? AND w.foreign_table IN (3,4)";
		$res = $db->fetchTable($query, [$myAuth->userid]);

		foreach ($res['data'] as $r) {
			if ($r['foreign_table'] == 3) {
				// --- TEST FOLDER ---
				$name = $r['objectName'] ?? ('#' . $r['foreign_id']);
				$ownerId = $r['accessOwner'] ?? null;

				$accessVal = hasOwnerAccess($isAdmin, $ownerId, $myAuth)
					? true
					: $permAuth->getAccessVal("tests", "fetchLibrary", "itemObject", $r['foreign_id']);

				if ($accessVal === false) {
					$returnData['data'][] = [
						'type' => 'folder',
						'id' => (int)$r['foreign_id'],
						'name' => $name,
						'watchid' => (int)$r['id'],
						'access' => false,
					];
					continue;
				}

				$path = pathToString(fetchPath('testFolders', $r['foreign_id']));

				$returnData['data'][] = [
					'type' => 'folder',
					'id' => (int)$r['foreign_id'],
					'name' => $name,
					'owner' => $r['ownerName'],
					'ttype' => ' ',
					'lang' => ' ',
					'active' => ' ',
					'message' => '',
					'watchid' => (int)$r['id'],
					'path' => $path,
					'access' => true,
				];
			} else {
				// --- TEST ---
				$parentId = $r['objectParent'] ?? null;
				$name = $r['objectName'] ?? ('#' . $r['foreign_id']);
				$ownerId = $r['accessOwner'] ?? null;

				$accessVal = hasOwnerAccess($isAdmin, $ownerId, $myAuth)
					? true
					: $permAuth->getAccessVal("tests", "fetchLibrary", "itemObject", $parentId);

				if ($accessVal === false) {
					$returnData['data'][] = [
						'type' => 'test',
						'id' => (int)$r['foreign_id'],
						'name' => $name,
						'watchid' => (int)$r['id'],
						'access' => false,
					];
					continue;
				}

				// Access granted ? load details (without results/activity query)
				$path = pathToString(fetchPath('testFolders', $parentId));

				$options = json_decode($r['testOptions'] ?? '{}');
				$languageCodes = [];
				foreach (wlLanguages() as $language) {
					$code = $language['code'];
					if (isset($options->$code) && $options->$code === true) $languageCodes[] = $code;
				}

				// state
				$active = ((int)$r['testActive'] === 1) ? 'active' : 'inactive';
				$ttype = str_replace('"', '', (string)($r['testType'] ?? ''));

				// restrictions / schedule
				$restrictions = fetchRestrictions($r['foreign_id'], $r['testOptions'] ?? null);
				if ($restrictions['scheduled'] === true) {
					$active = 'scheduled';
				}
				if (($restrictions['unexpired'] ?? true) === false) {
					$active = 'expired';
				}

				// issues
				$issues = plausCheckTests($r['foreign_id']);

				$returnData['data'][] = [
					'type' => 'test',
					'id' => (int)$r['foreign_id'],
					'name' => $name,
					'owner' => ' ',
					'ttype' => $ttype,
					'lang' => implode(',', $languageCodes),
					'active' => $active,
					'message' => '',
					'watchid' => (int)$r['id'],
					'path' => $path . '/' . $name,
					'restrictions' => $restrictions,
					'issues' => $issues,
					'access' => true,
				];
			}
		}

		// Sort: unlocked first, then by name
		usort($returnData['data'], function ($a, $b) {
			if (($a['access'] ?? true) !== ($b['access'] ?? true)) {
				return ($a['access'] ?? true) ? -1 : 1;
			}
			return strcasecmp($a['name'] ?? '', $b['name'] ?? '');
		});
	}


	function getTesttakers($data, rixPDO &$db, &$returnData, userAuth &$myAuth)
	{
		if (!isset($returnData['data'])) {
			$returnData['data'] = [];
		}
		$permAuth = new permAuth("fetchLibrary", $data, $myAuth);
		$isAdmin = ($myAuth->checkAdmin() || $myAuth->checkElevatedAdmin() || $myAuth->checkSA());

		$accessParentSql = wlLoginAccessParentSql('l', 'templateLogin');
		$query = "SELECT w.*,
				CASE WHEN w.foreign_table = 5 THEN f.name ELSE l.name END AS objectName,
				CASE WHEN w.foreign_table = 5 THEN f.parent ELSE $accessParentSql END AS objectParent,
				CASE WHEN w.foreign_table = 5 THEN f.owner ELSE pf.owner END AS accessOwner,
				COALESCE(u.name, '-') AS ownerName,
				l.template AS loginTemplate,
				l.loginType AS loginType
			FROM watchList w
			LEFT JOIN loginsFolders f ON w.foreign_table = 5 AND f.id = w.foreign_id
			LEFT JOIN logins l ON w.foreign_table = 6 AND l.id = w.foreign_id
			LEFT JOIN logins templateLogin ON templateLogin.id = l.parentTemplateId
			LEFT JOIN loginsFolders pf ON pf.id = $accessParentSql
			LEFT JOIN users u ON u.id = f.owner
			WHERE w.user_id = ? AND w.foreign_table IN (5,6)";
		$res = $db->fetchTable($query, [$myAuth->userid]);

		foreach ($res['data'] as $r) {
			if ($r['foreign_table'] == 5) {
				// --- TESTTAKER FOLDER ---
				$name = $r['objectName'] ?? ('#' . $r['foreign_id']);
				$ownerId = $r['accessOwner'] ?? null;

				$accessVal = hasOwnerAccess($isAdmin, $ownerId, $myAuth)
					? true
					: wlCanReadLoginFolder((int)$r['foreign_id'], $db, $myAuth);

				if ($accessVal === false) {
					$returnData['data'][] = [
						'type' => 'folder',
						'id' => (int)$r['foreign_id'],
						'name' => $name,
						'watchid' => (int)$r['id'],
						'access' => false,
					];
					continue;
				}

				$path = pathToString(fetchPath('loginsFolders', $r['objectParent']));

				$returnData['data'][] = [
					'type' => 'folder',
					'id' => (int)$r['foreign_id'],
					'name' => $name,
					'owner' => $r['ownerName'],
					'message' => '',
					'watchid' => (int)$r['id'],
					'path' => $path . '/' . $name,
					'loginType' => ' ',
					'access' => true,
				];
			} else {
				// --- TESTTAKER ---
				$parentId = $r['objectParent'] ?? null;
				$name = $r['objectName'] ?? ('#' . $r['foreign_id']);
				// template (e.g., 'template','cloned','tTaker'); for access=false we�ll just emit 'login' type

				$ownerId = $r['accessOwner'] ?? null;

				$accessVal = hasOwnerAccess($isAdmin, $ownerId, $myAuth)
					? true
					: wlCanReadLoginFolder((int)$parentId, $db, $myAuth);

				if ($accessVal === false) {
					$returnData['data'][] = [
						'type' => 'login', // explicit non-folder for JS mapping
						'id' => (int)$r['foreign_id'],
						'name' => $name,
						'watchid' => (int)$r['id'],
						'access' => false,
					];
					continue; // no details leaked
				}

				// Access granted ? load full details
				$path = pathToString(fetchPath('loginsFolders', $parentId));
				$issues = plausCheckTestTaker($r['foreign_id']);

				$returnData['data'][] = [
					'type' => $r['loginTemplate'],  // template|cloned|tTaker
					'id' => (int)$r['foreign_id'],
					'name' => $name,
					'owner' => ' ',
					'message' => '',
					'watchid' => (int)$r['id'],
					'path' => $path . '/' . $name,
					'loginType' => $r['loginType'],
					'issues' => $issues,
					'access' => true,
				];
			}
		}

		// Sort: unlocked first, then by name
		usort($returnData['data'], function ($a, $b) {
			if (($a['access'] ?? true) !== ($b['access'] ?? true)) {
				return ($a['access'] ?? true) ? -1 : 1;
			}
			return strcasecmp($a['name'] ?? '', $b['name'] ?? '');
		});
	}


	function unWatch($data, rixPDO &$db, &$returnData, userAuth &$myAuth)
	{
		if (!isset($returnData['data'])) {
			$returnData['data'] = [];
		}
		array_push($returnData['data'], ['type' => $data['tab']]);
		$db->execute("DELETE FROM `watchList` WHERE `id` = ? AND `user_id` = ?", [$data['id'], $myAuth->userid]);
	}

	function fetchPath($tableName, $location)
	{
		global $db;
		static $pathCache = [];
		if ($location === null) return [];
		$cacheKey = $tableName . ':' . (int)$location;
		if (array_key_exists($cacheKey, $pathCache)) return $pathCache[$cacheKey];

		$query = "SELECT name, parent FROM " . $tableName . " WHERE id=?";
		$parameters = array($location);
		$results = $db->fetchRow($query, $parameters);
		if ($results['data']['parent'] !== null) {
			$path = fetchPath($tableName, $results['data']['parent']);
			if ($path === false) {
					return $pathCache[$cacheKey] = false;
			}
			$path[] = array('name' => $results['data']['name'], 'id' => $location);
		} else {
			$path = array();
			$path[] = array('name' => $results['data']['name'], 'id' => $location);
		}

		return $pathCache[$cacheKey] = $path;
	}

	function pathToString($path): ?string
	{
		if ($path === false) return null;
		if (count($path) === 0) {
			return '/';
		}
		$s = '';
		foreach ($path as $folder) {
			$s .= '/' . $folder['name'];
		}
		return substr($s, 5);
	}

	function wlLanguages(): array
	{
		global $db;
		static $languages = null;
		if ($languages === null) {
			$result = $db->fetchTable("SELECT code, name FROM languages", []);
			$languages = $result['data'] ?? [];
		}
		return $languages;
	}

	function wlRowsByIds(string $table, array $columns, array $ids): array
	{
		global $db;
		$allowed = [
			'items' => ['id', 'name', 'parsed'],
			'testFluidStructure' => ['id', 'poolID', 'numberOfItems'],
			'testPools' => ['id', 'name', 'structure'],
		];
		if (!$ids || !isset($allowed[$table]) || array_diff($columns, $allowed[$table])) return [];
		$ids = array_values(array_unique(array_map('intval', $ids)));
		$placeholders = implode(',', array_fill(0, count($ids), '?'));
		$result = $db->fetchTable(
			'SELECT ' . implode(',', $columns) . " FROM $table WHERE id IN ($placeholders)",
			$ids
		);
		$rows = [];
		foreach (($result['data'] ?? []) as $row) $rows[(int)$row['id']] = $row;
		return $rows;
	}

	function fetchRestrictions($test, $optionsRaw = null) // scheduled tests
	{
		global $db;
		$restrictions = [];
		if ($optionsRaw === null) {
			$sql = "SELECT JSON_EXTRACT(options, '$.restrictions') AS restrictions, JSON_EXTRACT(options, '$.forceLogoff') AS forceLogoff FROM tests WHERE id = ?";
			$res = $db->fetchRow($sql, [$test]);
		} else {
			$options = json_decode($optionsRaw, true) ?: [];
			$res = ['data' => [
				'restrictions' => array_key_exists('restrictions', $options) ? json_encode($options['restrictions']) : null,
				'forceLogoff' => $options['forceLogoff'] ?? null,
			]];
		}
		if ($res['data']['restrictions'] === NULL) {
			$restrictions['indate'] = true;
			$restrictions['intime'] = true;
			$restrictions['inday'] = true;
			$restrictions['unexpired'] = true;
			$restrictions['scheduled'] = false;
		} else {
			$restrictionsObj = json_decode($res['data']['restrictions']);
			// in date interval?
			if (empty($restrictionsObj->dateRange)) {
				$restrictions['indate'] = true;
				$restrictions['unexpired'] = true;
			} else {
				$currentDate = new DateTime();
				$startInterval = new DateTime($restrictionsObj->dateRange->start);
				$endInterval = new DateTime($restrictionsObj->dateRange->end);

				if ($currentDate >= $startInterval && $currentDate <= $endInterval) {
					$restrictions['indate'] = true;
					$restrictions['unexpired'] = true;
				} else {
					$restrictions['indate'] = false;
				}
				if ($currentDate >= $endInterval) $restrictions['unexpired'] = false; // will be in daterange never again
			}
			if (empty($restrictionsObj->timeRestriction)) {
				$restrictions['intime'] = true;
			} else {
				$currentTime = strtotime(date('H:i'));
				$startTime = strtotime($restrictionsObj->timeRestriction->start);
				$endTime = strtotime($restrictionsObj->timeRestriction->end);
				if ($currentTime >= $startTime && $currentTime <= $endTime) {
					$restrictions['intime'] = true;
				} else {
					$restrictions['intime'] = false;
				}
			}
			if (empty($restrictionsObj->testDays)) {
				$restrictions['inday'] = true;
			} else {
				$currentDayOfWeek = date('N') - 1;
				$dayslist = explode(',', $restrictionsObj->testDays->days);
				if (in_array($currentDayOfWeek, $dayslist)) {
					$restrictions['inday'] = true;
				} else {
					$restrictions['inday'] = false;
				}
			}

			if (in_array(false, $restrictions, true)) {
				$restrictions['scheduled'] = true;
			} else {
				$restrictions['scheduled'] = false;
			}
		}
		$restrictions['restrictionsobject'] = $res['data']['restrictions'];
		if ($res['data']['forceLogoff'] === NULL) {
			$restrictions['forceLogoff'] = false;
		} else {
			$restrictions['forceLogoff'] = filter_var($res['data']['forceLogoff'], FILTER_VALIDATE_BOOLEAN);
		}
		return $restrictions;
	}

	function plausCheckTestTaker($testTaker)
	{
		global $db;
		$issues = ['issuesFound' => false, 'noPws' => false, 'pwsWithoutTests' => false, 'pwsWithDeletedTests' => false, 'issueCount' => 0];

		$result = $db->fetchTable("SELECT structure FROM passwords WHERE loginID = ?", [$testTaker]);
		$rows = $result['data'] ?? [];
		if (count($rows) === 0) $issues['noPws'] = true;

		$testIds = [];
		foreach ($rows as $value) {
			if ($value['structure'] === null || $value['structure'] === '[]') $issues['pwsWithoutTests'] = true;
			$jsonData = json_decode($value['structure'] ?? '', true);
			if (!is_array($jsonData)) continue;
			foreach ($jsonData as $jsonDataItem) {
				if (isset($jsonDataItem['hiddenID'])) $testIds[(int)$jsonDataItem['hiddenID']] = true;
			}
		}
		if ($testIds) {
			$ids = array_keys($testIds);
			$placeholders = implode(',', array_fill(0, count($ids), '?'));
			$existing = $db->fetchTable("SELECT id FROM tests WHERE id IN ($placeholders)", $ids);
			if (count($existing['data'] ?? []) !== count($ids)) $issues['pwsWithDeletedTests'] = true;
		}
		$i = 0;
		foreach ($issues as $issue) {
			if ($issue === true) {
				$issues['issuesFound'] = true;
				$i++;
			}
		}
		$issues['issueCount'] = $i;
		return $issues;
	}

	function plausCheckTests($test)
	{
		global $db;
		$issues = ['issuesFound' => false, 'noItems' => false, 'timerIssue' => false, 'noContentError' => [], 'noContentErrorFlag' => false, 'noActiveLanguage' => false, 'langError' => [], 'langErrorFlag' => false, 'missingItems' => [], 'missingItemsFlag' => false, 'itemsAmountError' => [], 'itemsAmountErrorFlag' => false, 'deletedPool' => [], 'deletedPoolFlag' => false, 'issueCount' => 0, 'pnNoContent' => false, 'duplicates' => false];

		$query = "
    SELECT 
        JSON_EXTRACT(t.structure, '$.items') AS structure, 
        JSON_EXTRACT(t.structure, '$.type') AS type, 
        t.options, 
        t.metadata,
        CASE 
            WHEN JSON_EXTRACT(t.skin, '$.skinOptions.privacyPolicy') = TRUE
            THEN TRUE
            ELSE FALSE 
        END AS activePn
    FROM 
        tests t
    WHERE 
        t.id = ?
    ";

		$parameters = array($test);
		$res = $db->fetchRow($query, $parameters);
		$structure = json_decode($res['data']['structure']);
		$options = json_decode($res['data']['options']);

		$activeLanguages = array();

		foreach (wlLanguages() as $language) {
			$code = $language['code'];
			if (isset($options->$code) && $options->$code === true) {
				$activeLanguages[] = $language;
			}
		}

		if (isset($options->useTimer) && $options->useTimer === true && $options->timeLimit === 0) {
			$issues['timerIssue'] = true;
		}

		if (count($activeLanguages) === 0) $issues['noActiveLanguage'] = true;

		//Check if privacy notice is active and available in active languages
		if ((int)$res['data']['activePn'] === 1) {
			if ($res['data']['metadata'] !== null) {
				$metadata = json_decode($res['data']['metadata'], true);
				if (isset($metadata['privacy_policy']) && is_array($metadata['privacy_policy'])) {
					foreach ($activeLanguages as $lng) {
						if (!isset($metadata['privacy_policy'][$lng['code']]) || empty($metadata['privacy_policy']['code'])) {
							$issues['pnNoContent'] = true;
						}
					}
				}
			} else {
				$issues['pnNoContent'] = true;
			}
		}

		$itemRows = [];
		$fluidRows = [];
		$poolRows = [];
		if (is_array($structure)) {
			$structureIds = [];
			foreach ($structure as $structureItem) {
				if (isset($structureItem->hiddenID)) $structureIds[(int)$structureItem->hiddenID] = true;
			}
			if ($res['data']['type'] === '"linear"') {
				$itemRows = wlRowsByIds('items', ['id', 'name', 'parsed'], array_keys($structureIds));
			} elseif ($res['data']['type'] === '"fluid"') {
				$fluidRows = wlRowsByIds('testFluidStructure', ['id', 'poolID', 'numberOfItems'], array_keys($structureIds));
				$poolIds = [];
				foreach ($fluidRows as $row) $poolIds[(int)$row['poolID']] = true;
				$poolRows = wlRowsByIds('testPools', ['id', 'name', 'structure'], array_keys($poolIds));
				$poolItemIds = [];
				foreach ($poolRows as $row) {
					$poolStructure = json_decode($row['structure'] ?? '', true);
					foreach (($poolStructure['items'] ?? []) as $poolItem) {
						if (isset($poolItem['hiddenID'])) $poolItemIds[(int)$poolItem['hiddenID']] = true;
					}
				}
				$itemRows = wlRowsByIds('items', ['id', 'name', 'parsed'], array_keys($poolItemIds));
			}
		}

		switch ($res['data']['type']) {
			case '"linear"':
				if (count($structure) > 0) {
					$seenHiddenIDs = [];

					foreach ($structure as $key => $structureItem) {
						// ** Check for duplicates **
						if (in_array($structureItem->hiddenID, $seenHiddenIDs, true)) {
							$issues['duplicates'] = true;
						} else {
							$seenHiddenIDs[] = $structureItem->hiddenID;
						}

						$itemRow = $itemRows[(int)$structureItem->hiddenID] ?? null;

						if ($itemRow !== null) {
							$jsonData = json_decode($itemRow['parsed'] ?? '', true);
							$itemName = $itemRow['name'];

							if ($jsonData == null) {
								$issues['noContentErrorFlag'] = true;
								$typer = 'noContentError';
								$issues[$typer][$structureItem->hiddenID]['hiddenID'] = $structureItem->hiddenID;
								$issues[$typer][$structureItem->hiddenID]['itemName'] = $itemName;
							} else {
								$i = 0;
								$typer = 'langError';
								foreach ($activeLanguages as $k) {
									if (!array_key_exists($k['code'], $jsonData)) {
										$issues['langErrorFlag'] = true;
										$issues[$typer][$structureItem->hiddenID]['languages'][$i] = $k['code'];
										$issues[$typer][$structureItem->hiddenID]['hiddenID'] = $structureItem->hiddenID;
										$issues[$typer][$structureItem->hiddenID]['itemName'] = $itemName;
									}
									$i++;
								}
							}
						} else {
							$errordata['hiddenID'] = $structureItem->hiddenID;
							$issues['missingItemsFlag'] = true;
							$issues['missingItems'][$key] = $errordata;
						}
					}
				} else {
					$issues['noItems'] = true;
				}

            break;
        case '"fluid"':
            if (count($structure) > 0) {
                $seenHiddenIDs = [];
                foreach ($structure as $key => $structureItem) {
                    if (in_array($structureItem->hiddenID, $seenHiddenIDs, true)) {
                        $issues['duplicates'] = true;
                    } else {
                        $seenHiddenIDs[] = $structureItem->hiddenID;
                    }

					$result = ['data' => $fluidRows[(int)$structureItem->hiddenID] ?? []];
					$queryResult = ['data' => [], 'rows' => 0];
					if ($result['data']) {
						$poolRow = $poolRows[(int)$result['data']['poolID']] ?? null;
						if ($poolRow !== null) $queryResult = ['data' => $poolRow, 'rows' => 1];
					}

						if ($queryResult['rows'] > 0) {
							$jsonValue = json_decode($queryResult['data']['structure'] ?? '', true);
							$itemCount = count($jsonValue['items']);
							$itemsUsed = (int)$result['data']['numberOfItems'];

							if ($itemsUsed > $itemCount) {
								$issues['itemsAmountErrorFlag'] = true;
								$issues['itemsAmountError'][$structureItem->hiddenID]['hiddenID'] = $structureItem->hiddenID;
								$issues['itemsAmountError'][$structureItem->hiddenID]['itemsUsed'] = $itemsUsed;
								$issues['itemsAmountError'][$structureItem->hiddenID]['itemsTotal'] = $itemCount;
							}

                        foreach ($jsonValue['items'] as $key2 => $poolStructureItem) {
                            // Reading item data from db
							$itemRow = $itemRows[(int)$poolStructureItem['hiddenID']] ?? null;
							$itemResult = ['data' => $itemRow ?? []];

                            if (count($itemResult['data']) > 0) {
                                $jsonData = json_decode($itemResult['data']['parsed'] ?? '', true);
                                if ($jsonData == null) {
                                    $issues['noContentErrorFlag'] = true;
                                    $issues['noContentError'][$structureItem->hiddenID]['hiddenID'] = $structureItem->hiddenID;
                                    $issues['noContentError'][$structureItem->hiddenID]['itemName'] = $queryResult['data']['name'];
                                } else {
                                    foreach ($activeLanguages as $k) {
                                        if (!array_key_exists($k['code'], $jsonData)) {
                                            $issues['langErrorFlag'] = true;
                                            $issues['langError'][$structureItem->hiddenID]['hiddenID'] = $structureItem->hiddenID;
                                        }
                                    }
                                }
                            } else {
                                $issues['missingItemsFlag'] = true;
                                $errordata['hiddenID'] = $structureItem->hiddenID;
                                $issues['missingItems'][$key] = $errordata;
                            }
                        }

                        $poolItemCounts = [];
                        foreach ($jsonValue['items'] as $poolStructureItem) {
                            $poolItemId = $poolStructureItem['hiddenID'] ?? null;
                            if ($poolItemId === null) continue;
                            $poolItemCounts[$poolItemId] = ($poolItemCounts[$poolItemId] ?? 0) + 1;
                            if ($poolItemCounts[$poolItemId] > 1) {
                                $issues['duplicates'] = true;
                                break;
                            }
                        }
                    } else {
                        $issues['deletedPoolFlag'] = true;
                        $errordata['hiddenID'] = $structureItem->hiddenID;
                        $issues['deletedPool'][$key] = $errordata;
                    }
                }
            } else {
                $issues['noItems'] = true;
            }

				break;
		}
		// count errors
		$trueErrors = array_filter($issues, function ($value) {
			return $value === true;
		});
		$issues['issueCount'] = count($trueErrors);
		if ($issues['issueCount'] > 0) $issues['issuesFound'] = true;

		return $issues;
	}

	function outputJSON()
	{
		global $returnData, $action, $myAuth;

		$returnData['loggedInName'] = $myAuth->username;

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
