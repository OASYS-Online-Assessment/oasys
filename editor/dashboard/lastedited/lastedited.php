<?php
// ===== lastedited.php =====
	register_shutdown_function('outputJSON');
	require_once __DIR__ . '/../../inc/php/initBackend.php';


	$action = filter_input(INPUT_POST, 'action') ?: "";

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
	if (!$data) $data = [];

	/* =========================================
	   Owner-of-folder override (helper)
	   ========================================= */
	/**
	 * Returns true if the current user owns the folder record.
	 * $table must be one of: 'testFolders' | 'itemFolders'
	 */
	function ownsFolder(string $table, int $folderId, rixPDO $db, userAuth $myAuth): bool
	{
		if ($folderId <= 0) return false;
		$allowed = ['testFolders', 'itemFolders'];
		if (!in_array($table, $allowed, true)) return false;

		$row = $db->fetchRow("SELECT owner FROM {$table} WHERE id=? LIMIT 1", [$folderId]);
		if (!empty($row['error']) || ($row['rows'] ?? 0) === 0) return false;

		$ownerId = (int)($row['data']['owner'] ?? 0);
		return $ownerId > 0 && $ownerId === (int)$myAuth->userid;
	}

	/* =========================
	   DISPATCH
	========================= */
	if ($action) {
		if (function_exists($action)) {
			if (oasysRejectUnknownAction(__FILE__, $action, $returnData)) exit;
			$action($data, $db, $returnData, $myAuth);
		} else {
			$returnData['error'] = "Unknown action: " . htmlspecialchars($action);
		}
	}

	/* =========================
	   ACTIONS
	========================= */

	function listEdited($data, rixPDO &$db, array &$returnData, userAuth &$myAuth): void
	{
		// 1) Load current user's activity JSON by ID (stable)
		$userId = (int)$myAuth->userid;
		$row = $db->fetchRow("SELECT activity FROM users WHERE id=? LIMIT 1", [$userId]);

		if (!empty($row['error'])) {
			$returnData['error'] = "Failed to read user activity: " . (string)$row['error'];
			die();
		}
		if (($row['rows'] ?? 0) === 0) {
			$returnData['error'] = "User not found.";
			die();
		}

		$activityJson = $row['data']['activity'] ?? null;

		// 2) Decode & normalize lastEdited (up to 10); collect all 'others' userIds
		$lastEdited = [];
		$allOtherUserIds = [];

		if ($activityJson) {
			$act = json_decode($activityJson, true);
			if (json_last_error() === JSON_ERROR_NONE && is_array($act)) {
				$arr = $act['lastEdited'] ?? [];
				if (is_array($arr)) {
					foreach ($arr as $e) {
						$ts = isset($e['ts']) ? trim((string)$e['ts']) : null;
						$id = isset($e['id']) ? (int)$e['id'] : 0;
						$type = isset($e['type']) ? strtolower((string)$e['type']) : '';
						if ($ts && $id > 0 && ($type === 'test' || $type === 'pagegroup')) {
							$others = [];
							if (isset($e['others']) && is_array($e['others'])) {
								foreach ($e['others'] as $o) {
									$oid = isset($o['userId']) ? (int)$o['userId'] : 0;
									$ots = isset($o['ts']) ? (string)$o['ts'] : null;
									if ($oid > 0 && $ots) {
										$others[] = ['userId' => $oid, 'ts' => $ots];
										$allOtherUserIds[$oid] = true;
									}
								}
							}
							$lastEdited[] = ['ts' => $ts, 'id' => $id, 'type' => $type, 'others' => $others];
							if (count($lastEdited) >= 10) break;
						}
					}
				}
			}
		}

		if (empty($lastEdited)) {
			$returnData['data'] = [];
			$returnData['action'] = 'listEdited';
			return;
		}

		// 3) Resolve item names/meta (tests + page groups)
		$testIds = array_values(array_unique(array_map(fn($e) => $e['type'] === 'test' ? $e['id'] : 0, $lastEdited)));
		$testIds = array_values(array_filter($testIds, fn($v) => $v > 0));
		$pgIds = array_values(array_unique(array_map(fn($e) => $e['type'] === 'pagegroup' ? $e['id'] : 0, $lastEdited)));
		$pgIds = array_values(array_filter($pgIds, fn($v) => $v > 0));

		$testsById = [];
		if ($testIds) {
			$ph = implode(',', array_fill(0, count($testIds), '?'));
			// include parent to check access + owner override
			$res = $db->fetchTable("SELECT id,name,parent,structure FROM tests WHERE id IN ($ph)", $testIds);
			if (!empty($res['error'])) {
				$returnData['error'] = "Failed to load tests: " . (string)$res['error'];
				die();
			}
			foreach (($res['data'] ?? []) as $r) {
				$testsById[(int)$r['id']] = [
					'name' => (string)$r['name'],
					'parent' => (int)$r['parent'],
					'test_type' => tr_extractTypeFromStructure($r['structure'] ?? null)
				];
			}
		}

		$pgById = [];
		if ($pgIds) {
			$ph = implode(',', array_fill(0, count($pgIds), '?'));
			// include parent folder to check access + owner override
			$res = $db->fetchTable("SELECT id,name,parent FROM itemGroups WHERE id IN ($ph)", $pgIds);
			if (!empty($res['error'])) {
				$returnData['error'] = "Failed to load page groups: " . (string)$res['error'];
				die();
			}
			foreach (($res['data'] ?? []) as $r) {
				$pgById[(int)$r['id']] = [
					'name' => (string)$r['name'],
					'parent' => (int)$r['parent'],
				];
			}
		}

		// 4) Resolve names for "others" userIds (single query). Non-fatal on failure.
		$userNames = []; // id => name
		if (!empty($allOtherUserIds)) {
			$ids = array_keys($allOtherUserIds);
			$ph = implode(',', array_fill(0, count($ids), '?'));
			$res = $db->fetchTable("SELECT id, name FROM users WHERE id IN ($ph)", $ids);
			if (!empty($res['error'])) {
				$returnData['warnings'][] = "Failed to resolve user names for 'others': " . (string)$res['error'];
			} else {
				foreach (($res['data'] ?? []) as $r) {
					$userNames[(int)$r['id']] = (string)$r['name'];
				}
			}
		}

		// 5) Access checks helper
		$permAuth = new permAuth("fetchLibrary", le_dt_defaults(), $myAuth);

		// 6) Build output (keep same order as current user's list)
		$out = [];

		foreach ($lastEdited as $e) {
			$id = (int)$e['id'];
			$type = $e['type']; // 'test' | 'pagegroup'
			$name = '#' . $id;
			$hasAccess = true;
			$testType = null;

			if ($type === 'test') {
				$meta = $testsById[$id] ?? null;
				if ($meta) {
					$name = $meta['name'];
					$testType = $meta['test_type'];
					if (!($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin())) {
						$parentFolderId = (int)$meta['parent'];
						$hasAccess =
							$permAuth->getAccessVal("tests", "fetchLibrary", "itemObject", $parentFolderId)
							|| ownsFolder('testFolders', $parentFolderId, $db, $myAuth); // owner override
					}
				} else {
					$hasAccess = false; // test no longer exists
				}
			} else { // pagegroup
				$meta = $pgById[$id] ?? null;
				if ($meta) {
					$name = $meta['name'];
					if (!($myAuth->checkSA() || $myAuth->checkAdmin() || $myAuth->checkElevatedAdmin())) {
						$parentFolderId = (int)$meta['parent'];
						try {
							$hasAccess =
								$permAuth->getAccessVal("pagegroups", "fetchLibrary", "itemObject", $id)
								|| ownsFolder('itemFolders', $parentFolderId, $db, $myAuth); // owner override
						} catch (\Throwable $ex) {
							// if perm check fails unexpectedly, still allow owner override
							$hasAccess = ownsFolder('itemFolders', $parentFolderId, $db, $myAuth);
						}
					}
				} else {
					$hasAccess = false; // group no longer exists
				}
			}

			// Prepare "others" list with deletion flags
			$othersArr = is_array($e['others']) ? $e['others'] : [];
			$norm = [];        // [{name|null, ts, deleted:bool, userId:int}]
			$latestTs = null;  // string

			foreach ($othersArr as $o) {
				$oid = (int)($o['userId'] ?? 0);
				$ots = isset($o['ts']) ? (string)$o['ts'] : null;
				if ($oid <= 0 || !$ots) continue;

				if (array_key_exists($oid, $userNames)) {
					$norm[] = ['name' => $userNames[$oid], 'ts' => $ots, 'deleted' => false, 'userId' => $oid];
				} else {
					$norm[] = ['name' => null, 'ts' => $ots, 'deleted' => true, 'userId' => $oid];
				}

				if ($latestTs === null || strcmp($ots, $latestTs) > 0) $latestTs = $ots;
			}
			usort($norm, fn($a, $b) => strcmp($b['ts'], $a['ts']));

			$latestEditors = array_values(array_unique(array_map(
				fn($x) => $x['deleted'] ? 'deleted' : (string)$x['name'],
				$norm
			)));

			$out[] = [
				'id' => $id,
				'kind' => $type,                 // 'test'|'pagegroup'
				'name' => (string)$name,
				'you_edited_ts' => (string)$e['ts'],      // 'YYYY-MM-DD HH:MM:SS'
				'edited_by_others' => !empty($norm),
				'latest_ts_other' => $latestTs,
				'latest_editors' => $latestEditors,
				'others_later' => $norm,                 // [{name|null, ts, deleted:bool, userId:int}]
				'others_count' => count($norm),
				'access' => (bool)$hasAccess,
				'test_type' => $testType
			];
		}

		$returnData['data'] = $out;
		$returnData['action'] = 'listEdited';
	}

	/* =========================
	   Helpers
	========================= */

	function le_dt_defaults(): array
	{
		return ['i_colName' => 'name', 'sSortDir_0' => 'asc', 'iDisplayStart' => 0, 'iDisplayLength' => 1000, 'iSortingCols' => 1, 'sEcho' => 1];
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

	/* =========================
	   OUTPUT
	========================= */
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
