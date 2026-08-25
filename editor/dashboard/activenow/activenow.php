<?php
	register_shutdown_function('outputJSON');
	require_once __DIR__ . '/../../inc/php/initBackend.php';

	$action = filter_input(INPUT_POST, 'action');
	if (!$action) $action = "";

	$returnData = [];
	$returnData['data'] = [];
	$returnData['action'] = $action;
	$returnData['error'] = false;

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
	if (!$data) $data = array();

// Dispatch
	if ($action) {
		if (function_exists($action)) {
			if (oasysRejectUnknownAction(__FILE__, $action, $returnData)) exit;
			$action($data, $db, $returnData, $myAuth);
		} else {
			$returnData['error'] = "Unknown action: " . htmlspecialchars($action);
		}
	}

	/* =========================
	   Helpers
	========================= */

	/** Owner override: does the current user own THIS exact folder? */
	function an_ownsTestFolder(int $folderId, rixPDO $db, userAuth $myAuth): bool
	{
		if ($folderId <= 0) return false;
		$row = $db->fetchRow("SELECT owner FROM testFolders WHERE id=? LIMIT 1", [$folderId]);
		if (!empty($row['error']) || ($row['rows'] ?? 0) === 0) return false;
		$ownerId = (int)($row['data']['owner'] ?? 0);
		return $ownerId > 0 && $ownerId === (int)$myAuth->userid;
	}

function an_ownsLoginFolder(int $folderId, rixPDO $db, userAuth $myAuth): bool {
    if ($folderId <= 0) return false;
    $row = $db->fetchRow("SELECT owner FROM loginsFolders WHERE id=? LIMIT 1", [$folderId]);
    if (!empty($row['error']) || ($row['rows'] ?? 0) === 0) return false;
    $ownerId = (int)($row['data']['owner'] ?? 0);
    return $ownerId > 0 && $ownerId === (int)$myAuth->userid;
}

function an_canReadTestTakerFolder(int $folderId, rixPDO $db, userAuth $myAuth, permAuth $permAuth, array &$cache): bool {
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
            || an_ownsLoginFolder($folderId, $db, $myAuth);
    }
    return $cache[$folderId];
}

function an_loginAccessParentSql(string $loginAlias, string $templateAlias): string {
    return "COALESCE($templateAlias.parent, $loginAlias.parent)";
}

function an_getDescendantGroupIds(rixPDO $db, int $rootId): array
{
		$all = [$rootId];
		$q = [$rootId];
    while (!empty($q)) {
        $cur = array_pop($q);
        $res = $db->fetchTable("SELECT id FROM testFolders WHERE parent=?", [$cur]);
        foreach (($res['data'] ?? []) as $row) {
            $gid = (int)($row['id'] ?? 0);
            if ($gid > 0 && !in_array($gid, $all, true)) { $all[] = $gid; $q[] = $gid; }
        }
    }
    return $all;
}

function an_dt_defaults(): array {
    return ['i_colName'=>'name','sSortDir_0'=>'asc','iDisplayStart'=>0,'iDisplayLength'=>1000,'iSortingCols'=>1,'sEcho'=>1];
}

	function an_extractTypeFromStructure($structureVal): ?string
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
		return is_string($type) ? strtolower($type) : null; // 'linear' | 'fluid' | 'mutation'
	}

	/* =========================
	   Actions
	========================= */

	/**
	 * listActive
	 * Summary per test (online split + progress stats), scope = watchlist|all
	 */
	function listActive($data, rixPDO &$db, &$returnData, userAuth &$myAuth): void
	{
		global $config, $settings;
		if (!isset($settings) || !is_array($settings)) $settings = [];
		$retry = isset($settings['retryCount']) ? (int)$settings['retryCount'] : 5;
		$freq = isset($settings['sendFrequency']) ? (int)$settings['sendFrequency'] : 5; // seconds
		$timeoutLimit = max(1, $retry * $freq);

		$scope = ($data['scope'] ?? 'watchlist') === 'all' ? 'all' : 'watchlist';
		$testTakerPermAuth = new permAuth("fetchLibrary", an_dt_defaults(), $myAuth);
		$testTakerAccessCache = [];

		// which tests to consider (permission-aware including owner override)
		$tests = ($scope === 'watchlist')
			? an_fetchWatchlistTests($db, $myAuth)
			: an_fetchAllAccessibleTests($db, $myAuth);

		if (empty($tests)) {
			$returnData['data'] = [];
			$returnData['scope'] = $scope;
			return;
		}

		$typeById = [];
		foreach ($tests as $t) {
			$typeById[(int)$t['id']] = $t['type'] ?? null;
		}

		$ids = array_map(fn($t) => (int)$t['id'], $tests);
		$ph = implode(',', array_fill(0, count($ids), '?'));

		// pull activity rows for those tests
		$rows = $db->fetchTable("
        SELECT a.testId, t.name AS testName, a.progress, a.tsActiveServer, a.tsLoginServer,
               a.clientOpen, a.timeLeft, a.language, " . an_loginAccessParentSql('l', 'templateLogin') . " AS loginParent
        FROM activity a
        JOIN tests t ON t.id = a.testId
        JOIN logins l ON l.id = a.loginId
        LEFT JOIN logins templateLogin ON templateLogin.id = l.parentTemplateId
        WHERE a.testId IN ($ph)
    ", $ids)['data'] ?? [];

    // aggregate
    $map = [];
    foreach ($rows as $r) {
        if (!an_canReadTestTakerFolder((int)$r['loginParent'], $db, $myAuth, $testTakerPermAuth, $testTakerAccessCache)) {
            continue;
        }

        $tid = (int)$r['testId'];

			// derive status
			$lastTs = strtotime($r['tsActiveServer'] ?? '');
			$silence = ($lastTs !== false) ? max(0, time() - $lastTs) : PHP_INT_MAX;

			if ((int)$r['timeLeft'] === 0) {
				$status = 0; // closed
			} elseif ($silence > $timeoutLimit) {
				$status = ((int)$r['clientOpen'] === 0) ? 3 : 2; // aborted | timeout
			} else {
				$status = 1; // active
			}

			if (!isset($map[$tid])) {
				$map[$tid] = [
					'id' => $tid,
					'name' => (string)$r['testName'],
					'active' => 0,
					'timeout' => 0,
					'aborted' => 0,
					'closed' => 0,
					'progress' => [],   // only from ACTIVE sessions
					'lastTS' => $r['tsActiveServer'],
					'languages' => []
				];
			}

			if ($status === 1) $map[$tid]['active']++;
			elseif ($status === 2) $map[$tid]['timeout']++;
			elseif ($status === 3) $map[$tid]['aborted']++;
			else                    $map[$tid]['closed']++;

			// progress only from ACTIVE
			if ($status === 1 && $r['progress'] !== null) {
				$p = (float)$r['progress'];
				$p = ($p <= 1.0) ? $p * 100.0 : $p;
				$map[$tid]['progress'][] = max(0.0, min(100.0, $p));
			}

			// latest contact per test
			if (empty($map[$tid]['lastTS']) || $r['tsActiveServer'] > $map[$tid]['lastTS']) {
				$map[$tid]['lastTS'] = $r['tsActiveServer'];
			}

			// language counts
			$lang = trim((string)$r['language']);
			if ($lang !== '') {
				if (!isset($map[$tid]['languages'][$lang])) $map[$tid]['languages'][$lang] = 0;
				$map[$tid]['languages'][$lang]++;
			}
		}

		// include ONLY tests with at least one ACTIVE user
		$out = [];
		foreach ($map as $row) {
			if ($row['active'] <= 0) continue;

			$list = $row['progress'];
			sort($list);
			$n = count($list);

			$out[] = [
				'id' => $row['id'],
				'name' => $row['name'],
				'type' => $typeById[$row['id']] ?? null,
				'active' => $row['active'],
				'timeout' => $row['timeout'],
				'aborted' => $row['aborted'],
				'closed' => $row['closed'],
				'avgProgress' => $n ? round(array_sum($list) / $n, 1) : null,
				'p50Progress' => $n ? round($list[(int)floor(($n - 1) * 0.5)], 1) : null,
				'p90Progress' => $n ? round($list[(int)floor(($n - 1) * 0.9)], 1) : null,
				'minProgress' => $n ? round($list[0], 1) : null,
				'maxProgress' => $n ? round($list[$n - 1], 1) : null,
				'lastActiveTS' => $row['lastTS'],
				'languages' => $row['languages'],
			];
		}

		// sort: most active, then newest contact
		usort($out, function ($a, $b) {
			if ($a['active'] !== $b['active']) return $b['active'] <=> $a['active'];
			return strcmp(($b['lastActiveTS'] ?? ''), ($a['lastActiveTS'] ?? ''));
		});

		$returnData['data'] = $out;
		$returnData['scope'] = $scope;
	}

	/**
	 * Per-test list of active logins (permission on parent via permAuth OR owner of that parent folder)
	 */
	function fetchUsers($data, rixPDO &$db, &$returnData, userAuth &$myAuth): void
	{
		global $config, $settings;
		if (!isset($settings) || !is_array($settings)) $settings = [];
		$retry = isset($settings['retryCount']) ? (int)$settings['retryCount'] : 5;
		$freq = isset($settings['sendFrequency']) ? (int)$settings['sendFrequency'] : 5;
		$timeoutLimit = max(1, $retry * $freq);

		$testId = (int)($data['testId'] ?? 0);
		if ($testId <= 0) {
			$returnData['error'] = "Missing testId";
			return;
		}

		$prow = $db->fetchRow("SELECT parent,name FROM tests WHERE id=?", [$testId]);
		if (($prow['rows'] ?? 0) === 0) {
			$returnData['error'] = "Test not found.";
			return;
		}
    $testTakerPermAuth = new permAuth("fetchLibrary", an_dt_defaults(), $myAuth);
    $testTakerAccessCache = [];

    $rows = $db->fetchTable("
        SELECT a.loginId, l.name AS loginName, a.language, a.progress, a.tsLoginServer, a.tsActiveServer,
               a.clientOpen, a.timeLeft, " . an_loginAccessParentSql('l', 'templateLogin') . " AS loginParent
        FROM activity a
        JOIN logins l ON l.id = a.loginId
        LEFT JOIN logins templateLogin ON templateLogin.id = l.parentTemplateId
        WHERE a.testId = ? AND a.timeLeft IS NOT NULL
        ORDER BY l.name, a.tsLoginServer
    ", [$testId])['data'] ?? [];

    $out = [];
    foreach ($rows as $r) {
        if (!an_canReadTestTakerFolder((int)$r['loginParent'], $db, $myAuth, $testTakerPermAuth, $testTakerAccessCache)) {
            continue;
        }

        // derive status inline to avoid extra DB calls
        $lastTs = strtotime($r['tsActiveServer'] ?? '');
        $silence = ($lastTs !== false) ? max(0, time() - $lastTs) : PHP_INT_MAX;
        if ((int)$r['timeLeft'] === 0) $status = 0;
        else if ($silence > $timeoutLimit) $status = ((int)$r['clientOpen'] === 0) ? 3 : 2;
        else $status = 1;
        if ($status !== 1) continue;

			$p = $r['progress'];
			if ($p !== null) {
				$p = ($p <= 1.0) ? $p * 100.0 : $p;
				$p = max(0, min(100, $p));
			}
			$out[] = [
				'loginId' => (int)$r['loginId'],
				'loginName' => (string)$r['loginName'],
				'language' => (string)$r['language'],
				'progressPct' => $p !== null ? round($p, 1) : null,
				'status' => $status, // 1 active, 2 timeout, 3 aborted
				'loginAt' => $r['tsLoginServer'],
				'lastContact' => $r['tsActiveServer'],
			];
		}

		if ($out === []) {
			$returnData['error'] = "Permission denied.";
			return;
		}

		$returnData['data'] = [
			'testId' => $testId,
			'testName' => (string)$prow['data']['name'],
			'users' => $out
		];
	}

	/**
	 * WATCHLIST scope (owner override allowed for the ROOT folder only; subfolders must have permAuth)
	 */
	function an_fetchWatchlistTests(rixPDO $db, userAuth $myAuth): array
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
						'type' => an_extractTypeFromStructure($t['data']['structure'])
					];

			} elseif ($ft === 3) {
				// A watched test folder is only a scope selector here. Visibility is
				// decided from the accessible active test takers below.
				$allGroupIds = an_getDescendantGroupIds($db, $fid);
				if (empty($allGroupIds)) continue;
				$ph = implode(',', array_fill(0, count($allGroupIds), '?'));
				$ts = $db->fetchTable("SELECT id,name,parent,structure FROM tests WHERE parent IN ($ph)", $allGroupIds);

				foreach (($ts['data'] ?? []) as $t) {
					$tid = (int)$t['id'];
					if ($tid <= 0) continue;
					$rowsById[$tid] = [
						'id' => $tid,
						'name' => (string)$t['name'],
						'type' => an_extractTypeFromStructure($t['structure'])
					];
				}
			}
		}
		return array_values($rowsById);
	}

	/**
	 * ALL scope (per-test parent folder must pass permAuth OR be owned; no ownership inheritance)
	 */
	function an_fetchAllAccessibleTests(rixPDO $db, userAuth $myAuth): array
	{
		$rows = [];
		$all = $db->fetchTable(
			"SELECT DISTINCT tests.id, tests.name, tests.parent, tests.structure
			FROM tests
			JOIN activity ON activity.testId = tests.id"
		);
		foreach ($all['data'] as $t) {
			$rows[] = [
				'id' => (int)$t['id'],
				'name' => (string)$t['name'],
				'type' => an_extractTypeFromStructure($t['structure'])
			];
		}
		return $rows;
	}

	/* =========================
	   OUTPUT
	========================= */
	function outputJSON(): void
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
