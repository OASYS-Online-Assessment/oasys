<?php
// Always output JSON (even on fatal)
	register_shutdown_function('outputJSON');

	require_once __DIR__ . '/../../inc/php/initBackend.php';
	require_once '../../inc/php/systemState.php';   // checkActiveStates()
	require_once '../../inc/php/syscheck.php';
	require_once '../../maintenance/mediaClass.php';

	use maintenance\mediaClass;

	$action = filter_input(INPUT_POST, 'action') ?: "";
	$returnData = ['data' => [], 'action' => $action, 'error' => false];

	/* Auth */
	$pageName = "dashboard";
	$isSubMod = true;
	$isActionFile = true;
	require_once '../../inc/php/authCommonFunctions.php';
	$returnData = (array)$myAuth->returnData;
	if ($myAuth->returnData['error'] !== false) { exit; }
	if (!($myAuth->checkElevatedAdmin() || $myAuth->checkSA())) {
		$returnData['error'] = 'Unauthorized operation attempted.';
		exit;
	}

	/* Input */
	$data = filter_input(INPUT_POST, 'data');
	$data = $data ? json_decode($data ?? '', true) : [];
	if (!$data) $data = [];

	/* ---- Config ---- */
	define('OASYS_ROOT', realpath(__DIR__ . "/../../..")); // repo root
	define('VER_FILE', OASYS_ROOT . "/oasys_ver.txt");    // version file
	define('DB_INTEGRITY_LOCK_NAME', 'oasys.systemstatus.database_integrity');

	/* Dispatch */
	if ($action && function_exists($action)) {
		if (oasysRejectUnknownAction(__FILE__, $action, $returnData)) exit;
		$action($data, $db, $returnData, $myAuth);  // always 4 args
	}

	/* =========================
	   ACTIONS
	========================= */

	function readOverview($data, rixPDO &$db, array &$returnData, userAuth &$myAuth)
	{
		global $settings;
		// Version (from oasys_ver.txt)
		$ver = readVersionFile(VER_FILE);

		// Storage
		$fs = readStorageStats(OASYS_ROOT);

		// Users (ids come from systemState.php)
		checkActiveStates($data, $db, $returnData);
		$feIds = (array)($returnData['fe_idlist'] ?? []);
		$beIds = (array)($returnData['be_idlist'] ?? []);
		$feRows = resolveFrontEndRows($db, $feIds);
		$beRows = resolveBackEndRows($db, $beIds);

		// System check
		$sc = oasys_syscheck($db)['data'];
	    $fail= 0; $warn=0;
	    foreach ($sc as $k=>$v) {
	        if (in_array($k, ['req','found','failMsgs','warn','categories','details'], true)) continue;
	        if     ($v === false) $fail++;
	        elseif ($v === 'warn') $warn++;
	    }
	    $status = $fail>0 ? 'fail' : ($warn>0 ? 'warn' : 'ok');

	    // Backups (same place the backup app writes): backupRestore/*.zip
	    $bk = findLatestBackupsFromBackupRestore(8);

		// Live database metadata only. Full integrity checks are explicit actions.
		// This path must remain cheap because it runs when the widget loads.
		$dbVer = getDbVersion($db);
		$dbCheck = dbLiveOverview($db);
		$mediaCheck = mediaHealthOverview();

		$returnData['data'] = [
			'version' => $ver,
			'storage' => $fs,
			'frontEnd' => [
				'windowMins' => 10,
				'count' => count($feRows),
				'preview' => array_slice(array_map(fn($r) => $r['name'], $feRows), 0, 12),
			],
			'backEnd' => [
				'windowMins' => (int)$settings['backendInactivityTimeout'],
				'count' => count($beRows),
				'preview' => array_slice(array_map(fn($r) => $r['username'], $beRows), 0, 12),
				'notAvailable' => false
			],
			'sysCheck' => ['status' => $status, 'failCount' => $fail, 'warnCount' => $warn],
			'backups' => $bk,
			'database' => array_merge($dbCheck, ['version' => $dbVer]),
			'mediaCheck' => $mediaCheck,
		];
	}

	function mediaHealthOverview(bool $includeIssues = false): array
	{
		$result = ['error' => false, 'log' => []];
		$media = new mediaClass($result, []);
		$media->execute('verifyMediaAssets');

		$area = '';
		$counts = ['media' => 0, 'customContent' => 0];
		$issues = ['media' => [], 'customContent' => []];
		foreach ($result['log'] ?? [] as $line) {
			if ($line === '=== Test-content media [media] ===') {
				$area = 'media';
			} elseif ($line === '=== Meta-page media [customContent] ===') {
				$area = 'customContent';
			} elseif ($line !== '' && isset($counts[$area])) {
				$counts[$area]++;
				if ($includeIssues) $issues[$area][] = $line;
			}
		}

		$total = $counts['media'] + $counts['customContent'];
		$overview = [
			'status' => $total > 0 ? 'warn' : 'ok',
			'issueCount' => $total,
			'testContentCount' => $counts['media'],
			'metaPageCount' => $counts['customContent'],
		];
		if ($includeIssues) $overview['issues'] = $issues;
		return $overview;
	}

	function listFrontEndOnline($data, rixPDO &$db, array &$returnData, userAuth &$myAuth)
	{
		// Collect current login ids from the sessions helper
		checkActiveStates($data, $db, $returnData);
		$ids = $returnData['fe_idlist'] ?? [];
		$rows = resolveFrontEndRows($db, $ids);

		// Return the exact shape the JS expects
		$returnData['data'] = [
			'windowMins' => 10,
			'rows' => $rows,
		];
	}

	function readSettings($data, rixPDO &$db, array &$returnData, userAuth &$myAuth)
	{
	    // schlank: nur option, value, encryption; Sortierung für stabile Anzeige
	    $rows = $db->fetchTable("
	        SELECT
	            `option`,
	            CASE WHEN `encryption` = 1 THEN '' ELSE `value` END AS `value`,
	            `encryption`
	        FROM `settings`
	        ORDER BY `option` ASC
	    ", [])['data'] ?? [];

		$returnData['data'] = ['rows' => $rows];
	}

	function listBackEndOnline($data, rixPDO &$db, array &$returnData, userAuth &$myAuth)
	{
		global $settings;
		checkActiveStates(array_replace($data ?? [], ['includeSelf' => true]), $db, $returnData);
		$beIds = (array)($returnData['be_idlist'] ?? []);
		$rows = resolveBackEndRows($db, $beIds);
		$returnData['data'] = ['windowMins' => (int)$settings['backendInactivityTimeout'], 'rows' => $rows, 'notAvailable' => false];
	}

	function showVersionDetails($data, rixPDO &$db, array &$returnData, userAuth &$myAuth)
	{
		$returnData['data'] = readVersionFile(VER_FILE);
	}

	function showStorageDetails($data, rixPDO &$db, array &$returnData, userAuth &$myAuth)
	{
		$returnData['data'] = readStorageStats(OASYS_ROOT);
	}

	function showBackupDetails($data, rixPDO &$db, array &$returnData, userAuth &$myAuth)
	{
		$returnData['data'] = findLatestBackupsFromBackupRestore(50);
	}

	function syscheckDetails($data, rixPDO &$db, array &$returnData, userAuth &$myAuth)
	{
		$returnData['data'] = oasys_syscheck($db)['data'];
	}

	/* NEW: details for the Database dialog */
	function showDbDetails($data, rixPDO &$db, array &$returnData, userAuth &$myAuth)
	{
		$dbVer = getDbVersion($db);
		$dbCheck = dbLiveOverview($db);
		$returnData['data'] = array_merge($dbCheck, ['version' => $dbVer]);
	}

	function showMediaDetails($data, rixPDO &$db, array &$returnData, userAuth &$myAuth): void
	{
		$returnData['data'] = mediaHealthOverview(true);
	}

	/** Run the deliberately expensive integrity check only after an explicit admin request. */
	function runDbIntegrityCheck($data, rixPDO &$db, array &$returnData, userAuth &$myAuth): void
	{
		$lock = $db->fetchValue('SELECT GET_LOCK(?, 0)', [DB_INTEGRITY_LOCK_NAME]);
		if (!empty($lock['error'])) {
			$returnData['errorCode'] = 'dbIntegrityLockFailed';
			$returnData['error'] = 'The database integrity-check lock could not be acquired.';
			return;
		}
		if ((int)($lock['data'] ?? 0) !== 1) {
			$returnData['errorCode'] = 'dbIntegrityAlreadyRunning';
			$returnData['error'] = 'Another database integrity check is already running.';
			return;
		}

		try {
			$result = executeDbIntegrityCheck($db);
			$result['version'] = getDbVersion($db);
			$returnData['data'] = $result;
		} finally {
			$db->fetchValue('SELECT RELEASE_LOCK(?)', [DB_INTEGRITY_LOCK_NAME]);
		}
	}

	/* =========================
	   HELPERS
	========================= */

	/**
	 * Front-end rows with most-recent activity timestamp.
	 * We take GREATEST(MAX(activity.tsActiveServer), MAX(stateFrontend.active)).
	 * Falls back to empty string if neither exists.
	 */
	function resolveFrontEndRows(rixPDO $db, array $ids): array
	{
		if (empty($ids)) return [];
		// keep only numeric ids
		$ids = array_values(array_filter($ids, static fn($v) => is_numeric($v)));
		if (empty($ids)) return [];

		$ph = implode(',', array_fill(0, count($ids), '?'));

		$sql = "
        SELECT
            l.id AS id,
            COALESCE(NULLIF(l.displayName,''), l.name) AS name,

            /* take the newest of both sources (DATETIME compare) */
            GREATEST(
                IFNULL(MAX(a.tsActiveServer), '1970-01-01 00:00:00'),
                IFNULL(MAX(sf.active),       '1970-01-01 00:00:00')
            ) AS activeTs,

            /* prefer activity.clientOpen if present, else assume 1 when a stateFrontend row exists */
            CASE
              WHEN MAX(a.clientOpen) IS NOT NULL THEN MAX(a.clientOpen)
              WHEN COUNT(sf.loginId) > 0         THEN 1
              ELSE 0
            END AS clientOpen

        FROM logins l
        LEFT JOIN activity      a  ON a.loginId  = l.id
        LEFT JOIN stateFrontend sf ON sf.loginId = l.id
        WHERE l.id IN ($ph)
        GROUP BY l.id, l.displayName, l.name
        ORDER BY activeTs DESC
    ";

		$rows = $db->fetchTable($sql, $ids)['data'] ?? [];
		if (empty($rows)) return [];

		// normalize timestamps so JS can parse reliably
		foreach ($rows as &$r) {
			$ts = $r['activeTs'] ?? null;

			if ($ts instanceof DateTimeInterface) {
				$r['activeTs'] = $ts->format('Y-m-d H:i:s');
			} elseif (is_string($ts)) {
				// strip fractional seconds if present
				$r['activeTs'] = preg_replace('/\.\d+$/', '', $ts);
				// if it's the sentinel, treat as empty
				if ($r['activeTs'] === '1970-01-01 00:00:00') $r['activeTs'] = '';
			} else {
				$r['activeTs'] = '';
			}

			$r['clientOpen'] = !empty($r['clientOpen']) && (int)$r['clientOpen'] === 1;
		}
		unset($r);

		return $rows;
	}


	function resolveBackEndRows(rixPDO $db, array $ids): array
	{
		if (empty($ids)) return [];
		$ids = array_values(array_filter($ids, fn($v) => is_numeric($v)));
		if (empty($ids)) return [];
		$ph = implode(',', array_fill(0, count($ids), '?'));

		$rows = $db->fetchTable("
        SELECT u.id, u.name AS username
        FROM users u
        WHERE u.id IN ($ph)
        ORDER BY u.id
    ", $ids)['data'] ?? [];

		// Enrich with the latest activity recorded by the backend state.
		foreach ($rows as &$r) {
			$id = (int)$r['id'];
			$r['lastSeen'] = $db->fetchValue(
				"SELECT MAX(active) FROM stateBackend " .
				"WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.userid.value')) = ?",
				[$id]
			)['data'] ?? null;
		}
		unset($r);
		return $rows;
	}

	function readVersionFile($path)
	{
		$res = ['ok' => false, 'v' => '', 'vshort' => '', 'infoHtml' => ''];
		if (!is_file($path)) return $res;
		$txt = @file_get_contents($path);
		if ($txt === false) return $res;

		$res['ok'] = true;
		$res['v'] = trim(parseKey($txt, 'v=') ?: '');
		$res['vshort'] = trim(parseKey($txt, 'vshort=') ?: '');
		$info = parseKey($txt, 'info=');
		$res['infoHtml'] = $info ? trim($info) : '';
		return $res;
	}

	function parseKey($txt, $keyPrefix)
	{
		foreach (preg_split('/\R/', $txt) as $line) {
			$line = trim($line);
			if (stripos($line, $keyPrefix) === 0) return substr($line, strlen($keyPrefix));
		}
		return '';
	}

	function readStorageStats($rootPath)
	{
		$total = @disk_total_space($rootPath);
		$free = @disk_free_space($rootPath);
		$used = readDirectorySizeWithTimeout($rootPath, 2.0);
		$pct = (is_numeric($total) && is_numeric($used) && $total > 0)
			? round($used * 100 / $total, 1) : null;

		return [
			'ok' => (is_numeric($total) && is_numeric($free)),
			'total' => (int)($total ?: 0),
			'free' => (int)($free ?: 0),
			'used' => (int)($used ?: 0),
			'usedPct' => $pct
		];
	}

	function readDirectorySizeWithTimeout(string $path, float $timeoutSeconds): ?int
	{
		if (!function_exists('proc_open')) return null;
		$process = @proc_open('du -sk ' . escapeshellarg($path), [
			1 => ['pipe', 'w'],
			2 => ['pipe', 'w'],
		], $pipes);
		if (!is_resource($process)) return null;
		stream_set_blocking($pipes[1], false);
		stream_set_blocking($pipes[2], false);
		$output = '';
		$started = microtime(true);
		do {
			$output .= stream_get_contents($pipes[1]);
			$status = proc_get_status($process);
			if (!$status['running']) break;
			if ((microtime(true) - $started) >= $timeoutSeconds) {
				proc_terminate($process);
				break;
			}
			usleep(20000);
		} while (true);
		$output .= stream_get_contents($pipes[1]);
		fclose($pipes[1]);
		fclose($pipes[2]);
		$status = proc_get_status($process);
		if ($status['running']) proc_terminate($process);
		proc_close($process);
		if (preg_match('/^\s*(\d+)/', $output, $match)) return (int)$match[1] * 1024;
		return null;
	}

	/** Locate /backupRestore/*.zip (like the backup app) */
	function findLatestBackupsFromBackupRestore(int $limit = 10): array
	{
		$dir = OASYS_ROOT . "/backupRestore";
		$items = [];
		if (is_dir($dir)) {
			foreach (new DirectoryIterator($dir) as $f) {
				if ($f->isDot() || !$f->isFile()) continue;
				$name = $f->getFilename();
				if (!preg_match('/\.zip$/i', $name)) continue;

				$items[] = [
					'path' => $f->getPathname(),
					'name' => $name,
					'size' => $f->getSize(),
					'mtime' => $f->getMTime(),
					'type' => (stripos($name, 'snapshot') !== false ? 'Snapshot' :
						(stripos($name, 'full') !== false ? 'Full Backup' : 'Archive')),
				];
			}
		}
		usort($items, fn($a, $b) => $b['mtime'] <=> $a['mtime']);
		return [
			'ok' => !empty($items),
			'latest' => $items[0] ?? null,
			'items' => array_slice($items, 0, $limit)
		];
	}

	/* ---------- NEW: DB helpers ---------- */

	/** Read DB version from settings or fallback to table comment of `settings` */
	/** Read DB version from the TABLE COMMENT of `settings` */
	function getDbVersion(rixPDO $db): ?string
	{
		try {
			$row = $db->fetchValue("
            SELECT TABLE_COMMENT
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME   = 'settings'
            LIMIT 1
        ", []);
			$v = $row['data'] ?? null;
			if ($v === null) return null;

			$v = trim((string)$v);
			return $v !== '' ? $v : null;
		} catch (Throwable $e) {
			return null;
		}
	}


	/**
	 * Cheap table metadata query used by normal dashboard requests.
	 * Keeping this as one information_schema query avoids the previous per-table lookup.
	 */
	function dbTableMetadata(rixPDO $db): array
	{
		$res = $db->fetchTable("
			SELECT TABLE_NAME AS name, ENGINE AS engine
			FROM information_schema.TABLES
			WHERE TABLE_SCHEMA = DATABASE()
			  AND TABLE_TYPE = 'BASE TABLE'
			ORDER BY TABLE_NAME
		", []);

		if (!empty($res['error'])) {
			return ['ok' => false, 'tables' => [], 'error' => trim(strip_tags((string)$res['error']))];
		}

		$tables = [];
		foreach (($res['data'] ?? []) as $row) {
			$tables[] = [
				'name' => (string)($row['name'] ?? ''),
				'engine' => $row['engine'] ?? null,
			];
		}
		return ['ok' => true, 'tables' => $tables, 'error' => null];
	}

	/** Return current, inexpensive database availability and table metadata. */
	function dbLiveOverview(rixPDO $db): array
	{
		$metadata = dbTableMetadata($db);
		if (!$metadata['ok']) {
			return [
				'available' => false,
				'status' => 'fail',
				'tableCount' => 0,
				'tables' => [],
				'error' => $metadata['error'],
			];
		}

		return [
			'available' => true,
			'status' => 'ok',
			'tableCount' => count($metadata['tables']),
			'tables' => $metadata['tables'],
		];
	}

	/** Execute CHECK TABLE sequentially and correctly inspect every returned message row. */
	function executeDbIntegrityCheck(rixPDO $db): array
	{
		$started = microtime(true);
		$metadata = dbTableMetadata($db);
		if (!$metadata['ok']) {
			return [
				'available' => false,
				'status' => 'fail',
				'ok' => 0,
				'warnings' => 0,
				'errors' => 1,
				'tableCount' => 0,
				'tables' => [],
				'checkedAt' => (new DateTimeImmutable())->format('Y-m-d H:i:s.v'),
				'durationMs' => (int)round((microtime(true) - $started) * 1000),
				'error' => $metadata['error'],
			];
		}

		$ok = 0;
		$warn = 0;
		$err = 0;
		$out = [];

		foreach ($metadata['tables'] as $table) {
			$tableName = $table['name'];
			$quotedName = '`' . str_replace('`', '``', $tableName) . '`';
			$check = $db->fetchTable("CHECK TABLE $quotedName QUICK", []);
			$summary = summarizeDbCheckMessages($check);

			if ($summary['state'] === 'OK') $ok++;
			elseif ($summary['state'] === 'WARNING' || $summary['state'] === 'UNKNOWN') $warn++;
			else $err++;

			$out[] = $table + $summary;
		}

		$status = $err > 0 ? 'fail' : ($warn > 0 ? 'warn' : 'ok');
		return [
			'available' => true,
			'status' => $status,
			'ok' => $ok,
			'warnings' => $warn,
			'errors' => $err,
			'tableCount' => count($out),
			'tables' => $out,
			'checkedAt' => (new DateTimeImmutable())->format('Y-m-d H:i:s.v'),
			'durationMs' => (int)round((microtime(true) - $started) * 1000),
		];
	}

	function summarizeDbCheckMessages(array $check): array
	{
		if (!empty($check['error'])) {
			return ['state' => 'ERROR', 'msg' => trim(strip_tags((string)$check['error']))];
		}

		$severity = 0; // 0=OK, 1=warning/unknown, 2=error
		$sawOk = false;
		$messages = [];
		foreach (($check['data'] ?? []) as $row) {
			$type = strtoupper(trim((string)($row['Msg_type'] ?? '')));
			$text = trim((string)($row['Msg_text'] ?? ''));
			if ($type !== '' || $text !== '') $messages[] = ($type !== '' ? "$type: " : '') . $text;

			if ($type === 'ERROR' || preg_match('/corrupt|error|failed|invalid/i', $text)) {
				$severity = 2;
			} elseif ($severity < 2 && ($type === 'WARNING' || stripos($text, 'warning') !== false)) {
				$severity = 1;
			} elseif ($type === 'STATUS') {
				if (strcasecmp($text, 'OK') === 0) $sawOk = true;
				elseif ($severity === 0) $severity = 1;
			}
		}

		if ($severity === 2) $state = 'ERROR';
		elseif ($severity === 1) $state = 'WARNING';
		elseif ($sawOk) $state = 'OK';
		else $state = 'UNKNOWN';

		return ['state' => $state, 'msg' => implode(' | ', array_values(array_unique($messages)))];
	}

	/* =========================
	   OUTPUT (always JSON)
	========================= */
	function outputJSON()
	{
		global $returnData, $action, $myAuth;

		$returnData['loggedInName'] = $myAuth->username ?? '';
		if (!isset($returnData['action'])) $returnData['action'] = $action;

		if ($e = error_get_last()) {
			$documentRoot = filter_input(INPUT_SERVER, "DOCUMENT_ROOT");
			$file = str_replace($documentRoot, '', $e['file']);
			$returnData['fatalError'] =
				"<p>Fatal error [type {$e['type']}] on line {$e['line']} of<br>" .
				"<code class='tinyCode'>$file</code></p><p>{$e['message']}</p>";
		}
		header('Cache-Control: no-cache, must-revalidate');
		header('Content-type: application/json; charset=UTF-8');
		echo json_encode($returnData);
	}
