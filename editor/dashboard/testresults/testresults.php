<?php
	register_shutdown_function('outputJSON');
	require_once __DIR__ . '/../../inc/php/initBackend.php';

	$action = filter_input(INPUT_POST, 'action');
	if (!$action) $action = "";

	$returnData = ['data' => [], 'action' => $action, 'error' => false];

# ----------------------- #
# Authentication Includes #
# ----------------------- #
	$pageName = "dashboard";
	$isSubMod = true;
	$isActionFile = true;
	require_once '../../inc/php/authCommonFunctions.php';

	$returnData = (array)$myAuth->returnData;
	if ($myAuth->returnData['error'] !== false) exit;

	$data = filter_input(INPUT_POST, 'data');
	if ($data) $data = json_decode($data ?? '', true);
	if (!$data) $data = [];

	/* ======================================================
	   Helpers
	====================================================== */
	function tr_ownsTestFolder(int $folderId, rixPDO $db, userAuth $myAuth): bool
	{
		if ($folderId <= 0) return false;
		$row = $db->fetchRow("SELECT owner FROM testFolders WHERE id=? LIMIT 1", [$folderId]);
		if (!empty($row['error']) || ($row['rows'] ?? 0) === 0) return false;
		$ownerId = (int)($row['data']['owner'] ?? 0);
		return $ownerId > 0 && $ownerId === (int)$myAuth->userid;
	}

	function tr_getDescendantGroupIds(rixPDO $db, int $rootId): array
	{
		$all = [$rootId];
		$queue = [$rootId];
		while (!empty($queue)) {
			$cur = array_pop($queue);
			$res = $db->fetchTable("SELECT id FROM testFolders WHERE parent = ?", [$cur]);
			foreach (($res['data'] ?? []) as $row) {
				$gid = (int)($row['id'] ?? 0);
				if ($gid > 0 && !in_array($gid, $all, true)) {
					$all[] = $gid;
					$queue[] = $gid;
				}
			}
		}
		return $all;
	}

function tr_ownsLoginFolder(int $folderId, rixPDO $db, userAuth $myAuth): bool {
    if ($folderId <= 0) return false;
    $row = $db->fetchRow("SELECT owner FROM loginsFolders WHERE id=? LIMIT 1", [$folderId]);
    if (!empty($row['error']) || ($row['rows'] ?? 0) === 0) return false;
    $ownerId = (int)($row['data']['owner'] ?? 0);
    return $ownerId > 0 && $ownerId === (int)$myAuth->userid;
}

function tr_canReadTestTakerFolder(int $folderId, rixPDO $db, userAuth $myAuth, permAuth $permAuth, array &$cache): bool {
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
            || tr_ownsLoginFolder($folderId, $db, $myAuth);
    }
    return $cache[$folderId];
}

function tr_loginAccessParentSql(string $loginAlias, string $templateAlias): string {
    return "COALESCE($templateAlias.parent, $loginAlias.parent)";
}

function tr_detectScoringTimestampColumn(rixPDO $db): ?string {
    $table = $db->fetchTable("SHOW COLUMNS FROM scoring", []);
    $cols  = array_map(fn($c) => strtolower($c['Field'] ?? ''), $table['data'] ?? []);
    if (in_array('updated_at', $cols, true)) return 'updated_at';
    if (in_array('mtime', $cols, true))      return 'mtime';
    if (in_array('created_at', $cols, true)) return 'created_at';
    return null;
	}

	function tr_dt_defaults(): array
	{
		return [
			'i_colName' => 'name',
			'sSortDir_0' => 'asc',
			'iDisplayStart' => 0,
			'iDisplayLength' => 1000,
			'iSortingCols' => 1,
			'sEcho' => 1,
		];
	}

	function tr_extractTypeFromStructure($structureVal): ?string
	{
		if ($structureVal === null || $structureVal === '') return null;
		if (is_array($structureVal)) {
			$type = $structureVal['type'] ?? null;
			return is_string($type) ? strtolower($type) : null;
		}
		if (!is_string($structureVal)) $structureVal = strval($structureVal);
		$j = json_decode($structureVal, true);
		if (json_last_error() !== JSON_ERROR_NONE || !is_array($j)) return null;
		$type = $j['type'] ?? null;
		return is_string($type) ? strtolower($type) : null;
	}

	/* ======================================================
	   Actions
	====================================================== */
	if ($action) {
		if (function_exists($action)) {
			if (oasysRejectUnknownAction(__FILE__, $action, $returnData)) exit;
			$action($data, $db, $returnData, $myAuth);
		} else {
			$returnData['error'] = "Unknown action: " . htmlspecialchars($action);
		}
	}

	/**
	 * listResults
	 */
	function listResults($data, rixPDO &$db, &$returnData, userAuth &$myAuth)
	{
		$scope = ($data['scope'] ?? 'watchlist') === 'all' ? 'all' : 'watchlist';

    $testTakerPermAuth = new permAuth("fetchLibrary", tr_dt_defaults(), $myAuth);
    $testTakerAccessCache = [];

    // last session login
    $lastLoginTS = null;
    $currentUserName = trim($myAuth->username ?? ($myAuth->name ?? ''));
    if ($currentUserName !== '') {
        $row = $db->fetchRow("SELECT activity FROM users WHERE name=? LIMIT 1", [$currentUserName]);
        if (!empty($row['data']) && array_key_exists('activity', $row['data'])) {
            $activityJson = $row['data']['activity'];
            if ($activityJson) {
                $activity = json_decode($activityJson, true);
                if (json_last_error() === JSON_ERROR_NONE && is_array($activity)) {
						$prev = $activity['authTimes']['previousStateLogin'] ?? null;
                    if ($prev && $prev !== 'false') {
                        $ts = strtotime($prev);
                        if ($ts !== false) $lastLoginTS = $ts;
                    }
                }
            }
        }
    }

		// collect tests (permission-aware)
		$tests = ($scope === 'watchlist')
			? tr_fetchWatchlistTests($db, $myAuth)
			: tr_fetchAllAccessibleTests($db, $myAuth);

		if (empty($tests)) {
			$returnData['data'] = [];
			$returnData['lastLoginTS'] = $lastLoginTS;
			$returnData['lastLogin'] = $lastLoginTS ? date('Y-m-d H:i:s', $lastLoginTS) : null;
			$returnData['scope'] = $scope;
			return;
		}

		$ids = array_map(fn($t) => (int)$t['id'], $tests);
		$placeholders = implode(',', array_fill(0, count($ids), '?'));

	$accessParentSql = tr_loginAccessParentSql('logins', 'templateLogin');
	$newCountSql = '0 AS newCount';
	$queryParams = [];
	if ($lastLoginTS) {
		$newCountSql = 'SUM(CASE WHEN activity.tsActiveServer > ? THEN 1 ELSE 0 END) AS newCount';
		$queryParams[] = date('Y-m-d H:i:s', $lastLoginTS);
	}
	$queryParams = array_merge($queryParams, $ids);

	// Aggregate by access folder in SQL. Permission checks still happen in PHP,
	// but the result set scales with tests/folders instead of every assessment.
	$activityRows = $db->fetchTable(
		"SELECT activity.testId,
				$accessParentSql AS loginParent,
				COUNT(*) AS totalResults,
				MAX(activity.tsActiveServer) AS updatedTs,
				$newCountSql
		 FROM activity
		 JOIN logins ON logins.id = activity.loginId
		 LEFT JOIN logins templateLogin ON templateLogin.id = logins.parentTemplateId
		 WHERE activity.testId IN ($placeholders)
		 GROUP BY activity.testId, $accessParentSql",
		$queryParams
	)['data'] ?? [];

    if (empty($activityRows)) {
        $returnData['data']        = [];
        $returnData['lastLoginTS'] = $lastLoginTS;
        $returnData['lastLogin']   = $lastLoginTS ? date('Y-m-d H:i:s', $lastLoginTS) : null;
        $returnData['scope']       = $scope;
        return;
    }

    $aggByTest = [];
    $activeIds = [];
    $newByTest = [];
    foreach ($activityRows as $row) {
        if (!tr_canReadTestTakerFolder((int)$row['loginParent'], $db, $myAuth, $testTakerPermAuth, $testTakerAccessCache)) {
            continue;
        }
        $tid = (int)$row['testId'];
		$updatedTs = strtotime($row['updatedTs'] ?? '');
		$updatedTs = ($updatedTs !== false) ? $updatedTs : null;
        if (!isset($aggByTest[$tid])) {
            $aggByTest[$tid] = [
                'total'      => 0,
                'updated_ts' => null
            ];
        }
		$aggByTest[$tid]['total'] += (int)($row['totalResults'] ?? 0);
        if ($updatedTs !== null && ($aggByTest[$tid]['updated_ts'] === null || $updatedTs > $aggByTest[$tid]['updated_ts'])) {
            $aggByTest[$tid]['updated_ts'] = $updatedTs;
        }
		$newByTest[$tid] = ($newByTest[$tid] ?? 0) + (int)($row['newCount'] ?? 0);
    }

    foreach ($aggByTest as $tid => $row) {
        if ($row['total'] > 0) $activeIds[] = (int)$tid;
    }

		if (empty($activeIds)) {
			$returnData['data'] = [];
			$returnData['lastLoginTS'] = $lastLoginTS;
			$returnData['lastLogin'] = $lastLoginTS ? date('Y-m-d H:i:s', $lastLoginTS) : null;
			$returnData['scope'] = $scope;
			return;
		}

    // map meta
    $nameById = [];
    $typeById = [];
    foreach ($tests as $t) {
        $tid = (int)$t['id'];
        $nameById[$tid] = (string)$t['name'];
        if (array_key_exists('type', $t)) {
            $typeById[$tid] = is_null($t['type']) ? null : (string)$t['type'];
        }
    }

		$out = [];
		foreach ($activeIds as $tid) {
			$out[] = [
				'id' => $tid,
				'name' => ($nameById[$tid] ?? ('#' . $tid)),
				'total_results' => $aggByTest[$tid]['total'],
				'new_since_last' => $newByTest[$tid] ?? 0,
				'updated_ts' => $aggByTest[$tid]['updated_ts'],
				'type' => $typeById[$tid] ?? null
			];
		}

		$returnData['data'] = $out;
		$returnData['lastLoginTS'] = $lastLoginTS;
		$returnData['lastLogin'] = $lastLoginTS ? date('Y-m-d H:i:s', $lastLoginTS) : null;
		$returnData['scope'] = $scope;
	}

	/**
	 * WATCHLIST scope (owner-of-folder override ONLY for the root folder itself; each subfolder must pass permAuth)
	 */
	function tr_fetchWatchlistTests(rixPDO $db, userAuth $myAuth): array
	{
		$rowsById = [];

		$res = $db->fetchTable(
			"SELECT foreign_table, foreign_id
           FROM watchList
          WHERE user_id=? AND foreign_table IN (3,4)",
			[$myAuth->userid]
		);

		foreach (($res['data'] ?? []) as $r) {
			$ft = (int)$r['foreign_table'];
			$fid = (int)$r['foreign_id'];

			if ($ft === 4) {
				// single test
				$t = $db->fetchRow("SELECT id,name,parent,structure FROM tests WHERE id=?", [$fid]);
				if (($t['rows'] ?? 0) === 0) continue;
					$tid = (int)$t['data']['id'];
					$rowsById[$tid] = [
						'id' => $tid,
						'name' => (string)$t['data']['name'],
						'type' => tr_extractTypeFromStructure($t['data']['structure'])
					];

			} elseif ($ft === 3) {
				// A watched test folder is only a scope selector here. Visibility is
				// decided from the accessible result rows below.
				$allGroupIds = tr_getDescendantGroupIds($db, $fid);
				if (empty($allGroupIds)) continue;
				$ph = implode(',', array_fill(0, count($allGroupIds), '?'));
				$ts = $db->fetchTable(
					"SELECT id,name,parent,structure FROM tests WHERE parent IN ($ph)",
					$allGroupIds
				);

				foreach (($ts['data'] ?? []) as $t) {
					$tid = (int)$t['id'];
					if ($tid <= 0) continue;
					$rowsById[$tid] = [
						'id' => $tid,
						'name' => (string)$t['name'],
						'type' => tr_extractTypeFromStructure($t['structure'])
					];
				}
			}
		}

		return array_values($rowsById);
	}

	/**
	 * ALL scope (per-test parent folder must pass permAuth OR be owned; no inheritance of ownership to descendants)
	 */
	function tr_fetchAllAccessibleTests(rixPDO $db, userAuth $myAuth): array
	{
		$rows = [];

		$all = $db->fetchTable(
			"SELECT DISTINCT tests.id, tests.name, tests.parent, tests.structure
			FROM tests
			JOIN activity ON activity.testId = tests.id",
			[]
		);
		foreach ($all['data'] as $t) {
			$rows[] = [
				'id' => (int)$t['id'],
				'name' => (string)$t['name'],
				'type' => tr_extractTypeFromStructure($t['structure'])
			];
		}
		return $rows;
	}

	/**
 * Detailed stats (single test)  same rule: parent folder must pass permAuth OR be owned
	 */
	function fetchStats($data, rixPDO &$db, &$returnData, userAuth &$myAuth)
	{
		$testId = isset($data['selectedTest']) ? (int)$data['selectedTest'] : 0;
		if ($testId <= 0) {
			$returnData['error'] = "Missing or invalid test id.";
			return;
		}

		$trow = $db->fetchRow("SELECT id,name,parent FROM tests WHERE id = ?", [$testId]);
		if (($trow['rows'] ?? 0) === 0) {
			$returnData['error'] = "Test not found.";
			return;
		}
		// previous session login
		$lastLoginTS = null;
		$currentUserName = trim($myAuth->username ?? ($myAuth->name ?? ''));
		if ($currentUserName !== '') {
			$row = $db->fetchRow("SELECT activity FROM users WHERE name=? LIMIT 1", [$currentUserName]);
			if (!empty($row['data']) && array_key_exists('activity', $row['data'])) {
				$activityJson = $row['data']['activity'];
				if (!is_null($activityJson) && $activityJson !== '') {
					$activity = json_decode($activityJson, true);
					if (json_last_error() === JSON_ERROR_NONE && is_array($activity)) {
						$prev = $activity['authTimes']['previousStateLogin'] ?? null;
						if ($prev && $prev !== 'false') {
							$ts = strtotime($prev);
							if ($ts !== false) $lastLoginTS = $ts;
						}
					}
				}
			}
		}

    $result = $db->fetchTable(
        "SELECT
             CONCAT(a.passwordId,'_',a.testId) AS hiddenID,
             l.name  AS testeename,
             " . tr_loginAccessParentSql('l', 'templateLogin') . " AS loginParent,
             p.name  AS testeepass,
             p.tag   AS passtag,
             a.progress AS progressField,
             a.tsActiveServer
         FROM activity a
         LEFT JOIN logins     l ON l.id = a.loginId
         LEFT JOIN logins templateLogin ON templateLogin.id = l.parentTemplateId
         LEFT JOIN passwords  p ON p.id = a.passwordId
         WHERE a.testId = ?
         ORDER BY l.name",
			[$testId]
		);

    $testTakerPermAuth = new permAuth("fetchLibrary", tr_dt_defaults(), $myAuth);
    $testTakerAccessCache = [];
    $total = 0;
    $newCnt = 0;
    foreach ($result['data'] as $k => $v) {
        if (!tr_canReadTestTakerFolder((int)$v['loginParent'], $db, $myAuth, $testTakerPermAuth, $testTakerAccessCache)) {
            unset($result['data'][$k]);
            continue;
        }
        $total++;
        $updatedTs = strtotime($v['tsActiveServer'] ?? '');
        if ($lastLoginTS && $updatedTs !== false && $updatedTs > $lastLoginTS) {
            $newCnt++;
        }
        $result['data'][$k]['progressField'] = round(($v['progressField'] ?? 0) * 100);
        if (isset($v['testeepass'])) {
            $result['data'][$k]['testeepass'] = Crypt::decryptString($v['testeepass']);
        }
        unset($result['data'][$k]['loginParent'], $result['data'][$k]['tsActiveServer']);
    }
    $result['data'] = array_values($result['data']);

		if ($result['data'] === []) {
			$returnData['error'] = "Permission denied.";
			return;
		}

		$returnData['data'] = [
			'testId' => $testId,
			'testName' => $trow['data']['name'],
			'total_results' => $total,
			'new_since_last' => $newCnt,
			'testActivity' => $result['data'],
		];
	}

	/* ======================================================
	   OUTPUT
	====================================================== */
	function outputJSON()
	{
		global $returnData, $action, $myAuth;

		$returnData['loggedInName'] = $myAuth->username ?? '';
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
